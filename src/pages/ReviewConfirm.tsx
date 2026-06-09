import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { GuidanceTip } from '@/components/ux/GuidanceTip';
import { useToast } from '@/components/ui/Toast';
import type {
  ExtractionResult,
  ExtractedStudent,
  RosterMatchResult,
  RosterMatch,
} from '@/lib/schemas';
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  AlertTriangle,
  Edit3,
  UserX,
  UserPlus,
  Loader2,
  ArrowRight,
} from 'lucide-react';

// ---- local types ----
interface RosterStudent {
  id: string;
  name: string;
}

type RowStatus = 'confirmed' | 'needs_review' | 'unmatched' | 'excluded';

interface ReviewRow {
  extractionIndex: number;
  rawName: string;
  matchTier: RosterMatch['matchTier'];
  status: RowStatus;
  selectedStudentId: string | null;
  selectedRosterName: string | null;
  candidates: { studentId: string; rosterName: string; confidence: number }[];
  answers: ExtractedStudent['answers'];
  totalScore: ExtractedStudent['totalScore'];
  rememberAlias: boolean;
  isEditing: boolean;
  manualEntry: boolean;
}

// helpers
function statusColor(status: RowStatus) {
  switch (status) {
    case 'confirmed':
      return 'bg-success/10';
    case 'needs_review':
      return 'bg-warning/10 border-l-4 border-warning';
    case 'unmatched':
      return 'bg-destructive/10 border-l-4 border-destructive';
    case 'excluded':
      return 'bg-muted/50 opacity-60';
  }
}

function statusDot(status: RowStatus) {
  const colors: Record<RowStatus, string> = {
    confirmed: 'bg-success/100',
    needs_review: 'bg-warning/100',
    unmatched: 'bg-destructive/100',
    excluded: 'bg-muted-foreground/50',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}

export default function ReviewConfirm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [unmatchedRoster, setUnmatchedRoster] = useState<string[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [confirmedCollapsed, setConfirmedCollapsed] = useState(true);

  // ---- load data ----
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      try {
        const assignDoc = await getDoc(doc(db, 'assignments', id!));
        if (!assignDoc.exists()) {
          toast('error', 'Assignment not found.');
          navigate('/dashboard');
          return;
        }

        const assignData = assignDoc.data();
        setAssignmentTitle(assignData.title ?? 'Untitled Assignment');

        const extraction: ExtractionResult | null =
          assignData.pipelineState?.extractionResult ?? null;
        const matchResult: RosterMatchResult | null =
          assignData.pipelineState?.rosterMatchResult ?? null;

        if (!extraction || !matchResult) {
          toast('error', 'Extraction data not ready yet.');
          navigate(`/analysis/${id}/upload`);
          return;
        }

        // load class roster
        const classId = assignData.classId as string;
        const studentsSnap = await getDocs(
          collection(db, 'classes', classId, 'students'),
        );
        const rosterList: RosterStudent[] = [];
        studentsSnap.forEach((s) => {
          rosterList.push({ id: s.id, name: s.data().name ?? s.id });
        });
        setRoster(rosterList);
        setUnmatchedRoster(matchResult.unmatchedRosterStudents ?? []);

        // build rows
        const builtRows: ReviewRow[] = extraction.extractedStudents.map(
          (es) => {
            const match = matchResult.matches.find(
              (m) => m.extractionIndex === es.extractionIndex,
            );
            const allCandidates = match
              ? [
                  ...(match.topCandidate ? [match.topCandidate] : []),
                  ...match.otherCandidates,
                ]
              : [];

            return {
              extractionIndex: es.extractionIndex,
              rawName: es.rawName,
              matchTier: match?.matchTier ?? 'unmatched',
              status: match?.status ?? 'unmatched',
              selectedStudentId: match?.topCandidate?.studentId ?? null,
              selectedRosterName: match?.topCandidate?.rosterName ?? null,
              candidates: allCandidates,
              answers: es.answers,
              totalScore: es.totalScore,
              rememberAlias: false,
              isEditing: false,
              manualEntry: false,
            };
          },
        );

        setRows(builtRows);
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load review data.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, navigate, toast]);

  // ---- metrics ----
  const metrics = useMemo(() => {
    const confirmed = rows.filter((r) => r.status === 'confirmed').length;
    const needsReview = rows.filter((r) => r.status === 'needs_review').length;
    const unmatched = rows.filter((r) => r.status === 'unmatched').length;
    const excluded = rows.filter((r) => r.status === 'excluded').length;
    return {
      confirmed,
      needsReview,
      unmatched,
      total: rows.length,
      excluded,
      absent: unmatchedRoster.length,
    };
  }, [rows, unmatchedRoster]);

  const attentionRows = useMemo(
    () => rows.filter((r) => r.status === 'needs_review' || r.status === 'unmatched'),
    [rows],
  );
  const confirmedRows = useMemo(
    () => rows.filter((r) => r.status === 'confirmed'),
    [rows],
  );
  const excludedRows = useMemo(
    () => rows.filter((r) => r.status === 'excluded'),
    [rows],
  );

  const allResolved = metrics.needsReview === 0 && metrics.unmatched === 0;

  // ---- row actions ----
  const updateRow = useCallback(
    (extractionIndex: number, updates: Partial<ReviewRow>) => {
      setRows((prev) =>
        prev.map((r) =>
          r.extractionIndex === extractionIndex ? { ...r, ...updates } : r,
        ),
      );
    },
    [],
  );

  function handleConfirm(extractionIndex: number) {
    updateRow(extractionIndex, { status: 'confirmed', isEditing: false });
  }

  function handleExclude(extractionIndex: number) {
    updateRow(extractionIndex, { status: 'excluded', isEditing: false });
  }

  function handleEdit(extractionIndex: number) {
    updateRow(extractionIndex, { isEditing: true });
  }

  function handleCancelEdit(extractionIndex: number) {
    updateRow(extractionIndex, { isEditing: false });
  }

  function handleSelectStudent(extractionIndex: number, studentId: string) {
    const student = roster.find((r) => r.id === studentId);
    updateRow(extractionIndex, {
      selectedStudentId: studentId,
      selectedRosterName: student?.name ?? studentId,
    });
  }

  function handleRememberAlias(extractionIndex: number, checked: boolean) {
    updateRow(extractionIndex, { rememberAlias: checked });
  }

  function handleManualEntry(extractionIndex: number) {
    updateRow(extractionIndex, {
      manualEntry: true,
      status: 'confirmed',
      isEditing: false,
    });
  }

  // ---- submit ----
  async function handleSubmit() {
    if (!allResolved || !id) return;
    setSubmitting(true);

    try {
      const validatedStudents = rows
        .filter((r) => r.status !== 'excluded')
        .map((r) => ({
          extractionIndex: r.extractionIndex,
          studentId: r.selectedStudentId,
          rosterName: r.selectedRosterName ?? r.rawName,
          status: r.manualEntry ? 'manual_entry' : r.status === 'confirmed' ? 'teacher_confirmed' : 'auto_confirmed',
          rememberAlias: r.rememberAlias,
          answers: r.answers,
          totalScore: r.totalScore,
        }));

      const excludedStudents = rows
        .filter((r) => r.status === 'excluded')
        .map((r) => r.extractionIndex);

      const submitValidation = httpsCallable(functions, 'submitValidation');
      await submitValidation({
        assignmentId: id,
        validatedStudents,
        excludedStudents,
        absentStudents: unmatchedRoster,
      });

      toast('success', 'Validation submitted. Analysis starting...');
      navigate(`/analysis/${id}`);
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to submit validation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---- render row ----
  function renderRow(row: ReviewRow) {
    return (
      <div
        key={row.extractionIndex}
        className={`px-4 py-3 rounded-[--radius-md] ${statusColor(row.status)} transition-colors`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status dot */}
          {statusDot(row.status)}

          {/* Name / editing */}
          {row.isEditing ? (
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <select
                className="border border-input rounded-[--radius-md] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={row.selectedStudentId ?? ''}
                onChange={(e) =>
                  handleSelectStudent(row.extractionIndex, e.target.value)
                }
              >
                <option value="">Select student...</option>
                {roster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.rememberAlias}
                  onChange={(e) =>
                    handleRememberAlias(row.extractionIndex, e.target.checked)
                  }
                  className="rounded"
                />
                Remember this
              </label>
            </div>
          ) : (
            <div className="flex-1 min-w-[200px]">
              <span className="text-sm font-medium text-foreground">
                {row.selectedRosterName ?? row.rawName}
              </span>
              {row.selectedRosterName && row.selectedRosterName !== row.rawName && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (extracted: "{row.rawName}")
                </span>
              )}
              {row.matchTier !== 'exact' && row.matchTier !== 'alias' && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                  {row.matchTier}
                </span>
              )}
            </div>
          )}

          {/* Answers preview */}
          {row.answers.length > 0 && (
            <div className="hidden md:flex items-center gap-1">
              {row.answers.slice(0, 8).map((a) => (
                <span
                  key={a.questionNumber}
                  className={`text-xs w-6 h-6 flex items-center justify-center rounded ${
                    a.confidence < 0.7
                      ? 'bg-warning/15 text-warning'
                      : 'bg-muted text-muted-foreground'
                  }`}
                  title={`Q${a.questionNumber}: ${a.extractedAnswer} (${Math.round(a.confidence * 100)}%)`}
                >
                  {a.extractedAnswer}
                </span>
              ))}
              {row.answers.length > 8 && (
                <span className="text-xs text-muted-foreground">
                  +{row.answers.length - 8}
                </span>
              )}
            </div>
          )}

          {/* Score */}
          <div className="text-sm font-semibold text-foreground w-16 text-right">
            {row.totalScore.raw}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {row.status !== 'confirmed' && row.status !== 'excluded' && (
              <button
                onClick={() => handleConfirm(row.extractionIndex)}
                className="p-1.5 rounded-[--radius-md] text-success hover:bg-success/15"
                title="Confirm" aria-label="Confirm match"
                disabled={!row.selectedStudentId && !row.manualEntry}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {!row.isEditing ? (
              <button
                onClick={() => handleEdit(row.extractionIndex)}
                className="p-1.5 rounded-[--radius-md] text-muted-foreground hover:bg-muted"
                title="Edit" aria-label="Edit match"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleCancelEdit(row.extractionIndex)}
                className="p-1.5 rounded-[--radius-md] text-muted-foreground hover:bg-muted"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {row.status !== 'excluded' && (
              <button
                onClick={() => handleExclude(row.extractionIndex)}
                className="p-1.5 rounded-[--radius-md] text-destructive hover:bg-destructive/15"
                title="Exclude" aria-label="Exclude student"
              >
                <UserX className="w-4 h-4" />
              </button>
            )}
            {row.status === 'unmatched' && (
              <button
                onClick={() => handleManualEntry(row.extractionIndex)}
                className="p-1.5 rounded-[--radius-md] text-primary hover:bg-primary/15"
                title="Manual Entry"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading review data...</span>
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
        <span className="text-foreground">{assignmentTitle}</span>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Review</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Review & Confirm</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify extracted student data before analysis.
        </p>
      </div>

      {/* Metrics bar */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 text-success font-medium">
          <Check className="w-3.5 h-3.5" />
          {metrics.confirmed} of {metrics.total} confirmed
        </div>
        {metrics.needsReview > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {metrics.needsReview} need review
          </div>
        )}
        {metrics.unmatched > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive font-medium">
            <X className="w-3.5 h-3.5" />
            {metrics.unmatched} failed
          </div>
        )}
        {metrics.absent > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground font-medium">
            <UserX className="w-3.5 h-3.5" />
            {metrics.absent} absent
          </div>
        )}
      </div>

      <GuidanceTip id="review-confirm-intro">
        Verify each student match below. Click the checkmark to confirm, the pencil to edit a match, or the X to exclude a student. All yellow and red rows must be resolved before you can proceed.
      </GuidanceTip>

      {/* Section 1: Needs Attention */}
      {attentionRows.length > 0 && (
        <section>
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Needs Your Attention
            <span className="text-sm font-normal text-muted-foreground">
              ({attentionRows.length})
            </span>
          </h2>
          <div className="space-y-2">{attentionRows.map(renderRow)}</div>
        </section>
      )}

      {/* Section 2: Confirmed */}
      {confirmedRows.length > 0 && (
        <section>
          <button
            onClick={() => setConfirmedCollapsed(!confirmedCollapsed)}
            className="flex items-center gap-2 text-lg font-semibold text-foreground mb-3 hover:text-primary transition-colors"
          >
            {confirmedCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
            Confirmed
            <span className="text-sm font-normal text-muted-foreground">
              ({confirmedRows.length})
            </span>
          </button>
          {!confirmedCollapsed && (
            <div className="space-y-2">{confirmedRows.map(renderRow)}</div>
          )}
        </section>
      )}

      {/* Excluded */}
      {excludedRows.length > 0 && (
        <section>
          <h2 className="font-heading text-sm font-medium text-muted-foreground mb-2">
            Excluded ({excludedRows.length})
          </h2>
          <div className="space-y-1">{excludedRows.map(renderRow)}</div>
        </section>
      )}

      {/* Unmatched roster students */}
      {unmatchedRoster.length > 0 && (
        <section className="bg-muted/50 border border-border rounded-[--radius-md] p-4">
          <h2 className="font-heading text-sm font-semibold text-foreground mb-2">
            Unmatched Roster Students (Absent)
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            These students are on the class roster but no submission was found.
          </p>
          <div className="flex flex-wrap gap-2">
            {unmatchedRoster.map((name) => (
              <span
                key={name}
                className="text-xs px-2 py-1 rounded-full bg-muted text-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Confirm & Analyze button */}
      <div className="flex items-center justify-end pt-4 border-t border-border">
        <button
          onClick={handleSubmit}
          disabled={!allResolved || submitting}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Confirm & Analyze
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {!allResolved && (
        <p className="text-xs text-muted-foreground text-right">
          Resolve all yellow/red rows before confirming.
        </p>
      )}
    </div>
  );
}
