# Nerdy Presentation Page — Design Spec

**Date:** 2026-06-09
**Route:** `/nerdy/`
**Audience:** Nerdy hiring team evaluating ClassPulse as a take-home challenge submission
**Tone:** Confident, technical — product engineering voice

---

## Overview

A single-page scrolling case study at `/nerdy/` that showcases the ClassPulse project. The page is public (no auth required) and directly addresses the three evaluation criteria from Nerdy's challenge spec:

1. How the problem was framed and what was scoped for V1
2. How the core user flow was designed for teachers
3. How data and prompts are structured to get useful insights

The page also attributes the build to Agent Mission Control using Claude Code.

---

## Sections

### 1. Hero

- ClassPulse logo/name in Newsreader heading
- Tagline: "AI-powered classroom analysis that turns a stack of graded papers into actionable teaching insights"
- Subtext: "Built for the Nerdy Technical Challenge"
- Framer Motion fade-up entrance animation
- Clean, centered layout on parchment background

### 2. The Challenge

- Blockquote of the challenge brief (the exact spec text Nerdy provided)
- Below: three cards highlighting the evaluation criteria:
  - **Problem Framing** — "How you frame the problem and decide what is in scope for the first version"
  - **User Flow Design** — "How you design the core user flow for a teacher"
  - **Data & Prompt Structure** — "How you structure the data and the prompts or calls to get useful insights"
- Each card uses the navy/accent color scheme with subtle shadow

### 3. Problem Framing (Criterion 1)

Content covers:

- **What I scoped in for V1:**
  - Three assignment paths (A-Simple: total scores only; A-Detailed: per-question marks with AI skill inference; B-Objective: ungraded answers + answer key with algorithmic grading)
  - Photo upload of graded papers OR CSV import — meeting teachers where they are
  - Roster management with fuzzy matching (exact → alias → fuzzy → unmatched)
  - Class-level analytics: score distribution, skill breakdown, mastery levels
  - Individual student drill-down with per-skill performance
  - Intervention planner with 3 prioritized interventions × 3 effort levels
  - Editable AI-inferred skill tags — teacher remains the expert

- **Key design decisions:**
  - Stats computed algorithmically; AI generates interpretive content only (reliability + transparency)
  - Two human gates: Review & Confirm (after extraction), Skill tag editing (on Class Overview)
  - Model-per-function architecture: different AI models for different strengths
  - Structured JSON output from all AI calls — never prose

- **What I deliberately left out:**
  - Multi-assignment trend tracking (V2 feature — V1 focuses on single-assignment depth)
  - Parent-facing reports
  - LMS integrations
  - Student self-service portals
  - Rationale: depth over breadth for V1; nail the core loop before expanding

### 4. Core User Flow (Criterion 2)

Visual pipeline showing the 6-step teacher journey:

```
Upload → Extract & Validate → Review & Confirm → Class Overview → Student Detail → Interventions
```

Each step explained:

1. **Upload** — Teacher uploads photos of graded papers or a CSV. Mobile camera capture supported. Drag-and-drop on desktop. Up to 40 images per batch.

2. **Extract & Validate (AI Pass 1)** — Gemini 2.5 Flash (vision model) extracts student names and scores from photos. Zod schema validates the extraction output. Roster matching runs 4-tier fuzzy matching against the class roster.

3. **Review & Confirm (Human Gate 1)** — Teacher reviews every extracted record. Can correct names, scores, and matches before proceeding. Nothing goes to analysis without teacher approval.

4. **Class Overview** — Algorithmic stats: mean, median, standard deviation, distribution shape, outlier detection. AI-inferred skill tags mapped to each question. Mastery levels (high/medium/low) per skill. Teacher can edit skill tags inline (Human Gate 2).

5. **Student Detail** — Individual student performance card. Per-skill mastery breakdown. Comparison to class averages. AI-generated strengths and areas for growth.

6. **Intervention Planner** — 3 prioritized interventions based on class-wide skill gaps. Each intervention has 3 effort tiers: 5-min quick activity, 30-min focused lesson, 1-on-1 targeted session. Actionable and specific, not generic advice.

Screenshots from the live app will be captured via Playwright and placed between step descriptions.

### 5. Data & Prompt Architecture (Criterion 3)

Content covers:

- **Two-pass AI pipeline:**
  - Pass 1 (Extract + Validate): Vision model reads photos → structured JSON extraction → Zod validation → roster matching
  - Pass 2 (Analyze): Skill inference model tags questions → Analysis model generates interpretive content
  - Clear separation: extraction is a different AI task than analysis, so different models

- **Prompt design principles:**
  - All AI outputs are structured JSON with Zod schemas — never free-form prose
  - Prompts include the schema definition so the model knows the exact output shape
  - Few-shot examples embedded where format is critical
  - Temperature tuned per task (low for extraction, moderate for analysis)

- **Model-per-function strategy:**
  - Gemini 2.5 Flash: fast, cheap, excellent at vision/OCR tasks → extraction
  - Claude Sonnet: strong reasoning, good at classification → skill inference
  - Claude Opus: deepest analysis capability → intervention generation and class analysis
  - Configurable via admin panel — models can be swapped without code changes

- **Algorithmic vs AI separation:**
  - Stats (mean, median, std dev, distribution shape, outliers): computed algorithmically — deterministic, reproducible
  - Interpretive content (skill tags, strengths/weaknesses narratives, intervention recommendations): AI-generated
  - This separation means the numbers are always trustworthy; AI adds the "so what"

- **Shared validation (Zod):**
  - Same Zod schemas used in Cloud Functions and frontend
  - Extraction output validated before storage
  - Analysis output validated before display
  - Catches malformed AI responses before they reach the teacher

### 6. Tech Stack

Clean grid showing technology choices with brief rationale:

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19 + TypeScript + Vite 8 | Type safety, fast builds, modern React features |
| Styling | Tailwind CSS 4 | Utility-first, custom design tokens, zero runtime cost |
| Backend | Firebase Cloud Functions (2nd gen) | Serverless, scales to zero, integrated auth |
| Database | Cloud Firestore | Real-time sync, teacher-scoped security rules |
| AI | OpenRouter API | Model-agnostic routing, swap models without code changes |
| Validation | Zod 4 | Shared schemas between frontend and backend |
| Charts | Recharts 3 | Composable React charts for score distributions |
| Animation | Framer Motion | Polished micro-interactions and page transitions |
| Auth | Firebase Auth | Email/password + Google Sign-In, email verification |

### 7. Built With

- Statement: "ClassPulse was built 100% on Agent Mission Control, my proprietary software, using Claude Code"
- Brief explanation: Agent Mission Control is a development orchestration platform that manages Claude Code agents for end-to-end software delivery
- Positioned as a demonstration of both the product AND the tooling that built it

---

## Technical Implementation

### File Structure
- `src/pages/NerdyPresentation.tsx` — main page component
- `public/screenshots/` — captured screenshots from live app (via Playwright)
- Route added to `src/App.tsx` as a public route (no auth)

### Design System
- Uses Chalk & Slate design tokens throughout (same as rest of app)
- Fonts: Newsreader (headings), Karla (body)
- Colors: Navy primary, amber accent, parchment background
- Shadows, radii, spacing from existing CSS custom properties

### Animations
- Framer Motion `motion.div` with `whileInView` for section entrances
- Staggered fade-up for cards and list items
- Subtle, professional — no gimmicks

### Responsiveness
- Mobile-first, works on all viewports
- Pipeline visualization adapts to vertical on mobile
- Screenshot grid responsive (1-col mobile, 2-col tablet, 3-col desktop where appropriate)

### Route Configuration
- Public route: no `<PrivateRoute>` wrapper
- No `<PublicRoute>` wrapper either (it's not an auth page)
- Direct route: `<Route path="/nerdy" element={<NerdyPresentation />} />`

---

## Out of Scope

- No interactive demos or embedded app functionality
- No login/auth on this page
- No analytics tracking
- No CMS — content is hardcoded (this is a one-time submission)
