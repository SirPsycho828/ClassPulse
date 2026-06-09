▸ TodoWrite  
  ← result received  
Here's `13_Review_Confirm.md`:

## Overview

Review & Confirm is the first human-in-the-loop gate. The teacher validates extracted data before analysis runs. Every extraction -- image or CSV -- passes through this screen. The goal is under 60 seconds for the teacher to scan, resolve flagged items, and confirm. The screen uses a triage approach: items needing attention are surfaced first, with auto-confirmed rows collapsed below.

Route: `/analysis/{assignmentId}/review`

## Dependencies

- `02_Database_Schema.md` -- reads `pipelineState.extractionResult` and `rosterMatchResult`, writes `validatedResult`
- `03_Cloud_Functions.md` -- `submitValidation` callable function
- `04_UI_Design_System.md` -- confidence row colors (green/yellow/red), table patterns
- `05_Shared_Schemas.md` -- `ValidatedResultSchema`
- `10_Image_Extraction.md` / `11_CSV_Processing.md` -- provide the extraction data
- `12_Roster_Matching.md` -- provides the roster match data

## Screen Layout

### Header Metrics

Top of the screen, a summary bar:

```
24 of 28 confirmed  |  3 need review  |  1 failed  |  2 absent
```

Counts are derived from the `RosterMatchResult.summary` plus any extraction failures. Each count is color-coded per the design system (green/yellow/red). "Absent" count comes from `unmatchedRosterStudents`.

### Triage View

Items needing attention appear first, expanded. Auto-confirmed rows are collapsed below.

**Section 1: "Needs Your Attention" (yellow + red rows)**
- Sorted by severity: red (failed extraction) first, then yellow (low confidence / fuzzy match)
- Each row is expanded, showing the issue and resolution controls
- Count in section header: "3 items need your attention"

**Section 2: "Confirmed" (green rows, collapsed)**
- Collapsed by default with header: "24 confirmed -- click to review"
- Teacher can expand to spot-check any auto-confirmed row
- Each row is clickable to expand and override if needed

### Row Content

Each row represents one extracted student and displays:

| Column | Content |
|--------|---------|
| Status indicator | Green/yellow/red dot or icon |
| Student name | Extracted `rawName` with matched roster name |
| Match info | "Matched to: Emma Johnson" or dropdown for ambiguous |
| Per-question answers | Q1, Q2, Q3... columns (if per-question data exists) |
| Total score | Extracted total |
| Actions | Confirm, Edit, Exclude |

### Row States

**Green (auto-confirmed):**
- High-confidence extraction + Tier 1 or Tier 2 roster match
- No action needed unless teacher wants to override
- Shows: extracted name -> matched roster name, all data fields

**Yellow (needs review):**
- One or more fields have low confidence, OR roster match is Tier 3 (fuzzy)
- Specific issue highlighted with the original extracted value
- For name issues: dropdown of roster candidates ranked by match confidence
- For answer/score issues: the extracted value shown alongside a cropped image region (image path only)
- Teacher must take an action: confirm as-is, select a different candidate, or manually edit

**Red (failed):**
- Extraction failed entirely for this entry, or no roster match candidates at all
- Teacher can: manually enter all data, assign to a roster student via dropdown, or exclude from analysis
- For image path: the source image thumbnail is shown so the teacher can read the paper themselves

### Unmatched Roster Students

Below the main table, a section for roster students with no extraction match:

"These students have no data: Lily Zhang. Mark as absent?"

Each name has two actions:
- "Mark Absent" -- adds to `absentStudents` list, excluded from analysis with no score
- "Enter Data" -- opens a manual entry row where the teacher types in the student's scores/answers

## Teacher Actions

### Confirm

Accept the extracted data as-is. For green rows, this is implicit (auto-confirmed). For yellow rows, clicking "Confirm" accepts the AI's best guess.

### Edit Name Match

For yellow/red rows with name issues:
- Dropdown shows roster candidates sorted by match confidence
- Each candidate shows: roster name + confidence percentage
- Selecting a candidate updates the match
- "Remember this" checkbox: if checked, the correction is saved as an alias on the student's `knownAliases` (see `12_Roster_Matching.md` alias learning loop)

### Edit Score or Answer

Click any data cell to edit inline. The original extracted value is preserved in the `corrections` array. The edited value becomes the validated value.

For image extractions: clicking a cell shows the cropped source image region alongside the edit field, so the teacher can compare.

### Exclude Student

Remove a student from the analysis entirely. The row is grayed out and moved to the bottom. The student is added to `excludedStudents` and does not appear in any analysis results.

Use case: a duplicate extraction, a student from the wrong class, or test data.

### Manual Entry

For red rows or unmatched roster students, the teacher enters data manually:
- Select the roster student from a dropdown (filtered to unmatched students only)
- Type score and/or per-question answers
- Row status becomes `"manual_entry"`

## Confirm & Analyze

Primary button at the bottom: "Confirm & Analyze"

**Disabled until:** all yellow and red rows are resolved (confirmed, edited, excluded, or marked absent). The button shows the remaining count: "Resolve 3 items to continue."

**On click:**
1. Frontend builds the `ValidatedResult` from the current state of all rows
2. Calls `submitValidation` Cloud Function with `assignmentId` and the validated data
3. Function writes `ValidatedResult` to `pipelineState`
4. Function saves any alias corrections to roster student documents
5. If Path B: function runs grading (see `14_Grading.md`) and writes `GradedResult`
6. Assignment status updates to `"analyzing"`
7. Frontend navigates to the processing view while `runAnalysis` executes

## Correction Tracking

Every teacher change is recorded in the `corrections` array on the validated student entry:

| Field | Content |
|-------|---------|
| `field` | Which field was changed: `"name"`, `"totalScore"`, `"answer_q3"` |
| `originalValue` | The AI-extracted value |
| `correctedValue` | The teacher's correction |
| `savedAsAlias` | Boolean, true if the name correction was saved to roster aliases |

This data serves two purposes:
1. Transparency: the analysis knows which data was teacher-corrected vs AI-extracted
2. Trust calibration (post-MVP): correction rates inform adaptive confidence thresholds (see `21_Override_Confidence_Model.md`)

## CSV Path Differences

The CSV path produces the same Review & Confirm screen but with fewer issues to resolve:

- All confidence scores are high (1.0) since data is typed text
- No image crops to display
- Primary review focus: roster name matching and empty cell handling
- Empty cells prompt: "Absent or Zero?" per cell (see `11_CSV_Processing.md`)
- Format normalization previews shown for any converted values: `"B+" -> 0.88 (87-89% range)`

The screen is lighter but structurally identical. The same components render both paths.

## State Persistence

If the teacher closes the browser while on Review & Confirm:
- Assignment status remains `"needs_review"` or `"reviewing"`
- Extraction and roster match results are in `pipelineState` (Firestore)
- Teacher corrections made so far are NOT persisted until "Confirm & Analyze" is clicked
- Returning to the screen re-renders from the stored extraction/match data, without prior edits

This is acceptable because the review process is designed to take under 60 seconds. Persisting partial review state would add complexity for minimal benefit.

## Edge Cases

| Condition | Handling |
|-----------|----------|
| All rows green, nothing to review | Triage section says "Nothing needs review." Confirmed section expanded by default. Teacher can still spot-check. "Confirm & Analyze" is immediately enabled. |
| More extracted students than roster | Extra entries shown as unmatched (red). Teacher assigns to roster students or excludes. |
| Fewer extracted students than roster | Unmatched roster students shown in the absent section. Teacher marks absent or enters data manually. |
| Teacher corrects name but doesn't check "Remember this" | Correction applies to this analysis only. No alias saved. Same fuzzy match will occur next time. |
| Two extracted entries matched to the same roster student | Conflict flagged as yellow. Teacher picks which entry belongs to the student, excludes the other. |
| Student answers contain "?" or unclear marks | Shown with low confidence. Teacher edits to the correct answer or excludes the question. |

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Image crop regions | Gap | Showing "the cropped image region" alongside low-confidence values requires the extraction AI to return bounding box coordinates. The current `ExtractionResult` schema does not include coordinates. For MVP, show the full source image thumbnail (clickable to enlarge) rather than a precise crop. Add bounding boxes post-MVP. |
| Partial review persistence | Assumption | Teacher edits are not saved until "Confirm & Analyze." If the browser closes, edits are lost. Acceptable given the 60-second target. |
| Bulk actions | Gap | No "confirm all" or "mark all absent" bulk actions. For a class of 30 with 24 green and 3 yellow, this is fine. If classes were larger, bulk actions would matter. |
| Undo | Assumption | No undo for individual cell edits. The teacher can re-edit any cell before confirming. After "Confirm & Analyze," corrections are locked. Re-analysis uses the validated data as-is. |  
