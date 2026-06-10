import { useRef, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { findRecurringProblemSkills } from '@/lib/longitudinalUtils';
import { formatDate } from '@/lib/longitudinalUtils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { BarChart3 } from 'lucide-react';

function masteryColor(level: string) {
  if (level === 'green') return 'text-success';
  if (level === 'yellow') return 'text-warning';
  return 'text-destructive';
}

function masteryBgLight(level: string) {
  if (level === 'green') return 'bg-success/15';
  if (level === 'yellow') return 'bg-warning/15';
  return 'bg-destructive/15';
}

function trendLabel(trend: string) {
  if (trend === 'improving') return 'Improving';
  if (trend === 'worsening') return 'Worsening';
  return 'Stuck';
}

function trendColor(trend: string) {
  if (trend === 'improving') return 'text-success';
  if (trend === 'worsening') return 'text-destructive';
  return 'text-muted-foreground';
}

export default function ClassDetailOverview() {
  const { analyses } = useClassDetailContext();

  // Chart container sizing
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

  // Chart data
  const chartData = useMemo(
    () =>
      analyses.map((a) => ({
        name: a.assignmentTitle,
        date: formatDate(a.generatedAt),
        mean: Math.round(a.classSummary.meanScore * 100),
        median: Math.round(a.classSummary.medianScore * 100),
        analysisId: a.analysisId,
      })),
    [analyses],
  );

  // Recurring problem skills
  const problemSkills = useMemo(
    () =>
      findRecurringProblemSkills(
        analyses.map((a) => ({
          analysisId: a.analysisId,
          generatedAt: a.generatedAt,
          assignmentTitle: a.assignmentTitle,
          skillBreakdown: a.skillBreakdown,
        })),
      ),
    [analyses],
  );

  if (analyses.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
        <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No analyses yet. Run an analysis to see trends over time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Score Trend Chart */}
      <section className="bg-card border border-border rounded-[--radius-md] p-5">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Score Trends</h2>
        <div ref={chartContainerRef} className="w-full h-[280px]">
          {chartSize && (
            <LineChart
              width={chartSize.w}
              height={chartSize.h}
              data={chartData}
              margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
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
              <Tooltip
                contentStyle={{
                  fontSize: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid hsl(33, 16%, 83%)',
                  backgroundColor: '#F8F5F0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
                formatter={(value: number, name: string) => [`${value}%`, name === 'mean' ? 'Mean' : 'Median']}
                labelFormatter={(label) => label}
              />
              <Line
                type="monotone"
                dataKey="mean"
                stroke="hsl(216, 52%, 24%)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(216, 52%, 24%)' }}
                activeDot={{ r: 6 }}
                name="mean"
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="hsl(24, 55%, 60%)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="median"
              />
            </LineChart>
          )}
        </div>
        {analyses.length > 1 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Solid line = mean, dashed line = median
          </p>
        )}
      </section>

      {/* Analysis History Table */}
      <section className="bg-card border border-border rounded-[--radius-md] p-5">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Analysis History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Assignment</th>
                <th className="text-left py-2 px-4 text-muted-foreground font-medium">Date</th>
                <th className="text-center py-2 px-4 text-muted-foreground font-medium">Mean</th>
                <th className="text-center py-2 px-4 text-muted-foreground font-medium">Median</th>
                <th className="text-center py-2 px-4 text-muted-foreground font-medium">Students</th>
              </tr>
            </thead>
            <tbody>
              {[...analyses].reverse().map((a) => (
                <tr key={a.analysisId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 pr-4">
                    <Link
                      to={`/analysis/${a.analysisId}/class`}
                      className="font-medium text-primary hover:underline"
                    >
                      {a.assignmentTitle}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {formatDate(a.generatedAt)}
                  </td>
                  <td className="py-2.5 px-4 text-center font-medium">
                    {Math.round(a.classSummary.meanScore * 100)}%
                  </td>
                  <td className="py-2.5 px-4 text-center font-medium">
                    {Math.round(a.classSummary.medianScore * 100)}%
                  </td>
                  <td className="py-2.5 px-4 text-center text-muted-foreground">
                    {a.classSummary.studentsAnalyzed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recurring Problem Skills */}
      <section className="bg-card border border-border rounded-[--radius-md] p-5">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
          Recurring Problem Skills
        </h2>
        {problemSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skills have been flagged as weak across multiple analyses. Keep it up!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Skill</th>
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Weak In</th>
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Latest</th>
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {problemSkills.map((skill) => (
                  <tr key={skill.skillTag} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{skill.displayName}</td>
                    <td className="py-2.5 px-4 text-center text-muted-foreground">
                      {skill.weakCount} / {skill.totalCount} analyses
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${masteryBgLight(skill.latestMasteryLevel)} ${masteryColor(skill.latestMasteryLevel)}`}>
                        {Math.round(skill.latestMastery * 100)}%
                      </span>
                    </td>
                    <td className={`py-2.5 px-4 text-center text-xs font-medium ${trendColor(skill.trend)}`}>
                      {trendLabel(skill.trend)}
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
