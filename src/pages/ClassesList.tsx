import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ClassForm } from '@/components/ClassForm';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, buildSparklineData, formatDate } from '@/lib/longitudinalUtils';
import type { Trend } from '@/lib/summaryTypes';
import type { AnalysisResult } from '@/lib/schemas';
import { ChevronDown, ChevronUp, Plus, Search, GraduationCap, Loader2 } from 'lucide-react';

interface ClassRow {
  id: string;
  name: string;
  studentCount: number;
  gradeLevel: string;
  subject: string;
  analysisCount: number;
  latestMeanScore: number | null;
  lastAnalysisDate: string | null;
  trend: Trend;
  sparklineData: number[];
}

type SortKey = 'name' | 'students' | 'analyses' | 'score' | 'date';
type SortDir = 'asc' | 'desc';

export default function ClassesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Array<{ id: string; name: string; studentCount: number; gradeLevel: string; subject: string }>>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [showAddClass, setShowAddClass] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Subscribe to classes
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'classes'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setClasses(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            studentCount: data.studentCount || 0,
            gradeLevel: data.gradeLevel || '',
            subject: data.subject || '',
          };
        }),
      );
      setLoadingClasses(false);
    });
    return unsub;
  }, [user]);

  // Subscribe to all analyses for this teacher
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

  const loading = loadingClasses || loadingAnalyses;

  // Merge classes with computed analysis stats
  const mergedClasses = useMemo(() => {
    const byClass = new Map<string, AnalysisResult[]>();
    for (const a of analyses) {
      const list = byClass.get(a.classId) || [];
      list.push(a);
      byClass.set(a.classId, list);
    }

    let rows = classes
      .map((c): ClassRow => {
        const classAnalyses = (byClass.get(c.id) || []).sort(
          (a, b) => a.generatedAt.localeCompare(b.generatedAt),
        );
        const meanScores = classAnalyses.map((a) => a.classSummary.meanScore);
        const latest = classAnalyses.length > 0 ? classAnalyses[classAnalyses.length - 1] : null;

        return {
          ...c,
          analysisCount: classAnalyses.length,
          latestMeanScore: latest ? latest.classSummary.meanScore : null,
          lastAnalysisDate: latest ? latest.generatedAt : null,
          trend: computeTrend(meanScores),
          sparklineData: buildSparklineData(meanScores),
        };
      })
      .filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    // Sort
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'students') cmp = a.studentCount - b.studentCount;
      else if (sortKey === 'analyses') cmp = a.analysisCount - b.analysisCount;
      else if (sortKey === 'score') cmp = (a.latestMeanScore ?? -1) - (b.latestMeanScore ?? -1);
      else if (sortKey === 'date') cmp = (a.lastAnalysisDate ?? '').localeCompare(b.lastAnalysisDate ?? '');
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return rows;
  }, [classes, analyses, searchQuery, sortKey, sortDir]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading classes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Classes</h1>
        <button
          onClick={() => setShowAddClass(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:bg-primary/90 transition-colors shadow-[--shadow-sm]"
        >
          <Plus className="w-4 h-4" />
          Add Class
        </button>
      </div>

      {/* Search */}
      {classes.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search classes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-card border border-border rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      )}

      {/* Empty state */}
      {classes.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No classes yet. Create your first class to get started.</p>
          <button
            onClick={() => setShowAddClass(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Class
          </button>
        </div>
      )}

      {/* Table */}
      {mergedClasses.length > 0 && (
        <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th
                    className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('name')}
                  >
                    Class <SortIcon column="name" />
                  </th>
                  <th
                    className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('students')}
                  >
                    Students <SortIcon column="students" />
                  </th>
                  <th
                    className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('analyses')}
                  >
                    Analyses <SortIcon column="analyses" />
                  </th>
                  <th
                    className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('score')}
                  >
                    Latest Avg <SortIcon column="score" />
                  </th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-medium">
                    Trend
                  </th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-medium">
                    History
                  </th>
                  <th
                    className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('date')}
                  >
                    Last Analyzed <SortIcon column="date" />
                  </th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium" />
                </tr>
              </thead>
              <tbody>
                {mergedClasses.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/classes/${c.id}`)}
                  >
                    <td className="py-3 px-4">
                      <Link
                        to={`/classes/${c.id}`}
                        className="font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                      {(c.gradeLevel || c.subject) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[c.gradeLevel, c.subject].filter(Boolean).join(' \u00b7 ')}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center text-muted-foreground">
                      {c.studentCount}
                    </td>
                    <td className="py-3 px-4 text-center text-muted-foreground">
                      {c.analysisCount || <span className="text-muted-foreground/50">&mdash;</span>}
                    </td>
                    <td className="py-3 px-4 text-center font-medium">
                      {c.latestMeanScore !== null
                        ? `${Math.round(c.latestMeanScore * 100)}%`
                        : <span className="text-muted-foreground/50">&mdash;</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.analysisCount > 0 ? (
                        <span className="inline-flex justify-center">
                          <TrendArrow trend={c.trend} size={14} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex justify-center">
                        {c.sparklineData.length >= 2 ? (
                          <Sparkline data={c.sparklineData} />
                        ) : (
                          <span className="text-muted-foreground/50">&mdash;</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {c.lastAnalysisDate
                        ? formatDate(c.lastAnalysisDate)
                        : <span className="text-muted-foreground/50">Never</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/analysis/new?classId=${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        + Analysis
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No search results */}
      {classes.length > 0 && mergedClasses.length === 0 && searchQuery && (
        <p className="text-center text-muted-foreground py-8">
          No classes matching &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {/* Add Class Modal */}
      {showAddClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
          <div className="relative bg-card border border-border rounded-[--radius-md] shadow-[--shadow-xl] w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <ClassForm
              onComplete={() => setShowAddClass(false)}
              onCancel={() => setShowAddClass(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
