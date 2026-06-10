# Nerdy Presentation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional, single-page scrolling case study at `/nerdy/` that showcases ClassPulse as a Nerdy take-home challenge submission, directly addressing their three evaluation criteria.

**Architecture:** Single page component (`NerdyPresentation.tsx`) with 7 sections. Uses existing Chalk & Slate design tokens, Framer Motion for scroll animations, Lucide icons. Public route — no auth required. Screenshots captured from the live app via Playwright stored in `public/screenshots/`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4 (design tokens from index.css), Framer Motion, Lucide React, react-router-dom v7

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/NerdyPresentation.tsx` | Create | Main presentation page — all 7 sections |
| `src/App.tsx` | Modify (line 67) | Add public route for `/nerdy` |
| `public/screenshots/` | Create (dir) | Store captured app screenshots |

---

### Task 1: Add the `/nerdy` route to App.tsx

**Files:**
- Modify: `src/App.tsx:1-73`

- [ ] **Step 1: Add the import for NerdyPresentation**

At the top of `src/App.tsx`, after the existing page imports (line 22, after the `Onboarding` import), add:

```tsx
import NerdyPresentation from '@/pages/NerdyPresentation';
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, inside the `<Routes>` block, add the `/nerdy` route as a public route (no wrapper). Place it after the `<Route path="/verify-email" ...>` line (line 41) and before the onboarding route (line 44):

```tsx
            <Route path="/nerdy" element={<NerdyPresentation />} />
```

- [ ] **Step 3: Commit**

```bash
rtk git add src/App.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add /nerdy route for presentation page
EOF
)"
```

---

### Task 2: Create NerdyPresentation.tsx — Hero + Challenge sections

**Files:**
- Create: `src/pages/NerdyPresentation.tsx`

- [ ] **Step 1: Create the file with imports, Hero section, and Challenge section**

```tsx
import { motion } from 'framer-motion';
import {
  BookOpen,
  Upload,
  CheckCircle,
  BarChart3,
  User,
  Target,
  Lightbulb,
  Layers,
  Workflow,
  Database,
  Cpu,
  Shield,
  ArrowDown,
  Code2,
  Eye,
  BrainCircuit,
  ScanSearch,
  Settings,
  Sparkles,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ---------------------------------------------------------------------------
// Section wrapper — consistent spacing + scroll animation
// ---------------------------------------------------------------------------
function Section({
  children,
  id,
  className = '',
  dark = false,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={`py-20 sm:py-28 ${dark ? 'bg-primary text-primary-foreground' : ''} ${className}`}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------
function SectionHeading({
  overline,
  title,
  subtitle,
  light = false,
}: {
  overline?: string;
  title: string;
  subtitle?: string;
  light?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      className="mb-12 sm:mb-16"
    >
      {overline && (
        <span className={`text-sm font-semibold uppercase tracking-wider ${light ? 'text-accent' : 'text-accent'}`}>
          {overline}
        </span>
      )}
      <h2
        className={`mt-2 font-heading text-3xl sm:text-4xl font-bold leading-tight ${
          light ? 'text-primary-foreground' : 'text-foreground'
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-lg max-w-2xl ${light ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Screenshot component — renders a captured screenshot with browser chrome
// ---------------------------------------------------------------------------
function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <motion.figure
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      className="my-8"
    >
      <div className="rounded-xl overflow-hidden border border-border shadow-lg">
        {/* Browser chrome */}
        <div className="bg-primary/5 px-4 py-2 flex items-center gap-2 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-border" />
            <div className="w-2.5 h-2.5 rounded-full bg-border" />
            <div className="w-2.5 h-2.5 rounded-full bg-border" />
          </div>
          <div className="flex-1 bg-background rounded-md px-3 py-0.5 text-[10px] text-muted-foreground text-center">
            classpulse.app
          </div>
        </div>
        <img src={src} alt={alt} className="w-full" loading="lazy" />
      </div>
      {caption && (
        <figcaption className="mt-3 text-sm text-muted-foreground text-center italic">{caption}</figcaption>
      )}
    </motion.figure>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function NerdyPresentation() {
  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* HERO                                                              */}
      {/* ================================================================ */}
      <section className="pt-16 sm:pt-24 pb-16 sm:pb-20 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-sm font-semibold text-accent uppercase tracking-wider mb-4">
              Nerdy Technical Challenge
            </span>
            <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-[1.08] tracking-tight">
              ClassPulse
            </h1>
            <p className="mt-6 text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              AI-powered classroom analysis that turns a stack of graded papers
              into actionable teaching insights
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-12 flex justify-center"
          >
            <a
              href="#challenge"
              className="flex flex-col items-center gap-2 text-muted-foreground hover:text-accent transition-colors"
            >
              <span className="text-sm font-medium">Read the case study</span>
              <ArrowDown className="w-4 h-4 animate-bounce" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* THE CHALLENGE                                                     */}
      {/* ================================================================ */}
      <Section id="challenge" className="bg-card border-y border-border">
        <SectionHeading
          overline="The Brief"
          title="The Challenge"
          subtitle="What Nerdy asked me to build"
        />

        <motion.blockquote
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="border-l-4 border-accent pl-6 py-4 text-foreground/80 leading-relaxed italic bg-background rounded-r-lg"
        >
          <p className="mb-4">
            Prototype a classroom analysis tool for teachers. Teachers should be able to upload
            a set of student assignments and receive an overview of how the class is performing.
            The system should identify patterns across the group, highlight common skill gaps,
            and surface which students need support in specific areas. It should also recommend
            focused lessons or interventions based on those patterns.
          </p>
          <p>
            Your solution should go beyond a basic "upload and analyze" flow. Consider the full
            teacher workflow — from initial upload through taking action on insights. Think about
            what layers of analysis would be genuinely useful, how insights should be prioritized
            and presented, and what the teacher actually does with this information.
          </p>
        </motion.blockquote>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6"
        >
          {[
            {
              icon: <Lightbulb className="w-6 h-6" />,
              title: 'Problem Framing',
              desc: 'How I framed the problem and decided what is in scope for V1',
            },
            {
              icon: <Workflow className="w-6 h-6" />,
              title: 'User Flow Design',
              desc: 'How I designed the core user flow for a teacher',
            },
            {
              icon: <Database className="w-6 h-6" />,
              title: 'Data & Prompt Structure',
              desc: 'How I structured the data and the AI calls to get useful insights',
            },
          ].map((criterion) => (
            <motion.div
              key={criterion.title}
              variants={fadeUp}
              className="bg-background rounded-xl p-6 border border-border shadow-sm"
            >
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4">
                {criterion.icon}
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground">{criterion.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{criterion.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Remaining sections rendered below */}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `rtk tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/NerdyPresentation.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add NerdyPresentation page with Hero and Challenge sections
EOF
)"
```

---

### Task 3: Add Problem Framing section (Criterion 1)

**Files:**
- Modify: `src/pages/NerdyPresentation.tsx`

- [ ] **Step 1: Add the Problem Framing section**

In `NerdyPresentation.tsx`, replace the `{/* Remaining sections rendered below */}` comment with the Problem Framing section followed by a new placeholder comment:

```tsx
      {/* ================================================================ */}
      {/* PROBLEM FRAMING (Criterion 1)                                     */}
      {/* ================================================================ */}
      <Section id="problem-framing">
        <SectionHeading
          overline="Criterion 1"
          title="Problem Framing"
          subtitle="I approached this as a product engineer, not just a coder. The question wasn't 'can I build an upload-and-analyze tool' — it was 'what does a teacher actually need to do differently after seeing the results?'"
        />

        {/* What I scoped in */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <h3 className="font-heading text-2xl font-semibold text-foreground mb-6">
            What I scoped into V1
          </h3>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12"
        >
          {[
            {
              icon: <Upload className="w-5 h-5" />,
              title: 'Three assignment paths',
              desc: 'Total scores only, per-question marks with AI skill inference, or ungraded answers with an answer key for algorithmic grading. Teachers choose the depth that fits their data.',
            },
            {
              icon: <ScanSearch className="w-5 h-5" />,
              title: 'Photo upload + CSV import',
              desc: 'Photograph graded papers or drop a CSV. Mobile camera capture supported. Meeting teachers where they are — not forcing a new workflow.',
            },
            {
              icon: <User className="w-5 h-5" />,
              title: '4-tier roster matching',
              desc: 'Exact match, alias match, fuzzy match, and unmatched — with teacher-saveable corrections. AI-extracted names rarely match rosters perfectly.',
            },
            {
              icon: <BarChart3 className="w-5 h-5" />,
              title: 'Class & student analytics',
              desc: 'Score distribution, skill breakdown, mastery levels at class level. Individual student drill-down with per-skill performance and AI-generated narrative.',
            },
            {
              icon: <Target className="w-5 h-5" />,
              title: 'Intervention planner',
              desc: '3 prioritized interventions based on class-wide skill gaps. Each has 3 effort tiers: 5-min quick activity, 30-min focused lesson, 1-on-1 targeted session.',
            },
            {
              icon: <BookOpen className="w-5 h-5" />,
              title: 'Editable skill tags',
              desc: 'AI infers which skills each question tests. Teachers can edit inline — they remain the domain expert. The AI proposes, the teacher decides.',
            },
          ].map((item) => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              className="flex gap-4 p-4 bg-card rounded-xl border border-border"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                {item.icon}
              </div>
              <div>
                <h4 className="font-heading font-semibold text-foreground">{item.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Key design decisions */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <h3 className="font-heading text-2xl font-semibold text-foreground mb-6">
            Key design decisions
          </h3>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="space-y-4 mb-12"
        >
          {[
            {
              icon: <Shield className="w-5 h-5" />,
              label: 'Algorithmic stats, AI interpretation',
              detail: 'Mean, median, standard deviation, and distribution shape are computed algorithmically — deterministic and reproducible. AI generates the "so what": skill tags, narratives, intervention recommendations. The numbers are always trustworthy.',
            },
            {
              icon: <CheckCircle className="w-5 h-5" />,
              label: 'Two human gates',
              detail: 'Gate 1: Review & Confirm after extraction — nothing goes to analysis without teacher approval. Gate 2: Skill tag editing on Class Overview — the teacher can override any AI inference. AI is a tool, not an authority.',
            },
            {
              icon: <Settings className="w-5 h-5" />,
              label: 'Model-per-function architecture',
              detail: 'Different AI models for different strengths. Gemini Flash for fast vision/OCR extraction, Claude Sonnet for skill classification, Claude Opus for deep analysis. Each is configurable via an admin panel — swap models without code changes.',
            },
            {
              icon: <Code2 className="w-5 h-5" />,
              label: 'Structured JSON output — never prose',
              detail: 'Every AI call returns structured JSON validated by shared Zod schemas. The same schemas run in Cloud Functions and the frontend. Catches malformed AI responses before they reach the teacher.',
            },
          ].map((item) => (
            <motion.div
              key={item.label}
              variants={fadeUp}
              className="flex gap-4 p-5 bg-card rounded-xl border border-border"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                {item.icon}
              </div>
              <div>
                <h4 className="font-heading font-semibold text-foreground">{item.label}</h4>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* What I left out */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="bg-muted/50 rounded-xl p-6 border border-border"
        >
          <h3 className="font-heading text-xl font-semibold text-foreground mb-4">
            What I deliberately left out
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              'Multi-assignment trend tracking',
              'Parent-facing reports',
              'LMS integrations',
              'Student self-service portals',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                {item}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Rationale:</strong> Depth over breadth for V1.
            Nail the core loop — upload, analyze, act — before expanding to longitudinal tracking
            or external integrations. Every feature here serves the single-assignment workflow end to end.
          </p>
        </motion.div>
      </Section>

      {/* Remaining sections rendered below */}
```

- [ ] **Step 2: Verify it compiles**

Run: `rtk tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/NerdyPresentation.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add Problem Framing section to Nerdy presentation
EOF
)"
```

---

### Task 4: Add Core User Flow section (Criterion 2)

**Files:**
- Modify: `src/pages/NerdyPresentation.tsx`

- [ ] **Step 1: Add the User Flow section**

Replace the `{/* Remaining sections rendered below */}` comment with the User Flow section followed by a new placeholder:

```tsx
      {/* ================================================================ */}
      {/* CORE USER FLOW (Criterion 2)                                      */}
      {/* ================================================================ */}
      <Section id="user-flow" className="bg-card border-y border-border">
        <SectionHeading
          overline="Criterion 2"
          title="Core User Flow"
          subtitle="The teacher's journey from a stack of papers to an action plan. Six steps, two human gates, roughly two minutes."
        />

        {/* Pipeline visualization */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <div className="flex flex-wrap justify-center gap-3 sm:gap-2">
            {[
              { label: 'Upload', icon: <Upload className="w-4 h-4" /> },
              { label: 'Extract', icon: <ScanSearch className="w-4 h-4" /> },
              { label: 'Review', icon: <CheckCircle className="w-4 h-4" />, gate: true },
              { label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
              { label: 'Student', icon: <User className="w-4 h-4" /> },
              { label: 'Intervene', icon: <Target className="w-4 h-4" /> },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2 sm:gap-2">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                    step.gate
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {step.icon}
                  {step.label}
                </div>
                {i < arr.length - 1 && (
                  <span className="text-muted-foreground hidden sm:inline">→</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Step details with screenshots */}
        <div className="space-y-16">
          {/* Step 1: Upload */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                1
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">Upload</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mb-6">
              Teacher uploads photos of graded papers or a CSV export from their gradebook.
              Mobile camera capture is supported for in-classroom use. Drag-and-drop on desktop.
              Up to 40 images per batch.
            </p>
            <Screenshot
              src="/screenshots/setup-wizard.png"
              alt="Setup Wizard — creating a new analysis"
              caption="Setup Wizard: choose assignment type, enter details, configure scoring"
            />
            <Screenshot
              src="/screenshots/upload.png"
              alt="Upload page — drag and drop or camera capture"
              caption="Upload: drag-and-drop photos or use mobile camera capture"
            />
          </motion.div>

          {/* Step 2: Extract & Validate */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                2
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">Extract & Validate</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">AI Pass 1</span>
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-2xl">
              Gemini 2.5 Flash (vision model) extracts student names and scores from photos.
              Zod schema validates the extraction output. Roster matching runs 4-tier fuzzy
              matching against the class roster: exact → alias → fuzzy → unmatched.
            </p>
          </motion.div>

          {/* Step 3: Review & Confirm */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold">
                3
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">Review & Confirm</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">Human Gate 1</span>
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mb-6">
              Teacher reviews every extracted record. Can correct names, scores, and roster
              matches before proceeding. Nothing goes to analysis without explicit teacher approval.
              This is the first of two human gates — the AI proposes, the teacher decides.
            </p>
            <Screenshot
              src="/screenshots/review-confirm.png"
              alt="Review & Confirm page — teacher verifies extracted data"
              caption="Review & Confirm: every extraction is teacher-verified before analysis"
            />
          </motion.div>

          {/* Step 4: Class Overview */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                4
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">Class Overview</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">Human Gate 2</span>
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mb-6">
              Algorithmic stats: mean, median, standard deviation, distribution shape, outlier
              detection. AI-inferred skill tags mapped to each question. Mastery levels
              (high/medium/low) per skill. Teacher can edit skill tags inline — the second human gate.
            </p>
            <Screenshot
              src="/screenshots/class-overview.png"
              alt="Class Overview — stats, skill breakdown, mastery levels"
              caption="Class Overview: algorithmic stats + AI-inferred skills with inline editing"
            />
          </motion.div>

          {/* Step 5: Student Detail */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                5
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">Student Detail</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mb-6">
              Individual student performance card. Per-skill mastery breakdown with comparison
              to class averages. AI-generated strengths and areas for growth — specific to each student's performance pattern.
            </p>
            <Screenshot
              src="/screenshots/student-detail.png"
              alt="Student Detail — individual performance breakdown"
              caption="Student Detail: per-skill mastery with class comparison and AI narrative"
            />
          </motion.div>

          {/* Step 6: Intervention Planner */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                6
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">Intervention Planner</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mb-6">
              3 prioritized interventions based on class-wide skill gaps. Each intervention
              has 3 effort tiers: 5-min quick activity, 30-min focused lesson, 1-on-1 targeted
              session. Actionable and specific, not generic advice.
            </p>
            <Screenshot
              src="/screenshots/interventions.png"
              alt="Intervention Planner — prioritized recommendations"
              caption="Intervention Planner: 3 priorities x 3 effort levels = actionable next steps"
            />
          </motion.div>
        </div>
      </Section>

      {/* Remaining sections rendered below */}
```

- [ ] **Step 2: Verify it compiles**

Run: `rtk tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/NerdyPresentation.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add Core User Flow section with screenshot placeholders
EOF
)"
```

---

### Task 5: Add Data & Prompt Architecture section (Criterion 3)

**Files:**
- Modify: `src/pages/NerdyPresentation.tsx`

- [ ] **Step 1: Add the Data & Prompt Architecture section**

Replace the `{/* Remaining sections rendered below */}` comment with:

```tsx
      {/* ================================================================ */}
      {/* DATA & PROMPT ARCHITECTURE (Criterion 3)                          */}
      {/* ================================================================ */}
      <Section id="data-architecture">
        <SectionHeading
          overline="Criterion 3"
          title="Data & Prompt Architecture"
          subtitle="Every AI call is structured, validated, and purpose-matched to a specific model. Stats are computed, not hallucinated."
        />

        {/* Two-pass pipeline */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h3 className="font-heading text-2xl font-semibold text-foreground mb-6">
            Two-pass AI pipeline
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pass 1 */}
            <div className="bg-card rounded-xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-foreground">Pass 1: Extract + Validate</h4>
                  <span className="text-xs text-muted-foreground">Gemini 2.5 Flash (vision)</span>
                </div>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                  Vision model reads photos → structured JSON extraction
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                  Zod schema validation on extraction output
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                  4-tier roster matching against class roster
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                  Human gate: teacher reviews before proceeding
                </div>
              </div>
            </div>

            {/* Pass 2 */}
            <div className="bg-card rounded-xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <BrainCircuit className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-foreground">Pass 2: Analyze</h4>
                  <span className="text-xs text-muted-foreground">Claude Sonnet + Claude Opus</span>
                </div>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                  Skill inference model tags questions to skills
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                  Analysis model generates interpretive content
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                  Algorithmic stats computed in parallel
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                  Human gate: teacher can edit skill tags
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Model-per-function */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h3 className="font-heading text-2xl font-semibold text-foreground mb-6">
            Model-per-function strategy
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-heading font-semibold text-foreground">Task</th>
                  <th className="text-left py-3 px-4 font-heading font-semibold text-foreground">Model</th>
                  <th className="text-left py-3 px-4 font-heading font-semibold text-foreground">Why This Model</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-3 px-4 font-medium text-foreground">Extraction</td>
                  <td className="py-3 px-4">Gemini 2.5 Flash</td>
                  <td className="py-3 px-4">Fast, cost-effective, excellent vision/OCR capabilities</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 px-4 font-medium text-foreground">Skill Inference</td>
                  <td className="py-3 px-4">Claude Sonnet</td>
                  <td className="py-3 px-4">Strong reasoning and classification accuracy</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-foreground">Analysis</td>
                  <td className="py-3 px-4">Claude Opus</td>
                  <td className="py-3 px-4">Deepest analytical capability for nuanced interventions</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            All models are configurable via an admin panel — swap models without code changes.
          </p>
          <Screenshot
            src="/screenshots/admin-models.png"
            alt="Admin Model Configuration — configurable AI models per function"
            caption="Admin panel: each AI function can use a different model, configurable at runtime"
          />
        </motion.div>

        {/* Prompt design principles */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-12"
        >
          <h3 className="font-heading text-2xl font-semibold text-foreground mb-6">
            Prompt design principles
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: <Code2 className="w-5 h-5" />,
                title: 'Structured JSON output',
                desc: 'Every AI call returns structured JSON — never free-form prose. Prompts include the Zod schema definition so the model knows the exact output shape.',
              },
              {
                icon: <Shield className="w-5 h-5" />,
                title: 'Shared Zod validation',
                desc: 'Same schemas in Cloud Functions and frontend. Extraction output validated before storage. Analysis output validated before display.',
              },
              {
                icon: <Layers className="w-5 h-5" />,
                title: 'Algorithmic vs AI separation',
                desc: 'Stats are computed algorithmically — deterministic and reproducible. AI generates interpretive content. The numbers are always trustworthy; AI adds the "so what."',
              },
              {
                icon: <Cpu className="w-5 h-5" />,
                title: 'Temperature tuning',
                desc: 'Low temperature for extraction (accuracy matters most). Moderate temperature for analysis (creativity in intervention design). Tuned per task, not globally.',
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                className="flex gap-4 p-4 bg-card rounded-xl border border-border"
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {item.icon}
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-foreground">{item.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* Remaining sections rendered below */}
```

- [ ] **Step 2: Verify it compiles**

Run: `rtk tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/NerdyPresentation.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add Data & Prompt Architecture section to Nerdy presentation
EOF
)"
```

---

### Task 6: Add Tech Stack + Built With + Footer sections

**Files:**
- Modify: `src/pages/NerdyPresentation.tsx`

- [ ] **Step 1: Add the final three sections**

Replace the `{/* Remaining sections rendered below */}` comment with:

```tsx
      {/* ================================================================ */}
      {/* TECH STACK                                                        */}
      {/* ================================================================ */}
      <Section id="tech-stack" className="bg-card border-y border-border">
        <SectionHeading
          overline="Under the Hood"
          title="Tech Stack"
          subtitle="Every technology choice is intentional — optimized for the teacher workflow, not resume padding."
        />

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-heading font-semibold text-foreground">Layer</th>
                  <th className="text-left py-3 px-4 font-heading font-semibold text-foreground">Technology</th>
                  <th className="text-left py-3 px-4 font-heading font-semibold text-foreground">Why</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ['Frontend', 'React 19 + TypeScript + Vite 8', 'Type safety, fast builds, modern React features'],
                  ['Styling', 'Tailwind CSS 4', 'Utility-first, custom design tokens, zero runtime cost'],
                  ['Backend', 'Firebase Cloud Functions (2nd gen)', 'Serverless, scales to zero, integrated auth'],
                  ['Database', 'Cloud Firestore', 'Real-time sync, teacher-scoped security rules'],
                  ['AI', 'OpenRouter API', 'Model-agnostic routing, swap models without code changes'],
                  ['Validation', 'Zod 4', 'Shared schemas between frontend and backend'],
                  ['Charts', 'Recharts 3', 'Composable React charts for score distributions'],
                  ['Animation', 'Framer Motion', 'Polished micro-interactions and page transitions'],
                  ['Auth', 'Firebase Auth', 'Email/password + Google Sign-In, email verification'],
                ].map(([layer, tech, why], i) => (
                  <tr key={layer} className={i < 8 ? 'border-b border-border/50' : ''}>
                    <td className="py-3 px-4 font-medium text-foreground">{layer}</td>
                    <td className="py-3 px-4">{tech}</td>
                    <td className="py-3 px-4">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </Section>

      {/* ================================================================ */}
      {/* BUILT WITH                                                        */}
      {/* ================================================================ */}
      <Section id="built-with" dark>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-accent" />
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-primary-foreground leading-tight">
            Built 100% on Agent Mission Control
          </h2>
          <p className="mt-6 text-lg text-primary-foreground/70 max-w-2xl mx-auto leading-relaxed">
            ClassPulse was built entirely on{' '}
            <strong className="text-primary-foreground">Agent Mission Control</strong>,
            my proprietary development orchestration platform, using{' '}
            <strong className="text-primary-foreground">Claude Code</strong> as the agentic engine.
          </p>
          <p className="mt-4 text-primary-foreground/50 max-w-xl mx-auto leading-relaxed">
            From architecture to deployment — every line of code, every design decision,
            every Cloud Function was created through AI-assisted engineering
            orchestrated by Agent Mission Control.
          </p>
        </motion.div>
      </Section>

      {/* ================================================================ */}
      {/* FOOTER                                                            */}
      {/* ================================================================ */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-heading font-semibold text-primary text-sm">ClassPulse</div>
          <div className="text-xs text-muted-foreground">
            Nerdy Technical Challenge Submission
          </div>
        </div>
      </footer>
    </div>
  );
}
```

Note: Remove the `{/* Remaining sections rendered below */}` comment entirely — this is the final set of sections. The closing `</div>`, `);`, and `}` close the `NerdyPresentation` component.

- [ ] **Step 2: Verify it compiles**

Run: `rtk tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
rtk git add src/pages/NerdyPresentation.tsx
rtk git commit -m "$(cat <<'EOF'
feat: add Tech Stack, Built With, and Footer sections
EOF
)"
```

---

### Task 7: Capture screenshots from the live app

**Files:**
- Create: `public/screenshots/` directory with captured PNGs

**Prerequisites:** The dev server must be running (`pnpm dev`) and the app must have sample data (an existing analysis with completed results). The user must be logged in for authenticated pages.

- [ ] **Step 1: Start the dev server if not running**

Run: `rtk pnpm dev`

- [ ] **Step 2: Capture screenshots using Playwright MCP**

Navigate to each of these pages and take a screenshot. Save each to `public/screenshots/`:

1. **Setup Wizard** — Navigate to `/analysis/new`, screenshot as `setup-wizard.png`
2. **Upload** — Navigate to an upload page `/analysis/<id>/upload`, screenshot as `upload.png`
3. **Review & Confirm** — Navigate to `/analysis/<id>/review`, screenshot as `review-confirm.png`
4. **Class Overview** — Navigate to `/analysis/<id>`, screenshot as `class-overview.png`
5. **Student Detail** — Navigate to `/analysis/<id>/student/<studentId>`, screenshot as `student-detail.png`
6. **Intervention Planner** — Navigate to `/analysis/<id>/interventions`, screenshot as `interventions.png`
7. **Admin Models** — Navigate to `/admin/models`, screenshot as `admin-models.png`

For each screenshot:
- Use `mcp__playwright__browser_navigate` to go to the page
- Wait for content to load
- Use `mcp__playwright__browser_take_screenshot` to capture
- Save the file to `public/screenshots/<name>.png`

- [ ] **Step 3: Verify screenshots exist**

```bash
rtk ls public/screenshots/
```

Expected: 7 PNG files listed

- [ ] **Step 4: Commit**

```bash
rtk git add public/screenshots/
rtk git commit -m "$(cat <<'EOF'
feat: add app screenshots for Nerdy presentation page
EOF
)"
```

---

### Task 8: Visual verification with Playwright

**Files:** None (verification only)

- [ ] **Step 1: Navigate to the presentation page**

Use `mcp__playwright__browser_navigate` to go to `http://localhost:5173/nerdy`

- [ ] **Step 2: Take a full-page screenshot and review**

Use `mcp__playwright__browser_take_screenshot` to capture the page. Review for:
- All 7 sections render correctly
- Screenshots display within browser chrome frames
- Typography uses Newsreader headings / Karla body
- Colors match Chalk & Slate (navy, amber, parchment)
- Animations trigger on scroll (scroll down and re-screenshot)
- Responsive: resize to mobile width and screenshot again

- [ ] **Step 3: Fix any visual issues found**

If any issues are discovered, fix them in `src/pages/NerdyPresentation.tsx` and re-verify.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
rtk git add src/pages/NerdyPresentation.tsx
rtk git commit -m "$(cat <<'EOF'
fix: polish Nerdy presentation page after visual review
EOF
)"
```
