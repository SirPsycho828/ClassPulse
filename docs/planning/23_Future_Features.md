▸ Extended thinking (339 chars)  
## Overview

This file catalogs every feature, enhancement, and unresolved gap explicitly deferred from MVP across the preceding spec files. Items are organized by priority tier based on user impact and implementation complexity. Nothing here is speculative -- every item was identified during spec development as a real need that does not block the MVP experience but would meaningfully improve ClassPulse post-launch.

## Dependencies

This file references gaps flagged throughout:
- `01_Auth.md` -- account deletion, adaptive thresholds
- `02_Database_Schema.md` -- FERPA compliance, soft delete, analysis versioning
- `03_Cloud_Functions.md` -- rate limiting, image size limits, shared schema packaging
- `04_UI_Design_System.md` -- dark mode, print styles, chart library
- `06_Dashboard.md` -- pagination, analysis deletion, cross-class summary
- `07_Class_Roster_Management.md` -- class deletion, SIS import, class archiving
- `08_Assignment_Setup.md` -- assignment date picker, draft saving
- `09_Upload_Flow.md` -- image compression, storage cleanup
- `10_Image_Extraction.md` -- image preprocessing, bounding boxes
- `11_CSV_Processing.md` -- international number formats
- `12_Roster_Matching.md` -- phonetic matching
- `13_Review_Confirm.md` -- bulk actions, partial review persistence, image crop regions
- `14_Grading.md` -- partial credit, multiple correct answers
- `15_Skill_Inference.md` -- skill tag normalization, cross-analysis consistency
- `16_Analysis_Pipeline.md` -- analysis versioning, configurable intervention cap
- `17_Class_Overview.md` -- PDF export, historical comparison
- `19_Intervention_Planner.md` -- custom interventions, intervention history, reminders
- `20_OpenRouter_Admin.md` -- model testing sandbox, cost dashboard, deprecation alerts
- `21_Override_Confidence_Model.md` -- adaptive trust calibration
- `22_Testing_Fixtures.md` -- frontend component tests

## Tier 1: High Impact, Near-Term

Features that address real workflow gaps teachers will notice quickly.

### Historical Trends

Track student and class performance across multiple assignments.

- **Cross-assignment view:** "How has 5th Grade Math performed over the semester?"
- **Per-student trends:** "Is Marcus improving or declining?"
- **Skill progression:** "Has fraction addition mastery improved since the intervention?"
- Requires a new `trends` collection or denormalized summary documents per class
- Class Overview gains a "Trends" tab showing line charts over time
- Student Detail gains a "History" section with past scores
- Referenced in: `17_Class_Overview.md`, `18_Student_Detail.md`

### PDF Export

Downloadable reports for parent conferences, admin meetings, and student portfolios.

- **Class report:** Band 1-3 content from Class Overview formatted for print
- **Student report:** Student Detail content as a one-page summary
- **Intervention plan:** Current intervention statuses and planned actions
- Generate server-side via a Cloud Function using a PDF library (e.g., PDFKit or Puppeteer rendering)
- "Download PDF" button on Class Overview and Student Detail screens
- Referenced in: `17_Class_Overview.md`, `18_Student_Detail.md`

### Class Archiving

Hide past-semester classes from active dropdowns without deleting data.

- `archived: boolean` flag on class documents
- Archived classes hidden from Setup wizard class dropdown and Dashboard filters
- "Archived Classes" section in class management, expandable
- Bulk archive: "Archive all classes" at semester end
- Referenced in: `07_Class_Roster_Management.md`, `06_Dashboard.md`

### Adaptive Trust Calibration

Confidence thresholds that learn from teacher correction patterns.

- Sliding window over last 10 analyses computes per-field correction rates
- High correction rate → lower auto-confirm threshold (more items flagged)
- Low correction rate → higher threshold (more items auto-confirmed)
- `teacher.preferences.confidenceThreshold` becomes dynamic per field type
- Dashboard shows calibration status: "System confidence: improving (3% correction rate, down from 12%)"
- Referenced in: `21_Override_Confidence_Model.md`, `01_Auth.md`

### Rate Limiting for AI Calls

Prevent runaway costs from repeated re-analysis or abuse.

- Per-teacher daily cap on AI calls (e.g., 20 analyses/day)
- Cooldown between re-analyses on the same assignment (e.g., 5 minutes)
- Admin-configurable limits stored in `config/openrouter`
- Teacher sees: "You've used 18 of 20 analyses today" on the processing screen
- Referenced in: `03_Cloud_Functions.md`

## Tier 2: Medium Impact, Medium Complexity

Features that improve polish and handle edge cases.

### Assignment Paths C and D

Additional input paths beyond scored work and objective quizzes.

- **Path C (Show Your Work):** Student writes solutions. AI extracts reasoning steps, not just final answers. Enables process-level analysis ("student set up the equation correctly but made an arithmetic error").
- **Path D (Open Response):** Short answer or essay. AI evaluates against a rubric. Most complex path -- requires rubric definition UI and evaluative AI prompts.
- Both paths significantly expand prompt complexity and `ExtractionResult` schema
- Referenced in: `00_README.md`

### Partial Credit Grading

Per-question rubrics for Path B assignments.

- Answer key gains a `rubric` field per question: array of `{ answer, points, label }`
- Example: Q1 full credit for "5/4", half credit for "1.25" (correct value, wrong format)
- Grading function evaluates against rubric entries in order, awards highest matching points
- Changes `GradedResult` to allow non-binary `pointsEarned`
- Referenced in: `14_Grading.md`

### Account Deletion

Self-service account deletion for GDPR/privacy compliance.

- Settings page with "Delete my account" action
- Confirmation flow: type "DELETE" to confirm
- Cloud Function cascade: delete teacher profile, all classes, all assignments, all analyses, all interventions, all Storage uploads
- Firebase Auth user deletion
- 30-day grace period with soft delete before hard purge (optional)
- Referenced in: `01_Auth.md`

### Skill Tag Normalization

Cross-analysis skill tag consistency using embedding similarity.

- When a new analysis generates skill tags, compare against a teacher-level skill dictionary
- If a new tag is >90% similar to an existing tag (via embedding distance), suggest the existing tag
- Teacher confirms or keeps the new tag
- Enables meaningful cross-assignment skill tracking for historical trends
- Referenced in: `15_Skill_Inference.md`

### Bulk Review Actions

Speed up Review & Confirm for large classes.

- "Confirm all green rows" button
- "Mark all unmatched as absent" button
- Multi-select rows with shift-click for bulk status changes
- Referenced in: `13_Review_Confirm.md`

### Image Preprocessing

Client-side image enhancement before sending to vision AI.

- Auto-contrast adjustment for low-light photos
- Rotation detection and correction (upside-down papers)
- Deskew for angled photographs
- Use a client-side library (e.g., OpenCV.js or lighter alternative)
- Toggle in settings: "Enhance images before processing" (default on)
- Referenced in: `10_Image_Extraction.md`

### Custom Interventions

Teacher-created intervention cards alongside AI recommendations.

- "Add intervention" button on Intervention Planner
- Free-form fields: skill tag (dropdown of existing + custom), affected students (multi-select), description, effort tiers
- Custom interventions coexist with AI-generated ones, sorted by priority (teacher sets priority)
- Referenced in: `19_Intervention_Planner.md`

## Tier 3: Lower Priority, Nice-to-Have

Features that polish the experience but are not critical.

### SIS Integration

Import rosters from student information systems.

- Clever API integration for automated roster sync
- PowerSchool CSV export format auto-detection
- Periodic sync to catch mid-semester roster changes (transfers, new students)
- Referenced in: `07_Class_Roster_Management.md`

### Dark Mode

Full dark theme using Tailwind's dark mode utilities.

- `dark:` variants for all color tokens
- System preference detection with manual toggle
- Persisted in teacher preferences
- Referenced in: `04_UI_Design_System.md`

### Model Testing Sandbox

Test a model before assigning it to a pipeline function.

- Admin selects a model and runs it against the Mrs. Patterson fixture
- Side-by-side comparison: fixture expected output vs model output
- Metrics: response time, token usage, cost, schema compliance rate
- Helps admin make informed model selection decisions
- Referenced in: `20_OpenRouter_Admin.md`

### Automatic Model Fallback

Graceful degradation when the configured model is unavailable.

- Ordered fallback chain per function: primary → secondary → tertiary
- Admin configures fallback models in OpenRouter admin
- If primary model returns 5xx or timeout, automatically retry with secondary
- Log which model was actually used on the analysis document
- Referenced in: `03_Cloud_Functions.md`

### FERPA Compliance and Data Retention

Automated data lifecycle management for student privacy.

- End-of-year auto-purge: scheduled Cloud Function deletes analyses older than configurable retention period
- Data export: teacher can download all their data before purge
- Anonymization option: strip student names but keep aggregate analytics
- Consent tracking: record when/how teacher acknowledged data handling terms
- Referenced in: `02_Database_Schema.md`

### Notification System

Gentle follow-ups and reminders.

- Email after first analysis: "Here's what you can do with your results"
- Reminder for pending interventions: "You have 2 planned interventions for this week"
- Optional, teacher-controlled frequency: daily digest, weekly, or off
- Requires email infrastructure (Firebase Extensions or SendGrid)
- Referenced in: `06_Dashboard.md`, `19_Intervention_Planner.md`

### Cross-Analysis Intervention Aggregation

Merge interventions across assignments targeting the same skill.

- If Quiz 3 and Quiz 4 both flag "fraction addition," show a combined intervention
- Track intervention effectiveness: "After your warm-up activity, fraction addition mastery improved from 62% to 81%"
- Requires skill tag normalization (Tier 2) as a prerequisite
- Referenced in: `19_Intervention_Planner.md`

### Bounding Box Extraction

Precise image regions for low-confidence values on Review & Confirm.

- Extraction prompt requests bounding box coordinates per extracted field
- Review & Confirm shows cropped image regions alongside flagged values
- Teacher sees exactly what the AI read, making corrections faster
- Schema change: add `boundingBox: { x, y, width, height, imageIndex }` to extracted fields
- Referenced in: `10_Image_Extraction.md`, `13_Review_Confirm.md`

## Implementation Sequencing

Recommended build order for post-MVP features, based on dependencies and value:

```
Phase 1 (after MVP stabilizes):
  - Class archiving (standalone, no dependencies)
  - Bulk review actions (standalone)
  - Rate limiting (safety, standalone)
  - Account deletion (compliance)

Phase 2 (after 10+ teachers using the product):
  - Historical trends (requires stable usage data)
  - Adaptive trust calibration (requires correction data)
  - PDF export (high teacher demand expected)
  - Skill tag normalization (prerequisite for trends)

Phase 3 (feature expansion):
  - Path C (Show Your Work)
  - Partial credit grading
  - Custom interventions
  - Image preprocessing

Phase 4 (scale and polish):
  - SIS integration
  - Dark mode
  - Model testing sandbox
  - Automatic model fallback
  - FERPA compliance
  - Cross-analysis intervention aggregation
  - Notification system
  - Bounding box extraction
```

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Prioritization basis | Assumption | Tiers are based on anticipated teacher need and implementation complexity. Actual priority should be informed by user feedback after MVP launch. |
| Path C/D complexity | Assumption | Paths C and D are estimated as medium-high complexity. Path D (open response) may require fundamentally different prompt strategies and evaluation models. Scope carefully before committing. |
| SIS integration scope | Gap | Clever and PowerSchool are the largest US SIS platforms but dozens exist. Start with CSV import of SIS-exported rosters (already supported) and add direct API integration based on demand. |
| Historical trends storage | Gap | No schema designed for trend data. Options: denormalized summary documents per class updated on each analysis, or computed on-the-fly from the `analyses` collection. The former is faster to read, the latter is simpler to maintain. Decide during implementation. |
| Feature flag system | Assumption | No feature flag infrastructure in MVP. Post-MVP features should be gated behind flags during rollout. Consider a simple Firestore-backed flag system or a third-party service. |
| Backward compatibility | Assumption | Schema changes for post-MVP features (bounding boxes, rubrics, trend data) must not break existing analysis documents. Add new fields as optional with defaults. The schema versioning gap flagged in `05_Shared_Schemas.md` becomes more pressing as the schema evolves. |  
