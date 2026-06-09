## Overview

Skill inference is the second AI call in the pipeline. It maps each question on an assignment to educational skill tags -- topic-level labels like "fraction addition" or "reading comprehension: main idea." This mapping enables per-skill mastery breakdown on the Class Overview screen and targeted intervention recommendations. Skill inference runs only when per-question data exists (Path A-Detailed and Path B). Path A-Simple assignments skip this stage entirely since they have only total scores.

Cloud Function: runs as the first step inside `runAnalysis` (see `03_Cloud_Functions.md`)

## Dependencies

- `02_Database_Schema.md` -- writes `SkillInferenceResult` to `pipelineState`
- `03_Cloud_Functions.md` -- runs inside `runAnalysis`, uses OpenRouter client and prompt templates
- `05_Shared_Schemas.md` -- `SkillInferenceResultSchema`, `OverrideEnvelope` pattern
- `08_Assignment_Setup.md` -- `learningObjectives` field seeds the inference
- `14_Grading.md` -- `GradedResult` provides question content for Path B
- `17_Class_Overview.md` -- skill breakdown display, inline skill editing
- `20_OpenRouter_Admin.md` -- skill inference model configured in `config/openrouter`
- `21_Override_Confidence_Model.md` -- override envelope on each skill tag

## Default Model

`anthropic/claude-sonnet-4-6` -- strong reasoning for educational taxonomy without the cost of the top-tier model. Configurable via OpenRouter admin. Does not require vision capability.

## Input Assembly

The prompt receives question-level context to infer skills. What is available varies by path.

**Path B (richest context):**

| Available Data | Source |
|----------------|--------|
| Question numbers | Answer key |
| Question text | Answer key (if teacher provided it) |
| Answer choices | Answer key (if teacher provided them) |
| Correct answer | Answer key |
| Common wrong answers | Aggregated from `GradedResult` distractor data |
| Learning objectives | `assignment.learningObjectives` (if teacher provided) |
| Grade level | `class.gradeLevel` |
| Subject | `class.subject` |

**Path A-Detailed (less context):**

| Available Data | Source |
|----------------|--------|
| Question numbers | From extraction (numbered items found on papers) |
| Learning objectives | If provided |
| Grade level | Class metadata |
| Subject | Class metadata |

No question text, no answer choices, no correct answers. The AI infers skills from question numbers + class context + learning objectives alone. This produces broader, less precise skill tags.

## Prompt Design

Template function: `buildSkillInferencePrompt(questions, learningObjectives, gradeLevel, subject)`

### Core Instructions

The prompt instructs the model to:

1. Assign exactly one primary skill tag to each question
2. Optionally assign 1-2 secondary skill tags if the question tests multiple skills
3. Use topic-level granularity: specific enough to be actionable, broad enough to cluster questions
4. Return skills as override envelopes with confidence and evidence

### Granularity Guidance

The prompt includes calibration examples:

```
Too broad:  "Math" (not actionable -- the whole assignment is math)
Too broad:  "Number sense" (still too vague for intervention planning)
Right:      "Fraction addition with unlike denominators"
Right:      "Comparing fractions using common denominators"
Too narrow: "Adding 1/3 + 1/4 specifically" (too tied to one question)
```

Target: 3-8 unique skill tags per assignment. Fewer means the tags are too broad. More means too narrow. The prompt states this as guidance, not a hard constraint.

### Learning Objective Seeding

If the teacher provided `learningObjectives` during Setup, they are included in the prompt as preferred vocabulary:

```
The teacher described this assignment's learning objectives as:
"fraction addition, reducing fractions, mixed numbers"

Use these as a starting point for skill tags. You may refine, split, or add
tags beyond what the teacher listed, but prefer their terminology when it
aligns with what you observe in the questions.
```

The `learningObjectivesUsed` flag on the output records whether objectives were provided, so the analysis can note when skill tags are purely AI-inferred vs teacher-seeded.

### Output Format

The prompt requests JSON matching the `SkillInferenceResult` schema. Each skill tag is wrapped in an override envelope:

```json
{
  "skillMapping": [
    {
      "questionNumber": 1,
      "primarySkill": {
        "value": "fraction addition with unlike denominators",
        "confidence": 0.9,
        "evidence": "Q1 asks students to add 1/3 + 1/4, requiring finding a common denominator",
        "status": "pending",
        "teacherOverride": null,
        "teacherNote": null
      },
      "secondarySkills": []
    }
  ],
  "uniqueSkillsSummary": [
    { "skillTag": "fraction addition with unlike denominators", "questionNumbers": [1, 4, 7], "questionCount": 3 }
  ],
  "learningObjectivesUsed": true
}
```

## Response Parsing

1. Receive raw JSON from OpenRouter
2. Parse through `SkillInferenceResultSchema` via Zod `.safeParse()`
3. If success: write to `pipelineState.skillInferenceResult`
4. If failure: retry once with same prompt
5. If second failure: proceed without skill inference -- analysis runs with scores only, no per-skill breakdown

Failing gracefully is important here. Skill inference enriches the analysis but is not critical. A score-only analysis is still valuable. The Class Overview shows a note: "Skill breakdown unavailable for this analysis."

## Post-Parse Validation

Beyond Zod structural validation, check semantic invariants:

| Check | Action on Failure |
|-------|-------------------|
| Every `questionNumber` maps to a real question | Remove orphan entries |
| No duplicate `questionNumber` in `skillMapping` | Keep first, drop duplicate |
| `uniqueSkillsSummary` matches actual skill occurrences | Recompute from `skillMapping` |
| Confidence values between 0 and 1 | Clamp to [0, 1] |

These are silent fixes, not errors. Log the correction for debugging but continue the pipeline.

## Teacher Override (Second Human Gate)

Skill tags use the override envelope pattern (see `05_Shared_Schemas.md` and `21_Override_Confidence_Model.md`). The teacher can edit skill tags inline on the Class Overview screen.

### Override Flow

1. Class Overview shows the skill breakdown with each skill tag displayed as an editable chip
2. Teacher clicks a skill tag chip -> inline edit mode
3. Teacher can: rename the tag, merge two tags, or exclude a question from a skill group
4. Override updates the `teacherOverride` field and sets `status` to `"corrected"`
5. If corrections affect the analysis inputs, the analysis is marked stale (see `21_Override_Confidence_Model.md`)

### Re-Analysis Trigger

Skill tag corrections are a soft trigger for re-analysis. The system marks the analysis as `stale: true` and shows a "Re-analyze with corrections" button on Class Overview. The teacher decides whether to re-run. This is the second human-in-the-loop gate described in the pipeline overview (see `00_README.md`).

## Path A-Simple: Skip Behavior

Path A-Simple assignments have total scores only, no per-question data. Skill inference is skipped entirely:

- `pipelineState.skillInferenceResult` remains `null`
- Analysis runs with aggregate scores only
- Class Overview shows the score distribution band but no skill breakdown section
- Interventions are score-based ("students below 60%") rather than skill-based

## Skill Tag Consistency Across Analyses

Each analysis generates skill tags independently. The same teacher running two different fraction quizzes may get slightly different tag names ("fraction addition" vs "adding fractions"). There is no global skill taxonomy or tag normalization across analyses in MVP.

Post-MVP: a teacher-level skill dictionary could standardize tags across assignments. See `23_Future_Features.md`.

## Cost and Performance

Skill inference is a single text-only API call (no images). Typical payload is small: 10-20 questions with metadata.

- Latency: 3-8 seconds
- Cost: ~$0.005-0.02 per call with Claude Sonnet
- Logged to `analyses/{id}/usage` subcollection

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Path A-Detailed skill accuracy | Assumption | Without question text or answer choices, skill inference relies on question numbers + class context. Tags will be broader and less accurate than Path B. Acceptable -- the teacher can correct via overrides. |
| Skill tag normalization | Gap | No cross-analysis tag consistency. "Fraction addition" and "adding fractions" are treated as different skills. Teacher can manually rename for consistency. Post-MVP: normalize via embedding similarity. |
| Secondary skills | Assumption | Secondary skills are stored but not prominently displayed in MVP. The skill breakdown on Class Overview uses primary skills only. Secondary skills appear in Student Detail as additional context. |
| Maximum skill count | Assumption | No hard cap on unique skills. The prompt guides toward 3-8 but does not enforce. If the AI returns 15 unique skills for a 10-question quiz, the Class Overview may feel cluttered. The UI truncates to top 8 by mastery impact, with "Show all" expansion. |
| Skill merge UI | Gap | The override flow mentions "merge two tags" but no detailed UI spec. For MVP, merging is done by renaming one tag to match the other. The system does not automatically combine question groups -- the teacher renames and the analysis re-runs with the new grouping. |
| Non-academic assignments | Assumption | Skill inference assumes academic content. Art, PE, or music assignments may produce poor skill tags. The teacher can override or skip skill analysis by not providing per-question data. |  
