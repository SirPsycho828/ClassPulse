import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import type { StudentSummaryDoc } from '@/lib/summaryTypes';
import { ChevronDown, ChevronUp, Loader2, Search, Users } from 'lucide-react';

type SortKey = 'name' | 'class' | 'score' | 'trend' | 'date';
type SortDir = 'asc' | 'desc';

export default function StudentsList() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<StudentSummaryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Subscribe to studentSummaries
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'studentSummaries'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setSummaries(snap.docs.map((d) => d.data() as StudentSummaryDoc));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Unique class list for filter dropdown
  const classList = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of summaries) {
      map.set(s.classId, s.className);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [summaries]);

  // Filter + sort
  const displayed = useMemo(() => {
    let filtered = summaries;

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
      else if (sortKey === 'score') cmp = a.latestScore - b.latestScore;
      else if (sortKey === 'date') cmp = a.lastAnalysisDate.localeCompare(b.lastAnalysisDate);
      else {
        const order = { up: 1, flat: 0, down: -1 };
        cmp = (order[a.trend] ?? 0) - (order[b.trend] ?? 0);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [summaries, classFilter, searchQuery, sortKey, sortDir]);

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

      {summaries.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">No students yet. Add students to a class to get started.</p>
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
                      <td className="py-2.5 px-4 text-center text-muted-foreground">{s.analysisCount}</td>
                      <td className="py-2.5 px-4 text-center font-medium">{Math.round(s.latestScore * 100)}%</td>
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
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {new Date(s.lastAnalysisDate).toLocaleDateString()}
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
