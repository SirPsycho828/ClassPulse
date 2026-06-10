import { useEffect, useRef, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, findPersistentConcerns, formatDate } from '@/lib/longitudinalUtils';
import type { AnalysisResult } from '@/lib/schemas';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ReferenceLine,
} from 'recharts';
import { AlertTriangle, Loader2, User } from 'lucide-react';

function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function masteryBgLight(score: number) {
  if (score >= 0.8) return 'bg-success/15';
  if (score >= 0.6) return 'bg-warning/15';
  return 'bg-destructive/15';
}

function trendLabel(t: string) {
  if (t === 'improving' || t === 'up') return 'Improving';
  if (t === 'worsening' || t === 'down') return 'Worsening';
  return 'Stable';
}

function trendColor(t: string) {
  if (t === 'improving' || t === 'up') return 'text-success';
  if (t === 'worsening' || t === 'down') return 'text-destructive';
  return 'text-muted-foreground';
}

export default function StudentDetailLongitudinal() {
  const { classId, studentId } = useParams<{ classId: string; studentId: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [analyses, setAnalyses] = useState<Array<{
    analysisId: string;
    assignmentTitle: string;
    generatedAt: string;
    totalScore: number;
    percentile: number;
    skillPerformance: Array<{
      skillTag: string;
      displayName: string;
      mastery: number;
    }>;
  }>>([]);

  // Chart container
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setChartSize(width > 0 && height > 0 ? { w: width, h: height } : null);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!classId || !studentId || !user) return;

    async function loadData() {
      try {
        // Fetch class name
        const classDoc = await getDoc(doc(db, 'classes', classId!));
        if (classDoc.exists()) {
          setClassName(classDoc.data().name || '');
        }

        // Fetch student name
        const studentDoc = await getDoc(doc(db, 'classes', classId!, 'students', studentId!));
        if (studentDoc.exists()) {
          const sd = studentDoc.data();
          setStudentName(`${sd.firstName} ${sd.lastName}`);
        }

        // Fetch all analyses for this class
        const analysesSnap = await getDocs(
          query(
            collection(db, 'analyses'),
            where('classId', '==', classId),
            where('teacherId', '==', user!.uid),
            orderBy('generatedAt', 'asc'),
          ),
        );

        const studentAnalyses: typeof analyses = [];
        for (const aDoc of analysesSnap.docs) {
          const aData = aDoc.data() as AnalysisResult;
          const si = aData.studentInsights.find((s) => s.studentId === studentId);
          if (!si) continue;

          // Fetch assignment title
          let title = 'Untitled';
          try {
            const assignDoc = await getDoc(doc(db, 'assignments', aData.assignmentId));
            if (assignDoc.exists()) title = assignDoc.data().title || 'Untitled';
          } catch { /* ignore */ }

          // Build a skill tag -> display name map from analysis-level skillBreakdown
          const skillNameMap = new Map<string, string>();
          for (const sb of aData.skillBreakdown || []) {
            skillNameMap.set(sb.skillTag, sb.displayName || sb.skillTag);
          }

          studentAnalyses.push({
            analysisId: aData.analysisId,
            assignmentTitle: title,
            generatedAt: aData.generatedAt,
            totalScore: si.totalScore,
            percentile: si.percentile,
            skillPerformance: (si.skillPerformance || []).map((sp) => ({
              skillTag: sp.skillTag,
              displayName: skillNameMap.get(sp.skillTag) || sp.skillTag,
              mastery: sp.mastery,
            })),
          });
        }

        // Use student name from latest analysis if not found in roster
        if (!studentDoc.exists() && studentAnalyses.length > 0) {
          const lastAnalysis = analysesSnap.docs[analysesSnap.docs.length - 1].data() as AnalysisResult;
          const si = lastAnalysis.studentInsights.find((s) => s.studentId === studentId);
          if (si) setStudentName(si.studentName);
        }

        setAnalyses(studentAnalyses);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classId, studentId, user]);

  // Chart data
  const chartData = useMemo(
    () =>
      analyses.map((a) => ({
        name: a.assignmentTitle,
        date: formatDate(a.generatedAt),
        score: Math.round(a.totalScore * 100),
        analysisId: a.analysisId,
      })),
    [analyses],
  );

  // Skill mastery progression
  const skillProgression = useMemo(() => {
    const map = new Map<string, {
      displayName: string;
      entries: Array<{ mastery: number; date: string }>;
    }>();

    for (const a of analyses) {
      for (const sp of a.skillPerformance) {
        if (!map.has(sp.skillTag)) {
          map.set(sp.skillTag, { displayName: sp.displayName, entries: [] });
        }
        const entry = map.get(sp.skillTag)!;
        entry.entries.push({ mastery: sp.mastery, date: a.generatedAt });
        // Keep latest display name
        entry.displayName = sp.displayName;
      }
    }

    const rows = Array.from(map.entries()).map(([skillTag, data]) => {
      const masteries = data.entries.map((e) => e.mastery);
      const latest = masteries[masteries.length - 1];
      return {
        skillTag,
        displayName: data.displayName,
        firstSeen: formatDate(data.entries[0].date),
        latestMastery: latest,
        trend: computeTrend(masteries),
        timesAssessed: data.entries.length,
      };
    });

    // Sort by latest mastery ascending (worst first)
    rows.sort((a, b) => a.latestMastery - b.latestMastery);
    return rows;
  }, [analyses]);

  // Persistent concerns
  const concerns = useMemo(
    () => findPersistentConcerns(analyses),
    [analyses],
  );

  const scores = analyses.map((a) => a.totalScore);
  const overallTrend = computeTrend(scores);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading student history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/students" className="hover:text-primary">Students</Link>
        <span className="mx-1.5">/</span>
        <Link to={`/classes/${classId}`} className="hover:text-primary">{className}</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{studentName}</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{studentName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          <Link to={`/classes/${classId}`} className="hover:text-primary hover:underline">{className}</Link>
        </p>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>{analyses.length} analys{analyses.length !== 1 ? 'es' : 'is'}</span>
        {scores.length > 0 && (
          <span className="flex items-center gap-1.5">
            {Math.round(scores[scores.length - 1] * 100)}% latest
            <TrendArrow trend={overallTrend} size={14} />
          </span>
        )}
      </div>

      {analyses.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No analysis data for this student yet.</p>
        </div>
      ) : (
        <>
          {/* Score History */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Score History</h2>
            {chartData.length === 1 ? (
              /* Single data point — prominent score card instead of empty chart */
              <div className="flex items-center gap-6 py-6">
                <div className="flex flex-col items-center justify-center w-28 h-28 rounded-full border-4 border-primary/20 bg-primary/5">
                  <span className="text-3xl font-bold text-primary">{chartData[0].score}%</span>
                </div>
                <div>
                  <p className="font-medium text-foreground">{chartData[0].name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{chartData[0].date}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    More data points will appear here as additional analyses are completed.
                  </p>
                </div>
              </div>
            ) : (
              /* 2+ data points — line chart with value labels */
              <div ref={chartContainerRef} className="w-full h-[240px]">
                {chartSize && (
                  <LineChart
                    width={chartSize.w}
                    height={chartSize.h}
                    data={chartData}
                    margin={{ top: 20, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                      axisLine={false}
                      tickLine={false}
                      width={35}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ReferenceLine y={70} stroke="hsl(33, 16%, 83%)" strokeDasharray="6 4" label={{ value: '70%', position: 'right', fontSize: 10, fill: 'hsl(216, 15%, 50%)' }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: '12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid hsl(33, 16%, 83%)',
                        backgroundColor: '#F8F5F0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}
                      formatter={(value: number) => [`${value}%`, 'Score']}
                      labelFormatter={(label) => {
                        const point = chartData.find((d) => d.name === label);
                        return point ? `${label} (${point.date})` : label;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(216, 52%, 24%)"
                      strokeWidth={2}
                      dot={{ r: 5, fill: 'hsl(216, 52%, 24%)', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 7 }}
                    >
                      {chartData.length <= 6 && (
                        <LabelList
                          dataKey="score"
                          position="top"
                          offset={10}
                          formatter={(v: number) => `${v}%`}
                          style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(216, 52%, 24%)' }}
                        />
                      )}
                    </Line>
                  </LineChart>
                )}
              </div>
            )}
          </section>

          {/* Assessment History Table */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Assessment History</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Assignment</th>
                    <th className="text-left py-2 px-4 text-muted-foreground font-medium">Date</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">Score</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">Percentile</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analyses].reverse().map((a) => (
                    <tr key={a.analysisId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4">
                        <Link
                          to={`/analysis/${a.analysisId}/student/${studentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {a.assignmentTitle}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {formatDate(a.generatedAt)}
                      </td>
                      <td className="py-2.5 px-4 text-center font-medium">
                        {Math.round(a.totalScore * 100)}%
                      </td>
                      <td className="py-2.5 px-4 text-center text-muted-foreground">
                        {Math.round(a.percentile)}th
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Skill Mastery Progression */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Skill Mastery Progression</h2>
            {skillProgression.length === 0 ? (
              <p className="text-sm text-muted-foreground">No per-skill data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Skill</th>
                      <th className="text-left py-2 px-4 text-muted-foreground font-medium">First Seen</th>
                      <th className="text-center py-2 px-4 text-muted-foreground font-medium">Latest</th>
                      <th className="text-center py-2 px-4 text-muted-foreground font-medium">Trend</th>
                      <th className="text-center py-2 px-4 text-muted-foreground font-medium">Assessed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillProgression.map((skill) => (
                      <tr key={skill.skillTag} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 font-medium text-foreground">{skill.displayName}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{skill.firstSeen}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${masteryBgLight(skill.latestMastery)} ${masteryColor(skill.latestMastery)}`}>
                            {Math.round(skill.latestMastery * 100)}%
                          </span>
                        </td>
                        <td className={`py-2.5 px-4 text-center text-xs font-medium ${trendColor(skill.trend)}`}>
                          {trendLabel(skill.trend)}
                        </td>
                        <td className="py-2.5 px-4 text-center text-muted-foreground">{skill.timesAssessed}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Persistent Concerns */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Persistent Concerns</h2>
            {concerns.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <span>No persistent concerns &mdash; this student is responding well to instruction.</span>
              </div>
            ) : (
              <div className="space-y-4">
                {concerns.map((c) => (
                  <div key={c.skillTag} className="border border-warning/20 bg-warning/5 rounded-[--radius-md] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                      <span className="font-medium text-foreground">{c.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        &mdash; weak for {c.consecutiveWeakCount} consecutive analyses
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs text-muted-foreground">Mastery trajectory:</span>
                      {c.masteryTrajectory.map((m, i) => (
                        <span
                          key={i}
                          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${masteryBgLight(m)} ${masteryColor(m)}`}
                        >
                          {Math.round(m * 100)}%
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.linkedAnalyses.map((la) => (
                        <Link
                          key={la.analysisId}
                          to={`/analysis/${la.analysisId}/student/${studentId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {la.analysisTitle} &rarr;
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
