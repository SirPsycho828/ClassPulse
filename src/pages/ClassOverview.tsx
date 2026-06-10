import { useEffect, useRef, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAnalysis } from '@/lib/resolveAnalysis';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisResult, GradedResult } from '@/lib/schemas';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  Settings,
  Users,
  Zap,
} from 'lucide-react';
import { GuidanceTip } from '@/components/ux/GuidanceTip';

// ---- helpers ----
function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function masteryBg(score: number) {
  if (score >= 0.8) return 'bg-success';
  if (score >= 0.6) return 'bg-yellow-600';
  return 'bg-red-600';
}

function masteryBgLight(score: number) {
  if (score >= 0.8) return 'bg-success/15';
  if (score >= 0.6) return 'bg-warning/15';
  return 'bg-destructive/15';
}

function scopeBadge(scope: string) {
  const styles: Record<string, string> = {
    whole_class: 'bg-purple-100 text-purple-700',
    small_group: 'bg-blue-100 text-blue-700',
    individual: 'bg-orange-100 text-orange-700',
  };
  const labels: Record<string, string> = {
    whole_class: 'Whole Class',
    small_group: 'Small Group',
    individual: 'Individual',
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[scope] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[scope] ?? scope}
    </span>
  );
}

function relativeStandingBadge(standing: string) {
  const styles: Record<string, string> = {
    above_average: 'bg-success/15 text-success',
    average: 'bg-muted text-muted-foreground',
    below_average: 'bg-destructive/15 text-destructive',
  };
  const labels: Record<string, string> = {
    above_average: 'Above Avg',
    average: 'Average',
    below_average: 'Below Avg',
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[standing] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[standing] ?? standing}
    </span>
  );
}

type SortKey = 'name' | 'score';
type SortDir = 'asc' | 'desc';

export default function ClassOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [gradedResult, setGradedResult] = useState<GradedResult | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [_classTitle, setClassTitle] = useState('');
  const [_assignmentPath, setAssignmentPath] = useState('');

  // UI state
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [studentsExpanded, setStudentsExpanded] = useState(false);
  const [studentSort, setStudentSort] = useState<SortKey>('score');
  const [studentSortDir, setStudentSortDir] = useState<SortDir>('asc');
  const [editingSkillTag, setEditingSkillTag] = useState<string | null>(null);
  const [editedSkillTags, setEditedSkillTags] = useState<Record<string, string>>({});
  const [skillEdited, setSkillEdited] = useState(false);
  const [expandedWrongAnswers, setExpandedWrongAnswers] = useState<Set<string>>(new Set());

  // Chart container — only render once the DOM element has positive dimensions
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setChartReady(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  // ---- load data ----
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      try {
        // Load analysis doc — resolve from assignmentId or analysisId
        const analysisDoc = await resolveAnalysis(id!, user!.uid);
        if (!analysisDoc || !analysisDoc.exists()) {
          toast('info', 'This analysis is still processing. Check back shortly.');
          navigate('/dashboard', { replace: true });
          return;
        }
        const analysisData = analysisDoc.data() as AnalysisResult;
        setAnalysis(analysisData);

        // Load assignment doc
        const assignDoc = await getDoc(
          doc(db, 'assignments', analysisData.assignmentId),
        );
        if (assignDoc.exists()) {
          const ad = assignDoc.data();
          setAssignmentTitle(ad.title ?? 'Untitled Assignment');
          setAssignmentPath(ad.path ?? '');

          // Load graded result if exists
          if (ad.pipelineState?.gradedResult) {
            setGradedResult(ad.pipelineState.gradedResult);
          }

          // Load class name
          if (ad.classId) {
            const classDoc = await getDoc(doc(db, 'classes', ad.classId));
            if (classDoc.exists()) {
              setClassTitle(classDoc.data().name ?? '');
            }
          }
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load analysis data.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, toast, navigate]);

  // ---- histogram data ----
  const histogramData = useMemo(() => {
    if (!analysis) return [];
    const bands = [
      { range: '0-20%', min: 0, max: 0.2, count: 0, color: '#dc2626' },
      { range: '20-40%', min: 0.2, max: 0.4, count: 0, color: '#ea580c' },
      { range: '40-60%', min: 0.4, max: 0.6, count: 0, color: '#ca8a04' },
      { range: '60-80%', min: 0.6, max: 0.8, count: 0, color: '#65a30d' },
      { range: '80-100%', min: 0.8, max: 1.01, count: 0, color: '#16a34a' },
    ];

    analysis.studentInsights.forEach((s) => {
      const band = bands.find((b) => s.totalScore >= b.min && s.totalScore < b.max);
      if (band) band.count++;
    });

    return bands;
  }, [analysis]);

  // ---- sorted students ----
  const sortedStudents = useMemo(() => {
    if (!analysis) return [];
    const students = [...analysis.studentInsights];
    students.sort((a, b) => {
      let cmp: number;
      if (studentSort === 'name') {
        cmp = a.studentName.localeCompare(b.studentName);
      } else {
        cmp = a.totalScore - b.totalScore;
      }
      return studentSortDir === 'asc' ? cmp : -cmp;
    });
    return students;
  }, [analysis, studentSort, studentSortDir]);

  function toggleSort(key: SortKey) {
    if (studentSort === key) {
      setStudentSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setStudentSort(key);
      setStudentSortDir('asc');
    }
  }

  function toggleWrongAnswers(skillTag: string) {
    setExpandedWrongAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(skillTag)) next.delete(skillTag);
      else next.add(skillTag);
      return next;
    });
  }

  // ---- skill tag editing ----
  function startEditSkill(skillTag: string) {
    setEditingSkillTag(skillTag);
    if (!editedSkillTags[skillTag]) {
      setEditedSkillTags((prev) => ({ ...prev, [skillTag]: skillTag }));
    }
  }

  function saveEditSkill(originalTag: string) {
    setEditingSkillTag(null);
    if (editedSkillTags[originalTag] !== originalTag) {
      setSkillEdited(true);
    }
  }

  // ---- loading ----
  if (loading || !analysis) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading analysis...</span>
      </div>
    );
  }

  const { classSummary, skillBreakdown, interventions, studentInsights } = analysis;
  const displayedSkills = showAllSkills
    ? [...skillBreakdown].sort((a, b) => a.classMastery - b.classMastery)
    : [...skillBreakdown].sort((a, b) => a.classMastery - b.classMastery).slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Breadcrumb + nav */}
      <div className="flex items-center justify-between">
        <nav className="text-sm text-muted-foreground">
          <Link to="/dashboard" className="hover:text-primary">
            Dashboard
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{assignmentTitle}</span>
        </nav>
        <Link
          to={`/analysis/${id}/interventions`}
          className="p-1.5 text-muted-foreground hover:text-muted-foreground rounded-[--radius-md] hover:bg-muted"
          title="Settings" aria-label="Model settings"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>

      <GuidanceTip id="class-overview-intro">
        Start with the "At a Glance" summary to see how the class performed overall. Scroll down to see which skills need the most attention, then check the intervention plan for next steps.
      </GuidanceTip>

      {/* Stale banner */}
      {analysis.stale && (
        <div className="flex items-center gap-2 px-4 py-3 bg-warning/10 border border-warning/20 rounded-[--radius-md] text-sm text-warning">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          This analysis may be stale. Student data or answer key has changed since it was generated.
        </div>
      )}

      {/* Skill tag edit banner */}
      {skillEdited && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-[--radius-md] text-sm text-primary">
          <span>Skill tags have been edited. Re-analyze to apply corrections.</span>
          <button className="text-primary font-medium hover:underline text-sm">
            Re-analyze with corrections
          </button>
        </div>
      )}

      {/* Answer key flags */}
      {gradedResult && gradedResult.answerKeyFlags.length > 0 && (
        <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-[--radius-md] text-sm text-destructive">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="font-medium">Answer Key Concerns</span>
          </div>
          <ul className="ml-6 list-disc space-y-1">
            {gradedResult.answerKeyFlags.map((f) => (
              <li key={f.questionNumber}>
                Q{f.questionNumber}: {f.flag} ({Math.round(f.missRate * 100)}%
                miss rate, most common answer: {f.mostCommonAnswer})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ====== BAND 1: AT A GLANCE ====== */}
      <section className="bg-card border border-border rounded-[--radius-md] p-6">
        <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          At a Glance
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Big number + summary + stats */}
          <div>
            <div className={`text-5xl font-bold ${masteryColor(classSummary.meanScore)}`}>
              {Math.round(classSummary.meanScore * 100)}%
            </div>
            <p className="text-sm text-muted-foreground mt-2">{classSummary.oneSentence}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {classSummary.studentsAnalyzed}
                </div>
                <div className="text-xs text-muted-foreground">Analyzed</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {classSummary.studentsAbsent}
                </div>
                <div className="text-xs text-muted-foreground">Absent</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {Math.round(classSummary.medianScore * 100)}%
                </div>
                <div className="text-xs text-muted-foreground">Median</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {Math.round(classSummary.minScore * 100)}-{Math.round(classSummary.maxScore * 100)}%
                </div>
                <div className="text-xs text-muted-foreground">Range</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {(classSummary.stdDev * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Std Dev</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground capitalize">
                  {classSummary.distributionShape}
                </div>
                <div className="text-xs text-muted-foreground">Shape</div>
              </div>
            </div>

            {/* Outliers */}
            {classSummary.outliers.length > 0 && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Outliers
                </h3>
                <div className="flex flex-wrap gap-2">
                  {classSummary.outliers.map((o) => {
                    const student = studentInsights.find(
                      (s) => s.studentId === o.studentId,
                    );
                    return (
                      <Link
                        key={o.studentId}
                        to={`/analysis/${id}/student/${o.studentId}`}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted hover:bg-primary/10 text-foreground transition-colors"
                      >
                        {o.direction === 'above' ? (
                          <ArrowUpRight className="w-3 h-3 text-success" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 text-destructive" />
                        )}
                        {student?.studentName ?? o.studentId}{' '}
                        ({Math.round(o.score * 100)}%)
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Histogram */}
          <div className="min-w-0">
            <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Score Distribution
            </h3>
            <div ref={chartContainerRef} className="h-52">
              {chartReady && <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={histogramData}
                  margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid hsl(33, 16%, 83%)',
                    }}
                    formatter={(value) => [`${value} students`, 'Count']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {histogramData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </div>
          </div>
        </div>
      </section>

      {/* ====== BAND 2: SKILL BREAKDOWN ====== */}
      {skillBreakdown.length > 0 && (
        <section className="bg-card border border-border rounded-[--radius-md] p-6">
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Skill Breakdown
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="pb-2 pr-3">Skill</th>
                  <th className="pb-2 pr-3 w-48">Class Mastery</th>
                  <th className="pb-2 pr-3 text-center">Questions</th>
                  <th className="pb-2 pr-3 text-center">Struggling</th>
                  <th className="pb-2 text-center">Proficient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayedSkills.map((skill) => {
                  const displayTag =
                    editedSkillTags[skill.skillTag] ?? skill.displayName;
                  const isEditing = editingSkillTag === skill.skillTag;
                  const isExpanded = expandedWrongAnswers.has(skill.skillTag);

                  return (
                    <tr key={skill.skillTag} className="group">
                      {/* Skill tag */}
                      <td className="py-2.5 pr-3">
                        {isEditing ? (
                          <input
                            type="text"
                            className="text-sm border border-primary/30 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring w-40"
                            value={editedSkillTags[skill.skillTag] ?? skill.displayName}
                            onChange={(e) =>
                              setEditedSkillTags((prev) => ({
                                ...prev,
                                [skill.skillTag]: e.target.value,
                              }))
                            }
                            onBlur={() => saveEditSkill(skill.skillTag)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditSkill(skill.skillTag);
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => startEditSkill(skill.skillTag)}
                            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary group"
                          >
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${masteryBgLight(skill.classMastery)} ${masteryColor(skill.classMastery)}`}
                            >
                              {displayTag}
                            </span>
                            <Edit3 className="w-3 h-3 text-border opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>

                      {/* Mastery bar */}
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${masteryBg(skill.classMastery)}`}
                              style={{
                                width: `${Math.round(skill.classMastery * 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold w-10 text-right ${masteryColor(skill.classMastery)}`}
                          >
                            {Math.round(skill.classMastery * 100)}%
                          </span>
                        </div>

                        {/* Expandable wrong answers */}
                        {skill.commonWrongAnswers.length > 0 && (
                          <div className="mt-1">
                            <button
                              onClick={() => toggleWrongAnswers(skill.skillTag)}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              Common wrong answers
                            </button>
                            {isExpanded && (
                              <div className="mt-1.5 space-y-1.5 pl-3 border-l-2 border-border">
                                {skill.commonWrongAnswers
                                  .filter((cwa) => cwa.answerValue || cwa.misconception)
                                  .map((cwa, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-medium text-destructive">
                                      "{cwa.answerValue || ((cwa as Record<string, unknown>).answer as string)}"
                                    </span>
                                    {cwa.frequencyPercent != null && !isNaN(cwa.frequencyPercent) && cwa.frequencyPercent > 0 && (
                                      <span className="text-muted-foreground ml-1">
                                        ({Math.round(cwa.frequencyPercent * 100)}%)
                                      </span>
                                    )}
                                    <p className="text-muted-foreground mt-0.5">
                                      {cwa.misconception}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Questions */}
                      <td className="py-2.5 pr-3 text-center text-muted-foreground">
                        {skill.questionNumbers.join(', ')}
                      </td>

                      {/* Struggling */}
                      <td className="py-2.5 pr-3 text-center">
                        <span
                          className={`font-medium ${skill.studentsStrugglingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {skill.studentsStrugglingCount}
                        </span>
                      </td>

                      {/* Proficient */}
                      <td className="py-2.5 text-center">
                        <span className="font-medium text-success">
                          {skill.studentsProficientCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {skillBreakdown.length > 8 && (
            <button
              onClick={() => setShowAllSkills(!showAllSkills)}
              className="mt-3 text-sm text-primary hover:text-primary font-medium"
            >
              {showAllSkills
                ? 'Show top 8 skills'
                : `Show all ${skillBreakdown.length} skills`}
            </button>
          )}
        </section>
      )}

      {/* ====== BAND 3: TOP INTERVENTIONS ====== */}
      {interventions.length > 0 && (
        <section>
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Top Interventions
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {interventions.slice(0, 3).map((int) => {
              const borderColor =
                int.scope === 'whole_class'
                  ? 'border-l-purple-500'
                  : int.scope === 'small_group'
                    ? 'border-l-blue-500'
                    : 'border-l-accent';

              return (
                <div
                  key={int.interventionId}
                  className={`bg-card border border-border border-l-4 ${borderColor} rounded-[--radius-md] p-4`}
                >
                  <div className="flex items-start justify-between mb-2">
                    {scopeBadge(int.scope)}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${masteryBgLight(1 - (int.priority - 1) * 0.3)} ${masteryColor(1 - (int.priority - 1) * 0.3)}`}
                    >
                      {int.displayName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <Users className="w-3 h-3" />
                    {int.affectedCount} students affected
                  </div>

                  <p className="text-sm text-foreground mb-3">
                    {int.misconceptionSummary}
                  </p>

                  <div className="text-xs mt-2 bg-primary/5 rounded-[--radius-md] px-3 py-2">
                    <div className="flex items-center gap-1 text-primary font-medium mb-1">
                      <Zap className="w-3 h-3 flex-shrink-0" />
                      Quick win
                    </div>
                    <p className="text-muted-foreground">
                      {int.effortTiers.quick.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Link
              to={`/analysis/${id}/interventions`}
              className="text-sm text-primary hover:text-primary font-medium"
            >
              View Full Intervention Plan ({interventions.length} interventions)
            </Link>
          </div>
        </section>
      )}

      {/* ====== STUDENT LIST ====== */}
      <section>
        <button
          onClick={() => setStudentsExpanded(!studentsExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 hover:text-primary transition-colors"
        >
          {studentsExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Student List ({studentInsights.length})
        </button>

        {studentsExpanded && (
          <div className="bg-card border border-border rounded-[--radius-md] overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/50">
                  <th
                    className="px-4 py-2.5 cursor-pointer hover:text-primary"
                    onClick={() => toggleSort('name')}
                  >
                    Name{' '}
                    {studentSort === 'name' && (studentSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-2.5 cursor-pointer hover:text-primary text-right"
                    onClick={() => toggleSort('score')}
                  >
                    Score{' '}
                    {studentSort === 'score' && (studentSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">Standing</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">Gap Skills</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sortedStudents.map((s) => (
                  <tr key={s.studentId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/analysis/${id}/student/${s.studentId}`}
                        className="font-medium text-primary hover:text-primary"
                      >
                        {s.studentName}
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${masteryColor(s.totalScore)}`}
                    >
                      {Math.round(s.totalScore * 100)}%
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      {relativeStandingBadge(s.relativeToClass)}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {s.gapAreas.slice(0, 3).map((gap) => (
                          <span
                            key={gap}
                            className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
                          >
                            {gap}
                          </span>
                        ))}
                        {s.gapAreas.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{s.gapAreas.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
