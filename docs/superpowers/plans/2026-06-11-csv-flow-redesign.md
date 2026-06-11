# CSV Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CSV upload flow so the system auto-detects assignment type from CSV content, supports optional metadata rows (QUESTION TEXT, POINTS), hides redundant form fields, and only shows skill inference when question text is available.

**Architecture:** The SetupWizard removes Assignment Type toggle and hides Total Points/Question Count for CSV uploads. The CsvUpload component auto-detects whether a CSV is scored (Name+Score) or objective (Name+Q columns+ANSWER KEY) and detects optional QUESTION TEXT and POINTS rows. The backend stores question text and per-question points. The analysis pipeline skips skill inference when no question text is provided, showing only scores/stats/outliers. Analysis display pages show a notice explaining why skills are unavailable.

**Tech Stack:** React 19, TypeScript, Firebase Cloud Functions, Firestore, Zod

---

### Task 1: Simplify SetupWizard for CSV Uploads

**Files:**
- Modify: `src/pages/SetupWizard.tsx:298-453` (StepDetails component)
- Modify: `src/pages/SetupWizard.tsx:836-837` (step labels)
- Modify: `src/pages/SetupWizard.tsx:1040-1054` (canAdvanceStep2)
- Modify: `src/pages/SetupWizard.tsx:1093-1103` (createAssignment doc fields)

- [ ] **Step 1: Hide Assignment Type toggle for CSV uploads**

In the `StepDetails` component (line 333), wrap the Assignment Type section so it only renders when `uploadMode !== 'csv'`:

```typescript
{/* Assignment Type — only for image uploads; CSV auto-detects */}
{uploadMode !== 'csv' && (
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
)}
```

- [ ] **Step 2: Hide Total Points and Question Count for CSV uploads**

Wrap both fields so they only render when `uploadMode !== 'csv'`:

```typescript
{/* Total Points — hidden for CSV (computed from file) */}
{uploadMode !== 'csv' && (
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
)}

{/* Question Count — hidden for CSV (computed from file) */}
{uploadMode !== 'csv' && (
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
)}
```

- [ ] **Step 3: Replace CSV guidance callout with unified message and template download**

Replace the CSV format guidance block (lines 371-395) with a single unified callout:

```typescript
{/* CSV format guidance with template download */}
{uploadMode === 'csv' && (
  <div className="bg-primary/5 border border-primary/15 rounded-[--radius-md] p-4">
    <p className="text-sm font-semibold text-primary mb-2">CSV Upload</p>
    <p className="text-xs text-muted-foreground leading-relaxed">
      ClassPulse auto-detects your CSV format. Two formats are supported:
    </p>
    <ul className="text-xs text-muted-foreground mt-2 space-y-1.5 list-disc list-inside">
      <li><strong>Already Scored:</strong> Student Name + Score columns</li>
      <li><strong>Grade For Me:</strong> Student Name + Q1, Q2, Q3... columns with an <strong>ANSWER KEY</strong> row</li>
    </ul>
    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
      Optional rows: <strong>QUESTION TEXT</strong> (enables skill analysis) and <strong>POINTS</strong> (per-question weighting, defaults to 1).
    </p>
    <div className="mt-3 flex items-center gap-3">
      <a
        href="/classpulse-csv-template.csv"
        download
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
      >
        <Download className="w-3.5 h-3.5" />
        Scored template
      </a>
      <a
        href="/classpulse-csv-template-detailed.csv"
        download
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
      >
        <Download className="w-3.5 h-3.5" />
        Grade For Me template
      </a>
    </div>
  </div>
)}
```

Add `Download` to the lucide-react import at the top of the file (line 17).

- [ ] **Step 4: Update canAdvanceStep2 for CSV uploads**

Update the `canAdvanceStep2` memo (line 1040). For CSV, only title is required:

```typescript
const canAdvanceStep2 = useMemo(() => {
  if (!title.trim()) return false;
  if (uploadMode === 'csv') return true; // CSV computes everything from the file
  if (isPathB) {
    if (!totalPoints || parseFloat(totalPoints) <= 0) return false;
    if (!questionCount || parseInt(questionCount, 10) <= 0) return false;
  }
  return true;
}, [title, isPathB, totalPoints, questionCount, uploadMode]);
```

- [ ] **Step 5: Update createAssignment for CSV uploads**

In the `createAssignment` function (line 1093), set `type` to `null` for CSV uploads (the backend determines type from the CSV data):

```typescript
const doc = {
  classId: selectedClassId,
  teacherId: user.uid,
  title: title.trim(),
  type: uploadMode === 'csv' ? null : (assignmentType === 'scored' ? 'scored' : 'objective'),
  date: new Date().toISOString().split('T')[0],
  totalPoints: uploadMode === 'csv' ? null : (totalPoints ? parseFloat(totalPoints) : null),
  questionCount: uploadMode === 'csv' ? null : (questionCount ? parseInt(questionCount, 10) : null),
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
```

- [ ] **Step 6: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
rtk git add src/pages/SetupWizard.tsx && rtk git commit -m "$(cat <<'EOF'
feat: simplify setup wizard for CSV uploads — auto-detect type, hide computed fields
EOF
)"
```

---

### Task 2: Auto-Detect CSV Type and Metadata Rows in CsvUpload

**Files:**
- Modify: `src/pages/Upload.tsx:612-733` (CsvUpload component — state, detection, handleFile)
- Modify: `src/pages/Upload.tsx:33-39` (AssignmentDoc interface)

- [ ] **Step 1: Remove assignmentType prop, add auto-detection state**

Change the CsvUpload function signature (line 612) to remove `assignmentType`:

```typescript
function CsvUpload({ assignmentId }: { assignmentId: string }) {
```

Add new state for auto-detected type and metadata rows after existing state (line 624):

```typescript
const [detectedType, setDetectedType] = useState<'scored' | 'objective' | null>(null);
const [questionTextRow, setQuestionTextRow] = useState<string[] | null>(null);
const [questionTextRowIndex, setQuestionTextRowIndex] = useState<number>(-1);
const [pointsRow, setPointsRow] = useState<string[] | null>(null);
const [pointsRowIndex, setPointsRowIndex] = useState<number>(-1);
```

- [ ] **Step 2: Update autoDetectMappings to work without type param**

Replace `autoDetectMappings` (line 658). It now auto-detects the type from headers:

```typescript
function autoDetectMappings(hdrs: string[]): { mappings: ColumnMapping[]; detected: 'scored' | 'objective' } {
  const namePatterns = /^(student|name|student.?name|full.?name|last.?name|first.?name)$/i;
  const scorePatterns = /^(score|grade|points|total|marks|result|percent|pct)$/i;
  const questionPatterns = /^(q|question\s*)\d+$/i;

  const hasQuestionCols = hdrs.some((h) => questionPatterns.test(h));
  const detected: 'scored' | 'objective' = hasQuestionCols ? 'objective' : 'scored';

  const mappings = hdrs.map((h) => {
    if (namePatterns.test(h)) return { column: h, mappedTo: 'student_name' };
    if (scorePatterns.test(h)) return { column: h, mappedTo: 'score' };
    if (hasQuestionCols && questionPatterns.test(h)) return { column: h, mappedTo: 'question_answer' };
    return { column: h, mappedTo: 'ignore' };
  });

  return { mappings, detected };
}
```

Note: Removed `#` from questionPatterns (`/^(q|question\s*)\d+$/i`) to avoid false positives with row-number columns like `#1`.

- [ ] **Step 3: Update handleFile with full metadata row detection**

Replace the handleFile function body after `parseCsv` (starting at line 695) with detection for all metadata rows:

```typescript
setFile(f);
setHeaders(parsed.headers);
setAllRows(parsed.rows);

// Auto-detect column mappings and type
const { mappings, detected } = autoDetectMappings(parsed.headers);
setColumnMappings(mappings);
setDetectedType(detected);

// Detect metadata rows (ANSWER KEY, QUESTION TEXT, POINTS)
const namePatterns = /^(student|name|student.?name|full.?name|last.?name|first.?name)$/i;
const nameIdx = parsed.headers.findIndex((h) => namePatterns.test(h));

let detectedKeyIdx = -1;
let detectedTextIdx = -1;
let detectedPointsIdx = -1;

if (nameIdx !== -1) {
  const keyPatterns = /^(answer\s*key|key|correct|answer)$/i;
  const textPatterns = /^(question\s*text|questions?|text|prompt)$/i;
  const pointsPatterns = /^(points?|weight|value|pts)$/i;

  for (let i = 0; i < parsed.rows.length; i++) {
    const cellValue = parsed.rows[i][nameIdx]?.trim() ?? '';
    if (keyPatterns.test(cellValue)) {
      detectedKeyIdx = i;
      setAnswerKeyRow(parsed.rows[i]);
      setAnswerKeyRowIndex(i);
    } else if (textPatterns.test(cellValue)) {
      detectedTextIdx = i;
      setQuestionTextRow(parsed.rows[i]);
      setQuestionTextRowIndex(i);
    } else if (pointsPatterns.test(cellValue)) {
      detectedPointsIdx = i;
      setPointsRow(parsed.rows[i]);
      setPointsRowIndex(i);
    }
  }
}

// Reset any metadata rows not found
if (detectedKeyIdx === -1) { setAnswerKeyRow(null); setAnswerKeyRowIndex(-1); }
if (detectedTextIdx === -1) { setQuestionTextRow(null); setQuestionTextRowIndex(-1); }
if (detectedPointsIdx === -1) { setPointsRow(null); setPointsRowIndex(-1); }

// Build preview excluding metadata rows
const metadataIndices = new Set(
  [detectedKeyIdx, detectedTextIdx, detectedPointsIdx].filter((i) => i >= 0)
);
const previewRows = parsed.rows.filter((_, i) => !metadataIndices.has(i));
const preview: CsvPreviewRow[] = previewRows.slice(0, 5).map((row) => {
  const obj: CsvPreviewRow = {};
  parsed.headers.forEach((h, i) => {
    obj[h] = row[i] ?? '';
  });
  return obj;
});
setRows(preview);
```

- [ ] **Step 4: Update hasRequiredMappings to use detectedType**

Replace the `hasRequiredMappings` block (line 770):

```typescript
const hasRequiredMappings =
  detectedType === 'objective'
    ? nameColIndex !== -1 && questionColIndices.length > 0 && answerKeyRow !== null
    : nameColIndex !== -1 && scoreColIndex !== -1;
```

- [ ] **Step 5: Update the CsvUpload call site in Upload component**

Update line 1228 to remove `assignmentType`:

```typescript
<CsvUpload assignmentId={id} />
```

Remove `type` from the `AssignmentDoc` interface (line 39) since the Upload page no longer needs it for CsvUpload. Keep the interface but remove the `type` field — it's not used elsewhere on this page:

```typescript
interface AssignmentDoc {
  sourceType: SourceType;
  classId: string;
  teacherId: string;
  status: string;
  imageUrls: string[];
}
```

- [ ] **Step 6: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
rtk git add src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: auto-detect CSV type and metadata rows (QUESTION TEXT, POINTS)
EOF
)"
```

---

### Task 3: Update handleProcess to Use Metadata Rows

**Files:**
- Modify: `src/pages/Upload.tsx:775-882` (handleProcess function)
- Modify: `src/pages/Upload.tsx:985-1050` (UI status indicators)

- [ ] **Step 1: Update handleProcess to include questionText and points**

Replace the `handleProcess` function (line 776). Key changes:
- Use `detectedType` instead of `assignmentType`
- Build answer key with `questionText` from the QUESTION TEXT row
- Build answer key with `points` from the POINTS row (default 1)
- For scored type: same as before

```typescript
async function handleProcess() {
  if (!hasRequiredMappings) {
    if (detectedType === 'objective') {
      toast('error', 'Ensure a student name column and question answer columns are mapped, and an ANSWER KEY row is present.');
    } else {
      toast('error', 'Map both a student name and score column.');
    }
    return;
  }

  setProcessing(true);
  try {
    let extractedStudents: object[];
    let answerKey: Array<{
      questionNumber: number;
      correctAnswer: string;
      points: number;
      questionText: string | null;
    }> | null = null;

    // Metadata row indices to exclude from student data
    const metadataIndices = new Set(
      [answerKeyRowIndex, questionTextRowIndex, pointsRowIndex].filter((i) => i >= 0)
    );

    if (detectedType === 'objective') {
      // Build answer key with optional questionText and points
      answerKey = questionColIndices.map((colIdx, i) => {
        const header = headers[colIdx];
        const num = parseInt(header.replace(/\D/g, ''), 10) || (i + 1);
        const correctAnswer = answerKeyRow![colIdx]?.trim() ?? '';
        const questionText = questionTextRow ? (questionTextRow[colIdx]?.trim() || null) : null;
        const pts = pointsRow ? (parseFloat(pointsRow[colIdx]?.trim() ?? '') || 1) : 1;
        return { questionNumber: num, correctAnswer, points: pts, questionText };
      });

      // Build students with per-question answers (excluding metadata rows)
      extractedStudents = allRows
        .filter((_, i) => !metadataIndices.has(i))
        .filter((row) => row[nameColIndex]?.trim())
        .map((row, i) => {
          const rawName = row[nameColIndex]?.trim() ?? '';
          const answers = questionColIndices.map((colIdx, j) => {
            const header = headers[colIdx];
            const num = parseInt(header.replace(/\D/g, ''), 10) || (j + 1);
            return {
              questionNumber: num,
              extractedAnswer: row[colIdx]?.trim() ?? '',
              confidence: 1.0,
              multipleAnswersDetected: false,
            };
          });

          return {
            extractionIndex: i,
            sourceImageIndex: 0,
            rawName,
            nameConfidence: 1.0,
            answers,
            totalScore: { raw: '0', normalized: 0, confidence: 1.0 },
            flags: [],
          };
        });
    } else {
      // Scored assignment: existing logic
      extractedStudents = allRows
        .filter((row) => row[nameColIndex]?.trim())
        .map((row, i) => {
          const rawName = row[nameColIndex]?.trim() ?? '';
          const rawScore = row[scoreColIndex]?.trim() ?? '0';
          const scoreNum = parseFloat(rawScore) || 0;
          return {
            extractionIndex: i,
            sourceImageIndex: 0,
            rawName,
            nameConfidence: 1.0,
            answers: [],
            totalScore: {
              raw: rawScore,
              normalized: scoreNum > 1 ? scoreNum / 100 : scoreNum,
              confidence: 1.0,
            },
            flags: [],
          };
        });
    }

    await updateDoc(doc(db, 'assignments', assignmentId), {
      status: 'processing_images',
    });

    const runCsvExtraction = httpsCallable(functions, 'runCsvExtraction');
    await runCsvExtraction({
      assignmentId,
      extractedStudents,
      metadata: {
        totalExtracted: extractedStudents.length,
        imagesProcessed: 0,
        partialPapersDetected: false,
        processingTimeMs: 0,
      },
      ...(answerKey ? { answerKey } : {}),
    });

    navigate(`/analysis/${assignmentId}/review`);
  } catch {
    toast('error', 'Failed to process CSV. Please try again.');
  } finally {
    setProcessing(false);
  }
}
```

- [ ] **Step 2: Update UI status indicators to use detectedType**

Replace all references to `assignmentType` in the CsvUpload JSX with `detectedType`. Key areas:

1. The column mapping dropdown's `question_answer` option (around line 996):
```typescript
{detectedType === 'objective' && (
  <option value="question_answer">Question Answer</option>
)}
```

2. The ready-to-process banner (around line 1012):
```typescript
{hasRequiredMappings && (
  <div className="bg-success/10 border border-success/20 rounded-[--radius-md] p-3">
    <p className="text-sm text-success font-medium">Ready to process</p>
    <p className="text-xs text-success mt-1">
      {detectedType === 'objective'
        ? `${allRows.filter((_, i) => !new Set([answerKeyRowIndex, questionTextRowIndex, pointsRowIndex].filter(x => x >= 0)).has(i)).filter(r => r[nameColIndex]?.trim()).length} students · ${questionColIndices.length} questions detected.`
        : `${allRows.filter((r) => r[nameColIndex]?.trim()).length} students detected.`}
    </p>
  </div>
)}
```

3. The not-ready warning (around line 1020):
```typescript
{!hasRequiredMappings && file && (
  <div className="flex items-center gap-2 text-sm text-warning">
    <AlertCircle className="w-4 h-4 flex-shrink-0" />
    {detectedType === 'objective'
      ? 'Map a student name column and at least one question answer column. An ANSWER KEY row is required.'
      : 'Map both a student name column and a score column to continue.'}
  </div>
)}
```

4. The answer key status (around line 1030):
```typescript
{detectedType === 'objective' && file && (
  answerKeyRow ? (
    <div className="bg-success/10 border border-success/20 rounded-[--radius-md] p-3">
      <p className="text-sm text-success font-medium">Answer key detected</p>
      {questionTextRow && (
        <p className="text-xs text-success mt-0.5">Question text detected — skill analysis will be available.</p>
      )}
      {pointsRow && (
        <p className="text-xs text-success mt-0.5">Per-question points detected.</p>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-2 text-sm text-warning">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      No answer key row found. Add a row with "ANSWER KEY" in the name column.
    </div>
  )
)}
```

5. The detected type badge — add a new indicator after the file is loaded to show what type was auto-detected:
```typescript
{file && detectedType && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span className="font-medium">Detected format:</span>
    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
      {detectedType === 'objective' ? 'Grade For Me' : 'Already Scored'}
    </span>
  </div>
)}
```

6. The upload instruction text (around line 879):
```typescript
<p className="text-sm text-muted-foreground">
  Upload a CSV, TSV, or spreadsheet file with student data (max 5 MB).
</p>
```

(Remove the type-specific text since auto-detection handles it.)

- [ ] **Step 3: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
rtk git add src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: use metadata rows in handleProcess, update UI for auto-detected type
EOF
)"
```

---

### Task 4: Backend — Store Question Text and Points, Compute Totals

**Files:**
- Modify: `functions/src/index.ts:375-434` (runCsvExtraction)

- [ ] **Step 1: Update runCsvExtraction to accept and store questionText and points**

Update the `answerKey` type in the destructuring (line 377):

```typescript
const { assignmentId, extractedStudents, metadata, answerKey } = request.data as {
  assignmentId: string;
  extractedStudents: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  answerKey?: Array<{
    questionNumber: number;
    correctAnswer: string;
    points?: number;
    questionText?: string | null;
  }>;
};
```

Update the answer key storage block (line 416) to include questionText and compute totals:

```typescript
if (answerKey && answerKey.length > 0) {
  const totalPoints = answerKey.reduce((sum, q) => sum + (q.points ?? 1), 0);
  const questionCount = answerKey.length;
  const hasQuestionText = answerKey.some((q) => q.questionText);

  updateData['answerKey'] = {
    source: 'csv',
    questions: answerKey.map((q) => ({
      questionNumber: q.questionNumber,
      correctAnswer: q.correctAnswer,
      points: q.points ?? 1,
      questionText: q.questionText ?? null,
      answerChoices: null,
      extraCredit: false,
    })),
  };
  updateData['type'] = 'objective';
  updateData['totalPoints'] = totalPoints;
  updateData['questionCount'] = questionCount;
  updateData['csvHasQuestionText'] = hasQuestionText;
} else {
  // Scored CSV — set type if not already set
  updateData['type'] = 'scored';
}
```

- [ ] **Step 2: Verify functions build**

Run: `cd functions && rtk tsc`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
rtk git add functions/src/index.ts && rtk git commit -m "$(cat <<'EOF'
feat: store question text and per-question points from CSV, compute totals
EOF
)"
```

---

### Task 5: Skip Skill Inference When No Question Text

**Files:**
- Modify: `functions/src/index.ts:607-714` (runAnalysis — skill inference stage)

- [ ] **Step 1: Add question text check before skill inference**

In `runAnalysis`, after the `hasPerQuestionData` check (line 618), add a check for whether meaningful question context exists. If the assignment is a CSV upload with no question text, skip skill inference:

```typescript
if (hasPerQuestionData) {
  // Check if we have meaningful question context for skill inference
  const hasQuestionContext =
    assignment.csvHasQuestionText ||
    assignment.sourceType === 'image' ||
    (assignment.answerKey?.questions || []).some(
      (q: Record<string, unknown>) => q.questionText
    );

  if (!hasQuestionContext) {
    console.log('[runAnalysis] Skipping skill inference — CSV upload with no question text');
    // Store a flag so the frontend knows skills were skipped
    await db.collection('assignments').doc(assignmentId).update({
      'pipelineState.skillInferenceSkipped': true,
      'pipelineState.skillInferenceSkipReason': 'No question text provided in CSV. Add a QUESTION TEXT row to enable skill analysis.',
    });
  } else {
    // Existing skill inference code (lines 620-713)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questions: any[] = [];
    // ... (keep all existing code unchanged)
  }
}
```

The key change is wrapping the existing skill inference block (lines 620-713) inside an `if (hasQuestionContext)` check. The `else` block stores a skip flag. The rest of the `runAnalysis` function (stats, analysis prompt, skill mastery) continues as-is — `skillInferenceResult` stays `null` when skipped, so `skillMasteryResult` stays `null` too, and the analysis output has no `skillBreakdown`.

- [ ] **Step 2: Verify functions build**

Run: `cd functions && rtk tsc`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
rtk git add functions/src/index.ts && rtk git commit -m "$(cat <<'EOF'
feat: skip skill inference for CSV uploads without question text
EOF
)"
```

---

### Task 6: Show "Skills Unavailable" Notice on Analysis Page

**Files:**
- Modify: `src/pages/ClassOverview.tsx:269-270` (skill breakdown section)

- [ ] **Step 1: Add notice when skill breakdown is empty and assignment is CSV**

The analysis page already guards `{skillBreakdown.length > 0 && (...)}` (line 270), so skills silently vanish when skipped. Add a notice when skills are empty. Read the analysis doc to check if inference was skipped.

After the existing `{skillBreakdown.length > 0 && (...)}` section (around line 270), add a fallback:

```typescript
{skillBreakdown.length === 0 && (
  <section className="bg-card border border-border rounded-[--radius-md] p-6">
    <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
      Skill Breakdown
    </h2>
    <div className="bg-amber-50 border border-amber-200 rounded-[--radius-md] p-4">
      <p className="text-sm text-amber-800 font-medium">Skill analysis not available</p>
      <p className="text-xs text-amber-700 mt-1">
        This CSV upload only included answer letters — no question text was provided.
        To enable skill breakdowns, add a <strong>QUESTION TEXT</strong> row to your CSV with what each question asks.
      </p>
    </div>
  </section>
)}
```

- [ ] **Step 2: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/ClassOverview.tsx && rtk git commit -m "$(cat <<'EOF'
feat: show skill analysis unavailable notice for CSV uploads without question text
EOF
)"
```

---

### Task 7: Update CSV Templates and Test Data

**Files:**
- Modify: `public/classpulse-csv-template.csv` (no changes needed — already correct for scored)
- Modify: `public/classpulse-csv-template-detailed.csv` (add QUESTION TEXT and POINTS rows)
- Modify: all 12 `test-data/*.csv` files (vary format, question count, add metadata rows to some)
- Modify: `test-data/README.md`

- [ ] **Step 1: Update the detailed CSV template**

Replace `public/classpulse-csv-template-detailed.csv` to show all optional rows:

```csv
Student Name,Q1,Q2,Q3,Q4,Q5
QUESTION TEXT,What is 3+4?,Which is a noun?,Capital of France?,5 x 6 = ?,Largest planet?
ANSWER KEY,7,dog,Paris,30,Jupiter
POINTS,1,1,2,1,2
Emma Johnson,7,dog,Paris,30,Jupiter
Marcus Rivera,7,cat,Paris,30,Saturn
Sophia Chen,8,dog,London,30,Jupiter
Liam Carter,7,dog,Paris,25,Jupiter
Ava Mitchell,6,dog,Paris,30,Mars
```

- [ ] **Step 2: Rewrite test-data CSVs with variety**

Rewrite the 12 Grade For Me CSVs plus 3 Already Scored CSVs. The key changes:
- Vary question counts (some 8, some 10, some 12, some 15)
- Add QUESTION TEXT row to some CSVs (not all)
- Add POINTS row to some CSVs (with varying point values)
- Keep some CSVs as answer-only (no question text) to test the "skills unavailable" flow

**5th Grade Math (Q text + points on unit1, plain on unit2/3):**

`test-data/5thgrade-unit1-test.csv` (7 students, 8 questions, WITH question text and points):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8
QUESTION TEXT,What is 3/4 + 1/4?,Simplify 6/8,12 x 15 = ?,What is 25% of 80?,Round 3.456 to nearest tenth,Area of rectangle 5x8,Which fraction equals 0.5?,Order: 0.3 0.31 0.29
ANSWER KEY,1,3/4,180,20,3.5,40,1/2,"0.29, 0.3, 0.31"
POINTS,1,1,2,2,1,2,1,2
Ava Mitchell,1,3/4,180,20,3.5,40,1/2,"0.29, 0.3, 0.31"
Ben Harrison,1,3/4,180,15,3.5,40,1/4,"0.3, 0.29, 0.31"
Chloe Ramirez,1,3/4,180,20,3.5,35,1/2,"0.29, 0.3, 0.31"
Diego Fernandez,1,3/4,150,20,3.4,40,1/2,"0.29, 0.31, 0.3"
Emily Watson,1,3/4,180,20,3.5,40,1/2,"0.29, 0.3, 0.31"
Finn O'Connor,1,2/4,180,25,3.5,45,1/3,"0.3, 0.31, 0.29"
Giselle Laurent,1,3/4,180,20,3.5,40,1/2,"0.3, 0.29, 0.31"
```

`test-data/5thgrade-unit2-test.csv` (7 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,B,D,A,C,B,D,A,C,B,D
Ava Mitchell,B,D,A,C,B,D,A,C,A,A
Ben Harrison,B,D,A,C,A,D,A,D,B,A
Chloe Ramirez,B,D,A,C,B,D,A,C,B,A
Diego Fernandez,B,D,A,C,A,D,A,D,B,A
Emily Watson,B,D,A,C,B,D,A,C,B,D
Finn O'Connor,B,D,A,A,B,A,C,C,A,A
Giselle Laurent,B,D,A,C,B,D,A,C,B,A
```

`test-data/5thgrade-unit3-test.csv` (7 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,A,C,D,B,A,C,D,B,A,C
Ava Mitchell,A,C,D,B,A,C,D,A,A,D
Ben Harrison,A,C,D,B,A,C,A,B,D,D
Chloe Ramirez,A,C,D,B,A,C,D,B,D,C
Diego Fernandez,A,C,D,B,A,C,A,A,A,D
Emily Watson,A,C,D,B,A,C,D,B,A,D
Finn O'Connor,A,D,D,B,C,A,D,B,D,D
Giselle Laurent,A,C,D,B,A,C,D,B,A,C
```

**3rd Grade Reading (Q text on vocab, plain on others):**

`test-data/3rdreading-vocab-test.csv` (10 students, 8 questions, WITH question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8
QUESTION TEXT,What does 'enormous' mean?,Opposite of 'ancient',Which word means 'to make better'?,Synonym for 'brave',What does 'migrate' mean?,Root word of 'unhappiness','Predict' means to ___,Which word is a compound word?
ANSWER KEY,very large,modern,improve,courageous,move to a new place,happy,tell beforehand,sunflower
Emma Wilson,very large,modern,improve,courageous,move to a new place,happy,tell beforehand,sunflower
Lucas Brown,very large,modern,improve,strong,travel far,happy,guess,sunflower
Sophia Garcia,very large,modern,improve,courageous,move to a new place,happy,tell beforehand,sunflower
Noah Martinez,big,modern,improve,courageous,fly south,happiness,tell beforehand,sunflower
Olivia Davis,very large,modern,improve,courageous,move to a new place,happy,guess,daisy
Isabella Rodriguez,very large,old,improve,courageous,move to a new place,happy,tell beforehand,sunflower
Liam Johnson,very large,modern,fix,strong,move to a new place,sad,tell beforehand,sunflower
Mia Anderson,very large,modern,improve,courageous,move to a new place,happy,tell beforehand,sunflower
Ethan Taylor,very large,modern,improve,courageous,move to a new place,happy,guess,sunflower
Ava Thomas,very large,modern,improve,courageous,travel far,happy,tell beforehand,daisy
```

`test-data/3rdreading-comprehension-quiz.csv` (10 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,C,D,A,B,C,D,A,B,C,D
Emma Wilson,C,D,A,B,C,D,A,B,A,D
Lucas Brown,C,D,A,A,C,D,A,D,A,A
Sophia Garcia,C,D,A,B,C,D,A,B,C,D
Noah Martinez,C,D,A,A,C,D,A,B,A,D
Olivia Davis,C,D,A,B,C,D,A,B,A,A
Isabella Rodriguez,C,D,A,B,C,D,A,B,A,D
Liam Johnson,C,D,A,A,A,D,A,B,C,D
Mia Anderson,C,D,A,B,C,D,A,B,C,D
Ethan Taylor,C,D,A,B,C,A,A,B,A,D
Ava Thomas,C,D,A,B,C,D,A,B,C,A
```

`test-data/3rdreading-midterm.csv` (10 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,D,B,C,A,D,B,C,A,D,B
Emma Wilson,D,B,C,A,D,B,C,A,D,A
Lucas Brown,D,B,C,A,A,B,C,A,A,D
Sophia Garcia,D,B,C,A,D,B,C,A,A,A
Noah Martinez,D,B,C,A,A,A,C,A,D,D
Olivia Davis,D,B,C,A,D,B,C,A,D,B
Isabella Rodriguez,D,B,C,A,D,B,C,A,A,A
Liam Johnson,D,B,C,A,A,A,C,D,D,D
Mia Anderson,D,B,C,A,D,B,C,A,D,B
Ethan Taylor,D,B,C,A,D,B,C,D,A,D
Ava Thomas,D,B,C,A,D,B,C,A,D,A
```

**6th Grade Science (Q text + points on lab-report1, plain on others):**

`test-data/6thscience-lab-report1.csv` (12 students, 12 questions, WITH question text and weighted points):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10,Q11,Q12
QUESTION TEXT,Name the independent variable,Name the dependent variable,What is a control group?,State your hypothesis,Did the data support the hypothesis?,What tool measures mass?,What unit measures liquid volume?,Define observation vs inference,What is the first step of scientific method?,Name one source of error,Why do we repeat trials?,What could improve this experiment?
ANSWER KEY,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,ask a question,measurement error,increase reliability,larger sample size
POINTS,1,1,2,1,2,1,1,2,1,2,2,2
Jackson Lee,sunlight,plant height,group with no change,B,yes,scale,milliliters,observation uses senses,ask a question,none,increase reliability,more plants
Harper Kim,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,ask a question,measurement error,increase reliability,larger sample size
Aiden Nguyen,light,growth,group with no change,A,no,balance,liters,both use senses,hypothesis,spilling,get more data,more time
Riley Patel,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,ask a question,measurement error,increase reliability,larger sample size
Carter Singh,sunlight,plant height,control has no change,B,yes,balance,milliliters,observation uses senses,ask a question,human error,reduce variables,more plants
Zoey Chen,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,ask a question,measurement error,increase reliability,more plants
Mason Ali,light,growth,unchanged group,A,no,thermometer,liters,same thing,observe,none,do it again,better tools
Lily Okafor,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,ask a question,measurement error,increase reliability,larger sample size
Owen Brooks,sunlight,plant height,group with no change,B,yes,balance,mL,observation uses senses,ask a question,temperature,increase accuracy,control temperature
Chloe Rivera,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,research,measurement error,increase reliability,larger sample size
Elijah Foster,sunlight,plant height,control group,B,yes,balance,milliliters,observation uses senses,ask a question,human error,increase reliability,more plants
Nora Washington,sunlight,plant height,group with no change,B,yes,balance,milliliters,observation uses senses,ask a question,measurement error,increase reliability,larger sample size
```

`test-data/6thscience-chapter-test.csv` (12 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,D,A,C,B,D,A,C,B,D,A
Jackson Lee,D,A,C,B,D,A,C,B,D,D
Harper Kim,D,A,C,B,D,A,C,B,D,A
Aiden Nguyen,D,A,C,B,A,D,C,A,D,D
Riley Patel,D,A,C,B,D,A,C,B,A,A
Carter Singh,D,A,C,B,D,A,C,D,A,D
Zoey Chen,D,A,C,B,D,A,C,B,D,A
Mason Ali,D,A,C,B,A,D,A,B,D,D
Lily Okafor,D,A,C,B,D,A,C,B,D,A
Owen Brooks,D,A,C,A,D,A,C,D,A,D
Chloe Rivera,D,A,C,B,D,A,C,B,A,D
Elijah Foster,D,A,C,B,D,A,C,A,D,D
Nora Washington,D,A,C,B,D,A,C,B,A,A
```

`test-data/6thscience-lab-report2.csv` (12 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,C,B,D,A,C,B,D,A,C,B
Jackson Lee,C,B,D,A,C,B,D,A,A,D
Harper Kim,C,B,D,A,C,B,D,A,C,B
Aiden Nguyen,C,B,D,A,A,D,D,A,A,D
Riley Patel,C,B,D,A,C,B,D,A,C,B
Carter Singh,C,B,D,A,C,B,D,A,A,D
Zoey Chen,C,B,D,A,C,B,D,A,A,B
Mason Ali,C,B,D,A,A,D,D,A,A,D
Lily Okafor,C,B,D,A,C,B,D,A,C,B
Owen Brooks,C,B,D,A,C,B,A,A,A,D
Chloe Rivera,C,B,D,A,C,B,D,A,A,D
Elijah Foster,C,B,D,A,C,B,D,A,C,D
Nora Washington,C,B,D,A,C,B,D,A,C,B
```

**Feezle Class (Q text on midterm, weighted points on chapter6, plain on chapter5):**

`test-data/feezle-midterm-exam.csv` (14 students, 15 questions, WITH question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10,Q11,Q12,Q13,Q14,Q15
QUESTION TEXT,What is the main idea of paragraph 2?,Which word means 'to show'?,What can you infer about the character?,Which detail supports the main idea?,What is the author's purpose?,What does 'reluctant' mean?,Compare the two settings,Which event happened first?,What is the theme of the story?,Summarize the passage in one sentence,What is the narrator's point of view?,Which is a fact not an opinion?,What text structure is used?,What is the meaning of the prefix 'un-'?,Predict what happens next
ANSWER KEY,B,D,A,C,B,D,A,C,B,D,A,C,B,D,A
Zoe Adams,B,D,D,A,D,A,D,C,D,A,A,C,D,D,A
James Turner,B,D,D,A,A,D,D,C,D,A,A,C,D,A,C
Charlotte Lewis,B,D,A,C,B,A,D,C,D,A,A,C,B,D,A
Mia Thomas,B,D,A,C,B,D,D,C,D,A,A,A,B,D,A
Ava Mitchell,B,D,A,C,B,D,A,A,D,A,A,C,B,D,C
Mason Davis,B,D,A,C,B,D,D,A,D,A,A,C,B,D,C
Isabella Brooks,B,D,A,C,B,D,A,C,D,D,A,C,B,D,C
Aiden Patel,B,D,A,C,B,D,A,C,D,A,A,C,B,D,A
Olivia Jenkins,B,D,A,C,B,D,A,C,A,D,A,C,B,D,C
Noah Kim,B,D,A,C,B,D,A,C,B,A,A,C,B,D,A
Ethan Walker,B,D,A,C,B,D,A,C,B,A,A,C,B,D,A
Sophia Williams,B,D,A,C,B,D,A,C,A,D,A,C,B,D,C
Liam Carter,B,D,A,C,B,D,A,C,B,D,A,C,B,D,A
Emma Robinson,B,D,A,C,B,D,A,C,B,A,A,C,B,D,A
```

`test-data/feezle-chapter5-quiz.csv` (14 students, 10 questions, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,A,C,D,B,A,C,D,B,A,C
Zoe Adams,A,C,D,A,D,A,D,A,D,A
James Turner,A,C,D,A,A,C,D,A,D,A
Charlotte Lewis,A,C,D,B,A,C,D,A,A,D
Mia Thomas,A,C,D,B,A,C,D,A,A,A
Ava Mitchell,A,C,D,B,A,C,D,A,A,D
Mason Davis,A,C,D,B,A,C,D,B,A,D
Isabella Brooks,A,C,D,B,A,C,D,B,A,C
Aiden Patel,A,C,D,B,A,C,D,B,A,D
Olivia Jenkins,A,C,D,B,A,C,D,B,A,C
Noah Kim,A,C,D,B,A,C,D,B,A,A
Ethan Walker,A,C,D,B,A,C,D,B,A,A
Sophia Williams,A,C,D,B,A,C,D,B,A,D
Liam Carter,A,C,D,B,A,C,D,B,A,D
Emma Robinson,A,C,D,B,A,C,D,B,A,C
```

`test-data/feezle-chapter6-quiz.csv` (14 students, 12 questions, WITH weighted points, NO question text):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10,Q11,Q12
ANSWER KEY,C,A,B,D,C,A,B,D,C,A,B,D
POINTS,1,1,1,2,1,1,1,2,1,1,1,2
Zoe Adams,C,A,B,D,A,D,D,A,A,D,B,A
James Turner,C,A,B,D,C,A,D,A,A,D,B,D
Charlotte Lewis,C,A,B,D,C,A,B,D,C,D,B,D
Mia Thomas,C,A,B,D,C,A,B,A,A,D,B,D
Ava Mitchell,C,A,B,D,C,A,B,D,A,D,B,D
Mason Davis,C,A,B,D,C,A,B,D,A,D,A,D
Isabella Brooks,C,A,B,D,C,A,B,D,A,A,B,D
Aiden Patel,C,A,B,D,C,A,B,D,C,D,B,D
Olivia Jenkins,C,A,B,D,C,A,B,D,C,D,B,D
Noah Kim,C,A,B,D,C,A,B,D,C,A,B,D
Ethan Walker,C,A,B,D,C,A,B,D,C,A,B,D
Sophia Williams,C,A,B,D,C,A,B,D,A,D,B,D
Liam Carter,C,A,B,D,C,A,B,D,C,A,B,D
Emma Robinson,C,A,B,D,C,A,B,D,C,A,B,D
```

Already Scored CSVs — keep existing `*-scored.csv` files unchanged.

- [ ] **Step 3: Update test-data README**

Replace `test-data/README.md`:

```markdown
# Test Data CSVs

Upload these via **+ New Analysis** > choose **CSV / Spreadsheet** upload mode.

## CSV Formats

ClassPulse auto-detects the format:

- **Already Scored** (`*-scored.csv`): `Student Name, Score` columns only
- **Grade For Me** (default): `Student Name, Q1, Q2...` columns with an `ANSWER KEY` row

### Optional metadata rows (Grade For Me only)
- **QUESTION TEXT** — what each question asks (enables skill analysis)
- **POINTS** — per-question point values (defaults to 1 each if omitted)

CSVs with question text get full skill breakdowns. CSVs without get scores, distribution, and outliers only.

## Existing Classes

### Ms. Feezle's Class - 4th Period (14 students)
- `feezle-midterm-exam.csv` — Midterm, 15 questions, WITH question text
- `feezle-midterm-exam-scored.csv` — Midterm, Already Scored
- `feezle-chapter5-quiz.csv` — Chapter 5 Quiz, 10 questions, no question text
- `feezle-chapter6-quiz.csv` — Chapter 6 Quiz, 12 questions, weighted points

### 5th Grade Math - 2nd Period (7 students)
- `5thgrade-unit1-test.csv` — Unit 1, 8 questions, WITH question text + weighted points
- `5thgrade-unit1-test-scored.csv` — Unit 1, Already Scored
- `5thgrade-unit2-test.csv` — Unit 2, 10 questions, no question text
- `5thgrade-unit3-test.csv` — Unit 3, 10 questions, no question text

## New Classes (create first, then upload)

### 3rd Grade Reading - 1st Period
Roster: Emma Wilson, Lucas Brown, Sophia Garcia, Noah Martinez, Olivia Davis, Isabella Rodriguez, Liam Johnson, Mia Anderson, Ethan Taylor, Ava Thomas
- `3rdreading-vocab-test.csv` — Vocabulary, 8 questions, WITH question text
- `3rdreading-vocab-test-scored.csv` — Vocabulary, Already Scored
- `3rdreading-comprehension-quiz.csv` — Comprehension, 10 questions, no question text
- `3rdreading-midterm.csv` — Midterm, 10 questions, no question text

### 6th Grade Science - 3rd Period
Roster: Jackson Lee, Harper Kim, Aiden Nguyen, Riley Patel, Carter Singh, Zoey Chen, Mason Ali, Lily Okafor, Owen Brooks, Chloe Rivera, Elijah Foster, Nora Washington
- `6thscience-lab-report1.csv` — Lab Report #1, 12 questions, WITH question text + weighted points
- `6thscience-chapter-test.csv` — Chapter Test, 10 questions, no question text
- `6thscience-lab-report2.csv` — Lab Report #2, 10 questions, no question text
```

- [ ] **Step 4: Commit**

```bash
rtk git add public/classpulse-csv-template-detailed.csv test-data/ && rtk git commit -m "$(cat <<'EOF'
feat: update CSV templates and test data with question text, weighted points, varying question counts
EOF
)"
```

---

### Task 8: Deploy and Verify

**Files:** None (deployment + verification)

- [ ] **Step 1: Build frontend**

Run: `rtk tsc`
Expected: No errors.

- [ ] **Step 2: Build functions**

Run: `cd functions && rtk tsc`
Expected: No errors.

- [ ] **Step 3: Deploy all**

Run: `firebase deploy --only functions,hosting`
Expected: Successful deployment.

- [ ] **Step 4: Commit any fixes**

If any issues found during deployment, fix and commit.
