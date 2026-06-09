▸ TodoWrite  
  ← result received  
▸ Extended thinking (994 chars)  
## Overview

The Setup wizard collects assignment context before the teacher uploads data. It is a short, linear flow of 2-3 steps depending on the assignment path. The goal is under 30 seconds for a returning teacher who already has a class. On completion, the wizard creates an assignment document in Firestore and navigates to the Upload screen (see `09_Upload_Flow.md`).

Route: `/analysis/new`

## Dependencies

- `02_Database_Schema.md` -- `assignments` collection, `AnswerKey` shape
- `04_UI_Design_System.md` -- form patterns, button styles
- `07_Class_Roster_Management.md` -- class creation form (embedded when needed)
- `09_Upload_Flow.md` -- destination after Setup completes

## Wizard Structure

```
Step 1: Select Class
  |
  v
Step 2: Assignment Details (title, type, objectives, upload mode)
  |
  +--> [If Path B] Step 3: Answer Key
  |
  v
Create assignment document -> Navigate to Upload
```

Steps shown as a horizontal progress indicator at the top: numbered circles connected by lines, current step highlighted. Compact -- this is not a complex form, just a structured collection of a few fields.

## Step 1: Class Selection

**Question answered:** Which class is this assignment for?

### Returning Teacher (has classes)

Dropdown of existing classes, populated from `classes` collection where `teacherId == auth.uid`, sorted alphabetically.

Each option shows: `{className} ({studentCount} students)`

Example: "5th Grade Math - Period 2 (28 students)"

If the teacher has only one class, it is pre-selected and this step can be skipped (auto-advance to Step 2 with a "Change class" link visible).

"Create New Class" option at the bottom of the dropdown. Selecting it expands the class creation form inline (see `07_Class_Roster_Management.md` for form details). After class creation, the new class is auto-selected and the wizard advances.

### First-Time Teacher (no classes)

Step 1 shows the class creation form directly instead of a dropdown. No empty dropdown state. The heading changes to "Create your first class" with brief helper text: "You'll reuse this for future assignments."

### Navigation

- "Next" button (primary) advances to Step 2. Disabled until a class is selected.
- "Cancel" link returns to Dashboard.

## Step 2: Assignment Details

**Question answered:** What am I about to analyze?

### Fields

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Title | Text input | Yes | Empty | e.g., "Chapter 4 Quiz - Fractions". Placeholder text as example. |
| Assignment type | Toggle | Yes | "Already Scored" | Two options: "Already Scored" (Path A) / "Grade For Me" (Path B) |
| Upload mode | Toggle | Yes | "Photos / Scans" | Two options: "Photos / Scans" / "CSV / Spreadsheet" |
| Learning objectives | Textarea | No | Empty | Prompted: "What skills does this assignment cover? (optional)" |
| Total points | Number input | No | Null | Path A: optional. Path B: required (needed for scoring). |
| Question count | Number input | No | Null | Path B: required. Path A: optional. |

### Assignment Type Toggle

Visual toggle with two options, styled as segmented control:

**"Already Scored"** -- Teacher already graded the work. AI reads the marks.
- Helper text: "I've already graded this. Extract my scores."
- Leads to Upload directly (no answer key step).

**"Grade For Me"** -- Objective assignment. AI extracts answers, system grades against a key.
- Helper text: "This has objective answers (multiple choice, fill-in). Grade it for me."
- Requires answer key in Step 3 before Upload.
- Total points and question count become required fields.

### Upload Mode Toggle

Segmented control:

**"Photos / Scans"** -- Teacher will upload images of student papers.
**"CSV / Spreadsheet"** -- Teacher will upload a data file.

This choice determines which Upload screen variant to show (see `09_Upload_Flow.md`).

### Learning Objectives

Optional free text that seeds skill inference (see `15_Skill_Inference.md`). The AI uses these to produce more accurate skill tags.

Helper text below the field: "Example: fraction addition, reducing fractions, mixed numbers"

If left empty, the AI infers skills from question content alone. The `learningObjectivesUsed` flag on `SkillInferenceResult` records whether objectives were provided.

### Navigation

- "Back" button returns to Step 1 (class selection preserved).
- "Next" button:
  - If Path B: advances to Step 3 (Answer Key).
  - If Path A: creates the assignment document and navigates to Upload.
- "Cancel" link returns to Dashboard. No draft is saved.

## Step 3: Answer Key (Path B Only)

**Question answered:** What are the correct answers?

This step is critical for Path B. Grading against a wrong key is catastrophic, so the UI emphasizes accuracy.

### Entry Methods

Toggle at the top: "Type Answers" (default) / "Upload Answer Key Image"

**Method A: Type Answers (primary)**

Numbered list input. The question count from Step 2 determines the number of rows.

| # | Correct Answer | Question Text (optional) | Answer Choices (optional) |
|---|---------------|-------------------------|--------------------------|
| 1 | [ C ] | [ What is 3/4 + 1/2? ] | [ A: 5/6, B: 4/6, C: 5/4, D: 1/1 ] |
| 2 | [ B ] | [ ] | [ ] |
| ... | | | |

- **Correct Answer**: Required. Single character or short string. Auto-uppercases letter answers.
- **Question Text**: Optional but recommended. Improves skill inference and misconception detection.
- **Answer Choices**: Optional. Enables distractor analysis (understanding why wrong answers were chosen). Comma-separated or individual fields per choice.
- **Points per question**: Defaults to `totalPoints / questionCount` (even distribution). Teacher can override individual question points by expanding an "Advanced" row.
- **Extra credit**: Checkbox per question. Excluded from base total.

Quick-entry mode for simple assignments: just the answer column. "Add question details" expands the optional columns.

**Method B: Upload Answer Key Image**

1. Teacher uploads a single photo of the answer key or a marked-up blank assignment
2. Vision AI extracts answers (same extraction model as student papers)
3. Extracted answers shown in the same table format as Method A, pre-filled
4. Teacher reviews and confirms each answer
5. This is a **blocking sub-step** -- the teacher must confirm the extracted key before proceeding

The extracted answer key is parsed through the same `ExtractionResult` schema path, then converted to the `AnswerKey` shape.

### Validation

- All questions must have a correct answer before proceeding
- If question count from Step 2 does not match rows entered, show a warning: "You said {N} questions but entered {M} answers. Which is correct?"
- Duplicate question numbers are prevented

### Navigation

- "Back" returns to Step 2 (form data preserved).
- "Start Analysis" (primary button) creates the assignment document with the answer key and navigates to Upload.

## Assignment Document Creation

When the teacher completes the wizard, the frontend creates the assignment document:

| Field | Source |
|-------|--------|
| `classId` | From Step 1 selection |
| `teacherId` | From `auth.uid` |
| `title` | From Step 2 |
| `type` | `"scored"` (Path A) or `"objective"` (Path B) |
| `date` | Today's date (auto-set, not a form field) |
| `totalPoints` | From Step 2 (or null) |
| `questionCount` | From Step 2 (or null) |
| `learningObjectives` | From Step 2 (or null) |
| `answerKey` | From Step 3 (or null for Path A) |
| `sourceType` | `"image"` or `"csv"` based on upload mode |
| `imageUrls` | Empty array (populated during Upload) |
| `status` | `"uploading"` |
| `pipelineState` | All fields null |

Document is created before navigating to Upload. The Upload screen reads this document to know the assignment context.

## Resuming an Incomplete Setup

If the teacher navigates away mid-wizard (closes tab, clicks Dashboard), no draft is saved. The assignment document is only created on wizard completion. This is intentional -- partially configured assignments would clutter the Dashboard and create confusing states.

If the teacher had started uploading (assignment document exists with status `"uploading"`), clicking that analysis card on the Dashboard resumes at the Upload screen, not the Setup wizard.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Assignment date | Assumption | Auto-set to today. No date picker. If a teacher analyzes last week's quiz, the date reflects when the analysis was run, not when the quiz was given. Acceptable for MVP. |
| Answer key image extraction model | Assumption | Uses the same vision model and extraction function as student papers. The extraction prompt adapts to "this is an answer key, extract correct answers" mode. See `10_Image_Extraction.md`. |
| Draft saving | Assumption | No draft persistence. Wizard state lives in component state only. If the teacher refreshes mid-wizard, they start over. Acceptable given the wizard takes under 30 seconds. |
| Points distribution | Assumption | Default is even distribution (`totalPoints / questionCount`). Teacher can override per question in the answer key table. Non-even defaults require expanding the "Advanced" row. |
| Mixed assignment types | Gap | A single assignment is either Path A or Path B. If a teacher has an assignment that is partially scored and partially needs grading, they must choose one path. The spec explicitly excludes mixed mode. |  
