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
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus,
  ClipboardList,
  BarChart3,
  Clock,
  AlertCircle,
  Check,
  ChevronDown,
  Upload,
} from 'lucide-react';
import { GuidanceTip } from '@/components/ux/GuidanceTip';
import { NextStepCard } from '@/components/ux/NextStepCard';

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

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
      return `/analysis/${assignment.id}`;
    case 'error':
      return `/analysis/${assignment.id}`;
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
}

function AnalysisCard({
  assignment,
  className: clsName,
  pendingInterventions,
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
    <button
      type="button"
      onClick={() => navigate(getNavigationPath(assignment))}
      className="w-full text-left bg-card border border-border rounded-[--radius-md] shadow-[--shadow-sm] p-4 card-hover cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-sm font-semibold text-foreground truncate">
            {assignment.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">{clsName}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-muted-foreground/70">
              {formatDate(assignment.date)}
            </span>
            {summary && (
              <span className="text-xs text-muted-foreground">{summary}</span>
            )}
          </div>
        </div>
        <StatusBadge status={assignment.status} />
      </div>
    </button>
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
        snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))
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
  const processingCount = assignments.filter(
    (a) => a.status === 'uploading' || a.status === 'extracting' || a.status === 'analyzing',
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
        <Link
          to="/analysis/new"
          data-tour="new-analysis"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-lg px-8 py-3 rounded-full font-semibold tracking-wide hover:bg-primary/90 transition-colors w-full sm:w-auto justify-center"
        >
          <Plus className="w-5 h-5" />
          New Analysis
        </Link>

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredAssignments.map((a) => (
            <AnalysisCard
              key={a.id}
              assignment={a}
              className={classMap[a.classId] ?? 'Unknown Class'}
              pendingInterventions={interventionCounts[a.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
