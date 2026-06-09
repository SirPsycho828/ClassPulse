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
// Animation Variants
// ---------------------------------------------------------------------------

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ---------------------------------------------------------------------------
// Helper Components
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
        <span className="text-sm font-semibold uppercase tracking-wider text-accent">
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
        <p
          className={`mt-4 text-lg max-w-2xl ${
            light ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
        >
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

function Screenshot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
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
        <figcaption className="mt-3 text-sm text-muted-foreground text-center italic">
          {caption}
        </figcaption>
      )}
    </motion.figure>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="max-w-3xl mx-auto"
      >
        <span className="text-sm font-semibold uppercase tracking-wider text-accent">
          Nerdy Technical Challenge
        </span>
        <h1 className="mt-3 font-heading text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-[1.05]">
          ClassPulse
        </h1>
        <p className="mt-6 text-xl sm:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          AI-powered classroom analysis that turns a stack of graded papers into
          actionable teaching insights
        </p>
        <div className="mt-12">
          <a
            href="#challenge"
            className="inline-flex flex-col items-center gap-2 text-sm font-medium text-muted-foreground hover:text-accent transition-colors"
          >
            <span>Read the case study</span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <ArrowDown className="w-5 h-5" />
            </motion.div>
          </a>
        </div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2: The Challenge
// ---------------------------------------------------------------------------

function ChallengeSection() {
  const cards = [
    {
      icon: <Lightbulb className="w-5 h-5 text-accent" />,
      title: 'Problem Framing',
      desc: 'How I framed the problem and decided what is in scope for V1',
    },
    {
      icon: <Workflow className="w-5 h-5 text-accent" />,
      title: 'User Flow Design',
      desc: 'How I designed the core user flow for a teacher',
    },
    {
      icon: <Database className="w-5 h-5 text-accent" />,
      title: 'Data & Prompt Structure',
      desc: 'How I structured the data and the AI calls to get useful insights',
    },
  ];

  return (
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
        className="border-l-4 border-accent pl-6 pr-6 py-5 bg-background rounded-r-lg italic text-foreground/80 leading-relaxed space-y-4"
      >
        <p>
          Prototype a classroom analysis tool for teachers. Teachers should be able to
          upload a set of student assignments and receive an overview of how the class is
          performing. The system should identify patterns across the group, highlight
          common skill gaps, and surface which students need support in specific areas. It
          should also recommend focused lessons or interventions based on those patterns.
        </p>
        <p>
          Your solution should go beyond a basic "upload and analyze" flow. Consider the
          full teacher workflow — from initial upload through taking action on insights.
          Think about what layers of analysis would be genuinely useful, how insights
          should be prioritized and presented, and what the teacher actually does with
          this information.
        </p>
      </motion.blockquote>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mt-12 grid sm:grid-cols-3 gap-6"
      >
        {cards.map((card) => (
          <motion.div
            key={card.title}
            variants={fadeUp}
            className="bg-background rounded-xl p-6 border border-border shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              {card.icon}
            </div>
            <h3 className="font-heading font-semibold text-foreground">{card.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Problem Framing
// ---------------------------------------------------------------------------

function ProblemFramingSection() {
  const scopeCards = [
    {
      icon: <Upload className="w-5 h-5 text-primary" />,
      title: 'Three assignment paths',
      desc: 'Total scores only, per-question marks with AI skill inference, or ungraded answers with an answer key for algorithmic grading. Teachers choose the depth that fits their data.',
    },
    {
      icon: <ScanSearch className="w-5 h-5 text-primary" />,
      title: 'Photo upload + CSV import',
      desc: 'Photograph graded papers or drop a CSV. Mobile camera capture supported. Meeting teachers where they are — not forcing a new workflow.',
    },
    {
      icon: <User className="w-5 h-5 text-primary" />,
      title: '4-tier roster matching',
      desc: 'Exact match, alias match, fuzzy match, and unmatched — with teacher-saveable corrections. AI-extracted names rarely match rosters perfectly.',
    },
    {
      icon: <BarChart3 className="w-5 h-5 text-primary" />,
      title: 'Class & student analytics',
      desc: 'Score distribution, skill breakdown, mastery levels at class level. Individual student drill-down with per-skill performance and AI-generated narrative.',
    },
    {
      icon: <Target className="w-5 h-5 text-primary" />,
      title: 'Intervention planner',
      desc: '3 prioritized interventions based on class-wide skill gaps. Each has 3 effort tiers: 5-min quick activity, 30-min focused lesson, 1-on-1 targeted session.',
    },
    {
      icon: <BookOpen className="w-5 h-5 text-primary" />,
      title: 'Editable skill tags',
      desc: 'AI infers which skills each question tests. Teachers can edit inline — they remain the domain expert. The AI proposes, the teacher decides.',
    },
  ];

  const decisionCards = [
    {
      icon: <Shield className="w-5 h-5 text-accent" />,
      title: 'Algorithmic stats, AI interpretation',
      desc: 'Mean, median, standard deviation, and distribution shape are computed algorithmically — deterministic and reproducible. AI generates the "so what": skill tags, narratives, intervention recommendations. The numbers are always trustworthy.',
    },
    {
      icon: <CheckCircle className="w-5 h-5 text-accent" />,
      title: 'Two human gates',
      desc: 'Gate 1: Review & Confirm after extraction — nothing goes to analysis without teacher approval. Gate 2: Skill tag editing on Class Overview — the teacher can override any AI inference. AI is a tool, not an authority.',
    },
    {
      icon: <Settings className="w-5 h-5 text-accent" />,
      title: 'Model-per-function architecture',
      desc: 'Different AI models for different strengths. Gemini Flash for fast vision/OCR extraction, Claude Sonnet for skill classification, Claude Opus for deep analysis. Each is configurable via an admin panel — swap models without code changes.',
    },
    {
      icon: <Code2 className="w-5 h-5 text-accent" />,
      title: 'Structured JSON output — never prose',
      desc: 'Every AI call returns structured JSON validated by shared Zod schemas. The same schemas run in Cloud Functions and the frontend. Catches malformed AI responses before they reach the teacher.',
    },
  ];

  const leftOut = [
    'Multi-assignment trend tracking',
    'Parent-facing reports',
    'LMS integrations',
    'Student self-service portals',
  ];

  return (
    <Section id="problem-framing">
      <SectionHeading
        overline="Criterion 1"
        title="Problem Framing"
        subtitle="I approached this as a product engineer, not just a coder. The question wasn't 'can I build an upload-and-analyze tool' — it was 'what does a teacher actually need to do differently after seeing the results?'"
      />

      <h3 className="font-heading text-xl font-semibold text-foreground mb-6">
        What I scoped into V1
      </h3>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid sm:grid-cols-2 gap-4 mb-16"
      >
        {scopeCards.map((card) => (
          <motion.div
            key={card.title}
            variants={fadeUp}
            className="flex gap-4 p-4 bg-card rounded-xl border border-border"
          >
            <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              {card.icon}
            </div>
            <div>
              <h4 className="font-heading font-semibold text-foreground text-sm">{card.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <h3 className="font-heading text-xl font-semibold text-foreground mb-6">
        Key design decisions
      </h3>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="space-y-4 mb-16"
      >
        {decisionCards.map((card) => (
          <motion.div
            key={card.title}
            variants={fadeUp}
            className="flex gap-4 p-5 bg-card rounded-xl border border-border"
          >
            <div className="shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              {card.icon}
            </div>
            <div>
              <h4 className="font-heading font-semibold text-foreground">{card.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="bg-muted/50 rounded-xl p-6 border border-border"
      >
        <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
          What I deliberately left out
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {leftOut.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Depth over breadth for V1. Nail the core loop — upload, analyze, act — before
          expanding to longitudinal tracking or external integrations. Every feature here
          serves the single-assignment workflow end to end.
        </p>
      </motion.div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Core User Flow
// ---------------------------------------------------------------------------

function CoreUserFlowSection() {
  const pills = [
    { label: 'Upload', icon: <Upload className="w-3.5 h-3.5" />, gate: false },
    { label: 'Extract', icon: <ScanSearch className="w-3.5 h-3.5" />, gate: false },
    { label: 'Review', icon: <CheckCircle className="w-3.5 h-3.5" />, gate: true },
    { label: 'Overview', icon: <BarChart3 className="w-3.5 h-3.5" />, gate: false },
    { label: 'Student', icon: <User className="w-3.5 h-3.5" />, gate: false },
    { label: 'Intervene', icon: <Target className="w-3.5 h-3.5" />, gate: true },
  ];

  return (
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
        viewport={{ once: true }}
        className="mb-16"
      >
        <div className="flex flex-wrap items-center gap-2">
          {pills.map((pill, i) => (
            <div key={pill.label} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                  pill.gate
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {pill.icon}
                <span>{pill.label}</span>
              </div>
              {i < pills.length - 1 && (
                <span className="hidden sm:block text-muted-foreground text-lg font-light">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-accent" />
            Amber pills = human gate (teacher must confirm before proceeding)
          </span>
        </p>
      </motion.div>

      {/* Step details */}
      <div className="space-y-16">
        {/* Step 1 */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="font-heading text-xl font-bold text-foreground">Upload</h3>
              <p className="mt-2 text-muted-foreground leading-relaxed">
                Teacher creates a new analysis via the Setup Wizard — choosing assignment
                type (total scores, per-question marks, or ungraded with answer key),
                entering assignment details, and configuring scoring. Then uploads photos
                of graded papers or a CSV from their gradebook. Mobile camera capture is
                fully supported.
              </p>
            </div>
          </div>
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

        {/* Step 2 */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading font-bold text-sm">
              2
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-heading text-xl font-bold text-foreground">
                  Extract &amp; Validate
                </h3>
                <span className="text-xs rounded-full px-3 py-0.5 bg-primary/10 text-primary font-medium">
                  AI Pass 1
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Gemini 2.5 Flash reads every uploaded image using vision/OCR — extracting
                student names, scores, and per-question marks. Names are matched against
                the class roster using a 4-tier algorithm: exact match, alias match, fuzzy
                match, and unmatched (surfaced for teacher review). All output is validated
                against a shared Zod schema before proceeding.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Step 3 */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-heading font-bold text-sm">
              3
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-heading text-xl font-bold text-foreground">
                  Review &amp; Confirm
                </h3>
                <span className="text-xs rounded-full px-3 py-0.5 bg-accent/10 text-accent font-medium">
                  Human Gate 1
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Teacher sees every extracted record — name matches, scores, any flagged
                uncertainties. They can correct mismatches, dismiss records, or save new
                name aliases. Nothing moves to analysis until the teacher explicitly
                confirms. This is the first and most critical quality gate.
              </p>
            </div>
          </div>
          <Screenshot
            src="/screenshots/review-confirm.png"
            alt="Review & Confirm page — teacher verifies extracted data"
            caption="Review & Confirm: every extraction is teacher-verified before analysis"
          />
        </motion.div>

        {/* Step 4 */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading font-bold text-sm">
              4
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-heading text-xl font-bold text-foreground">
                  Class Overview
                </h3>
                <span className="text-xs rounded-full px-3 py-0.5 bg-accent/10 text-accent font-medium">
                  Human Gate 2
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                The class dashboard shows algorithmically computed stats (mean, median,
                standard deviation, distribution shape) alongside AI-inferred skill
                breakdowns and mastery levels. Skill tags are editable inline — teachers
                can override any AI inference. Editing a skill tag triggers a targeted
                re-analysis pass.
              </p>
            </div>
          </div>
          <Screenshot
            src="/screenshots/class-overview.png"
            alt="Class Overview — stats, skill breakdown, mastery levels"
            caption="Class Overview: algorithmic stats + AI-inferred skills with inline editing"
          />
        </motion.div>

        {/* Step 5 */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading font-bold text-sm">
              5
            </div>
            <div>
              <h3 className="font-heading text-xl font-bold text-foreground mb-2">
                Student Detail
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Drill down into any student's performance. Per-skill mastery scores with
                class comparison, question-by-question breakdown, and an AI-generated
                narrative explaining the student's strengths, gaps, and recommended next
                steps — all grounded in the actual data, never hallucinated.
              </p>
            </div>
          </div>
          <Screenshot
            src="/screenshots/student-detail.png"
            alt="Student Detail — individual performance breakdown"
            caption="Student Detail: per-skill mastery with class comparison and AI narrative"
          />
        </motion.div>

        {/* Step 6 */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading font-bold text-sm">
              6
            </div>
            <div>
              <h3 className="font-heading text-xl font-bold text-foreground mb-2">
                Intervention Planner
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Three prioritized interventions based on class-wide skill gaps. Each
                intervention has three effort tiers: a 5-minute quick activity, a 30-minute
                focused lesson, and a 1-on-1 targeted session. Teachers pick the tier that
                fits their next class period. Every recommendation is grounded in the
                specific skills where the class fell short.
              </p>
            </div>
          </div>
          <Screenshot
            src="/screenshots/interventions.png"
            alt="Intervention Planner — prioritized recommendations"
            caption="Intervention Planner: 3 priorities x 3 effort levels = actionable next steps"
          />
        </motion.div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Data & Prompt Architecture
// ---------------------------------------------------------------------------

function DataArchitectureSection() {
  const pass1Bullets = [
    'Vision/OCR extraction of names, scores, and per-question marks',
    'Name matching against class roster (4-tier algorithm)',
    'Structured JSON output validated by shared Zod schema',
    'Flags low-confidence extractions for teacher review',
  ];

  const pass2Bullets = [
    'Skill inference — which skills does each question test?',
    'Class-level analysis: distribution shape, outliers, misconceptions',
    'Student narrative generation grounded in actual score data',
    'Intervention recommendations ranked by impact × frequency',
  ];

  const promptCards = [
    {
      icon: <Code2 className="w-5 h-5 text-primary" />,
      title: 'Structured JSON output',
      desc: 'Every AI call returns structured JSON — never free-form prose. The prompt explicitly specifies the expected schema, field names, and data types.',
    },
    {
      icon: <Shield className="w-5 h-5 text-primary" />,
      title: 'Shared Zod validation',
      desc: 'Same schemas in Cloud Functions and frontend. Malformed AI responses are caught before they reach the teacher — with detailed error context for debugging.',
    },
    {
      icon: <Layers className="w-5 h-5 text-primary" />,
      title: 'Algorithmic vs AI separation',
      desc: 'Stats are computed algorithmically — deterministic, reproducible, auditable. AI only generates interpretive content: tags, narratives, recommendations.',
    },
    {
      icon: <Cpu className="w-5 h-5 text-primary" />,
      title: 'Temperature tuning',
      desc: 'Low temperature for extraction (consistency over creativity). Moderate for analysis (nuanced interpretation without hallucination). Each function tuned independently.',
    },
  ];

  const modelRows = [
    { task: 'Extraction', model: 'Gemini 2.5 Flash', why: 'Fast, cost-effective, excellent vision/OCR capabilities' },
    { task: 'Skill Inference', model: 'Claude Sonnet', why: 'Strong reasoning and classification accuracy' },
    { task: 'Analysis', model: 'Claude Opus', why: 'Deepest analytical capability for nuanced interventions' },
  ];

  return (
    <Section id="data-architecture">
      <SectionHeading
        overline="Criterion 3"
        title="Data & Prompt Architecture"
        subtitle="Every AI call is structured, validated, and purpose-matched to a specific model. Stats are computed, not hallucinated."
      />

      {/* Two-pass pipeline */}
      <h3 className="font-heading text-xl font-semibold text-foreground mb-6">
        Two-pass AI pipeline
      </h3>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid md:grid-cols-2 gap-6 mb-16"
      >
        <motion.div
          variants={fadeUp}
          className="bg-card rounded-xl border border-border p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Eye className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-heading font-semibold text-foreground">Pass 1: Extract + Validate</h4>
              <p className="text-xs text-muted-foreground">Gemini 2.5 Flash (vision)</p>
            </div>
          </div>
          <ul className="space-y-2">
            {pass1Bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="bg-card rounded-xl border border-border p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h4 className="font-heading font-semibold text-foreground">Pass 2: Analyze</h4>
              <p className="text-xs text-muted-foreground">Claude Sonnet + Claude Opus</p>
            </div>
          </div>
          <ul className="space-y-2">
            {pass2Bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>

      {/* Model strategy */}
      <h3 className="font-heading text-xl font-semibold text-foreground mb-6">
        Model-per-function strategy
      </h3>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mb-4"
      >
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary/5 border-b border-border">
                <th className="text-left px-5 py-3 font-heading font-semibold text-foreground">Task</th>
                <th className="text-left px-5 py-3 font-heading font-semibold text-foreground">Model</th>
                <th className="text-left px-5 py-3 font-heading font-semibold text-foreground hidden sm:table-cell">Why This Model</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.map((row, i) => (
                <tr key={row.task} className={i < modelRows.length - 1 ? 'border-b border-border' : ''}>
                  <td className="px-5 py-3 font-medium text-foreground">{row.task}</td>
                  <td className="px-5 py-3 text-accent font-medium">{row.model}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="text-sm text-muted-foreground mb-4"
      >
        All models are configurable via an admin panel — swap models without code changes.
      </motion.p>
      <Screenshot
        src="/screenshots/admin-models.png"
        alt="Admin Model Configuration"
        caption="Admin panel: each AI function can use a different model, configurable at runtime"
      />

      {/* Prompt design principles */}
      <h3 className="font-heading text-xl font-semibold text-foreground mb-6 mt-8">
        Prompt design principles
      </h3>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid sm:grid-cols-2 gap-4"
      >
        {promptCards.map((card) => (
          <motion.div
            key={card.title}
            variants={fadeUp}
            className="bg-card rounded-xl border border-border p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {card.icon}
              </div>
              <h4 className="font-heading font-semibold text-foreground text-sm">{card.title}</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 6: Tech Stack
// ---------------------------------------------------------------------------

function TechStackSection() {
  const rows = [
    { layer: 'Frontend', tech: 'React 19 + TypeScript + Vite', why: 'Type-safe, fast HMR, modern React patterns' },
    { layer: 'Styling', tech: 'Tailwind CSS 4 + custom design tokens', why: 'Consistent "Chalk & Slate" design system via @theme' },
    { layer: 'Backend', tech: 'Firebase Cloud Functions (Node/TS, 2nd gen)', why: 'Serverless, scales to zero, co-located with Firestore' },
    { layer: 'Database', tech: 'Cloud Firestore', why: 'Real-time sync, flexible document model for analyses' },
    { layer: 'AI', tech: 'OpenRouter API', why: 'Model-agnostic gateway — swap models via admin config' },
    { layer: 'Validation', tech: 'Zod (shared schemas)', why: 'Same schema in Cloud Functions and frontend; catches bad AI output early' },
    { layer: 'Charts', tech: 'Recharts 3', why: 'Composable, React-native chart primitives' },
    { layer: 'Animation', tech: 'Framer Motion', why: 'Scroll-triggered reveals, spring physics, gesture support' },
    { layer: 'Auth', tech: 'Firebase Auth (email + Google)', why: 'Battle-tested, free tier sufficient for V1' },
  ];

  return (
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
        viewport={{ once: true }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary/5 border-b border-border">
              <th className="text-left px-5 py-3 font-heading font-semibold text-foreground w-28">Layer</th>
              <th className="text-left px-5 py-3 font-heading font-semibold text-foreground">Technology</th>
              <th className="text-left px-5 py-3 font-heading font-semibold text-foreground hidden md:table-cell">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.layer} className={i < rows.length - 1 ? 'border-b border-border' : ''}>
                <td className="px-5 py-3 font-medium text-accent shrink-0">{row.layer}</td>
                <td className="px-5 py-3 text-foreground">{row.tech}</td>
                <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 7: Built With
// ---------------------------------------------------------------------------

function BuiltWithSection() {
  return (
    <Section dark>
      <div className="text-center max-w-2xl mx-auto">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/20 mb-6">
            <Sparkles className="w-8 h-8 text-accent" />
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-primary-foreground leading-tight">
            Built 100% on Agent Mission Control
          </h2>
          <p className="mt-6 text-primary-foreground/80 leading-relaxed">
            ClassPulse was built entirely on{' '}
            <strong className="text-primary-foreground">Agent Mission Control</strong>, my
            proprietary development orchestration platform, using{' '}
            <strong className="text-primary-foreground">Claude Code</strong> as the agentic
            engine.
          </p>
          <p className="mt-4 text-primary-foreground/60 leading-relaxed">
            From architecture to deployment — every line of code, every design decision,
            every Cloud Function was created through AI-assisted engineering orchestrated by
            Agent Mission Control.
          </p>
        </motion.div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NerdyPresentation() {
  return (
    <div className="min-h-screen bg-background">
      <HeroSection />
      <ChallengeSection />
      <ProblemFramingSection />
      <CoreUserFlowSection />
      <DataArchitectureSection />
      <TechStackSection />
      <BuiltWithSection />

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-heading font-semibold text-primary text-sm">ClassPulse</div>
          <div className="text-xs text-muted-foreground">Nerdy Technical Challenge Submission</div>
        </div>
      </footer>
    </div>
  );
}
