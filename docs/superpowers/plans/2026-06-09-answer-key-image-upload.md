# Answer Key Image Upload + Points Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the answer key points distribution bug and add photo-based answer key entry via vision AI extraction in the Setup Wizard.

**Architecture:** New `extractAnswerKey` Cloud Function accepts a single image + questionCount, calls OpenRouter vision API with a dedicated answer-key prompt, and returns extracted answers to the wizard client. The wizard adds a toggle between manual entry and photo upload in Step 3, pre-filling the existing answer table with extracted data.

**Tech Stack:** React 19, TypeScript, Firebase Cloud Functions (2nd gen, onCall), Firebase Storage, OpenRouter API (vision model)

**Spec:** `docs/superpowers/specs/2026-06-09-answer-key-image-upload-design.md`

---

### Task 1: Fix the points distribution bug

**Files:**
- Modify: `src/pages/SetupWizard.tsx:636`

- [ ] **Step 1: Fix stale points preservation**

In `src/pages/SetupWizard.tsx`, the `useEffect` at line 621 preserves stale per-question points when `questionCount` changes mid-typing. Change line 636 to always recalculate:

```tsx
// In the useEffect at line 621, change the row builder (line 631-638):
const newRows: AnswerKeyRow[] = Array.from({ length: count }, (_, i) => ({
  questionNumber: i + 1,
  correctAnswer: answerKeyRows[i]?.correctAnswer ?? '',
  questionText: answerKeyRows[i]?.questionText ?? '',
  answerChoices: answerKeyRows[i]?.answerChoices ?? '',
  points: parseFloat(perQ.toFixed(2)),
  extraCredit: answerKeyRows[i]?.extraCredit ?? false,
}));
```

The only change is line 636: `points: answerKeyRows[i]?.points ?? parseFloat(perQ.toFixed(2))` becomes `points: parseFloat(perQ.toFixed(2))`. This ensures points are always recalculated from `totalPoints / questionCount` when either value changes, while still preserving user-entered answers, question text, choices, and extra credit flags.

- [ ] **Step 2: Verify the fix**

Run the dev server and test:
1. Navigate to `/analysis/new`, select a class, choose "Grade For Me"
2. Set Total Points = 100, Question Count = 10
3. Verify all 10 rows show 10 pts each (not 100 for row 1)
4. Change Question Count to 5, verify all show 20 pts
5. Change Total Points to 50, verify all show 10 pts

```bash
rtk pnpm dev
```

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/SetupWizard.tsx
rtk git commit -m "$(cat <<'EOF'
fix: recalculate per-question points when questionCount changes

Points were preserved from stale state when questionCount changed
mid-typing (e.g., typing "10" created row 1 with 100pts from the
intermediate "1" state). Now always recalculates from totalPoints /
questionCount.
EOF
)"
```

---

### Task 2: Add answer key extraction prompt

**Files:**
- Modify: `functions/src/shared/prompts.ts` (append new function after line 558)

- [ ] **Step 1: Add `buildAnswerKeyExtractionPrompt` function**

Append this function to the end of `functions/src/shared/prompts.ts` (after the closing of `buildAnalysisResponseSchema` at line 558):

```typescript
// ---------------------------------------------------------------------------
// Answer key extraction prompt
// ---------------------------------------------------------------------------

/**
 * Builds the messages array for extracting correct answers from a
 * photographed answer key. The caller appends the image content part
 * to the user message before sending to OpenRouter.
 *
 * @param questionCount  Number of questions the teacher specified in Step 2
 */
export function buildAnswerKeyExtractionPrompt(questionCount: number): ChatMessage[] {
  const systemPrompt = `You are an expert at reading scanned or photographed answer keys for student assignments. Your job is to accurately extract the correct answer for each question from an image of a completed answer key.

IMPORTANT RULES:
- Return ONLY valid JSON. No prose, no explanation outside the JSON.
- All confidence values must be decimals between 0 and 1.
- Never invent answers. Only extract what is visibly written on the paper.
- If a question's answer is not visible or illegible, still include it with an empty correctAnswer and low confidence.

CONFIDENCE CALIBRATION:
- 1.0: Printed text, clearly legible, zero ambiguity
- 0.8-0.9: Clear handwriting, high confidence in reading
- 0.6-0.8: Somewhat legible, reasonable interpretation
- 0.4-0.6: Difficult to read, multiple interpretations possible
- Below 0.4: Essentially guessing

WHAT TO EXTRACT:
- The correct answer for each question (letter choice, word, number, or short phrase)
- Question text if visible (the actual question being asked)
- Answer choices if visible (e.g., A, B, C, D options)
- This is an ANSWER KEY — every answer shown is the CORRECT answer`;

  const userText = `This image shows a completed answer key for an assignment with ${questionCount} questions. Extract the correct answer for each question.

If question text or answer choices are visible on the page, include those too. If only the answers are visible (e.g., a list of letters like "1. A, 2. C, 3. B"), that is fine — extract what you can see.

Return JSON matching this exact structure:
{
  "questions": [
    {
      "questionNumber": 1,
      "correctAnswer": "the correct answer as written",
      "confidence": 0.95,
      "questionText": "the question text if visible, or null",
      "answerChoices": ["A option", "B option", "C option", "D option"] or null
    }
  ]
}

Extract exactly ${questionCount} questions, numbered 1 through ${questionCount}. If a question is not visible on the page, include it with an empty correctAnswer string and confidence 0.0.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd functions && rtk pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add functions/src/shared/prompts.ts
rtk git commit -m "$(cat <<'EOF'
feat: add answer key extraction prompt for vision AI
EOF
)"
```

---

### Task 3: Add `extractAnswerKey` Cloud Function

**Files:**
- Modify: `functions/src/index.ts` (add new function after `runExtraction`, around line 231)

- [ ] **Step 1: Add import for the new prompt builder**

In `functions/src/index.ts`, update the import at line 6-10 to include the new function:

```typescript
import {
  buildExtractionPrompt,
  buildAnswerKeyExtractionPrompt,
  buildSkillInferencePrompt,
  buildAnalysisPrompt,
  type AssignmentType,
} from './shared/prompts';
```

- [ ] **Step 2: Add the `extractAnswerKey` function**

Insert after the `clampConfidence` helper (after line 237) and before the `runCsvExtraction` function (line 239):

```typescript
// ---------------------------------------------------------------------------
// extractAnswerKey — Vision AI extraction from answer key photo
// ---------------------------------------------------------------------------

export const extractAnswerKey = onCall(
  { timeoutSeconds: 300, secrets: ['OPENROUTER_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const { questionCount, imageUrl } = request.data as {
      questionCount: number;
      imageUrl: string;
    };

    if (!questionCount || questionCount <= 0) {
      throw new HttpsError('invalid-argument', 'questionCount must be a positive integer');
    }
    if (!imageUrl) {
      throw new HttpsError('invalid-argument', 'imageUrl is required');
    }

    // Verify caller is a teacher
    const teacherDoc = await db.collection('teachers').doc(request.auth.uid).get();
    if (!teacherDoc.exists) {
      throw new HttpsError('permission-denied', 'Teacher profile not found');
    }

    try {
      // Download image from Storage URL
      // The imageUrl is a Storage path like "uploads/{uid}/answerkeys/{file}"
      const bucket = admin.storage().bucket();
      const file = bucket.file(imageUrl);
      const [buffer] = await file.download();
      const base64 = buffer.toString('base64');
      const [metadata] = await file.getMetadata();
      const contentType = (metadata.contentType as string) || 'image/jpeg';

      // Build prompt
      const promptMessages = buildAnswerKeyExtractionPrompt(questionCount);
      const userMessage = promptMessages.find((m) => m.role === 'user');
      const systemMessage = promptMessages.find((m) => m.role === 'system');

      const messages: Array<{ role: string; content: string | Array<unknown> }> = [];
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage.content as string });
      }
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: (userMessage?.content as string) || '' },
          {
            type: 'image_url',
            image_url: { url: `data:${contentType};base64,${base64}` },
          },
        ],
      });

      // Call OpenRouter with the extraction model (vision-capable)
      const response = await callOpenRouter('extraction', messages);

      // Parse response
      let parsed;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        throw new HttpsError('internal', 'Failed to parse answer key extraction response');
      }

      // Normalize the extracted questions
      const questions = (parsed.questions || []).map(
        (q: Record<string, unknown>, i: number) => ({
          questionNumber: (q.questionNumber as number) || i + 1,
          correctAnswer: ((q.correctAnswer as string) || '').trim(),
          confidence: clampConfidence(q.confidence as number),
          questionText: (q.questionText as string) || null,
          answerChoices: Array.isArray(q.answerChoices) ? q.answerChoices : null,
        }),
      );

      return { questions };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      console.error('[extractAnswerKey] Error:', err);
      throw new HttpsError('internal', 'Answer key extraction failed');
    }
  },
);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd functions && rtk pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
rtk git add functions/src/index.ts
rtk git commit -m "$(cat <<'EOF'
feat: add extractAnswerKey Cloud Function for answer key photo upload
EOF
)"
```

---

### Task 4: Add photo upload mode to Step 3 in SetupWizard

**Files:**
- Modify: `src/pages/SetupWizard.tsx`

This is the largest task. It modifies `StepAnswerKey` to support a toggle between "Type Answers" and "Upload Photo", and adds the image upload + extraction flow.

- [ ] **Step 1: Add imports**

At the top of `src/pages/SetupWizard.tsx`, update imports:

```typescript
// Line 1-2: add useCallback and useRef
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';

// Line 11: replace `import { db } from '@/lib/firebase'` with:
import { db, storage, functions } from '@/lib/firebase';
// After that line, add:
import { ref, uploadBytesResumable } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';

// Line 15: add Upload icon
import { Check, ChevronLeft, ChevronRight, Loader2, AlertCircle, Upload } from 'lucide-react';
```

- [ ] **Step 2: Add answer key entry mode type and state**

After the existing type declarations (after line 29 `type UploadMode = 'image' | 'csv';`), add:

```typescript
type AnswerKeyEntryMode = 'type' | 'photo';
```

In the main `SetupWizard` component, after the existing Step 3 state (after line 562 `const [answerKeyRows, setAnswerKeyRows] = useState<AnswerKeyRow[]>([]);`), add:

```typescript
  // Step 3 — photo upload state
  const [answerKeyEntryMode, setAnswerKeyEntryMode] = useState<AnswerKeyEntryMode>('type');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [photoExtracting, setPhotoExtracting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoExtractedRows, setPhotoExtractedRows] = useState<AnswerKeyRow[]>([]);
  const [photoConfidences, setPhotoConfidences] = useState<number[]>([]);
```

- [ ] **Step 3: Add upload and extraction handler**

After the `useEffect` that builds answer key rows (after line 643), add the upload + extraction handler:

```typescript
  // ---------------------------------------------------------------------------
  // Answer key photo upload + extraction
  // ---------------------------------------------------------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      } catch (err) {
        console.error('[answerKeyPhotoUpload] Error:', err);
        setPhotoError('Failed to extract answers. Please try again or type answers manually.');
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
```

- [ ] **Step 4: Update `canAdvanceStep3` validation**

Replace the existing `canAdvanceStep3` memo (lines 659-662) to handle both entry modes:

```typescript
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
```

- [ ] **Step 5: Update `createAssignment` to use the correct rows and source**

In the `createAssignment` function (lines 668-718), update the answer key building section. Replace lines 672-685:

```typescript
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
```

- [ ] **Step 6: Rewrite `StepAnswerKey` component with toggle and upload support**

Replace the entire `StepAnswerKey` component (lines 406-534) with:

```tsx
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
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const activeRows = entryMode === 'photo' ? photoExtractedRows : rows;
  const setActiveRows = entryMode === 'photo' ? setPhotoExtractedRows : setRows;

  function updateRow(index: number, partial: Partial<AnswerKeyRow>) {
    setActiveRows(activeRows.map((r, i) => (i === index ? { ...r, ...partial } : r)));
  }

  const allValid = activeRows.length > 0 && activeRows.every((r) => r.correctAnswer.trim() !== '');

  // Drag and drop handlers
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

  // Show the answer table (shared between type and photo modes)
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
          {/* Upload / extracting states */}
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
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 py-10 px-4 border-2 border-dashed rounded-[--radius-md] cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-input hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Drop your answer key photo here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse — JPEG, PNG, HEIC, WebP (max 10 MB)
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Fill out a blank copy of the assignment with the correct answers, then photograph or
                scan it. The AI will extract the answers for you to review.
              </p>
            </>
          )}

          {/* Error state */}
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

      {/* Photo preview thumbnail (shown above table after extraction) */}
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

      {/* Answer table (shared between both modes) */}
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
```

- [ ] **Step 7: Update the `StepAnswerKey` call site in the render**

Replace the step 3 render block (lines 802-809) with the new props:

```tsx
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
          />
        )}
```

- [ ] **Step 8: Verify TypeScript compiles and dev server runs**

```bash
rtk pnpm tsc --noEmit && rtk pnpm dev
```

- [ ] **Step 9: Commit**

```bash
rtk git add src/pages/SetupWizard.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add photo upload mode for answer key in Setup Wizard

Teachers can now photograph or scan a completed answer key and have
vision AI extract the correct answers. Adds a "Type Answers" / "Upload
Photo" toggle to Step 3, with drag-drop upload, extraction progress,
confidence highlighting, and inline editing of extracted results.
EOF
)"
```

---

### Task 5: Deploy and verify

**Files:** None (deployment only)

- [ ] **Step 1: Check Firebase account**

```bash
rtk firebase login:list
rtk firebase login:use steve@wearesmartass.com
```

- [ ] **Step 2: Deploy Cloud Functions**

```bash
cd functions && rtk pnpm install && cd ..
rtk firebase deploy --only functions
```

- [ ] **Step 3: Deploy Hosting**

```bash
rtk pnpm build && rtk firebase deploy --only hosting
```

- [ ] **Step 4: Verify end-to-end on production**

Use Playwright MCP or manual testing:
1. Go to classpulse-edu.web.app/analysis/new
2. Select a class, fill in details with "Grade For Me", 100 points, 10 questions
3. On Step 3, verify points bug is fixed (all rows show 10 pts)
4. Toggle to "Upload Photo", upload a photo of an answer key
5. Verify extraction runs and pre-fills the answer table
6. Verify low-confidence answers have amber highlighting
7. Edit an answer, click "Start Analysis" to confirm the flow completes

- [ ] **Step 5: Commit any build/deploy fixes if needed**
