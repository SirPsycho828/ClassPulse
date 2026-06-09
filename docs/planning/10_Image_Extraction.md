▸ TodoWrite  
  ← result received  
## Overview

Image extraction is the first AI call in the pipeline. A vision-capable model processes uploaded photos of student papers and returns structured JSON containing student names, answers, and scores with per-field confidence scores. The extraction prompt adapts based on assignment type (Path A-Simple, Path A-Detailed, Path B) to look for different data on the page. This is the highest-variance stage in the pipeline -- image quality, handwriting, and paper formatting all affect output quality.

Cloud Function: `runExtraction` (see `03_Cloud_Functions.md`)

## Dependencies

- `02_Database_Schema.md` -- reads assignment document (`type`, `answerKey`, `imageUrls`), writes `ExtractionResult` to `pipelineState`
- `03_Cloud_Functions.md` -- OpenRouter client, prompt templates, function structure
- `05_Shared_Schemas.md` -- `ExtractionResultSchema` for response validation
- `09_Upload_Flow.md` -- images are in Firebase Storage before this runs
- `12_Roster_Matching.md` -- extraction output feeds directly into roster matching
- `20_OpenRouter_Admin.md` -- extraction model configured in `config/openrouter`

## Default Model

`google/gemini-2.5-flash` -- vision-capable, fast, cost-effective. Configurable via OpenRouter admin (see `20_OpenRouter_Admin.md`). The admin UI restricts the extraction model to vision-capable models only.

## Prompt Design

The extraction prompt is a template function in `shared/prompts.ts`: `buildExtractionPrompt(assignmentType, questionCount, answerKey)`.

### Core Prompt Structure

The prompt instructs the model to:

1. Examine each image for student papers
2. For each student paper found, extract the specified data
3. Return structured JSON matching the `ExtractionResult` schema
4. Assign a confidence score (0-1) to every extracted value
5. Flag ambiguous or unreadable items rather than guessing

### Path-Specific Instructions

**Path A-Simple** (scored work, total score only):
- "Look for a total score written on the page, typically at the top. Common formats: 8/10, 80%, B+."
- "Extract the student's name and total score only. Do not attempt to extract individual question answers."
- `answers` array will be empty. Only `totalScore` is populated.

**Path A-Detailed** (scored work, per-question marks visible):
- "Look for individual question marks: checkmarks, X's, circled answers, points per question."
- "For each question, extract whether the student got it right or wrong based on the teacher's marks."
- "Also extract the total score if visible."
- `answers` array populated with `isCorrect` derived from teacher markings. `extractedAnswer` may be the actual answer or just "correct"/"incorrect" depending on what is visible.

**Path B** (objective, ungraded):
- "Extract the student's selected answer for each question. Do not determine correctness."
- "Look for circled letters, filled bubbles, or written answers."
- The answer key is NOT included in the prompt. The model extracts raw answers only. Grading happens algorithmically later (see `14_Grading.md`).

### Distinguishing Student Writing from Teacher Marks

All prompt variants include:
- "Student answers are typically in pencil or blue/black ink. Teacher marks are typically in red ink, include checkmarks, X marks, circled items, or written scores."
- "If you cannot distinguish student writing from teacher marking on a specific question, set `confidence` below 0.5 and add `'marking_conflict'` to the student's `flags` array."

### Multi-Student Image Handling

The prompt addresses photos containing multiple student papers:
- "Each image may contain 1-4 student papers. Extract each student separately."
- "Only extract complete, fully visible papers. If a paper is partially cut off or only an edge is visible, set `partialPapersDetected: true` in metadata and skip it."
- "If two pages appear to belong to the same student (same name on both), note this with the `sourceImageIndex` matching across entries."

### Confidence Score Guidance

The prompt includes calibration guidance for confidence:
- "1.0: Printed text, clearly legible, no ambiguity"
- "0.8-0.9: Clear handwriting, high confidence in reading"
- "0.6-0.8: Somewhat legible, reasonable guess"
- "0.4-0.6: Difficult to read, multiple interpretations possible"
- "Below 0.4: Essentially guessing. Flag for review."

## Image Batching

Vision models have context limits on the number of images per request. The function handles this:

1. Read all `imageUrls` from the assignment document
2. Download images from Firebase Storage
3. If total images <= 10: send all in a single API call
4. If total images > 10: batch into groups of 8-10 images per call
5. Merge results from multiple calls into a single `ExtractionResult`
6. Deduplicate students that might appear in overlapping photos (same name detected across batches)

Each image is sent as a base64 data URL in the OpenRouter messages array using the standard vision content format (`type: "image_url"`).

**Batch ordering matters:** Images should be sent in the order the teacher uploaded them. This helps when a student's work spans two consecutive photos.

## Response Parsing

1. Receive raw JSON string from OpenRouter
2. Parse through `ExtractionResultSchema` via Zod `.safeParse()`
3. If parsing succeeds: proceed to roster matching
4. If parsing fails: retry the API call once with the same prompt
5. If second failure: set assignment `status` to `"error"`

### Post-Parse Normalization

After successful parsing, apply these normalizations:

- **Score normalization:** Convert `totalScore.raw` (e.g., "8/10") to `totalScore.normalized` (0.8). The AI may return these but verify/recalculate. Score formats: "8/10" -> divide, "80%" -> divide by 100, bare number -> divide by `assignment.totalPoints`.
- **Index assignment:** Ensure `extractionIndex` values are sequential starting from 0.
- **Confidence clamping:** Clamp all confidence values to [0, 1] range. Some models return values like 95 instead of 0.95.
- **Name trimming:** Trim whitespace from `rawName` values.

## Extraction Metadata

The `metadata` block on `ExtractionResult` provides sanity-check data:

| Field | Purpose |
|-------|---------|
| `totalExtracted` | How many students were found across all images |
| `imagesProcessed` | Should match number of images sent |
| `partialPapersDetected` | True if any image had a partially visible paper |
| `processingTimeMs` | Wall clock time for the extraction call(s) |

The frontend uses `totalExtracted` vs roster size for the count comparison on the processing screen and Review & Confirm.

## Answer Key Image Extraction

For Path B, if the teacher uploaded an answer key image during Setup (see `08_Assignment_Setup.md`), it is extracted using the same pipeline but with a modified prompt:

- "This is an answer key, not a student paper. Extract the correct answer for each question."
- "Also extract question text and answer choices if visible."
- Output is parsed into the `AnswerKey` shape, not `ExtractionResult`.

This extraction runs during Setup Step 3, before student paper extraction. It is a blocking step -- the teacher confirms the extracted key before proceeding.

## Edge Cases

### Image Quality

| Condition | Handling |
|-----------|----------|
| Very dark / shadowed image | Per-field confidence drops. Low-confidence fields flagged on Review & Confirm. |
| Pencil on white paper (low contrast) | Prompt instructs model to look carefully for light marks. Confidence reflects legibility. |
| Crumpled or folded paper | Model attempts extraction. Confidence scores reflect quality. Severely damaged -> most fields below threshold. |
| Bleed-through from back of page | Modern vision models handle this reasonably. No special handling. |

### Structural Issues

| Condition | Handling |
|-----------|----------|
| No name on paper | Returned as an extracted student with `rawName: ""` and `nameConfidence: 0`. Becomes an unmatched entry in roster matching. |
| Name in unexpected location | Prompt scans the full page, no hardcoded location for the name. |
| Two students on one photo where one is upside-down | Model may struggle. Low confidence on the inverted paper. Teacher corrects on Review & Confirm. |
| Only 1 student found when photo clearly has multiple | Metadata count sanity check surfaces this on the processing screen. Teacher can re-upload. |

### Content Issues

| Condition | Handling |
|-----------|----------|
| Student selected two answers | `multipleAnswersDetected: true` on that question. Teacher resolves on Review & Confirm. |
| Stickers, drawings, or non-academic content on paper | Model ignores irrelevant content. Extraction focuses on name, answers, scores. |
| Different paper formats across images | Prompt does not assume a fixed format. Each paper is analyzed independently. |

## Cost and Performance

**Typical costs** (varies by model pricing):
- 10 images, ~3 students per image: 1-2 API calls, ~$0.01-0.05 per call with Gemini Flash
- Cost logged to `analyses/{id}/usage` subcollection per call

**Typical latency:**
- 5-10 images: 5-15 seconds
- 15-30 images: 15-30 seconds (batched into 2-3 calls)

These estimates assume Gemini Flash. Switching to a more expensive model via admin config may increase both cost and latency.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Image preprocessing | Gap | Spec mentions "auto-contrast enhancement" before AI. No library specified. For MVP, send raw images to the vision model without preprocessing. Add preprocessing if extraction quality is consistently poor on low-contrast images. |
| HEIC format support | Assumption | If the vision model does not accept HEIC, convert to JPEG in the Cloud Function before sending. Use a lightweight library like `sharp`. |
| Max image dimensions | Assumption | Vision models typically accept images up to 4096px. If uploaded images exceed this, resize in the Cloud Function before sending. Most phone photos are within range. |
| Batch deduplication | Gap | When batching images across multiple API calls, a student whose pages span two batches could appear twice. Deduplication uses name similarity -- if two entries have very similar names and appear in consecutive image batches, flag for potential merge. Simple heuristic, not guaranteed. Teacher resolves on Review & Confirm. |
| Token limits | Assumption | 10 images per batch stays within context limits for Gemini Flash. If a future admin selects a model with a smaller context window, batches may need to be smaller. No dynamic batch sizing in MVP. |  
