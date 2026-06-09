# UX Intuitiveness State

## Current Phase: 7 (Verify & Deploy) — In Progress
## Completed: [1, 2, 3, 4, 5, 6]

## Phase 7 (Verify & Deploy) — In Progress
- [x] Step 1: Final build (0 TypeScript errors)
- [x] Step 2: Re-walk workflows via Playwright — skipped: Firebase auth prevents automated login
- [x] Step 3: Re-score all pages (before/after comparison added to audit report)
- [x] Step 4: Anti-pattern final sweep (all 8 anti-patterns pass)
- [x] Step 5: Clean up test account — N/A: no test account created (auth limitation)
- [ ] Step 6: Commit all changes
- [ ] Step 7: Create pull request
- [ ] Step 8: Approve and merge PR
- [ ] Step 9: Deploy
- [x] Step 10: Update audit report (Results section appended)
- [ ] Step 11: Final report

## Phase 1 (Discovery) — Complete
- [x] Step 1: Read project identity
- [x] Step 2: Detect tech stack
- [x] Step 3: Inventory all pages
- [x] Step 4: Map navigation structure
- [x] Step 5: Identify existing UX patterns
- [x] Step 6: Check for design system
- [x] Step 7: Output discovery summary
- [x] Step 8: Write state file
- [x] Step 9: Load Phase 2

## Project
- **Name:** ClassPulse
- **Domain:** Education (K-12)
- **Target Users:** K-12 teachers (low-to-moderate technical sophistication)
- **Core Value Proposition:** Upload student work → get instant class-level analysis with skill breakdowns and targeted intervention plans
- **Framework:** React 19 + TypeScript
- **CSS:** Tailwind CSS 4 (design tokens in @theme block)
- **Component Library:** None (hand-rolled, lucide-react icons)
- **Router:** react-router-dom v7
- **State Management:** React Context (AuthContext)
- **Build Tool:** Vite 8
- **Animation:** Framer Motion
- **Icon Library:** Lucide React
- **Toast Library:** Custom (src/components/ui/Toast.tsx)
- **Charts:** Recharts 3
- **Package Manager:** npm

## Design System
- Chalk & Slate theme (warm academia)
- Fonts: Newsreader (heading) + Karla (body)
- Colors: Navy primary (#1E3A5F), amber accent (#D4915E), parchment background (#F8F5F0)
- All tokens as CSS custom properties in @theme block
- Semantic color tokens: --primary, --accent, --destructive, --success, --warning, --muted, etc.

## Page Inventory
| Page | Route | File | Type | Score |
|------|-------|------|------|-------|
| Landing | / | src/pages/Landing.tsx | landing | pending |
| Sign In | /sign-in | src/pages/SignIn.tsx | auth | pending |
| Sign Up | /sign-up | src/pages/SignUp.tsx | auth | pending |
| Verify Email | /verify-email | src/pages/VerifyEmail.tsx | auth | pending |
| Onboarding | /onboarding | src/pages/Onboarding.tsx | wizard | pending |
| Dashboard | /dashboard | src/pages/Dashboard.tsx | dashboard | pending |
| Setup Wizard | /analysis/new | src/pages/SetupWizard.tsx | form | pending |
| Upload | /analysis/:id/upload | src/pages/Upload.tsx | form | pending |
| Review & Confirm | /analysis/:id/review | src/pages/ReviewConfirm.tsx | form | pending |
| Class Overview | /analysis/:id | src/pages/ClassOverview.tsx | detail | pending |
| Student Detail | /analysis/:id/student/:studentId | src/pages/StudentDetail.tsx | detail | pending |
| Intervention Planner | /analysis/:id/interventions | src/pages/InterventionPlanner.tsx | detail | pending |
| Settings | /settings | src/pages/Settings.tsx | settings | pending |
| Admin Models | /admin/models | src/pages/AdminModels.tsx | settings | pending |

## Navigation Structure
- **Top Rail Navbar:** Dashboard, Admin (admin-only), Settings (gear icon), User avatar → Settings
- **Breadcrumbs:** ClassOverview, StudentDetail, InterventionPlanner, ReviewConfirm (Dashboard > Assignment > subpage)
- **No sidebar, no footer nav, no tabs within pages**

## Existing UX Patterns
- **Empty states:** Dashboard (icon + CTA + help text), InterventionPlanner (icon + message + back link), Onboarding step 2 (no special empty message). Missing on most other pages.
- **Loading states:** Consistent spinner + text on all data-loading pages (Loader2 animate-spin)
- **Error states:** Toast errors on API failures. Some inline error banners on auth pages. Missing retry guidance on most errors.
- **Help text:** Good on form pages (SetupWizard, Upload, Onboarding — placeholders, inline hints, warnings). Sparse on analysis pages.
- **Metrics:** Strong on ClassOverview (At a Glance grid, skill breakdown, histogram) and StudentDetail (score, percentile, skill comparison). Basic stats bar on Dashboard.
- **Progress:** Step indicators on SetupWizard (3 steps), Upload processing (3 steps), Onboarding (2 steps)
- **Toasts:** Used for success/error on mutations across all pages. Custom Toast component.
- **Breadcrumbs:** 4 analysis pages (ClassOverview, StudentDetail, InterventionPlanner, ReviewConfirm)
- **Disabled explanations:** Only ReviewConfirm explains disabled submit ("Resolve all yellow/red rows"). Settings explains disabled email. All others: disabled with no explanation.
- **Confirmation dialogs:** None anywhere in the app

## Phase 2 (Workflow Audit) — Complete
- [x] Step 1: Load references (workflow-gap-types.md)
- [x] Step 2: Discover workflows (5 workflows identified)
- [x] Step 3: Walk each workflow (12 gaps found)
- [x] Step 4: Identify cross-workflow dependencies
- [x] Step 5: Rate workflow health
- [x] Step 6: Output workflow map
- [x] Step 7: Update state
- [x] Step 8: Load Phase 3

## Workflow Map

### WF1: First-Time Setup — Bumpy
Path: Landing → Sign Up → Verify Email → Dashboard → (auto-redirect) → Onboarding → Dashboard
Dependencies: None
Gaps:
- [WF-001] Hidden Prerequisite at Onboarding Step 2 — RESOLVED: Added disabled button explanations
- [WF-002] Missing Handoff at Dashboard (post-onboarding) — RESOLVED: Added NextStepCard prompting first analysis

### WF2: Analyze an Assignment (primary recurring) — Bumpy
Path: Dashboard → SetupWizard → Upload → (auto) → ReviewConfirm → (auto) → ClassOverview
Dependencies: Requires WF1 (at least one class)
Gaps:
- [WF-003] Hidden Prerequisite at SetupWizard Step 3 — RESOLVED: Added per-step disabled explanations
- [WF-004] Dead End at Upload — RESOLVED: Added "Upload at least one image to begin" text
- [WF-005] Broken Feedback Loop at Upload (processing) — RESOLVED: Added elapsed time counter with "still working" reassurance
- [WF-006] Missing Handoff at ClassOverview — RESOLVED: Added GuidanceTip with first-time guidance

### WF3: Review Student Performance — Smooth
Path: ClassOverview → StudentDetail → (prev/next arrows) → StudentDetail → ClassOverview
Dependencies: Requires WF2 (completed analysis)
Gaps:
- [WF-007] Missing Handoff at StudentDetail — RESOLVED: Added NextStepCard linking to interventions when student has gaps

### WF4: Plan Interventions — Bumpy
Path: ClassOverview → InterventionPlanner → (back to) ClassOverview
Dependencies: Requires WF2 (completed analysis)
Gaps:
- [WF-008] Broken Feedback Loop at InterventionPlanner — RESOLVED: Added confirmation dialog for dismissing interventions
- [WF-009] Dead End at InterventionPlanner — RESOLVED: Added completion card when all interventions are done

### WF5: Manage Settings — Smooth
Path: Navbar (gear/avatar) → Settings → (save) → Settings
Dependencies: None
Gaps:
- [WF-010] Broken Feedback Loop at Settings — resolved previously with "No unsaved changes" text
- [WF-011] Hidden Prerequisite at Settings — resolved previously with "No unsaved changes" text

### Cross-Workflow Dependencies
- WF2 depends on WF1: Must have at least one class before creating an assignment
- WF3 depends on WF2: Must have a completed analysis to view student details
- WF4 depends on WF2: Must have a completed analysis with identified skill gaps
- Dashboard communicates WF1→WF2 dependency via redirect to Onboarding (if no classes)
- Dashboard NOW communicates "what to do next" after WF1 completes (NextStepCard)
- ClassOverview links to InterventionPlanner (WF2→WF4 handoff exists)
- ClassOverview links to StudentDetail (WF2→WF3 handoff exists)
- StudentDetail NOW links to InterventionPlanner (NextStepCard when student has gaps)

### Workflow Gap Summary
| ID | Gap Type | Workflow | Location | Status |
|----|----------|----------|----------|--------|
| WF-001 | Hidden Prerequisite | WF1 | Onboarding | resolved |
| WF-002 | Missing Handoff | WF1 | Dashboard (post-onboarding) | resolved |
| WF-003 | Hidden Prerequisite | WF2 | SetupWizard Step 3 | resolved |
| WF-004 | Hidden Prerequisite | WF2 | Upload | resolved |
| WF-005 | Broken Feedback Loop | WF2 | Upload (processing) | resolved |
| WF-006 | Missing Handoff | WF2 | ClassOverview | resolved |
| WF-007 | Missing Handoff | WF3 | StudentDetail | resolved |
| WF-008 | Broken Feedback Loop | WF4 | InterventionPlanner | resolved |
| WF-009 | Dead End | WF4 | InterventionPlanner | resolved |
| WF-010 | Broken Feedback Loop | WF5 | Settings | resolved |
| WF-011 | Hidden Prerequisite | WF5 | Settings | resolved |

## Phase 3 (Page Scorecard) — Complete
- [x] Step 1: Load references (ux-layers.md)
- [x] Step 2: Score each page (14 pages scored)
- [x] Step 3: Cross-reference with workflow gaps
- [x] Step 4: Generate findings (18 findings: 1 critical, 7 high, 7 medium, 3 low)
- [x] Step 5: Write audit report (docs/ux-audit-report.md)
- [x] Step 6: Present summary
- [x] Step 7: Update state
- [x] Step 8: Load Phase 4

## Findings List
| ID | Severity | Status | Pages | Fix |
|----|----------|--------|-------|-----|
| UX-001 | Critical | resolved | Onboarding, SetupWizard, Upload, Settings | Added disabled button explanations on all pages |
| UX-002 | High | resolved | Dashboard | Added NextStepCard prompting first analysis |
| UX-003 | High | resolved | ClassOverview | Added GuidanceTip with first-time guidance |
| UX-004 | High | resolved | StudentDetail | Added NextStepCard linking to interventions |
| UX-005 | High | resolved | InterventionPlanner | Added completion card when all done |
| UX-006 | High | resolved | InterventionPlanner | Added dismiss confirmation dialog |
| UX-007 | High | resolved | Dashboard | Added GuidanceTip for returning users |
| UX-008 | High | resolved | Upload | Added elapsed time counter with "still working" text |
| UX-009 | Medium | resolved | Dashboard | Addressed by UX-002 NextStepCard |
| UX-010 | Medium | resolved | ReviewConfirm | Added GuidanceTip explaining review process |
| UX-011 | Medium | resolved | ClassOverview | Addressed by UX-003 GuidanceTip |
| UX-012 | Medium | resolved | Upload | Added GuidanceTip explaining upload mode |
| UX-013 | Medium | resolved | AdminModels | Added GuidanceTip for admin model config |
| UX-014 | Medium | resolved | Settings | Added "No unsaved changes" text below Save |
| UX-015 | Medium | resolved | Onboarding | Addressed by UX-001 disabled explanations |
| UX-016 | Low | resolved | SetupWizard | Addressed by UX-001 disabled explanations |
| UX-017 | Low | resolved | StudentDetail | Added "No previous/next student" tooltips |
| UX-018 | Low | resolved | VerifyEmail | Added "Check your spam or junk folder" text |

## Phase 4 (Components) — Complete
- [x] Step 1: Load references (component-catalog.md, anti-patterns.md)
- [x] Step 2: Analyze findings for patterns (2 shared components, rest inline)
- [x] Step 3: Determine component directory (src/components/ux/)
- [x] Step 4: Fetch library docs — skipped: Tailwind v4 tokens already known from design overhaul
- [x] Step 5: Build components (GuidanceTip, NextStepCard)
- [x] Step 6: Verify build (0 TypeScript errors)
- [x] Step 7: Update state
- [x] Step 8: Load Phase 5

## Components Created
| Component | File | Used By |
|-----------|------|---------|
| GuidanceTip | src/components/ux/GuidanceTip.tsx | UX-003, UX-007, UX-010, UX-012, UX-013 |
| NextStepCard | src/components/ux/NextStepCard.tsx | UX-002, UX-004 |

## Phase 5 (Implementation) — Complete
- [x] Step 1: Load references (anti-patterns.md)
- [x] Step 2: Sort findings by priority
- [x] Step 3: Set up Playwright verification — skipped: Playwright auth not feasible for Firebase Google/email auth pages
- [x] Step 4: Implement fixes page by page (18 findings across 11 pages)
- [x] Step 5: Handle edge cases — reviewed, all additions use semantic tokens and work responsively
- [x] Step 6: Final build check (0 TypeScript errors)
- [x] Step 7: Update state
- [x] Step 8: Load Phase 6

## Pages Modified in Phase 5
| Page | Findings Fixed | Changes |
|------|---------------|---------|
| Onboarding | UX-001, UX-015 | Disabled button explanations for both steps |
| SetupWizard | UX-001, UX-016 | Per-step disabled button explanations |
| Dashboard | UX-002, UX-007, UX-009 | NextStepCard for first analysis, GuidanceTip for returning users |
| Upload | UX-001, UX-008, UX-012 | Disabled "Start Extraction" explanation, ElapsedTimer component, GuidanceTip for upload mode |
| ClassOverview | UX-003, UX-011 | GuidanceTip with first-time navigation guidance |
| StudentDetail | UX-004, UX-017 | NextStepCard to interventions, disabled arrow tooltips |
| InterventionPlanner | UX-005, UX-006, UX-009 | Completion card, dismiss confirmation dialog |
| ReviewConfirm | UX-010 | GuidanceTip explaining review process |
| Settings | UX-014 | "No unsaved changes" text below Save button |
| AdminModels | UX-013 | GuidanceTip for admin model config |
| VerifyEmail | UX-018 | "Check your spam or junk folder" text |

## Phase 6 (Onboarding) — Complete
- [x] Step 1: Fetch library docs (React Joyride via Context7)
- [x] Step 2: Design setup wizard — skipped: existing Onboarding.tsx already serves as setup wizard (2-step class+roster creation)
- [x] Step 3: Design app tour (4 stops: welcome, new analysis, nav tabs, settings)
- [x] Step 4: Design settings integration (restart wizard + replay tour buttons)
- [x] Step 5: Implement setup wizard — already exists at /onboarding (Onboarding.tsx)
- [x] Step 6: Implement site tour (AppTour.tsx with TourProvider, custom tooltip, auto-start)
- [x] Step 7: Implement settings integration (Onboarding section in Settings.tsx)
- [x] Step 8: Verify build (0 TypeScript errors)
- [ ] Step 9: Commit — skipped: user has not requested a commit
- [x] Step 10: Update state
- [x] Step 11: Load Phase 7

## Tour Configuration
| Stop | Target | Title | Content |
|------|--------|-------|---------|
| 1 | body (center) | Welcome to ClassPulse! | Quick tour intro, ~30 seconds |
| 2 | [data-tour="new-analysis"] | Analyze Student Work | How to start a new analysis |
| 3 | [data-tour="nav-tabs"] | Navigate the App | Tabs for Dashboard and other sections |
| 4 | [data-tour="settings-gear"] | Your Settings | Profile, school info, replay tour |

## Files Created/Modified in Phase 6
| File | Action |
|------|--------|
| src/components/ux/AppTour.tsx | Created: TourProvider, custom tooltip, tour steps, auto-start logic |
| src/components/layout/AppLayout.tsx | Modified: wrapped with TourProvider |
| src/components/layout/Navbar.tsx | Modified: added data-tour attributes to nav tabs and settings gear |
| src/pages/Dashboard.tsx | Modified: added data-tour attribute to New Analysis button |
| src/pages/Settings.tsx | Modified: added Onboarding section with restart wizard + replay tour |
| package.json | Modified: added react-joyride dependency |
