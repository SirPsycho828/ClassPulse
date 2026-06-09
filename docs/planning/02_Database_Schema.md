▸ ToolSearch: select:Write  
  ← result received  
▸ Extended thinking (1147 chars)  
## Overview

All persistent data lives in Cloud Firestore. Collections are designed around teacher ownership -- every document traces back to a `teacherId` that maps to a Firebase Auth `uid`. This anchors all security rules to a single pattern: teachers can only read and write their own data.

Intermediate pipeline state (extraction results, roster matches, validated data) is stored on the assignment document so teachers can resume if they close the browser mid-flow, and so corrections are preserved for re-analysis.

## Dependencies

- `01_Auth.md` -- teacher `uid` is the ownership anchor for all documents
- `05_Shared_Schemas.md` -- Zod schemas mirror these collection shapes for runtime validation

## Collections

### `teachers/{uid}`

**Purpose:** Teacher profile and preferences. Created by `onUserCreate` Cloud Function trigger (see `01_Auth.md`).

| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | Matches Firebase Auth UID and document ID |
| `email` | string | |
| `displayName` | string | |
| `isAdmin` | boolean | Default `false`. Manually set via Firebase Console. |
| `preferences.confidenceThreshold` | number | Default `0.7`. Fixed for v1. |
| `preferences.autoConfirmExact` | boolean | Default `true`. Auto-confirm exact roster matches. |
| `createdAt` | Timestamp | |

No composite indexes needed.

### `classes/{classId}`

**Purpose:** Class definition. One document per class per teacher.

| Field | Type | Notes |
|-------|------|-------|
| `teacherId` | string | Owner. Used in security rules. |
| `name` | string | e.g., "5th Grade Math - Period 2" |
| `gradeLevel` | string | e.g., "5" |
| `subject` | string | e.g., "Math" |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `classes/{classId}/students/{studentId}`

**Purpose:** Student roster entries. Subcollection of class.

| Field | Type | Notes |
|-------|------|-------|
| `firstName` | string | |
| `lastName` | string | |
| `displayName` | string | Compact label for AI matching, e.g., "Emma J." |
| `knownAliases` | string[] | Initially empty. Populated from teacher corrections (see `21_Override_Confidence_Model.md`). |
| `createdAt` | Timestamp | |

Security inherits from parent class document -- if teacher owns the class, they own the students subcollection.

### `assignments/{assignmentId}`

**Purpose:** Assignment metadata, answer key, and all intermediate pipeline state. This is the central document for a single analysis run.

| Field | Type | Notes |
|-------|------|-------|
| `classId` | string | Reference to parent class |
| `teacherId` | string | Owner. Denormalized for security rules. |
| `title` | string | e.g., "Chapter 4 Quiz - Fractions" |
| `type` | `"scored" \| "objective"` | Path A vs Path B |
| `date` | string | ISO date, e.g., "2026-06-09" |
| `totalPoints` | number | |
| `questionCount` | number | |
| `learningObjectives` | string \| null | Optional free text to seed skill inference |
| `answerKey` | AnswerKey \| null | Null for Path A. See schema below. |
| `sourceType` | `"image" \| "csv"` | |
| `imageUrls` | string[] | Firebase Storage paths for uploaded images |
| `status` | AssignmentStatus | Pipeline progress tracker (see below) |
| `pipelineState` | PipelineState | All intermediate results (see below) |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

**AssignmentStatus enum:**

| Value | Meaning |
|-------|---------|
| `uploading` | Images/CSV being uploaded |
| `extracting` | Vision AI or CSV parser running |
| `needs_review` | Extraction complete, teacher must validate |
| `reviewing` | Teacher is on the Review & Confirm screen |
| `analyzing` | Pass 2 AI analysis running |
| `complete` | Analysis result ready |
| `error` | Pipeline failed (with error message) |

**AnswerKey shape:**

| Field | Type | Notes |
|-------|------|-------|
| `source` | `"manual" \| "image"` | |
| `questions` | AnswerKeyQuestion[] | |

Each `AnswerKeyQuestion`:

| Field | Type | Notes |
|-------|------|-------|
| `questionNumber` | number | |
| `questionText` | string \| null | Optional but improves skill inference |
| `correctAnswer` | string | |
| `answerChoices` | string[] \| null | Enables distractor analysis |
| `points` | number | Default 1 if not specified |
| `extraCredit` | boolean | Default `false` |

**PipelineState shape:**

Stores intermediate results at each pipeline stage. Each field is null until that stage completes.

| Field | Type | Notes |
|-------|------|-------|
| `extractionResult` | ExtractionResult \| null | Output of stages 1.1/1.2. See `05_Shared_Schemas.md`. |
| `rosterMatchResult` | RosterMatchResult \| null | Output of stage 1.3 |
| `validatedResult` | ValidatedResult \| null | Output of stage 1.4 (after teacher confirms) |
| `gradedResult` | GradedResult \| null | Output of stage 1.5 (Path B only) |
| `skillInferenceResult` | SkillInferenceResult \| null | Output of stage 1.6 |

Pipeline state is stored here rather than in subcollections because it is always read and written as a unit, and the total size stays well within Firestore's 1MB document limit (even 35 students with 20 questions each).

### `analyses/{analysisId}`

**Purpose:** The complete Pass 2 analysis result -- everything needed to render Class Overview, Student Detail, and Intervention Planner screens.

| Field | Type | Notes |
|-------|------|-------|
| `assignmentId` | string | Reference to source assignment |
| `classId` | string | |
| `teacherId` | string | Owner. Denormalized for security rules. |
| `generatedAt` | Timestamp | |
| `modelUsed` | string | OpenRouter model ID |
| `stale` | boolean | Set to `true` when teacher corrects Pass 1 data after analysis ran |
| `teacherOverridesApplied` | number | Count of corrections made before this analysis run |
| `classSummary` | object | See `AnalysisResult` schema in `05_Shared_Schemas.md` |
| `skillBreakdown` | array | |
| `studentInsights` | array | |
| `interventions` | array | |

This document can be large (10-30KB for a class of 30) but stays well within Firestore limits. It is read as a whole when loading Class Overview.

### `analyses/{analysisId}/usage`

**Purpose:** Cost tracking per AI call. Subcollection with one document per AI invocation in the pipeline.

| Field | Type | Notes |
|-------|------|-------|
| `function` | `"extraction" \| "skillInference" \| "analysis"` | Which pipeline stage |
| `modelUsed` | string | OpenRouter model ID |
| `tokensIn` | number | From OpenRouter response |
| `tokensOut` | number | |
| `cost` | number | USD, from OpenRouter response headers |
| `timestamp` | Timestamp | |

Admin-facing only. Not displayed to teachers in MVP.

### `interventions/{interventionId}`

**Purpose:** Teacher's action decisions on recommended interventions. Separate from the analysis document because intervention status changes frequently and independently.

| Field | Type | Notes |
|-------|------|-------|
| `analysisId` | string | Source analysis |
| `assignmentId` | string | |
| `teacherId` | string | Owner |
| `priority` | number | Rank from analysis |
| `scope` | `"whole_class" \| "small_group" \| "individual"` | |
| `skillTag` | string | |
| `displayName` | string | Human-readable skill name |
| `affectedStudentIds` | string[] | |
| `misconceptionSummary` | string | |
| `effortTiers` | object | `{ quick, lesson, individual }` with label + description |
| `status` | `"pending" \| "planned" \| "in_progress" \| "done" \| "dismissed"` | |
| `selectedEffortTier` | `"quick" \| "lesson" \| "individual"` \| null | Teacher's choice |
| `teacherNote` | string \| null | Free text |
| `plannedDate` | string \| null | ISO date |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

Intervention documents are created when the analysis completes, one per recommendation. The teacher then updates status, selects effort tiers, and adds notes via the Intervention Planner (see `19_Intervention_Planner.md`).

### `config/openrouter`

**Purpose:** Singleton document storing model assignments and cached model list. Lives at `config/openrouter` (not a collection -- single document).

| Field | Type | Notes |
|-------|------|-------|
| `models.extraction.modelId` | string | Default: `google/gemini-2.5-flash` |
| `models.extraction.requiresVision` | boolean | `true` |
| `models.skillInference.modelId` | string | Default: `anthropic/claude-sonnet-4-6` |
| `models.skillInference.requiresVision` | boolean | `false` |
| `models.analysis.modelId` | string | Default: `anthropic/claude-opus-4-6` |
| `models.analysis.requiresVision` | boolean | `false` |
| `cachedModelList` | array | Cached response from OpenRouter `/api/v1/models` |
| `lastFetched` | Timestamp | When model list was last refreshed |

See `20_OpenRouter_Admin.md` for the admin UI that manages this document.

## Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /teachers/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    match /classes/{classId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.teacherId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.teacherId;

      match /students/{studentId} {
        allow read, write: if request.auth != null
          && request.auth.uid == get(/databases/$(database)/documents/classes/$(classId)).data.teacherId;
      }
    }

    match /assignments/{assignmentId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.teacherId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.teacherId;
    }

    match /analyses/{analysisId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.teacherId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.teacherId;

      match /usage/{usageId} {
        allow read: if request.auth != null
          && request.auth.uid == get(/databases/$(database)/documents/analyses/$(analysisId)).data.teacherId;
      }
    }

    match /interventions/{interventionId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.teacherId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.teacherId;
    }

    match /config/openrouter {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

Note: `usage` subcollection is read-only for teachers. Cloud Functions write usage docs using the Admin SDK (bypasses rules).

## Composite Indexes

| Collection | Fields | Purpose |
|------------|--------|---------|
| `classes` | `teacherId` ASC, `createdAt` DESC | Dashboard class dropdown |
| `assignments` | `teacherId` ASC, `createdAt` DESC | Dashboard analysis list |
| `assignments` | `classId` ASC, `createdAt` DESC | Filter analyses by class |
| `interventions` | `analysisId` ASC, `priority` ASC | Intervention Planner ordering |
| `interventions` | `teacherId` ASC, `status` ASC | Filter interventions by status |

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| FERPA / data retention | Gap | Spec mentions end-of-year auto-purge but no implementation details. Would need a scheduled Cloud Function to delete old data. Deferred to post-MVP. |
| Document size for large classes | Assumption | PipelineState on assignment doc stays under 1MB even for 35 students x 20 questions. If future paths (Path C/D with shown work) add substantially more data, may need to move to subcollections. |
| No soft delete | Assumption | Deleting a class or assignment is a hard delete. No trash/recovery mechanism in MVP. |
| Analysis versioning | Assumption | Re-analysis overwrites the existing analysis document. No history of previous analysis runs. The `stale` flag indicates the current analysis may not reflect recent corrections. |
| Student IDs are Firestore auto-IDs | Assumption | Not meaningful identifiers. The fixture data uses readable IDs like `emma_johnson_id` for testing, but production uses Firestore-generated IDs. |  
