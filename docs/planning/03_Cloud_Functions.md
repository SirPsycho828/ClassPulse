▸ Read: C:\Users\steve\.claude\projects\C--Users-steve-AppData-Roaming-agent-mission-control-plugins-prdstack\memory\active-projects.md  
  ← result received  
▸ Extended thinking (610 chars)  
## Overview

All server-side logic runs as Firebase Cloud Functions (Node/TypeScript, 2nd gen). Functions handle the AI pipeline (extraction, skill inference, analysis), admin operations (model config, model list proxy), and auth triggers (teacher profile creation). Every AI call routes through a shared OpenRouter client that reads model assignments from Firestore.

Functions never expose the OpenRouter API key to the client. The frontend calls Cloud Functions via HTTPS callable functions, and the functions call OpenRouter on the server side.

## Dependencies

- `01_Auth.md` -- `onUserCreate` trigger, auth context on callable functions
- `02_Database_Schema.md` -- all Firestore reads/writes, document shapes
- `05_Shared_Schemas.md` -- Zod schemas for validating AI responses
- `20_OpenRouter_Admin.md` -- admin functions and model config document

## Project Structure

```
functions/
  src/
    index.ts                     # All exports
    pipeline/
      extract.ts                 # Image -> ExtractionResult (vision AI)
      extractCsv.ts              # CSV -> ExtractionResult (no AI)
      grade.ts                   # Path B: compare answers to key
      inferSkills.ts             # Questions -> SkillInferenceResult (AI)
      analyze.ts                 # Pass 2: validated data -> AnalysisResult (AI)
      computeStats.ts            # Pure functions: mean, median, stdDev, outliers, mastery
    admin/
      fetchModels.ts             # Proxy OpenRouter /api/v1/models
      updateModelConfig.ts       # Save model assignments to Firestore
    triggers/
      onUserCreate.ts            # Create teacher profile document
    shared/
      openrouter.ts              # OpenRouter client
      schemas.ts                 # Zod schemas (shared with frontend via symlink or package)
      prompts.ts                 # All AI prompt templates
  package.json
  tsconfig.json
```

## Function Inventory

### Pipeline Functions (HTTPS Callable)

All pipeline functions require authentication. Each verifies `auth.uid` matches the `teacherId` on the target assignment document before proceeding.

| Function | Trigger | AI Call | Input | Output |
|----------|---------|---------|-------|--------|
| `runExtraction` | Callable | Yes (vision model) | `assignmentId` | Writes `ExtractionResult` + `RosterMatchResult` to assignment's `pipelineState` |
| `runCsvExtraction` | Callable | No | `assignmentId`, parsed CSV data | Writes `ExtractionResult` + `RosterMatchResult` to assignment's `pipelineState` |
| `submitValidation` | Callable | No | `assignmentId`, teacher corrections | Writes `ValidatedResult` to `pipelineState`. If Path B, runs grading. |
| `runAnalysis` | Callable | Yes (skill inference + analysis models) | `assignmentId` | Runs skill inference, computes stats, calls analysis AI, writes `AnalysisResult` to `analyses` collection, creates intervention documents |

**`runExtraction` detail:**
1. Read assignment doc (get `imageUrls`, `answerKey`, `type`)
2. Download images from Firebase Storage
3. Read model config from `config/openrouter` (extraction model)
4. Call OpenRouter with vision model -- images + extraction prompt
5. Parse response through Zod `ExtractionResult` schema
6. Run roster matching (algorithmic, no AI) against class roster
7. Write both results to `pipelineState` on assignment doc
8. Update assignment `status` to `needs_review`

**`runCsvExtraction` detail:**
1. Receive pre-parsed CSV data from frontend (column-mapped, normalized)
2. Build `ExtractionResult` from parsed data (no AI needed)
3. Run roster matching against class roster
4. Write to `pipelineState`, update status to `needs_review`

**`submitValidation` detail:**
1. Receive teacher's confirmed/corrected data
2. Build `ValidatedResult` with correction tracking
3. For any name corrections with `savedAsAlias: true`, update the student's `knownAliases` array in the roster
4. If Path B: run grading (compare validated answers against answer key, pure function), write `GradedResult`
5. Update status to `analyzing` or wait for teacher to trigger analysis

**`runAnalysis` detail:**
1. Read validated data (and graded data if Path B) from `pipelineState`
2. If per-question data exists: call skill inference AI, write `SkillInferenceResult` to `pipelineState`
3. Compute class statistics using pure functions in `computeStats.ts` (mean, median, stdDev, distribution shape, outliers, per-skill mastery)
4. Build analysis prompt with computed stats + validated data + skill mapping
5. Call analysis AI model
6. Parse response through Zod `AnalysisResult` schema
7. Merge computed stats with AI interpretive content into final `AnalysisResult`
8. Write to `analyses` collection
9. Create intervention documents in `interventions` collection (one per recommendation)
10. Log usage to `analyses/{id}/usage` subcollection
11. Update assignment status to `complete`

### Admin Functions (HTTPS Callable)

| Function | Auth | Purpose |
|----------|------|---------|
| `fetchAvailableModels` | Any authenticated user (admin check on write, not read) | Proxies OpenRouter `/api/v1/models`, caches result in `config/openrouter.cachedModelList` |
| `updateModelConfig` | Admin only | Writes model assignments to `config/openrouter.models` |

See `20_OpenRouter_Admin.md` for detailed behavior.

### Auth Triggers

| Function | Trigger | Purpose |
|----------|---------|---------|
| `onUserCreate` | `auth.user().onCreate` | Creates teacher profile at `teachers/{uid}`. See `01_Auth.md`. |

## OpenRouter Client

Shared client in `shared/openrouter.ts`. All AI calls go through this single module.

**Configuration:**
- API key stored as Cloud Functions environment secret (`OPENROUTER_API_KEY`). Set via `firebase functions:secrets:set OPENROUTER_API_KEY`.
- Base URL: `https://openrouter.ai/api/v1`
- Model IDs read from `config/openrouter` Firestore document per call

**Client responsibilities:**
1. Read the model assignment for the requested function (`extraction`, `skillInference`, `analysis`) from Firestore
2. Build the OpenRouter request (model, messages, response format)
3. Send request, capture response
4. Extract usage metadata from response (tokens, cost) for logging
5. Return the raw content string for Zod parsing by the caller

**Retry logic:** One automatic retry on transient failures (5xx, timeout). No retry on 4xx. No automatic model fallback in MVP -- if the configured model is down, the function returns an error to the client.

**Vision calls:** For extraction, the client sends images as base64 data URLs in the `messages` array using the standard OpenAI vision format (`type: "image_url"` content parts). The prompt template from `shared/prompts.ts` is combined with the image content parts.

## Prompt Templates

All prompts live in `shared/prompts.ts` as pure functions that accept context and return the messages array.

| Template | Inputs | Used By |
|----------|--------|---------|
| `buildExtractionPrompt` | Assignment type, answer key (if Path B), image count | `extract.ts` |
| `buildSkillInferencePrompt` | Questions (with text and choices), learning objectives | `inferSkills.ts` |
| `buildAnalysisPrompt` | Computed stats, validated data, skill mapping, graded data | `analyze.ts` |

Prompts instruct the AI to return structured JSON matching the expected schema. Key prompt patterns:
- Extraction prompt distinguishes student writing from teacher markings (red pen)
- Extraction prompt adapts for Path A-Simple (look for total scores) vs A-Detailed/B (look for per-question answers)
- Skill inference prompt targets topic-level granularity (not too broad, not too narrow)
- Analysis prompt receives pre-computed stats and generates only interpretive content (one-sentence summary, misconception text, intervention descriptions)
- Small class rule embedded in analysis prompt: use counts not percentages when N < 10

## Pure Computation Functions

`pipeline/computeStats.ts` contains all algorithmic calculations. These run before the analysis AI call, and their outputs are passed as inputs to the AI prompt.

| Function | Purpose |
|----------|---------|
| `calculateClassStats` | Mean, median, stdDev, min, max from normalized scores |
| `detectDistributionShape` | Returns `normal`, `bimodal`, `ceiling`, `floor`, or `uniform` |
| `detectOutliers` | Flags students > 2 SD from mean, with direction |
| `calculateSkillMastery` | Per-skill class mastery percentage and per-student mastery |
| `clusterStudentsByGap` | Groups students by shared skill gaps for intervention scoping |
| `determineInterventionScope` | 1-2 students = individual, 3-6 = small group, >50% = whole class |
| `detectAnswerKeyErrors` | Flags questions where >80% picked the same "wrong" answer |

These are the primary unit test targets (see `22_Testing_Fixtures.md`).

## Error Handling

**AI response parsing:** Every AI response is parsed through its Zod schema immediately. If parsing fails, retry the AI call once. If the retry also fails to parse, update the assignment status to `error` with a message. Never surface raw AI output or error details to the teacher -- the frontend shows "Couldn't process. Try re-uploading or enter data manually."

**Timeout:** Cloud Functions 2nd gen allows up to 60 minutes. Set pipeline functions to 5-minute timeout (generous for 10-15 images). If exceeded, status set to `error`.

**Partial failure in extraction:** If some images process but others fail, return partial results with metadata indicating which images failed. The teacher sees the partial data on Review & Confirm and can re-upload failed images or enter data manually.

**Auth enforcement:** Every callable function checks `context.auth` exists and `context.auth.uid` matches `teacherId` on the target document. Admin functions additionally verify `isAdmin` on the teacher profile doc.

## Environment Configuration

| Secret/Config | Type | Purpose |
|---------------|------|---------|
| `OPENROUTER_API_KEY` | Secret | API key for OpenRouter. Never logged or exposed to client. |

No other environment variables needed. Model assignments, confidence thresholds, and all other configuration lives in Firestore.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Shared schema package | Assumption | `shared/schemas.ts` is shared between functions and frontend. Options: npm workspace, symlinked file, or copy during build. Recommend npm workspace in a monorepo setup. |
| Image size limits | Gap | No spec on max image file size or max number of images per upload. Suggest 10MB per image, 30 images max per assignment. Enforce in both Storage rules and function validation. |
| Concurrent pipeline runs | Assumption | No locking mechanism. If a teacher somehow triggers two analyses on the same assignment, last-write-wins. Unlikely in normal usage since the UI gates progression. |
| Cold start latency | Assumption | 2nd gen Cloud Functions have lower cold starts than 1st gen but still noticeable. The 10-20 second processing estimate in the spec accounts for this. Consider min instances = 1 for the main pipeline function if cold starts are problematic. |
| CSV parsing location | Assumption | CSV is parsed and column-mapped on the frontend. The function receives structured data, not raw CSV. This avoids uploading CSV files to Storage and simplifies the function. |
| Rate limiting | Gap | No per-teacher rate limiting on AI calls. A teacher repeatedly re-analyzing could run up costs. Consider adding a simple cooldown or daily cap in post-MVP. |  
