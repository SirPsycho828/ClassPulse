# ClassPulse: Product Design Specification

**Date:** 2026-06-09
**Status:** Draft
**Author:** Steve Petusky

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Target User](#2-target-user)
3. [Key Differentiators](#3-key-differentiators)
4. [Staged Pipeline Architecture](#4-staged-pipeline-architecture)
5. [JSON Schemas](#5-json-schemas)
6. [Upload Flow](#6-upload-flow)
7. [Screens & Teacher Journey](#7-screens--teacher-journey)
8. [Edge Cases](#8-edge-cases)
9. [Testing Strategy](#9-testing-strategy)
10. [Tech Stack](#10-tech-stack)
11. [OpenRouter Admin Controls](#11-openrouter-admin-controls)

---

## 1. Product Vision

ClassPulse is a classroom analysis tool for K-12 teachers. Teachers upload student assignments (photos/scans or CSV), and the system analyzes class performance, identifies skill gaps, detects specific misconceptions, and recommends tiered interventions.

The AI is a **data extraction engine, not a text generator**. Every AI call outputs structured JSON with defined schemas. The UI controls presentation: tables, charts, bullet points, whatever serves the teacher best. The AI never talks directly to the teacher; it feeds structured data to the interface.

**Core philosophy: AI proposes, teacher decides.** At every stage, the teacher can correct, exclude, or annotate. Confidence scores are visible. Low-confidence items are flagged for review. The system builds trust by being transparent about what it knows and what it's guessing.

**60-second scan target.** A time-starved teacher with 30 kids should be able to upload an assignment, confirm the extracted data, and scan the results in under 60 seconds on the Class Overview screen.

---

## 2. Target User

- **Who:** K-12 teachers, primarily elementary and middle school (grades 3-8)
- **Class size:** 20-35 students
- **Context:** Time-starved, not data analysts, already know their students
- **Need:** A tool that quickly confirms or challenges what they already suspect, and tells them what to do about it
- **Not:** A gradebook replacement, an LMS, or a student-facing tool

---

## 3. Key Differentiators

| Differentiator | What It Means |
|----------------|---------------|
| **AI as extraction engine** | Structured JSON output, not prose. The UI controls the narrative. |
| **Human-in-the-loop at every stage** | Two explicit confirmation gates (data validation, skill tags). Teacher overrides are first-class. |
| **Confidence-scored everything** | Every AI output carries a confidence score. Teacher sees what's certain and what's a guess. |
| **Misconception identification** | Not just "wrong" but "added numerators and denominators separately instead of finding common denominators." |
| **Connected navigation** | Red skill -> affected students -> recommended intervention. One flow, not separate tabs. |
| **Tiered interventions** | Scope (whole-class / small-group / individual) x effort (5-min warm-up / dedicated lesson / 1-on-1 check-in). Teacher picks what's realistic. |
| **Graceful degradation** | Less input data = fewer analysis layers, never an error. A CSV with just total scores still gives a useful class summary. |
| **Roster-anchored name matching** | AI matches against 25-35 known names, not infinite possibilities. Learns aliases over time. |
| **Model-per-function** | Different AI models for extraction, skill inference, and analysis. Configurable via admin. |

---

## 4. Staged Pipeline Architecture

### Two-Pass Pipeline

```
PASS 1: "Get Clean Data"
  1.1  Ingest        (image -> vision AI, or CSV -> parser)
  1.2  Extract       (structured student data with confidence scores)
  1.3  Roster Match  (fuzzy-match names against known roster)
  1.4  Validation Gate    <- HUMAN confirms names/scores
  1.5  Grade         (Path B only: compare answers to answer key)
  1.6  Skill Inference    (AI maps questions -> skill tags)
  1.7  Skill Confirmation <- HUMAN confirms/edits skill tags (inline on Class Overview)

PASS 2: "Analyze Clean Data"
  2.1  Comprehensive Analysis (single AI call -> class patterns, student
       insights, misconceptions, tiered interventions)
```

**AI calls in the critical path:** 3 total.
- Extraction (1.1/1.2): vision model for images, no AI for CSV
- Skill inference (1.6): maps questions to educational skill tags
- Analysis (2.1): the big call producing all insights and interventions

**Algorithmic stages (no AI):**
- Roster matching (1.3): fuzzy string matching, Levenshtein distance, alias lookup
- Grading (1.5): direct answer comparison against key

**Human gates:** 2 explicit.
- Validation gate (1.4): teacher confirms extracted names/scores
- Skill confirmation (1.7): teacher reviews skill tags inline on Class Overview, re-analyzes if corrections needed

### MVP Scope: Two Assignment Paths

- **Path A (Already Scored):** Teacher already graded the work. AI extracts names + scores. Two sub-modes depending on what's visible:
  - **Path A-Simple:** Only a total score is visible on the page (e.g., "8/10" written at the top). Extraction returns `total_score` only, `answers` is empty. Analysis limited to class-level score distribution. No skill breakdown or misconception detection.
  - **Path A-Detailed:** Individual question marks are visible (checkmarks, X's, circled answers). Extraction returns per-question data in the `answers` array, same as Path B. Full skill breakdown and analysis available. The difference from Path B is that the teacher already determined correctness; the AI just reads the marks.
  - The extraction prompt adapts based on what's visible on the page. The pipeline detects which sub-mode applies based on whether `answers` is populated.
- **Path B (Grade For Me):** Objective assignments (multiple choice, fill-in-the-blank). AI extracts student answers AND the system grades them against a teacher-provided answer key. Full misconception analysis available.

Future paths (not MVP): Path C (math/STEM with shown work), Path D (written responses with rubric evaluation).

### Skill Inference Design

- AI infers skill tags from the **questions themselves**, not per-student
- Once established for an assignment, tags apply to all students
- Teacher-provided learning objectives (optional) seed the inference and improve accuracy
- Confidence levels on each tag; teacher confirms or edits
- Tags are at the **topic level** (e.g., "reducing fractions"), not domain level ("math") or micro-skill level ("reducing-improper-fractions-with-unlike-denominators")
- Questions can have a primary skill and optional secondary skills
- Skill inference requires per-question data. Path A with just total scores skips this stage.

### Intervention Generation Design

**Three scopes:**
- **Whole-class:** when >50% of students struggle with the same skill
- **Small-group (3-6 students):** when a cluster shares the same error pattern
- **Individual flag:** when one student has a unique issue

**Three effort tiers per intervention:**
- **5-minute warm-up:** quick activity the teacher can do at the start of class
- **Dedicated lesson:** a focused reteach session
- **1-on-1 check-in:** brief conversation with the specific student

**Hard cap:** 3 interventions shown by default on the Class Overview. More available under "See all recommendations." Ranked by impact.

**Misconception-driven specificity:** Interventions reference the actual error pattern, not generic advice. "Students added numerators and denominators separately" drives "use fraction strips to visualize" not "provide additional practice."

---

## 5. JSON Schemas

### 5.1 Setup Schemas

#### ClassRoster

```json
{
  "class_id": "string",
  "class_name": "5th Grade Math - Period 2",
  "grade_level": "5",
  "subject": "Math",
  "students": [
    {
      "student_id": "string",
      "first_name": "Emma",
      "last_name": "Johnson",
      "display_name": "Emma J.",
      "known_aliases": ["Emmy"]
    }
  ]
}
```

`display_name` gives the AI a compact matching label. `known_aliases` is initially empty; populated as the teacher corrects name matches over time.

#### Assignment

```json
{
  "assignment_id": "string",
  "class_id": "string",
  "title": "Chapter 4 Quiz - Fractions",
  "type": "scored | objective",
  "date": "2026-06-09",
  "total_points": 20,
  "question_count": 10,
  "learning_objectives": "fraction addition, reducing fractions, mixed numbers",
  "answer_key": null
}
```

`answer_key` is null for Path A. For Path B, populated before extraction runs. `learning_objectives` is optional free text that seeds skill inference.

#### AnswerKey (Path B)

```json
{
  "source": "manual | image",
  "questions": [
    {
      "question_number": 1,
      "question_text": "What is 3/4 + 1/2?",
      "correct_answer": "C",
      "answer_choices": ["5/6", "4/6", "5/4", "1/1"],
      "points": 2,
      "extra_credit": false
    }
  ]
}
```

`question_text` and `answer_choices` are critical for skill inference and misconception detection. For image-sourced keys, the vision AI extracts these. For manual entry, `question_text` is optional but recommended. `answer_choices` enable distractor analysis (understanding why a wrong answer was chosen).

### 5.2 Pass 1 Schemas

#### ExtractionResult (output of Stages 1.1/1.2)

```json
{
  "extraction_id": "string",
  "assignment_id": "string",
  "source_type": "image | csv",
  "extracted_students": [
    {
      "extraction_index": 0,
      "source_image_index": 0,
      "raw_name": "Emma J.",
      "name_confidence": 0.95,
      "answers": [
        {
          "question_number": 1,
          "extracted_answer": "C",
          "confidence": 0.92,
          "multiple_answers_detected": false
        }
      ],
      "total_score": {
        "raw": "8/10",
        "normalized": 0.8,
        "confidence": 0.90
      },
      "flags": []
    }
  ],
  "metadata": {
    "total_extracted": 27,
    "images_processed": 10,
    "partial_papers_detected": false,
    "processing_time_ms": 3200
  }
}
```

For Path A-Simple: `answers` is empty, `total_score` is populated. For Path A-Detailed and Path B: `answers` is populated (A-Detailed includes `is_correct` from teacher markings; Path B includes only the extracted answer, correctness determined later during grading). `total_score` is populated for Path A, computed after grading for Path B. `flags` is an array of string codes: `"multiple_answers_q3"`, `"low_confidence_name"`, `"low_confidence_score"`, `"marking_conflict"`.

#### RosterMatchResult (output of Stage 1.3)

```json
{
  "matches": [
    {
      "extraction_index": 0,
      "raw_name": "Emma J.",
      "match_tier": "exact | alias | fuzzy | unmatched",
      "top_candidate": {
        "student_id": "string",
        "roster_name": "Emma Johnson",
        "confidence": 0.97
      },
      "other_candidates": [
        {
          "student_id": "string",
          "roster_name": "Emily Johnston",
          "confidence": 0.62
        }
      ],
      "status": "confirmed | needs_review | unmatched"
    }
  ],
  "unmatched_roster_students": ["lily_zhang_id"],
  "summary": {
    "confirmed": 22,
    "needs_review": 4,
    "unmatched": 1,
    "absent_from_submissions": 1
  }
}
```

Matching tiers:
1. Exact match against roster names -> high confidence, auto-confirmed
2. Exact match against alias map -> high confidence, auto-confirmed
3. Fuzzy match (Levenshtein + phonetic) -> medium confidence, needs review
4. No reasonable match -> low confidence, unmatched

#### ValidatedResult (output of Stage 1.4, after human confirmation)

```json
{
  "validation_id": "string",
  "assignment_id": "string",
  "validated_students": [
    {
      "student_id": "string",
      "roster_name": "Emma Johnson",
      "answers": [
        { "question_number": 1, "answer": "C" }
      ],
      "total_score": { "earned": 8, "possible": 10, "normalized": 0.8 },
      "status": "auto_confirmed | teacher_confirmed | teacher_corrected | manual_entry",
      "corrections": [
        {
          "field": "name",
          "original_value": "Ema J.",
          "corrected_value": "Emma Johnson",
          "saved_as_alias": true
        }
      ]
    }
  ],
  "absent_students": ["lily_zhang_id"],
  "excluded_students": []
}
```

`corrections` tracks every teacher change. When `saved_as_alias` is true, the correction is added to the student's `known_aliases` for future matching improvement.

#### GradedResult (output of Stage 1.5, Path B only)

```json
{
  "assignment_id": "string",
  "graded_students": [
    {
      "student_id": "string",
      "per_question": [
        {
          "question_number": 1,
          "student_answer": "C",
          "correct_answer": "C",
          "is_correct": true,
          "points_earned": 2,
          "points_possible": 2
        },
        {
          "question_number": 4,
          "student_answer": "B",
          "correct_answer": "D",
          "is_correct": false,
          "points_earned": 0,
          "points_possible": 2,
          "distractor_index": 1
        }
      ],
      "total": {
        "earned": 14,
        "possible": 20,
        "normalized": 0.7
      }
    }
  ],
  "answer_key_flags": [
    {
      "question_number": 7,
      "flag": "high_miss_rate",
      "miss_rate": 0.85,
      "most_common_answer": "B",
      "message": "85% of students answered B on Q7, but the key says C. Verify your answer key."
    }
  ]
}
```

`distractor_index` identifies which wrong answer the student chose (enables distractor analysis for misconception detection). `answer_key_flags` catches potential answer key errors when an unusual number of students all pick the same "wrong" answer.

#### SkillInferenceResult (output of Stage 1.6)

```json
{
  "assignment_id": "string",
  "skill_mapping": [
    {
      "question_number": 1,
      "primary_skill": {
        "value": "fraction_addition",
        "display_name": "Fraction Addition",
        "confidence": 0.91,
        "evidence": "Q1 asks 'What is 3/4 + 1/2?' which directly tests fraction addition with unlike denominators",
        "status": "pending | confirmed | corrected | excluded"
      },
      "secondary_skills": [
        {
          "value": "common_denominators",
          "display_name": "Common Denominators",
          "confidence": 0.65,
          "status": "pending"
        }
      ]
    }
  ],
  "unique_skills_summary": [
    { "tag": "fraction_addition", "question_count": 3, "questions": [1, 2, 3] },
    { "tag": "reducing_fractions", "question_count": 3, "questions": [4, 5, 6] },
    { "tag": "mixed_numbers", "question_count": 4, "questions": [7, 8, 9, 10] }
  ],
  "learning_objectives_used": true
}
```

### 5.3 Pass 2 Schema

#### AnalysisResult (output of Stage 2.1)

This is the single, comprehensive output combining algorithmically computed statistics with AI-generated interpretive content. It contains everything needed to render the Class Overview, Student Detail, and Intervention Planner screens.

**Critical design decision: stats are computed, not generated.** The `class_summary` statistics (mean, median, stdDev, distribution shape, outliers), `skill_breakdown` mastery percentages, and `student_insights` scores/percentiles are all computed algorithmically by the pure functions (`calculateClassStats`, `detectDistributionShape`, `detectOutliers`, `calculateSkillMastery`). These computed stats are then passed as INPUT to the Pass 2 AI call. The AI produces only the interpretive content: `one_sentence` summary, `misconception` text, `wrong_answer_analysis` explanations, and `effort_tiers` intervention descriptions. This prevents the AI from doing basic math wrong while leveraging it for the hard parts (misconception identification, contextual intervention generation). The final AnalysisResult merges both sources.

```json
{
  "analysis_id": "string",
  "assignment_id": "string",
  "class_id": "string",
  "generated_at": "2026-06-09T14:30:00Z",
  "model_used": "anthropic/claude-opus-4-6",
  "stale": false,
  "teacher_overrides_applied": 0,

  "class_summary": {
    "one_sentence": "Most students demonstrated fraction addition, but reducing fractions was a common gap. 6 students need targeted support.",
    "students_analyzed": 9,
    "students_absent": 1,
    "mean_score": 0.72,
    "median_score": 0.70,
    "std_dev": 0.24,
    "min_score": 0.10,
    "max_score": 1.0,
    "distribution_shape": "normal",
    "outliers": [
      {
        "student_id": "david_okafor_id",
        "score": 0.10,
        "direction": "below",
        "excluded_from_class_stats": false
      }
    ]
  },

  "skill_breakdown": [
    {
      "skill_tag": "fraction_addition",
      "display_name": "Fraction Addition",
      "question_numbers": [1, 2, 3],
      "question_count": 3,
      "class_mastery": 0.74,
      "mastery_level": "yellow",
      "students_struggling_count": 4,
      "students_proficient_count": 5,
      "common_wrong_answers": [
        {
          "answer_value": "A",
          "frequency": 3,
          "frequency_percent": 0.33,
          "misconception": "Added numerators and denominators separately instead of finding common denominators"
        }
      ]
    },
    {
      "skill_tag": "reducing_fractions",
      "display_name": "Reducing Fractions",
      "question_numbers": [4, 5, 6],
      "question_count": 3,
      "class_mastery": 0.46,
      "mastery_level": "red",
      "students_struggling_count": 6,
      "students_proficient_count": 3,
      "common_wrong_answers": [
        {
          "answer_value": "B",
          "frequency": 4,
          "frequency_percent": 0.44,
          "misconception": "Subtracted from numerator and denominator instead of dividing by GCF"
        }
      ]
    },
    {
      "skill_tag": "mixed_numbers",
      "display_name": "Mixed Numbers",
      "question_numbers": [7, 8, 9, 10],
      "question_count": 4,
      "class_mastery": 0.69,
      "mastery_level": "yellow",
      "students_struggling_count": 4,
      "students_proficient_count": 5,
      "common_wrong_answers": []
    }
  ],

  "student_insights": [
    {
      "student_id": "string",
      "student_name": "Marcus Rivera",
      "total_score": 0.70,
      "relative_to_class": "below_average",
      "percentile": 44,
      "skill_performance": [
        {
          "skill_tag": "fraction_addition",
          "mastery": 1.0,
          "class_average": 0.74,
          "gap": 0.26
        },
        {
          "skill_tag": "reducing_fractions",
          "mastery": 0.0,
          "class_average": 0.46,
          "gap": -0.46
        },
        {
          "skill_tag": "mixed_numbers",
          "mastery": 0.75,
          "class_average": 0.69,
          "gap": 0.06
        }
      ],
      "gap_areas": ["reducing_fractions"],
      "wrong_answer_analysis": [
        {
          "question_number": 4,
          "student_answer": "B",
          "correct_answer": "D",
          "question_text": "Reduce 6/8",
          "misconception": "Subtracted 2 from both numerator and denominator (6-2=4, 8-2=6) instead of dividing by GCF of 2. Understands the goal of reduction but applied subtraction instead of division."
        }
      ]
    }
  ],

  "interventions": [
    {
      "intervention_id": "string",
      "priority": 1,
      "scope": "small_group",
      "skill_tag": "reducing_fractions",
      "display_name": "Reducing Fractions",
      "affected_student_ids": ["marcus_id", "maria_t_id", "aisha_id", "jake_id", "david_id"],
      "affected_count": 5,
      "misconception_summary": "Students attempted to reduce fractions by subtracting from numerator and denominator rather than dividing by the greatest common factor. They understand the goal of making fractions smaller but reach for the wrong operation.",
      "effort_tiers": {
        "quick": {
          "label": "5-min warm-up",
          "description": "Start class with 3 fraction reduction problems on the board. For each, ask: 'What number divides into BOTH the top and bottom?' Use visual fraction strips to show that 6/8 and 3/4 cover the same length."
        },
        "lesson": {
          "label": "Dedicated lesson",
          "description": "Paper-folding activity: students fold strips into equal parts to physically see equivalence. Then practice identifying GCF as 'the folding number.' Focus on the distinction between 'making smaller by subtracting' vs. 'making equivalent by dividing.'"
        },
        "individual": {
          "label": "1-on-1 check-in",
          "description": "Ask the student to talk through their steps on Q4 (Reduce 6/8). Listen for whether they say 'subtract' or 'divide.' If subtract: this is a procedural error, correctable in 2 minutes with one example. If they can't articulate a strategy: needs the full lesson."
        }
      },
      "status": "pending",
      "teacher_note": null,
      "planned_date": null,
      "selected_effort_tier": null
    }
  ]
}
```

### 5.4 Override Envelope

Every AI-generated value that the teacher can correct uses this pattern:

```json
{
  "value": "fractions",
  "confidence": 0.82,
  "evidence": "Q3 asks 'What is 3/4 + 1/2?' which tests fraction addition",
  "status": "pending | confirmed | corrected | excluded",
  "teacher_override": null,
  "teacher_note": null
}
```

- **pending**: AI proposed, teacher hasn't reviewed yet
- **confirmed**: teacher agrees with AI
- **corrected**: teacher changed the value (`value` preserves original, `teacher_override` holds new value)
- **excluded**: teacher says "ignore this data point entirely"

---

## 6. Upload Flow

### 6.1 Image Path

1. Teacher drags/drops photos of student papers (or clicks to browse)
2. Thumbnail strip appears as images upload, with progress indicators
3. Count indicator: "12 images uploaded | ~28 students expected (based on roster)"
4. Guidance text: "For best results: good lighting, flat paper, 2-4 student papers per photo"
5. Teacher clicks "Start Extraction"
6. Vision AI processes all images, returns ExtractionResult
7. System runs roster matching against ExtractionResult
8. Teacher lands on Review & Confirm screen

**For Path B (answer key from image):** If the teacher uploaded an answer key photo in Setup, the vision AI extracts it first and presents the extracted answers for confirmation before student extraction runs. This is a blocking sub-step because grading against a wrong key is catastrophic.

### 6.2 CSV Path

1. Teacher drags/drops CSV or XLSX file
2. System detects delimiter (comma, tab, semicolon) and encoding
3. Preview table shows first 5 rows
4. Column mapping step: auto-detected mappings with dropdowns to override
5. Format detection: if mixed formats found ("8/10" and "80%" in one column), show interpretation preview
6. Row count check against roster size, flag discrepancies
7. Teacher clicks "Process"
8. System parses, normalizes, runs roster matching
9. Teacher lands on Review & Confirm screen (lighter version)

---

## 7. Screens & Teacher Journey

### 7.1 Journey Flow

```
Dashboard
  +-> [New Analysis]
      +-> Setup (assignment context + class + upload mode)
          +-> Upload (images or CSV)
              +-> Review & Confirm (validate extracted data)
                  +-> [Processing ~10-20 sec]
                      +-> Class Overview Dashboard <-- THE MONEY SCREEN
                          |-> Student Detail (click any student)
                          |-> Intervention Planner (click "Plan Actions")
                          +-> Skill Drill-Down (click any skill row)
```

**Time target:** Under 3 minutes from "New Analysis" to Class Overview. Most time is the teacher scanning Review & Confirm. AI processing is 10-20 seconds.

### 7.2 "Every Screen Answers One Question"

| Screen | Question It Answers |
|--------|-------------------|
| Dashboard | What have I done and what needs attention? |
| Setup | What am I about to analyze? |
| Upload | Here's my data. |
| Review & Confirm | Is this data correct before I analyze it? |
| Class Overview | How is my class doing? |
| Student Detail | What's going on with this specific student? |
| Intervention Planner | What am I actually going to do about this? |

### 7.3 Screen Details

#### Screen 1: Dashboard

- **Primary action:** oversized "New Analysis" button, top of page
- **Analysis list:** reverse-chronological cards
  - Assignment title, class name, date
  - Status: `Complete` / `Needs Review` / `Processing`
  - One-line summary: "Class avg 78% | 2 interventions pending"
- **Quick filters:** by class, by date range
- **Empty state** (first visit): "Upload your first assignment to see how your class is doing." Single CTA.
- Clicking a completed analysis -> Class Overview. Clicking "Needs Review" -> resumes where teacher left off.

#### Screen 2: Setup

Short wizard, 2-3 steps:

**Step 2a: Class Selection**
- Dropdown of existing classes, or "Create New Class"
- New class: name, grade level, subject, roster (paste names one per line, or CSV of names)
- Returning teacher just picks from dropdown. 5 seconds.

**Step 2b: Assignment Context**
- Title (free text)
- Type toggle: "Already Scored" (Path A) or "Grade For Me" (Path B)
- Optional learning objectives (free text, prompted: "What skills does this assignment cover?")
- If Path B: answer key entry
  - Toggle: "Upload answer key image" or "Type answers"
  - Image path: single photo upload -> extraction preview -> teacher confirms
  - Manual path: numbered list input (Q1: A, Q2: C, ...)
  - Optional: question text per question
- Upload mode toggle: "Scan / Photo" or "CSV" (could merge with Upload screen)

#### Screen 3: Upload

**Image mode:**
- Drag-and-drop zone
- Thumbnail strip with upload progress
- Count indicator vs. expected roster size
- Guidance text for photo quality
- "Start Extraction" button

**CSV mode:**
- Drag-and-drop for file
- Preview table (first 5 rows)
- Column mapping with auto-detection and dropdowns
- Format detection callout for mixed formats
- Row count check against roster

#### Screen 4: Review & Confirm

The human-in-the-loop gate. Exists for BOTH image and CSV paths.

**Image path (full review):**

Table with one row per extracted student:

| Status | Student Name | Matched To | Q1 | Q2 | ... | Total |
|--------|-------------|------------|----|----|-----|-------|
| Green | Emma J. | Emma Johnson | A | C | ... | 8/10 |
| Yellow | Maria ? | [dropdown] | A | ? | ... | 7/10 |
| Red | [unreadable] | [dropdown] | - | - | ... | - |

- **Green:** high confidence, auto-confirmed. Teacher can still click to override.
- **Yellow:** low-confidence field highlighted. Dropdown shows roster candidates ranked by similarity. Cropped image region shown alongside extracted value.
- **Red:** extraction failed. Manual entry or re-upload.
- **Bottom section:** unmatched roster students: "These students have no data: [names]. Mark as absent?"
- **Top metric:** "24 of 28 confirmed | 3 need review | 1 failed"
- **Target:** under 60 seconds for teacher to scan and resolve.

**CSV path (lighter review):**

Same table structure, mostly green. Review focuses on:
- Roster matching for imperfect name matches
- Empty cells flagged: "Absent or zero?"
- Format normalization previews

**Both paths:** "Confirm & Analyze" button. Disabled until all yellows/reds are resolved or explicitly marked absent/excluded.

#### Screen 5: Class Overview Dashboard (The Money Screen)

Three horizontal bands forming the information hierarchy.

**Band 1: At-a-Glance (top ~20%)**
- Class average as a large number with descriptor ("78% - Approaching Mastery")
- Score distribution as histogram/dot plot (distribution shape matters)
- One-sentence AI summary
- Student count: "26 of 28 students analyzed (2 absent)"
- Small classes (<10): counts only, no percentages

**Band 2: Skill Breakdown (middle ~40%)**

Table, one row per skill, color-coded:

| Skill | Class Mastery | Students Struggling |
|-------|--------------|-------------------|
| Fraction addition | Green 85% (22/26) | 4 students |
| Reducing fractions | Red 46% (12/26) | 14 students |
| Mixed numbers | Yellow 69% (18/26) | 8 students |

- Subtle edit icon on each skill tag (for inline correction, triggers re-analysis)
- Question count shown per skill: "Reducing fractions (3 questions)"
- Clicking a skill row expands to show affected students and related misconception
- Thresholds: green >80%, yellow 60-80%, red <60%

**Band 3: Intervention Cards (bottom ~40%)**

Max 3 cards shown by default. Each card shows:
- Scope badge (Whole Class / Small Group / Individual)
- Skill name
- Misconception summary (the specific error, not "they got it wrong")
- Effort-tiered suggestions (5-min and lesson options)
- Action buttons: "View Students", "Plan This", "Dismiss"
- "2 more recommendations ->" link if more exist

**Connected navigation:**
- Click red skill -> inline expansion shows students, intervention card highlights
- Click student name anywhere -> Student Detail
- Click "View Students" on intervention -> filtered student list
- Click "Plan This" -> adds to Intervention Planner

**Skill tag editing (inline):**
- Skill tags from AI inference shown with subtle edit icons
- Teacher clicks edit, changes tag, sees "Results may have changed. Re-analyze?"
- Re-analysis is manual (teacher may want to make multiple corrections first)

#### Screen 6: Student Detail

**Header:** student name, overall score, percentile ("Marcus Rivera | 14/20 (70%) | Below class average of 78%")

**Per-skill breakdown with class comparison:**

| Skill | Student | Class Avg | Gap |
|-------|---------|-----------|-----|
| Fraction addition | Green 100% | 85% | +15% |
| Reducing fractions | Red 0% | 46% | -46% |
| Mixed numbers | Yellow 67% | 69% | -2% |

**Wrong answer detail (misconception layer):**

| Question | Student Answer | Correct | What Happened |
|----------|---------------|---------|---------------|
| Q4: Reduce 6/8 | 6/8 (no change) | 3/4 | Did not attempt to reduce. May not recognize that reduction is required. |
| Q5: Reduce 4/10 | 2/8 | 2/5 | Subtracted 2 from both instead of dividing. Understands the goal but wrong operation. |

**Individual recommendation** (if flagged): specific, actionable, referencing the misconception.

**Navigation:** back to Class Overview, prev/next student arrows.

#### Screen 7: Intervention Planner

The only screen framed as **action, not information**.

**Intervention list as actionable cards:**
- Status: `Planned` / `In Progress` / `Done` / `Dismissed`
- Scope + skill
- Students covered (name chips, clickable)
- Effort tier selector (teacher picks which tier they'll do)
- Teacher notes field (free text)
- Date field (optional "Plan for" date)

**Coverage indicator at top:** "12 of 26 students are covered by planned interventions. 14 have no flagged issues."

**Student coverage matrix (collapsible):**

| Student | Fractions | Decimals | Individual Flag |
|---------|-----------|----------|-----------------|
| Marcus R. | check (Small Group) | -- | check |
| Sofia L. | check (Small Group) | check (Small Group) | -- |

Shows overlap (student in multiple groups) and gaps.

**Dismissed interventions:** collapsed at bottom, expandable.

**What this screen is NOT:** not a lesson planner, not a resource library (future work). It's a decision capture tool: see recommendation, decide what to do, record the decision.

#### Intervention cards on Class Overview vs. Intervention Planner

The intervention cards on Class Overview are **preview-only**: they show the what but have no status toggles, date fields, or notes. The Intervention Planner is where the teacher commits to action. A prominent "Open Intervention Planner ->" button links from Class Overview to the Planner.

#### Screens NOT in MVP

| Screen | Why Deferred |
|--------|-------------|
| Historical Trends | Requires multiple analyses over time. Dashboard list gives basic history. |
| Detailed Settings | Minimal settings for MVP (account, confidence threshold). Gear icon, not primary nav. |
| Export/Report | "Download PDF" button on Class Overview covers it. Not a separate screen. |
| Class/Roster Management | Handled inline: create in Setup, edit via settings icon on Class Overview. |

---

## 8. Edge Cases

### 8.1 Extraction: Image Path

#### Bad Image Quality

| Edge Case | Mitigation |
|-----------|------------|
| Crumpled/folded paper | Per-field confidence scoring. If confidence drops below threshold, flag entire row. Show cropped image region alongside extracted value. |
| Pencil (low contrast) | Pre-processing: auto-contrast enhancement before AI. Upload UI guidance: "pen photographs better than pencil." If very few results vs. expected class size: "Only found 12 students. Expected ~28. Try better lighting or re-scan." |
| Shadows / uneven lighting | Class-size sanity check. Partial results returned with unreadable regions highlighted. |
| Teacher's red marks over student answers | Extraction prompt distinguishes student writing from teacher markings. `marking_conflicts` array for ambiguous cases. |
| Bleed-through | Handled by modern vision models. Flag if confidence drops. Low-priority. |

#### Missing / Ambiguous Names

| Edge Case | Mitigation |
|-----------|------------|
| No name written | Return as `unmatched_entry`. Show cropped image + dropdown of unmatched roster students. |
| Name in unexpected location | Extraction prompt scans full page, no hardcoded location. |
| Partial name ("Emma" not "Emma Johnson") | Roster matching returns top-N candidates ranked by similarity. Flag if top two are close. |

#### Similar Names / Nicknames

Alias map per student:
```json
{
  "student_id": "uuid",
  "canonical_name": "Robert Chen",
  "known_aliases": ["Bobby", "Bobby C.", "Bob Chen", "Robrt"]
}
```

Initially empty, populated as teacher corrects matches. Matching algorithm tiers:
1. Exact match against roster -> auto-confirm
2. Exact match against aliases -> auto-confirm
3. Fuzzy match (Levenshtein + phonetic) -> flag for review
4. No match -> present as unmatched

#### Multi-Page / Multi-Student Photos

| Edge Case | Mitigation |
|-----------|------------|
| Two pages of one student in one photo | Prompt: check if multiple pages share same name. `page_continuations` flag. |
| Edge of another paper visible | Prompt: only extract complete submissions. `partial_papers_detected: true`. |
| Stack of papers (only top visible) | Count sanity check: "Extracted 1 student from this image. Expected more?" |

### 8.2 Extraction: CSV Path

#### Structural Problems

| Edge Case | Mitigation |
|-----------|------------|
| No header row | Heuristic: if row 1 looks like data, prompt teacher for column mapping. |
| Non-standard headers ("Nombre", "Puntos") | Auto-mapping with common synonyms across languages. Fallback: manual column mapping UI. |
| Semicolon/tab delimited | Detect delimiter by sampling first 5 lines. |
| Excel with merged cells / multiple sheets | Accept `.xlsx` natively. Multi-sheet: show names, teacher picks. Merged cells: flatten. |
| BOM / encoding issues | Strip BOM, detect encoding (UTF-8, Latin-1, Windows-1252). Flag garbled names. |

#### Missing / Inconsistent Data

| Edge Case | Mitigation |
|-----------|------------|
| Empty cell (absent or zero?) | Never assume. Ask teacher: "Mark as: Absent / Zero / Skip." |
| Mixed formats ("8/10", "80%", "B+") in one column | Detect per cell, normalize, show teacher the interpretation. Letter grades require teacher-provided scale. |
| Student in CSV but not in roster | "Found 'Jake Martinez' in CSV but not in roster. Add to roster / Skip / Assign to [dropdown]." |
| Student in roster but not in CSV | "3 students have no data. Mark as: Absent / Exclude." |
| More rows than roster | "CSV has 42 rows, roster has 28. May be duplicates or wrong-class data." Show excess. |

### 8.3 Assessment / Grading

#### Path B: Objective Grading

| Edge Case | Mitigation |
|-----------|------------|
| Student selected two answers | `multiple_answers_detected` flag. Teacher resolves: "Use first / Use second / Mark incorrect." |
| Answer in unexpected format | Extraction prompt handles common equivalences ("True" = "T"). Ambiguous cases flagged. |
| Answer key has an error | If >80% of students got a question "wrong": "Most students answered B on Q7, but your key says A. Verify?" |
| Extra credit questions | Assignment setup allows marking questions as extra credit (excluded from base total). |

#### Scope Boundary (MVP limits, graceful degradation)

| Edge Case | System Response |
|-----------|-----------------|
| Right answer, wrong work | MVP scores final answer only. Does not claim to verify reasoning. |
| Arithmetic slip in correct approach | Same: final answer scored. Future work (Path C). |
| Open-ended / subjective responses | "This appears to contain written responses. ClassPulse currently analyzes objective questions only. These questions excluded from analysis." |
| Mixed assignment (MC + open-ended) | Extract and grade objective questions. Flag open-ended as excluded. "Analyzed 8 of 12 questions (4 open-ended excluded)." |

### 8.4 Aggregation / Analysis

#### Small Class Sizes

**Rule: below N=10, use counts, not percentages.** "3 students struggled with fractions" not "60% struggled." Above N=10: show both. Enforced in both the AI prompt and the UI.

#### Outliers and Distributions

| Pattern | Mitigation |
|---------|------------|
| One student way behind | Report median alongside mean. Flag outliers (>2 SD): "1 student scored significantly below the class. Flagged as individual intervention, excluded from class averages." Teacher can toggle inclusion. |
| One gifted student | Same outlier detection. Per-skill breakdown catches masked issues. |
| Bimodal distribution | Explicit detection: "Your class shows two distinct groups: strong group (8 students, avg 92%) and struggling group (7 students, avg 54%). Consider differentiated instruction." |
| Ceiling effect (everyone >90%) | "All students scored above 90%. Strong mastery, or assessment may not differentiate. Consider a more challenging assessment." |
| Floor effect (everyone <50%) | "Class-wide difficulty. Likely instructional gap, not individual issues. Whole-class reteach recommended." Don't generate 28 individual interventions. |
| One question missed by everyone | "Q7 missed by 26/28 students. May indicate a confusing question rather than a skill gap." |

#### Skill Inference Artifacts

| Edge Case | Mitigation |
|-----------|------------|
| Two questions per skill (small sample) | Show question count: "Fractions (2 questions)". Teacher sees the data backing. |
| Question tests multiple skills | Primary/secondary skill model. Analysis weights primary. Teacher can reassign. |
| Tag too broad ("math") or too narrow | Prompt guidance for topic-level granularity. Confidence scoring flags outliers. |

### 8.5 Interventions

#### Curriculum Context Gap

The AI has zero knowledge of curriculum timeline or pacing. MVP approach: interventions are framed as "based on this data, here's what would help" without scheduling assumptions. Future: teacher optionally provides unit timeline.

#### The "Now What" Gap

Interventions must be **specific, not generic**.

| Effort Tier | Good | Bad |
|-------------|------|-----|
| 5-min warm-up | "3 rapid-fire fraction reduction problems on the board. For each, ask: what number divides into BOTH?" | "Do a warm-up." |
| Dedicated lesson | "Paper-folding activity showing that 6/8 and 3/4 cover the same length. Focus on 'dividing' vs. 'subtracting.'" | "Reteach fractions." |
| 1-on-1 check-in | "Ask Marcus to walk through Q4 steps. Listen for 'subtract' vs. 'divide.' 2-minute conversation confirms if procedural or conceptual." | "Check in with struggling students." |

Misconception data drives specificity. Generic analysis produces generic interventions.

#### Grouping Problems

| Edge Case | Mitigation |
|-----------|------------|
| Group of 1-2 | Reclassify as individual flag. "Small group" = 3-6. |
| Student in multiple groups | Rank by severity. Primary group shown, note about secondary: "Also shows weakness in [skill]." |
| 4+ groups identified | Prioritize: "3 groups by severity. 1) Fractions (6 students, severe) 2) Decimals (4, moderate) 3) Word problems (3, mild)." |
| Logistically impossible | Effort tiers handle it. Teacher picks what's realistic. |

#### Intervention Fatigue

**Hard cap: 3 interventions per analysis** on the default view. Ranked by impact. More available under "See all." The 60-second scan shows only the most impactful actions.

### 8.6 Cross-Cutting: Teacher Override Model

#### Where Overrides Apply

| Stage | Overridable Fields |
|-------|-------------------|
| Extraction | Student name, scores, individual answers |
| Roster matching | Name-to-student assignment |
| Grading | Any question's correct/incorrect determination |
| Skill inference | Any question's skill tag |
| Analysis | Exclude student from class stats, exclude question, adjust skill rating |
| Interventions | Dismiss, modify, re-prioritize, add teacher notes |

#### Re-Analysis Behavior

**Pass 1 corrections** (name, score, answer, skill tag): validated data updated in place. Pass 2 results marked **stale** with visible indicator: "Analysis was run before your corrections. Re-analyze to update." Teacher clicks "Re-analyze." Intentionally manual because:
1. Teacher may want to batch corrections before re-running
2. Re-analysis costs an AI call
3. Teacher maintains control

**Pass 2 corrections** (excluding student, dismissing intervention): UI-level overrides, no re-processing needed.

#### Trust Calibration

Confidence thresholds are **adjustable per teacher** over time. Simple sliding window: track correction rate over last N uploads, adjust auto-accept thresholds. Frequent correctors see more items flagged. Rare correctors see fewer interruptions.

### 8.7 Additional Edge Cases

#### Privacy / FERPA

- Student names, scores, and images are **PII for minors** under FERPA
- Images need access-controlled storage with retention policies
- Teacher/district must know which AI model processes student data (OpenRouter routes to various providers)
- Default data retention: end of school year auto-purge, opt-in to retain

#### Cost at Scale

- 6 classes x 30 students x weekly = ~180 papers/week, ~18 AI calls/week
- Mitigation: batch papers efficiently (3-4 per photo), cache skill inference for same assignment across class periods
- Track cost per analysis via OpenRouter response headers (admin-facing, not teacher-facing for MVP)

#### Error Recovery

| Scenario | Handling |
|----------|----------|
| Upload fails mid-batch | Save partial. "5 of 12 uploaded. Resume or start over?" |
| AI call timeout | Retry once. On second failure: "Taking longer than expected. We'll notify you when ready." Queue async. |
| Browser closed during processing | Processing continues server-side. Results waiting when teacher returns. |
| Malformed AI JSON response | Retry once. Still malformed: "Couldn't process. Try re-uploading or enter data manually." Never show raw errors. |

---

## 9. Testing Strategy

### 9.1 Fixture-First Approach

Before any code, build a complete fixture set that serves as the source of truth for all tests.

### 9.2 Fixture Class: "Mrs. Patterson's 5th Grade Math"

#### Roster (10 students)

| # | Roster Name | Archetype | What It Tests |
|---|------------|-----------|---------------|
| 1 | Emma Johnson | Ace student | 100% correct, empty `gapAreas`, no interventions |
| 2 | Marcus Rivera | Consistent misconception | Fraction addition correct, systematically reduces by subtracting. Tests misconception detection. |
| 3 | Sofia Chen | Near-passing boundary | Scores at 60% threshold. Tests yellow/green boundary. |
| 4 | Maria Garcia | Similar name (pair 1) | Writes "Maria G." Tests disambiguation. |
| 5 | Maria Torres | Similar name (pair 2) | Writes "Maria" with no initial. Tests low-confidence flagging. |
| 6 | Robert Kim | Nickname | Writes "Bobby K." Tests alias map. |
| 7 | Aisha Patel | Same-error pair (1/2) | Adds numerators+denominators on fraction questions. Tests small-group clustering with Jake. |
| 8 | Jake Morrison | Same-error pair (2/2) | Same misconception as Aisha. Must cluster into same intervention group. |
| 9 | David Okafor | Failing student | Misses most questions. Tests individual flag + multi-skill gaps + outlier detection. |
| 10 | Lily Zhang | Absent | In roster, not in submissions. Tests absent handling. |

#### Fixture Assignment: "Chapter 4 Quiz - Fractions" (10 questions, 3 skills)

| Q# | Skill | Correct | Key Distractor |
|----|-------|---------|----------------|
| Q1 | Fraction addition | C (5/4) | A: added num+denom (4/6) |
| Q2 | Fraction addition | B (7/6) | D: added num+denom (5/9) |
| Q3 | Fraction addition | A (11/12) | C: added num+denom (5/7) |
| Q4 | Reducing fractions | D (3/4) | B: subtracted 2 from each (4/6) |
| Q5 | Reducing fractions | A (2/5) | C: subtracted 2 from each (2/8) |
| Q6 | Reducing fractions | B (1/3) | A: subtracted 1 from each (2/5) |
| Q7 | Mixed numbers | C (2 1/4) | -- |
| Q8 | Mixed numbers | A (3 2/3) | -- |
| Q9 | Mixed numbers | D (1 5/6) | -- |
| Q10 | Mixed numbers | B (4 1/2) | -- |

3+ questions per skill for meaningful analysis. Wrong answers embed specific misconceptions.

#### Fixture Submissions

```typescript
export const fixtureSubmissions = {
  emma_johnson:    ['C','B','A','D','A','B','C','A','D','B'], // 10/10
  marcus_rivera:   ['C','B','A','B','C','A','C','A','D','B'], // 7/10 - reduces by subtracting
  sofia_chen:      ['C','B','C','D','A','B','A','D','D','B'], // 6/10 - threshold
  maria_garcia:    ['C','D','A','D','A','A','C','A','B','B'], // 7/10
  maria_torres:    ['A','B','A','D','C','B','C','D','D','A'], // 5/10
  robert_kim:      ['C','B','A','D','A','B','D','A','D','A'], // 7/10
  aisha_patel:     ['A','D','C','D','A','B','C','A','D','B'], // 5/10 - add num+denom Q1,Q2,Q3
  jake_morrison:   ['A','D','C','D','A','A','C','A','B','B'], // 4/10 - same fraction error
  david_okafor:    ['A','D','C','B','C','A','A','D','B','A'], // 1/10
  lily_zhang:      null                                        // absent
};
```

#### Fixture Images

Checked into `fixtures/images/`:
- **clean-worksheet.png:** typed, good lighting, clear marks. Extraction baseline.
- **messy-worksheet.png:** pencil, crumpled, shadow. Degraded extraction test.
- **multi-student.png:** 3 papers in one photo. Boundary detection.
- **no-name.png:** student forgot name. `unmatched_entry` handling.
- **two-marias.png:** Maria G. and Maria (no initial) adjacent. Similar-name extraction.

#### Saved LLM Response Fixtures

```
fixtures/
  llm-responses/
    extraction/
      clean-image-response.json
      messy-image-response.json
    skill-inference/
      chapter4-quiz-response.json
    analysis/
      full-class-response.json
```

Recorded once from real LLM calls, then frozen. Tests run against saved responses, not live API.

### 9.3 Test Pyramid

#### Layer 1: Unit Tests (broad base, fast, no AI)

**Pure function inventory:**

| Function | Tests |
|----------|-------|
| `normalizeScore` | "8/10" -> 0.8, "80%" -> 0.8, "B+" -> grade scale lookup, "0/10" -> 0, "100%" -> 1.0 |
| `detectScoreFormat` | Fraction, percentage, letter, points. Ambiguous cases ("3", "10"). |
| `matchStudentToRoster` | Exact, fuzzy, nickname via alias, "Maria" two candidates, no match. |
| `mapCsvColumns` | Standard headers, non-English, no headers, extra columns. |
| `calculateClassStats` | Mean, median, stdDev. Normal, bimodal, single student, all same score. |
| `detectDistributionShape` | Normal, bimodal, ceiling, floor, uniform. |
| `detectOutliers` | David (1/10) flagged. No outliers when scores are close. |
| `clusterStudentsByGap` | Aisha+Jake cluster on fraction addition. Marcus alone on reducing. David individual. |
| `determineInterventionScope` | 1-2 -> individual, 3-6 -> small group, >50% -> whole class. |
| `applyConfidenceThreshold` | Boundary values at exact thresholds. |
| `formatForSmallClass` | count vs. percentage based on class size. |
| `detectAnswerKeyError` | Flag when >80% pick same "wrong" answer. |
| `resolveScoreConflicts` | Mixed formats in one column detected and normalized. |

**Runner:** Vitest.

#### Layer 2: Schema Validation (middle layer, saved LLM fixtures)

**Structural validation (Zod):**
- Every saved LLM response parses against its Zod schema without errors

**Semantic invariants:**

| Invariant | What It Catches |
|-----------|----------------|
| Every `questionId` maps to a real question in the answer key | AI hallucinated a question |
| Every `studentId` maps to a roster student | AI invented a student |
| Ace student (Emma) has `gapAreas: []` | Gaps assigned to a perfect scorer |
| Every `skillTag` appears in the skill mapping | AI hallucinated a skill |
| Intervention `studentIds` subset of students with gaps in that skill | Wrong targeting |
| `scope` is `whole_class` when >50% affected | Wrong scope |
| All scores between 0 and 1 | Unbounded numbers |
| Aisha and Jake in same intervention group | Clustering works |
| Confidence scores between 0 and 1 | 95 vs. 0.95 |

**Prompt regression:** change a prompt -> re-record fixture -> run validations -> catch regressions.

#### Layer 3: E2E Tests (thin top, Playwright)

| Test | Coverage |
|------|----------|
| Happy path: CSV upload | Dashboard -> Setup -> Upload -> Review -> Class Overview with correct stats |
| Review & Confirm flow | Fixture with yellow/red rows -> resolve -> confirm -> analysis |
| Intervention planner | Overview -> Plan Actions -> mark planned -> persists |
| Student detail drill-down | Overview -> click student -> correct per-skill data |
| Auth guard | Unauth -> redirected. Auth -> sees own classes only. |

E2E runs against Firebase emulator with seeded Firestore. AI calls mocked at Cloud Function level (returns fixture response).

### 9.4 Zod: Runtime and Test-Time

Zod schemas serve dual purpose:
1. **Runtime:** every LLM response parsed through Zod before pipeline continues. Malformed JSON caught immediately, retry once, then fail gracefully.
2. **Test-time:** same schemas validate saved fixtures.

Schemas in `shared/schemas.ts`, imported by both Cloud Functions and test suite. Single source of truth.

---

## 10. Tech Stack

### 10.1 Architecture

```
+-------------------------------------+
|       React / TypeScript            |
|       Tailwind CSS                  |
|       Firebase Auth                 |
|       Firebase Hosting              |
+--------------+----------------------+
               | HTTPS
+--------------v----------------------+
|     Cloud Functions (Node/TS)       |
|                                     |
|  +----------+  +-----------------+  |
|  | Pipeline |  | Admin / Config  |  |
|  | Functions|  | Functions       |  |
|  +----+-----+  +-------+--------+  |
|       |                 |           |
|  +----v-----------------v--------+  |
|  |       OpenRouter API          |  |
|  |  (all AI calls, incl vision)  |  |
|  +-------------------------------+  |
+--------------+----------------------+
               |
+--------------v----------------------+
|          Firestore                  |
|  +------------------------------+   |
|  | teachers/{uid}               |   |
|  | classes/{id}/students/{id}   |   |
|  | assignments/{id}             |   |
|  | analyses/{id}                |   |
|  | interventions/{id}           |   |
|  | config/openrouter             |   |
|  +------------------------------+   |
|                                     |
|          Firebase Storage           |
|  +------------------------------+   |
|  | uploads/{teacherId}/{asgId}/ |   |
|  |   (original images)          |   |
|  +------------------------------+   |
+-------------------------------------+
```

### 10.2 Frontend

- **React** with TypeScript
- **Tailwind CSS** for styling
- **Vite** for build tooling
- **Vitest** for unit and integration testing
- **Playwright** for E2E testing
- **Zod** for runtime schema validation (shared with backend)

### 10.3 Backend

- **Firebase Auth** for teacher authentication
- **Firestore** for all persistent data
- **Firebase Storage** for uploaded images (security rules scoped to `teachers/{uid}`)
- **Cloud Functions (Node/TypeScript)** for server-side processing
- **OpenRouter API** for all AI calls (including vision-capable models for image extraction)

### 10.4 Cloud Functions Structure

```
functions/src/
  index.ts                    # Exports
  pipeline/
    extract.ts                # Image -> structured data (vision model)
    extractCsv.ts             # CSV parsing + normalization (no AI)
    inferSkills.ts            # Question -> skill tags (AI)
    analyze.ts                # Pass 2: comprehensive analysis (AI)
  admin/
    fetchModels.ts            # Proxies OpenRouter /api/v1/models
    updateModelConfig.ts      # Saves model assignments to Firestore
  shared/
    openrouter.ts             # OpenRouter client (reads model config from Firestore)
    schemas.ts                # Zod schemas (shared with frontend)
    prompts.ts                # All AI prompts as template functions
```

### 10.5 Firestore Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `teachers/{uid}` | Teacher profile | name, email, preferences, confidenceThresholds |
| `classes/{id}` | Class definition | teacherId, name, gradeLevel, subject |
| `classes/{id}/students/{id}` | Student roster | firstName, lastName, displayName, knownAliases[] |
| `assignments/{id}` | Assignment metadata | classId, teacherId, title, type, answerKey, learningObjectives |
| `analyses/{id}` | Full analysis result | assignmentId, classId, AnalysisResult JSON, stale flag |
| `analyses/{id}/usage` | Cost tracking | modelUsed, tokensIn, tokensOut, cost, timestamp |
| `interventions/{id}` | Teacher's action decisions | analysisId, status, selectedEffortTier, teacherNote, plannedDate |
| `config/openrouter` | Model assignments | models.extraction, models.skillInference, models.analysis |

### 10.6 Firestore Security Rules

```
teachers/{uid}:          read/write if auth.uid == uid
classes/{classId}:       read/write if auth.uid == resource.data.teacherId
assignments/{id}:        read/write if auth.uid == resource.data.teacherId
analyses/{id}:           read/write if auth.uid == resource.data.teacherId
interventions/{id}:      read/write if auth.uid == resource.data.teacherId
config/openrouter:       read if authenticated, write if admin
```

Teachers see only their own data. Admin model config readable by all authenticated (functions need it), writable by admin only.

### 10.7 Firebase Storage Rules

Images scoped to teacher:
```
uploads/{teacherId}/{assignmentId}/{filename}:
  read/write if auth.uid == teacherId
```

---

## 11. OpenRouter Admin Controls

### 11.1 Model-Per-Function Assignment

Three pipeline functions, each independently configurable:

| Pipeline Function | Default Model | Why This Default |
|-------------------|--------------|------------------|
| **Extraction** (vision) | `google/gemini-2.5-flash` | Vision-capable, fast, cheaper. Structured extraction doesn't need top reasoning. |
| **Skill Inference** | `anthropic/claude-sonnet-4-6` | Mid-tier reasoning. Needs educational content understanding. Not vision. |
| **Analysis** (Pass 2) | `anthropic/claude-opus-4-6` | Hardest task: misconceptions, interventions, coherent structured output. Worth the cost. |

### 11.2 Admin Config (Firestore)

```json
{
  "models": {
    "extraction": {
      "modelId": "google/gemini-2.5-flash",
      "requiresVision": true
    },
    "skillInference": {
      "modelId": "anthropic/claude-sonnet-4-6",
      "requiresVision": false
    },
    "analysis": {
      "modelId": "anthropic/claude-opus-4-6",
      "requiresVision": false
    }
  },
  "cachedModelList": [],
  "lastFetched": "2026-06-09T00:00:00Z"
}
```

### 11.3 Admin UI

- Model list fetched server-side via Cloud Function (API key stays on server) from OpenRouter `/api/v1/models`
- Models flagged as vision-capable based on `architecture.modality` field
- When assigning the extraction function: only vision-capable models shown
- When assigning skill inference or analysis: all models shown
- Searchable model list with grouping (favorites, free, paid)
- Current assignment shown with one-click change

### 11.4 Cost Tracking

OpenRouter returns cost per request in response headers. Each Cloud Function logs:
- Model used
- Tokens in/out
- Cost
- Timestamp

Stored in `analyses/{id}/usage` subcollection. Admin page shows aggregate usage. Not teacher-facing for MVP.

### 11.5 Model Fallback

If the assigned model fails (rate limit, outage), no automatic fallback for MVP. The function retries once with the same model, then returns an error. Automatic fallback to a secondary model is future work (requires careful consideration of which models are acceptable substitutes, especially for vision).
