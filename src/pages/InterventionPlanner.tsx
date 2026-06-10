import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAnalysis } from '@/lib/resolveAnalysis';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisResult } from '@/lib/schemas';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Loader2,
  MessageSquare,
  Users,
  User,
  Zap,
  BookOpen,
  X,
} from 'lucide-react';

// ---- helpers ----
function scopeBadge(scope: string) {
  const styles: Record<string, string> = {
    whole_class: 'bg-purple-100 text-purple-700',
    small_group: 'bg-blue-100 text-blue-700',
    individual: 'bg-orange-100 text-orange-700',
  };
  const labels: Record<string, string> = {
    whole_class: 'Whole Class',
    small_group: 'Small Group',
    individual: 'Individual',
  };
  const icons: Record<string, typeof Users> = {
    whole_class: Users,
    small_group: Users,
    individual: User,
  };
  const Icon = icons[scope] ?? Users;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${styles[scope] ?? 'bg-muted text-muted-foreground'}`}
    >
      <Icon className="w-3 h-3" />
      {labels[scope] ?? scope}
    </span>
  );
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    planned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-primary/15 text-primary',
    done: 'bg-success/15 text-success',
    dismissed: 'bg-muted text-muted-foreground',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    planned: 'Planned',
    in_progress: 'In Progress',
    done: 'Done',
    dismissed: 'Dismissed',
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

type EffortTier = 'quick' | 'lesson' | 'individual';

const effortIcons: Record<EffortTier, typeof Zap> = {
  quick: Zap,
  lesson: BookOpen,
  individual: GraduationCap,
};

const effortLabels: Record<EffortTier, string> = {
  quick: 'Quick Win',
  lesson: 'Lesson Plan',
  individual: 'Individual',
};

type Intervention = AnalysisResult['interventions'][number];

export default function InterventionPlanner() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [analysisDocId, setAnalysisDocId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [dismissedExpanded, setDismissedExpanded] = useState(false);
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null);

  // Student name lookup
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});

  // ---- load data ----
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      try {
        const analysisDoc = await resolveAnalysis(id!, user!.uid);
        if (!analysisDoc || !analysisDoc.exists()) {
          toast('error', 'Analysis not found.');
          return;
        }
        setAnalysisDocId(analysisDoc.id);
        const analysisData = analysisDoc.data() as AnalysisResult;
        setAnalysis(analysisData);
        setInterventions(
          [...analysisData.interventions].sort((a, b) => a.priority - b.priority),
        );

        // Build student name map from studentInsights
        const nameMap: Record<string, string> = {};
        analysisData.studentInsights.forEach((s) => {
          nameMap[s.studentId] = s.studentName;
        });
        setStudentNames(nameMap);

        const assignDoc = await getDoc(
          doc(db, 'assignments', analysisData.assignmentId),
        );
        if (assignDoc.exists()) {
          setAssignmentTitle(assignDoc.data().title ?? 'Untitled Assignment');
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load interventions.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user, toast]);

  // ---- persist helpers ----
  const persistIntervention = useCallback(
    async (interventionId: string, updates: Partial<Intervention>) => {
      if (!analysis || !analysisDocId) return;
      try {
        const updatedList = interventions.map((int) =>
          int.interventionId === interventionId ? { ...int, ...updates } : int,
        );
        await updateDoc(doc(db, 'analyses', analysisDocId), {
          interventions: updatedList,
        });
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to save changes.');
      }
    },
    [analysis, analysisDocId, interventions, toast],
  );

  // ---- actions ----
  function updateIntervention(interventionId: string, updates: Partial<Intervention>) {
    setInterventions((prev) =>
      prev.map((int) =>
        int.interventionId === interventionId ? { ...int, ...updates } : int,
      ),
    );
  }

  function handleEffortTierSelect(interventionId: string, tier: EffortTier) {
    updateIntervention(interventionId, { selectedEffortTier: tier });
    persistIntervention(interventionId, { selectedEffortTier: tier });
    toast('success', `Effort tier set to "${effortLabels[tier]}".`);
  }

  function handleStatusChange(interventionId: string, status: Intervention['status']) {
    if (status === 'dismissed') {
      setPendingDismiss(interventionId);
      return;
    }
    updateIntervention(interventionId, { status });
    persistIntervention(interventionId, { status });
  }

  function confirmDismiss() {
    if (!pendingDismiss) return;
    updateIntervention(pendingDismiss, { status: 'dismissed' });
    persistIntervention(pendingDismiss, { status: 'dismissed' });
    setPendingDismiss(null);
    toast('success', 'Intervention dismissed.');
  }

  function handleNoteBlur(interventionId: string, note: string) {
    persistIntervention(interventionId, { teacherNote: note || null });
  }

  function handleDateChange(interventionId: string, date: string) {
    updateIntervention(interventionId, { plannedDate: date || null });
    persistIntervention(interventionId, { plannedDate: date || null });
  }

  function toggleStudentList(interventionId: string) {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(interventionId)) next.delete(interventionId);
      else next.add(interventionId);
      return next;
    });
  }

  // ---- computed ----
  const activeInterventions = useMemo(
    () => interventions.filter((i) => i.status !== 'dismissed'),
    [interventions],
  );
  const dismissedInterventions = useMemo(
    () => interventions.filter((i) => i.status === 'dismissed'),
    [interventions],
  );

  const totalTargetedStudents = useMemo(() => {
    const ids = new Set<string>();
    activeInterventions.forEach((i) => {
      i.affectedStudentIds.forEach((sid) => ids.add(sid));
    });
    return ids.size;
  }, [activeInterventions]);

  const totalStudents = analysis?.studentInsights.length ?? 0;

  // Uncovered students
  const uncoveredStudents = useMemo(() => {
    if (!analysis) return [];
    const coveredIds = new Set<string>();
    activeInterventions.forEach((i) => {
      i.affectedStudentIds.forEach((sid) => coveredIds.add(sid));
    });
    return analysis.studentInsights.filter((s) => !coveredIds.has(s.studentId));
  }, [analysis, activeInterventions]);

  // ---- loading ----
  if (loading || !analysis) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading intervention plan...
        </span>
      </div>
    );
  }

  if (interventions.length === 0) {
    return (
      <div className="space-y-6">
        <nav className="text-sm text-muted-foreground">
          <Link to="/dashboard" className="hover:text-primary">
            Dashboard
          </Link>
          <span className="mx-1.5">/</span>
          <Link to={`/analysis/${id}`} className="hover:text-primary">
            {assignmentTitle}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">Interventions</span>
        </nav>

        <div className="text-center py-20">
          <GraduationCap className="w-12 h-12 text-border mx-auto mb-4" />
          <h2 className="font-heading text-lg font-semibold text-foreground">
            No interventions recommended
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            The analysis did not identify any skill gaps requiring targeted intervention.
          </p>
          <Link
            to={`/analysis/${id}`}
            className="mt-4 inline-block text-sm text-primary hover:text-primary font-medium"
          >
            Back to Class Overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/dashboard" className="hover:text-primary">
          Dashboard
        </Link>
        <span className="mx-1.5">/</span>
        <Link to={`/analysis/${id}`} className="hover:text-primary">
          {assignmentTitle}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Interventions</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Intervention Planner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeInterventions.length} interventions targeting{' '}
          {totalTargetedStudents} of {totalStudents} students
        </p>
      </div>

      {/* Coverage summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium">
          <Zap className="w-3.5 h-3.5" />
          {activeInterventions.length} active
        </div>
        {dismissedInterventions.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground font-medium">
            <X className="w-3.5 h-3.5" />
            {dismissedInterventions.length} dismissed
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 text-success font-medium">
          <Users className="w-3.5 h-3.5" />
          {totalTargetedStudents}/{totalStudents} students covered
        </div>
      </div>

      {/* Intervention cards */}
      <div className="space-y-4">
        {activeInterventions.map((int) => {
          const borderColor =
            int.scope === 'whole_class'
              ? 'border-l-purple-500'
              : int.scope === 'small_group'
                ? 'border-l-blue-500'
                : 'border-l-accent';

          const isStudentsExpanded = expandedStudents.has(int.interventionId);

          return (
            <div
              key={int.interventionId}
              className={`bg-card border border-border border-l-4 ${borderColor} rounded-[--radius-md] p-5`}
            >
              {/* Card header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground bg-muted w-7 h-7 rounded-full flex items-center justify-center shrink-0">
                    #{int.priority}
                  </span>
                  <div>
                    <span className="inline-block text-sm font-semibold text-foreground mr-2">
                      {int.displayName}
                    </span>
                    {scopeBadge(int.scope)}
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-10 sm:pl-0">
                  {statusBadge(int.status)}
                  <select
                    value={int.status}
                    onChange={(e) =>
                      handleStatusChange(
                        int.interventionId,
                        e.target.value as Intervention['status'],
                      )
                    }
                    className="text-xs border border-border rounded-[--radius-md] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="pending">Pending</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>
              </div>

              {/* Misconception summary */}
              <p className="text-sm text-foreground mb-4">
                {int.misconceptionSummary}
              </p>

              {/* Affected students */}
              <div className="mb-4">
                <button
                  onClick={() => toggleStudentList(int.interventionId)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                >
                  {isStudentsExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <Users className="w-3 h-3" />
                  {int.affectedCount} students affected
                </button>
                {isStudentsExpanded && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-4">
                    {int.affectedStudentIds.map((sid) => (
                      <Link
                        key={sid}
                        to={`/analysis/${id}/student/${sid}`}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                      >
                        {studentNames[sid] ?? sid}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Effort tier selection */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Effort Level
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['quick', 'lesson', 'individual'] as EffortTier[]).map(
                    (tier) => {
                      const tierData = int.effortTiers[tier];
                      const Icon = effortIcons[tier];
                      const isSelected = int.selectedEffortTier === tier;
                      return (
                        <button
                          key={tier}
                          onClick={() =>
                            handleEffortTierSelect(int.interventionId, tier)
                          }
                          className={`text-left p-3 rounded-[--radius-md] border-2 transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-input bg-card'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon
                              className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                            />
                            <span
                              className={`text-xs font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}
                            >
                              {tierData.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {tierData.description}
                          </p>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Teacher note + date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                    <MessageSquare className="w-3 h-3" />
                    Teacher Note
                  </label>
                  <textarea
                    className="w-full text-sm border border-border rounded-[--radius-md] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    rows={2}
                    placeholder="Add a note..."
                    defaultValue={int.teacherNote ?? ''}
                    onBlur={(e) =>
                      handleNoteBlur(int.interventionId, e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                    <Calendar className="w-3 h-3" />
                    Planned Date
                  </label>
                  <input
                    type="date"
                    className="w-full text-sm border border-border rounded-[--radius-md] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                    value={int.plannedDate ?? ''}
                    onChange={(e) =>
                      handleDateChange(int.interventionId, e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dismissed interventions */}
      {dismissedInterventions.length > 0 && (
        <section>
          <button
            onClick={() => setDismissedExpanded(!dismissedExpanded)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {dismissedExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Dismissed ({dismissedInterventions.length})
          </button>
          {dismissedExpanded && (
            <div className="space-y-2 mt-2">
              {dismissedInterventions.map((int) => (
                <div
                  key={int.interventionId}
                  className="flex items-center justify-between bg-muted/50 border border-border rounded-[--radius-md] px-4 py-2.5 opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">
                      #{int.priority}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {int.displayName}
                    </span>
                    {scopeBadge(int.scope)}
                  </div>
                  <select
                    value={int.status}
                    onChange={(e) =>
                      handleStatusChange(
                        int.interventionId,
                        e.target.value as Intervention['status'],
                      )
                    }
                    className="text-xs border border-border rounded-[--radius-md] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="pending">Pending</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Uncovered students */}
      {uncoveredStudents.length > 0 && (
        <section className="bg-muted/50 border border-border rounded-[--radius-md] p-4">
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2">
            Uncovered Students ({uncoveredStudents.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            These students are not targeted by any active intervention.
          </p>
          <div className="flex flex-wrap gap-2">
            {uncoveredStudents.map((s) => (
              <Link
                key={s.studentId}
                to={`/analysis/${id}/student/${s.studentId}`}
                className="text-xs px-2 py-1 rounded-full bg-muted text-foreground hover:bg-primary/15 hover:text-primary transition-colors"
              >
                {s.studentName}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Completion card — shown when all active interventions are done */}
      {activeInterventions.length > 0 &&
        activeInterventions.every((i) => i.status === 'done') && (
          <section className="bg-success/10 border border-success/20 rounded-[--radius-md] p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
            <h3 className="font-heading text-lg font-semibold text-foreground mb-1">
              All interventions complete!
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Great work. You've addressed every recommended intervention for this assignment.
            </p>
            <Link
              to={`/analysis/${id}`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Back to Class Overview
            </Link>
          </section>
        )}

      {/* Dismiss confirmation dialog */}
      {pendingDismiss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-lg] p-6 max-w-sm mx-4">
            <h3 className="font-heading text-base font-semibold text-foreground mb-2">
              Dismiss this intervention?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Dismissed interventions can be restored later from the "Dismissed" section below.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setPendingDismiss(null)}
                className="text-sm text-muted-foreground hover:text-foreground font-medium px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDismiss}
                className="text-sm bg-destructive text-destructive-foreground px-4 py-1.5 rounded-full font-medium hover:bg-destructive/90 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
