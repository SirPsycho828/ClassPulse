import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, buildSparklineData } from '@/lib/longitudinalUtils';
import type { Trend } from '@/lib/summaryTypes';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';

interface StudentRow {
  studentId: string;
  studentName: string;
  analysisCount: number;
  latestScore: number;
  trend: Trend;
  sparklineData: number[];
}

type SortKey = 'name' | 'score' | 'trend';
type SortDir = 'asc' | 'desc';

export default function ClassDetailRoster() {
  const { classId, analyses } = useClassDetailContext();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Aggregate student data across analyses
  const students = useMemo(() => {
    const map = new Map<string, { name: string; scores: number[] }>();

    for (const a of analyses) {
      for (const si of a.studentInsights) {
        if (!map.has(si.studentId)) {
          map.set(si.studentId, { name: si.studentName, scores: [] });
        }
        const entry = map.get(si.studentId)!;
        entry.scores.push(si.totalScore);
        entry.name = si.studentName; // latest name wins
      }
    }

    const rows: StudentRow[] = [];
    for (const [studentId, data] of map) {
      rows.push({
        studentId,
        studentName: data.name,
        analysisCount: data.scores.length,
        latestScore: data.scores[data.scores.length - 1],
        trend: computeTrend(data.scores),
        sparklineData: buildSparklineData(data.scores),
      });
    }
    return rows;
  }, [analyses]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...students];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.studentName.localeCompare(b.studentName);
      else if (sortKey === 'score') cmp = a.latestScore - b.latestScore;
      else {
        const order = { up: 1, flat: 0, down: -1 };
        cmp = order[a.trend] - order[b.trend];
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [students, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline w-3 h-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline w-3 h-3 ml-0.5" />
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
        <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No student data yet. Run an analysis to populate the roster.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th
                className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                onClick={() => toggleSort('name')}
              >
                Student <SortIcon column="name" />
              </th>
              <th className="text-center py-3 px-4 text-muted-foreground font-medium">Analyses</th>
              <th
                className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                onClick={() => toggleSort('score')}
              >
                Latest Score <SortIcon column="score" />
              </th>
              <th
                className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                onClick={() => toggleSort('trend')}
              >
                Trend <SortIcon column="trend" />
              </th>
              <th className="text-center py-3 px-4 text-muted-foreground font-medium">History</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.studentId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-2.5 px-4">
                  <Link
                    to={`/students/${classId}/${s.studentId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.studentName}
                  </Link>
                </td>
                <td className="py-2.5 px-4 text-center text-muted-foreground">{s.analysisCount}</td>
                <td className="py-2.5 px-4 text-center font-medium">
                  {Math.round(s.latestScore * 100)}%
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className="inline-flex justify-center">
                    <TrendArrow trend={s.trend} size={14} />
                  </span>
                </td>
                <td className="py-2.5 px-4">
                  <span className="flex justify-center">
                    {s.sparklineData.length >= 2 && <Sparkline data={s.sparklineData} />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
