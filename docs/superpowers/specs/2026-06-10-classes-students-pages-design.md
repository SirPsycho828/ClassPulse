# Classes & Students Pages — Longitudinal Tracking

**Date:** 2026-06-10
**Status:** Approved

## Overview

Add top-level Classes and Students pages to ClassPulse for longitudinal tracking of class and student progress across multiple analyses over time. Currently, every analysis is viewed in isolation — these pages provide the "big picture" view that teachers need to spot trends, recurring problems, and students who aren't responding to instruction.

## Architecture: Hybrid Data Strategy

- **Summary documents** (denormalized) power the list pages — fast reads for rendering many cards/rows at once.
- **Query-time aggregation** powers the detail pages — queries all analyses for a single class or student on demand, always accurate.

This avoids N queries on list pages while keeping detail pages simple and always up-to-date.

## Navigation

Top nav becomes: `Dashboard | Classes | Students | Admin`

## Routes

```
/classes                          → ClassesList page
/classes/:classId                 → ClassDetail page (tabbed layout)
  /classes/:classId               → Overview tab (index)
  /classes/:classId/roster        → Roster tab
  /classes/:classId/interventions → Intervention History tab

/students                         → StudentsList page (global)
/students/:classId/:studentId     → StudentDetailLongitudinal page
```

Existing analysis-scoped routes remain unchanged:
```
/analysis/:id                     → ClassOverview (single analysis)
/analysis/:id/students            → StudentList (single analysis)
/analysis/:id/student/:studentId  → StudentDetail (single analysis)
/analysis/:id/interventions       → InterventionPlanner (single analysis)
```

## Data Model — New Summary Documents

### `classSummaries/{classId}`

Updated by Cloud Function when an analysis completes, is deleted, or is re-run.

```typescript
{
  classId: string;
  teacherId: string;
  className: string;
  studentCount: number;
  analysisCount: number;
  lastAnalysisDate: string;          // ISO date of most recent analysis
  latestMeanScore: number;           // mean score from most recent analysis
  trend: "up" | "down" | "flat";    // comparing last 2 analyses' means
  sparklineData: number[];           // last N mean scores (up to 10)
  updatedAt: Timestamp;
}
```

### `studentSummaries/{classId_studentId}`

Composite key (flat collection, no subcollections) for easy querying.

```typescript
{
  classId: string;
  studentId: string;
  teacherId: string;
  studentName: string;
  className: string;
  analysisCount: number;
  lastAnalysisDate: string;
  latestScore: number;               // score from most recent analysis
  latestPercentile: number;          // percentile from most recent analysis
  trend: "up" | "down" | "flat";
  sparklineData: number[];           // last N scores (up to 10)
  updatedAt: Timestamp;
}
```

### When Summaries Are Updated

- `runAnalysis` completes successfully: update both class and student summaries
- Analysis re-run (stale re-analyze): update with new results

### Querying

- Classes list: `where("teacherId", "==", uid)` on `classSummaries`
- Students list: `where("teacherId", "==", uid)` on `studentSummaries`, optionally filtered by `classId`

## Page Designs

### Classes List Page (`/classes`)

**Layout:** Responsive card grid (1 col mobile, 2 col tablet, 3 col desktop).

**Each class card:**
- Class name (bold, clickable link to `/classes/:classId`)
- Student count + analysis count (e.g., "14 students - 5 analyses")
- Last analysis date (e.g., "Last analyzed Jun 10, 2026")
- Latest mean score (e.g., "78% avg")
- Trend arrow: green up, red down, gray flat (based on `trend` field)
- Sparkline: small inline chart of `sparklineData` (last ~10 mean scores)

**Actions:**
- "+ Add Class" button (opens existing `ClassForm` modal)
- Search/filter bar (text filter on class name)

**Empty states:**
- No classes: prompt to create one
- Class with no analyses: card shows "No analyses yet. Start one ->" linking to `/analysis/new` with class pre-selected

**Data source:** `classSummaries` collection.

### Class Detail Page (`/classes/:classId`)

**Layout:** Tabbed layout (similar to `AnalysisLayout`).

**Header area (always visible above tabs):**
- Class name + grade/subject
- Quick stats: student count, total analyses, latest mean score with trend arrow
- "New Analysis" button (pre-selects this class in SetupWizard)

#### Overview Tab (`/classes/:classId`, index route)

**Score Trend Chart:**
- Recharts line chart: x-axis = analysis date/title, y-axis = score %.
- Mean score as primary line, median as secondary dashed line.
- Each point clickable, links to `/analysis/:id`.

**Recurring Problem Skills:**
- Skills that appeared as red or yellow mastery across 2+ analyses.
- Table columns: skill name, number of analyses where weak, latest mastery level, trend (improving/worsening/stuck).
- Sorted by persistence (most recurring first).

#### Roster Tab (`/classes/:classId/roster`)

**Student table:**
- Columns: student name, analyses count, latest score, trend arrow, sparkline.
- Clicking student name navigates to `/students/:classId/:studentId` (longitudinal view).
- Sortable by name, latest score, or trend.

#### Intervention History Tab (`/classes/:classId/interventions`)

**All interventions** ever recommended for analyses in this class.
- Table columns: intervention name, skill tag, scope, status (pending/planned/in_progress/done/dismissed), source analysis (linked to `/analysis/:id`), date.
- Filterable by status.

**Data loading:** Query-time aggregation. Fetch all `analyses` where `classId` matches, plus relevant `interventions`. One class at a time, so query cost is acceptable.

### Students List Page (`/students`)

**Layout:** Searchable, filterable table.

**Table columns:**
- Student name (clickable link to `/students/:classId/:studentId`)
- Class name (clickable link to `/classes/:classId`)
- Analyses count
- Latest score
- Trend arrow (up/down/flat)
- Sparkline (last ~10 scores)
- Last analyzed date

**Controls:**
- Search bar: client-side filter on student name
- Class dropdown filter: "All Classes" default, or pick a specific class
- Sortable columns: name, class, latest score, trend, last analyzed

**Empty state:** "No students yet. Add students to a class to get started." with link to Classes page.

**Data source:** `studentSummaries` collection, filtered by `teacherId`. Class filter adds `classId` constraint.

### Student Detail Longitudinal Page (`/students/:classId/:studentId`)

**Layout:** Single scrollable page (not tabbed).

**Header area:**
- Student name + class name (linked to `/classes/:classId`)
- Quick stats: total analyses, latest score, overall trend arrow

#### Score History Section
- Recharts line chart: x-axis = analysis date/title, y-axis = score %.
- Each point clickable, links to analysis-scoped StudentDetail (`/analysis/:id/student/:studentId`).

#### Skill Mastery Progression Section
- Table of every skill assessed across all analyses.
- Columns: skill name, first seen (date), latest mastery level (green/yellow/red), trend (improving/worsening/stable), times assessed.
- Sorted by latest mastery (red first — worst skills at top).

#### Persistent Concerns Section
- Auto-generated: highlights skills that remained red or yellow across 2+ consecutive analyses.
- Each concern shows: skill name, consecutive weak count, mastery trajectory, linked analyses.
- If none: "No persistent concerns — this student is responding well to instruction."

**Data loading:** Query all `analyses` where `classId` matches, filter each analysis's `studentInsights[]` for this `studentId`. Client-side aggregation.

## Cross-Linking

### From existing views to new longitudinal views:
- **Analysis-scoped StudentDetail** (`/analysis/:id/student/:studentId`): add "View full history ->" link in header, navigates to `/students/:classId/:studentId`
- **ClassOverview** (`/analysis/:id`): class name becomes link to `/classes/:classId`
- **Dashboard**: class names in group headers become links to `/classes/:classId`

### From new longitudinal views to existing analysis-scoped views:
- **Longitudinal StudentDetail**: score chart points and analysis references link to `/analysis/:id/student/:studentId`
- **ClassDetail Overview tab**: score trend chart points link to `/analysis/:id`
- **ClassDetail Intervention History**: analysis column links to `/analysis/:id/interventions`

## Cloud Function Updates

### `runAnalysis` — append summary doc updates

After existing behavior (writing analysis doc + intervention docs):

1. Query all `analyses` for this `classId`, ordered by date.
2. Compute sparkline data (last 10 mean scores) and trend (compare last 2 means).
3. Write/update `classSummaries/{classId}`.
4. For each student in the current analysis's `studentInsights[]`:
   - Extract their scores from the already-fetched analyses (no additional queries).
   - Compute sparkline data and trend.
   - Write/update `studentSummaries/{classId_studentId}`.

No new Cloud Functions needed. Summary updates piggyback on `runAnalysis` completion.

## Security Rules

Summary docs are read-only for clients; only Cloud Functions write them:
- `classSummaries/{classId}`: read where `request.auth.uid == resource.data.teacherId`, no client writes
- `studentSummaries/{docId}`: read where `request.auth.uid == resource.data.teacherId`, no client writes
- Cloud Functions write with admin SDK (bypasses rules).

## Out of Scope

- Analysis deletion (no delete feature exists yet; summary cleanup deferred)
- Student transfer between classes
- Cross-class student deduplication (same student in multiple classes treated as separate)
- Exporting/printing longitudinal reports
