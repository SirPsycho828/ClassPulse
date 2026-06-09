import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import ClassForm from '@/components/ClassForm';
import { Check, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import type { AnswerKey, AnswerKeyQuestion } from '@/lib/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassOption {
  id: string;
  className: string;
  studentCount: number;
}

type AssignmentType = 'scored' | 'objective';
type UploadMode = 'image' | 'csv';

interface AnswerKeyRow {
  questionNumber: number;
  correctAnswer: string;
  questionText: string;
  answerChoices: string;
  points: number;
  extraCredit: boolean;
}

// ---------------------------------------------------------------------------
// Progress Indicator
// ---------------------------------------------------------------------------

function ProgressIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const completed = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-12 sm:w-20 h-0.5 ${
                  completed ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                  completed
                    ? 'bg-primary border-primary text-primary-foreground'
                    : active
                      ? 'border-primary text-primary bg-card'
                      : 'border-input text-muted-foreground bg-card'
                }`}
              >
                {completed ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  active ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented Toggle
// ---------------------------------------------------------------------------

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; helper?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="flex rounded-[--radius-md] border border-input overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
              value === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {options.map(
        (opt) =>
          opt.value === value &&
          opt.helper && (
            <p key={opt.value} className="text-xs text-muted-foreground mt-1.5">
              {opt.helper}
            </p>
          ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Class Selection
// ---------------------------------------------------------------------------

function StepClassSelection({
  classes,
  loadingClasses,
  selectedClassId,
  onSelect,
  onClassCreated,
}: {
  classes: ClassOption[];
  loadingClasses: boolean;
  selectedClassId: string | null;
  onSelect: (id: string) => void;
  onClassCreated: (id: string, name: string, count: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  // No classes: show form directly
  if (!loadingClasses && classes.length === 0) {
    return (
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-1">
          Create your first class
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add a class roster so ClassPulse can match student papers.
        </p>
        <ClassForm
          onCreated={(id, name, count) => {
            onClassCreated(id, name, count);
          }}
        />
      </div>
    );
  }

  // One class: auto-select
  const autoSelected = classes.length === 1 && selectedClassId === classes[0].id;

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-foreground mb-1">Select a class</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Choose which class this assignment belongs to.
      </p>

      {loadingClasses ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading classes...
        </div>
      ) : (
        <>
          {autoSelected && !showForm ? (
            <div className="bg-primary/10 border border-primary/20 rounded-[--radius-md] p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {classes[0].className}
                </p>
                <p className="text-xs text-muted-foreground">
                  {classes[0].studentCount} students
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="text-sm text-primary hover:text-primary font-medium"
              >
                Change class
              </button>
            </div>
          ) : (
            <>
              <select
                value={selectedClassId ?? ''}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowForm(true);
                  } else {
                    setShowForm(false);
                    onSelect(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-card"
              >
                <option value="" disabled>
                  Choose a class...
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.className} ({c.studentCount} students)
                  </option>
                ))}
                <option value="__new__">+ Create New Class</option>
              </select>

              {showForm && (
                <div className="mt-4 p-4 bg-muted/50 rounded-[--radius-md] border border-border">
                  <ClassForm
                    onCreated={(id, name, count) => {
                      setShowForm(false);
                      onClassCreated(id, name, count);
                    }}
                    onCancel={() => setShowForm(false)}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Assignment Details
// ---------------------------------------------------------------------------

function StepAssignmentDetails({
  title,
  setTitle,
  assignmentType,
  setAssignmentType,
  uploadMode,
  setUploadMode,
  learningObjectives,
  setLearningObjectives,
  totalPoints,
  setTotalPoints,
  questionCount,
  setQuestionCount,
}: {
  title: string;
  setTitle: (v: string) => void;
  assignmentType: AssignmentType;
  setAssignmentType: (v: AssignmentType) => void;
  uploadMode: UploadMode;
  setUploadMode: (v: UploadMode) => void;
  learningObjectives: string;
  setLearningObjectives: (v: string) => void;
  totalPoints: string;
  setTotalPoints: (v: string) => void;
  questionCount: string;
  setQuestionCount: (v: string) => void;
}) {
  const isPathB = assignmentType === 'objective';

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-lg font-semibold text-foreground">Assignment Details</h2>

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1">
          Title <span className="text-destructive">*</span>
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Chapter 4 Quiz - Fractions"
          className="w-full px-3 py-2 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Assignment Type */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Assignment Type
        </label>
        <SegmentedToggle<AssignmentType>
          options={[
            {
              value: 'scored',
              label: 'Already Scored',
              helper: "I've already graded this. Extract my scores.",
            },
            {
              value: 'objective',
              label: 'Grade For Me',
              helper: 'This has objective answers. Grade it for me.',
            },
          ]}
          value={assignmentType}
          onChange={setAssignmentType}
        />
      </div>

      {/* Upload Mode */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Upload Mode
        </label>
        <SegmentedToggle<UploadMode>
          options={[
            { value: 'image', label: 'Photos / Scans' },
            { value: 'csv', label: 'CSV / Spreadsheet' },
          ]}
          value={uploadMode}
          onChange={setUploadMode}
        />
      </div>

      {/* Total Points */}
      <div>
        <label htmlFor="totalPoints" className="block text-sm font-medium text-foreground mb-1">
          Total Points {isPathB && <span className="text-destructive">*</span>}
          {!isPathB && <span className="text-muted-foreground font-normal ml-1">(optional)</span>}
        </label>
        <input
          id="totalPoints"
          type="number"
          min={1}
          required={isPathB}
          value={totalPoints}
          onChange={(e) => setTotalPoints(e.target.value)}
          placeholder="e.g., 100"
          className="w-full px-3 py-2 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Question Count */}
      <div>
        <label htmlFor="questionCount" className="block text-sm font-medium text-foreground mb-1">
          Question Count {isPathB && <span className="text-destructive">*</span>}
          {!isPathB && <span className="text-muted-foreground font-normal ml-1">(optional)</span>}
        </label>
        <input
          id="questionCount"
          type="number"
          min={1}
          required={isPathB}
          value={questionCount}
          onChange={(e) => setQuestionCount(e.target.value)}
          placeholder="e.g., 20"
          className="w-full px-3 py-2 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Learning Objectives */}
      <div>
        <label
          htmlFor="learningObjectives"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Learning Objectives
          <span className="text-muted-foreground font-normal ml-1">(optional)</span>
        </label>
        <textarea
          id="learningObjectives"
          rows={3}
          value={learningObjectives}
          onChange={(e) => setLearningObjectives(e.target.value)}
          placeholder="What skills does this assignment cover? (optional)"
          className="w-full px-3 py-2 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Answer Key (Path B only)
// ---------------------------------------------------------------------------

function StepAnswerKey({
  rows,
  setRows,
  totalPoints,
}: {
  rows: AnswerKeyRow[];
  setRows: (rows: AnswerKeyRow[]) => void;
  totalPoints: number;
}) {
  const [expanded, setExpanded] = useState(false);

  function updateRow(index: number, partial: Partial<AnswerKeyRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...partial } : r)));
  }

  const allValid = rows.every((r) => r.correctAnswer.trim() !== '');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-foreground">Answer Key</h2>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-primary hover:text-primary font-medium"
        >
          {expanded ? 'Quick entry mode' : 'Add question details'}
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Enter the correct answer for each question. Points default to{' '}
        {(totalPoints / rows.length).toFixed(1)} per question.
      </p>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-[--radius-md]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-muted-foreground font-medium w-12">#</th>
              <th className="px-3 py-2 text-left text-muted-foreground font-medium">
                Correct Answer <span className="text-destructive">*</span>
              </th>
              {expanded && (
                <>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">
                    Question Text
                  </th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">
                    Answer Choices
                  </th>
                </>
              )}
              <th className="px-3 py-2 text-left text-muted-foreground font-medium w-20">Pts</th>
              <th className="px-3 py-2 text-center text-muted-foreground font-medium w-16">EC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.questionNumber} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-1.5 text-muted-foreground font-medium">
                  {row.questionNumber}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    required
                    value={row.correctAnswer}
                    onChange={(e) => updateRow(i, { correctAnswer: e.target.value })}
                    placeholder="Answer"
                    className="w-full px-2 py-1 border border-input rounded-[--radius-sm] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                </td>
                {expanded && (
                  <>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={row.questionText}
                        onChange={(e) => updateRow(i, { questionText: e.target.value })}
                        placeholder="Optional"
                        className="w-full px-2 py-1 border border-input rounded-[--radius-sm] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={row.answerChoices}
                        onChange={(e) => updateRow(i, { answerChoices: e.target.value })}
                        placeholder="A, B, C, D"
                        className="w-full px-2 py-1 border border-input rounded-[--radius-sm] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      />
                    </td>
                  </>
                )}
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.points}
                    onChange={(e) => updateRow(i, { points: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 border border-input rounded-[--radius-sm] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.extraCredit}
                    onChange={(e) => updateRow(i, { extraCredit: e.target.checked })}
                    className="w-4 h-4 text-primary rounded-[--radius-sm] border-input focus:ring-ring"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!allValid && (
        <div className="flex items-center gap-2 text-sm text-warning">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          All questions must have a correct answer.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

export default function SetupWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Step tracking
  const [step, setStep] = useState(0);

  // Step 1 state
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Step 2 state
  const [title, setTitle] = useState('');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('scored');
  const [uploadMode, setUploadMode] = useState<UploadMode>('image');
  const [learningObjectives, setLearningObjectives] = useState('');
  const [totalPoints, setTotalPoints] = useState('');
  const [questionCount, setQuestionCount] = useState('');

  // Step 3 state
  const [answerKeyRows, setAnswerKeyRows] = useState<AnswerKeyRow[]>([]);

  // Creating assignment
  const [creating, setCreating] = useState(false);

  // Determine steps
  const isPathB = assignmentType === 'objective';
  const stepLabels = isPathB
    ? ['Class', 'Details', 'Answer Key']
    : ['Class', 'Details'];

  // ---------------------------------------------------------------------------
  // Load classes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        const q = query(
          collection(db, 'classes'),
          where('teacherId', '==', user!.uid),
        );
        const snap = await getDocs(q);
        const list: ClassOption[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            className: (data.className ?? data.name ?? 'Unnamed') as string,
            studentCount: (data.studentCount as number) || 0,
          };
        });

        if (cancelled) return;
        setClasses(list);

        // Auto-select if only one class
        if (list.length === 1) {
          setSelectedClassId(list[0].id);
        }
      } catch {
        toast('error', 'Failed to load classes.');
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, toast]);

  // ---------------------------------------------------------------------------
  // Build answer key rows when entering step 3
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const count = parseInt(questionCount, 10);
    if (!count || count <= 0) return;

    const pts = parseFloat(totalPoints) || count;
    const perQ = pts / count;

    // Preserve existing answers if count matches
    if (answerKeyRows.length === count) return;

    const newRows: AnswerKeyRow[] = Array.from({ length: count }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: answerKeyRows[i]?.correctAnswer ?? '',
      questionText: answerKeyRows[i]?.questionText ?? '',
      answerChoices: answerKeyRows[i]?.answerChoices ?? '',
      points: answerKeyRows[i]?.points ?? parseFloat(perQ.toFixed(2)),
      extraCredit: answerKeyRows[i]?.extraCredit ?? false,
    }));

    setAnswerKeyRows(newRows);
    // Only regenerate when questionCount or totalPoints change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCount, totalPoints]);

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  const canAdvanceStep1 = selectedClassId !== null;
  const canAdvanceStep2 = useMemo(() => {
    if (!title.trim()) return false;
    if (isPathB) {
      if (!totalPoints || parseFloat(totalPoints) <= 0) return false;
      if (!questionCount || parseInt(questionCount, 10) <= 0) return false;
    }
    return true;
  }, [title, isPathB, totalPoints, questionCount]);

  const canAdvanceStep3 = useMemo(
    () => answerKeyRows.length > 0 && answerKeyRows.every((r) => r.correctAnswer.trim() !== ''),
    [answerKeyRows],
  );

  // ---------------------------------------------------------------------------
  // Create assignment document
  // ---------------------------------------------------------------------------

  async function createAssignment(): Promise<string | null> {
    if (!user || !selectedClassId) return null;

    // Build answer key for Path B
    let answerKey: AnswerKey | null = null;
    if (isPathB) {
      const questions: AnswerKeyQuestion[] = answerKeyRows.map((r) => ({
        questionNumber: r.questionNumber,
        correctAnswer: r.correctAnswer.trim(),
        questionText: r.questionText.trim() || null,
        answerChoices: r.answerChoices.trim()
          ? r.answerChoices.split(',').map((s) => s.trim())
          : null,
        points: r.points,
        extraCredit: r.extraCredit,
      }));
      answerKey = { source: 'manual', questions };
    }

    const doc = {
      classId: selectedClassId,
      teacherId: user.uid,
      title: title.trim(),
      type: assignmentType === 'scored' ? 'scored' : 'objective',
      date: new Date().toISOString().split('T')[0],
      totalPoints: totalPoints ? parseFloat(totalPoints) : null,
      questionCount: questionCount ? parseInt(questionCount, 10) : null,
      learningObjectives: learningObjectives.trim() || null,
      answerKey,
      sourceType: uploadMode,
      imageUrls: [],
      status: 'uploading',
      pipelineState: {
        extractionResult: null,
        rosterMatchResult: null,
        validatedResult: null,
        gradedResult: null,
        skillInferenceResult: null,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const ref = await addDoc(collection(db, 'assignments'), doc);
      return ref.id;
    } catch {
      toast('error', 'Failed to create assignment. Please try again.');
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------

  async function handleNext() {
    if (step === 0) {
      if (!canAdvanceStep1) return;
      setStep(1);
    } else if (step === 1) {
      if (!canAdvanceStep2) return;

      if (isPathB) {
        // Go to step 3 (answer key)
        setStep(2);
      } else {
        // Path A: create assignment and go to upload
        setCreating(true);
        const id = await createAssignment();
        setCreating(false);
        if (id) {
          navigate(`/analysis/${id}/upload`);
        }
      }
    } else if (step === 2) {
      if (!canAdvanceStep3) return;

      setCreating(true);
      const id = await createAssignment();
      setCreating(false);
      if (id) {
        navigate(`/analysis/${id}/upload`);
      }
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function handleClassCreated(id: string, name: string, count: number) {
    setClasses((prev) => [...prev, { id, className: name, studentCount: count }]);
    setSelectedClassId(id);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto">
      <ProgressIndicator steps={stepLabels} current={step} />

      <div className="bg-card rounded-[--radius-md] shadow-[--shadow-sm] border border-border p-6">
        {/* Step 1 */}
        {step === 0 && (
          <StepClassSelection
            classes={classes}
            loadingClasses={loadingClasses}
            selectedClassId={selectedClassId}
            onSelect={setSelectedClassId}
            onClassCreated={handleClassCreated}
          />
        )}

        {/* Step 2 */}
        {step === 1 && (
          <StepAssignmentDetails
            title={title}
            setTitle={setTitle}
            assignmentType={assignmentType}
            setAssignmentType={setAssignmentType}
            uploadMode={uploadMode}
            setUploadMode={setUploadMode}
            learningObjectives={learningObjectives}
            setLearningObjectives={setLearningObjectives}
            totalPoints={totalPoints}
            setTotalPoints={setTotalPoints}
            questionCount={questionCount}
            setQuestionCount={setQuestionCount}
          />
        )}

        {/* Step 3 */}
        {step === 2 && isPathB && (
          <StepAnswerKey
            rows={answerKeyRows}
            setRows={setAnswerKeyRows}
            totalPoints={parseFloat(totalPoints) || 0}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={handleNext}
              disabled={
                creating ||
                (step === 0 && !canAdvanceStep1) ||
                (step === 1 && !canAdvanceStep2) ||
                (step === 2 && !canAdvanceStep3)
              }
              className="flex items-center gap-1 bg-primary text-primary-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : step === 2 && isPathB ? (
                <>
                  Start Analysis
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : step === 1 && !isPathB ? (
                <>
                  Continue to Upload
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
            {!creating && step === 0 && !canAdvanceStep1 && (
              <p className="text-xs text-muted-foreground/70">Select a class to continue.</p>
            )}
            {!creating && step === 1 && !canAdvanceStep2 && (
              <p className="text-xs text-muted-foreground/70">Fill in all required fields to continue.</p>
            )}
            {!creating && step === 2 && !canAdvanceStep3 && (
              <p className="text-xs text-muted-foreground/70">Enter a correct answer for every question.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
