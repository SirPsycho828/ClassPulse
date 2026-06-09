▸ Extended thinking (322 chars)  
## Overview

The analysis pipeline is Pass 2 -- the final AI call that produces everything the teacher sees on the Class Overview, Student Detail, and Intervention Planner screens. The key architectural principle: statistics are computed algorithmically first, then passed to the AI alongside validated data. The AI generates only interpretive content (one-sentence summaries, misconception explanations, intervention descriptions). The AI never does math. The final `AnalysisResult` is a merge of computed stats and AI-generated prose.

Cloud Function: `runAnalysis` (see `03_Cloud_Functions.md`)

## Dependencies

- `02_Database_Schema.md` -- writes to `analyses` collection, creates `interventions` documents
- `03_Cloud_Functions.md` -- `runAnalysis` callable, `computeStats.ts` pure functions, OpenRouter client
- `05_Shared_Schemas.md` -- `AnalysisResultSchema`
- `14_Grading.md` -- `GradedResult` (Path B input)
- `15_Skill_Inference.md` -- `SkillInferenceResult` (if per-question data exists)
- `17_Class_Overview.md` -- consumes the `AnalysisResult`
- `18_Student_Detail.md` -- consumes `studentInsights`
- `19_Intervention_Planner.md` -- consumes `interventions`
- `20_OpenRouter_Admin.md` -- analysis model configured in `config/openrouter`

## Default Model

`anthropic/claude-opus-4-6` -- the strongest reasoning model for the most consequential AI call. Configurable via OpenRouter admin. Does not require vision capability.

## Pipeline Stages

`runAnalysis` executes these stages sequentially:

```
1. Read validated data (+ graded data if Path B) from pipelineState
2. Run skill inference (if per-question data exists) -- see 15_Skill_Inference.md
3. Compute class statistics (pure functions, no AI)
4. Build analysis prompt with computed stats + validated data + skill mapping
5. Call analysis AI model
6. Parse response through Zod schema
7. Merge computed stats with AI interpretive content
8. Write AnalysisResult to analyses collection
9. Create intervention documents
10. Log usage
11. Update assignment status to "complete"
```

Stage 2 is documented in `15_Skill_Inference.md`. This file covers stages 3-9.

## Stage 3: Compute Class Statistics

Pure functions in `pipeline/computeStats.ts`. No AI, no external calls. These outputs are passed to the AI as facts it must not contradict.

### Score Statistics

| Function | Input | Output |
|----------|-------|--------|
| `calculateClassStats` | Array of normalized scores (0-1) | `mean`, `median`, `stdDev`, `min`, `max` |
| `detectDistributionShape` | Array of normalized scores | One of: `"normal"`, `"bimodal"`, `"ceiling"`, `"floor"`, `"uniform"` |
| `detectOutliers` | Array of `{studentId, score}` | Students > 2 SD from mean, with `direction: "above" \| "below"` |

**Distribution shape detection:**

| Shape | Criteria |
|-------|----------|
| `ceiling` | Median > 0.85 and skewness < -1 |
| `floor` | Median < 0.4 and skewness > 1 |
| `bimodal` | Two distinct peaks detected via histogram binning (10 bins, two non-adjacent bins each > 20% of students) |
| `normal` | Skewness between -1 and 1, no bimodal signal |
| `uniform` | StdDev < 0.05 (everyone scored similarly) |

### Skill Mastery (if skill inference available)

| Function | Input | Output |
|----------|-------|--------|
| `calculateSkillMastery` | Graded per-question data + skill mapping | Per-skill class mastery (0-1) and per-student-per-skill mastery |
| `clusterStudentsByGap` | Per-student skill mastery | Groups of students sharing the same skill gaps |
| `determineInterventionScope` | Cluster sizes, class size | `"whole_class"` (>50%), `"small_group"` (3-6), `"individual"` (1-2) |

**Mastery calculation per skill:**

```
skillMastery = (correct answers on skill questions) / (total skill questions)
```

Computed per student, then averaged across the class for the class-level mastery score.

**Mastery level thresholds** (applied in code, not by AI):

| Level | Threshold | Display |
|-------|-----------|---------|
| `green` | > 0.8 | "Strong" |
| `yellow` | 0.6 - 0.8 | "Developing" |
| `red` | < 0.6 | "Needs support" |

### Answer Key Error Flags (Path B)

If `GradedResult.answerKeyFlags` contains any entries, they are included in the analysis prompt so the AI can note them, but the computed stats treat the answer key as-is. The teacher resolves key errors separately (see `14_Grading.md`).

## Stage 4: Build Analysis Prompt

Template function: `buildAnalysisPrompt(computedStats, validatedData, skillMapping, gradedData, classContext)`

### Prompt Structure

The prompt provides computed facts and asks for interpretive content only:

```
You are analyzing a classroom assignment. Below are COMPUTED STATISTICS
that are mathematically correct. Do NOT recalculate or contradict them.

Your job: generate interpretive content -- summaries, misconception
explanations, and intervention recommendations -- based on these facts.

CLASS CONTEXT:
- Grade: 5th | Subject: Math | Students: 28 | Absent: 2

COMPUTED STATISTICS:
- Mean: 0.74 | Median: 0.78 | StdDev: 0.15
- Distribution: normal
- Outliers: [Marcus Rivera (0.32, below), ...]

SKILL MASTERY (computed):
- "fraction addition unlike denominators": class mastery 0.62 (yellow)
  - 8 students below 0.6 on this skill
  - Common wrong answer on Q3: chose "5/6" (added numerators and denominators)
- "fraction comparison": class mastery 0.89 (green)
  ...

PER-STUDENT DATA:
[validated scores and per-question correctness for each student]

RESPOND WITH JSON matching this exact schema:
[schema specification]
```

### What the AI Generates

The AI produces ONLY these interpretive fields:

| Field | Example |
|-------|---------|
| `classSummary.oneSentence` | "Most students handled fraction comparison well, but nearly a third struggled with adding fractions with unlike denominators." |
| `skillBreakdown[].commonWrongAnswers[].misconception` | "Students added numerators and denominators separately (1/3 + 1/4 = 2/7), suggesting they don't understand common denominators." |
| `studentInsights[].wrongAnswerAnalysis[].misconception` | "Marcus consistently added numerators directly, indicating a procedural gap rather than a conceptual one." |
| `interventions[].misconceptionSummary` | "Students treat fraction addition like whole number addition, operating on numerators and denominators independently." |
| `interventions[].effortTiers.quick.label` | "5-Minute Warm-Up" |
| `interventions[].effortTiers.quick.description` | "Draw fraction bars on the board. Have students physically see why 1/3 + 1/4 ≠ 2/7." |
| `interventions[].effortTiers.lesson.label` | "30-Minute Reteach" |
| `interventions[].effortTiers.lesson.description` | "Fraction strips activity: students build equivalent fractions to find common denominators before adding." |
| `interventions[].effortTiers.individual.label` | "1-on-1 Check-In" |
| `interventions[].effortTiers.individual.description` | "Sit with Marcus and walk through 3 problems together, asking him to explain each step." |

### Small Class Rule

Embedded in the prompt: "When N < 10, use counts ('3 students') not percentages ('60%'). Small percentages are misleading with few students."

### Intervention Generation Rules

The prompt constrains intervention output:

- Maximum 3 interventions by default (hard cap prevents intervention fatigue)
- Prioritize by impact: whole-class gaps first, then small-group, then individual
- Each intervention targets exactly one skill gap
- `affectedStudentIds` must be a subset of students actually struggling with that skill (provided in computed stats)
- Three effort tiers per intervention: quick (5-10 min), lesson (20-40 min), individual (1-on-1)

## Stage 5-6: AI Call and Parse

1. Call OpenRouter with the analysis model from `config/openrouter`
2. Parse response through `AnalysisResultSchema` via Zod `.safeParse()`
3. If failure: retry once
4. If second failure: set assignment status to `"error"`

## Stage 7: Merge Computed + AI Content

The final `AnalysisResult` document combines both sources:

| Source | Fields |
|--------|--------|
| Computed (authoritative) | `meanScore`, `medianScore`, `stdDev`, `minScore`, `maxScore`, `distributionShape`, `outliers`, `classMastery` per skill, `masteryLevel` per skill, `studentsStrugglingCount`, `studentsProficientCount`, `totalScore` per student, `relativeToClass`, `percentile`, `skillPerformance` per student |
| AI-generated (interpretive) | `oneSentence`, `misconception` strings, `effortTiers` descriptions, `misconceptionSummary` |

If any computed value in the AI response contradicts the pre-computed value, the computed value wins. The merge function overwrites AI numbers with computed numbers silently.

## Stage 8: Write Analysis Document

Create or overwrite document in `analyses/{analysisId}`:

- `analysisId`: auto-generated Firestore ID (or reuse existing if re-analysis)
- All fields from merged `AnalysisResult`
- `stale: false` (fresh analysis)
- `teacherOverridesApplied`: count of corrections from `ValidatedResult`
- `modelUsed`: the OpenRouter model ID used for this call

Update the assignment document: set `status` to `"complete"`.

## Stage 9: Create Intervention Documents

For each intervention in the analysis result, create a document in the `interventions` collection:

| Field | Source |
|-------|--------|
| `analysisId` | From the analysis document just created |
| `assignmentId` | From the assignment |
| `teacherId` | From the assignment |
| `priority` | Position in the AI's ranked list (1, 2, 3) |
| `status` | `"pending"` |
| `selectedEffortTier` | `null` (teacher hasn't chosen yet) |
| `teacherNote` | `null` |
| `plannedDate` | `null` |
| All other fields | From the AI's intervention output |

These are separate documents (not embedded in the analysis) because intervention status changes frequently and independently (see `19_Intervention_Planner.md`).

## Re-Analysis

When the teacher corrects data after an analysis has run (skill tag override, answer key correction), the analysis is marked `stale: true`. The teacher can trigger re-analysis from the Class Overview.

Re-analysis flow:
1. Re-read `pipelineState` (which may have updated skill overrides)
2. Re-run stages 3-9 with the corrected data
3. Overwrite the existing analysis document (no versioning)
4. Delete and recreate intervention documents (reset all statuses to `"pending"`)

The intervention reset is intentional. If the underlying data changed, previous intervention decisions may no longer be valid. The teacher re-evaluates on the refreshed Intervention Planner.

## Path A-Simple Analysis

Without per-question data, the analysis is score-only:

- No skill inference, no skill breakdown
- Computed stats: mean, median, stdDev, distribution shape, outliers
- AI generates: `oneSentence` summary, score-based interventions ("students below 60%")
- Interventions are scoped by score bands, not skill gaps
- No misconception detection, no wrong answer analysis
- Class Overview shows the score distribution band but no skill breakdown section

Still valuable -- tells the teacher who is struggling and by how much.

## Cost and Performance

Analysis is the most expensive AI call (strongest model, largest prompt).

- Prompt size: ~2000-4000 tokens for a 30-student class with skill data
- Response size: ~1500-3000 tokens
- Latency: 8-20 seconds
- Cost: ~$0.05-0.15 per call with Claude Opus
- Combined with skill inference: total Pass 2 time is 12-30 seconds

Logged to `analyses/{id}/usage` subcollection alongside the skill inference usage entry.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Analysis versioning | Assumption | Re-analysis overwrites the existing document. No history of previous runs. If a teacher wants to compare before/after a correction, they cannot. Acceptable for MVP. |
| Intervention reset on re-analysis | Assumption | All intervention statuses reset to `"pending"` on re-analysis. A teacher who marked an intervention "done" loses that status. The re-analysis callout warns: "Re-analyzing will reset your intervention progress." |
| AI contradicting computed stats | Assumption | The merge step silently overwrites AI numbers with computed values. No warning shown. This handles the case where the AI says "mean is 72%" but computed mean is 74%. |
| Token limits on large classes | Assumption | A 35-student class with 20 questions generates a prompt of ~4000 tokens. Well within context limits for Claude Opus. If future paths add shown-work text, prompt size could grow substantially. |
| Intervention count cap | Assumption | Hard cap of 3 interventions. The AI may identify more gaps, but the prompt constrains output to the top 3 by impact. Post-MVP: configurable cap in teacher preferences. |
| Empty analysis (all absent) | Gap | If all students are marked absent, there is no data to analyze. The function should detect this and set status to `"complete"` with a minimal analysis document noting zero students analyzed. No interventions generated. |  
