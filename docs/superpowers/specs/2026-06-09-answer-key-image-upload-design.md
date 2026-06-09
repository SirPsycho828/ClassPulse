# Answer Key Image Upload + Points Bug Fix

**Date:** 2026-06-09
**Status:** Approved

## 1. Points Bug Fix

### Problem

In `src/pages/SetupWizard.tsx:621-643`, the `useEffect` that builds answer key rows fires on every keystroke in the Question Count field. When a teacher types "10":

1. Keystroke "1" — creates 1 row with `100 / 1 = 100` pts
2. Keystroke "10" — regenerates 10 rows, but row 0 preserves its stale 100 pts via `answerKeyRows[0]?.points ?? perQ`

Result: question 1 shows 100 points, questions 2-10 show 10 points.

### Fix

Always recalculate points from `totalPoints / questionCount` when regenerating rows. Only preserve user-entered `correctAnswer`, `questionText`, `answerChoices`, and `extraCredit` — not `points`.

```diff
- points: answerKeyRows[i]?.points ?? parseFloat(perQ.toFixed(2)),
+ points: parseFloat(perQ.toFixed(2)),
```

## 2. Answer Key Image Upload

### Overview

Add a second entry method to Setup Wizard Step 3 (Answer Key). The teacher can photograph or scan a completed quiz used as the answer key, upload the image, and have vision AI extract the correct answers. Extracted answers pre-fill the existing answer table for review and confirmation.

### UI Changes — SetupWizard Step 3

**Toggle** at the top of Step 3, matching the existing "Photos / Scans" vs "CSV / Spreadsheet" toggle style from Step 2:

- **"Type Answers"** (default) — current manual entry table, unchanged
- **"Upload Photo"** — new image upload mode

**Upload Photo mode:**

1. **Drop zone** — single image (JPEG, PNG, HEIC, WebP), max 10 MB. Drag/drop or click to browse. Reuses the same visual patterns as the student paper upload in `Upload.tsx`.
2. **Uploading state** — thumbnail preview with progress indicator.
3. **Extracting state** — spinner with "Extracting answers..." text while the Cloud Function runs.
4. **Results state** — the standard answer key table, pre-filled with extracted answers. The uploaded image thumbnail remains visible above the table so the teacher can cross-reference. Answers with confidence < 0.7 are highlighted (amber border) to draw attention for review.
5. **Error state** — if extraction fails, show error message with a "Try Again" button that clears the upload and returns to the drop zone.

**Behavior details:**

- Switching between "Type Answers" and "Upload Photo" preserves data on each side independently.
- The teacher can edit any pre-filled value before submitting.
- `answerKey.source` is set to `'image'` when the key comes from a photo, `'manual'` when typed.
- The "Start Analysis" button and validation rules are the same regardless of entry method — all questions must have a correct answer.

### New Cloud Function: `extractAnswerKey`

**Type:** HTTPS Callable (2nd gen)

**Input:**
```ts
{
  questionCount: number;  // How many questions to expect
  imageUrl: string;       // Firebase Storage download URL of the answer key photo
}
```

The assignment document doesn't exist yet during the wizard, so `questionCount` is passed directly from wizard state (not read from Firestore).

**Auth:** Validates caller is an authenticated teacher (no assignment-level check since the assignment doesn't exist yet).

**Flow:**

1. Validate input and auth.
2. Download image from `imageUrl`, convert to base64 data URL.
3. Build answer-key-specific extraction prompt with `questionCount` for context.
4. Call OpenRouter using the extraction model from admin config (default: `google/gemini-2.5-flash`).
5. Parse response into question array with confidence scores.
6. Return extracted questions directly to the client (no Firestore write).

**Output:**
```ts
{
  questions: Array<{
    questionNumber: number;
    correctAnswer: string;
    confidence: number;
    questionText: string | null;
    answerChoices: string[] | null;
  }>;
}
```

**Notes:**
- Points are not extracted from the image. They are calculated client-side from `totalPoints / questionCount`, same as manual entry.
- The function does NOT write to Firestore. The wizard holds extracted data in component state until the teacher clicks "Start Analysis", at which point the assignment document is created with the full answer key.

### Firebase Storage

**Path:** `uploads/{teacherId}/answerkeys/{timestamp}_{filename}`

Separate from student paper uploads since the assignment document doesn't exist yet during the wizard. The `timestamp` prefix prevents collisions if the teacher re-uploads.

### Extraction Prompt

Added to `functions/src/shared/prompts.ts` as a new function `buildAnswerKeyExtractionPrompt(questionCount: number)`.

Key prompt instructions:
- This is an answer key, not a student paper
- Extract the correct answer for each of the `questionCount` questions
- Extract question text and answer choices if visible on the page
- Return confidence score (0-1) for each extracted answer
- Output as JSON array matching the expected schema

### Schemas

No schema changes needed. `AnswerKeySchema` already supports `source: 'manual' | 'image'` and `AnswerKeyQuestionSchema` has all required fields. The Cloud Function response adds `confidence` per question which is used only in the UI (not persisted).

## Out of Scope

- Multiple image support for multi-page answer keys
- CSV answer key upload
- Re-extraction (uploading a different photo replaces the previous one)
- Changes to the student paper extraction pipeline
- Answer key image persistence after assignment creation (the image is only used for extraction)

## Key Files

| File | Changes |
|------|---------|
| `src/pages/SetupWizard.tsx` | Points bug fix; add toggle + upload photo mode to Step 3 |
| `functions/src/index.ts` | New `extractAnswerKey` callable function |
| `functions/src/shared/prompts.ts` | New `buildAnswerKeyExtractionPrompt()` |
| `src/lib/firebase.ts` | Export the new callable (if not already dynamic) |
