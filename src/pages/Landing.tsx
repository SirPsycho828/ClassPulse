import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Upload,
  BarChart3,
  Target,
  Clock,
  FileSpreadsheet,
  HelpCircle,
  Brain,
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Simulated UI Components (visual specimens, not interactive)
// ---------------------------------------------------------------------------

function SimulatedDashboard() {
  return (
    <div className="rounded-lg bg-card shadow-lg overflow-hidden border border-border text-[10px] sm:text-xs">
      {/* Simulated top bar */}
      <div className="bg-primary px-3 py-2 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-accent" />
        <span className="text-primary-foreground font-heading font-semibold text-xs">ClassPulse</span>
      </div>
      {/* Simulated content */}
      <div className="p-3 space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Class Avg', value: '78%', color: 'text-success' },
            { label: 'Need Help', value: '6', color: 'text-warning' },
            { label: 'Mastery', value: '72%', color: 'text-accent' },
          ].map((stat) => (
            <div key={stat.label} className="bg-background rounded-md p-2 text-center">
              <div className={`font-heading font-bold text-sm sm:text-base ${stat.color}`}>{stat.value}</div>
              <div className="text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
        {/* Simulated skill bars */}
        <div className="space-y-2">
          <div className="text-foreground font-medium">Skill Breakdown</div>
          {[
            { skill: 'Fractions', pct: 85, color: 'bg-success' },
            { skill: 'Decimals', pct: 62, color: 'bg-warning' },
            { skill: 'Word Problems', pct: 44, color: 'bg-destructive' },
          ].map((s) => (
            <div key={s.skill} className="space-y-0.5">
              <div className="flex justify-between text-muted-foreground">
                <span>{s.skill}</span>
                <span>{s.pct}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimulatedSpreadsheet() {
  return (
    <div className="rounded-md bg-white/80 border border-gray-300 overflow-hidden text-[9px] sm:text-[10px] font-mono opacity-70">
      <div className="bg-gray-200 px-2 py-1 flex gap-4 text-gray-500">
        <span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
      </div>
      {[
        ['Name', 'Q1', 'Q2', 'Q3', 'Total'],
        ['Sarah M.', '8', '?', '6', '=SUM('],
        ['James T.', '7', '9', '??', '#ERR'],
        ['Emily R.', '...', '8', '7', ''],
        ['...', '', '', '', ''],
      ].map((row, i) => (
        <div key={i} className={`px-2 py-0.5 flex gap-4 ${i === 0 ? 'bg-gray-100 font-bold' : 'border-t border-gray-200'}`}>
          {row.map((cell, j) => (
            <span key={j} className={`min-w-[32px] ${cell.includes('?') || cell.includes('ERR') ? 'text-red-500' : 'text-gray-600'}`}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison Pair Component
// ---------------------------------------------------------------------------

interface ComparisonProps {
  oldWay: { icon: React.ReactNode; title: string; desc: string };
  newWay: { icon: React.ReactNode; title: string; desc: string };
  index: number;
}

function ComparisonPair({ oldWay, newWay, index }: ComparisonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true, margin: '-80px' }}
      className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-0"
    >
      {/* Old Way */}
      <div className="bg-muted/60 p-6 sm:p-8 md:rounded-l-lg border-b md:border-b-0 md:border-r border-border">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
            {oldWay.icon}
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground/70">{oldWay.title}</h4>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{oldWay.desc}</p>
          </div>
        </div>
      </div>

      {/* New Way */}
      <div className="bg-card p-6 sm:p-8 md:rounded-r-lg border-t md:border-t-0 border-border">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-md bg-accent/15 flex items-center justify-center text-accent">
            {newWay.icon}
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground">{newWay.title}</h4>
            <p className="mt-1 text-sm text-foreground/70 leading-relaxed">{newWay.desc}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const navBg = useTransform(scrollYProgress, [0, 0.05], ['rgba(248,245,240,0)', 'rgba(248,245,240,0.95)']);
  const navShadow = useTransform(scrollYProgress, [0, 0.05], ['0 0 0 transparent', '0 1px 2px hsl(37 20% 60% / 0.08)']);

  const comparisons: ComparisonProps['oldWay' | 'newWay'][][] = [
    [
      { icon: <FileSpreadsheet className="w-5 h-5" />, title: 'Manual data entry', desc: 'Type every score into a spreadsheet. Pray you don\'t misread a 6 as a 0.' },
      { icon: <Upload className="w-5 h-5" />, title: 'Snap and upload', desc: 'Photograph your papers or drop a CSV. AI extracts every score in seconds.' },
    ],
    [
      { icon: <HelpCircle className="w-5 h-5" />, title: 'Guessing at patterns', desc: '"I think they\'re struggling with fractions?" Gut feeling, no data to back it up.' },
      { icon: <BarChart3 className="w-5 h-5" />, title: 'AI skill breakdown', desc: 'See exactly which skills each student has mastered and where gaps remain. Confidence scores included.' },
    ],
    [
      { icon: <Clock className="w-5 h-5" />, title: 'Hours of analysis', desc: 'Evenings and weekends calculating averages, identifying outliers, planning next steps.' },
      { icon: <Brain className="w-5 h-5" />, title: 'Two-minute insights', desc: 'Complete class analysis with mean, median, distribution shape, and outlier detection. Algorithmically computed, AI-interpreted.' },
    ],
    [
      { icon: <Target className="w-5 h-5" />, title: 'One-size-fits-all teaching', desc: 'Same lesson plan for everyone because there\'s no time to differentiate.' },
      { icon: <Target className="w-5 h-5" />, title: 'Targeted interventions', desc: 'Three effort tiers per recommendation: 5-min quick fix, 30-min lesson, or 1-on-1 session. You choose what fits.' },
    ],
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* Navigation                                                       */}
      {/* ================================================================ */}
      <motion.nav
        style={{ backgroundColor: navBg, boxShadow: navShadow }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-sm"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="font-heading text-xl font-bold text-primary">
            ClassPulse
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-4">
            <a href="#how-it-works" className="ink-underline text-sm text-foreground/70 hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#compare" className="ink-underline text-sm text-foreground/70 hover:text-foreground transition-colors">
              Compare
            </a>
            <Link
              to="/sign-in"
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Log In
            </Link>
            <Link
              to="/sign-up"
              className="text-sm font-medium bg-primary text-primary-foreground px-5 py-2.5 rounded-full hover:bg-primary/90 transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-2 text-foreground"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="sm:hidden bg-background border-t border-border px-4 py-4 space-y-3"
          >
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-foreground/70">How It Works</a>
            <a href="#compare" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-foreground/70">Compare</a>
            <Link to="/sign-in" className="block text-sm font-medium text-primary">Log In</Link>
            <Link to="/sign-up" className="block text-sm font-medium bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-center">Get Started Free</Link>
          </motion.div>
        )}
      </motion.nav>

      {/* ================================================================ */}
      {/* Split Hero                                                       */}
      {/* ================================================================ */}
      <section className="pt-24 sm:pt-32 pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left: The Old Way (muted) */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="order-2 lg:order-1"
            >
              <div className="relative">
                <div className="absolute -top-3 left-4 bg-muted text-muted-foreground text-xs font-medium px-3 py-1 rounded-full border border-border">
                  The old way
                </div>
                <div className="bg-muted/40 rounded-xl p-6 border border-border/60 space-y-4">
                  <SimulatedSpreadsheet />
                  <div className="flex items-center gap-3 text-muted-foreground text-sm">
                    <Clock className="w-4 h-4" />
                    <span>2+ hours per assignment</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Manual entry', 'No insights', 'Guesswork'].map((tag) => (
                      <span key={tag} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right: The New Way (vibrant) */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="order-1 lg:order-2"
            >
              <div className="space-y-6">
                <div>
                  <span className="inline-block text-sm font-medium text-accent mb-3">
                    With ClassPulse
                  </span>
                  <h1 className="font-heading text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-foreground leading-[1.1] tracking-tight">
                    Every paper tells
                    <br />
                    <span className="text-accent">a story.</span>
                    <br />
                    <span className="text-primary">Now you can read it.</span>
                  </h1>
                </div>
                <p className="text-lg text-foreground/70 leading-relaxed max-w-lg">
                  Upload a stack of student work. In two minutes, get a complete classroom analysis
                  with skill breakdowns, misconception detection, and targeted intervention plans.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/sign-up"
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-7 py-3 rounded-full font-medium hover:bg-primary/90 transition-colors shadow-md"
                  >
                    Start Free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    2-minute analysis
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>No credit card required</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* How It Works — Visual Pipeline (NOT 3 numbered circles)          */}
      {/* ================================================================ */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
              From paper stack to action plan
            </h2>
            <p className="mt-4 text-foreground/60 max-w-2xl mx-auto">
              Two passes. Two human gates. Complete transparency.
            </p>
          </motion.div>

          {/* Pipeline as a horizontal flow on desktop, vertical on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: 'Upload',
                desc: 'Photograph student papers or drop a CSV from your gradebook',
                visual: (
                  <div className="h-20 flex items-center justify-center">
                    <div className="w-16 h-20 bg-secondary rounded-md border border-border flex items-center justify-center relative">
                      <Upload className="w-6 h-6 text-primary" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                        <span className="text-[8px] text-white font-bold">AI</span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                step: 'Extract',
                desc: 'Vision AI reads every name, score, and answer from your images',
                visual: (
                  <div className="h-20 flex items-center justify-center">
                    <div className="space-y-1 text-[10px] font-mono text-primary/80">
                      <div className="bg-secondary/80 px-2 py-0.5 rounded">Sarah M. → 85/100</div>
                      <div className="bg-secondary/80 px-2 py-0.5 rounded">James T. → 72/100</div>
                      <div className="bg-secondary/80 px-2 py-0.5 rounded">Emily R. → 91/100</div>
                    </div>
                  </div>
                ),
              },
              {
                step: 'Review',
                desc: 'You verify the extraction. Correct any mistakes. AI proposes, you decide.',
                visual: (
                  <div className="h-20 flex items-center justify-center">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success text-xs font-bold">OK</div>
                      <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center text-warning text-xs font-bold">?</div>
                      <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success text-xs font-bold">OK</div>
                    </div>
                  </div>
                ),
              },
              {
                step: 'Analyze',
                desc: 'Stats engine + AI generate skill breakdowns and intervention plans',
                visual: (
                  <div className="h-20 flex items-center justify-center">
                    <div className="space-y-1 w-full max-w-[120px]">
                      {[85, 62, 44].map((pct, i) => (
                        <div key={i} className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct > 70 ? 'bg-success' : pct > 50 ? 'bg-warning' : 'bg-destructive'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="relative bg-background rounded-xl p-6 border border-border card-hover"
              >
                {/* Connector arrow (hidden on mobile, shown on lg) */}
                {i < 3 && (
                  <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="w-5 h-5 text-accent" />
                  </div>
                )}
                {item.visual}
                <div className="mt-4 text-center">
                  <h3 className="font-heading font-semibold text-foreground text-lg">{item.step}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Paired Comparisons                                               */}
      {/* ================================================================ */}
      <section id="compare" className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
              The difference is night and day
            </h2>
            <p className="mt-4 text-foreground/60 max-w-xl mx-auto">
              Every hour you spend on manual grading is an hour you're not spending with your students.
            </p>
          </motion.div>

          <div className="space-y-4">
            {comparisons.map(([oldWay, newWay], i) => (
              <ComparisonPair key={i} oldWay={oldWay} newWay={newWay} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Dashboard Preview                                                */}
      {/* ================================================================ */}
      <section className="py-20 sm:py-28 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
                Everything a teacher needs,
                <br />
                <span className="text-accent">nothing they don't</span>
              </h2>
              <div className="mt-8 space-y-5">
                {[
                  { title: 'Score Distribution', desc: 'Mean, median, standard deviation, and distribution shape — computed, not guessed.' },
                  { title: 'Skill Tags', desc: 'AI maps each question to educational skills. Edit inline when you know better.' },
                  { title: 'Intervention Plans', desc: 'Three effort levels per recommendation. Quick 5-min fix, 30-min lesson, or 1-on-1 session.' },
                ].map((feature) => (
                  <div key={feature.title} className="flex items-start gap-3">
                    <div className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-accent" />
                    <div>
                      <h4 className="font-heading font-semibold text-foreground">{feature.title}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:pl-8"
            >
              <div className="relative">
                {/* Browser chrome mockup */}
                <div className="bg-primary/5 rounded-t-xl px-4 py-2 flex items-center gap-2 border border-border border-b-0">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-border" />
                    <div className="w-2.5 h-2.5 rounded-full bg-border" />
                    <div className="w-2.5 h-2.5 rounded-full bg-border" />
                  </div>
                  <div className="flex-1 bg-background rounded-md px-3 py-0.5 text-[10px] text-muted-foreground text-center">
                    classpulse.app/analysis/math-quiz
                  </div>
                </div>
                <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
                  <SimulatedDashboard />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Stats Strip                                                      */}
      {/* ================================================================ */}
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { value: '< 2 min', label: 'Per analysis' },
              { value: '4-tier', label: 'Roster matching' },
              { value: '3 effort', label: 'Intervention levels' },
              { value: '100%', label: 'Teacher control' },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
              >
                <div className="font-heading text-2xl sm:text-3xl font-bold text-primary">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Final CTA                                                        */}
      {/* ================================================================ */}
      <section className="py-20 sm:py-28 bg-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-primary-foreground leading-tight">
              Turn your next stack of papers
              <br />
              into a classroom roadmap
            </h2>
            <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
              AI proposes, you decide. Every insight comes with confidence scores
              and passes through your review before becoming final.
            </p>
            <div className="mt-8">
              <Link
                to="/sign-up"
                className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-8 py-3.5 rounded-full font-medium text-lg hover:bg-accent/90 transition-colors shadow-lg"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <p className="mt-4 text-primary-foreground/50 text-sm">
              No credit card required. Upload your first assignment in minutes.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Footer                                                           */}
      {/* ================================================================ */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-heading font-semibold text-primary text-sm">ClassPulse</div>
          <div className="text-xs text-muted-foreground">
            AI-powered classroom analysis for K-12 teachers
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link to="/sign-in" className="hover:text-foreground transition-colors">Log In</Link>
            <Link to="/sign-up" className="hover:text-foreground transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
