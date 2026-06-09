▸ Extended thinking (255 chars)  
## Overview

ClassPulse's test strategy centers on a single canonical fixture -- Mrs. Patterson's 5th grade math class -- that provides deterministic data for every layer of the test pyramid. AI calls are the primary testing challenge: they are slow, expensive, and non-deterministic. The solution is saved responses -- real AI outputs captured once, validated against Zod schemas, and replayed during tests. Algorithmic functions (grading, roster matching, stats) are tested with standard unit tests. The fixture class is designed to exercise every edge case the pipeline handles.

## Dependencies

- `03_Cloud_Functions.md` -- pipeline functions under test
- `05_Shared_Schemas.md` -- Zod schemas validate fixture data and saved responses
- `12_Roster_Matching.md` -- matching algorithm test cases
- `14_Grading.md` -- grading function test cases
- `16_Analysis_Pipeline.md` -- `computeStats.ts` functions under test

## Test Pyramid

```
     /  E2E (Playwright)  \        -- 3-5 tests, critical paths only
    /  Integration (Vitest) \      -- ~15 tests, Cloud Functions with mocked AI
   / Unit Tests (Vitest)      \    -- ~50 tests, pure functions, no mocks
  /______________________________\
```

### Unit Tests (~50 tests)

Pure functions with no external dependencies. These are the primary safety net.

**Targets in `pipeline/computeStats.ts`:**
- `calculateClassStats` -- mean, median, stdDev, min, max
- `detectDistributionShape` -- normal, bimodal, ceiling, floor, uniform
- `detectOutliers` -- students > 2 SD from mean
- `calculateSkillMastery` -- per-skill class and per-student mastery
- `clusterStudentsByGap` -- grouping students by shared gaps
- `determineInterventionScope` -- whole-class / small-group / individual

**Targets in `pipeline/grade.ts`:**
- `gradeAssignment` -- answer comparison, normalization, distractor tracking
- `detectAnswerKeyErrors` -- high miss rate flagging
- Answer normalization: case, whitespace, fractions, decimals, booleans

**Targets in `pipeline/rosterMatch.ts`:**
- Exact match, alias match, fuzzy match, unmatched
- One-to-one constraint enforcement
- Conflict resolution (two extractions → one roster student)
- Similar name disambiguation

**Targets in CSV processing (frontend):**
- Delimiter detection
- Score normalization (fractions, percentages, bare numbers, letter grades)
- Column auto-detection
- Name parsing (first/last split)

### Integration Tests (~15 tests)

Cloud Functions with the AI client mocked to return saved responses. Uses the Firebase emulator suite.

**Setup:** Firebase emulator running Firestore and Auth. AI client replaced with a mock that reads from saved response files.

**Tests cover:**
- `runExtraction` -- creates assignment, writes images, calls function, verifies `ExtractionResult` and `RosterMatchResult` written to `pipelineState`
- `runCsvExtraction` -- same flow without AI mock (no AI call)
- `submitValidation` -- corrections applied, aliases saved, grading triggered for Path B
- `runAnalysis` -- skill inference + analysis, verifies `AnalysisResult` written to `analyses` collection, intervention documents created
- `fetchAvailableModels` -- proxy mock, cache written to Firestore
- `updateModelConfig` -- admin check, vision validation, config updated
- `onUserCreate` -- teacher profile created with defaults

**Auth enforcement tests:**
- Non-owner cannot read another teacher's assignment
- Non-admin cannot write to `config/openrouter`
- Unauthenticated calls rejected

### E2E Tests (3-5 tests, Playwright)

Full browser tests against the Firebase emulator with mocked AI responses.

| Test | Flow |
|------|------|
| Happy path (Path B, images) | Sign in → Create class → Setup wizard → Upload (mock images) → Review & Confirm → Class Overview → Student Detail → Intervention Planner |
| Happy path (Path A, CSV) | Sign in → Create class → Setup → CSV upload → Review → Class Overview |
| Error recovery | Upload → Extraction fails → Error state → Retry → Success |
| Admin model config | Sign in as admin → Change extraction model → Verify config saved |
| Empty states | New user sign-in → Dashboard empty state → Create class inline |

E2E tests use the fixture class (Mrs. Patterson's) pre-seeded in the emulator.

## Mrs. Patterson's Class Fixture

A single canonical test class that exercises every edge case.

### Class Metadata

| Field | Value |
|-------|-------|
| Teacher | Mrs. Patterson |
| Class | 5th Grade Math - Period 2 |
| Grade | 5 |
| Subject | Math |
| Students | 28 |
| Assignment | Chapter 4 Quiz - Fractions (Path B, 10 questions) |

### Student Roster (28 students)

The roster is designed so specific students exercise specific test scenarios:

| Student | Purpose |
|---------|---------|
| Emma Johnson | Perfect score (100%). Outlier above. |
| Marcus Rivera | Lowest score (32%). Outlier below. Individual intervention target. |
| Bobby Kim (alias: "Bobby K.") | Alias matching test. Known alias on roster. |
| Maria Garcia | Similar name disambiguation (vs Maria Torres). |
| Maria Torres | Similar name disambiguation (vs Maria Garcia). |
| Lily Zhang | Absent -- no submission in fixture data. |
| Jayden O'Brien | Apostrophe in name. Tests punctuation handling. |
| José Martinez | Accent character. Tests Unicode handling. |
| Aiden/Aidan Smith | Phonetically similar name. Fuzzy match test. |
| 19 additional students | Normal distribution of scores (60-90% range). Fill out the class to realistic size. |

### Answer Key (10 questions)

| Q# | Correct | Choices | Skill | Notes |
|----|---------|---------|-------|-------|
| 1 | C | A: 5/6, B: 4/6, C: 5/4, D: 1/1 | Fraction addition (unlike denom.) | |
| 2 | B | A: 3/5, B: 2/3, C: 1/2, D: 3/4 | Fraction comparison | |
| 3 | A | A: 7/12, B: 2/7, C: 8/12, D: 5/7 | Fraction addition (unlike denom.) | High miss rate on B (add num+denom) |
| 4 | D | A: 1/3, B: 2/5, C: 3/7, D: 3/8 | Fraction subtraction | |
| 5 | C | A: 2, B: 1.5, C: 1 3/4, D: 2 1/4 | Mixed numbers | |
| 6 | B | A: 4/5, B: 3/4, C: 5/6, D: 2/3 | Fraction comparison | |
| 7 | A | A: 1/2, B: 2/4, C: 3/6, D: all | Equivalent fractions | Intentional wrong key -- correct answer is D. Tests answer key error detection. |
| 8 | C | A: 5/3, B: 2 1/3, C: 1 2/3, D: 4/3 | Improper to mixed | |
| 9 | B | A: 0.25, B: 0.75, C: 0.5, D: 0.33 | Fraction to decimal | |
| 10 | A (extra credit) | A: 5/6, B: 7/12, C: 2/3, D: 3/4 | Fraction addition (unlike denom.) | Extra credit question |

### Fixture Behaviors Exercised

| Scenario | Fixture Element |
|----------|----------------|
| Perfect score + outlier above | Emma Johnson: all 10 correct |
| Very low score + outlier below | Marcus Rivera: 3/10 correct, consistent fraction-addition errors |
| Alias match | Bobby Kim extracted as "Bobby K." |
| Ambiguous similar names | "Maria" extracted without last name -- two candidates |
| Absent student | Lily Zhang not in extraction data |
| Special characters in names | Jayden O'Brien, José Martinez |
| Answer key error | Q7: >80% chose "D" (all of the above), key says "A" |
| Extra credit | Q10: extra credit, doesn't count against total |
| Common misconception cluster | 8 students on Q1/Q3 chose the add-numerators-and-denominators distractor |
| Bimodal potential | Score distribution with most students 70-90% and Marcus at 32% |

## Saved AI Responses

Real AI responses captured once, validated, and committed to the test fixtures directory.

### File Structure

```
fixtures/
  mrs-patterson/
    class.json                 -- Class + roster documents
    assignment.json            -- Assignment + answer key
    responses/
      extraction.json          -- Saved ExtractionResult (vision AI output)
      skill-inference.json     -- Saved SkillInferenceResult
      analysis.json            -- Saved AnalysisResult (AI portions only)
    expected/
      roster-match.json        -- Expected RosterMatchResult
      graded.json              -- Expected GradedResult
      computed-stats.json      -- Expected stats output
```

### Capture Process

1. Run the pipeline once against real AI models with Mrs. Patterson's fixture images
2. Capture raw AI responses before Zod parsing
3. Validate captured responses against Zod schemas (must pass)
4. Commit to repository
5. Tests replay these responses via the mocked AI client

### Refresh Policy

Saved responses should be recaptured when:
- Zod schemas change in ways that would invalidate existing responses
- Prompt templates change significantly
- A new default model is selected

Recapture is manual and intentional. A CI check validates that all saved responses still pass their Zod schemas. If a schema change breaks a saved response, CI fails until the response is recaptured or the fixture is updated.

### Schema Validation Tests

Dedicated test suite that validates every saved response file against its Zod schema:

```
describe('Fixture schema validation', () => {
  it('extraction.json passes ExtractionResultSchema')
  it('skill-inference.json passes SkillInferenceResultSchema')
  it('analysis.json passes AnalysisResultSchema')
})
```

Also validates semantic invariants from `05_Shared_Schemas.md`:
- Every `studentId` maps to a roster student
- Every `questionNumber` maps to an answer key question
- Confidence values between 0 and 1
- Summary counts add up

## Test Environment

### Firebase Emulator Suite

All integration and E2E tests run against the Firebase emulator (Auth, Firestore, Storage, Functions). No real Firebase project needed for testing.

**Emulator config in `firebase.json`:**
- Auth emulator: port 9099
- Firestore emulator: port 8080
- Storage emulator: port 9199
- Functions emulator: port 5001

### CI Configuration

Tests run on every PR via GitHub Actions:

```
- Install dependencies
- Start Firebase emulators (background)
- Run unit tests (Vitest)
- Run integration tests (Vitest, emulator)
- Run E2E tests (Playwright, emulator)
- Stop emulators
```

Unit tests complete in under 10 seconds. Integration tests in under 30 seconds. E2E tests in under 2 minutes. Total CI time target: under 3 minutes.

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Fixture images | Gap | The fixture needs actual photos of student papers for extraction testing. Options: generate synthetic images with typed text, or photograph a real mock assignment. For unit/integration tests, the saved response bypasses images entirely. E2E tests with image upload would need fixture image files. |
| Multiple fixture classes | Assumption | Single fixture class for MVP. If edge cases emerge that Mrs. Patterson's class doesn't cover, add targeted unit test data rather than a second full fixture. |
| AI response drift | Assumption | Saved responses are static. If real AI output quality changes (model update, prompt drift), saved responses don't reflect this. The schema validation catches structural issues but not quality regression. Manual spot-checks against real AI recommended periodically. |
| Cost of recapture | Assumption | Recapturing saved responses costs one pipeline run (~$0.20). Infrequent and acceptable. |
| Frontend unit tests | Gap | This file focuses on pipeline/backend tests. Frontend component tests (React Testing Library) are not specified. For MVP, E2E tests cover critical UI paths. Add component tests post-MVP for complex components like Review & Confirm table and skill tag editor. |
| Load testing | Assumption | Not in scope. The app targets single-teacher usage with classes of 20-35. No concurrent user load testing needed for MVP. |  
