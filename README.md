<div align="center">

# ClassPulse

**AI-powered classroom analysis for K-12 teachers**

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-12-ffca28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](https://vite.dev)

Upload student papers or a CSV, get instant class-level analysis with skill breakdowns, misconception detection, and actionable intervention plans.

</div>

---

## Overview

ClassPulse helps K-12 teachers turn a stack of graded papers into a complete classroom analysis in under 2 minutes. Teachers upload photos of student work or a CSV export from their gradebook, and the AI pipeline extracts scores, matches students to the class roster, infers skill tags, and generates a full analysis with targeted intervention recommendations.

**Key principle: "AI proposes, teacher decides."** Every AI output includes confidence scores and passes through a human review gate before becoming final.

## Features

<table>
<tr>
<td width="50%">

### Two-Pass AI Pipeline
Upload images or CSV data. Pass 1 extracts and validates. Pass 2 analyzes with skill inference and misconception detection.

</td>
<td width="50%">

### Skill Breakdown
AI-inferred skill tags map each question to educational topics. Teachers can edit tags inline with the override envelope pattern.

</td>
</tr>
<tr>
<td width="50%">

### Intervention Planner
Up to 3 prioritized interventions with three effort tiers each (quick 5-min, lesson 30-min, individual 1-on-1).

</td>
<td width="50%">

### Score Distribution
Algorithmic stats (mean, median, std dev, outliers) with distribution shape detection (normal, bimodal, ceiling, floor).

</td>
</tr>
<tr>
<td width="50%">

### Roster Matching
Four-tier matching: exact, alias, fuzzy (Levenshtein), unmatched. Teachers can save corrections as aliases for next time.

</td>
<td width="50%">

### Model Admin
Configurable AI models per pipeline stage via OpenRouter. Swap extraction, skill inference, or analysis models from the admin UI.

</td>
</tr>
</table>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| Backend | Firebase Cloud Functions (Node 22, 2nd gen) |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| Auth | Firebase Auth (Email/Password + Google Sign-In) |
| AI | OpenRouter API (Gemini Flash, Claude Sonnet, Claude Opus) |
| Validation | Zod 4 (shared frontend/backend schemas) |
| Charts | Recharts 3 |

## Architecture

```
ClassPulse/
  src/
    components/        # Shared UI (ClassForm, RosterTable, Toast, Layout)
    contexts/          # AuthContext (auth state + teacher profile)
    lib/               # Firebase client init, Zod schemas
    pages/             # Route pages (Dashboard, Setup, Upload, Review, etc.)
  functions/
    src/
      index.ts         # All Cloud Function exports
      pipeline/        # computeStats, rosterMatch, grade, extract, analyze
      shared/          # OpenRouter client, prompt templates
  firestore.rules      # Security rules (teacher-scoped)
  storage.rules        # Upload rules (10MB images, teacher-scoped)
  firestore.indexes.json
  firebase.json
```

### Pipeline Flow

```
Upload (images/CSV)
  -> Extraction (Vision AI or client-side CSV parse)
  -> Roster Matching (algorithmic, 4 tiers)
  -> Review & Confirm (human gate #1)
  -> Grading (Path B: compare against answer key)
  -> Skill Inference (AI maps questions to skill tags)
  -> Stats Engine (pure functions: mean, median, outliers, mastery)
  -> Analysis (AI generates interpretive content from computed stats)
  -> Class Overview + Student Detail + Intervention Planner
```

## Getting Started

### Prerequisites

- Node.js 22+
- Firebase CLI (`npm i -g firebase-tools`)
- An OpenRouter API key

### Install

```bash
git clone <repo-url>
cd ClassPulse
npm install
cd functions && npm install && cd ..
```

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your Firebase config:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Set the OpenRouter secret for Cloud Functions:

```bash
firebase functions:secrets:set OPENROUTER_API_KEY
```

### Development

```bash
npm run dev
```

### Build & Deploy

```bash
npm run build
firebase deploy
```

## Assignment Paths

| Path | Input | Extraction | Grading | Skill Inference |
|------|-------|-----------|---------|-----------------|
| A-Simple | Total scores only | Score per student | N/A | Skipped |
| A-Detailed | Per-question marks visible | Score + correctness per question | N/A | AI infers skills |
| B-Objective | Ungraded student answers + answer key | Raw answers extracted | Algorithmic (vs key) | AI infers skills |

## Default AI Models

| Stage | Model | Purpose |
|-------|-------|---------|
| Extraction | `google/gemini-2.5-flash` | Vision model for reading student papers |
| Skill Inference | `anthropic/claude-sonnet-4-6` | Maps questions to educational skill tags |
| Analysis | `anthropic/claude-opus-4-6` | Generates interpretive content from computed stats |

All models are configurable via the Admin > Models page.

## Security

- All Firestore collections are scoped to `teacherId == auth.uid`
- Storage rules restrict uploads to `uploads/{teacherId}/{assignmentId}/`
- Cloud Functions verify auth and ownership on every call
- OpenRouter API key stored as a Cloud Functions secret, never exposed to client
- Admin functions require `isAdmin: true` on the teacher profile
</div>
