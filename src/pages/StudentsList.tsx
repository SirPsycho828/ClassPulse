import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, buildSparklineData, formatDate } from '@/lib/longitudinalUtils';
import type { Trend } from '@/lib/summaryTypes';
import type { AnalysisResult } from '@/lib/schemas';
import { ChevronDown, ChevronUp, Loader2, Search, Users } from 'lucide-react';

interface RosterStudent {
  id: string;
  classId: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

interface StudentRow {
  classId: string;
  studentId: string;
  studentName: string;
  className: string;
  analysisCount: number;
  latestScore: number | null;
  lastAnalysisDate: string | null;
  trend: Trend;
  sparklineData: number[];
}

type SortKey = 'name' | 'class' | 'score' | 'trend' | 'date';
type SortDir = 'asc' | 'desc';

export default function StudentsList() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [classData, setClassData] = useState<Array<{ id: string; name: string }>>([]);
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingRosters, setLoadingRosters] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Subscribe to analyses
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'analyses'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAnalyses(snap.docs.map((d) => d.data() as AnalysisResult));
      setLoadingAnalyses(false);
    });
    return unsub;
  }, [user]);

  // Subscribe to classes
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'classes'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setClassData(snap.docs.map((d) => ({ id: d.id, name: d.data().name || 'Unknown' })));
      setLoadingClasses(false);
    });
    return unsub;
  }, [user]);

  // Subscribe to students for each class
  useEffect(() => {
    if (loadingClasses || classData.length === 0) {
      if (!loadingClasses) setLoadingRosters(false);
      return;
    }

    const unsubs: (() => void)[] = [];
    const perClass = new Map<string, RosterStudent[]>();
    let pending = classData.length;

    for (const cls of classData) {
      const unsub = onSnapshot(
        collection(db, 'classes', cls.id, 'students'),
        (snap) => {
          perClass.set(
            cls.id,
            snap.docs.map((d) => ({
              id: d.id,
              classId: cls.id,
              firstName: (d.data().firstName as string) || '',
              lastName: (d.data().lastName as string) || '',
              displayName: (d.data().displayName as string) || '',
            })),
          );
          // Merge all class rosters into one flat list
          const all: RosterStudent[] = [];
          for (const list of perClass.values()) all.push(...list);
          setRosterStudents(all);

          pending--;
          if (pending <= 0) setLoadingRosters(false);
        },
      );
      unsubs.push(unsub);
    }

    return () => unsubs.forEach((u) => u());
  }, [classData, loadingClasses]);

  const loading = loadingAnalyses || loadingClasses || loadingRosters;

  // Class name lookup
  const classNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classData) map.set(c.id, c.name);
    return map;
  }, [classData]);

  // Build student rows from roster + analysis overlay
  const students = useMemo(() => {
    // Build analysis data per classId_studentId
    const analysisMap = new Map<string, { scores: number[]; dates: string[] }>();
    const sorted = [...analyses].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
    for (const a of sorted) {
      for (const si of a.studentInsights) {
        const key = `${a.classId}_${si.studentId}`;
        if (!analysisMap.has(key)) {
          analysisMap.set(key, { scores: [], dates: [] });
        }
        const entry = analysisMap.get(key)!;
        entry.scores.push(si.totalScore);
        entry.dates.push(a.generatedAt);
      }
    }

    // Start from roster students
    const rows: StudentRow[] = rosterStudents.map((rs) => {
      const key = `${rs.classId}_${rs.id}`;
      const ad = analysisMap.get(key);
      return {
        classId: rs.classId,
        studentId: rs.id,
        studentName: rs.displayName || `${rs.firstName} ${rs.lastName}`.trim(),
        className: classNames.get(rs.classId) || 'Unknown',
        analysisCount: ad ? ad.scores.length : 0,
        latestScore: ad ? ad.scores[ad.scores.length - 1] : null,
        lastAnalysisDate: ad ? ad.dates[ad.dates.length - 1] : null,
        trend: ad ? computeTrend(ad.scores) : 'flat',
        sparklineData: ad ? buildSparklineData(ad.scores) : [],
      };
    });

    return rows;
  }, [rosterStudents, analyses, classNames]);

  // Unique class list for filter — from ALL classes, not just analyzed ones
  const classList = useMemo(() => {
    return classData
      .map((c) => [c.id, c.name] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [classData]);

  // Filter + sort
  const displayed = useMemo(() => {
    let filtered = students;

    if (classFilter !== 'all') {
      filtered = filtered.filter((s) => s.classId === classFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => s.studentName.toLowerCase().includes(q));
    }

    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.studentName.localeCompare(b.studentName);
      else if (sortKey === 'class') cmp = a.className.localeCompare(b.className);
      else if (sortKey === 'score') cmp = (a.latestScore ?? -1) - (b.latestScore ?? -1);
      else if (sortKey === 'date') cmp = (a.lastAnalysisDate ?? '').localeCompare(b.lastAnalysisDate ?? '');
      else {
        const order = { up: 1, flat: 0, down: -1 };
        cmp = (order[a.trend] ?? 0) - (order[b.trend] ?? 0);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [students, classFilter, searchQuery, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'class' ? 'asc' : 'desc');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading students...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="font-heading text-2xl font-bold text-foreground">Students</h1>

      {students.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">No students yet. Create a class and add students to get started.</p>
          <Link to="/classes" className="text-primary hover:underline text-sm">
            Go to Classes &rarr;
          </Link>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-card border border-border rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-card border border-border rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Classes</option>
              {classList.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Table */}
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
                    <th
                      className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('class')}
                    >
                      Class <SortIcon column="class" />
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
                    <th
                      className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('date')}
                    >
                      Last Analyzed <SortIcon column="date" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((s) => (
                    <tr key={`${s.classId}_${s.studentId}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4">
                        <Link
                          to={`/students/${s.classId}/${s.studentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {s.studentName}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4">
                        <Link
                          to={`/classes/${s.classId}`}
                          className="text-muted-foreground hover:text-primary hover:underline"
                        >
                          {s.className}
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
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {s.lastAnalysisDate
                          ? formatDate(s.lastAnalysisDate)
                          : <span className="text-muted-foreground/50">&mdash;</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {displayed.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              {searchQuery
                ? `No students matching "${searchQuery}"`
                : 'No students in this class yet.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
