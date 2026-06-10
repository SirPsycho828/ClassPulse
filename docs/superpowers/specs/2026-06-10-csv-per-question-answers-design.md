# CSV Per-Question Answer Data Enhancement

**Date:** 2026-06-10
**Status:** Approved

## Problem

The CSV upload path hardcodes `answers: []` for every student, throwing away the entire per-question grading pipeline. Teachers who have per-question answer data (scantron exports, LMS exports, manual spreadsheets) get the same shallow analysis as a simple name+score CSV — no skill mapping, no misconception detection, no distractor analysis.

## Design

### Assignment Type Toggle

The "Already Scored / Grade For Me" toggle stays visible when CSV is selected:

- **Already Scored + CSV** — Name + Score columns. Current flow, no changes.
- **Grade For Me + CSV** — Name + per-question answer columns + answer key row. New flow.

### CSV Format (Grade For Me)

```csv
Student Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10
ANSWER KEY,B,C,A,D,B,C,A,B,D,C
Emma Robinson,B,C,A,D,B,C,A,B,D,C
Liam Carter,B,C,A,D,B,C,A,B,D,A
Zoe Adams,A,B,A,D,C,C,B,A,D,C
```

- First data row with name matching `ANSWER KEY`, `KEY`, `CORRECT`, or `ANSWER` is treated as the answer key.
- All other columns mapped as `question_answer` are treated as student responses.
- Column headers auto-detected: patterns like `Q1`, `Q2`, `#1`, `#2`, `Question 1`, etc.

### Frontend Changes

**Upload.tsx — CsvUpload component:**

1. Receive `assignmentType` prop (`'scored' | 'objective'`).
2. New column mapping value: `'question_answer'`.
3. Auto-detection: columns matching `/^(q|#|question\s*)\d+$/i` auto-map to `question_answer`.
4. Answer key detection: scan rows for name column containing `ANSWER KEY`, `KEY`, `CORRECT`, or `ANSWER` (case-insensitive). Extract that row as the answer key; exclude it from student data.
5. For `objective` type: build `extractedStudents[].answers` with `{ questionNumber, answer }` entries. Omit `totalScore` (pipeline computes it).
6. Pass `answerKey` array to `runCsvExtraction`.
7. Validation: require at least one `question_answer` column and a detected answer key row before allowing "Process".

**SetupWizard.tsx:**

- Pass `assignmentType` to the Upload page via assignment document (already stored as `type` field). CsvUpload reads it from the assignment doc.

**Upload.tsx — CsvUpload template downloads:**

- Two templates: "Simple (scores only)" and "Detailed (per-question answers)".
- Detailed template includes an ANSWER KEY row and 5 example students.

### Backend Changes

**runCsvExtraction (index.ts):**

- Accept optional `answerKey` field from request: `Array<{ questionNumber, correctAnswer, points? }>`.
- If present, store in assignment document under `answerKey.questions` so `submitValidation` can use it.
- Store assignment `type` as `'objective'` when answer key is provided.

**submitValidation (index.ts):**

- Zero changes. Already calls `gradeStudents()` when `assignment.type === 'objective'` and `assignment.answerKey` exists.

**runAnalysis (index.ts):**

- Zero changes. Already uses `gradedResult.perQuestion` data when available for skill inference, distractor analysis, and building the analysis prompt.

### Test Data Updates

Update existing `test-data/` CSVs to use per-question answer format with an ANSWER KEY row. This enables testing the full pipeline (grading, skill inference, misconception detection) via CSV upload.

### Data Flow

```
CSV file with answers
  → Frontend parses, detects answer key row
  → Column mapper identifies question columns
  → Builds extractedStudents with answers[] populated
  → Passes answerKey to runCsvExtraction
  → runCsvExtraction stores answerKey in assignment doc, sets status to needs_review
  → Teacher reviews roster matching
  → submitValidation calls gradeStudents() (existing code)
  → runAnalysis receives perQuestion data (existing code)
  → Full analysis with skill mastery, misconceptions, distractor patterns
```

### What Does NOT Change

- Image upload flow
- Already Scored + CSV flow
- submitValidation logic
- runAnalysis logic
- gradeStudents engine
- Skill inference prompts
- Analysis prompts
