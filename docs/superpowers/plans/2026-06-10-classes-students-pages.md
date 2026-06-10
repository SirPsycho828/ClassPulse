# Classes & Students Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add top-level Classes and Students pages with longitudinal tracking of progress across analyses, powered by denormalized summary documents and query-time aggregation.

**Architecture:** Hybrid data strategy — `classSummaries` and `studentSummaries` Firestore collections (written by Cloud Functions) power fast list pages. Detail pages query all analyses at render time. New tabbed Class Detail layout (like AnalysisLayout) with Overview/Roster/Interventions tabs. Cross-links connect existing analysis-scoped views to new longitudinal views.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 4, Firebase Cloud Functions (2nd gen), Firestore, Recharts 3, Framer Motion, react-router-dom v7, Zod, Lucide React

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `src/lib/summaryTypes.ts` | TypeScript types + Zod schemas for ClassSummary, StudentSummary |
| `src/lib/longitudinalUtils.ts` | Pure functions: computeTrend, computeSparkline, findPersistentConcerns, findRecurringProblemSkills |
| `src/components/ui/Sparkline.tsx` | Tiny Recharts line chart for inline sparkline display |
| `src/components/ui/TrendArrow.tsx` | Trend indicator (green up / red down / gray flat) |
| `src/pages/ClassesList.tsx` | Classes list page with summary cards |
| `src/components/layout/ClassDetailLayout.tsx` | Tabbed layout for class detail (like AnalysisLayout) |
| `src/pages/ClassDetailOverview.tsx` | Score trend chart + recurring problem skills table |
| `src/pages/ClassDetailRoster.tsx` | Student roster with per-student trends |
| `src/pages/ClassDetailInterventions.tsx` | Intervention history across all analyses for a class |
| `src/pages/StudentsList.tsx` | Global searchable/filterable student table |
| `src/pages/StudentDetailLongitudinal.tsx` | Longitudinal student view: score history, skill progression, persistent concerns |
| `functions/src/pipeline/updateSummaries.ts` | Cloud Function helper: compute and write summary docs |

### Modified Files
| File | Change |
|------|--------|
| `firestore.rules` | Add read-only rules for `classSummaries` and `studentSummaries` |
| `functions/src/index.ts` | Call `updateSummaries()` at end of `runAnalysis` |
| `src/components/layout/Navbar.tsx` | Add Classes and Students nav items |
| `src/components/layout/AppLayout.tsx` | Add stable animation key for `/classes/:classId` sub-routes |
| `src/App.tsx` | Add new routes |
| `src/pages/Dashboard.tsx` | Class names become links to `/classes/:classId` |
| `src/pages/ClassOverview.tsx` | Add class name link to `/classes/:classId` in breadcrumb area |
| `src/pages/StudentDetail.tsx` | Add "View full history" link to longitudinal view |

---

## Task 1: Firestore Security Rules

**Files:**
- Modify: `firestore.rules:61` (after interventions block)

- [ ] **Step 1: Add read-only rules for summary collections**

Add these rules after the `interventions` match block (line 61) and before the `config/openrouter` block:

```
    match /classSummaries/{classId} {
      allow read: if request.auth != null
        && request.auth.uid == resource.data.teacherId;
    }

    match /studentSummaries/{docId} {
      allow read: if request.auth != null
        && request.auth.uid == resource.data.teacherId;
    }
```

- [ ] **Step 2: Verify rules syntax**

Run: `cd functions && npx firebase-tools firestore:rules:validate ../firestore.rules`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore read-only rules for classSummaries and studentSummaries"
```

---

## Task 2: Summary Types and Longitudinal Utilities

**Files:**
- Create: `src/lib/summaryTypes.ts`
- Create: `src/lib/longitudinalUtils.ts`

- [ ] **Step 1: Create summary type definitions**

Create `src/lib/summaryTypes.ts`:

```typescript
import { z } from 'zod';

export const TrendSchema = z.enum(['up', 'down', 'flat']);
export type Trend = z.infer<typeof TrendSchema>;

export const ClassSummaryDocSchema = z.object({
  classId: z.string(),
  teacherId: z.string(),
  className: z.string(),
  studentCount: z.number(),
  analysisCount: z.number(),
  lastAnalysisDate: z.string(),
  latestMeanScore: z.number(),
  trend: TrendSchema,
  sparklineData: z.array(z.number()),
  updatedAt: z.any(), // Firestore Timestamp
});
export type ClassSummaryDoc = z.infer<typeof ClassSummaryDocSchema>;

export const StudentSummaryDocSchema = z.object({
  classId: z.string(),
  studentId: z.string(),
  teacherId: z.string(),
  studentName: z.string(),
  className: z.string(),
  analysisCount: z.number(),
  lastAnalysisDate: z.string(),
  latestScore: z.number(),
  latestPercentile: z.number(),
  trend: TrendSchema,
  sparklineData: z.array(z.number()),
  updatedAt: z.any(), // Firestore Timestamp
});
export type StudentSummaryDoc = z.infer<typeof StudentSummaryDocSchema>;
```

- [ ] **Step 2: Create longitudinal utility functions**

Create `src/lib/longitudinalUtils.ts`:

```typescript
import type { Trend } from './summaryTypes';

/**
 * Compute trend direction from an array of scores (oldest first).
 * Compares the last two values. Returns 'flat' if fewer than 2 values.
 */
export function computeTrend(scores: number[]): Trend {
  if (scores.length < 2) return 'flat';
  const prev = scores[scores.length - 2];
  const curr = scores[scores.length - 1];
  const diff = curr - prev;
  // Use a 2% threshold to avoid noise
  if (diff > 0.02) return 'up';
  if (diff < -0.02) return 'down';
  return 'flat';
}

/**
 * Build sparkline data from a list of scores, capped to the most recent `max` entries.
 */
export function buildSparklineData(scores: number[], max = 10): number[] {
  return scores.slice(-max);
}

/**
 * A skill that appeared as red (<0.6) or yellow (<0.8) mastery in an analysis.
 */
export interface SkillAppearance {
  analysisId: string;
  analysisDate: string;
  analysisTitle: string;
  mastery: number;
  masteryLevel: 'green' | 'yellow' | 'red';
}

export interface RecurringProblemSkill {
  skillTag: string;
  displayName: string;
  weakCount: number;
  totalCount: number;
  latestMastery: number;
  latestMasteryLevel: 'green' | 'yellow' | 'red';
  trend: 'improving' | 'worsening' | 'stuck';
  appearances: SkillAppearance[];
}

/**
 * Find skills that appeared as red or yellow across 2+ analyses.
 * `analyses` should be sorted oldest-first.
 */
export function findRecurringProblemSkills(
  analyses: Array<{
    analysisId: string;
    generatedAt: string;
    assignmentTitle: string;
    skillBreakdown: Array<{
      skillTag: string;
      displayName: string;
      classMastery: number;
      masteryLevel: 'green' | 'yellow' | 'red';
    }>;
  }>,
): RecurringProblemSkill[] {
  const skillMap = new Map<string, {
    displayName: string;
    appearances: SkillAppearance[];
  }>();

  for (const a of analyses) {
    for (const skill of a.skillBreakdown) {
      if (!skillMap.has(skill.skillTag)) {
        skillMap.set(skill.skillTag, { displayName: skill.displayName, appearances: [] });
      }
      skillMap.get(skill.skillTag)!.appearances.push({
        analysisId: a.analysisId,
        analysisDate: a.generatedAt,
        analysisTitle: a.assignmentTitle,
        mastery: skill.classMastery,
        masteryLevel: skill.masteryLevel,
      });
    }
  }

  const results: RecurringProblemSkill[] = [];
  for (const [skillTag, data] of skillMap) {
    const weakAppearances = data.appearances.filter(a => a.masteryLevel !== 'green');
    if (weakAppearances.length < 2) continue;

    const latest = data.appearances[data.appearances.length - 1];
    const masteries = data.appearances.map(a => a.mastery);
    const recentTrend = computeTrend(masteries);

    results.push({
      skillTag,
      displayName: data.displayName,
      weakCount: weakAppearances.length,
      totalCount: data.appearances.length,
      latestMastery: latest.mastery,
      latestMasteryLevel: latest.masteryLevel,
      trend: recentTrend === 'up' ? 'improving' : recentTrend === 'down' ? 'worsening' : 'stuck',
      appearances: data.appearances,
    });
  }

  // Sort by persistence (most weak appearances first)
  results.sort((a, b) => b.weakCount - a.weakCount);
  return results;
}

export interface PersistentConcern {
  skillTag: string;
  displayName: string;
  consecutiveWeakCount: number;
  masteryTrajectory: number[];
  linkedAnalyses: Array<{ analysisId: string; analysisDate: string; analysisTitle: string }>;
}

/**
 * Find skills that remained red or yellow across 2+ consecutive analyses for a student.
 * `skillEntries` should be sorted oldest-first per skill.
 */
export function findPersistentConcerns(
  analyses: Array<{
    analysisId: string;
    generatedAt: string;
    assignmentTitle: string;
    skillPerformance: Array<{
      skillTag: string;
      displayName: string;
      mastery: number;
    }>;
  }>,
): PersistentConcern[] {
  // Group by skill across all analyses (analyses should be oldest-first)
  const skillMap = new Map<string, {
    displayName: string;
    entries: Array<{
      analysisId: string;
      analysisDate: string;
      analysisTitle: string;
      mastery: number;
    }>;
  }>();

  for (const a of analyses) {
    for (const sp of a.skillPerformance) {
      if (!skillMap.has(sp.skillTag)) {
        skillMap.set(sp.skillTag, { displayName: sp.displayName, entries: [] });
      }
      skillMap.get(sp.skillTag)!.entries.push({
        analysisId: a.analysisId,
        analysisDate: a.generatedAt,
        analysisTitle: a.assignmentTitle,
        mastery: sp.mastery,
      });
    }
  }

  const concerns: PersistentConcern[] = [];
  for (const [skillTag, data] of skillMap) {
    // Find the longest consecutive run of weak (< 0.8) mastery ending at the most recent entry
    let consecutiveWeak = 0;
    for (let i = data.entries.length - 1; i >= 0; i--) {
      if (data.entries[i].mastery < 0.8) {
        consecutiveWeak++;
      } else {
        break;
      }
    }

    if (consecutiveWeak >= 2) {
      const weakEntries = data.entries.slice(-consecutiveWeak);
      concerns.push({
        skillTag,
        displayName: data.displayName,
        consecutiveWeakCount: consecutiveWeak,
        masteryTrajectory: weakEntries.map(e => e.mastery),
        linkedAnalyses: weakEntries.map(e => ({
          analysisId: e.analysisId,
          analysisDate: e.analysisDate,
          analysisTitle: e.analysisTitle,
        })),
      });
    }
  }

  // Sort by consecutive count descending
  concerns.sort((a, b) => b.consecutiveWeakCount - a.consecutiveWeakCount);
  return concerns;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/summaryTypes.ts src/lib/longitudinalUtils.ts
git commit -m "feat: add summary doc types and longitudinal utility functions"
```

---

## Task 3: Sparkline and TrendArrow Components

**Files:**
- Create: `src/components/ui/Sparkline.tsx`
- Create: `src/components/ui/TrendArrow.tsx`

- [ ] **Step 1: Create TrendArrow component**

Create `src/components/ui/TrendArrow.tsx`:

```tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Trend } from '@/lib/summaryTypes';

interface TrendArrowProps {
  trend: Trend;
  size?: number;
}

export function TrendArrow({ trend, size = 16 }: TrendArrowProps) {
  if (trend === 'up') {
    return <TrendingUp className="text-success" style={{ width: size, height: size }} />;
  }
  if (trend === 'down') {
    return <TrendingDown className="text-destructive" style={{ width: size, height: size }} />;
  }
  return <Minus className="text-muted-foreground" style={{ width: size, height: size }} />;
}
```

- [ ] **Step 2: Create Sparkline component**

Create `src/components/ui/Sparkline.tsx`:

```tsx
import { LineChart, Line } from 'recharts';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 80, height = 24, color = 'hsl(24, 55%, 60%)' }: SparklineProps) {
  if (data.length < 2) return null;

  const chartData = data.map((value, index) => ({ x: index, y: value }));

  return (
    <LineChart width={width} height={height} data={chartData}>
      <Line
        type="monotone"
        dataKey="y"
        stroke={color}
        dot={false}
        strokeWidth={1.5}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Sparkline.tsx src/components/ui/TrendArrow.tsx
git commit -m "feat: add Sparkline and TrendArrow shared components"
```

---

## Task 4: Cloud Function — Summary Doc Generation

**Files:**
- Create: `functions/src/pipeline/updateSummaries.ts`

- [ ] **Step 1: Create the updateSummaries helper**

Create `functions/src/pipeline/updateSummaries.ts`:

```typescript
import * as admin from 'firebase-admin';

const db = admin.firestore();

type Trend = 'up' | 'down' | 'flat';

function computeTrend(scores: number[]): Trend {
  if (scores.length < 2) return 'flat';
  const prev = scores[scores.length - 2];
  const curr = scores[scores.length - 1];
  const diff = curr - prev;
  if (diff > 0.02) return 'up';
  if (diff < -0.02) return 'down';
  return 'flat';
}

function buildSparkline(scores: number[], max = 10): number[] {
  return scores.slice(-max);
}

interface AnalysisDoc {
  analysisId: string;
  classId: string;
  generatedAt: string;
  classSummary: {
    meanScore: number;
    studentsAnalyzed: number;
  };
  studentInsights: Array<{
    studentId: string;
    studentName: string;
    totalScore: number;
    percentile: number;
  }>;
}

/**
 * Update classSummaries and studentSummaries after an analysis completes.
 * Call this at the end of runAnalysis.
 */
export async function updateSummaries(
  classId: string,
  teacherId: string,
): Promise<void> {
  // 1. Fetch all analyses for this class, ordered by date
  const analysesSnap = await db
    .collection('analyses')
    .where('classId', '==', classId)
    .where('teacherId', '==', teacherId)
    .orderBy('generatedAt', 'asc')
    .get();

  const analyses: AnalysisDoc[] = analysesSnap.docs.map(
    (d) => d.data() as AnalysisDoc,
  );

  if (analyses.length === 0) return;

  // 2. Fetch the class doc for metadata
  const classDoc = await db.collection('classes').doc(classId).get();
  const classData = classDoc.data();
  if (!classData) return;

  // 3. Build class summary
  const meanScores = analyses.map((a) => a.classSummary.meanScore);
  const latest = analyses[analyses.length - 1];

  const classSummaryDoc = {
    classId,
    teacherId,
    className: classData.name || '',
    studentCount: classData.studentCount || 0,
    analysisCount: analyses.length,
    lastAnalysisDate: latest.generatedAt,
    latestMeanScore: latest.classSummary.meanScore,
    trend: computeTrend(meanScores),
    sparklineData: buildSparkline(meanScores),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('classSummaries').doc(classId).set(classSummaryDoc);

  // 4. Build student summaries
  // Collect all student scores across analyses
  const studentScores = new Map<
    string,
    {
      studentName: string;
      scores: number[];
      percentiles: number[];
      dates: string[];
    }
  >();

  for (const a of analyses) {
    for (const si of a.studentInsights) {
      if (!studentScores.has(si.studentId)) {
        studentScores.set(si.studentId, {
          studentName: si.studentName,
          scores: [],
          percentiles: [],
          dates: [],
        });
      }
      const entry = studentScores.get(si.studentId)!;
      entry.scores.push(si.totalScore);
      entry.percentiles.push(si.percentile);
      entry.dates.push(a.generatedAt);
      // Keep name up-to-date from latest analysis
      entry.studentName = si.studentName;
    }
  }

  // Batch write student summaries (max 500 per batch)
  const studentEntries = Array.from(studentScores.entries());
  const BATCH_SIZE = 450; // leave room under Firestore 500 limit
  for (let i = 0; i < studentEntries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = studentEntries.slice(i, i + BATCH_SIZE);

    for (const [studentId, data] of chunk) {
      const docId = `${classId}_${studentId}`;
      const latestScore = data.scores[data.scores.length - 1];
      const latestPercentile = data.percentiles[data.percentiles.length - 1];
      const latestDate = data.dates[data.dates.length - 1];

      const studentSummaryDoc = {
        classId,
        studentId,
        teacherId,
        studentName: data.studentName,
        className: classData.name || '',
        analysisCount: data.scores.length,
        lastAnalysisDate: latestDate,
        latestScore,
        latestPercentile,
        trend: computeTrend(data.scores),
        sparklineData: buildSparkline(data.scores),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(db.collection('studentSummaries').doc(docId), studentSummaryDoc);
    }

    await batch.commit();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/pipeline/updateSummaries.ts
git commit -m "feat: add updateSummaries Cloud Function helper"
```

---

## Task 5: Integrate Summary Generation into runAnalysis

**Files:**
- Modify: `functions/src/index.ts:1110-1118`

- [ ] **Step 1: Add import at top of functions/src/index.ts**

Add this import alongside the other pipeline imports near the top of the file:

```typescript
import { updateSummaries } from './pipeline/updateSummaries';
```

- [ ] **Step 2: Add summary doc update after Stage 8**

After the Stage 8 assignment status update (line 1116) and before `return { success: true, analysisId };` (line 1118), add:

```typescript
      // Stage 9: Update summary documents for longitudinal tracking
      console.log('[runAnalysis] Stage 9: Updating summary documents...');
      try {
        await updateSummaries(assignment.classId, request.auth.uid);
      } catch (summaryErr) {
        // Non-fatal: analysis succeeded, summaries are best-effort
        console.error('[runAnalysis] Summary update failed (non-fatal):', summaryErr);
      }
```

- [ ] **Step 3: Build Cloud Functions to verify compilation**

Run: `cd functions && npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: integrate summary doc generation into runAnalysis pipeline"
```

---

## Task 6: Navigation — Add Classes and Students to Navbar

**Files:**
- Modify: `src/components/layout/Navbar.tsx:35-38`

- [ ] **Step 1: Update navItems array**

Replace the `navItems` array (lines 35-38):

```typescript
  const navItems = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Classes', path: '/classes' },
    { label: 'Students', path: '/students' },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin/models' }] : []),
  ];
```

- [ ] **Step 2: Update isActive to support prefix matching for sub-routes**

Replace the `isActive` function (line 40):

```typescript
  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path);
```

This ensures the "Classes" tab stays highlighted when viewing `/classes/abc123`, and "Students" stays highlighted on `/students/classId/studentId`.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Navbar.tsx
git commit -m "feat: add Classes and Students nav items to Navbar"
```

---

## Task 7: Routes and AppLayout Animation Keys

**Files:**
- Modify: `src/App.tsx:51-63`
- Modify: `src/components/layout/AppLayout.tsx:11-12`

- [ ] **Step 1: Add imports to App.tsx**

Add these imports after the existing page imports (after line 25):

```typescript
import ClassesList from '@/pages/ClassesList';
import ClassDetailLayout from '@/components/layout/ClassDetailLayout';
import ClassDetailOverview from '@/pages/ClassDetailOverview';
import ClassDetailRoster from '@/pages/ClassDetailRoster';
import ClassDetailInterventions from '@/pages/ClassDetailInterventions';
import StudentsList from '@/pages/StudentsList';
import StudentDetailLongitudinal from '@/pages/StudentDetailLongitudinal';
```

- [ ] **Step 2: Add new routes inside the protected route group**

After the `/settings` route (line 62) and before the closing `</Route>` of the protected group (line 63), add:

```tsx
              <Route path="/classes" element={<ClassesList />} />
              <Route path="/classes/:classId" element={<ClassDetailLayout />}>
                <Route index element={<ClassDetailOverview />} />
                <Route path="roster" element={<ClassDetailRoster />} />
                <Route path="interventions" element={<ClassDetailInterventions />} />
              </Route>
              <Route path="/students" element={<StudentsList />} />
              <Route path="/students/:classId/:studentId" element={<StudentDetailLongitudinal />} />
```

- [ ] **Step 3: Update AppLayout animation key for class sub-routes**

In `src/components/layout/AppLayout.tsx`, update the animation key logic (lines 11-12) to also stabilize class detail sub-routes:

```typescript
  const analysisMatch = location.pathname.match(/^(\/analysis\/[^/]+)/);
  const classMatch = location.pathname.match(/^(\/classes\/[^/]+)/);
  const animationKey = analysisMatch ? analysisMatch[1] : classMatch ? classMatch[1] : location.pathname;
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/AppLayout.tsx
git commit -m "feat: add routes for Classes, Students, and ClassDetail pages"
```

---

## Task 8: Classes List Page

**Files:**
- Create: `src/pages/ClassesList.tsx`

- [ ] **Step 1: Create the ClassesList page**

Create `src/pages/ClassesList.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ClassForm } from '@/components/ClassForm';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import type { ClassSummaryDoc } from '@/lib/summaryTypes';
import { Plus, Search, GraduationCap, Loader2 } from 'lucide-react';

export default function ClassesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<ClassSummaryDoc[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; studentCount: number; gradeLevel: string; subject: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showAddClass, setShowAddClass] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Subscribe to classSummaries
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'classSummaries'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setSummaries(snap.docs.map((d) => d.data() as ClassSummaryDoc));
    });
    return unsub;
  }, [user]);

  // Subscribe to classes (for classes without summaries yet)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'classes'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setClasses(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            studentCount: data.studentCount || 0,
            gradeLevel: data.gradeLevel || '',
            subject: data.subject || '',
          };
        }),
      );
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Merge: every class gets a card, enriched with summary data if available
  const mergedClasses = useMemo(() => {
    const summaryMap = new Map(summaries.map((s) => [s.classId, s]));
    return classes
      .map((c) => ({
        ...c,
        summary: summaryMap.get(c.id) || null,
      }))
      .filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
  }, [classes, summaries, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading classes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Classes</h1>
        <button
          onClick={() => setShowAddClass(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:bg-primary/90 transition-colors shadow-[--shadow-sm]"
        >
          <Plus className="w-4 h-4" />
          Add Class
        </button>
      </div>

      {/* Search */}
      {classes.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search classes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-card border border-border rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      )}

      {/* Empty state */}
      {classes.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No classes yet. Create your first class to get started.</p>
          <button
            onClick={() => setShowAddClass(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Class
          </button>
        </div>
      )}

      {/* Card grid */}
      {mergedClasses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mergedClasses.map((c) => (
            <Link
              key={c.id}
              to={`/classes/${c.id}`}
              className="block bg-card border border-border rounded-[--radius-md] p-5 card-hover transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-heading font-semibold text-foreground text-lg leading-tight">
                  {c.name}
                </h3>
                {c.summary && <TrendArrow trend={c.summary.trend} />}
              </div>

              <p className="text-sm text-muted-foreground mb-3">
                {c.studentCount} student{c.studentCount !== 1 ? 's' : ''}
                {c.summary ? ` \u00b7 ${c.summary.analysisCount} analys${c.summary.analysisCount !== 1 ? 'es' : 'is'}` : ''}
              </p>

              {c.summary ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-semibold text-foreground">
                      {Math.round(c.summary.latestMeanScore * 100)}%
                      <span className="text-sm font-normal text-muted-foreground ml-1">avg</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last analyzed {new Date(c.summary.lastAnalysisDate).toLocaleDateString()}
                    </p>
                  </div>
                  {c.summary.sparklineData.length >= 2 && (
                    <Sparkline data={c.summary.sparklineData} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No analyses yet.{' '}
                  <span
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/analysis/new?classId=${c.id}`);
                    }}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Start one &rarr;
                  </span>
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* No search results */}
      {classes.length > 0 && mergedClasses.length === 0 && searchQuery && (
        <p className="text-center text-muted-foreground py-8">
          No classes matching &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {/* Add Class Modal */}
      {showAddClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
          <div className="relative bg-card border border-border rounded-[--radius-md] shadow-[--shadow-xl] w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <ClassForm
              onComplete={() => setShowAddClass(false)}
              onCancel={() => setShowAddClass(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx vite build --mode development 2>&1 | head -20`
Expected: No TypeScript errors related to ClassesList.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClassesList.tsx
git commit -m "feat: add ClassesList page with summary cards and sparklines"
```

---

## Task 9: Class Detail Layout

**Files:**
- Create: `src/components/layout/ClassDetailLayout.tsx`

- [ ] **Step 1: Create the ClassDetailLayout component**

Create `src/components/layout/ClassDetailLayout.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams, useLocation, Link, Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, buildSparklineData } from '@/lib/longitudinalUtils';
import type { AnalysisResult } from '@/lib/schemas';
import { BarChart3, Loader2, Plus, Users, Zap } from 'lucide-react';

export interface ClassDetailOutletContext {
  classId: string;
  className: string;
  gradeLevel: string;
  subject: string;
  studentCount: number;
  analyses: Array<AnalysisResult & { assignmentTitle: string }>;
}

export function useClassDetailContext() {
  return useOutletContext<ClassDetailOutletContext>();
}

const tabs = [
  { label: 'Overview', path: '', icon: BarChart3 },
  { label: 'Roster', path: '/roster', icon: Users },
  { label: 'Interventions', path: '/interventions', icon: Zap },
];

export default function ClassDetailLayout() {
  const { classId } = useParams<{ classId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [studentCount, setStudentCount] = useState(0);
  const [analyses, setAnalyses] = useState<Array<AnalysisResult & { assignmentTitle: string }>>([]);

  useEffect(() => {
    if (!classId || !user) return;

    async function loadData() {
      try {
        // Fetch class doc
        const classDoc = await getDoc(doc(db, 'classes', classId!));
        if (!classDoc.exists()) {
          toast('error', 'Class not found.');
          navigate('/classes', { replace: true });
          return;
        }
        const cd = classDoc.data();
        setClassName(cd.name || '');
        setGradeLevel(cd.gradeLevel || '');
        setSubject(cd.subject || '');
        setStudentCount(cd.studentCount || 0);

        // Fetch all analyses for this class
        const analysesSnap = await getDocs(
          query(
            collection(db, 'analyses'),
            where('classId', '==', classId),
            where('teacherId', '==', user!.uid),
            orderBy('generatedAt', 'asc'),
          ),
        );

        // For each analysis, fetch the assignment title
        const analysesWithTitles: Array<AnalysisResult & { assignmentTitle: string }> = [];
        for (const aDoc of analysesSnap.docs) {
          const aData = aDoc.data() as AnalysisResult;
          let assignmentTitle = 'Untitled';
          try {
            const assignDoc = await getDoc(doc(db, 'assignments', aData.assignmentId));
            if (assignDoc.exists()) {
              assignmentTitle = assignDoc.data().title || 'Untitled';
            }
          } catch {
            // ignore
          }
          analysesWithTitles.push({ ...aData, assignmentTitle });
        }

        setAnalyses(analysesWithTitles);
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load class data.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classId, user, toast, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading class...</span>
      </div>
    );
  }

  const basePath = `/classes/${classId}`;
  const activePath = location.pathname === basePath
    ? ''
    : location.pathname.replace(basePath, '');

  const meanScores = analyses.map((a) => a.classSummary.meanScore);
  const trend = computeTrend(meanScores);
  const latestMean = meanScores.length > 0 ? meanScores[meanScores.length - 1] : null;

  const context: ClassDetailOutletContext = {
    classId: classId!,
    className,
    gradeLevel,
    subject,
    studentCount,
    analyses,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/classes" className="hover:text-primary">Classes</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{className}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{className}</h1>
          {(gradeLevel || subject) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {[gradeLevel, subject].filter(Boolean).join(' \u00b7 ')}
            </p>
          )}
        </div>
        <Link
          to={`/analysis/new?classId=${classId}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:bg-primary/90 transition-colors shadow-[--shadow-sm] self-start"
        >
          <Plus className="w-4 h-4" />
          New Analysis
        </Link>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>{studentCount} student{studentCount !== 1 ? 's' : ''}</span>
        <span>{analyses.length} analys{analyses.length !== 1 ? 'es' : 'is'}</span>
        {latestMean !== null && (
          <span className="flex items-center gap-1.5">
            {Math.round(latestMean * 100)}% avg
            <TrendArrow trend={trend} size={14} />
          </span>
        )}
      </div>

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

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/ClassDetailLayout.tsx
git commit -m "feat: add ClassDetailLayout with tabbed navigation and context provider"
```

---

## Task 10: Class Detail — Overview Tab

**Files:**
- Create: `src/pages/ClassDetailOverview.tsx`

- [ ] **Step 1: Create the ClassDetailOverview page**

Create `src/pages/ClassDetailOverview.tsx`:

```tsx
import { useRef, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { findRecurringProblemSkills } from '@/lib/longitudinalUtils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { BarChart3 } from 'lucide-react';

function masteryColor(level: string) {
  if (level === 'green') return 'text-success';
  if (level === 'yellow') return 'text-warning';
  return 'text-destructive';
}

function masteryBgLight(level: string) {
  if (level === 'green') return 'bg-success/15';
  if (level === 'yellow') return 'bg-warning/15';
  return 'bg-destructive/15';
}

function trendLabel(trend: string) {
  if (trend === 'improving') return 'Improving';
  if (trend === 'worsening') return 'Worsening';
  return 'Stuck';
}

function trendColor(trend: string) {
  if (trend === 'improving') return 'text-success';
  if (trend === 'worsening') return 'text-destructive';
  return 'text-muted-foreground';
}

export default function ClassDetailOverview() {
  const { analyses } = useClassDetailContext();

  // Chart container sizing (same pattern as ClassOverview)
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setChartSize(width > 0 && height > 0 ? { w: width, h: height } : null);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Chart data
  const chartData = useMemo(
    () =>
      analyses.map((a) => ({
        name: a.assignmentTitle,
        date: new Date(a.generatedAt).toLocaleDateString(),
        mean: Math.round(a.classSummary.meanScore * 100),
        median: Math.round(a.classSummary.medianScore * 100),
        analysisId: a.analysisId,
      })),
    [analyses],
  );

  // Recurring problem skills
  const problemSkills = useMemo(
    () =>
      findRecurringProblemSkills(
        analyses.map((a) => ({
          analysisId: a.analysisId,
          generatedAt: a.generatedAt,
          assignmentTitle: a.assignmentTitle,
          skillBreakdown: a.skillBreakdown,
        })),
      ),
    [analyses],
  );

  if (analyses.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
        <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No analyses yet. Run an analysis to see trends over time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Score Trend Chart */}
      <section className="bg-card border border-border rounded-[--radius-md] p-5">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Score Trends</h2>
        <div ref={chartContainerRef} className="w-full h-[280px]">
          {chartSize && (
            <LineChart
              width={chartSize.w}
              height={chartSize.h}
              data={chartData}
              margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                axisLine={false}
                tickLine={false}
                width={35}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid hsl(33, 16%, 83%)',
                  backgroundColor: 'hsl(var(--card))',
                }}
                formatter={(value: number, name: string) => [`${value}%`, name === 'mean' ? 'Mean' : 'Median']}
                labelFormatter={(label) => label}
              />
              <Line
                type="monotone"
                dataKey="mean"
                stroke="hsl(216, 52%, 24%)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(216, 52%, 24%)' }}
                activeDot={{ r: 6 }}
                name="mean"
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="hsl(24, 55%, 60%)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="median"
              />
            </LineChart>
          )}
        </div>
        {analyses.length > 1 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Solid line = mean, dashed line = median. Click a point to view the analysis.
          </p>
        )}
      </section>

      {/* Recurring Problem Skills */}
      <section className="bg-card border border-border rounded-[--radius-md] p-5">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
          Recurring Problem Skills
        </h2>
        {problemSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skills have been flagged as weak across multiple analyses. Keep it up!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Skill</th>
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Weak In</th>
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Latest</th>
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {problemSkills.map((skill) => (
                  <tr key={skill.skillTag} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{skill.displayName}</td>
                    <td className="py-2.5 px-4 text-center text-muted-foreground">
                      {skill.weakCount} / {skill.totalCount} analyses
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${masteryBgLight(skill.latestMasteryLevel)} ${masteryColor(skill.latestMasteryLevel)}`}>
                        {Math.round(skill.latestMastery * 100)}%
                      </span>
                    </td>
                    <td className={`py-2.5 px-4 text-center text-xs font-medium ${trendColor(skill.trend)}`}>
                      {trendLabel(skill.trend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ClassDetailOverview.tsx
git commit -m "feat: add ClassDetailOverview tab with score trend chart and recurring problem skills"
```

---

## Task 11: Class Detail — Roster Tab

**Files:**
- Create: `src/pages/ClassDetailRoster.tsx`

- [ ] **Step 1: Create the ClassDetailRoster page**

Create `src/pages/ClassDetailRoster.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, buildSparklineData } from '@/lib/longitudinalUtils';
import type { Trend } from '@/lib/summaryTypes';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';

interface StudentRow {
  studentId: string;
  studentName: string;
  analysisCount: number;
  latestScore: number;
  trend: Trend;
  sparklineData: number[];
}

type SortKey = 'name' | 'score' | 'trend';
type SortDir = 'asc' | 'desc';

export default function ClassDetailRoster() {
  const { classId, analyses } = useClassDetailContext();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Aggregate student data across analyses
  const students = useMemo(() => {
    const map = new Map<string, { name: string; scores: number[] }>();

    for (const a of analyses) {
      for (const si of a.studentInsights) {
        if (!map.has(si.studentId)) {
          map.set(si.studentId, { name: si.studentName, scores: [] });
        }
        const entry = map.get(si.studentId)!;
        entry.scores.push(si.totalScore);
        entry.name = si.studentName; // latest name wins
      }
    }

    const rows: StudentRow[] = [];
    for (const [studentId, data] of map) {
      rows.push({
        studentId,
        studentName: data.name,
        analysisCount: data.scores.length,
        latestScore: data.scores[data.scores.length - 1],
        trend: computeTrend(data.scores),
        sparklineData: buildSparklineData(data.scores),
      });
    }
    return rows;
  }, [analyses]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...students];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.studentName.localeCompare(b.studentName);
      else if (sortKey === 'score') cmp = a.latestScore - b.latestScore;
      else {
        const order = { up: 1, flat: 0, down: -1 };
        cmp = order[a.trend] - order[b.trend];
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [students, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline w-3 h-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline w-3 h-3 ml-0.5" />
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
        <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No student data yet. Run an analysis to populate the roster.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th
                className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                onClick={() => toggleSort('name')}
              >
                Student <SortIcon column="name" />
              </th>
              <th className="text-center py-3 px-4 text-muted-foreground font-medium">Analyses</th>
              <th
                className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                onClick={() => toggleSort('score')}
              >
                Latest Score <SortIcon column="score" />
              </th>
              <th
                className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                onClick={() => toggleSort('trend')}
              >
                Trend <SortIcon column="trend" />
              </th>
              <th className="text-center py-3 px-4 text-muted-foreground font-medium">History</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.studentId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-2.5 px-4">
                  <Link
                    to={`/students/${classId}/${s.studentId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.studentName}
                  </Link>
                </td>
                <td className="py-2.5 px-4 text-center text-muted-foreground">{s.analysisCount}</td>
                <td className="py-2.5 px-4 text-center font-medium">
                  {Math.round(s.latestScore * 100)}%
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className="inline-flex justify-center">
                    <TrendArrow trend={s.trend} size={14} />
                  </span>
                </td>
                <td className="py-2.5 px-4">
                  <span className="flex justify-center">
                    {s.sparklineData.length >= 2 && <Sparkline data={s.sparklineData} />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ClassDetailRoster.tsx
git commit -m "feat: add ClassDetailRoster tab with sortable student table and sparklines"
```

---

## Task 12: Class Detail — Intervention History Tab

**Files:**
- Create: `src/pages/ClassDetailInterventions.tsx`

- [ ] **Step 1: Create the ClassDetailInterventions page**

Create `src/pages/ClassDetailInterventions.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { Loader2, Zap } from 'lucide-react';

interface InterventionRow {
  interventionId: string;
  displayName: string;
  skillTag: string;
  scope: string;
  status: string;
  analysisId: string;
  assignmentTitle: string;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  planned: 'bg-primary/15 text-primary',
  in_progress: 'bg-accent/15 text-accent-foreground',
  done: 'bg-success/15 text-success',
  dismissed: 'bg-muted text-muted-foreground',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  dismissed: 'Dismissed',
};

export default function ClassDetailInterventions() {
  const { user } = useAuth();
  const { classId, analyses } = useClassDetailContext();
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Build a map of analysisId -> assignmentTitle for display
  const analysisTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of analyses) {
      map.set(a.analysisId, a.assignmentTitle);
    }
    return map;
  }, [analyses]);

  // Fetch all interventions for analyses in this class
  useEffect(() => {
    if (!user || analyses.length === 0) {
      setLoading(false);
      return;
    }

    async function loadInterventions() {
      try {
        const analysisIds = analyses.map((a) => a.analysisId);

        // Firestore 'in' queries limited to 30 items — batch
        const allRows: InterventionRow[] = [];
        for (let i = 0; i < analysisIds.length; i += 30) {
          const batch = analysisIds.slice(i, i + 30);
          const snap = await getDocs(
            query(
              collection(db, 'interventions'),
              where('analysisId', 'in', batch),
              where('teacherId', '==', user!.uid),
            ),
          );
          for (const d of snap.docs) {
            const data = d.data();
            allRows.push({
              interventionId: d.id,
              displayName: data.displayName || data.skillTag || '',
              skillTag: data.skillTag || '',
              scope: data.scope || '',
              status: data.status || 'pending',
              analysisId: data.analysisId,
              assignmentTitle: analysisTitleMap.get(data.analysisId) || 'Unknown',
              createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || '',
            });
          }
        }

        setInterventions(allRows);
      } catch (err) {
        console.error('Failed to load interventions:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInterventions();
  }, [user, analyses, analysisTitleMap]);

  const filtered = useMemo(
    () =>
      statusFilter === 'all'
        ? interventions
        : interventions.filter((i) => i.status === statusFilter),
    [interventions, statusFilter],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading interventions...</span>
      </div>
    );
  }

  if (interventions.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
        <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No interventions have been recommended for this class yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter:</span>
        {['all', 'pending', 'planned', 'in_progress', 'done', 'dismissed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Intervention</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Skill</th>
                <th className="text-center py-3 px-4 text-muted-foreground font-medium">Scope</th>
                <th className="text-center py-3 px-4 text-muted-foreground font-medium">Status</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Analysis</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.interventionId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-foreground">{inv.displayName}</td>
                  <td className="py-2.5 px-4 text-muted-foreground">{inv.skillTag}</td>
                  <td className="py-2.5 px-4 text-center text-muted-foreground capitalize">{inv.scope.replace('_', ' ')}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[inv.status] || ''}`}>
                      {statusLabels[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <Link
                      to={`/analysis/${inv.analysisId}/interventions`}
                      className="text-primary hover:underline"
                    >
                      {inv.assignmentTitle}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">{inv.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-4">
          No interventions with status &ldquo;{statusLabels[statusFilter]}&rdquo;.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ClassDetailInterventions.tsx
git commit -m "feat: add ClassDetailInterventions tab with filterable intervention history"
```

---

## Task 13: Students List Page

**Files:**
- Create: `src/pages/StudentsList.tsx`

- [ ] **Step 1: Create the StudentsList page**

Create `src/pages/StudentsList.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkline } from '@/components/ui/Sparkline';
import { TrendArrow } from '@/components/ui/TrendArrow';
import type { StudentSummaryDoc } from '@/lib/summaryTypes';
import { ChevronDown, ChevronUp, Loader2, Search, Users } from 'lucide-react';

type SortKey = 'name' | 'class' | 'score' | 'trend' | 'date';
type SortDir = 'asc' | 'desc';

export default function StudentsList() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<StudentSummaryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Subscribe to studentSummaries
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'studentSummaries'),
      where('teacherId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setSummaries(snap.docs.map((d) => d.data() as StudentSummaryDoc));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Unique class list for filter dropdown
  const classList = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of summaries) {
      map.set(s.classId, s.className);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [summaries]);

  // Filter + sort
  const displayed = useMemo(() => {
    let filtered = summaries;

    if (classFilter !== 'all') {
      filtered = filtered.filter((s) => s.classId === classFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => s.studentName.toLowerCase().includes(q));
    }

    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.studentName.localeCompare(b.studentName);
      else if (sortKey === 'class') cmp = a.className.localeCompare(b.className);
      else if (sortKey === 'score') cmp = a.latestScore - b.latestScore;
      else if (sortKey === 'date') cmp = a.lastAnalysisDate.localeCompare(b.lastAnalysisDate);
      else {
        const order = { up: 1, flat: 0, down: -1 };
        cmp = (order[a.trend] ?? 0) - (order[b.trend] ?? 0);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [summaries, classFilter, searchQuery, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'class' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline w-3 h-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline w-3 h-3 ml-0.5" />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading students...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="font-heading text-2xl font-bold text-foreground">Students</h1>

      {summaries.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">No students yet. Add students to a class to get started.</p>
          <Link to="/classes" className="text-primary hover:underline text-sm">
            Go to Classes &rarr;
          </Link>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-card border border-border rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-card border border-border rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Classes</option>
              {classList.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th
                      className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('name')}
                    >
                      Student <SortIcon column="name" />
                    </th>
                    <th
                      className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('class')}
                    >
                      Class <SortIcon column="class" />
                    </th>
                    <th className="text-center py-3 px-4 text-muted-foreground font-medium">Analyses</th>
                    <th
                      className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('score')}
                    >
                      Latest Score <SortIcon column="score" />
                    </th>
                    <th
                      className="text-center py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('trend')}
                    >
                      Trend <SortIcon column="trend" />
                    </th>
                    <th className="text-center py-3 px-4 text-muted-foreground font-medium">History</th>
                    <th
                      className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('date')}
                    >
                      Last Analyzed <SortIcon column="date" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((s) => (
                    <tr key={`${s.classId}_${s.studentId}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4">
                        <Link
                          to={`/students/${s.classId}/${s.studentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {s.studentName}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4">
                        <Link
                          to={`/classes/${s.classId}`}
                          className="text-muted-foreground hover:text-primary hover:underline"
                        >
                          {s.className}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-center text-muted-foreground">{s.analysisCount}</td>
                      <td className="py-2.5 px-4 text-center font-medium">{Math.round(s.latestScore * 100)}%</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex justify-center">
                          <TrendArrow trend={s.trend} size={14} />
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="flex justify-center">
                          {s.sparklineData.length >= 2 && <Sparkline data={s.sparklineData} />}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {new Date(s.lastAnalysisDate).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {displayed.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              {searchQuery
                ? `No students matching "${searchQuery}"`
                : 'No students in this class yet.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/StudentsList.tsx
git commit -m "feat: add StudentsList page with global searchable/filterable student table"
```

---

## Task 14: Student Detail Longitudinal Page

**Files:**
- Create: `src/pages/StudentDetailLongitudinal.tsx`

- [ ] **Step 1: Create the StudentDetailLongitudinal page**

Create `src/pages/StudentDetailLongitudinal.tsx`:

```tsx
import { useEffect, useRef, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend, findPersistentConcerns } from '@/lib/longitudinalUtils';
import type { AnalysisResult } from '@/lib/schemas';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { AlertTriangle, Loader2, User } from 'lucide-react';

function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function masteryBgLight(score: number) {
  if (score >= 0.8) return 'bg-success/15';
  if (score >= 0.6) return 'bg-warning/15';
  return 'bg-destructive/15';
}

function trendLabel(t: string) {
  if (t === 'improving' || t === 'up') return 'Improving';
  if (t === 'worsening' || t === 'down') return 'Worsening';
  return 'Stable';
}

function trendColor(t: string) {
  if (t === 'improving' || t === 'up') return 'text-success';
  if (t === 'worsening' || t === 'down') return 'text-destructive';
  return 'text-muted-foreground';
}

export default function StudentDetailLongitudinal() {
  const { classId, studentId } = useParams<{ classId: string; studentId: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [analyses, setAnalyses] = useState<Array<{
    analysisId: string;
    assignmentTitle: string;
    generatedAt: string;
    totalScore: number;
    percentile: number;
    skillPerformance: Array<{
      skillTag: string;
      displayName: string;
      mastery: number;
    }>;
  }>>([]);

  // Chart container
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setChartSize(width > 0 && height > 0 ? { w: width, h: height } : null);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!classId || !studentId || !user) return;

    async function loadData() {
      try {
        // Fetch class name
        const classDoc = await getDoc(doc(db, 'classes', classId!));
        if (classDoc.exists()) {
          setClassName(classDoc.data().name || '');
        }

        // Fetch student name
        const studentDoc = await getDoc(doc(db, 'classes', classId!, 'students', studentId!));
        if (studentDoc.exists()) {
          const sd = studentDoc.data();
          setStudentName(`${sd.firstName} ${sd.lastName}`);
        }

        // Fetch all analyses for this class
        const analysesSnap = await getDocs(
          query(
            collection(db, 'analyses'),
            where('classId', '==', classId),
            where('teacherId', '==', user!.uid),
            orderBy('generatedAt', 'asc'),
          ),
        );

        const studentAnalyses: typeof analyses = [];
        for (const aDoc of analysesSnap.docs) {
          const aData = aDoc.data() as AnalysisResult;
          const si = aData.studentInsights.find((s) => s.studentId === studentId);
          if (!si) continue;

          // Fetch assignment title
          let title = 'Untitled';
          try {
            const assignDoc = await getDoc(doc(db, 'assignments', aData.assignmentId));
            if (assignDoc.exists()) title = assignDoc.data().title || 'Untitled';
          } catch { /* ignore */ }

          studentAnalyses.push({
            analysisId: aData.analysisId,
            assignmentTitle: title,
            generatedAt: aData.generatedAt,
            totalScore: si.totalScore,
            percentile: si.percentile,
            skillPerformance: si.skillPerformance || [],
          });
        }

        // Use student name from latest analysis if not found in roster
        if (!studentDoc.exists() && studentAnalyses.length > 0) {
          const lastAnalysis = analysesSnap.docs[analysesSnap.docs.length - 1].data() as AnalysisResult;
          const si = lastAnalysis.studentInsights.find((s) => s.studentId === studentId);
          if (si) setStudentName(si.studentName);
        }

        setAnalyses(studentAnalyses);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classId, studentId, user]);

  // Chart data
  const chartData = useMemo(
    () =>
      analyses.map((a) => ({
        name: a.assignmentTitle,
        date: new Date(a.generatedAt).toLocaleDateString(),
        score: Math.round(a.totalScore * 100),
        analysisId: a.analysisId,
      })),
    [analyses],
  );

  // Skill mastery progression
  const skillProgression = useMemo(() => {
    const map = new Map<string, {
      displayName: string;
      entries: Array<{ mastery: number; date: string }>;
    }>();

    for (const a of analyses) {
      for (const sp of a.skillPerformance) {
        if (!map.has(sp.skillTag)) {
          map.set(sp.skillTag, { displayName: sp.displayName, entries: [] });
        }
        map.get(sp.skillTag)!.entries.push({ mastery: sp.mastery, date: a.generatedAt });
      }
    }

    const rows = Array.from(map.entries()).map(([skillTag, data]) => {
      const masteries = data.entries.map((e) => e.mastery);
      const latest = masteries[masteries.length - 1];
      return {
        skillTag,
        displayName: data.displayName,
        firstSeen: new Date(data.entries[0].date).toLocaleDateString(),
        latestMastery: latest,
        trend: computeTrend(masteries),
        timesAssessed: data.entries.length,
      };
    });

    // Sort by latest mastery ascending (worst first)
    rows.sort((a, b) => a.latestMastery - b.latestMastery);
    return rows;
  }, [analyses]);

  // Persistent concerns
  const concerns = useMemo(
    () => findPersistentConcerns(analyses),
    [analyses],
  );

  const scores = analyses.map((a) => a.totalScore);
  const overallTrend = computeTrend(scores);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading student history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/students" className="hover:text-primary">Students</Link>
        <span className="mx-1.5">/</span>
        <Link to={`/classes/${classId}`} className="hover:text-primary">{className}</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{studentName}</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{studentName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          <Link to={`/classes/${classId}`} className="hover:text-primary hover:underline">{className}</Link>
        </p>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>{analyses.length} analys{analyses.length !== 1 ? 'es' : 'is'}</span>
        {scores.length > 0 && (
          <span className="flex items-center gap-1.5">
            {Math.round(scores[scores.length - 1] * 100)}% latest
            <TrendArrow trend={overallTrend} size={14} />
          </span>
        )}
      </div>

      {analyses.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
          <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No analysis data for this student yet.</p>
        </div>
      ) : (
        <>
          {/* Score History Chart */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Score History</h2>
            <div ref={chartContainerRef} className="w-full h-[240px]">
              {chartSize && (
                <LineChart
                  width={chartSize.w}
                  height={chartSize.h}
                  data={chartData}
                  margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'hsl(216, 15%, 50%)' }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid hsl(33, 16%, 83%)',
                      backgroundColor: 'hsl(var(--card))',
                    }}
                    formatter={(value: number) => [`${value}%`, 'Score']}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(216, 52%, 24%)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(216, 52%, 24%)' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {analyses.map((a) => (
                <Link
                  key={a.analysisId}
                  to={`/analysis/${a.analysisId}/student/${studentId}`}
                  className="text-xs text-primary hover:underline"
                >
                  {a.assignmentTitle} &rarr;
                </Link>
              ))}
            </div>
          </section>

          {/* Skill Mastery Progression */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Skill Mastery Progression</h2>
            {skillProgression.length === 0 ? (
              <p className="text-sm text-muted-foreground">No per-skill data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Skill</th>
                      <th className="text-left py-2 px-4 text-muted-foreground font-medium">First Seen</th>
                      <th className="text-center py-2 px-4 text-muted-foreground font-medium">Latest</th>
                      <th className="text-center py-2 px-4 text-muted-foreground font-medium">Trend</th>
                      <th className="text-center py-2 px-4 text-muted-foreground font-medium">Assessed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillProgression.map((skill) => (
                      <tr key={skill.skillTag} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 font-medium text-foreground">{skill.displayName}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{skill.firstSeen}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${masteryBgLight(skill.latestMastery)} ${masteryColor(skill.latestMastery)}`}>
                            {Math.round(skill.latestMastery * 100)}%
                          </span>
                        </td>
                        <td className={`py-2.5 px-4 text-center text-xs font-medium ${trendColor(skill.trend)}`}>
                          {trendLabel(skill.trend)}
                        </td>
                        <td className="py-2.5 px-4 text-center text-muted-foreground">{skill.timesAssessed}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Persistent Concerns */}
          <section className="bg-card border border-border rounded-[--radius-md] p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Persistent Concerns</h2>
            {concerns.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <span>No persistent concerns &mdash; this student is responding well to instruction.</span>
              </div>
            ) : (
              <div className="space-y-4">
                {concerns.map((c) => (
                  <div key={c.skillTag} className="border border-warning/20 bg-warning/5 rounded-[--radius-md] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                      <span className="font-medium text-foreground">{c.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        &mdash; weak for {c.consecutiveWeakCount} consecutive analyses
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs text-muted-foreground">Mastery trajectory:</span>
                      {c.masteryTrajectory.map((m, i) => (
                        <span
                          key={i}
                          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${masteryBgLight(m)} ${masteryColor(m)}`}
                        >
                          {Math.round(m * 100)}%
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.linkedAnalyses.map((la) => (
                        <Link
                          key={la.analysisId}
                          to={`/analysis/${la.analysisId}/student/${studentId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {la.analysisTitle} &rarr;
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/StudentDetailLongitudinal.tsx
git commit -m "feat: add StudentDetailLongitudinal page with score history, skill progression, and persistent concerns"
```

---

## Task 15: Cross-Links Between Existing and New Views

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/ClassOverview.tsx`
- Modify: `src/pages/StudentDetail.tsx`

- [ ] **Step 1: Dashboard — make class names link to /classes/:classId**

In `src/pages/Dashboard.tsx`, find the class group header that renders the class name. It will look something like a clickable section header with the class name. Wrap it in a `<Link to={/classes/${classId}}>` instead of just displaying it as text. The exact location depends on how the class group header is rendered — look for where the class name appears in the collapsible group header and make it a Link.

Find the class name rendering in the collapsible header (search for "class group" or the class name rendering near the ChevronDown icon) and change the class name from plain text to:

```tsx
<Link to={`/classes/${classId}`} className="hover:text-primary hover:underline">
  {className}
</Link>
```

Make sure `Link` is already imported from `react-router-dom` (it is in the existing Dashboard imports).

- [ ] **Step 2: ClassOverview — add class link to breadcrumb**

In `src/components/layout/AnalysisLayout.tsx`, the breadcrumb currently shows `Dashboard / {assignmentTitle}`. The analysis has a `classId` field. After loading the analysis, we can fetch the class name. However, to keep this simple and avoid extra fetches, add the class link in the `ClassOverview.tsx` page itself.

In `src/pages/ClassOverview.tsx`, the analysis object contains `analysis.classId` from context. Add a small link somewhere near the top of the "At a Glance" section. Find the section header or summary area and add:

```tsx
<Link
  to={`/classes/${analysis.classId}`}
  className="text-sm text-primary hover:underline"
>
  View class history &rarr;
</Link>
```

Place this near the existing class summary heading.

- [ ] **Step 3: StudentDetail — add "View full history" link**

In `src/pages/StudentDetail.tsx`, the student header area shows the student name and navigation arrows. Add a link to the longitudinal view. The analysis has `classId` from context, and `studentId` is from the URL params.

Near the student name heading (search for where `studentName` is rendered), add:

```tsx
<Link
  to={`/students/${analysis.classId}/${studentId}`}
  className="text-sm text-primary hover:underline"
>
  View full history &rarr;
</Link>
```

- [ ] **Step 4: Verify the app compiles**

Run: `npx vite build --mode development 2>&1 | head -30`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/ClassOverview.tsx src/pages/StudentDetail.tsx
git commit -m "feat: add cross-links between existing analysis views and new longitudinal views"
```

---

## Task 16: Deploy Cloud Functions and Firestore Rules

- [ ] **Step 1: Check active Firebase account**

Run: `firebase login:list`
Expected: steve@wearesmartass.com is active (or switch to it).

- [ ] **Step 2: Deploy Firestore rules**

Run: `firebase deploy --only firestore:rules`
Expected: Rules deployed successfully.

- [ ] **Step 3: Deploy Cloud Functions**

Run: `cd functions && npm run build && cd .. && firebase deploy --only functions:runAnalysis`
Expected: Function deployed successfully.

- [ ] **Step 4: Commit any deploy artifacts if needed**

No code changes expected here — deploy artifacts are not committed.

---

## Task 17: Build and Visual Verification

- [ ] **Step 1: Build the full app**

Run: `npx vite build`
Expected: Clean build with no errors.

- [ ] **Step 2: Start dev server**

Run: `npx vite dev`

- [ ] **Step 3: Verify Classes list page**

Navigate to `/classes` in the browser. Check:
- Nav shows Dashboard | Classes | Students tabs
- Class cards render with name, student count
- Cards without analyses show "No analyses yet" empty state
- Cards with analyses show mean score, trend arrow, sparkline
- Search filters cards by name
- "+ Add Class" opens ClassForm modal

- [ ] **Step 4: Verify Class Detail page**

Click a class card. Check:
- Breadcrumb shows Classes / ClassName
- Header shows class name, grade/subject, quick stats
- Overview tab renders score trend chart (if analyses exist)
- Recurring Problem Skills table populates
- Roster tab shows student table with sparklines and trend arrows
- Interventions tab shows intervention history with status filters

- [ ] **Step 5: Verify Students list page**

Navigate to `/students`. Check:
- Global student table renders
- Search filters by name
- Class dropdown filters by class
- Columns sortable
- Student names link to longitudinal view
- Class names link to class detail

- [ ] **Step 6: Verify Student Detail Longitudinal page**

Click a student. Check:
- Breadcrumb shows Students / ClassName / StudentName
- Score history chart renders
- Skill mastery progression table populates
- Persistent concerns show (or "no concerns" message)
- Links to analysis-scoped views work

- [ ] **Step 7: Verify cross-links**

- Dashboard: class names in group headers link to `/classes/:classId`
- ClassOverview: "View class history" link works
- Analysis StudentDetail: "View full history" link navigates to longitudinal view
- Longitudinal student links back to analysis-scoped views

- [ ] **Step 8: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address visual verification issues"
```
