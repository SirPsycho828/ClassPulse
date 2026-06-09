▸ ToolSearch: select:TodoWrite  
  ← result received  
▸ Extended thinking (1475 chars)  
## Overview

Zod schemas in `shared/schemas.ts` are the single source of truth for every data shape that crosses a boundary: AI responses, Cloud Function payloads, and Firestore document structures. The same schemas serve two purposes: runtime validation (every AI response is parsed through Zod before the pipeline continues) and test-time validation (saved fixture responses are validated against the same schemas). See `22_Testing_Fixtures.md` for the test strategy.

This file lives in a shared location importable by both Cloud Functions and the frontend (via npm workspace, symlink, or shared package).

## Dependencies

- `02_Database_Schema.md` -- Firestore document shapes that these schemas mirror
- `03_Cloud_Functions.md` -- pipeline functions that parse AI responses through these schemas
- `22_Testing_Fixtures.md` -- fixture validation uses these schemas
- `21_Override_Confidence_Model.md` -- override envelope pattern defined here, behavior detailed there

## Schema Inventory

### Pipeline Schemas (Pass 1)

#### `ExtractionResultSchema`

Output of the vision AI (images) or CSV parser. One per assignment extraction run.

| Field | Type | Validation |
|-------|------|------------|
| `extractionId` | string | |
| `assignmentId` | string | |
| `sourceType` | enum | `"image"` or `"csv"` |
| `extractedStudents` | array | See `ExtractedStudent` below |
| `metadata.totalExtracted` | number | >= 0 |
| `metadata.imagesProcessed` | number | >= 0 |
| `metadata.partialPapersDetected` | boolean | |
| `metadata.processingTimeMs` | number | |

`ExtractedStudent`:

| Field | Type | Validation |
|-------|------|------------|
| `extractionIndex` | number | Unique within array, >= 0 |
| `sourceImageIndex` | number | >= 0 |
| `rawName` | string | |
| `nameConfidence` | number | 0 to 1 |
| `answers` | array | Empty for Path A-Simple |
| `answers[].questionNumber` | number | >= 1 |
| `answers[].extractedAnswer` | string | |
| `answers[].confidence` | number | 0 to 1 |
| `answers[].multipleAnswersDetected` | boolean | |
| `totalScore.raw` | string | Original format, e.g., "8/10" |
| `totalScore.normalized` | number | 0 to 1 |
| `totalScore.confidence` | number | 0 to 1 |
| `flags` | string[] | Known codes: `"low_confidence_name"`, `"low_confidence_score"`, `"multiple_answers_q{N}"`, `"marking_conflict"` |

#### `RosterMatchResultSchema`

Output of the algorithmic roster matching stage. Not AI-generated.

| Field | Type | Validation |
|-------|------|------------|
| `matches` | array | One per extracted student |
| `matches[].extractionIndex` | number | Must reference valid `extractionIndex` |
| `matches[].rawName` | string | |
| `matches[].matchTier` | enum | `"exact"`, `"alias"`, `"fuzzy"`, `"unmatched"` |
| `matches[].topCandidate` | object or null | Null if unmatched |
| `matches[].topCandidate.studentId` | string | Must exist in class roster |
| `matches[].topCandidate.rosterName` | string | |
| `matches[].topCandidate.confidence` | number | 0 to 1 |
| `matches[].otherCandidates` | array | Ranked by confidence descending |
| `matches[].status` | enum | `"confirmed"`, `"needs_review"`, `"unmatched"` |
| `unmatchedRosterStudents` | string[] | Student IDs with no submission |
| `summary.confirmed` | number | |
| `summary.needsReview` | number | |
| `summary.unmatched` | number | |
| `summary.absentFromSubmissions` | number | |

#### `ValidatedResultSchema`

Output after teacher confirms on Review & Confirm screen.

| Field | Type | Validation |
|-------|------|------------|
| `validationId` | string | |
| `assignmentId` | string | |
| `validatedStudents` | array | |
| `validatedStudents[].studentId` | string | Must exist in class roster |
| `validatedStudents[].rosterName` | string | |
| `validatedStudents[].answers` | array | Per-question answers (empty for Path A-Simple) |
| `validatedStudents[].totalScore.earned` | number | |
| `validatedStudents[].totalScore.possible` | number | |
| `validatedStudents[].totalScore.normalized` | number | 0 to 1 |
| `validatedStudents[].status` | enum | `"auto_confirmed"`, `"teacher_confirmed"`, `"teacher_corrected"`, `"manual_entry"` |
| `validatedStudents[].corrections` | array | Tracks every teacher change |
| `absentStudents` | string[] | Student IDs |
| `excludedStudents` | string[] | Student IDs |

#### `GradedResultSchema`

Path B only. Output of answer comparison against the answer key.

| Field | Type | Validation |
|-------|------|------------|
| `assignmentId` | string | |
| `gradedStudents` | array | |
| `gradedStudents[].studentId` | string | |
| `gradedStudents[].perQuestion` | array | |
| `gradedStudents[].perQuestion[].questionNumber` | number | Must exist in answer key |
| `gradedStudents[].perQuestion[].studentAnswer` | string | |
| `gradedStudents[].perQuestion[].correctAnswer` | string | |
| `gradedStudents[].perQuestion[].isCorrect` | boolean | |
| `gradedStudents[].perQuestion[].pointsEarned` | number | |
| `gradedStudents[].perQuestion[].pointsPossible` | number | |
| `gradedStudents[].perQuestion[].distractorIndex` | number or null | Index of chosen wrong answer in `answerChoices` |
| `gradedStudents[].total.earned` | number | |
| `gradedStudents[].total.possible` | number | |
| `gradedStudents[].total.normalized` | number | 0 to 1 |
| `answerKeyFlags` | array | Questions with suspiciously high miss rates |
| `answerKeyFlags[].questionNumber` | number | |
| `answerKeyFlags[].flag` | string | `"high_miss_rate"` |
| `answerKeyFlags[].missRate` | number | 0 to 1, flagged when > 0.8 |
| `answerKeyFlags[].mostCommonAnswer` | string | |

#### `SkillInferenceResultSchema`

AI-generated mapping of questions to educational skill tags.

| Field | Type | Validation |
|-------|------|------------|
| `assignmentId` | string | |
| `skillMapping` | array | One per question |
| `skillMapping[].questionNumber` | number | Must match assignment questions |
| `skillMapping[].primarySkill` | OverrideEnvelope | See below |
| `skillMapping[].secondarySkills` | OverrideEnvelope[] | |
| `uniqueSkillsSummary` | array | Deduplicated skill list with question counts |
| `learningObjectivesUsed` | boolean | Whether teacher-provided objectives seeded inference |

### Pipeline Schemas (Pass 2)

#### `AnalysisResultSchema`

The comprehensive output. See `02_Database_Schema.md` for storage and `16_Analysis_Pipeline.md` for how it is assembled from computed stats + AI content.

Top-level fields: `analysisId`, `assignmentId`, `classId`, `generatedAt`, `modelUsed`, `stale`, `teacherOverridesApplied`.

**`classSummary`**: `oneSentence` (string), `studentsAnalyzed`, `studentsAbsent`, `meanScore`, `medianScore`, `stdDev`, `minScore`, `maxScore` (all numbers 0-1), `distributionShape` (enum: `"normal"`, `"bimodal"`, `"ceiling"`, `"floor"`, `"uniform"`), `outliers` array.

**`skillBreakdown[]`**: `skillTag`, `displayName`, `questionNumbers[]`, `questionCount`, `classMastery` (0-1), `masteryLevel` (enum: `"green"`, `"yellow"`, `"red"`), `studentsStrugglingCount`, `studentsProficientCount`, `commonWrongAnswers[]` with `misconception` string.

**`studentInsights[]`**: `studentId`, `studentName`, `totalScore` (0-1), `relativeToClass` (enum: `"above_average"`, `"average"`, `"below_average"`), `percentile`, `skillPerformance[]` with per-skill mastery and gap, `gapAreas[]`, `wrongAnswerAnalysis[]` with `misconception` string.

**`interventions[]`**: `interventionId`, `priority`, `scope`, `skillTag`, `displayName`, `affectedStudentIds[]`, `affectedCount`, `misconceptionSummary`, `effortTiers` (quick/lesson/individual each with label + description), `status`, `teacherNote`, `plannedDate`, `selectedEffortTier`.

Mastery level thresholds applied during schema transform (not by AI): green > 0.8, yellow 0.6-0.8, red < 0.6.

### Cross-Cutting: Override Envelope

Used on every AI-generated value the teacher can correct. Applied to skill tags in `SkillInferenceResult`.

| Field | Type | Validation |
|-------|------|------------|
| `value` | string | The AI-proposed value |
| `confidence` | number | 0 to 1 |
| `evidence` | string | AI's reasoning for this value |
| `status` | enum | `"pending"`, `"confirmed"`, `"corrected"`, `"excluded"` |
| `teacherOverride` | string or null | New value if corrected |
| `teacherNote` | string or null | |

See `21_Override_Confidence_Model.md` for the full override behavior and re-analysis triggers.

## Semantic Invariants

Beyond structural validation, enforce these invariants in test suites (see `22_Testing_Fixtures.md`):

| Invariant | Catches |
|-----------|---------|
| Every `questionNumber` in graded/skill data maps to a question in the answer key | AI hallucinated a question |
| Every `studentId` in analysis maps to a roster student | AI invented a student |
| A student with 100% score has empty `gapAreas` | Gaps on a perfect scorer |
| Every `skillTag` in analysis appears in `skillMapping` | AI hallucinated a skill |
| Intervention `affectedStudentIds` is a subset of students struggling with that skill | Wrong targeting |
| `scope` is `"whole_class"` when affected count > 50% of class | Wrong scope assignment |
| All confidence/score numbers are between 0 and 1 | 95 vs 0.95 confusion |
| `summary.confirmed + summary.needsReview + summary.unmatched` equals total extracted | Counts don't add up |

## Runtime Validation Pattern

In Cloud Functions, after every AI response:

1. Parse raw JSON string from OpenRouter response
2. Pass through the appropriate Zod schema with `.safeParse()`
3. If success: continue pipeline with typed data
4. If failure: retry the AI call once with the same prompt
5. If second failure: set assignment status to `"error"`, log the Zod error details (not the raw AI response) for debugging

The frontend also parses Firestore documents through these schemas when reading analysis results, providing type safety and catching any data corruption.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Confidence score scale | Assumption | All confidence values are 0-1, never 0-100. The extraction and analysis prompts must explicitly instruct "return confidence as a decimal between 0 and 1." |
| Schema versioning | Gap | No version field on schemas. If schemas change after analyses are stored, old documents may fail validation. For MVP, accept this risk. Post-MVP: add a `schemaVersion` field. |
| Partial AnalysisResult | Gap | If analysis AI returns valid JSON that is missing optional sections (e.g., no `wrongAnswerAnalysis` for a student), Zod should allow empty arrays, not fail. Mark arrays as `.default([])`. |
| Override envelope scope | Assumption | Only used on skill inference tags in MVP. The spec shows the pattern on generic "AI-generated values" but only skill tags have the inline edit UI. Other overrides (name, score) use simpler correction tracking on `ValidatedResult`. |  
