import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ClassForm } from '@/components/ClassForm';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import type { ClassSummaryDoc } from '@/lib/summaryTypes';
import { Plus, Search, GraduationCap, Loader2 } from 'lucide-react';

export default function ClassesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<ClassSummaryDoc[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; studentCount: number; gradeLevel: string; subject: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showAddClass, setShowAddClass] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Subscribe to classSummaries
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'classSummaries'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setSummaries(snap.docs.map((d) => d.data() as ClassSummaryDoc));
    });
    return unsub;
  }, [user]);

  // Subscribe to classes (for classes without summaries yet)
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
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Merge: every class gets a card, enriched with summary data if available
  const mergedClasses = useMemo(() => {
    const summaryMap = new Map(summaries.map((s) => [s.classId, s]));
    return classes
      .map((c) => ({
        ...c,
        summary: summaryMap.get(c.id) || null,
      }))
      .filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
  }, [classes, summaries, searchQuery]);

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

      {/* Card grid */}
      {mergedClasses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mergedClasses.map((c) => (
            <Link
              key={c.id}
              to={`/classes/${c.id}`}
              className="block bg-card border border-border rounded-[--radius-md] p-5 card-hover transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-heading font-semibold text-foreground text-lg leading-tight">
                  {c.name}
                </h3>
                {c.summary && <TrendArrow trend={c.summary.trend} />}
              </div>

              <p className="text-sm text-muted-foreground mb-3">
                {c.studentCount} student{c.studentCount !== 1 ? 's' : ''}
                {c.summary ? ` \u00b7 ${c.summary.analysisCount} analys${c.summary.analysisCount !== 1 ? 'es' : 'is'}` : ''}
              </p>

              {c.summary ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-semibold text-foreground">
                      {Math.round(c.summary.latestMeanScore * 100)}%
                      <span className="text-sm font-normal text-muted-foreground ml-1">avg</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last analyzed {new Date(c.summary.lastAnalysisDate).toLocaleDateString()}
                    </p>
                  </div>
                  {c.summary.sparklineData.length >= 2 && (
                    <Sparkline data={c.summary.sparklineData} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No analyses yet.{' '}
                  <span
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/analysis/new?classId=${c.id}`);
                    }}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Start one &rarr;
                  </span>
                </p>
              )}
            </Link>
          ))}
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
