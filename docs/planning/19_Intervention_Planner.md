## Overview

The Intervention Planner turns analysis insights into teacher action. It answers: "What should I do next, and for whom?" The screen presents the AI-recommended interventions (maximum 3) with effort tier selection, status tracking, and student coverage visibility. The design philosophy is constraint-based -- present a small number of high-impact options rather than overwhelming the teacher with every possible action.

Route: `/analysis/{assignmentId}/interventions`

## Dependencies

- `02_Database_Schema.md` -- reads/writes `interventions` collection
- `04_UI_Design_System.md` -- scope badges, status badges, mastery colors, card patterns
- `05_Shared_Schemas.md` -- `AnalysisResult.interventions` shape
- `16_Analysis_Pipeline.md` -- creates intervention documents on analysis completion
- `17_Class_Overview.md` -- links to this screen from intervention preview cards
- `18_Student_Detail.md` -- misconception cards link to relevant interventions here

## Data Source

Intervention documents live in the `interventions` collection (not embedded in the analysis document). Query: `interventions` where `assignmentId == currentAssignment` and `teacherId == auth.uid`, ordered by `priority` ascending.

Each intervention is a standalone Firestore document so status updates, effort tier selection, and teacher notes can be written independently without touching the analysis document.

## Screen Layout

```
+--[ Breadcrumb: Dashboard / Chapter 4 Quiz / Interventions ]--+
|                                                               |
|  HEADER: Coverage summary                                     |
|  "3 interventions cover 22 of 28 students"                   |
|                                                               |
|  [ Intervention Card 1 - Priority 1 ]                        |
|  [ Intervention Card 2 - Priority 2 ]                        |
|  [ Intervention Card 3 - Priority 3 ]                        |
|                                                               |
|  FOOTER: Uncovered students                                   |
+---------------------------------------------------------------+
```

## Coverage Summary

Header bar showing how many students are addressed by at least one intervention:

```
3 interventions targeting 22 of 28 students
6 students not covered (performing well across all skills)
```

Coverage is the union of all `affectedStudentIds` across all interventions. A student appears in the count once even if affected by multiple interventions.

The "not covered" count is informational, not alarming. Students not covered are performing well -- they do not need intervention.

## Intervention Cards

Each card is an expanded, interactive version of the preview cards on Class Overview. Cards are ordered by priority (1 at top).

### Card Header

| Element | Content | Style |
|---------|---------|-------|
| Priority number | "#1", "#2", "#3" | Circle badge, `text-sm font-bold` |
| Skill tag | The targeted skill | Chip with mastery color |
| Scope badge | "Whole Class" / "Small Group" / "Individual" | Pill per design system |
| Status badge | Current status | Color-coded per design system |

### Misconception Summary

The AI-generated `misconceptionSummary` -- one or two sentences explaining what students are getting wrong and why. Displayed below the header in `text-sm text-slate-700`.

### Affected Students

Expandable list of students this intervention targets.

**Collapsed (default for whole-class and small-group):** "{N} students" as a count.

**Expanded:** Student names in a comma-separated list. Each name is a link to Student Detail. For individual scope, the name is shown directly (no collapse needed since it is 1-2 students).

### Effort Tier Selection

The core decision point. Three options presented as selectable cards in a horizontal row:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  ⚡ Quick     │  │  📖 Lesson   │  │  👤 1-on-1   │
│  5-Min Warm  │  │  30-Min      │  │  Check-In    │
│  Up          │  │  Reteach     │  │              │
│              │  │              │  │              │
│  Draw frac-  │  │  Fraction    │  │  Sit with    │
│  tion bars   │  │  strips      │  │  Marcus and  │
│  on board... │  │  activity... │  │  walk thru...|
└──────────────┘  └──────────────┘  └──────────────┘
```

Each tier shows:
- Tier label (`effortTiers.quick.label`, `.lesson.label`, `.individual.label`)
- Description text (AI-generated, 1-2 sentences)

**Selection behavior:**
- Click a tier to select it. Selected tier gets a `brand-600` border and `brand-50` background.
- Only one tier can be selected per intervention.
- Selection is saved immediately to `intervention.selectedEffortTier` in Firestore.
- The teacher can change selection at any time by clicking a different tier.

**No tier selected:** Default state after analysis. All three tiers shown with equal visual weight. No nudge toward a specific tier -- the teacher decides based on their time and context.

### Status Management

A dropdown or segmented control below the effort tiers:

| Status | Meaning | Visual |
|--------|---------|--------|
| `pending` | Default. Teacher hasn't acted. | Yellow badge |
| `planned` | Teacher intends to do this. | Blue badge |
| `in_progress` | Teacher is currently executing. | Purple badge |
| `done` | Completed. | Green badge |
| `dismissed` | Teacher decided not to act. | Gray badge, card visually muted |

Status transitions are freeform -- the teacher can move between any states. No enforced workflow. Changing status writes immediately to the intervention document.

**Dismissed behavior:** Card collapses to a single line showing skill tag + "Dismissed" badge. "Undo" link restores to `pending`. Dismissed interventions move to the bottom of the list.

### Teacher Note

Collapsible textarea below the status control: "Add a note..."

- Free text, no length limit
- Persisted to `intervention.teacherNote`
- Auto-saved on blur (no explicit save button)
- Use case: "Tried warm-up on Tuesday, will revisit Friday" or "Marcus was absent, reschedule"

### Planned Date

Optional date picker next to the status control. Shown when status is `planned` or `in_progress`.

- Simple date input (native HTML date picker)
- Persisted to `intervention.plannedDate`
- No calendar integration, no reminders -- just a reference for the teacher

## Uncovered Students Footer

Below all intervention cards, a section listing students not affected by any intervention:

```
Not covered by any intervention:
Emma Johnson (92%), David Park (88%), Sofia Chen (95%), ...

These students performed well across all assessed skills.
```

Names are links to Student Detail. Scores shown for context.

If all students are covered: "All students are addressed by at least one intervention." No footer section needed.

## Interaction Patterns

### Quick Decision Flow

The intended path for a time-pressed teacher:

1. Scan the 3 cards (30 seconds)
2. Pick an effort tier for the top-priority intervention (click)
3. Set status to "planned" (click)
4. Optionally repeat for cards 2 and 3
5. Done. Under 2 minutes.

The screen is designed so this flow requires no scrolling on desktop -- all 3 cards fit above the fold for typical intervention sizes.

### Selective Engagement

A teacher may address only intervention #1 and dismiss #2 and #3. This is valid. The screen does not nag about unaddressed interventions.

### Return Visits

The teacher can return to this screen at any time from the Dashboard (via the analysis card) or Class Overview (via the "View Intervention Plan" link). All status and note data persists.

## Re-Analysis Impact

When re-analysis runs (see `16_Analysis_Pipeline.md`), all intervention documents for this assignment are deleted and recreated from the new analysis. This resets all statuses to `pending` and clears teacher notes and planned dates.

A confirmation dialog before re-analysis warns: "Re-analyzing will reset your intervention progress (status, notes, dates). Continue?"

## Zero Interventions

If the analysis generated no interventions (high-performing class or Path A-Simple with all scores above threshold):

```
No interventions recommended.

Your class performed well on this assignment. 
No targeted skill gaps were identified.

[ ← Back to Class Overview ]
```

## Score-Based Interventions (Path A-Simple)

Without skill data, interventions are scoped by score bands instead of skill gaps:

| Instead of | Shows |
|------------|-------|
| Skill tag | "Students below 60%" |
| Misconception summary | "These students scored significantly below the class average." |
| Effort tier descriptions | Generic suggestions: "Quick review of key concepts", "Reteach lesson", "Individual check-in" |

Less specific but still actionable. The teacher knows which students need help, just not the precise skill gap.

## Responsive Behavior

- Desktop: cards stack vertically, effort tiers in a horizontal row within each card
- Tablet: same layout, effort tiers may wrap to 2+1 if card width is constrained
- Mobile: effort tiers stack vertically within each card. Cards take full width. Status and note controls remain accessible.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Intervention persistence across re-analysis | Assumption | Re-analysis deletes and recreates interventions. Teacher progress is lost. The confirmation dialog mitigates surprise. Post-MVP: preserve status on interventions that match by skill tag across re-analyses. |
| Custom interventions | Gap | The teacher cannot add their own intervention cards. Only AI-generated interventions appear. Post-MVP: "Add custom intervention" button with free-form skill tag, student selection, and note. |
| Intervention history | Gap | No record of past intervention statuses after re-analysis. No "what did I do last time for fractions?" lookup. Post-MVP feature tied to historical trends. See `23_Future_Features.md`. |
| Cross-analysis interventions | Gap | Each analysis has its own interventions. If two quizzes reveal the same skill gap, there are two separate intervention sets with no link between them. Post-MVP: cross-assignment intervention aggregation. |
| Notification / reminders | Gap | No email or push notification for planned interventions. The planned date is passive reference only. Teachers check the Dashboard for pending counts. |
| Effort tier descriptions quality | Assumption | AI-generated descriptions are actionable and grade-appropriate because the analysis prompt includes grade level and subject. If descriptions are too generic, the teacher adds specificity via the note field. |
| More than 3 interventions | Assumption | Hard cap of 3 from the analysis pipeline. If the teacher wants more, they would need to identify gaps manually from the skill breakdown on Class Overview. The cap is intentional to prevent overwhelm. |  
