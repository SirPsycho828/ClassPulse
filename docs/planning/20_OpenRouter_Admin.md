▸ Extended thinking (295 chars)  
## Overview

The OpenRouter Admin page lets the app administrator assign AI models to each pipeline function (extraction, skill inference, analysis) and browse available models from OpenRouter's catalog. This is a single-user admin page -- only teachers with `isAdmin: true` can access it. The model list is fetched server-side via a Cloud Function to avoid exposing the OpenRouter API key to the browser.

Route: `/admin/models`

## Dependencies

- `01_Auth.md` -- AdminRoute guard, `isAdmin` flag on teacher profile
- `02_Database_Schema.md` -- `config/openrouter` singleton document
- `03_Cloud_Functions.md` -- `fetchAvailableModels` and `updateModelConfig` callable functions
- `04_UI_Design_System.md` -- form patterns, table styles
- `10_Image_Extraction.md` -- extraction function requires a vision-capable model
- `15_Skill_Inference.md` -- skill inference model assignment
- `16_Analysis_Pipeline.md` -- analysis model assignment

## Access Control

The AdminRoute guard (see `01_Auth.md`) redirects non-admin users to the Dashboard. The Cloud Functions enforce admin status independently:

- `fetchAvailableModels`: callable by any authenticated user (read-only, no security risk)
- `updateModelConfig`: checks `isAdmin: true` on the caller's teacher profile document before writing. Returns `permission-denied` error if not admin.

The Firestore security rule on `config/openrouter` also enforces this: read is open to authenticated users (all functions need to read model assignments), write requires admin.

## Screen Layout

```
+--[ Breadcrumb: Dashboard / Admin / Model Configuration ]-----+
|                                                               |
|  SECTION 1: CURRENT ASSIGNMENTS                               |
|  [ Extraction model ]  [ Skill Inference model ]  [ Analysis ]|
|                                                               |
|  SECTION 2: MODEL BROWSER                                     |
|  [ Search / filter ]                                          |
|  [ Model list table ]                                         |
|                                                               |
+---------------------------------------------------------------+
```

## Section 1: Current Model Assignments

Three cards, one per pipeline function. Each card shows the currently assigned model and allows changing it.

### Assignment Card

| Element | Content |
|---------|---------|
| Function name | "Extraction", "Skill Inference", "Analysis" |
| Function description | Brief: "Vision model for reading student papers" |
| Current model | Model ID and display name, e.g., "google/gemini-2.5-flash" |
| Vision required | Badge: "Requires Vision" on extraction card only |
| Change button | Opens model selector (see below) |

### Default Assignments

| Function | Default Model | Vision Required |
|----------|--------------|-----------------|
| Extraction | `google/gemini-2.5-flash` | Yes |
| Skill Inference | `anthropic/claude-sonnet-4-6` | No |
| Analysis | `anthropic/claude-opus-4-6` | No |

These defaults are written to `config/openrouter` on first access if the document does not exist. The Cloud Function checks for document existence and seeds defaults if missing.

### Model Selector

Clicking "Change" on an assignment card opens an inline panel or modal with the model browser filtered appropriately:

- Extraction: filtered to vision-capable models only (`capabilities.vision == true` in OpenRouter metadata)
- Skill Inference: all text models (no vision filter)
- Analysis: all text models (no vision filter)

The admin selects a model from the browser, confirms, and the assignment updates.

## Section 2: Model Browser

A searchable, filterable list of all models available on OpenRouter.

### Data Source

The model list comes from the `fetchAvailableModels` Cloud Function, which proxies `GET https://openrouter.ai/api/v1/models` and caches the response in `config/openrouter.cachedModelList`.

**Cache behavior:**
- On page load, read `cachedModelList` and `lastFetched` from Firestore
- If `lastFetched` is within the last 24 hours, use cached data (no function call)
- If stale or missing, call `fetchAvailableModels` to refresh
- "Refresh Models" button forces a fresh fetch regardless of cache age

### Model List Table

| Column | Content | Sortable |
|--------|---------|----------|
| Model name | Display name from OpenRouter | Yes (alpha) |
| Model ID | Full ID, e.g., `anthropic/claude-sonnet-4-6` | No |
| Provider | Extracted from model ID prefix | Yes |
| Context window | Token limit | Yes (numeric) |
| Vision | "Yes" badge or empty | Filterable |
| Pricing | Input/output cost per million tokens | Yes (numeric) |
| Actions | "Use for..." dropdown | -- |

### Search

Text input above the table. Filters model name and model ID as the admin types. Client-side filtering against the cached list -- no server calls per keystroke.

### Filters

Toggle buttons above the table:

| Filter | Behavior |
|--------|----------|
| Vision Only | Show only models with vision capability |
| Free | Show only models with zero pricing |
| Favorites | Show only models the admin has starred (stored locally) |

Filters combine with search (AND logic).

### Grouping

Models are grouped by category:

1. **Favorites** (starred by admin, stored in localStorage) -- always at top
2. **Free models** -- grouped together for cost-conscious selection
3. **All models** -- everything else, sorted by provider then name

Within each group, sort by the selected column header.

### "Use for..." Action

Each model row has a dropdown button with three options:
- "Use for Extraction" (disabled if model lacks vision and extraction requires it)
- "Use for Skill Inference"
- "Use for Analysis"

Selecting an option immediately updates the assignment. The current assignments section at the top reflects the change. A success toast confirms: "Extraction model updated to {model name}."

## Cloud Function: fetchAvailableModels

**Trigger:** HTTPS callable, any authenticated user.

**Logic:**
1. Call `GET https://openrouter.ai/api/v1/models` with the API key in the `Authorization` header
2. Parse the response, extracting per-model: `id`, `name`, `context_length`, `pricing.prompt`, `pricing.completion`, and capability flags
3. Write the parsed list to `config/openrouter.cachedModelList`
4. Write current timestamp to `config/openrouter.lastFetched`
5. Return the list to the caller

**Error handling:** If OpenRouter is unreachable, return the stale cached list (if available) with a flag indicating the data is stale. If no cache exists, return an error.

**Response size:** OpenRouter's model list is large (200+ models). The Cloud Function returns all models. Client-side filtering handles the UI. The Firestore document stays within the 1MB limit since each model entry is small (~200 bytes).

## Cloud Function: updateModelConfig

**Trigger:** HTTPS callable, admin only.

**Input:**

| Field | Type | Validation |
|-------|------|------------|
| `function` | `"extraction" \| "skillInference" \| "analysis"` | Required, must be one of three |
| `modelId` | string | Required, must exist in `cachedModelList` |

**Logic:**
1. Verify caller is admin: read `teachers/{auth.uid}`, check `isAdmin == true`
2. If `function == "extraction"`: verify the model has vision capability in the cached list
3. Write `modelId` to `config/openrouter.models.{function}.modelId`
4. Return success

**Validation failure responses:**
- Not admin: `permission-denied`
- Unknown model ID: `invalid-argument` with "Model not found in catalog"
- Extraction without vision: `invalid-argument` with "Extraction requires a vision-capable model"

## Usage Tracking

The admin page shows a simple usage summary below the current assignments:

### Usage Table

Read from `analyses/{id}/usage` subcollection across all analyses for this teacher. Aggregated client-side.

| Column | Content |
|--------|---------|
| Function | extraction / skillInference / analysis |
| Calls (30 days) | Count of usage documents in the last 30 days |
| Total tokens | Sum of `tokensIn + tokensOut` |
| Total cost | Sum of `cost` field, formatted as USD |

This is a rough overview, not a billing dashboard. The data comes from OpenRouter's response headers logged during each pipeline run (see `03_Cloud_Functions.md`).

**Performance note:** Aggregating usage across all analyses requires reading multiple subcollections. For MVP, this is acceptable since a single teacher generates a limited number of analyses. If slow, add a denormalized usage summary document updated by each pipeline run.

## Model Change Impact

Changing a model assignment affects future pipeline runs only. Existing analyses are not re-processed. The `modelUsed` field on each analysis document records which model generated it.

No validation that the new model produces compatible output formats. All models are expected to follow the same prompt instructions and return JSON matching the Zod schemas. If a model produces invalid output, the pipeline's retry-then-error logic handles it (see `03_Cloud_Functions.md`).

## Responsive Behavior

- Desktop: assignment cards in a 3-column row, model browser table below at full width
- Tablet: assignment cards stack to 2+1, table scrolls horizontally
- Mobile: assignment cards stack vertically, model browser switches to a card-per-model layout (table is too wide for mobile). Each model card shows name, provider, pricing, vision badge, and "Use for..." button.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Cost dashboard | Gap | Usage tracking is basic -- totals only. No per-analysis cost breakdown, no cost trends, no budget alerts. Acceptable for MVP with a single admin monitoring costs manually via the OpenRouter dashboard. |
| Model testing | Gap | No "test this model" feature. The admin changes the assignment and runs a real analysis to see results. Post-MVP: a test mode that runs a fixture through the model and shows sample output. See `22_Testing_Fixtures.md`. |
| Model deprecation | Gap | If OpenRouter removes a model that is currently assigned, the next pipeline run will fail. The error handling in `03_Cloud_Functions.md` surfaces this as a generic error. The admin would need to update the assignment. Post-MVP: alert when an assigned model is missing from the refreshed catalog. |
| Multi-admin | Assumption | Single admin in MVP. If two admins existed and both changed model assignments simultaneously, last-write-wins. No conflict detection. |
| Favorites storage | Assumption | Admin's starred/favorite models stored in browser localStorage, not Firestore. Lost if the admin switches browsers. Low impact for a single-user admin feature. |
| API key rotation | Gap | No UI for changing the OpenRouter API key. Key is set via `firebase functions:secrets:set` CLI command. If the key is compromised, the admin must rotate via CLI. |
| Model capability verification | Assumption | The function trusts OpenRouter's capability metadata. If a model claims vision support but handles images poorly, the admin discovers this through poor extraction quality, not upfront validation. |  
