# UX Intuitiveness Audit

## App Context
- **Name:** ClassPulse
- **Domain:** Education (K-12)
- **Target Users:** K-12 teachers (low-to-moderate technical sophistication)
- **Tech Stack:** React 19 + Tailwind CSS 4 + hand-rolled components (lucide-react icons)
- **Pages:** 14
- **Routes:** 14

## Workflow Map

### WF1: First-Time Setup — Bumpy
Path: Landing → Sign Up → Verify Email → Dashboard → (auto) → Onboarding → Dashboard
Gaps:
- [WF-001] Hidden Prerequisite at Onboarding — Disabled buttons with no explanation
- [WF-002] Missing Handoff at Dashboard (post-onboarding) — No "what's next" guidance

### WF2: Analyze an Assignment — Bumpy
Path: Dashboard → SetupWizard → Upload → ReviewConfirm → ClassOverview
Gaps:
- [WF-003] Hidden Prerequisite at SetupWizard — "Next" disabled, no reason
- [WF-004] Hidden Prerequisite at Upload — "Start Extraction" disabled, no reason
- [WF-005] Broken Feedback Loop at Upload — No progress %, no reassurance
- [WF-006] Missing Handoff at ClassOverview — No first-time guidance

### WF3: Review Student Performance — Smooth
Path: ClassOverview → StudentDetail → (prev/next) → ClassOverview
Gaps:
- [WF-007] Missing Handoff at StudentDetail — No link to student's interventions

### WF4: Plan Interventions — Bumpy
Path: ClassOverview → InterventionPlanner → ClassOverview
Gaps:
- [WF-008] Broken Feedback Loop at InterventionPlanner — No confirmation for dismiss
- [WF-009] Dead End at InterventionPlanner — No "all done" state

### WF5: Manage Settings — Smooth
Path: Navbar → Settings → (save) → Settings
Gaps:
- [WF-010] Broken Feedback Loop at Settings — No field-level dirty markers
- [WF-011] Hidden Prerequisite at Settings — Save disabled, no explanation

## Page Scorecard

| Page | Orient. | Actions | Progress | Guidance | Metrics | Empty | Next | Feedback | Intent | Score |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Landing | P | P | - | P | P | - | P | - | P | 6/6 |
| Sign In | P | P | - | P | - | - | P | P | P | 6/6 |
| Sign Up | P | P | - | P | - | - | P | P | P | 6/6 |
| Verify Email | P | P | - | P | - | - | / | P | P | 5/6 |
| Onboarding | P | / | P | P | - | M | P | / | P | 5/8 |
| Dashboard | P | P | / | M | P | P | M | / | P | 5/9 |
| Setup Wizard | P | / | P | P | - | - | P | / | P | 5/7 |
| Upload | P | / | P | P | - | P | P | / | / | 5/8 |
| Review & Confirm | P | P | P | / | P | - | P | P | / | 7/8 |
| Class Overview | P | P | - | M | P | - | / | P | / | 5/7 |
| Student Detail | P | / | - | M | P | - | M | P | / | 4/7 |
| Intervention Planner | P | / | P | / | P | P | M | / | / | 4/9 |
| Settings | P | P | - | P | - | - | - | / | P | 4/5 |
| Admin Models | P | P | - | / | P | - | - | P | / | 4/6 |

## Findings (Prioritized)

### Critical

- **UX-001** [Hidden Prerequisite] Disabled buttons across multiple pages have no explanation of WHY they're disabled. Teacher clicks, nothing happens, no feedback. (Pages: Onboarding, SetupWizard, Upload, Settings)
  Layer: Action Clarity | Severity: Critical | Fix: Add adjacent help text below disabled buttons explaining what's needed. Pattern: `<DisabledExplainer>` component.

### High

- **UX-002** [Missing Handoff] After completing onboarding (first class created), Dashboard shows generic empty state. No "what's next" guidance to create their first assignment. (Pages: Dashboard)
  Layer: Next Steps | Severity: High | Fix: State-aware welcome card on Dashboard when user has classes but 0 assignments. "Your class is ready! Create your first analysis."

- **UX-003** [Missing Handoff] ClassOverview has no first-time guidance. New teacher sees analysis results (score distribution, skill breakdown, interventions) but no explanation of what to look at first or what the metrics mean. (Pages: ClassOverview)
  Layer: Guidance | Severity: High | Fix: First-time `<GuidanceBanner>` on ClassOverview: "Here's what we found. Start with the At a Glance summary, then check the Skill Breakdown for specific gaps."

- **UX-004** [Missing Handoff] StudentDetail shows struggling skills but has no link to that student's interventions or recommended actions. Teacher sees the problem but not the solution. (Pages: StudentDetail)
  Layer: Next Steps | Severity: High | Fix: Add "Recommended Interventions" section or CTA linking to InterventionPlanner filtered to that student.

- **UX-005** [Dead End] InterventionPlanner has no completion state. After setting effort tiers and dates for all interventions, the page just sits there. No "You're all set" confirmation or next step suggestion. (Pages: InterventionPlanner)
  Layer: Next Steps | Severity: High | Fix: Show a completion card when all interventions have effort tiers assigned: "All interventions planned! Return to class overview."

- **UX-006** [Broken Feedback Loop] Dismissing an intervention happens immediately with no confirmation dialog. This is a destructive action (removes from active list). (Pages: InterventionPlanner)
  Layer: Feedback | Severity: High | Fix: Add confirmation dialog before dismiss. "Dismiss this intervention? It will be moved to the dismissed section."

- **UX-007** [Missing Guidance] Dashboard has no guidance for returning users. No indication of what's new, which analyses need attention, or what the teacher should do next. (Pages: Dashboard)
  Layer: Guidance | Severity: High | Fix: State-aware guidance: if any assignments are in 'needs_review' status, show a nudge. If all complete, show "All caught up."

- **UX-008** [Broken Feedback Loop] Upload processing has time estimate text ("Usually takes 15-30 seconds") but no actual progress percentage or "still working" reassurance if it runs longer. (Pages: Upload)
  Layer: Feedback | Severity: High | Fix: Add elapsed time counter and "still processing" message after 30s threshold.

### Medium

- **UX-009** [Partial Progress] Dashboard shows stats bar only when assignments exist, but doesn't show overall teaching progress or class health across multiple analyses. (Pages: Dashboard)
  Layer: Progress/Status | Severity: Medium | Fix: Show class-level health indicators: "3 analyses complete, 2 pending review" per class.

- **UX-010** [Partial Guidance] ReviewConfirm has clear metrics but limited guidance on HOW to resolve needs_review/unmatched rows for a first-time user. (Pages: ReviewConfirm)
  Layer: Guidance | Severity: Medium | Fix: Brief help text at top explaining the review process: "Verify each student match. Click the checkmark to confirm, pencil to edit, or X to exclude."

- **UX-011** [Partial Intent] ClassOverview is dense with data (histogram, skills table, intervention cards, student list). A new user may feel overwhelmed. (Pages: ClassOverview)
  Layer: Accessibility of Intent | Severity: Medium | Fix: Consider collapsible sections with clear section descriptions, or a guided first-run experience.

- **UX-012** [Partial Intent] Upload page has two distinct modes (images vs CSV) side by side. Not immediately clear which to choose or when. (Pages: Upload)
  Layer: Accessibility of Intent | Severity: Medium | Fix: Add brief header guidance: "Upload photos of student work for AI extraction, or upload a CSV/spreadsheet of scores directly."

- **UX-013** [Partial Guidance] AdminModels has technical content (model IDs, token counts, pricing) with minimal explanation. Non-technical teachers may be confused. (Pages: AdminModels)
  Layer: Guidance | Severity: Medium | Fix: Add header guidance: "These settings control which AI models power your analysis. The defaults work well for most teachers."

- **UX-014** [Partial Feedback] Settings Save button disabled when form is clean, with no explanation. (Pages: Settings)
  Layer: Feedback | Severity: Medium | Fix: Show "No changes to save" tooltip or adjacent text when hovering disabled Save.

- **UX-015** [Missing Empty State] Onboarding Step 2 — if the teacher hasn't parsed names yet, the preview area is blank with no message guiding them to paste names and click "Parse Names". (Pages: Onboarding)
  Layer: Empty States | Severity: Medium | Fix: Show inline placeholder: "Paste student names above and click 'Parse Names' to preview your roster."

### Low

- **UX-016** [Partial Feedback] SetupWizard "Next" button disabled at end of each step when validation fails but no inline validation messages shown until submission. (Pages: SetupWizard)
  Layer: Feedback | Severity: Low | Fix: Show real-time field validation as the user types (red border + message on required empty fields).

- **UX-017** [Partial Intent] StudentDetail prev/next navigation arrows are disabled at boundaries with no tooltip explaining "No more students". (Pages: StudentDetail)
  Layer: Action Clarity | Severity: Low | Fix: Add title/tooltip: "No previous student" / "No next student" on disabled arrows.

- **UX-018** [Partial Guidance] Verify Email page has a "Resend" link but no guidance on checking spam folder. (Pages: VerifyEmail)
  Layer: Guidance | Severity: Low | Fix: Add "Check your spam or junk folder" below the resend link.

## Summary
- **Total findings:** 18
- **By severity:** 1 critical, 7 high, 7 medium, 3 low
- **Pages with worst scores:** StudentDetail (4/7), InterventionPlanner (4/9), Settings (4/5)
- **Most common missing layer:** Next Steps (missing on 3 pages: Dashboard, StudentDetail, InterventionPlanner)
- **Workflows at risk:** WF1 (First-Time Setup — Bumpy), WF2 (Analyze Assignment — Bumpy), WF4 (Plan Interventions — Bumpy)

## Results

### Before/After Scorecard

| Page | Before | After | Change |
|------|--------|-------|--------|
| Landing | 6/6 | 6/6 | — |
| Sign In | 6/6 | 6/6 | — |
| Sign Up | 6/6 | 6/6 | — |
| Verify Email | 5/6 | 6/6 | +1 |
| Onboarding | 5/8 | 7/8 | +2 |
| Dashboard | 5/9 | 9/9 | +4 |
| SetupWizard | 5/7 | 7/7 | +2 |
| Upload | 5/8 | 8/8 | +3 |
| Review & Confirm | 7/8 | 8/8 | +1 |
| Class Overview | 5/7 | 7/7 | +2 |
| Student Detail | 4/7 | 7/7 | +3 |
| Intervention Planner | 4/9 | 8/9 | +4 |
| Settings | 4/5 | 5/5 | +1 |
| Admin Models | 4/6 | 6/6 | +2 |

**Average page score: 75% → 98%**

### What Changed

- **Findings resolved:** 18/18 (1 critical, 7 high, 7 medium, 3 low)
- **Pages modified:** 11
- **Components created:** GuidanceTip (`src/components/ux/GuidanceTip.tsx`), NextStepCard (`src/components/ux/NextStepCard.tsx`)
- **Onboarding:** Setup wizard (existing 2-step at `/onboarding`) + site tour (4 stops with custom tooltip via React Joyride)
- **Workflows fixed:** WF1 Bumpy→Smooth, WF2 Bumpy→Smooth, WF3 Smooth→Smooth, WF4 Bumpy→Smooth, WF5 Smooth→Smooth
- **Anti-pattern sweep:** All 8 anti-patterns checked — 0 violations
