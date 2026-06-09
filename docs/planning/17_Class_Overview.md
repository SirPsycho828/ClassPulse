## Overview

The Class Overview is the money screen -- the payoff for the entire pipeline. It answers: "How did my class do, and what should I do about it?" The teacher should be able to scan this screen in under 60 seconds and walk away with 1-3 actionable next steps. Everything on this screen is read from the `AnalysisResult` document. No AI calls happen here -- it is a pure presentation layer.

Route: `/analysis/{assignmentId}`

## Dependencies

- `02_Database_Schema.md` -- reads from `analyses` collection, `assignments` collection
- `04_UI_Design_System.md` -- mastery colors, cards, scope badges, skill tag chips, data tables
- `05_Shared_Schemas.md` -- `AnalysisResult` shape
- `14_Grading.md` -- answer key error flags surfaced here
- `15_Skill_Inference.md` -- skill tag override UI (second human gate)
- `16_Analysis_Pipeline.md` -- produces the data this screen displays
- `18_Student_Detail.md` -- clicking a student navigates here
- `19_Intervention_Planner.md` -- "View Intervention Plan" navigates here

## Screen Layout

Three vertical bands, scrollable. Each band answers a distinct question.

```
+--[ Breadcrumb: Dashboard / Chapter 4 Quiz - Fractions ]------+
|                                                               |
|  BAND 1: AT A GLANCE                                         |
|  [ Big number: class avg ]  [ Distribution chart ]  [ Stats ]|
|                                                               |
|  BAND 2: SKILL BREAKDOWN (if per-question data exists)        |
|  [ Skill row ]  [ Skill row ]  [ Skill row ]                 |
|                                                               |
|  BAND 3: TOP INTERVENTIONS                                    |
|  [ Intervention card ]  [ Intervention card ]  [ Card ]      |
|                                                               |
|  [ Student list toggle ]                                      |
+---------------------------------------------------------------+
```

## Band 1: At a Glance

### Big Number

Class average displayed as a large formatted percentage, center-left:

- `text-5xl font-bold` per design system
- Color matches mastery level: green (>80%), yellow (60-80%), red (<60%)
- Label below: "Class Average" in `text-slate-500`

### One-Sentence Summary

Below the big number, the AI-generated `classSummary.oneSentence` displayed in `text-base text-slate-700`. One or two sentences maximum. This is the headline takeaway.

### Score Distribution

A simple histogram or dot plot to the right of the big number. Shows the spread of student scores across bands.

Bands: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%. Each band shows a bar height proportional to the number of students in that range. Individual dots or student initials within bars if space permits.

The `distributionShape` label appears below the chart as a subtle descriptor: "Normal distribution" or "Bimodal -- two distinct groups."

Use a lightweight charting library (Recharts recommended) for this single visualization. No other charts exist in the app.

### Quick Stats

A row of compact stat cards to the right of or below the distribution:

| Stat | Value | Format |
|------|-------|--------|
| Students analyzed | `studentsAnalyzed` | "28 students" |
| Absent | `studentsAbsent` | "2 absent" (if > 0) |
| Median | `medianScore` | "78%" |
| Range | `minScore` - `maxScore` | "32% - 100%" |
| Std Dev | `stdDev` | "±15%" |

### Outlier Callouts

If outliers exist (>2 SD from mean), a subtle callout below the stats:

- Above: "Emma Johnson scored significantly above the class (98%)"
- Below: "Marcus Rivera scored significantly below the class (32%)"

Each name is a clickable link to Student Detail.

## Band 2: Skill Breakdown

Only shown when `skillInferenceResult` exists (Path A-Detailed and Path B). Hidden for Path A-Simple.

### Skill Table

Each row represents one unique skill tag, sorted by mastery level ascending (weakest skills first -- these need the most attention).

| Column | Content | Style |
|--------|---------|-------|
| Skill tag | Editable chip with mastery-colored background | Click to edit (override envelope) |
| Class mastery | Percentage + mastery bar | Bar filled to mastery %, colored green/yellow/red |
| Questions | Which question numbers test this skill | "Q1, Q4, Q7" in `text-xs text-slate-500` |
| Struggling | Count of students below 60% on this skill | "8 students" |
| Proficient | Count above 80% | "18 students" |

If more than 8 skills, show top 8 by impact (lowest mastery first). "Show all {N} skills" expansion link below.

### Skill Tag Editing (Second Human Gate)

Each skill tag chip shows a subtle pencil icon on hover. Clicking enters inline edit mode:

1. Current tag becomes an editable text input, pre-filled with current value
2. Dropdown of existing tags from this analysis for quick merge (select an existing tag to merge this one into it)
3. "Save" commits the override, sets `status: "corrected"` on the override envelope
4. "Cancel" reverts

After any skill edit, a banner appears at the top of Band 2:

```
You've edited skill tags. [ Re-analyze with corrections ] or continue with current results.
```

The "Re-analyze" button triggers re-analysis (see `16_Analysis_Pipeline.md`). The teacher can also ignore and keep the current analysis. The `stale` flag is set to `true` on the analysis document.

### Common Wrong Answers

Below each yellow/red skill row, expandable detail showing common wrong answers and misconception text:

```
▼ fraction addition with unlike denominators (62% mastery)
  
  Q3: 12 students chose "5/6" (added numerators and denominators)
  → Students treat fraction addition like whole number addition,
    operating on numerators and denominators independently.
```

The misconception text is AI-generated. The wrong answer data and counts are from computed stats.

## Band 3: Top Interventions

Shows up to 3 intervention cards from the analysis. These are previews -- the full intervention management happens on the Intervention Planner (see `19_Intervention_Planner.md`).

### Intervention Card

Each card uses the standard card pattern from the design system with a colored left border matching the target skill's mastery level.

| Element | Content |
|---------|---------|
| Scope badge | Purple/blue/orange pill: "Whole Class", "Small Group", "Individual" |
| Skill tag | The skill this intervention targets |
| Affected count | "8 students" or student names for individual scope |
| Misconception summary | One-sentence AI description of what students are getting wrong |
| Quick win | The `effortTiers.quick.label` + description (the lowest-effort option shown as preview) |

Cards are numbered by priority (1, 2, 3).

### Link to Full Planner

Below the intervention cards: "View Full Intervention Plan →" link navigates to `/analysis/{assignmentId}/interventions`.

If zero interventions were generated (Path A-Simple with high scores), show: "No interventions recommended. Your class performed well on this assignment."

## Answer Key Error Callout

If `GradedResult.answerKeyFlags` contains entries (Path B only), a prominent warning appears at the top of the screen, above Band 1:

```
⚠ Possible answer key error

Question 7: 85% of students answered "B" but your key says "D".
Is your answer key correct?

[ Keep "D" ]    [ Change to "B" ]
```

If the teacher clicks "Change," the answer key is updated, re-grading and re-analysis are triggered, and the page reloads with fresh results. If "Keep," the flag is dismissed for this session (not persisted -- it reappears on page reload as a safety measure).

## Stale Analysis Banner

If `analysis.stale` is `true` (teacher made corrections after analysis ran), a banner at the top:

```
Data has changed since this analysis was generated.
[ Re-analyze with corrections ]    [ Dismiss ]
```

"Dismiss" hides the banner for this session. The `stale` flag remains `true` until re-analysis runs.

## Student List

Below Band 3, a collapsible student list sorted by score ascending (struggling students first).

### Collapsed State (Default)

Shows a compact summary: "28 students analyzed. 3 below 60%. View student list ↓"

### Expanded State

Data table with sortable columns:

| Column | Content | Sortable |
|--------|---------|----------|
| Student name | Roster name, clickable to Student Detail | Yes (alpha) |
| Total score | Percentage | Yes (numeric) |
| Relative | "Above avg" / "Average" / "Below avg" badge | Yes |
| Gap skills | Skill tags where student is below mastery threshold | No |

Each row is clickable -- navigates to Student Detail (`/analysis/{assignmentId}/student/{studentId}`).

Default sort: score ascending (weakest first). Teacher can re-sort by clicking column headers.

## Navigation

### Breadcrumb

`Dashboard / {assignmentTitle}` at the top. "Dashboard" is a link back.

### Contextual Links

- Student names → Student Detail
- Intervention cards → Intervention Planner
- Class name in header → Class settings (see `07_Class_Roster_Management.md`)

### Gear Icon

Top-right gear icon opens class settings (edit class details, manage roster). See `07_Class_Roster_Management.md`.

## Data Loading

On mount:
1. Read assignment document (for title, class context, answer key flags)
2. Read analysis document (for all display data)
3. Read class document (for class name display)

Single Firestore read per document. The analysis document contains everything needed for Bands 1-3 and the student list. No additional queries.

Show skeleton loading per design system while data loads. The skeleton mimics the three-band layout with placeholder blocks.

## Path A-Simple Layout

Without per-question data, the screen is simpler:

- Band 1: identical (big number, distribution, stats)
- Band 2: hidden (no skill data)
- Band 3: score-based interventions ("students below 60%") without skill tags
- Student list: no "Gap skills" column

The screen is still useful -- it tells the teacher who is struggling and by how much.

## Responsive Behavior

- Desktop: three bands stack vertically, distribution chart beside big number
- Tablet: distribution chart moves below big number, intervention cards in a 2-column grid
- Mobile: single column, intervention cards stack vertically, skill table scrolls horizontally with sticky skill tag column

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Chart library | Gap | Recharts recommended for the score distribution histogram. Lightweight and React-native. Only this single chart exists in the app -- no other visualizations. |
| PDF export | Gap | Spec mentions a "Download PDF" button on this screen. No format or content spec. Deferred to post-MVP. See `23_Future_Features.md`. |
| Historical comparison | Gap | No "compared to last time" data. Each analysis is standalone. Post-MVP: trend lines across assignments for the same class. |
| Skill tag edit persistence | Assumption | Edits update the `skillInferenceResult` in `pipelineState` immediately. The analysis document retains the original skill tags until re-analysis runs. This means the skill breakdown on Class Overview shows the corrected tags but the misconception text and interventions still reference the original analysis. |
| Score display format | Assumption | All scores displayed as percentages (whole numbers, rounded). "78%" not "0.78" or "78.4%". Rounding: standard (0.5 rounds up). |
| Absent students | Assumption | Absent students do not appear in the student list, the distribution chart, or any computed stats. The "2 absent" callout in quick stats is the only mention. They appear in Student Detail if the teacher navigates there via the class roster. |
| Intervention card truncation | Assumption | Quick win description on the preview card is truncated to 2 lines with ellipsis. Full text visible on the Intervention Planner. |  
