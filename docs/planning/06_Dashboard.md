▸ Extended thinking (1034 chars)  
## Overview

The Dashboard is the teacher's home screen after sign-in. It answers one question: "What have I done and what needs attention?" The screen centers on a prominent "New Analysis" action and a reverse-chronological list of past analyses. It also serves as the onboarding entry point for first-time users via a designed empty state. No sidebar navigation -- the Dashboard is reached via the logo/app name in the top nav.

## Dependencies

- `01_Auth.md` -- PrivateRoute guard, teacher must be authenticated
- `02_Database_Schema.md` -- `assignments` and `interventions` collections
- `04_UI_Design_System.md` -- card pattern, status badges, empty state pattern
- `08_Assignment_Setup.md` -- "New Analysis" navigates to Setup wizard
- `17_Class_Overview.md` -- clicking a completed analysis navigates here

## Screen Layout

```
+--[ Top Nav ]------------------------------------------------+
| ClassPulse (logo)          Dashboard | Admin*    | Avatar   |
+-------------------------------------------------------------+
|                                                              |
|  [ New Analysis ]  (oversized primary button)                |
|                                                              |
|  [ Filter bar: Class dropdown | Date range ]                |
|                                                              |
|  [ Analysis Card ]                                           |
|  [ Analysis Card ]                                           |
|  [ Analysis Card ]                                           |
|  ...                                                         |
+-------------------------------------------------------------+
```

*Admin link visible only if `isAdmin: true` on teacher profile.

## Primary Action

"New Analysis" button sits at the top of the content area, visually dominant. Uses the oversized primary button style from the design system (`text-lg px-8 py-3`). Navigates to `/analysis/new` (Setup wizard, see `08_Assignment_Setup.md`).

On mobile, the button spans full width.

## Analysis List

### Data Source

Query `assignments` collection where `teacherId == auth.uid`, ordered by `createdAt` descending. Each card also needs a count of pending interventions, which requires a secondary query against `interventions` where `assignmentId == card.assignmentId` and `status == "pending"`.

**Performance note:** For MVP, fetch interventions counts per assignment. If this becomes slow with many analyses, denormalize the count onto the assignment document in a future optimization.

### Card Content

Each analysis renders as a card with:

| Element | Source | Display |
|---------|--------|---------|
| Assignment title | `assignment.title` | Card heading |
| Class name | Joined from `classes` collection via `assignment.classId` | Subheading, `text-slate-600` |
| Date | `assignment.date` | Formatted as "Jun 9, 2026" |
| Status badge | `assignment.status` | Color-coded badge (see below) |
| Summary line | Derived from analysis if complete | "Class avg 78% | 2 interventions pending" |
| Intervention count | From `interventions` query | Only shown if > 0 pending |

### Status Badges

| Assignment Status | Badge | Behavior on Click |
|-------------------|-------|-------------------|
| `complete` | Green "Complete" | Navigate to Class Overview (`/analysis/{id}`) |
| `needs_review` | Yellow "Needs Review" | Navigate to Review & Confirm (`/analysis/{id}/review`) |
| `reviewing` | Yellow "In Review" | Navigate to Review & Confirm |
| `analyzing` | Blue "Processing" (pulse) | Navigate to processing screen |
| `extracting` | Blue "Processing" (pulse) | Navigate to processing screen |
| `uploading` | Blue "Uploading" (pulse) | Navigate to Upload screen |
| `error` | Red "Error" | Navigate to error state with retry option |

Clicking any card navigates to the appropriate screen based on status. The teacher resumes exactly where they left off.

### Summary Line

For completed analyses, show a one-line summary derived from the analysis document:

- **With interventions pending:** "Class avg {meanScore}% | {pendingCount} interventions pending"
- **All interventions resolved:** "Class avg {meanScore}% | All interventions addressed"
- **No interventions generated:** "Class avg {meanScore}%"

The pending intervention count uses a warm but non-nagging tone. No exclamation marks, no urgency colors on the count itself. The number is informational.

### Card Interaction

- Entire card is clickable (not just the title)
- Hover: `shadow-md` transition per design system
- Click navigates based on status (see table above)

## Filters

Filter bar sits between the "New Analysis" button and the card list.

### Class Filter

Dropdown populated from the teacher's `classes` collection. Options:

- "All Classes" (default)
- One entry per class, showing class name

Selecting a class filters the analysis list to `classId == selectedClass`.

### Date Range Filter

Predefined options, not a date picker:

- "All Time" (default)
- "This Week"
- "This Month"
- "This Semester"

"This Semester" uses a simple heuristic: August-December = Fall, January-May = Spring. June-July shows the most recent semester.

### Filter Behavior

Filters are client-side for MVP (all assignments are fetched, then filtered in memory). A teacher with 6 classes and weekly analyses accumulates roughly 200 assignments per year -- client-side filtering is fine at this scale.

Filters are reflected in URL query params (`?class=abc&range=month`) so the state survives page refresh.

## Empty State

Shown when the teacher has zero assignments. This IS the onboarding experience -- there is no separate onboarding wizard.

```
+-----------------------------------------------------------+
|                                                            |
|              [Illustration/Icon]                           |
|                                                            |
|         Upload your first assignment to see                |
|            how your class is doing.                        |
|                                                            |
|              [ New Analysis ]                              |
|                                                            |
|     It takes about 3 minutes. You'll need photos           |
|     of student work or a CSV of scores.                    |
|                                                            |
+-----------------------------------------------------------+
```

- Centered vertically in the content area
- Icon: a simple clipboard or chart icon from the icon library (Heroicons/Lucide), not a custom illustration
- Headline and subtext use `text-slate-600`
- The CTA button matches the oversized primary style
- Helper text below the button sets expectations for what the teacher needs

### Post-First-Analysis Empty States

If the teacher has analyses but filters produce zero results:
- "No analyses found for [Class Name]" or "No analyses in this date range"
- No CTA button (the main "New Analysis" button is still visible above)

## Navigation Context

The Dashboard is the navigation root. From here, the teacher enters two flows:

1. **New analysis flow:** Dashboard -> Setup -> Upload -> Review -> Processing -> Class Overview
2. **Resume/review flow:** Dashboard -> (appropriate screen based on assignment status)

Breadcrumb on all downstream screens: `Dashboard / [Assignment Title]`. "Dashboard" is always a clickable link back.

The top nav "Dashboard" link is always visible and returns to this screen from anywhere in the app.

## Data Loading

On mount:
1. Fetch all assignments for the teacher (`teacherId == auth.uid`, ordered by `createdAt` desc)
2. Fetch all classes for the teacher (for the filter dropdown and card display)
3. Fetch intervention counts per completed assignment

Show skeleton loading (per design system) while data loads. The assignment list skeleton shows 3 placeholder cards.

If the teacher has no classes yet, the empty state still shows but the "New Analysis" flow will prompt class creation as its first step (see `08_Assignment_Setup.md`).

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Pagination | Assumption | No pagination for MVP. All assignments loaded at once. At the expected scale (~200/year), this is fine. Add cursor-based pagination if teachers accumulate significantly more. |
| Intervention count query | Assumption | One query per completed assignment to count pending interventions. Acceptable for MVP. If slow, denormalize the count onto the assignment document. |
| Analysis deletion | Gap | No delete action on cards in MVP. Teacher cannot remove old analyses from the Dashboard. Add a "Delete" option in the card's context menu post-MVP. |
| Multi-class summary | Gap | No cross-class aggregation. The Dashboard shows individual analyses, not "how is 5th Grade Math doing overall." This is a post-MVP analytics feature. |
| Gentle follow-up email | Gap | The User Journey step mentioned a follow-up email after first use. No email infrastructure exists. Deferred to post-MVP. See `23_Future_Features.md`. |
| Semester heuristic | Assumption | "This Semester" filter uses fixed month ranges (Aug-Dec, Jan-May). Does not account for year-round schools or non-US academic calendars. Acceptable for MVP target audience. |  
