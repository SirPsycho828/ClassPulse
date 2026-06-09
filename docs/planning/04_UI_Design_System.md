▸ Extended thinking (1216 chars)  
## Overview

ClassPulse targets time-starved K-12 teachers who are not data analysts. The UI must be immediately scannable, confidence about what it knows, and honest about what it is guessing. Every screen answers one question (see `00_README.md` for screen-to-question mapping). The design system prioritizes clarity and speed over visual complexity.

Built with Tailwind CSS. All values below map to Tailwind utilities or custom theme extensions.

## Dependencies

- Referenced by every feature file (`06_Dashboard.md` through `19_Intervention_Planner.md`)
- `05_Shared_Schemas.md` -- confidence scores and mastery levels drive color usage

## Color Palette

### Brand Colors

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `brand-600` | `#4F46E5` | `indigo-600` | Primary buttons, active nav, links |
| `brand-700` | `#4338CA` | `indigo-700` | Button hover |
| `brand-50` | `#EEF2FF` | `indigo-50` | Selected state backgrounds, subtle highlights |
| `brand-100` | `#E0E7FF` | `indigo-100` | Active filter chips |

### Semantic Colors (Mastery / Confidence)

These are the most important colors in the system. They appear on skill breakdown rows, confidence badges, and student performance indicators.

| Level | Token | Hex | Tailwind | Threshold |
|-------|-------|-----|----------|-----------|
| Strong | `mastery-green` | `#16A34A` | `green-600` | > 80% mastery |
| Developing | `mastery-yellow` | `#CA8A04` | `yellow-600` | 60-80% mastery |
| Needs support | `mastery-red` | `#DC2626` | `red-600` | < 60% mastery |

Background variants for table rows and cards:

| Level | Background | Border |
|-------|-----------|--------|
| Strong | `green-50` | `green-200` |
| Developing | `yellow-50` | `yellow-200` |
| Needs support | `red-50` | `red-200` |

### Confidence Indicators (Review & Confirm)

| Status | Color | Meaning |
|--------|-------|---------|
| Green row | `green-50` bg | High confidence, auto-confirmed |
| Yellow row | `yellow-50` bg, `yellow-600` left border | Low confidence, needs teacher review |
| Red row | `red-50` bg, `red-600` left border | Extraction failed, manual entry required |

### Neutral Palette

Use Tailwind's `slate` scale for text, borders, and backgrounds:
- Body text: `slate-900`
- Secondary text: `slate-600`
- Placeholder/disabled: `slate-400`
- Borders: `slate-200`
- Page background: `slate-50`
- Card/surface background: `white`

## Typography

| Element | Font | Size | Weight | Tailwind |
|---------|------|------|--------|----------|
| Page title | System sans | 24px | Semibold | `text-2xl font-semibold` |
| Section heading | System sans | 18px | Semibold | `text-lg font-semibold` |
| Card title | System sans | 16px | Medium | `text-base font-medium` |
| Body text | System sans | 14px | Normal | `text-sm` |
| Small/caption | System sans | 12px | Normal | `text-xs` |
| Big number (class avg) | System sans | 48px | Bold | `text-5xl font-bold` |

Use Tailwind's default font stack (`font-sans`). No custom fonts -- system fonts load instantly and feel native.

## Layout

### Page Shell

```
+--[ Top Nav ]---------------------------------------------+
| Logo/Name          Dashboard | Admin (if admin)  | Avatar |
+--------------------------------------------------------------+
|                                                              |
|  [ Page Content - max-w-6xl mx-auto px-4 py-6 ]             |
|                                                              |
+--------------------------------------------------------------+
```

- Top nav: `white` bg, `slate-200` bottom border, sticky
- Content area: `slate-50` bg, centered with `max-w-6xl`, horizontal padding `px-4` (mobile) / `px-6` (desktop)
- No sidebar. Navigation is top-bar + breadcrumbs + contextual back buttons.

### Responsive Breakpoints

| Breakpoint | Width | Layout adjustment |
|------------|-------|-------------------|
| Mobile | < 640px | Single column, stacked cards, horizontal scroll for wide tables |
| Tablet | 640-1024px | Two-column where natural, cards in grid |
| Desktop | > 1024px | Full layout, tables at full width |

Teachers will primarily use desktop/laptop, but tablet usage during class is plausible. Mobile is functional but not optimized.

## Key Components

### Cards

Used for: analysis list items, intervention recommendations, student summaries.

```
- Background: white
- Border: slate-200, rounded-lg
- Shadow: shadow-sm
- Padding: p-4 (compact) or p-6 (spacious)
- Hover on clickable cards: shadow-md transition
```

Intervention cards add a colored left border (4px) matching the mastery level of the targeted skill.

### Scope Badges

Used on intervention cards to indicate whole-class / small-group / individual.

| Scope | Style |
|-------|-------|
| Whole class | `bg-purple-100 text-purple-700` pill |
| Small group | `bg-blue-100 text-blue-700` pill |
| Individual | `bg-orange-100 text-orange-700` pill |

### Status Badges

Used on dashboard analysis cards and intervention planner.

| Status | Style |
|--------|-------|
| Complete | `bg-green-100 text-green-700` |
| Needs Review | `bg-yellow-100 text-yellow-700` |
| Processing | `bg-blue-100 text-blue-700` + subtle pulse animation |
| Planned | `bg-blue-100 text-blue-700` |
| In Progress | `bg-purple-100 text-purple-700` |
| Done | `bg-green-100 text-green-700` |
| Dismissed | `bg-slate-100 text-slate-500` |

### Data Tables

Used on: Review & Confirm, skill breakdown, student detail.

```
- Header: bg-slate-50, text-xs uppercase tracking-wide text-slate-500
- Rows: white bg, slate-200 border-b, hover:bg-slate-50
- Flagged rows: colored bg per confidence status (green/yellow/red)
- Cells: text-sm, py-3 px-4
- Clickable rows: cursor-pointer, hover highlight
```

Wide tables on small screens: horizontal scroll with the first column (student name) sticky.

### Buttons

| Variant | Style | Usage |
|---------|-------|-------|
| Primary | `bg-brand-600 text-white hover:bg-brand-700` | Main actions: "Start Extraction", "Confirm & Analyze" |
| Secondary | `border border-slate-300 text-slate-700 hover:bg-slate-50` | Secondary actions: "Cancel", "Back" |
| Danger | `bg-red-600 text-white hover:bg-red-700` | Destructive: "Delete Class" |
| Ghost | `text-brand-600 hover:bg-brand-50` | Inline actions: "View Students", "See all" |

Oversized primary button for "New Analysis" on Dashboard: `text-lg px-8 py-3`.

### Confidence Score Display

Inline confidence indicators appear next to AI-extracted values:

- High (>= 0.85): no indicator shown (clean UI for confident values)
- Medium (0.7-0.85): small `text-yellow-600` "(82%)" next to value
- Low (< 0.7): `text-red-600` "(61%)" next to value + yellow row highlight

### Skill Tag Chips

Displayed on Class Overview skill breakdown and Student Detail.

```
- Rounded pill: px-2.5 py-0.5 rounded-full text-xs font-medium
- Color matches mastery level (green/yellow/red variants)
- Edit icon: subtle pencil icon on hover, triggers inline edit
```

### Empty States

Every list/screen has a designed empty state. Pattern:

```
- Centered in content area
- Illustration or icon (subtle, not cartoon)
- Headline: what this screen shows
- Subtext: what to do to populate it
- Single CTA button
```

Dashboard empty state is the onboarding entry point: "Upload your first assignment to see how your class is doing." with a prominent "New Analysis" button.

### Loading / Processing States

**Inline loading:** Skeleton screens (pulsing `slate-200` blocks) matching the layout of the content being loaded. No spinners for page loads.

**AI Processing (10-20 sec):** Dedicated processing view with step-by-step status updates. Each step shows a check when complete:

```
Matching names...        [check]
Inferring skills...      [check]
Analyzing patterns...    [spinner]
```

Teacher stays on this screen until processing completes, then auto-navigates to Class Overview.

### Toasts / Notifications

- Success: `green-600` left border, brief auto-dismiss (3 sec)
- Error: `red-600` left border, persistent until dismissed
- Info: `blue-600` left border, auto-dismiss (5 sec)

Position: top-right, stacked.

## Accessibility

- All interactive elements keyboard-navigable
- Color is never the sole indicator -- mastery levels pair color with text labels ("Strong", "Developing", "Needs support") and the percentage value
- Minimum contrast ratio: 4.5:1 for text (WCAG AA). The specified color pairs meet this.
- Focus rings: `ring-2 ring-brand-600 ring-offset-2`
- Tables use proper `<th>` headers with `scope`
- Form inputs have visible labels (no placeholder-only labels)

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Logo / branding assets | Gap | The spec references image files at a specific path for favicons/logos/icons. These need to be integrated during build. No design specs for the logo itself. |
| Dark mode | Assumption | Not in scope. Single light theme. |
| Print styles | Assumption | Not in scope. PDF export (deferred) would handle printable output. |
| Animation / transitions | Assumption | Minimal. Processing step indicators and card hover transitions only. No page transitions or complex animations. |
| Illustration style for empty states | Gap | No spec on illustration style or source. Use simple icon compositions from a library (Heroicons/Lucide) rather than custom illustrations for MVP. |
| Chart library for histogram | Gap | Class Overview Band 1 shows a score distribution histogram/dot plot. No charting library specified. Recommend a lightweight option (e.g., Recharts) for this single use case. |  
