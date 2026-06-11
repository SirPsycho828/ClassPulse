import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/longitudinalUtils';
import { ClassForm } from '@/components/ClassForm';
import {
  Plus,
  ClipboardList,
  BarChart3,
  Clock,
  AlertCircle,
  Check,
  ChevronDown,
  Upload,
  X,
  Trash2,
  Loader2,
} from 'lucide-react';
import { GuidanceTip } from '@/components/ux/GuidanceTip';
import { NextStepCard } from '@/components/ux/NextStepCard';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AssignmentStatus =
  | 'uploading'
  | 'extracting'
  | 'needs_review'
  | 'reviewing'
  | 'analyzing'
  | 'complete'
  | 'error';

interface Assignment {
  id: string;
  classId: string;
  teacherId: string;
  title: string;
  type: 'scored' | 'objective';
  date: string;
  status: AssignmentStatus;
  createdAt: { seconds: number } | null;
}

interface ClassDoc {
  id: string;
  name: string;
  studentCount?: number;
}

type DateRange = 'all' | 'week' | 'month' | 'semester';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  AssignmentStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  complete: {
    label: 'Complete',
    className: 'bg-green-50 text-green-700 border border-green-200',
    icon: <Check className="w-3 h-3" />,
  },
  needs_review: {
    label: 'Needs Review',
    className: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    icon: <AlertCircle className="w-3 h-3" />,
  },
  reviewing: {
    label: 'In Review',
    className: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    icon: <AlertCircle className="w-3 h-3" />,
  },
  analyzing: {
    label: 'Processing',
    className: 'bg-primary/10 text-primary border border-primary/20 animate-pulse',
    icon: <Clock className="w-3 h-3" />,
  },
  extracting: {
    label: 'Processing',
    className: 'bg-primary/10 text-primary border border-primary/20 animate-pulse',
    icon: <Clock className="w-3 h-3" />,
  },
  uploading: {
    label: 'Uploading',
    className: 'bg-primary/10 text-primary border border-primary/20 animate-pulse',
    icon: <Clock className="w-3 h-3" />,
  },
  error: {
    label: 'Error',
    className: 'bg-destructive/10 text-destructive border border-destructive/20',
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

function formatDashboardDate(iso: string): string {
  return formatDate(iso + 'T00:00:00');
}

function getNavigationPath(assignment: Assignment): string {
  switch (assignment.status) {
    case 'complete':
      return `/analysis/${assignment.id}`;
    case 'needs_review':
    case 'reviewing':
      return `/analysis/${assignment.id}/review`;
    case 'uploading':
      return `/analysis/${assignment.id}/upload`;
    case 'extracting':
    case 'analyzing':
    case 'error':
      return `/analysis/${assignment.id}/upload`;
    default:
      return `/analysis/${assignment.id}`;
  }
}

function getSemesterRange(): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  if (month >= 7) {
    // Aug-Dec = Fall semester
    return { start: new Date(year, 7, 1), end: new Date(year, 11, 31) };
  } else if (month <= 4) {
    // Jan-May = Spring semester
    return { start: new Date(year, 0, 1), end: new Date(year, 4, 31) };
  } else {
    // June-July: show most recent (spring)
    return { start: new Date(year, 0, 1), end: new Date(year, 4, 31) };
  }
}

function getDateRangeFilter(range: DateRange): ((dateStr: string) => boolean) | null {
  if (range === 'all') return null;

  const now = new Date();

  if (range === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return (dateStr: string) => new Date(dateStr + 'T00:00:00') >= weekAgo;
  }

  if (range === 'month') {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return (dateStr: string) => new Date(dateStr + 'T00:00:00') >= monthAgo;
  }

  // semester
  const { start, end } = getSemesterRange();
  return (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d >= start && d <= end;
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-[--radius-md] shadow-[--shadow-sm] p-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-5 bg-muted rounded w-48 mb-2" />
          <div className="h-4 bg-muted/50 rounded w-32 mb-3" />
          <div className="h-3 bg-muted/50 rounded w-56" />
        </div>
        <div className="h-6 w-20 bg-muted rounded-full" />
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="text-center py-16">
        <ClipboardList className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-muted-foreground">No analyses match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-20">
      <BarChart3 className="w-16 h-16 text-muted-foreground/40 mx-auto mb-6" />
      <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
        Upload your first assignment to see how your class is doing.
      </h2>
      <Link
        to="/analysis/new"
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-lg px-8 py-3 rounded-full font-semibold tracking-wide hover:bg-primary/90 transition-colors mt-6"
      >
        <Plus className="w-5 h-5" />
        New Analysis
      </Link>
      <p className="text-muted-foreground mt-4 max-w-md mx-auto">
        It takes about 3 minutes. You'll need photos of student work or a CSV
        of scores.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

interface AnalysisCardProps {
  assignment: Assignment;
  className: string;
  pendingInterventions: number;
  onDelete: (id: string, title: string) => void;
}

function AnalysisCard({
  assignment,
  className: clsName,
  pendingInterventions,
  onDelete,
}: AnalysisCardProps) {
  const navigate = useNavigate();

  function buildSummary(): string | null {
    if (assignment.status !== 'complete') return null;
    if (pendingInterventions > 0) {
      return `${pendingInterventions} intervention${pendingInterventions === 1 ? '' : 's'} pending`;
    }
    return 'All interventions addressed';
  }

  const summary = buildSummary();

  return (
    <div className="w-full bg-card border border-border rounded-[--radius-md] shadow-[--shadow-sm] card-hover">
      <button
        type="button"
        onClick={() => navigate(getNavigationPath(assignment))}
        className="w-full text-left p-4 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-sm font-semibold text-foreground truncate">
              {assignment.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">{clsName}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground/70">
                {formatDashboardDate(assignment.date)}
              </span>
              {summary && (
                <span className="text-xs text-muted-foreground">{summary}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge status={assignment.status} />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(assignment.id, assignment.title);
              }}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete assessment"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [interventionCounts, setInterventionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  function handleDeleteRequest(id: string, title: string) {
    setDeleteTarget({ id, title });
    setDeleteConfirmText('');
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      const deleteFn = httpsCallable(functions, 'deleteAssignment');
      await deleteFn({ assignmentId: deleteTarget.id });
      toast('success', `"${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err) {
      console.error('Delete failed:', err);
      toast('error', 'Failed to delete assessment. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  function toggleCollapsed(classId: string) {
    setCollapsedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  // Read filters from URL
  const selectedClassId = searchParams.get('class') ?? 'all';
  const selectedRange = (searchParams.get('range') as DateRange) ?? 'all';

  // Update URL query params when filter changes
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // ---------------------------------------------------------------------------
  // Fetch classes (one-time)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'classes'),
      where('teacherId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setClasses(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name as string,
            studentCount: (data.studentCount as number) || undefined,
          };
        })
      );
      setClassesLoaded(true);
    });
    return () => unsub();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Real-time assignments subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'assignments'),
      where('teacherId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Assignment, 'id'>),
      }));
      setAssignments(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Fetch intervention counts for completed assignments
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const completedIds = assignments
      .filter((a) => a.status === 'complete')
      .map((a) => a.id);

    if (completedIds.length === 0) {
      setInterventionCounts({});
      return;
    }

    async function fetchCounts() {
      const counts: Record<string, number> = {};

      // Process in batches of 30 (Firestore 'in' query limit)
      for (let i = 0; i < completedIds.length; i += 30) {
        const batch = completedIds.slice(i, i + 30);
        const q = query(
          collection(db, 'interventions'),
          where('teacherId', '==', user!.uid),
          where('assignmentId', 'in', batch),
          where('status', '==', 'pending')
        );
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const aid = d.data().assignmentId as string;
          counts[aid] = (counts[aid] ?? 0) + 1;
        });
      }

      setInterventionCounts(counts);
    }

    fetchCounts();
  }, [user, assignments]);

  // ---------------------------------------------------------------------------
  // Client-side filtering
  // ---------------------------------------------------------------------------
  const classMap = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  const filteredAssignments = useMemo(() => {
    let result = assignments;

    if (selectedClassId !== 'all') {
      result = result.filter((a) => a.classId === selectedClassId);
    }

    const dateFilter = getDateRangeFilter(selectedRange);
    if (dateFilter) {
      result = result.filter((a) => dateFilter(a.date));
    }

    return result;
  }, [assignments, selectedClassId, selectedRange]);

  const hasFilters = selectedClassId !== 'all' || selectedRange !== 'all';

  const groupedByClass = useMemo(() => {
    const classesToShow =
      selectedClassId === 'all'
        ? classes
        : classes.filter((c) => c.id === selectedClassId);

    return classesToShow.map((cls) => ({
      classDoc: cls,
      classAssignments: filteredAssignments.filter((a) => a.classId === cls.id),
    }));
  }, [classes, filteredAssignments, selectedClassId]);

  // ---------------------------------------------------------------------------
  // Date range options
  // ---------------------------------------------------------------------------
  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: 'all', label: 'All Time' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'semester', label: 'This Semester' },
  ];

  const selectedRangeLabel =
    dateRangeOptions.find((o) => o.value === selectedRange)?.label ?? 'All Time';

  const selectedClassName =
    selectedClassId === 'all'
      ? 'All Classes'
      : classMap[selectedClassId] ?? 'All Classes';

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick() {
      setClassDropdownOpen(false);
      setRangeDropdownOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  // Stats for the summary bar
  const completedCount = assignments.filter((a) => a.status === 'complete').length;
  const needsReviewCount = assignments.filter(
    (a) => a.status === 'needs_review' || a.status === 'reviewing',
  ).length;

  // Redirect first-time users to onboarding
  if (classesLoaded && classes.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div>
      {/* Stats summary bar — only shown when there are assignments */}
      {!loading && assignments.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-[--radius-md] p-3 sm:p-4">
            <div className="text-2xl font-bold text-foreground">{assignments.length}</div>
            <div className="text-xs text-muted-foreground">Total Analyses</div>
          </div>
          <div className="bg-card border border-border rounded-[--radius-md] p-3 sm:p-4">
            <div className="text-2xl font-bold text-success">{completedCount}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div className="bg-card border border-border rounded-[--radius-md] p-3 sm:p-4">
            <div className="text-2xl font-bold text-warning">{needsReviewCount}</div>
            <div className="text-xs text-muted-foreground">Needs Review</div>
          </div>
          <div className="bg-card border border-border rounded-[--radius-md] p-3 sm:p-4">
            <div className="text-2xl font-bold text-primary">{classes.length}</div>
            <div className="text-xs text-muted-foreground">Classes</div>
          </div>
        </div>
      )}

      {/* Header row: CTA + filters inline on desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link
            to="/analysis/new"
            data-tour="new-analysis"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-lg px-8 py-3 rounded-full font-semibold tracking-wide hover:bg-primary/90 transition-colors flex-1 sm:flex-initial justify-center"
          >
            <Plus className="w-5 h-5" />
            New Analysis
          </Link>
          <button
            type="button"
            onClick={() => setShowAddClass(true)}
            className="inline-flex items-center gap-2 border-2 border-primary text-primary text-sm px-4 py-3 rounded-full font-semibold hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Class
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Class dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setClassDropdownOpen((v) => !v);
              setRangeDropdownOpen(false);
            }}
            className="inline-flex items-center gap-2 border border-input rounded-[--radius-md] px-3 py-2 text-sm text-foreground bg-card hover:bg-muted/50 transition-colors"
          >
            {selectedClassName}
            <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
          </button>
          {classDropdownOpen && (
            <div className="absolute z-20 mt-1 w-56 bg-card border border-border rounded-[--radius-md] shadow-[--shadow-lg] py-1">
              <button
                type="button"
                onClick={() => setFilter('class', 'all')}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${selectedClassId === 'all' ? 'text-primary font-medium' : 'text-foreground'}`}
              >
                All Classes
              </button>
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter('class', c.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${selectedClassId === c.id ? 'text-primary font-medium' : 'text-foreground'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRangeDropdownOpen((v) => !v);
              setClassDropdownOpen(false);
            }}
            className="inline-flex items-center gap-2 border border-input rounded-[--radius-md] px-3 py-2 text-sm text-foreground bg-card hover:bg-muted/50 transition-colors"
          >
            {selectedRangeLabel}
            <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
          </button>
          {rangeDropdownOpen && (
            <div className="absolute z-20 mt-1 w-44 bg-card border border-border rounded-[--radius-md] shadow-[--shadow-lg] py-1">
              {dateRangeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter('range', opt.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${selectedRange === opt.value ? 'text-primary font-medium' : 'text-foreground'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* First-analysis prompt — shown when classes exist but no assignments yet */}
      {!loading && assignments.length === 0 && classes.length > 0 && (
        <div className="mb-6">
          <NextStepCard
            title="Analyze Your First Assignment"
            description="Upload photos of student work or a CSV of scores. It takes about 3 minutes to get your first class-level analysis."
            to="/analysis/new"
            actionLabel="New Analysis"
            icon={<Upload className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Returning-user tip — shown once when they have completed analyses */}
      {!loading && completedCount > 0 && (
        <div className="mb-6">
          <GuidanceTip id="dashboard-returning">
            Click any card below to revisit results, review interventions, or drill into individual student performance.
          </GuidanceTip>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState hasFilters={false} />
      ) : filteredAssignments.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="space-y-6">
          {groupedByClass.map(({ classDoc, classAssignments }) => {
            const isCollapsed = collapsedClasses.has(classDoc.id);
            return (
              <div key={classDoc.id}>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(classDoc.id)}
                  className="flex items-center gap-2 w-full text-left mb-3 group"
                >
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                  <Link
                    to={`/classes/${classDoc.id}`}
                    className="font-heading text-base font-semibold text-foreground hover:text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {classDoc.name}
                  </Link>
                  {classDoc.studentCount && (
                    <span className="text-xs text-muted-foreground">
                      &middot; {classDoc.studentCount} students
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {classAssignments.length}{' '}
                    {classAssignments.length === 1 ? 'analysis' : 'analyses'}
                  </span>
                </button>

                {!isCollapsed && (
                  classAssignments.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pl-6">
                      {classAssignments.map((a) => (
                        <AnalysisCard
                          key={a.id}
                          assignment={a}
                          className={classDoc.name}
                          pendingInterventions={interventionCounts[a.id] ?? 0}
                          onDelete={handleDeleteRequest}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="pl-6 py-4">
                      <p className="text-sm text-muted-foreground">
                        No analyses yet.{' '}
                        <Link
                          to="/analysis/new"
                          className="text-primary hover:text-primary/80 font-medium"
                        >
                          Start one &rarr;
                        </Link>
                      </p>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Class modal */}
      {showAddClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowAddClass(false)}
          />
          <div className="relative bg-card border border-border rounded-[--radius-md] shadow-[--shadow-lg] w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Add a New Class
              </h2>
              <button
                type="button"
                onClick={() => setShowAddClass(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ClassForm
              onComplete={() => {
                setShowAddClass(false);
              }}
              onCancel={() => setShowAddClass(false)}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-[--radius-md] shadow-lg p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Delete Assessment
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  This cannot be undone.
                </p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-4">
              Delete <strong>"{deleteTarget.title}"</strong> and all its analysis data, interventions, and uploaded files?
            </p>
            <div className="mb-5">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full border border-input rounded-[--radius-md] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:border-destructive placeholder:text-muted-foreground/40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteConfirmText === 'DELETE') handleDeleteConfirm();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-full border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-destructive hover:bg-destructive/90 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
