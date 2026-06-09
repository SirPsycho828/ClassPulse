▸ Extended thinking (294 chars)  
## Overview

The override confidence model governs how ClassPulse handles the tension between AI suggestions and teacher authority. The core principle: AI proposes, teacher decides. Every AI-generated value that the teacher can see and act on is wrapped in an override envelope -- a small metadata structure that tracks the AI's confidence, the teacher's response, and whether the correction should feed back into the system. This file defines the envelope pattern, where it applies, how corrections propagate, and when they trigger re-analysis.

## Dependencies

- `05_Shared_Schemas.md` -- override envelope schema definition
- `07_Class_Roster_Management.md` -- alias learning from name corrections
- `12_Roster_Matching.md` -- matching confidence scores, alias accumulation
- `13_Review_Confirm.md` -- first human gate, correction tracking
- `15_Skill_Inference.md` -- skill tag overrides, second human gate
- `16_Analysis_Pipeline.md` -- re-analysis triggers, stale flag
- `17_Class_Overview.md` -- skill tag inline editing UI

## Override Envelope Pattern

The envelope wraps any AI-generated value the teacher might correct:

| Field | Type | Purpose |
|-------|------|---------|
| `value` | string | The AI's proposed value |
| `confidence` | number (0-1) | How certain the AI is |
| `evidence` | string | AI's reasoning (shown on hover or expand) |
| `status` | enum | Current state of this value |
| `teacherOverride` | string or null | Teacher's replacement value |
| `teacherNote` | string or null | Optional teacher comment |

### Status Lifecycle

```
pending  -->  confirmed    (teacher accepts AI value)
pending  -->  corrected    (teacher provides a different value)
pending  -->  excluded     (teacher removes this item entirely)
```

All values start as `pending`. The teacher's action sets the final status. Once set, status can be changed again (teacher changes their mind) until the downstream pipeline stage consumes the data.

### Where Envelopes Apply in MVP

| Data Point | Location | Teacher Action |
|------------|----------|----------------|
| Skill tags (primary) | `SkillInferenceResult.skillMapping[].primarySkill` | Inline edit on Class Overview |
| Skill tags (secondary) | `SkillInferenceResult.skillMapping[].secondarySkills[]` | Inline edit on Class Overview |

### Where Envelopes Do NOT Apply (Simpler Tracking)

| Data Point | Location | Tracking Mechanism |
|------------|----------|--------------------|
| Student names | Review & Confirm | `corrections[]` array on `ValidatedResult` |
| Scores | Review & Confirm | `corrections[]` array on `ValidatedResult` |
| Per-question answers | Review & Confirm | `corrections[]` array on `ValidatedResult` |

The Review & Confirm corrections use a simpler structure because they happen in bulk (potentially 30 students x 20 questions) and the UI is a data table, not individual envelope widgets. The `corrections` array captures the same information (original, corrected, field name) without the full envelope overhead.

## Confidence Score Model

### Score Meaning

Confidence scores are the AI's self-assessment of certainty. They drive two behaviors: visual presentation (which rows need attention) and auto-confirmation logic (which values the system trusts without teacher review).

| Range | Meaning | Visual | Auto-Confirm |
|-------|---------|--------|-------------|
| 0.85 - 1.0 | High confidence | No indicator (clean UI) | Yes, if `autoConfirmExact` preference is true |
| 0.7 - 0.85 | Medium confidence | Yellow percentage badge | No, flagged for review |
| Below 0.7 | Low confidence | Red percentage badge + row highlight | No, requires teacher action |

The threshold of 0.7 comes from `teacher.preferences.confidenceThreshold` (see `02_Database_Schema.md`). Fixed at 0.7 for MVP.

### Confidence Sources

Different pipeline stages produce confidence from different signals:

**Extraction (vision AI):**
- Name confidence: legibility of handwriting, print vs cursive, smudging
- Answer confidence: clarity of marks, presence of erasures, multiple selections
- Score confidence: readability of written numbers, ambiguous formats

**Roster matching (algorithmic):**
- Tier 1 exact match: 1.0
- Tier 2 alias match: 0.95
- Tier 3 fuzzy match: the computed fuzzy score (0.5-0.9 range)
- Tier 4 unmatched: 0.0

**Skill inference (AI):**
- Tag confidence: how clearly the question maps to a single skill
- Lower confidence when question text is unavailable (Path A-Detailed)
- Higher confidence when learning objectives align with inferred tag

### Confidence Display

On Review & Confirm, confidence drives row coloring (see `04_UI_Design_System.md` and `13_Review_Confirm.md`). On Class Overview, skill tag confidence is not shown numerically -- instead, the evidence text is available on hover for any skill tag the teacher questions.

Design decision: showing numeric confidence on every skill tag would clutter the Class Overview. The teacher trusts the tag or edits it. The confidence value exists in the data for programmatic use (auto-confirm logic, future trust calibration) but is not prominently displayed for interpretive AI outputs.

## Correction Propagation

When a teacher corrects a value, the correction can propagate in two directions: forward (affecting downstream pipeline stages) and backward (improving future extractions).

### Forward Propagation

| Correction | Downstream Effect |
|------------|-------------------|
| Name correction on Review & Confirm | Validated result uses corrected name. Analysis references the correct student. |
| Score correction on Review & Confirm | Validated and graded results use corrected score. Analysis stats reflect the correction. |
| Answer correction on Review & Confirm | Grading uses corrected answer. Skill mastery recalculated. |
| Skill tag correction on Class Overview | Analysis marked stale. Re-analysis uses corrected tags for intervention targeting. |
| Answer key correction on Class Overview | Re-grading with corrected key. Re-analysis follows. |

All forward propagation is immediate within the current pipeline run (Review & Confirm corrections) or triggers re-analysis (post-analysis corrections).

### Backward Propagation (Learning)

| Correction | Learning Effect |
|------------|----------------|
| Name correction + "Remember this" | Alias saved to student's `knownAliases`. Future roster matching auto-confirms this name variant. |
| All other corrections | Logged in `corrections` array for future trust calibration but no immediate backward effect in MVP. |

Only name aliases produce backward learning in MVP. The system improves at recognizing name variants but does not adapt extraction or skill inference behavior based on past corrections.

## Re-Analysis Triggers

Certain teacher actions invalidate the current analysis. The system marks the analysis as stale rather than automatically re-running, giving the teacher control.

### Trigger Events

| Event | Sets `stale: true` | Re-Analysis Required |
|-------|-------------------|---------------------|
| Skill tag edited on Class Overview | Yes | Optional (teacher decides) |
| Answer key corrected from error flag | Yes | Yes (re-grade + re-analyze) |
| Data corrected on Review & Confirm after analysis ran | Yes | Optional |
| Model assignment changed in admin | No | No (affects future analyses only) |

### Stale Analysis Flow

1. Teacher makes a correction that triggers staleness
2. Analysis document's `stale` field set to `true`
3. Class Overview shows the stale banner: "Data has changed since this analysis was generated."
4. Teacher clicks "Re-analyze with corrections" or dismisses
5. If re-analyze: `runAnalysis` re-executes with current `pipelineState` data
6. New analysis overwrites the existing document, `stale` reset to `false`
7. Intervention documents deleted and recreated (see `19_Intervention_Planner.md`)

### Answer Key Correction Flow

Answer key errors detected by grading (see `14_Grading.md`) are surfaced on Class Overview. When the teacher corrects the key:

1. Update `assignment.answerKey.questions[N].correctAnswer`
2. Re-run grading against the corrected key (pure function, instant)
3. Write updated `GradedResult` to `pipelineState`
4. Set analysis `stale: true`
5. Auto-trigger re-analysis (this is not optional -- the grades changed)

## Trust Calibration (Post-MVP)

The spec describes an adaptive system where confidence thresholds adjust based on the teacher's correction rate. This is deferred to post-MVP but the data collection infrastructure exists in MVP.

### Data Available for Future Calibration

| Metric | Source | Purpose |
|--------|--------|---------|
| Correction rate per field type | `corrections` arrays across analyses | If the teacher corrects 40% of names, lower the auto-confirm threshold for names |
| Corrections per extraction model | `modelUsed` on analysis + `corrections` | Identify if a model change improved or worsened extraction quality |
| Alias hit rate | Tier 2 matches / total matches | Measure how much the alias system reduces teacher corrections over time |
| Override rate on skill tags | `status == "corrected"` count on skill envelopes | Assess skill inference accuracy |

### Planned Calibration Behavior

A sliding window (last 10 analyses) would compute per-field-type correction rates. If the correction rate exceeds a threshold:
- Increase: lower the auto-confirm threshold (flag more items for review)
- Decrease: raise the auto-confirm threshold (auto-confirm more items)

The teacher's `preferences.confidenceThreshold` would become dynamic rather than fixed at 0.7.

**Why deferred:** The value of adaptive calibration only emerges after a teacher has 10+ analyses. MVP teachers will have 0-5. The fixed threshold works until usage matures.

## Override Envelope UI Patterns

### Skill Tag Chip (Class Overview)

```
[ fraction addition ✎ ]     <-- default state
[ fraction addition | 87% confidence | ✎ ]   <-- hover reveals confidence
[ [_______________] ✓ ✗ ]   <-- edit mode: text input with save/cancel
```

On hover, a tooltip shows the `evidence` text: "Q1 asks students to add 1/3 + 1/4, requiring finding a common denominator."

### Correction Badge

After a teacher corrects a skill tag, the chip shows a subtle indicator that it was modified:

```
[ fraction addition* ✎ ]    <-- asterisk or small dot indicates teacher override
```

Hovering the indicator shows: "You changed this from 'adding fractions'. Original confidence: 72%."

This provides transparency without cluttering the interface. The teacher can always see what the AI proposed and what they changed.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Adaptive confidence thresholds | Deferred | Fixed at 0.7 for MVP. Data collection via `corrections` arrays supports future implementation. |
| Extraction feedback loop | Gap | Corrections to extracted answers do not improve future extraction quality. The AI receives the same prompt regardless of past corrections. Only name aliases produce backward learning. |
| Confidence calibration across models | Gap | Different models may use different internal confidence scales. A model that outputs 0.9 for uncertain values and another that outputs 0.6 would behave differently against the same threshold. No per-model calibration in MVP. |
| Override envelope on analysis content | Assumption | The override envelope is only used on skill tags in MVP. AI-generated prose (misconception text, intervention descriptions, one-sentence summary) is not individually overridable. The teacher's recourse for bad prose is re-analysis with a different model. |
| Bulk skill tag operations | Gap | No "accept all skill tags" or "reset all overrides" action. Each tag is edited individually. With 3-8 tags per analysis, this is manageable. |
| Override persistence across re-analysis | Assumption | Skill tag overrides are stored on `pipelineState.skillInferenceResult`. Re-analysis reads from `pipelineState`, so overrides are preserved. However, if skill inference re-runs (new model or changed data), it overwrites the entire `SkillInferenceResult`, losing previous overrides. The re-analysis confirmation warns about this. |
| Correction attribution | Assumption | Corrections are attributed to the authenticated teacher. No tracking of which admin or which browser session made a change. Single-teacher-per-class model means this is unambiguous. |  
