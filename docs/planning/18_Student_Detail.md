## Overview

Student Detail is the per-student drill-down from the Class Overview. It answers: "What exactly does this student know and not know?" The screen shows one student's performance in the context of the class, with per-skill mastery comparison, per-question answer analysis, and AI-generated misconception explanations. Teachers navigate here when they need to prepare for a 1-on-1 conversation or write targeted feedback.

Route: `/analysis/{assignmentId}/student/{studentId}`

## Dependencies

- `02_Database_Schema.md` -- reads `analyses` collection (`studentInsights`), `assignments` collection, student roster
- `04_UI_Design_System.md` -- mastery colors, skill tag chips, data tables, card patterns
- `05_Shared_Schemas.md` -- `AnalysisResult.studentInsights` shape
- `14_Grading.md` -- `GradedResult` for per-question correctness (Path B)
- `16_Analysis_Pipeline.md` -- produces the `studentInsights` data
- `17_Class_Overview.md` -- parent screen, breadcrumb source

## Data Source

All data comes from the existing `AnalysisResult` document -- no additional Firestore reads beyond what Class Overview already fetched. The relevant slice is the `studentInsights` entry matching `studentId`, plus `skillBreakdown` for comparison context.

If the student is marked absent (`studentId` in `absentStudents`), show a minimal screen: "{Student Name} was absent for this assignment." with a back link. No analysis data exists.

## Screen Layout

```
+--[ Breadcrumb: Dashboard / Chapter 4 Quiz / Emma Johnson ]---+
|                                                               |
|  SECTION 1: STUDENT HEADER                                    |
|  [ Name, score, relative standing, percentile ]               |
|                                                               |
|  SECTION 2: SKILL COMPARISON (if per-question data)           |
|  [ Student mastery vs class mastery per skill ]               |
|                                                               |
|  SECTION 3: QUESTION-BY-QUESTION (if per-question data)       |
|  [ Per-question table with answers and correctness ]          |
|                                                               |
|  SECTION 4: WRONG ANSWER ANALYSIS (if misconceptions found)   |
|  [ AI misconception explanations per wrong answer pattern ]   |
|                                                               |
+---------------------------------------------------------------+
```

## Section 1: Student Header

### Score Display

| Element | Content | Style |
|---------|---------|-------|
| Student name | `studentName` from insights | `text-2xl font-semibold` |
| Total score | Percentage | `text-5xl font-bold`, mastery-colored |
| Relative standing | "Above Average" / "Average" / "Below Average" | Badge per design system |
| Percentile | "Top 15%" or "Bottom 10%" | `text-sm text-slate-500` |

### Contextual Comparison

A small inline comparison to the right of the score:

```
Emma Johnson          Class
     82%         vs    74%
  Above Avg           ----
```

The class average is shown for quick context. No additional chart -- the numbers speak for themselves.

### Navigation Between Students

Left/right arrows flanking the student name allow cycling through students without returning to Class Overview. Order matches the Class Overview student list sort (score ascending by default).

- ← Previous: "{Previous Student Name}" tooltip on hover
- → Next: "{Next Student Name}" tooltip on hover
- Keyboard: left/right arrow keys navigate between students

## Section 2: Skill Comparison

Only shown when skill inference data exists (Path A-Detailed and Path B). Hidden for Path A-Simple.

### Comparison Table

Each row shows one skill with the student's mastery alongside the class mastery, making gaps visually obvious.

| Column | Content |
|--------|---------|
| Skill tag | Chip with mastery color based on student's level (not class level) |
| Student mastery | Percentage + short bar |
| Class mastery | Percentage + short bar (lighter color, same row) |
| Gap | Difference: "+12%" or "-25%" |
| Status | "Ahead", "On track", or "Behind" |

**Gap thresholds:**
- Ahead: student mastery > class mastery + 10%
- On track: within ±10% of class mastery
- Behind: student mastery < class mastery - 10%

Sort: "Behind" skills first (largest negative gap at top). This surfaces the student's weakest areas immediately.

### Visual Pattern

The dual bars per row create an instant visual pattern. If the student bar is consistently shorter than the class bar, the teacher sees at a glance that this student is behind across the board. If only one skill bar is short, the gap is targeted.

## Section 3: Question-by-Question

Only shown when per-question data exists. This is the most granular view available.

### Answer Table

| Column | Content | Style |
|--------|---------|-------|
| Q# | Question number | `text-sm font-medium` |
| Question text | From answer key, if provided | `text-sm text-slate-600`, truncated with tooltip for full text |
| Student answer | What the student wrote/selected | `text-sm` |
| Correct answer | From answer key (Path B) or "✓" / "✗" (Path A-Detailed) | `text-sm text-slate-500` |
| Result | ✓ or ✗ icon | Green check or red X |
| Skill | Primary skill tag for this question | Small chip |

**Row highlighting:**
- Correct: no highlight (clean default)
- Incorrect: `red-50` background, subtle

**Path A-Detailed differences:** No "Correct answer" column (teacher marked right/wrong, not individual answers). The "Student answer" column shows "Correct" or "Incorrect" based on teacher markings. The "Result" column still shows ✓/✗.

### Filtering

Toggle above the table: "All questions" / "Wrong answers only"

"Wrong answers only" filters to incorrect rows. Useful for quickly seeing the pattern of mistakes without scrolling through correct answers. Shows count: "5 of 20 incorrect."

## Section 4: Wrong Answer Analysis

Shown when the AI identified misconception patterns for this student. Not every wrong answer gets a misconception -- only those where the AI detected a meaningful pattern.

### Misconception Cards

Each card targets one identified pattern:

| Element | Content |
|---------|---------|
| Questions affected | "Q3, Q7, Q12" -- which questions share this misconception |
| Skill area | The skill tag these questions map to |
| What happened | The student's answers on these questions |
| Why it matters | AI-generated `misconception` text explaining the likely reasoning error |

Example card:

```
┌─────────────────────────────────────────────────────────┐
│  Q3, Q7, Q12 — fraction addition with unlike denom.     │
│                                                         │
│  Emma answered: 2/7, 3/11, 5/13                        │
│  Correct answers: 7/12, 7/15, 11/20                    │
│                                                         │
│  Emma is adding numerators and denominators separately  │
│  (1/3 + 1/4 = 2/7). She likely doesn't understand that │
│  fractions need common denominators before adding.      │
└─────────────────────────────────────────────────────────┘
```

Cards are sorted by number of affected questions descending (biggest pattern first).

If no misconceptions were identified for this student (all errors appear random), this section shows: "No consistent error patterns detected. Mistakes appear isolated."

### Relationship to Interventions

Each misconception card links to the relevant intervention on the Intervention Planner if one exists: "See recommended intervention →" link at the bottom of the card. This connects the diagnosis (Student Detail) to the action plan (Intervention Planner).

## Path A-Simple Layout

Minimal screen when only total scores are available:

- Section 1: header with score, relative standing, percentile (same as full layout)
- Section 2: hidden (no skills)
- Section 3: hidden (no per-question data)
- Section 4: hidden (no misconceptions)

Additional content for Path A-Simple to fill the page:

```
Score: 65% (Below Average)
Class Average: 74%
Percentile: Bottom 30%

This student scored below the class average. Consider checking in
on their understanding of the material.
```

The one-line suggestion is static text based on the relative standing, not AI-generated. Keep it brief and non-prescriptive.

## Absent Student View

If the student is in the `absentStudents` list:

```
Emma Johnson was absent for this assignment.
No data available.

[ ← Back to Class Overview ]
```

No analysis sections shown. The navigation arrows skip absent students.

## Excluded Student View

If the student was excluded during Review & Confirm (`excludedStudents`):

```
Emma Johnson was excluded from this analysis.

[ ← Back to Class Overview ]
```

## Data Loading

This screen reads from documents already fetched by Class Overview. If navigating directly via URL (deep link or page refresh), load:

1. Assignment document (for title, breadcrumb)
2. Analysis document (for `studentInsights`, `skillBreakdown`)
3. If Path B: assignment's `pipelineState.gradedResult` for per-question answers

The student's data is extracted from the analysis document's `studentInsights` array by matching `studentId`. No separate Firestore query per student.

## Responsive Behavior

- Desktop: all sections stack vertically, full-width tables
- Tablet: same layout, tables remain full-width
- Mobile: skill comparison table switches to a card-per-skill layout (one card per skill showing student vs class). Question table scrolls horizontally with sticky Q# column.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Student navigation order | Assumption | Arrow navigation follows the current sort order on Class Overview. If the teacher sorted by name on Class Overview, arrows cycle alphabetically. If sorted by score, arrows cycle by score. Default is score ascending (weakest first). Sort state is passed via URL param or component state. |
| Misconception card depth | Assumption | AI misconception text is 1-3 sentences. No lengthy explanations. If the AI produces more, truncate with "Show more" expansion. |
| Historical comparison | Gap | No "how did this student do on the last assignment" data. Each analysis is standalone. Post-MVP feature. See `23_Future_Features.md`. |
| Print view | Gap | No print-optimized layout for parent conferences or student feedback. Deferred with PDF export. |
| Student name privacy | Assumption | The URL contains `studentId` (Firestore auto-ID), not the student's name. Names appear on-screen only. Security rules ensure only the owning teacher can access the analysis document. |
| Secondary skills display | Assumption | Secondary skill tags from skill inference appear in the question table's "Skill" column as smaller, muted chips next to the primary skill. They do not get their own rows in the skill comparison table. |
| No direct edit from Student Detail | Assumption | The teacher cannot edit extraction data or skill tags from this screen. Edits happen on Review & Confirm (data) or Class Overview (skill tags). Student Detail is read-only. |  
