import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, storage, functions } from '@/lib/firebase';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import ClassForm from '@/components/ClassForm';
import { Check, ChevronLeft, ChevronRight, Loader2, AlertCircle, Upload, Camera } from 'lucide-react';
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
type AnswerKeyEntryMode = 'type' | 'photo';

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
  const [showNewClassForm, setShowNewClassForm] = useState(false);

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
            <>
              <div className="bg-primary/10 border border-primary/20 rounded-[--radius-md] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {classes[0].className}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {classes[0].studentCount} students
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="text-sm text-primary hover:text-primary font-medium"
                  >
                    Change class
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() => setShowNewClassForm(true)}
                    className="text-sm text-primary hover:text-primary font-medium"
                  >
                    + Add new
                  </button>
                </div>
              </div>
              {showNewClassForm && (
                <div className="mt-4 p-4 bg-muted/50 rounded-[--radius-md] border border-border">
                  <ClassForm
                    onCreated={(id, name, count) => {
                      setShowNewClassForm(false);
                      onClassCreated(id, name, count);
                    }}
                    onCancel={() => setShowNewClassForm(false)}
                  />
                </div>
              )}
            </>
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
  entryMode,
  setEntryMode,
  photoFile,
  photoPreviewUrl,
  photoUploadProgress,
  photoExtracting,
  photoError,
  photoExtractedRows,
  setPhotoExtractedRows,
  photoConfidences,
  onPhotoUpload,
  onPhotoReset,
  fileInputRef,
  cameraInputRef,
}: {
  rows: AnswerKeyRow[];
  setRows: (rows: AnswerKeyRow[]) => void;
  totalPoints: number;
  entryMode: AnswerKeyEntryMode;
  setEntryMode: (mode: AnswerKeyEntryMode) => void;
  photoFile: File | null;
  photoPreviewUrl: string | null;
  photoUploadProgress: number | null;
  photoExtracting: boolean;
  photoError: string | null;
  photoExtractedRows: AnswerKeyRow[];
  setPhotoExtractedRows: (rows: AnswerKeyRow[]) => void;
  photoConfidences: number[];
  onPhotoUpload: (file: File) => void;
  onPhotoReset: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const activeRows = entryMode === 'photo' ? photoExtractedRows : rows;
  const setActiveRows = entryMode === 'photo' ? setPhotoExtractedRows : setRows;

  function updateRow(index: number, partial: Partial<AnswerKeyRow>) {
    setActiveRows(activeRows.map((r, i) => (i === index ? { ...r, ...partial } : r)));
  }

  const allValid = activeRows.length > 0 && activeRows.every((r) => r.correctAnswer.trim() !== '');

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onPhotoUpload(file);
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onPhotoUpload(file);
  }

  const showTable = entryMode === 'type' || photoExtractedRows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-foreground">Answer Key</h2>
        {showTable && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-primary hover:text-primary font-medium"
          >
            {expanded ? 'Quick entry mode' : 'Add question details'}
          </button>
        )}
      </div>

      {/* Entry mode toggle */}
      <SegmentedToggle<AnswerKeyEntryMode>
        options={[
          { value: 'type', label: 'Type Answers' },
          { value: 'photo', label: 'Upload Photo' },
        ]}
        value={entryMode}
        onChange={setEntryMode}
      />

      {/* Photo upload mode */}
      {entryMode === 'photo' && !photoExtractedRows.length && (
        <div className="space-y-3">
          {photoUploadProgress !== null ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading... {photoUploadProgress}%</p>
            </div>
          ) : photoExtracting ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Extracting answers...</p>
            </div>
          ) : (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-3 py-8 px-4 border-2 border-dashed rounded-[--radius-md] transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-input'
                }`}
              >
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Upload your answer key photo
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-primary/90"
                  >
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 border border-input text-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-muted/50"
                  >
                    <Upload className="w-4 h-4" />
                    Browse Files
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, HEIC, WebP (max 10 MB)
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Fill out a blank copy of the assignment with the correct answers, then photograph or
                scan it. The AI will extract the answers for you to review.
              </p>
            </>
          )}

          {photoError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-[--radius-md]">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive flex-1">{photoError}</p>
              <button
                type="button"
                onClick={onPhotoReset}
                className="text-sm text-primary hover:text-primary font-medium whitespace-nowrap"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Photo preview thumbnail */}
      {entryMode === 'photo' && photoPreviewUrl && photoExtractedRows.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-[--radius-md] border border-border">
          <img
            src={photoPreviewUrl}
            alt="Answer key"
            className="w-16 h-16 object-cover rounded-[--radius-sm] border border-border"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {photoFile?.name || 'Answer key photo'}
            </p>
            <p className="text-xs text-muted-foreground">
              Review the extracted answers below. Edit any that look incorrect.
            </p>
          </div>
          <button
            type="button"
            onClick={onPhotoReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Re-upload
          </button>
        </div>
      )}

      {/* Answer table */}
      {showTable && (
        <>
          <p className="text-sm text-muted-foreground">
            {entryMode === 'photo'
              ? 'Review the extracted answers. Edit any that look incorrect.'
              : `Enter the correct answer for each question. Points default to ${(totalPoints / activeRows.length).toFixed(1)} per question.`}
          </p>

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
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium w-20">
                    Pts
                  </th>
                  <th className="px-3 py-2 text-center text-muted-foreground font-medium w-16">
                    EC
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row, i) => {
                  const lowConfidence =
                    entryMode === 'photo' && photoConfidences[i] !== undefined && photoConfidences[i] < 0.7;
                  return (
                    <tr
                      key={row.questionNumber}
                      className={`border-b border-border/50 last:border-0 ${lowConfidence ? 'bg-warning/5' : ''}`}
                    >
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
                          className={`w-full px-2 py-1 border rounded-[--radius-sm] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${
                            lowConfidence ? 'border-warning' : 'border-input'
                          }`}
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
                          onChange={(e) =>
                            updateRow(i, { points: parseFloat(e.target.value) || 0 })
                          }
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {!allValid && (
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              All questions must have a correct answer.
            </div>
          )}
        </>
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

  // Step 3 — photo upload state
  const [answerKeyEntryMode, setAnswerKeyEntryMode] = useState<AnswerKeyEntryMode>('type');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [photoExtracting, setPhotoExtracting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoExtractedRows, setPhotoExtractedRows] = useState<AnswerKeyRow[]>([]);
  const [photoConfidences, setPhotoConfidences] = useState<number[]>([]);

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
      points: parseFloat(perQ.toFixed(2)),
      extraCredit: answerKeyRows[i]?.extraCredit ?? false,
    }));

    setAnswerKeyRows(newRows);
    // Only regenerate when questionCount or totalPoints change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCount, totalPoints]);

  // ---------------------------------------------------------------------------
  // Answer key photo upload + extraction
  // ---------------------------------------------------------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleAnswerKeyPhotoUpload = useCallback(
    async (file: File) => {
      if (!user) return;

      // Validate file
      const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setPhotoError('Please upload a JPEG, PNG, HEIC, or WebP image.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setPhotoError('Image must be under 10 MB.');
        return;
      }

      setPhotoFile(file);
      setPhotoError(null);
      setPhotoPreviewUrl(URL.createObjectURL(file));

      // Upload to Firebase Storage
      const timestamp = Date.now();
      const storagePath = `uploads/${user.uid}/answerkeys/${timestamp}_${file.name}`;
      const storageRef = ref(storage, storagePath);

      try {
        // Upload with progress
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              setPhotoUploadProgress(
                Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
              );
            },
            (error) => reject(error),
            () => resolve(),
          );
        });

        setPhotoUploadProgress(null);
        setPhotoExtracting(true);

        // Call extractAnswerKey Cloud Function
        const extractFn = httpsCallable<
          { questionCount: number; imageUrl: string },
          { questions: Array<{ questionNumber: number; correctAnswer: string; confidence: number; questionText: string | null; answerChoices: string[] | null }> }
        >(functions, 'extractAnswerKey');

        const count = parseInt(questionCount, 10);
        const result = await extractFn({ questionCount: count, imageUrl: storagePath });

        // Convert extracted questions to AnswerKeyRow format
        const pts = parseFloat(totalPoints) || count;
        const perQ = pts / count;

        const rows: AnswerKeyRow[] = result.data.questions.map((q) => ({
          questionNumber: q.questionNumber,
          correctAnswer: q.correctAnswer,
          questionText: q.questionText || '',
          answerChoices: q.answerChoices ? q.answerChoices.join(', ') : '',
          points: parseFloat(perQ.toFixed(2)),
          extraCredit: false,
        }));

        const confidences = result.data.questions.map((q) => q.confidence);

        setPhotoExtractedRows(rows);
        setPhotoConfidences(confidences);
        setPhotoExtracting(false);
      } catch (err: unknown) {
        console.error('[answerKeyPhotoUpload] Error:', err);
        let message = 'Failed to extract answers. Please try again or type answers manually.';

        if (err instanceof Error && 'code' in err) {
          const code = (err as Error & { code: string }).code.replace('functions/', '');
          const detail = (err as Error & { message: string }).message || '';

          switch (code) {
            case 'unauthenticated':
              message = 'You must be signed in to extract answers. Please refresh and sign in again.';
              break;
            case 'permission-denied':
              message = 'Permission denied. Your teacher profile may not be set up yet — try signing out and back in.';
              break;
            case 'invalid-argument':
              message = detail || 'Invalid input. Make sure Question Count is set before uploading.';
              break;
            case 'internal':
              if (detail.includes('parse')) {
                message = 'The AI could not read the answer key clearly. Try a clearer photo with good lighting and contrast.';
              } else if (detail.includes('OPENROUTER_API_KEY')) {
                message = 'AI service not configured. An admin needs to set up the OpenRouter API key in Cloud Functions secrets.';
              } else {
                message = 'Answer extraction failed. Try a clearer photo, or switch to "Type Answers" to enter them manually.';
              }
              break;
            default:
              message = `Extraction failed (${code}). Try again or type answers manually.`;
          }
        }

        setPhotoError(message);
        setPhotoExtracting(false);
        setPhotoUploadProgress(null);
      }
    },
    [user, questionCount, totalPoints],
  );

  const handlePhotoReset = useCallback(() => {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoUploadProgress(null);
    setPhotoExtracting(false);
    setPhotoError(null);
    setPhotoExtractedRows([]);
    setPhotoConfidences([]);
  }, []);

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

  const canAdvanceStep3 = useMemo(() => {
    if (answerKeyEntryMode === 'type') {
      return answerKeyRows.length > 0 && answerKeyRows.every((r) => r.correctAnswer.trim() !== '');
    }
    // Photo mode: extracted rows must be populated and all have answers
    return (
      photoExtractedRows.length > 0 &&
      photoExtractedRows.every((r) => r.correctAnswer.trim() !== '')
    );
  }, [answerKeyEntryMode, answerKeyRows, photoExtractedRows]);

  // ---------------------------------------------------------------------------
  // Create assignment document
  // ---------------------------------------------------------------------------

  async function createAssignment(): Promise<string | null> {
    if (!user || !selectedClassId) return null;

    // Build answer key for Path B
    let answerKey: AnswerKey | null = null;
    if (isPathB) {
      const activeRows = answerKeyEntryMode === 'photo' ? photoExtractedRows : answerKeyRows;
      const source = answerKeyEntryMode === 'photo' ? 'image' : 'manual';

      const questions: AnswerKeyQuestion[] = activeRows.map((r) => ({
        questionNumber: r.questionNumber,
        correctAnswer: r.correctAnswer.trim(),
        questionText: r.questionText.trim() || null,
        answerChoices: r.answerChoices.trim()
          ? r.answerChoices.split(',').map((s) => s.trim())
          : null,
        points: r.points,
        extraCredit: r.extraCredit,
      }));
      answerKey = { source, questions };
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
            entryMode={answerKeyEntryMode}
            setEntryMode={setAnswerKeyEntryMode}
            photoFile={photoFile}
            photoPreviewUrl={photoPreviewUrl}
            photoUploadProgress={photoUploadProgress}
            photoExtracting={photoExtracting}
            photoError={photoError}
            photoExtractedRows={photoExtractedRows}
            setPhotoExtractedRows={setPhotoExtractedRows}
            photoConfidences={photoConfidences}
            onPhotoUpload={handleAnswerKeyPhotoUpload}
            onPhotoReset={handlePhotoReset}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
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
