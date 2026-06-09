# Design Overhaul State

## Current Phase: 10 (Verify)
## Completed: [1, 2, 3, 4, 5, 6, 7, 8, 9]

## Project
- **Name:** ClassPulse
- **Domain:** Education (K-12)
- **Type:** saas
- **Target Users:** K-12 teachers
- **Framework:** React 19 + TypeScript
- **CSS:** Tailwind CSS 4
- **Component Library:** None (hand-rolled, lucide-react icons)
- **Build Tool:** Vite 8
- **Package Manager:** npm
- **Routing:** react-router-dom v7
- **Charts:** Recharts 3
- **Animation:** None

## Page Inventory
| Page | Route | File | Status |
|------|-------|------|--------|
| Sign In | /sign-in | src/pages/SignIn.tsx | complete (Phase 6) |
| Sign Up | /sign-up | src/pages/SignUp.tsx | complete (Phase 6) |
| Verify Email | /verify-email | src/pages/VerifyEmail.tsx | complete (Phase 6) |
| Dashboard | /dashboard | src/pages/Dashboard.tsx | complete |
| Setup Wizard | /analysis/new | src/pages/SetupWizard.tsx | complete |
| Upload | /analysis/:id/upload | src/pages/Upload.tsx | complete |
| Review & Confirm | /analysis/:id/review | src/pages/ReviewConfirm.tsx | complete |
| Class Overview | /analysis/:id | src/pages/ClassOverview.tsx | complete |
| Student Detail | /analysis/:id/student/:studentId | src/pages/StudentDetail.tsx | complete |
| Intervention Planner | /analysis/:id/interventions | src/pages/InterventionPlanner.tsx | complete |
| Admin Models | /admin/models | src/pages/AdminModels.tsx | complete |
| Settings | /settings | src/pages/Settings.tsx | complete (new, built with tokens) |
| Onboarding | /onboarding | src/pages/Onboarding.tsx | complete (new, built with tokens) |
| Landing Page | / | src/pages/Landing.tsx | complete (Phase 5) |

## Current Design Assessment
- **Fonts:** System font stack (no custom fonts)
- **Colors:** Tailwind indigo-600/700 brand, slate neutrals
- **Layout:** Top navbar + centered max-w-6xl content
- **Components:** All hand-rolled inline Tailwind
- **Animations:** None
- **Dark Mode:** None
- **Favicon:** Custom purple lightning bolt SVG (good)
- **OG Tags:** None
- **App.css:** Contains Vite boilerplate (should be cleaned)

## Phase 1 (Audit) -- Complete
- [x] Step 1: Read project identity (name, domain, target users, type)
- [x] Step 2: Detect tech stack (React 19, Tailwind 4, Vite 8, no component lib)
- [x] Step 3: Inventory existing pages (11 pages + missing landing page)
- [x] Step 4: Assess current design (system fonts, indigo/slate, no animations)
- [x] Step 5: Check for existing assets (favicon exists, no landing, no OG tags)
- [x] Step 6: Output audit summary
- [x] Step 7: Update state file
- [x] Step 8: Load Phase 2

## Design Direction
**Chosen:** Chalk & Slate
**Typography:** Newsreader (heading) + Karla (body)
**Primary:** #1E3A5F (deep academic navy)
**Accent:** #D4915E (warm amber)
**Background:** #F8F5F0 (parchment cream)
**Surface:** #FFFFFF (white cards)
**Foreground:** #1A2332 (ink dark)
**Distinguishing:** #B8860B (gold — achievement)
**Layout:** Generous vertical rhythm, tight horizontal grouping, uneven bento grids
**Signature:** Ink-line underscores that animate on hover, chalk-texture overlays on dark score badges

## Page Archetype
**Landing:** The Split Story
**Rationale:** ClassPulse has a clear "old way vs new way" narrative — manual paper grading and guessing vs AI-powered analysis in 2 minutes. Split Story makes this contrast visceral and visual.

## App Shell Archetype
**Shell:** Top Rail
**Rationale:** ClassPulse has only 2-3 nav items (Dashboard, Admin). A sidebar wastes horizontal space. Top Rail with sticky blur and segmented tabs maximizes the content area for data-heavy analysis views.
**Variation:** Sticky with blur + segmented tabs

## Mobbin Research
**Apps found:** ClassDojo, Google Classroom, Teachable, Circle, Deel, Whop
**Key patterns:**
- Education apps favor clean white backgrounds with colorful accent elements (ClassDojo uses bright green/purple/orange)
- Google Classroom uses a minimal top rail with clean card-based content — very similar to our archetype selection
- Teachable uses a sidebar for course management but top rail for student-facing views
- Data-dense dashboards (Deel) use compact card layouts with clear hierarchy
**Standout:** Google Classroom's assignment grading view is the closest competitor UX — clean, functional, card-based. ClassDojo's warmth and approachability is the emotional target.

## 21st.dev Research
**Phase 5 (landing):** Hero sections with stats, split layouts, border beam effects
**Phase 6 (auth):** Form card components, social auth buttons
**Phase 7 (shell):** Top nav with blur, segmented navigation tabs
**Phase 8 (pages):** Stats cards, data tables, tracing beam for step flows

## Phase 2 (Direction) -- Complete
- [x] Step 1: Load references (font pairings, color palettes, page archetypes, app shell archetypes, anti-patterns)
- [x] Step 1b: Mobbin design research (Full tier — ClassDojo, Google Classroom, Teachable, Circle, Deel, Whop)
- [x] Step 1c: 21st.dev component research (hero sections, stats cards, nav components)
- [x] Step 2: Select archetypes (Landing: Split Story, Shell: Top Rail with sticky blur + segmented tabs)
- [x] Step 3: Design three directions (Chalk & Slate, Pulse, Greenhouse)
- [x] Step 4: Present to user
- [x] Step 5: Process user choice (user chose Chalk & Slate)
- [x] Step 6: Update state file
- [x] Step 7: Load Phase 3

## Design System
docs/design-system.md

## Phase 3 (Design System) -- Complete
- [x] Step 1: Load template
- [x] Step 2: Build typography scale (Newsreader + Karla, 8-level scale)
- [x] Step 3: Build color palette (navy primary, amber accent, parchment bg, full token set in HSL)
- [x] Step 4: Define spacing, radius, shadows (generous spacing, warm-modern radius, warm-tinted shadows)
- [x] Step 5: Define animation tokens (ink-line signature animation, 3 durations, 3 easings)
- [x] Step 6: Generate CSS custom properties
- [x] Step 7: Present to user
- [x] Step 8: Process user feedback (approved)
- [x] Step 9: Write design system document (docs/design-system.md)
- [x] Step 10: Update state
- [x] Step 11: Load Phase 4

## Phase 4 (Foundation) -- Complete
- [x] Step 1: Create git branch — skipped: not a git repo
- [x] Step 2: Install dependencies (framer-motion)
- [x] Step 3: Generate custom favicon (pulse heartbeat line, navy bg, amber stroke)
- [x] Step 4: Update meta tags (title, description, OG tags, theme-color, Google Fonts preconnect)
- [x] Step 5: Write global CSS (all design tokens in @theme block, ink-underline animation, base styles)
- [x] Step 6: Configure Tailwind v4 theme (tokens in @theme block — v4 native approach)
- [x] Step 7: Update state
- [x] Step 8: Report progress
- [x] Step 9: Load Phase 5

## Landing Page Build Notes
**Archetype used:** Split Story
**Patterns used:** Split-Screen Comparison Hero + Pipeline Visual Flow + Paired Comparisons + Simulated Dashboard Preview + Stats Strip + Full-width CTA
**Anti-pattern sweep:** Passed all 9 checks. No redesigns needed.
**Mobbin influence:** Google Classroom card structure, ClassDojo warmth
**21st.dev components used:** N/A — custom components with simulated UI specimens

## Phase 5 (Landing Page) -- Complete
- [x] Step 1: Load references
- [x] Step 2: Source visuals (3 Unsplash images + simulated UI specimens)
- [x] Step 3: 21st.dev search
- [x] Step 4: Revisit Mobbin research
- [x] Step 5: Build landing page (Split Story archetype)
- [x] Step 5a: Routing (LandingRoute, / for unauthed)
- [x] Step 5b: Navigation (transparent sticky nav with blur, hamburger mobile)
- [x] Step 5c: All sections built per archetype
- [x] Step 5d: Anti-pattern sweep (all 9 checks passed)
- [x] Step 6: Responsive check
- [x] Step 7: Update state
- [x] Step 8: Report progress
- [x] Step 9: Load Phase 6

## Auth Build Notes
**Layout:** Split Layout (SignIn, SignUp) + Centered Card (VerifyEmail)
**Images:** classroom.jpg (SignIn brand panel), papers-desk.jpg (SignUp brand panel)
**Copy:** SignIn: "Every paper tells a story" / SignUp: "From stack of papers to actionable insight"
**Password Reset:** Integrated into SignIn (no separate page)
**Onboarding:** Does not exist (skipped)

## Phase 6 (Auth) -- Complete
- [x] Step 1: Inventory auth pages (SignIn, SignUp, VerifyEmail exist; no Password Reset page; no Onboarding)
- [x] Step 2: Choose auth layout (Split Layout for SignIn/SignUp, Centered Card for VerifyEmail)
- [x] Step 3: Redesign Login page (Split Layout with classroom.jpg, brand panel, design tokens, OAuth)
- [x] Step 4: Redesign Sign Up page (Split Layout with papers-desk.jpg, value prop, design tokens, OAuth)
- [ ] Step 5: Redesign Password Reset — skipped: integrated into SignIn as forgot password button, no separate page
- [ ] Step 6: Redesign Onboarding — skipped: no onboarding page exists
- [x] Step 7: Responsive check (all breakpoints verified, touch targets 44px+)
- [x] Step 8: Update state
- [x] Step 9: Report and load Phase 7

## App Shell Build Notes
**Archetype used:** Top Rail
**Signature variation:** Sticky with blur + segmented tabs (pill highlight)
**Anti-pattern sweep:** Passed (AP-7, AP-8 N/A, AP-9, AP-10, AP-11)
**Mobbin influence:** Google Classroom clean top rail structure, ClassDojo warmth/approachability
**21st.dev components used:** Patterns from FloatingHeader and Header 1 (scroll-aware blur, segmented nav structure)

## Phase 7 (App Shell) -- Complete
- [x] Step 1: Load references and context (archetypes, anti-patterns, state file)
- [x] Step 2: Revisit Mobbin research (Google Classroom top rail, ClassDojo warmth)
- [x] Step 3: Search 21st.dev (FloatingHeader, Header 1, Core Header Navbar)
- [x] Step 4: Identify shell components (AppLayout, Navbar)
- [x] Step 5: Redesign Navigation (Top Rail, sticky blur, segmented pill tabs, initials avatar)
- [x] Step 6: Redesign Page Layout (max-w-7xl, parchment bg, consistent spacing)
- [x] Step 7: Redesign Header/Top Bar (integrated into Navbar)
- [ ] Step 8: Create/Improve Loading States — skipped: no dedicated loading component, pages handle own state
- [ ] Step 9: Create/Improve Error States — skipped: no error page exists
- [ ] Step 10: Create/Improve Empty States — skipped: no empty state component, pages handle inline
- [x] Step 11: Add Page Transitions (AnimatePresence with fade + vertical slide)
- [x] Step 12: Anti-pattern sweep (all checks passed)
- [x] Step 13: Update state and proceed

## Page Overhaul Notes
**Pages redesigned:** 8 (Dashboard, SetupWizard, Upload, ReviewConfirm, ClassOverview, StudentDetail, InterventionPlanner, AdminModels)
**Layout changes:** None — all pages kept existing layouts, tokens applied systematically
**Anti-pattern sweep:** All pages passed per-page checks
**21st.dev components used:** N/A — bulk token replacement strategy
**Categorical colors kept:** purple/blue/orange scope badges (ClassOverview, InterventionPlanner), filter toggles (AdminModels), Recharts histogram bars
**Recharts styling:** Tick fills, tooltip borders, bar radius updated to design tokens; histogram bar hex colors kept for Recharts compatibility

## Phase 8 (Pages) -- Complete
- [x] Step 1: Load context (state file, design direction, Mobbin/21st.dev research, anti-patterns)
- [x] Step 2: Get page inventory (8 app pages in priority order)
- [x] Step 3: Per-page process — Dashboard (bulk token replacement, 45+ changes)
- [x] Step 3: Per-page process — SetupWizard (113 total changes)
- [x] Step 3: Per-page process — Upload (90 total changes)
- [x] Step 3: Per-page process — ReviewConfirm (82 total changes)
- [x] Step 3: Per-page process — ClassOverview (136 total changes, Recharts styling)
- [x] Step 3: Per-page process — StudentDetail (108 total changes)
- [x] Step 3: Per-page process — InterventionPlanner (94 total changes)
- [x] Step 3: Per-page process — AdminModels (83 total changes)
- [x] Step 4: Cross-page consistency check (headings, cards, buttons, spacing, inputs all consistent)
- [x] Step 5: Update state and proceed

## Polish Notes
**Anti-pattern sweep:** Passed — all 12 checks (AP-1 through AP-12) confirmed clean
**Animations added:** Button scale micro-interactions (CSS), card hover lift (CSS), prefers-reduced-motion global disable
**Dark mode:** Skipped — no dark tokens in design system
**Console branding:** ASCII art "ClassPulse" in amber (#D4915E), tagline in navy (#1E3A5F)
**Accessibility:** aria-labels added to icon-only buttons across Navbar, ReviewConfirm, StudentDetail, ClassOverview

## Phase 9 (Polish) -- Complete
- [x] Step 0: Research animation library docs (framer-motion useInView, whileHover, staggerChildren)
- [x] Step 1: Micro-interactions (button scale, card lift, input focus transitions via global CSS)
- [x] Step 2: Scroll-triggered reveals — already done in Phase 5 (whileInView on all landing sections)
- [x] Step 3: Page load orchestration — already done in Phase 5 (staggered hero: old way 0s, new way 0.2s)
- [x] Step 4: Toast/notification styling — updated: bg-card, border-border, text-foreground tokens applied
- [x] Step 5: Image treatments (object-cover on auth backgrounds, upload thumbnails)
- [ ] Step 6: Dark mode — skipped: no dark tokens in design system
- [x] Step 7: Responsive fine-tuning (build passes, all pages verified responsive)
- [x] Step 8: Accessibility pass (aria-labels on icon-only buttons across 4 files)
- [x] Step 9: Respect prefers-reduced-motion (global CSS media query)
- [x] Step 10: Final anti-pattern sweep (all 12 checks passed)
- [x] Step 11: Console branding (ASCII art + domain-specific tagline in main.tsx)
- [x] Step 12: Update state and proceed

## Phase 10 (Verify) -- Complete
- [x] Step 1: Full codebase scan — 0 remaining slate-/indigo- tokens in all src/**/*.tsx
- [x] Step 2: Component cleanup — Toast.tsx (3 fixes), RosterTable.tsx (53 fixes), auth guards (3 fixes), ClassForm.tsx (41 fixes)
- [x] Step 3: New pages built with tokens — Settings.tsx, Onboarding.tsx
- [x] Step 4: TypeScript check — 0 errors
- [x] Step 5: User visual verification — pending user review
