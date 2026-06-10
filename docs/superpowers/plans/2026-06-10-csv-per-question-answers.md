# CSV Per-Question Answer Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable teachers to upload CSVs with per-question answer data (Q1, Q2... columns + ANSWER KEY row) so the full grading/skill/misconception pipeline runs on CSV uploads, not just image uploads.

**Architecture:** The `CsvUpload` component gains a new `question_answer` column mapping type and answer key row detection. When assignment type is `objective`, it builds `answers[]` per student and passes `answerKey` to `runCsvExtraction`. The backend stores the answer key on the assignment doc so `submitValidation` can call `gradeStudents()` (existing code). No changes needed to submitValidation, gradeStudents, or runAnalysis.

**Tech Stack:** React 19, TypeScript, Firebase Cloud Functions, Firestore

---

### Task 1: Add `type` to AssignmentDoc and Pass to CsvUpload

**Files:**
- Modify: `src/pages/Upload.tsx:33-38` (AssignmentDoc interface)
- Modify: `src/pages/Upload.tsx:611` (CsvUpload props)
- Modify: `src/pages/Upload.tsx:1114` (CsvUpload usage)

- [ ] **Step 1: Add `type` field to AssignmentDoc interface**

In `src/pages/Upload.tsx`, update the `AssignmentDoc` interface (line 33):

```typescript
interface AssignmentDoc {
  sourceType: SourceType;
  classId: string;
  teacherId: string;
  status: string;
  imageUrls: string[];
  type?: 'scored' | 'objective';
}
```

- [ ] **Step 2: Update CsvUpload to accept assignmentType prop**

Change the CsvUpload function signature (line 611):

```typescript
function CsvUpload({ assignmentId, assignmentType }: { assignmentId: string; assignmentType: 'scored' | 'objective' }) {
```

- [ ] **Step 3: Pass assignmentType from Upload to CsvUpload**

Update the CsvUpload usage in the main Upload component (line 1114):

```typescript
<CsvUpload assignmentId={id} assignmentType={assignment.type ?? 'scored'} />
```

- [ ] **Step 4: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
rtk git add src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: pass assignment type to CsvUpload component
EOF
)"
```

---

### Task 2: Add `question_answer` Column Mapping and Auto-Detection

**Files:**
- Modify: `src/pages/Upload.tsx:55-58` (ColumnMapping type)
- Modify: `src/pages/Upload.tsx:654-664` (autoDetectMappings)
- Modify: `src/pages/Upload.tsx:914-922` (column mapping dropdown)

- [ ] **Step 1: Add question_answer to column mapping options**

The `ColumnMapping` interface (line 55) already uses `string` union. No type change needed. Update the column mapping dropdown (line 914) to include the new option:

```typescript
<select
  value={m.mappedTo}
  onChange={(e) => updateMapping(i, e.target.value)}
  className="flex-1 px-2 py-1.5 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 bg-card"
>
  <option value="ignore">Ignore</option>
  <option value="student_name">Student Name</option>
  <option value="score">Score</option>
  {assignmentType === 'objective' && (
    <option value="question_answer">Question Answer</option>
  )}
</select>
```

- [ ] **Step 2: Update autoDetectMappings to detect question columns**

Update `autoDetectMappings` (line 654) to accept the assignment type and detect question columns:

```typescript
function autoDetectMappings(hdrs: string[], type: 'scored' | 'objective'): ColumnMapping[] {
  const namePatterns = /^(student|name|student.?name|full.?name|last.?name|first.?name)$/i;
  const scorePatterns = /^(score|grade|points|total|marks|result|percent|pct)$/i;
  const questionPatterns = /^(q|#|question\s*)\d+$/i;

  return hdrs.map((h) => {
    if (namePatterns.test(h)) return { column: h, mappedTo: 'student_name' };
    if (scorePatterns.test(h)) return { column: h, mappedTo: 'score' };
    if (type === 'objective' && questionPatterns.test(h)) return { column: h, mappedTo: 'question_answer' };
    return { column: h, mappedTo: 'ignore' };
  });
}
```

- [ ] **Step 3: Update autoDetectMappings call site**

Update the call in `handleFile` (line 705):

```typescript
setColumnMappings(autoDetectMappings(parsed.headers, assignmentType));
```

- [ ] **Step 4: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
rtk git add src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: add question_answer column mapping with auto-detection
EOF
)"
```

---

### Task 3: Answer Key Row Detection and Extraction

**Files:**
- Modify: `src/pages/Upload.tsx` (CsvUpload component — new state + detection logic)

- [ ] **Step 1: Add answer key state and detection**

After the existing state declarations in CsvUpload (around line 621), add:

```typescript
const [answerKeyRow, setAnswerKeyRow] = useState<string[] | null>(null);
const [answerKeyRowIndex, setAnswerKeyRowIndex] = useState<number>(-1);
```

- [ ] **Step 2: Add answer key detection in handleFile**

After `setColumnMappings(autoDetectMappings(...))` (around line 705), add answer key detection. The answer key is detected from the parsed rows, not the preview:

```typescript
// Detect answer key row
if (type === 'objective') {
  const keyPatterns = /^(answer\s*key|key|correct|answer)$/i;
  const nameIdx = parsed.headers.findIndex((h) => namePatterns.test(h));
  if (nameIdx !== -1) {
    const keyIdx = parsed.rows.findIndex((row) => keyPatterns.test(row[nameIdx]?.trim() ?? ''));
    if (keyIdx !== -1) {
      setAnswerKeyRow(parsed.rows[keyIdx]);
      setAnswerKeyRowIndex(keyIdx);
    }
  }
}
```

Wait — this requires `type` which is `assignmentType`. And `namePatterns` is local to `autoDetectMappings`. Let me restructure. The answer key detection needs to happen inside `handleFile`, using the assignment type prop. Here's the complete updated `handleFile`:

After the `setColumnMappings(autoDetectMappings(parsed.headers, assignmentType));` line, add:

```typescript
// Detect answer key row for objective assignments
if (assignmentType === 'objective') {
  const namePatterns = /^(student|name|student.?name|full.?name|last.?name|first.?name)$/i;
  const nameIdx = parsed.headers.findIndex((h) => namePatterns.test(h));
  if (nameIdx !== -1) {
    const keyPatterns = /^(answer\s*key|key|correct|answer)$/i;
    const keyIdx = parsed.rows.findIndex((row) => keyPatterns.test(row[nameIdx]?.trim() ?? ''));
    if (keyIdx !== -1) {
      setAnswerKeyRow(parsed.rows[keyIdx]);
      setAnswerKeyRowIndex(keyIdx);
    } else {
      setAnswerKeyRow(null);
      setAnswerKeyRowIndex(-1);
    }
  }
} else {
  setAnswerKeyRow(null);
  setAnswerKeyRowIndex(-1);
}
```

- [ ] **Step 3: Show answer key detection status in the UI**

After the existing score normalization preview section (line 932), add an answer key status indicator. This goes right after the `hasRequiredMappings` green banner:

```typescript
{/* Answer key status for objective assignments */}
{assignmentType === 'objective' && file && (
  answerKeyRow ? (
    <div className="bg-success/10 border border-success/20 rounded-[--radius-md] p-3">
      <p className="text-sm text-success font-medium">Answer key detected</p>
      <p className="text-xs text-success mt-1">
        Row "{answerKeyRow[nameColIndex]}" will be used as the answer key and excluded from student data.
      </p>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-sm text-warning">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      No answer key row found. Add a row with "ANSWER KEY" in the name column.
    </div>
  )
)}
```

- [ ] **Step 4: Exclude answer key row from preview**

Update the preview generation in `handleFile` (line 695). The preview should skip the answer key row:

```typescript
// Preview first 5 rows (excluding answer key row)
const previewRows = parsed.rows.filter((_, i) => i !== keyIdx);
const preview: CsvPreviewRow[] = previewRows.slice(0, 5).map((row) => {
  const obj: CsvPreviewRow = {};
  parsed.headers.forEach((h, i) => {
    obj[h] = row[i] ?? '';
  });
  return obj;
});
setRows(preview);
```

Note: `keyIdx` is only defined inside the `if (assignmentType === 'objective')` block. Restructure so `keyIdx` is available to both the answer key detection and the preview generation. Declare `let detectedKeyIdx = -1;` before the objective check, set it inside the block, then use it in the preview filter:

```typescript
let detectedKeyIdx = -1;
if (assignmentType === 'objective') {
  // ... detection code, sets detectedKeyIdx = keyIdx when found
}

// Preview first 5 rows (excluding answer key row if detected)
const previewRows = detectedKeyIdx >= 0 ? parsed.rows.filter((_, i) => i !== detectedKeyIdx) : parsed.rows;
const preview: CsvPreviewRow[] = previewRows.slice(0, 5).map((row) => {
  const obj: CsvPreviewRow = {};
  parsed.headers.forEach((h, i) => {
    obj[h] = row[i] ?? '';
  });
  return obj;
});
setRows(preview);
```

- [ ] **Step 5: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
rtk git add src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: detect and extract answer key row from CSV uploads
EOF
)"
```

---

### Task 4: Update handleProcess for Objective CSV Flow

**Files:**
- Modify: `src/pages/Upload.tsx:740-796` (handleProcess function)
- Modify: `src/pages/Upload.tsx:738` (hasRequiredMappings)
- Modify: `src/pages/Upload.tsx:941-946` (validation message)

- [ ] **Step 1: Update hasRequiredMappings for objective type**

Replace the `hasRequiredMappings` logic (line 738):

```typescript
const questionColIndices = columnMappings
  .map((m, i) => (m.mappedTo === 'question_answer' ? i : -1))
  .filter((i) => i !== -1);

const hasRequiredMappings =
  assignmentType === 'objective'
    ? nameColIndex !== -1 && questionColIndices.length > 0 && answerKeyRow !== null
    : nameColIndex !== -1 && scoreColIndex !== -1;
```

- [ ] **Step 2: Update handleProcess to build answers for objective type**

Replace the `handleProcess` function body (lines 741-796) with branched logic:

```typescript
async function handleProcess() {
  if (!hasRequiredMappings) {
    toast('error', assignmentType === 'objective'
      ? 'Map a student name column, at least one question column, and ensure an answer key row is detected.'
      : 'Map both a student name and score column.');
    return;
  }

  setProcessing(true);
  try {
    // Filter out the answer key row from student data
    const studentRows = answerKeyRowIndex >= 0
      ? allRows.filter((_, i) => i !== answerKeyRowIndex)
      : allRows;

    let extractedStudents;
    let answerKey = null;

    if (assignmentType === 'objective' && answerKeyRow && questionColIndices.length > 0) {
      // Build answer key from the detected answer key row
      answerKey = questionColIndices.map((colIdx) => {
        const header = headers[colIdx];
        const num = parseInt(header.replace(/\D/g, ''), 10) || (questionColIndices.indexOf(colIdx) + 1);
        return {
          questionNumber: num,
          correctAnswer: answerKeyRow[colIdx]?.trim() ?? '',
          points: 1,
        };
      });

      // Build students with per-question answers
      extractedStudents = studentRows
        .filter((row) => row[nameColIndex]?.trim())
        .map((row, i) => {
          const rawName = row[nameColIndex]?.trim() ?? '';
          const answers = questionColIndices.map((colIdx) => {
            const header = headers[colIdx];
            const num = parseInt(header.replace(/\D/g, ''), 10) || (questionColIndices.indexOf(colIdx) + 1);
            return {
              questionNumber: num,
              answer: row[colIdx]?.trim() ?? '',
            };
          });

          return {
            extractionIndex: i,
            sourceImageIndex: 0,
            rawName,
            nameConfidence: 1.0,
            answers,
            totalScore: {
              raw: '0',
              normalized: 0,
              confidence: 1.0,
            },
            flags: [],
          };
        });
    } else {
      // Already Scored flow — existing logic
      extractedStudents = studentRows
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

    // Update assignment status
    await updateDoc(doc(db, 'assignments', assignmentId), {
      status: 'processing_images',
    });

    // Call Cloud Function with CSV extraction result
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

- [ ] **Step 3: Update the validation warning for objective type**

Replace the `!hasRequiredMappings` warning (line 941):

```typescript
{!hasRequiredMappings && (
  <div className="flex items-center gap-2 text-sm text-warning">
    <AlertCircle className="w-4 h-4 flex-shrink-0" />
    {assignmentType === 'objective'
      ? 'Map a student name column and at least one question answer column. An answer key row is also required.'
      : 'Map both a student name column and a score column to continue.'}
  </div>
)}
```

- [ ] **Step 4: Update the ready-to-process banner for objective type**

Replace the `hasRequiredMappings` green banner (line 932):

```typescript
{hasRequiredMappings && (
  <div className="bg-success/10 border border-success/20 rounded-[--radius-md] p-3">
    <p className="text-sm text-success font-medium">Ready to process</p>
    <p className="text-xs text-success mt-1">
      {assignmentType === 'objective'
        ? `${(answerKeyRowIndex >= 0 ? allRows.length - 1 : allRows.length)} students, ${questionColIndices.length} questions detected.`
        : `${allRows.filter((r) => r[nameColIndex]?.trim()).length} students detected from ${allRows.length} data rows.`}
    </p>
  </div>
)}
```

- [ ] **Step 5: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
rtk git add src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: build per-question answers in CSV handleProcess for objective type
EOF
)"
```

---

### Task 5: Update runCsvExtraction Backend to Store Answer Key

**Files:**
- Modify: `functions/src/index.ts:375-415` (runCsvExtraction function)

- [ ] **Step 1: Update runCsvExtraction to accept and store answerKey**

Update the function (line 375) to extract `answerKey` from the request and store it on the assignment doc:

```typescript
export const runCsvExtraction = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const { assignmentId, extractionResult, answerKey } = request.data as {
    assignmentId: string;
    extractionResult: Record<string, unknown>;
    answerKey?: Array<{ questionNumber: number; correctAnswer: string; points?: number }>;
  };
  if (!assignmentId) throw new HttpsError('invalid-argument', 'assignmentId required');
  if (!extractionResult) throw new HttpsError('invalid-argument', 'extractionResult required');

  const assignmentDoc = await verifyOwnership(assignmentId, request.auth.uid);
  const assignment = assignmentDoc.data()!;

  // Normalize and store the extraction result from the frontend
  const extractionId = generateId();
  const normalizedResult = {
    ...extractionResult,
    extractionId,
    assignmentId,
    sourceType: 'csv',
  };

  // Run roster matching
  const roster = await getRoster(assignment.classId);
  const students = (extractionResult.extractedStudents as Array<Record<string, unknown>>) || [];
  const extractedNames = students.map(
    (s: Record<string, unknown>, i: number) => ({
      extractionIndex: i,
      rawName: ((s.rawName as string) || '').trim(),
    }),
  );
  const rosterMatchResult = matchRoster(extractedNames, roster, 0.7);

  const updateData: Record<string, unknown> = {
    'pipelineState.extractionResult': normalizedResult,
    'pipelineState.rosterMatchResult': rosterMatchResult,
    status: 'needs_review',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // If answer key provided from CSV, store it on the assignment for grading
  if (answerKey && answerKey.length > 0) {
    updateData['answerKey'] = {
      source: 'csv',
      questions: answerKey.map((q) => ({
        questionNumber: q.questionNumber,
        correctAnswer: q.correctAnswer,
        points: q.points ?? 1,
        questionText: null,
        answerChoices: null,
        extraCredit: false,
      })),
    };
    updateData['type'] = 'objective';
  }

  await db.collection('assignments').doc(assignmentId).update(updateData);

  return { success: true };
});
```

- [ ] **Step 2: Check that the frontend sends the data in the correct shape**

The frontend (Task 4) sends `{ assignmentId, extractedStudents, metadata, answerKey }`. But `runCsvExtraction` currently destructures `extractionResult`, not `extractedStudents` + `metadata` separately. The frontend wraps `extractedStudents` and `metadata` together as the payload but the backend expects `extractionResult` as a flat object.

Looking at the current frontend call (Upload.tsx line 778-788):
```typescript
await runCsvExtraction({
  assignmentId,
  extractedStudents,
  metadata: { ... },
});
```

And the backend (index.ts line 377-380):
```typescript
const { assignmentId, extractionResult } = request.data;
```

The frontend does NOT wrap in `extractionResult` — it sends `extractedStudents` and `metadata` as top-level fields. But the backend reads `request.data.extractionResult`. This means the existing code must be working with `extractionResult` being undefined, or there's some other mapping happening.

Wait — looking more carefully at line 398: `(extractionResult.extractedStudents as Array<...>)` — the backend expects `extractionResult` to contain `extractedStudents` inside it. But the frontend sends `extractedStudents` at the top level.

This means the current code is likely sending the whole `request.data` object implicitly as the extraction result since `extractionResult` would be undefined and the function would throw. Let me re-check...

Actually, the frontend sends `{ assignmentId, extractedStudents, metadata }` and the backend reads `request.data.extractionResult` which would be `undefined`. This would cause the `if (!extractionResult)` check to throw. This means either the code path is different or there's been a change.

The fix: update the backend to read the fields the way the frontend actually sends them. Change the destructuring:

```typescript
const { assignmentId, extractedStudents, metadata, answerKey } = request.data as {
  assignmentId: string;
  extractedStudents: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  answerKey?: Array<{ questionNumber: number; correctAnswer: string; points?: number }>;
};
if (!assignmentId) throw new HttpsError('invalid-argument', 'assignmentId required');
if (!extractedStudents) throw new HttpsError('invalid-argument', 'extractedStudents required');
```

And update the normalizedResult and roster matching:

```typescript
const normalizedResult = {
  extractedStudents,
  metadata,
  extractionId,
  assignmentId,
  sourceType: 'csv',
};

const extractedNames = extractedStudents.map(
  (s: Record<string, unknown>, i: number) => ({
    extractionIndex: i,
    rawName: ((s.rawName as string) || '').trim(),
  }),
);
```

- [ ] **Step 3: Verify functions build**

Run: `cd functions && rtk tsc`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
rtk git add functions/src/index.ts && rtk git commit -m "$(cat <<'EOF'
feat: runCsvExtraction accepts and stores answer key from CSV upload
EOF
)"
```

---

### Task 6: Update CSV Templates

**Files:**
- Modify: `public/classpulse-csv-template.csv` (rename to simple template)
- Create: `public/classpulse-csv-template-detailed.csv` (per-question answer template)
- Modify: `src/pages/Upload.tsx` (template download links)

- [ ] **Step 1: Create detailed CSV template**

Create `public/classpulse-csv-template-detailed.csv`:

```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,B,C,A,D,B,C,A,B,D,C
Emma Johnson,B,C,A,D,B,C,A,B,D,C
Marcus Rivera,B,A,A,D,B,C,A,B,D,A
Sophia Chen,A,C,A,D,C,C,B,A,D,C
Liam Carter,B,C,A,B,B,C,A,B,A,C
Ava Mitchell,B,C,A,D,B,A,A,B,D,B
```

- [ ] **Step 2: Update template download links in CsvUpload**

Replace the existing template download div (line 830) with two template options based on assignment type:

```typescript
<div
  className="mt-3 flex items-center justify-center gap-1.5 text-xs"
  onClick={(e) => e.stopPropagation()}
>
  <Download className="w-3.5 h-3.5 text-muted-foreground" />
  <span className="text-muted-foreground">Not sure about the format?</span>
  {assignmentType === 'objective' ? (
    <a
      href="/classpulse-csv-template-detailed.csv"
      download
      className="text-primary hover:underline font-medium"
    >
      Download template
    </a>
  ) : (
    <a
      href="/classpulse-csv-template.csv"
      download
      className="text-primary hover:underline font-medium"
    >
      Download template
    </a>
  )}
</div>
```

- [ ] **Step 3: Update the instructions text for objective type**

Replace the instruction paragraph (line 806):

```typescript
<p className="text-sm text-muted-foreground">
  {assignmentType === 'objective'
    ? 'Upload a CSV with student names and per-question answers (Q1, Q2...). Include an ANSWER KEY row with correct answers.'
    : 'Upload a CSV, TSV, or spreadsheet file with student names and scores (max 5 MB).'}
</p>
```

- [ ] **Step 4: Verify build passes**

Run: `rtk tsc`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
rtk git add public/classpulse-csv-template-detailed.csv src/pages/Upload.tsx && rtk git commit -m "$(cat <<'EOF'
feat: add detailed CSV template and type-specific download links
EOF
)"
```

---

### Task 7: Update Test Data CSVs to Per-Question Format

**Files:**
- Modify: all 12 files in `test-data/*.csv`

Each CSV gets per-question answer columns (Q1-Q10) with an ANSWER KEY row. Scores are reverse-engineered into answer patterns: higher-scoring students get more correct answers, lower-scoring students get more wrong answers with realistic distractor patterns.

- [ ] **Step 1: Rewrite 5th grade math CSVs (3 files)**

`test-data/5thgrade-unit1-test.csv` (7 students, 10 questions):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,C,A,B,D,C,A,B,D,A,C
Ava Mitchell,C,A,B,D,C,A,B,A,A,D
Ben Harrison,C,A,B,A,D,A,B,D,C,D
Chloe Ramirez,C,A,B,D,C,A,B,D,A,B
Diego Fernandez,C,A,B,D,C,D,A,D,A,D
Emily Watson,C,A,B,D,C,A,B,D,A,C
Finn O'Connor,C,D,A,D,C,A,B,D,C,D
Giselle Laurent,C,A,B,D,C,A,B,D,C,B
```

`test-data/5thgrade-unit2-test.csv` (7 students, 10 questions):
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

`test-data/5thgrade-unit3-test.csv` (7 students, 10 questions):
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

- [ ] **Step 2: Rewrite 3rd grade reading CSVs (3 files)**

`test-data/3rdreading-vocab-test.csv` (10 students, 10 questions):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,B,A,C,D,B,A,C,D,B,A
Emma Wilson,B,A,C,D,B,A,C,D,A,A
Lucas Brown,B,A,C,D,A,A,C,A,B,D
Sophia Garcia,B,A,C,D,B,A,C,D,B,A
Noah Martinez,B,A,C,A,B,D,C,D,A,A
Olivia Davis,B,A,C,D,B,A,C,D,A,A
Isabella Rodriguez,B,A,C,D,B,A,C,A,B,D
Liam Johnson,B,A,C,D,A,D,A,D,B,D
Mia Anderson,B,A,C,D,B,A,C,D,B,A
Ethan Taylor,B,A,C,D,B,A,C,D,A,D
Ava Thomas,B,A,C,D,B,A,C,A,B,A
```

`test-data/3rdreading-comprehension-quiz.csv` (10 students, 10 questions):
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

`test-data/3rdreading-midterm.csv` (10 students, 10 questions):
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

- [ ] **Step 3: Rewrite 6th grade science CSVs (3 files)**

`test-data/6thscience-lab-report1.csv` (12 students, 10 questions):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,A,C,B,D,A,C,B,D,A,C
Jackson Lee,A,C,B,D,A,A,B,D,A,D
Harper Kim,A,C,B,D,A,C,B,D,A,A
Aiden Nguyen,A,C,B,D,A,D,D,A,C,D
Riley Patel,A,C,B,D,A,C,B,D,A,C
Carter Singh,A,C,B,D,A,C,A,D,A,D
Zoey Chen,A,C,B,D,A,C,B,D,A,A
Mason Ali,A,C,B,D,D,D,D,A,C,D
Lily Okafor,A,C,B,D,A,C,B,D,A,C
Owen Brooks,A,C,B,D,A,D,B,D,C,D
Chloe Rivera,A,C,B,D,A,C,B,A,A,C
Elijah Foster,A,C,B,D,A,C,A,D,A,D
Nora Washington,A,C,B,D,A,C,B,D,A,A
```

`test-data/6thscience-chapter-test.csv` (12 students, 10 questions):
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

`test-data/6thscience-lab-report2.csv` (12 students, 10 questions):
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

- [ ] **Step 4: Rewrite Feezle CSVs (3 files)**

`test-data/feezle-midterm-exam.csv` (14 students, 10 questions):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,B,D,A,C,B,D,A,C,B,D
Zoe Adams,B,D,D,A,D,A,D,C,D,A
James Turner,B,D,D,A,A,D,D,C,D,A
Charlotte Lewis,B,D,A,C,B,A,D,C,D,A
Mia Thomas,B,D,A,C,B,D,D,C,D,A
Ava Mitchell,B,D,A,C,B,D,A,A,D,A
Mason Davis,B,D,A,C,B,D,D,A,D,A
Isabella Brooks,B,D,A,C,B,D,A,C,D,D
Aiden Patel,B,D,A,C,B,D,A,C,D,A
Olivia Jenkins,B,D,A,C,B,D,A,C,A,D
Noah Kim,B,D,A,C,B,D,A,C,B,A
Ethan Walker,B,D,A,C,B,D,A,C,B,A
Sophia Williams,B,D,A,C,B,D,A,C,A,D
Liam Carter,B,D,A,C,B,D,A,C,B,D
Emma Robinson,B,D,A,C,B,D,A,C,B,A
```

`test-data/feezle-chapter5-quiz.csv` (14 students, 10 questions):
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

`test-data/feezle-chapter6-quiz.csv` (14 students, 10 questions):
```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,C,A,B,D,C,A,B,D,C,A
Zoe Adams,C,A,B,D,A,D,D,A,A,D
James Turner,C,A,B,D,C,A,D,A,A,D
Charlotte Lewis,C,A,B,D,C,A,B,D,C,D
Mia Thomas,C,A,B,D,C,A,B,A,A,D
Ava Mitchell,C,A,B,D,C,A,B,D,A,D
Mason Davis,C,A,B,D,C,A,B,D,A,D
Isabella Brooks,C,A,B,D,C,A,B,D,A,A
Aiden Patel,C,A,B,D,C,A,B,D,C,D
Olivia Jenkins,C,A,B,D,C,A,B,D,C,D
Noah Kim,C,A,B,D,C,A,B,D,C,A
Ethan Walker,C,A,B,D,C,A,B,D,C,A
Sophia Williams,C,A,B,D,C,A,B,D,A,D
Liam Carter,C,A,B,D,C,A,B,D,C,A
Emma Robinson,C,A,B,D,C,A,B,D,C,A
```

- [ ] **Step 5: Commit**

```bash
rtk git add test-data/ && rtk git commit -m "$(cat <<'EOF'
feat: rewrite test-data CSVs with per-question answer format and ANSWER KEY rows
EOF
)"
```

---

### Task 8: Deploy and Verify

**Files:** None (deployment + manual verification)

- [ ] **Step 1: Build frontend**

Run: `rtk tsc`
Expected: No errors.

- [ ] **Step 2: Build functions**

Run: `cd functions && rtk tsc`
Expected: No errors.

- [ ] **Step 3: Deploy functions**

Run: `firebase deploy --only functions`
Expected: Successful deployment.

- [ ] **Step 4: Deploy hosting**

Run: `firebase deploy --only hosting`
Expected: Successful deployment.

- [ ] **Step 5: Verify via Playwright**

1. Navigate to the app
2. Create a new assignment with "Grade For Me" type and "CSV" upload mode
3. Upload a test-data CSV (e.g., `feezle-midterm-exam.csv`)
4. Verify: question columns auto-detected, answer key row detected, students + question count shown
5. Process and verify the review page shows per-question data

- [ ] **Step 6: Commit any fixes**

If any issues found during verification, fix and commit.
