import { useRef, useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Edit3,
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

export default function ClassOverview() {
  const { id } = useParams<{ id: string }>();
  const { analysis } = useAnalysisContext();
  const { classSummary, skillBreakdown, studentInsights } = analysis;

  // UI state
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [editingSkillTag, setEditingSkillTag] = useState<string | null>(null);
  const [editedSkillTags, setEditedSkillTags] = useState<Record<string, string>>({});
  const [skillEdited, setSkillEdited] = useState(false);
  const [expandedWrongAnswers, setExpandedWrongAnswers] = useState<Set<string>>(new Set());

  // Chart container — track explicit pixel dimensions to avoid ResponsiveContainer race
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

  // Histogram data
  const histogramData = useMemo(() => {
    const bands = [
      { range: '0-20%', min: 0, max: 0.2, count: 0, color: '#dc2626' },
      { range: '20-40%', min: 0.2, max: 0.4, count: 0, color: '#ea580c' },
      { range: '40-60%', min: 0.4, max: 0.6, count: 0, color: '#ca8a04' },
      { range: '60-80%', min: 0.6, max: 0.8, count: 0, color: '#65a30d' },
      { range: '80-100%', min: 0.8, max: 1.01, count: 0, color: '#16a34a' },
    ];
    studentInsights.forEach((s) => {
      const band = bands.find((b) => s.totalScore >= b.min && s.totalScore < b.max);
      if (band) band.count++;
    });
    return bands;
  }, [studentInsights]);

  function toggleWrongAnswers(skillTag: string) {
    setExpandedWrongAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(skillTag)) next.delete(skillTag);
      else next.add(skillTag);
      return next;
    });
  }

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

  const displayedSkills = showAllSkills
    ? [...skillBreakdown].sort((a, b) => a.classMastery - b.classMastery)
    : [...skillBreakdown].sort((a, b) => a.classMastery - b.classMastery).slice(0, 8);

  return (
    <div className="space-y-8">
      <GuidanceTip id="class-overview-intro">
        Start with the "At a Glance" summary to see how the class performed overall.
        Use the tabs above to view individual students or the intervention plan.
      </GuidanceTip>

      {/* Skill tag edit banner */}
      {skillEdited && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-[--radius-md] text-sm text-primary">
          <span>Skill tags have been edited. Re-analyze to apply corrections.</span>
          <button className="text-primary font-medium hover:underline text-sm">
            Re-analyze with corrections
          </button>
        </div>
      )}

      {/* ====== AT A GLANCE ====== */}
      <section className="bg-card border border-border rounded-[--radius-md] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider">
            At a Glance
          </h2>
          <Link
            to={`/classes/${(analysis as any).classId}`}
            className="text-sm text-primary hover:underline"
          >
            View class history &rarr;
          </Link>
        </div>

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
              {chartSize && (
                <BarChart
                  width={chartSize.w}
                  height={chartSize.h}
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
                      backgroundColor: '#F8F5F0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                    formatter={(value) => [`${value} students`, 'Count']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {histogramData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SKILL BREAKDOWN ====== */}
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
                      <td className="py-2.5 pr-3 text-center text-muted-foreground">
                        {skill.questionNumbers.join(', ')}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        <span
                          className={`font-medium ${skill.studentsStrugglingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {skill.studentsStrugglingCount}
                        </span>
                      </td>
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

      {skillBreakdown.length === 0 && (
        <section className="bg-card border border-border rounded-[--radius-md] p-6">
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Skill Breakdown
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-[--radius-md] p-4">
            <p className="text-sm text-amber-800 font-medium">Skill analysis not available</p>
            <p className="text-xs text-amber-700 mt-1">
              This CSV upload only included answer letters — no question text was provided.
              To enable skill breakdowns, add a <strong>QUESTION TEXT</strong> row to your CSV with what each question asks.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
