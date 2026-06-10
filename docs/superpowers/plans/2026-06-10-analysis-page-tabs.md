# Analysis Page Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the analysis page into a tabbed layout with three routes (Class, Students, Interventions) sharing a common layout with breadcrumb and tab bar.

**Architecture:** A new `AnalysisLayout` component becomes the parent route for all analysis sub-pages. It loads data once and distributes it via React Router's Outlet context. Each tab is a separate route. An `AppLayout` animation key fix prevents the layout from remounting on tab switches.

**Tech Stack:** React 19, React Router v7 (Outlet context), Tailwind CSS 4, Lucide icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/layout/AnalysisLayout.tsx` | **Create** | Shared layout: data loading, breadcrumb, tab bar, banners, outlet context |
| `src/pages/StudentList.tsx` | **Create** | Students tab: full sortable student table |
| `src/components/layout/AppLayout.tsx` | **Edit** | Fix animation key to prevent remount on tab switches |
| `src/pages/ClassOverview.tsx` | **Edit** | Strip data loading/breadcrumb/banners/student list/interventions; consume outlet context |
| `src/pages/InterventionPlanner.tsx` | **Edit** | Strip data loading/breadcrumb; consume outlet context |
| `src/pages/StudentDetail.tsx` | **Edit** | Strip shared data loading/breadcrumb; consume outlet context; keep student-specific loading |
| `src/App.tsx` | **Edit** | Nest analysis routes under AnalysisLayout |

---

### Task 1: Create AnalysisLayout component

**Files:**
- Create: `src/components/layout/AnalysisLayout.tsx`

- [ ] **Step 1: Create AnalysisLayout with data loading, breadcrumb, tab bar, banners, and outlet context**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link, Outlet } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAnalysis } from '@/lib/resolveAnalysis';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisResult, GradedResult } from '@/lib/schemas';
import { AlertTriangle, BarChart3, Loader2, Users, Zap } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export interface AnalysisOutletContext {
  analysis: AnalysisResult;
  analysisDocId: string;
  assignmentTitle: string;
  gradedResult: GradedResult | null;
  answerKeyQuestions: { questionNumber: number; questionText: string | null }[];
}

export function useAnalysisContext() {
  return useOutletContext<AnalysisOutletContext>();
}

const tabs = [
  { label: 'Class', path: '', icon: BarChart3 },
  { label: 'Students', path: '/students', icon: Users },
  { label: 'Interventions', path: '/interventions', icon: Zap },
];

export default function AnalysisLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisDocId, setAnalysisDocId] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [gradedResult, setGradedResult] = useState<GradedResult | null>(null);
  const [answerKeyQuestions, setAnswerKeyQuestions] = useState<
    { questionNumber: number; questionText: string | null }[]
  >([]);

  useEffect(() => {
    if (!id || !user) return;

    async function loadData() {
      try {
        const analysisDoc = await resolveAnalysis(id!, user!.uid);
        if (!analysisDoc || !analysisDoc.exists()) {
          toast('info', 'This analysis is still processing. Check back shortly.');
          navigate('/dashboard', { replace: true });
          return;
        }
        const analysisData = analysisDoc.data() as AnalysisResult;
        setAnalysis(analysisData);
        setAnalysisDocId(analysisDoc.id);

        const assignDoc = await getDoc(
          doc(db, 'assignments', analysisData.assignmentId),
        );
        if (assignDoc.exists()) {
          const ad = assignDoc.data();
          setAssignmentTitle(ad.title ?? 'Untitled Assignment');

          if (ad.pipelineState?.gradedResult) {
            setGradedResult(ad.pipelineState.gradedResult);
          }

          if (ad.answerKey?.questions) {
            setAnswerKeyQuestions(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ad.answerKey.questions as any[]).map((q: any) => ({
                questionNumber: q.questionNumber,
                questionText: q.questionText || null,
              })),
            );
          }
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load analysis data.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user, toast, navigate]);

  if (loading || !analysis) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading analysis...</span>
      </div>
    );
  }

  // Determine active tab from pathname
  const basePath = `/analysis/${id}`;
  const isStudentDetail = location.pathname.includes('/student/');
  const activePath = isStudentDetail
    ? '/students'
    : location.pathname === basePath
      ? ''
      : location.pathname.replace(basePath, '');

  const context: AnalysisOutletContext = {
    analysis,
    analysisDocId,
    assignmentTitle,
    gradedResult,
    answerKeyQuestions,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/dashboard" className="hover:text-primary">
          Dashboard
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{assignmentTitle}</span>
      </nav>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = activePath === tab.path;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={`${basePath}${tab.path}`}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Stale banner */}
      {analysis.stale && (
        <div className="flex items-center gap-2 px-4 py-3 bg-warning/10 border border-warning/20 rounded-[--radius-md] text-sm text-warning">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          This analysis may be stale. Student data or answer key has changed since it was generated.
        </div>
      )}

      {/* Answer key flags */}
      {gradedResult && gradedResult.answerKeyFlags.length > 0 && (
        <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-[--radius-md] text-sm text-destructive">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="font-medium">Answer Key Concerns</span>
          </div>
          <ul className="ml-6 list-disc space-y-1">
            {gradedResult.answerKeyFlags.map((f) => (
              <li key={f.questionNumber}>
                Q{f.questionNumber}: {f.flag} ({Math.round(f.missRate * 100)}%
                miss rate, most common answer: {f.mostCommonAnswer})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/AnalysisLayout.tsx
git commit -m "feat: create AnalysisLayout with shared data loading, breadcrumb, tab bar, and banners"
```

---

### Task 2: Fix AppLayout animation key

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

The current `key={location.pathname}` causes AnalysisLayout to remount on every tab switch, re-fetching data. Fix by using a stable key for all analysis sub-routes.

- [ ] **Step 1: Derive a stable animation key for analysis routes**

In `src/components/layout/AppLayout.tsx`, change the `motion.main` key:

```tsx
// Before:
key={location.pathname}

// After — add this before the return:
const analysisMatch = location.pathname.match(/^(\/analysis\/[^/]+)/);
const animationKey = analysisMatch ? analysisMatch[1] : location.pathname;

// Then use:
key={animationKey}
```

The full component after the edit:

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { AnimatePresence, motion } from 'framer-motion';
import { TourProvider } from '@/components/ux/AppTour';

export function AppLayout() {
  const location = useLocation();

  // Stable key for analysis sub-routes: all tabs under /analysis/:id share one key
  // so the layout doesn't remount (and re-fetch) on tab switches
  const analysisMatch = location.pathname.match(/^(\/analysis\/[^/]+)/);
  const animationKey = analysisMatch ? analysisMatch[1] : location.pathname;

  return (
    <TourProvider>
    <div className="min-h-screen bg-background">
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={animationKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
    </TourProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "fix: use stable animation key for analysis routes to prevent remount on tab switch"
```

---

### Task 3: Create StudentList page

**Files:**
- Create: `src/pages/StudentList.tsx`

Extract the student table from ClassOverview into its own page. Uses outlet context for data.

- [ ] **Step 1: Create StudentList component**

```tsx
import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';

function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function relativeStandingBadge(standing: string) {
  const styles: Record<string, string> = {
    above_average: 'bg-success/15 text-success',
    average: 'bg-muted text-muted-foreground',
    below_average: 'bg-destructive/15 text-destructive',
  };
  const labels: Record<string, string> = {
    above_average: 'Above Avg',
    average: 'Average',
    below_average: 'Below Avg',
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[standing] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[standing] ?? standing}
    </span>
  );
}

type SortKey = 'name' | 'score';
type SortDir = 'asc' | 'desc';

export default function StudentList() {
  const { id } = useParams<{ id: string }>();
  const { analysis } = useAnalysisContext();
  const { studentInsights } = analysis;

  const [studentSort, setStudentSort] = useState<SortKey>('score');
  const [studentSortDir, setStudentSortDir] = useState<SortDir>('asc');

  const sortedStudents = useMemo(() => {
    const students = [...studentInsights];
    students.sort((a, b) => {
      let cmp: number;
      if (studentSort === 'name') {
        cmp = a.studentName.localeCompare(b.studentName);
      } else {
        cmp = a.totalScore - b.totalScore;
      }
      return studentSortDir === 'asc' ? cmp : -cmp;
    });
    return students;
  }, [studentInsights, studentSort, studentSortDir]);

  function toggleSort(key: SortKey) {
    if (studentSort === key) {
      setStudentSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setStudentSort(key);
      setStudentSortDir('asc');
    }
  }

  return (
    <div className="bg-card border border-border rounded-[--radius-md] overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/50">
            <th
              className="px-4 py-2.5 cursor-pointer hover:text-primary"
              onClick={() => toggleSort('name')}
            >
              Name{' '}
              {studentSort === 'name' && (studentSortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="px-4 py-2.5 cursor-pointer hover:text-primary text-right"
              onClick={() => toggleSort('score')}
            >
              Score{' '}
              {studentSort === 'score' && (studentSortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="px-4 py-2.5 hidden sm:table-cell">Standing</th>
            <th className="px-4 py-2.5 hidden md:table-cell">Gap Skills</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sortedStudents.map((s) => (
            <tr key={s.studentId} className="hover:bg-muted/50 transition-colors">
              <td className="px-4 py-2.5">
                <Link
                  to={`/analysis/${id}/student/${s.studentId}`}
                  className="font-medium text-primary hover:text-primary"
                >
                  {s.studentName}
                </Link>
              </td>
              <td
                className={`px-4 py-2.5 text-right font-semibold ${masteryColor(s.totalScore)}`}
              >
                {Math.round(s.totalScore * 100)}%
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell">
                {relativeStandingBadge(s.relativeToClass)}
              </td>
              <td className="px-4 py-2.5 hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {s.gapAreas.slice(0, 3).map((gap) => (
                    <span
                      key={gap}
                      className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
                    >
                      {gap}
                    </span>
                  ))}
                  {s.gapAreas.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{s.gapAreas.length - 3}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/StudentList.tsx
git commit -m "feat: create StudentList page for Students tab"
```

---

### Task 4: Update App.tsx routes

**Files:**
- Modify: `src/App.tsx`

Nest analysis routes under `AnalysisLayout`. The `/analysis/new`, `/analysis/:id/upload`, and `/analysis/:id/review` routes are NOT part of the tabbed layout (they're pipeline steps), so they stay as flat routes.

- [ ] **Step 1: Import AnalysisLayout and StudentList, restructure routes**

Replace lines 17-19 and 51-56 in `src/App.tsx`:

Add the import at the top (after the existing imports):
```tsx
import AnalysisLayout from '@/components/layout/AnalysisLayout';
import StudentList from '@/pages/StudentList';
```

Replace the analysis routes inside the protected `<Route>` block:

```tsx
{/* Before: */}
<Route path="/analysis/:id" element={<ClassOverview />} />
<Route path="/analysis/:id/student/:studentId" element={<StudentDetail />} />
<Route path="/analysis/:id/interventions" element={<InterventionPlanner />} />

{/* After: */}
<Route path="/analysis/:id" element={<AnalysisLayout />}>
  <Route index element={<ClassOverview />} />
  <Route path="students" element={<StudentList />} />
  <Route path="interventions" element={<InterventionPlanner />} />
  <Route path="student/:studentId" element={<StudentDetail />} />
</Route>
```

The full protected routes block after the edit:

```tsx
<Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/analysis/new" element={<SetupWizard />} />
  <Route path="/analysis/:id/upload" element={<Upload />} />
  <Route path="/analysis/:id/review" element={<ReviewConfirm />} />
  <Route path="/analysis/:id" element={<AnalysisLayout />}>
    <Route index element={<ClassOverview />} />
    <Route path="students" element={<StudentList />} />
    <Route path="interventions" element={<InterventionPlanner />} />
    <Route path="student/:studentId" element={<StudentDetail />} />
  </Route>
  <Route path="/settings" element={<Settings />} />
</Route>
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: nest analysis routes under AnalysisLayout with tab navigation"
```

---

### Task 5: Refactor ClassOverview

**Files:**
- Modify: `src/pages/ClassOverview.tsx`

Strip out: data loading, breadcrumb, stale banner, answer key flags banner, student list section, intervention preview cards section, Settings gear link. Keep: guidance tip, skill edit banner, At a Glance, Skill Breakdown.

- [ ] **Step 1: Replace ClassOverview with a slimmed-down version consuming outlet context**

The full replacement for `src/pages/ClassOverview.tsx`:

```tsx
import { useRef, useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Edit3,
} from 'lucide-react';
import { GuidanceTip } from '@/components/ux/GuidanceTip';

// ---- helpers ----
function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function masteryBg(score: number) {
  if (score >= 0.8) return 'bg-success';
  if (score >= 0.6) return 'bg-yellow-600';
  return 'bg-red-600';
}

function masteryBgLight(score: number) {
  if (score >= 0.8) return 'bg-success/15';
  if (score >= 0.6) return 'bg-warning/15';
  return 'bg-destructive/15';
}

export default function ClassOverview() {
  const { id } = useParams<{ id: string }>();
  const { analysis } = useAnalysisContext();
  const { classSummary, skillBreakdown, studentInsights } = analysis;

  // UI state
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [editingSkillTag, setEditingSkillTag] = useState<string | null>(null);
  const [editedSkillTags, setEditedSkillTags] = useState<Record<string, string>>({});
  const [skillEdited, setSkillEdited] = useState(false);
  const [expandedWrongAnswers, setExpandedWrongAnswers] = useState<Set<string>>(new Set());

  // Chart container
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setChartReady(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Histogram data
  const histogramData = useMemo(() => {
    const bands = [
      { range: '0-20%', min: 0, max: 0.2, count: 0, color: '#dc2626' },
      { range: '20-40%', min: 0.2, max: 0.4, count: 0, color: '#ea580c' },
      { range: '40-60%', min: 0.4, max: 0.6, count: 0, color: '#ca8a04' },
      { range: '60-80%', min: 0.6, max: 0.8, count: 0, color: '#65a30d' },
      { range: '80-100%', min: 0.8, max: 1.01, count: 0, color: '#16a34a' },
    ];
    studentInsights.forEach((s) => {
      const band = bands.find((b) => s.totalScore >= b.min && s.totalScore < b.max);
      if (band) band.count++;
    });
    return bands;
  }, [studentInsights]);

  function toggleWrongAnswers(skillTag: string) {
    setExpandedWrongAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(skillTag)) next.delete(skillTag);
      else next.add(skillTag);
      return next;
    });
  }

  function startEditSkill(skillTag: string) {
    setEditingSkillTag(skillTag);
    if (!editedSkillTags[skillTag]) {
      setEditedSkillTags((prev) => ({ ...prev, [skillTag]: skillTag }));
    }
  }

  function saveEditSkill(originalTag: string) {
    setEditingSkillTag(null);
    if (editedSkillTags[originalTag] !== originalTag) {
      setSkillEdited(true);
    }
  }

  const displayedSkills = showAllSkills
    ? [...skillBreakdown].sort((a, b) => a.classMastery - b.classMastery)
    : [...skillBreakdown].sort((a, b) => a.classMastery - b.classMastery).slice(0, 8);

  return (
    <div className="space-y-8">
      <GuidanceTip id="class-overview-intro">
        Start with the "At a Glance" summary to see how the class performed overall.
        Use the tabs above to view individual students or the intervention plan.
      </GuidanceTip>

      {/* Skill tag edit banner */}
      {skillEdited && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-[--radius-md] text-sm text-primary">
          <span>Skill tags have been edited. Re-analyze to apply corrections.</span>
          <button className="text-primary font-medium hover:underline text-sm">
            Re-analyze with corrections
          </button>
        </div>
      )}

      {/* ====== AT A GLANCE ====== */}
      <section className="bg-card border border-border rounded-[--radius-md] p-6">
        <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          At a Glance
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Big number + summary + stats */}
          <div>
            <div className={`text-5xl font-bold ${masteryColor(classSummary.meanScore)}`}>
              {Math.round(classSummary.meanScore * 100)}%
            </div>
            <p className="text-sm text-muted-foreground mt-2">{classSummary.oneSentence}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {classSummary.studentsAnalyzed}
                </div>
                <div className="text-xs text-muted-foreground">Analyzed</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {classSummary.studentsAbsent}
                </div>
                <div className="text-xs text-muted-foreground">Absent</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {Math.round(classSummary.medianScore * 100)}%
                </div>
                <div className="text-xs text-muted-foreground">Median</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {Math.round(classSummary.minScore * 100)}-{Math.round(classSummary.maxScore * 100)}%
                </div>
                <div className="text-xs text-muted-foreground">Range</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground">
                  {(classSummary.stdDev * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Std Dev</div>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-[--radius-md]">
                <div className="text-lg font-semibold text-foreground capitalize">
                  {classSummary.distributionShape}
                </div>
                <div className="text-xs text-muted-foreground">Shape</div>
              </div>
            </div>

            {/* Outliers */}
            {classSummary.outliers.length > 0 && (
              <div className="mt-4">
                <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Outliers
                </h3>
                <div className="flex flex-wrap gap-2">
                  {classSummary.outliers.map((o) => {
                    const student = studentInsights.find(
                      (s) => s.studentId === o.studentId,
                    );
                    return (
                      <Link
                        key={o.studentId}
                        to={`/analysis/${id}/student/${o.studentId}`}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted hover:bg-primary/10 text-foreground transition-colors"
                      >
                        {o.direction === 'above' ? (
                          <ArrowUpRight className="w-3 h-3 text-success" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 text-destructive" />
                        )}
                        {student?.studentName ?? o.studentId}{' '}
                        ({Math.round(o.score * 100)}%)
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Histogram */}
          <div className="min-w-0">
            <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Score Distribution
            </h3>
            <div ref={chartContainerRef} className="h-52">
              {chartReady && <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={histogramData}
                  margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid hsl(33, 16%, 83%)',
                    }}
                    formatter={(value) => [`${value} students`, 'Count']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {histogramData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SKILL BREAKDOWN ====== */}
      {skillBreakdown.length > 0 && (
        <section className="bg-card border border-border rounded-[--radius-md] p-6">
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Skill Breakdown
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="pb-2 pr-3">Skill</th>
                  <th className="pb-2 pr-3 w-48">Class Mastery</th>
                  <th className="pb-2 pr-3 text-center">Questions</th>
                  <th className="pb-2 pr-3 text-center">Struggling</th>
                  <th className="pb-2 text-center">Proficient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayedSkills.map((skill) => {
                  const displayTag =
                    editedSkillTags[skill.skillTag] ?? skill.displayName;
                  const isEditing = editingSkillTag === skill.skillTag;
                  const isExpanded = expandedWrongAnswers.has(skill.skillTag);

                  return (
                    <tr key={skill.skillTag} className="group">
                      <td className="py-2.5 pr-3">
                        {isEditing ? (
                          <input
                            type="text"
                            className="text-sm border border-primary/30 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring w-40"
                            value={editedSkillTags[skill.skillTag] ?? skill.displayName}
                            onChange={(e) =>
                              setEditedSkillTags((prev) => ({
                                ...prev,
                                [skill.skillTag]: e.target.value,
                              }))
                            }
                            onBlur={() => saveEditSkill(skill.skillTag)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditSkill(skill.skillTag);
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => startEditSkill(skill.skillTag)}
                            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary group"
                          >
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${masteryBgLight(skill.classMastery)} ${masteryColor(skill.classMastery)}`}
                            >
                              {displayTag}
                            </span>
                            <Edit3 className="w-3 h-3 text-border opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${masteryBg(skill.classMastery)}`}
                              style={{
                                width: `${Math.round(skill.classMastery * 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold w-10 text-right ${masteryColor(skill.classMastery)}`}
                          >
                            {Math.round(skill.classMastery * 100)}%
                          </span>
                        </div>
                        {skill.commonWrongAnswers.length > 0 && (
                          <div className="mt-1">
                            <button
                              onClick={() => toggleWrongAnswers(skill.skillTag)}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              Common wrong answers
                            </button>
                            {isExpanded && (
                              <div className="mt-1.5 space-y-1.5 pl-3 border-l-2 border-border">
                                {skill.commonWrongAnswers
                                  .filter((cwa) => cwa.answerValue || cwa.misconception)
                                  .map((cwa, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-medium text-destructive">
                                      "{cwa.answerValue || ((cwa as Record<string, unknown>).answer as string)}"
                                    </span>
                                    {cwa.frequencyPercent != null && !isNaN(cwa.frequencyPercent) && cwa.frequencyPercent > 0 && (
                                      <span className="text-muted-foreground ml-1">
                                        ({Math.round(cwa.frequencyPercent * 100)}%)
                                      </span>
                                    )}
                                    <p className="text-muted-foreground mt-0.5">
                                      {cwa.misconception}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-center text-muted-foreground">
                        {skill.questionNumbers.join(', ')}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        <span
                          className={`font-medium ${skill.studentsStrugglingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {skill.studentsStrugglingCount}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="font-medium text-success">
                          {skill.studentsProficientCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {skillBreakdown.length > 8 && (
            <button
              onClick={() => setShowAllSkills(!showAllSkills)}
              className="mt-3 text-sm text-primary hover:text-primary font-medium"
            >
              {showAllSkills
                ? 'Show top 8 skills'
                : `Show all ${skillBreakdown.length} skills`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ClassOverview.tsx
git commit -m "refactor: strip ClassOverview to At a Glance + Skill Breakdown, consume outlet context"
```

---

### Task 6: Refactor InterventionPlanner

**Files:**
- Modify: `src/pages/InterventionPlanner.tsx`

Remove data loading and breadcrumb. Get `analysis`, `analysisDocId`, and `assignmentTitle` from outlet context. Keep all intervention-specific logic and local state.

- [ ] **Step 1: Replace data loading and breadcrumb with outlet context**

Changes to `src/pages/InterventionPlanner.tsx`:

1. Add import for `useAnalysisContext`:
```tsx
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';
```

2. Update imports:
   - Change `import { doc, getDoc, updateDoc } from 'firebase/firestore'` to `import { doc, updateDoc } from 'firebase/firestore'` (remove `getDoc`, keep `doc` and `updateDoc` for `persistIntervention`)
   - Remove `useAuth` from `@/contexts/AuthContext`
   - Remove `resolveAnalysis` from `@/lib/resolveAnalysis`
   - Remove `Loader2` from `lucide-react`
   - Keep `db` from `@/lib/firebase` (used by `persistIntervention`)

3. Replace the state declarations and data loading at the top of the component (lines 93-149). Remove:
   - `const { user } = useAuth();`
   - `const [loading, setLoading]` state
   - `const [analysisDocId, setAnalysisDocId]` state
   - `const [analysis, setAnalysis]` state
   - `const [assignmentTitle, setAssignmentTitle]` state
   - The entire `useEffect` data loading block (lines 110-149)

   Replace with:
```tsx
const { analysis, analysisDocId } = useAnalysisContext();
const [interventions, setInterventions] = useState<Intervention[]>(
  [...analysis.interventions].sort((a, b) => a.priority - b.priority),
);
```

4. Keep `const [expandedStudents, ...]`, `const [dismissedExpanded, ...]`, `const [pendingDismiss, ...]` state declarations.

5. Replace the `studentNames` state with a `useMemo`:
```tsx
const studentNames = useMemo(() => {
  const nameMap: Record<string, string> = {};
  analysis.studentInsights.forEach((s) => {
    nameMap[s.studentId] = s.studentName;
  });
  return nameMap;
}, [analysis]);
```

6. Remove the loading spinner block (lines 251-260):
```tsx
// DELETE this block:
if (loading || !analysis) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="ml-2 text-sm text-muted-foreground">
        Loading intervention plan...
      </span>
    </div>
  );
}
```

7. In the empty state block (lines 262-293), remove the breadcrumb nav and the "Back to Class Overview" link. Replace with just the empty message:
```tsx
if (interventions.length === 0) {
  return (
    <div className="text-center py-20">
      <GraduationCap className="w-12 h-12 text-border mx-auto mb-4" />
      <h2 className="font-heading text-lg font-semibold text-foreground">
        No interventions recommended
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        The analysis did not identify any skill gaps requiring targeted intervention.
      </p>
    </div>
  );
}
```

8. In the main return, remove the breadcrumb `<nav>` block (lines 298-309).

9. In the completion card near the bottom, change the "Back to Class Overview" link from `<Link to={...}>` to:
```tsx
<Link
  to={`/analysis/${id}`}
  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
>
  Back to Class Overview
</Link>
```
(This link stays since it's a contextual CTA, not primary navigation.)

- [ ] **Step 2: Commit**

```bash
git add src/pages/InterventionPlanner.tsx
git commit -m "refactor: InterventionPlanner consumes outlet context, remove data loading and breadcrumb"
```

---

### Task 7: Refactor StudentDetail

**Files:**
- Modify: `src/pages/StudentDetail.tsx`

Get `analysis` and `assignmentTitle` from outlet context. Keep student-specific loading (quiz photo URL, graded student questions from the graded result passed through context). Remove breadcrumb and shared data loading.

- [ ] **Step 1: Replace shared data loading with outlet context**

Changes to `src/pages/StudentDetail.tsx`:

1. Add import for `useAnalysisContext`:
```tsx
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';
```

2. Remove these imports (no longer needed):
   - `doc, getDoc` from `firebase/firestore`
   - `db` from `@/lib/firebase`
   - `useAuth` from `@/contexts/AuthContext`
   - `resolveAnalysis` from `@/lib/resolveAnalysis`

3. Replace the state and data loading. Remove:
   - `const { user } = useAuth();`
   - `const [loading, setLoading]` state
   - `const [analysis, setAnalysis]` state
   - `const [assignmentTitle, setAssignmentTitle]` state
   - `const [answerKeyQuestions, setAnswerKeyQuestions]` state

   Replace with outlet context:
```tsx
const { analysis, gradedResult, answerKeyQuestions } = useAnalysisContext();
```

4. Replace the `useEffect` data loading (lines 92-165). The new effect only loads student-specific data (quiz photo + graded student questions):

```tsx
useEffect(() => {
  if (!studentId) return;

  async function loadStudentData() {
    try {
      // Load quiz photo for this student
      const studentInsight = analysis.studentInsights.find(
        (s) => s.studentId === studentId,
      );
      if (studentInsight?.sourceImagePath) {
        try {
          const url = await getDownloadURL(ref(storage, studentInsight.sourceImagePath));
          setQuizPhotoUrl(url);
        } catch {
          // Photo not available — not critical
        }
      }

      // Extract graded student questions from the shared gradedResult
      if (gradedResult?.gradedStudents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gs = (gradedResult.gradedStudents as any[]).find(
          (s) => s.studentId === studentId,
        );
        if (gs?.perQuestion) {
          setGradedStudentQuestions(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            gs.perQuestion.map((pq: any) => ({
              questionNumber: pq.questionNumber,
              studentAnswer: pq.studentAnswer || '',
              correctAnswer: pq.correctAnswer || '',
              isCorrect: !!pq.isCorrect,
            })),
          );
        }
      }
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to load student data.');
    }
  }

  loadStudentData();
}, [studentId, analysis, gradedResult, toast]);
```

5. Remove the loading spinner block:
```tsx
// DELETE:
if (loading || !analysis) { ... }
```

6. Remove the breadcrumb `<nav>` block (lines 284-294 in the main return).

7. Remove the "Back to Class Overview" link at the bottom of the page (the `<div className="pt-4 border-t ...">` block). Navigation is handled by the tab bar now.

- [ ] **Step 2: Commit**

```bash
git add src/pages/StudentDetail.tsx
git commit -m "refactor: StudentDetail consumes outlet context, keep student-specific loading only"
```

---

### Task 8: Verify with running app

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Start dev server and verify all three tabs**

Start the dev server and use Playwright MCP to navigate to an analysis page. Verify:
1. Tab bar renders with Class, Students, Interventions
2. Class tab shows At a Glance + Skill Breakdown (no student list, no intervention cards)
3. Students tab shows the full student table
4. Interventions tab shows the intervention planner
5. Clicking a student name navigates to StudentDetail with Students tab highlighted
6. Tab switches don't cause a loading spinner (data is shared)

- [ ] **Step 3: Commit any fixes needed**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: analysis page tab navigation redesign complete"
```
