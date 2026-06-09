▸ ToolSearch: select:Read  
  ← result received  
▸ Extended thinking (740 chars)  
Let me review the memory files for any relevant project context first.  
▸ Read: C:\Users\steve\.claude\projects\C--Users-steve-AppData-Roaming-agent-mission-control-plugins-prdstack\memory\MEMORY.md  
  ← result received  
▸ Read: C:\Users\steve\.claude\projects\C--Users-steve-AppData-Roaming-agent-mission-control-plugins-prdstack\memory\prdstack-plugin.md  
  ← result received  
▸ Extended thinking (525 chars)  
## Overview

ClassPulse is a classroom analysis tool for K-12 teachers (grades 3-8, classes of 20-35 students). Teachers upload student assignments as photos/scans or CSV files. The system extracts student data, matches it against a class roster, infers skill tags, and produces a comprehensive analysis with confidence-scored insights, misconception detection, and tiered intervention recommendations.

Core philosophy: **AI proposes, teacher decides.** The AI is a structured data extraction engine -- every AI call outputs JSON with defined schemas. The UI controls all presentation. Two explicit human-in-the-loop gates ensure the teacher validates data before analysis runs.

**Target experience:** Under 3 minutes from "New Analysis" to Class Overview. Under 60 seconds to scan the Class Overview screen.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Auth | Firebase Auth (email/password + Google sign-in) |
| Database | Cloud Firestore |
| File Storage | Firebase Storage (uploaded images) |
| Hosting | Firebase Hosting |
| Server Logic | Cloud Functions (Node/TypeScript) |
| AI | OpenRouter API (all AI calls, including vision) |
| Validation | Zod (shared schemas, frontend + backend) |
| Unit Tests | Vitest |
| E2E Tests | Playwright |

## Architecture

```
Browser (React/Vite)
  |
  | Firebase Auth + HTTPS
  v
Cloud Functions (Node/TS)
  |-- Pipeline Functions (extract, inferSkills, analyze)
  |-- Admin Functions (fetchModels, updateModelConfig)
  |
  |--> OpenRouter API (vision + text models)
  |--> Firestore (all persistent data)
  |--> Firebase Storage (uploaded images)
```

Three AI calls in the critical path:
1. **Extraction** -- vision model turns images into structured student data (or CSV parser, no AI)
2. **Skill Inference** -- maps questions to educational skill tags
3. **Analysis** -- produces class patterns, misconceptions, and interventions

Algorithmic stages (no AI): roster matching (fuzzy string matching), grading (answer comparison).

## Two-Pass Pipeline

```
PASS 1: Get Clean Data
  1.1 Ingest (image -> vision AI, or CSV -> parser)
  1.2 Extract (structured student data with confidence scores)
  1.3 Roster Match (fuzzy-match names against known roster)
  1.4 Validation Gate  <-- HUMAN CONFIRMS
  1.5 Grade (Path B only: compare answers to answer key)
  1.6 Skill Inference (AI maps questions -> skill tags)
  1.7 Skill Confirmation  <-- HUMAN CONFIRMS (inline on Class Overview)

PASS 2: Analyze Clean Data
  2.1 Comprehensive Analysis (single AI call -> all insights)
```

## Assignment Paths (MVP)

| Path | Input | AI Extracts | Skill Analysis | Misconception Detection |
|------|-------|------------|----------------|------------------------|
| A-Simple | Photos of scored work (total score only) | Names + total scores | No (no per-question data) | No |
| A-Detailed | Photos of scored work (per-question marks visible) | Names + per-question correctness | Yes | Yes |
| B (Grade For Me) | Photos of objective assignments + answer key | Names + student answers | Yes | Yes |

## File Structure

Files are ordered by build sequence. Implement in this order.

### Foundation (Batch 1)

| File | Description |
|------|-------------|
| `00_README.md` | This file -- project overview, architecture, file index |
| `01_Auth.md` | Firebase Auth setup, email/password + Google sign-in, teacher profile |
| `02_Database_Schema.md` | Firestore collections, security rules, data relationships |
| `03_Cloud_Functions.md` | Cloud Functions structure, OpenRouter client, shared utilities |
| `04_UI_Design_System.md` | Colors, typography, component patterns, responsive behavior |

### Shared Layer (Batch 2)

| File | Description |
|------|-------------|
| `05_Shared_Schemas.md` | Zod schemas shared between frontend and backend, override envelope |
| `06_Dashboard.md` | Main dashboard, analysis list, empty state, navigation shell |
| `07_Class_Roster_Management.md` | Class creation, roster entry, student aliases, editing |
| `08_Assignment_Setup.md` | Setup wizard: class selection, assignment context, path selection, answer key |
| `09_Upload_Flow.md` | Image drag-drop, CSV upload, progress indicators, count validation |

### Pipeline -- Pass 1 (Batch 3)

| File | Description |
|------|-------------|
| `10_Image_Extraction.md` | Vision AI extraction, prompt design, confidence scoring, image preprocessing |
| `11_CSV_Processing.md` | CSV/XLSX parsing, delimiter detection, column mapping, format normalization |
| `12_Roster_Matching.md` | Fuzzy matching algorithm, alias system, match tiers, candidate ranking |
| `13_Review_Confirm.md` | Human validation gate, confidence-colored rows, corrections, absent handling |
| `14_Grading.md` | Path B answer comparison, distractor tracking, answer key error detection |

### Pipeline -- Pass 2 + Screens (Batch 4)

| File | Description |
|------|-------------|
| `15_Skill_Inference.md` | AI skill tagging, primary/secondary skills, learning objective seeding |
| `16_Analysis_Pipeline.md` | Algorithmic stats + AI interpretive content, the merged AnalysisResult |
| `17_Class_Overview.md` | The money screen: at-a-glance, skill breakdown, intervention cards |
| `18_Student_Detail.md` | Per-student drill-down, skill comparison, wrong answer analysis |
| `19_Intervention_Planner.md` | Action planning, effort tier selection, coverage tracking, status management |

### Admin + Testing (Batch 5)

| File | Description |
|------|-------------|
| `20_OpenRouter_Admin.md` | Model-per-function config, server-side model fetching, admin UI |
| `21_Override_Confidence_Model.md` | Override envelope pattern, re-analysis triggers, trust calibration |
| `22_Testing_Fixtures.md` | Mrs. Patterson's class fixture, saved LLM responses, test pyramid |
| `23_Future_Features.md` | Deferred items: Path C/D, historical trends, export, auto-fallback |

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| AI outputs structured JSON only, never prose | UI controls presentation; prevents hallucinated narratives |
| Stats computed algorithmically, AI generates interpretive content only | Prevents AI from doing basic math wrong |
| Two explicit human gates in the pipeline | Builds trust; teacher corrects before bad data propagates |
| Model-per-function via OpenRouter | Different tasks need different model strengths; cost optimization |
| Zod schemas shared frontend/backend | Single source of truth for validation; catches malformed AI responses at runtime |
| Corrections saved as aliases | System learns from teacher overrides; matching improves over time |
| Small class rule (N<10): counts not percentages | "60% struggling" is misleading when N=5 |
| Hard cap of 3 default interventions | Prevents intervention fatigue; teacher sees only highest-impact actions |

## Key Gaps

These gaps are flagged across individual files. Address during implementation or flag for product decision.

| Gap | Severity | Notes |
|-----|----------|-------|
| No admin role definition | Medium | Spec says "admin" can write OpenRouter config but doesn't define how admin status is assigned. See `01_Auth.md`. |
| Image preprocessing details | Low | Spec mentions "auto-contrast enhancement" but no library or approach specified. See `10_Image_Extraction.md`. |
| Data retention / FERPA compliance | High | Spec mentions end-of-year auto-purge and FERPA but no implementation details. See `02_Database_Schema.md`. |
| Cost tracking UI | Low | Usage logged to Firestore but admin cost dashboard is underspecified. See `20_OpenRouter_Admin.md`. |
| PDF export | Low | "Download PDF" button mentioned for Class Overview but no spec on format/content. See `23_Future_Features.md`. |
| Offline / slow connection handling | Medium | No mention of optimistic updates or offline support. |
| Rate limiting for AI calls | Medium | No mention of per-teacher rate limits or cost caps. |

## Environment Setup

**Prerequisites:** Node.js 22+, Firebase CLI, OpenRouter API key.

**External services:**
- Firebase project on Blaze plan (required for Cloud Functions)
- OpenRouter account with API key (stored as Cloud Functions environment config, never exposed to client)

**Dev environment:** Firebase emulator suite for local development. AI calls mocked via saved fixture responses during testing (see `22_Testing_Fixtures.md`).

## Implementation Notes

- The `functions/src/shared/` directory contains code shared across all Cloud Functions: OpenRouter client, Zod schemas, prompt templates
- Zod schemas in `shared/schemas.ts` are imported by both the frontend (for response parsing) and Cloud Functions (for runtime validation)
- All AI prompts live in `shared/prompts.ts` as template functions, not inline strings
- Firebase Storage security rules scope uploads to `uploads/{teacherId}/{assignmentId}/` -- teacher can only access their own images
- Processing continues server-side if the browser closes; results wait on Dashboard when teacher returns  
