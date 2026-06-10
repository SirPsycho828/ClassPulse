# Analysis Page Tab Navigation Redesign

## Problem

The current ClassOverview page (`/analysis/:id`) is a single long-scroll page with four stacked sections: At a Glance, Skill Breakdown, Top Interventions (3 preview cards + a small text link to the full planner), and a collapsed Student List accordion. The Intervention Plan link and Student List are buried at the bottom, making them hard to discover. Teachers need to find the right information quickly.

## Design Decisions

1. **At a Glance stays as the hero** — it's the first thing a teacher wants to see
2. **Tabs are navigation links, not inline content** — each tab routes to its own page
3. **Students get their own route** — promoted from a collapsed accordion to a dedicated page
4. **Clean tabs with no preview cards** — the tabs themselves are sufficient wayfinding

## Tab Structure

| Tab | Route | Content |
|-----|-------|---------|
| **Class** | `/analysis/:id` (index) | At a Glance + Skill Breakdown |
| **Students** | `/analysis/:id/students` | Full sortable student table |
| **Interventions** | `/analysis/:id/interventions` | Existing InterventionPlanner content |

## Shared Layout: AnalysisLayout

A new wrapper component that all three tab pages (plus StudentDetail) share.

### Responsibilities

- Loads analysis doc, assignment title, class title, graded result (extracted from current ClassOverview `useEffect`)
- Renders the breadcrumb: `Dashboard / {assignmentTitle}`
- Renders the horizontal tab bar (active tab highlighted based on current route)
- Renders data-driven banners (stale analysis, answer key flags)
- Passes loaded data to children via React Router `<Outlet context={...} />`

Note: The skill edit banner stays in ClassOverview — it's driven by local UI state (`skillEdited` flag from skill tag editing), not by the analysis doc.

### Route Structure (App.tsx)

```
/analysis/:id              -> AnalysisLayout
  index                    -> ClassOverview (At a Glance + Skill Breakdown)
  /students                -> StudentList (new page)
  /interventions           -> InterventionPlanner (existing, refactored)
  /student/:studentId      -> StudentDetail (existing, refactored)
```

## Tab Bar Design

- Horizontal row immediately below the breadcrumb
- Uses `<Link>` elements (real navigation — back button works, URLs are shareable)
- Active tab: primary color underline + semibold text
- Inactive tabs: muted text, hover state
- Follows existing Chalk & Slate design system (navy primary, parchment background)
- Responsive: tabs should not wrap on mobile — use full-width horizontal scroll if needed, though 3 short labels ("Class", "Students", "Interventions") should fit

## Class Tab (Refactored ClassOverview)

### What stays
- At a Glance section (big score, stats grid, histogram, outliers)
- Skill Breakdown table (mastery bars, questions, struggling/proficient counts, editable skill tags, expandable common wrong answers)
- Guidance tip

### What's removed
- Breadcrumb (moved to AnalysisLayout)
- Data loading logic (moved to AnalysisLayout)
- Stale + answer key banners (moved to AnalysisLayout; skill edit banner stays here)
- Collapsed Student List accordion (now its own page)
- Top Interventions preview cards + "View Full Intervention Plan" link (now its own tab)

## Students Tab (New Page)

- Renders the full student table, always visible (no expand/collapse)
- Sortable columns: Name, Score, Standing, Gap Skills
- Default sort: score ascending (struggling students surface to top)
- Each student name links to `/analysis/:id/student/:studentId`
- No other content — clean and focused
- Receives analysis data from AnalysisLayout outlet context

## Interventions Tab (Refactored InterventionPlanner)

- Existing InterventionPlanner content and functionality unchanged
- Refactored to receive analysis data from AnalysisLayout outlet context instead of loading its own
- Breadcrumb removed (handled by AnalysisLayout)

## StudentDetail Page

- Stays inside AnalysisLayout (gets the tab bar)
- "Students" tab shows as active when viewing a student detail page (drilling into a student is conceptually under the Students tab)
- Refactored to receive analysis data from outlet context

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/components/layout/AnalysisLayout.tsx` | **Create** | Shared layout: data loading, breadcrumb, tab bar, banners, outlet |
| `src/pages/StudentList.tsx` | **Create** | New Students tab page with full student table |
| `src/pages/ClassOverview.tsx` | **Edit** | Remove data loading, breadcrumb, banners, student list, intervention cards; consume outlet context |
| `src/pages/InterventionPlanner.tsx` | **Edit** | Remove data loading + breadcrumb; consume outlet context |
| `src/pages/StudentDetail.tsx` | **Edit** | Remove data loading + breadcrumb; consume outlet context |
| `src/App.tsx` | **Edit** | Nest routes under AnalysisLayout |

## Out of Scope

- No changes to At a Glance or Skill Breakdown content/layout
- No changes to InterventionPlanner features (status tracking, notes, etc.)
- No changes to StudentDetail content
- No changes to the design system or global styles
