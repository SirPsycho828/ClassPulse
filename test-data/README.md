# Test Data CSVs

Upload these via **+ New Analysis** > choose **CSV / Spreadsheet** upload mode.

## CSV Formats

ClassPulse auto-detects the format:

- **Already Scored** (`*-scored.csv`): `Student Name, Score` columns only
- **Grade For Me** (default): `Student Name, Q1, Q2...` columns with an `ANSWER KEY` row

### Optional metadata rows (Grade For Me only)
- **QUESTION TEXT** — what each question asks (enables skill analysis)
- **POINTS** — per-question point values (defaults to 1 each if omitted)

CSVs with question text get full skill breakdowns. CSVs without get scores, distribution, and outliers only.

## Existing Classes

### Ms. Feezle's Class - 4th Period (14 students)
- `feezle-midterm-exam.csv` — Midterm, 15 questions, WITH question text
- `feezle-midterm-exam-scored.csv` — Midterm, Already Scored
- `feezle-chapter5-quiz.csv` — Chapter 5 Quiz, 10 questions, no question text
- `feezle-chapter6-quiz.csv` — Chapter 6 Quiz, 12 questions, weighted points

### 5th Grade Math - 2nd Period (7 students)
- `5thgrade-unit1-test.csv` — Unit 1, 8 questions, WITH question text + weighted points
- `5thgrade-unit1-test-scored.csv` — Unit 1, Already Scored
- `5thgrade-unit2-test.csv` — Unit 2, 10 questions, no question text
- `5thgrade-unit3-test.csv` — Unit 3, 10 questions, no question text

## New Classes (create first, then upload)

### 3rd Grade Reading - 1st Period
Roster: Emma Wilson, Lucas Brown, Sophia Garcia, Noah Martinez, Olivia Davis, Isabella Rodriguez, Liam Johnson, Mia Anderson, Ethan Taylor, Ava Thomas
- `3rdreading-vocab-test.csv` — Vocabulary, 8 questions, WITH question text
- `3rdreading-vocab-test-scored.csv` — Vocabulary, Already Scored
- `3rdreading-comprehension-quiz.csv` — Comprehension, 10 questions, no question text
- `3rdreading-midterm.csv` — Midterm, 10 questions, no question text

### 6th Grade Science - 3rd Period
Roster: Jackson Lee, Harper Kim, Aiden Nguyen, Riley Patel, Carter Singh, Zoey Chen, Mason Ali, Lily Okafor, Owen Brooks, Chloe Rivera, Elijah Foster, Nora Washington
- `6thscience-lab-report1.csv` — Lab Report #1, 12 questions, WITH question text + weighted points
- `6thscience-chapter-test.csv` — Chapter Test, 10 questions, no question text
- `6thscience-lab-report2.csv` — Lab Report #2, 10 questions, no question text
