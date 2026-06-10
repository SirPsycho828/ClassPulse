import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { RosterTable } from '@/components/RosterTable';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, buildSparklineData } from '@/lib/longitudinalUtils';
import type { Trend } from '@/lib/summaryTypes';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  analysisCount: number;
  latestScore: number | null;
  trend: Trend;
  sparklineData: number[];
}

type SortKey = 'name' | 'score' | 'trend';
type SortDir = 'asc' | 'desc';

export default function ClassDetailRoster() {
  const { classId, analyses } = useClassDetailContext();
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Subscribe to students subcollection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'classes', classId, 'students'),
      (snap) => {
        setRosterStudents(
          snap.docs.map((d) => ({
            id: d.id,
            firstName: (d.data().firstName as string) || '',
            lastName: (d.data().lastName as string) || '',
            displayName: (d.data().displayName as string) || '',
          })),
        );
        setLoadingRoster(false);
      },
    );
    return unsub;
  }, [classId]);

  // Build student rows: roster students + analysis overlay
  const students = useMemo(() => {
    // Build analysis data per student
    const analysisMap = new Map<string, { scores: number[] }>();
    for (const a of analyses) {
      for (const si of a.studentInsights) {
        if (!analysisMap.has(si.studentId)) {
          analysisMap.set(si.studentId, { scores: [] });
        }
        analysisMap.get(si.studentId)!.scores.push(si.totalScore);
      }
    }

    // Start from roster students — they are the source of truth
    const rows: StudentRow[] = rosterStudents.map((rs) => {
      const ad = analysisMap.get(rs.id);
      return {
        studentId: rs.id,
        studentName: rs.displayName || `${rs.firstName} ${rs.lastName}`.trim(),
        analysisCount: ad ? ad.scores.length : 0,
        latestScore: ad ? ad.scores[ad.scores.length - 1] : null,
        trend: ad ? computeTrend(ad.scores) : 'flat',
        sparklineData: ad ? buildSparklineData(ad.scores) : [],
      };
    });

    // Also include analyzed students not in roster (e.g. removed from roster but have history)
    for (const [studentId, ad] of analysisMap) {
      if (!rosterStudents.some((rs) => rs.id === studentId)) {
        // Find their name from analysis data
        let name = 'Unknown';
        for (const a of analyses) {
          const si = a.studentInsights.find((s) => s.studentId === studentId);
          if (si) { name = si.studentName; break; }
        }
        rows.push({
          studentId,
          studentName: name,
          analysisCount: ad.scores.length,
          latestScore: ad.scores[ad.scores.length - 1],
          trend: computeTrend(ad.scores),
          sparklineData: buildSparklineData(ad.scores),
        });
      }
    }

    return rows;
  }, [rosterStudents, analyses]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...students];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.studentName.localeCompare(b.studentName);
      else if (sortKey === 'score') cmp = (a.latestScore ?? -1) - (b.latestScore ?? -1);
      else {
        const order = { up: 1, flat: 0, down: -1 };
        cmp = (order[a.trend] ?? 0) - (order[b.trend] ?? 0);
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

  if (loadingRoster) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading roster...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Performance table */}
      {students.length > 0 && (
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
                    <td className="py-2.5 px-4 text-center text-muted-foreground">
                      {s.analysisCount || <span className="text-muted-foreground/50">&mdash;</span>}
                    </td>
                    <td className="py-2.5 px-4 text-center font-medium">
                      {s.latestScore !== null
                        ? `${Math.round(s.latestScore * 100)}%`
                        : <span className="text-muted-foreground/50">&mdash;</span>}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {s.analysisCount > 0 ? (
                        <span className="inline-flex justify-center">
                          <TrendArrow trend={s.trend} size={14} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="flex justify-center">
                        {s.sparklineData.length >= 2 ? (
                          <Sparkline data={s.sparklineData} />
                        ) : (
                          <span className="text-muted-foreground/50">&mdash;</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editable roster management */}
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground mb-3">Manage Roster</h3>
        <RosterTable classId={classId} />
      </div>
    </div>
  );
}
