▸ TodoWrite  
  ← result received  
## Overview

CSV processing is the no-AI alternative to image extraction. The teacher uploads a CSV or Excel file, the frontend parses it, the teacher confirms column mapping, and the system builds an `ExtractionResult` from the structured data. All parsing and normalization happens client-side. The Cloud Function (`runCsvExtraction`) receives already-structured data, runs roster matching, and writes results to the assignment's `pipelineState`.

Because there is no AI call, CSV processing is near-instant and the teacher goes directly to Review & Confirm without a processing wait screen.

## Dependencies

- `02_Database_Schema.md` -- assignment document, `pipelineState` writes
- `03_Cloud_Functions.md` -- `runCsvExtraction` callable function
- `05_Shared_Schemas.md` -- `ExtractionResultSchema` (output shape is identical to image extraction)
- `09_Upload_Flow.md` -- parsing and column mapping UI live on the Upload screen
- `12_Roster_Matching.md` -- roster matching runs after CSV data is structured

## Parsing Pipeline

All steps run in the browser. No server round-trip until the final "Process" action.

```
File selected
  -> Detect format (CSV vs XLSX)
  -> Parse raw data
  -> Detect delimiter + encoding (CSV only)
  -> Extract headers + rows
  -> Auto-map columns
  -> Teacher confirms/adjusts mapping
  -> Normalize scores
  -> Build ExtractionResult
  -> Send to Cloud Function
```

### Format Detection

By file extension:
- `.csv`, `.tsv` -- text-based, needs delimiter detection
- `.xlsx`, `.xls` -- binary Excel, parsed with client-side library (SheetJS/xlsx)

### CSV Text Parsing

**Delimiter detection:** Sample the first 5 lines. Count occurrences of comma, tab, and semicolon. The delimiter with the most consistent count across lines wins. Ties favor comma.

**Encoding detection:** Try UTF-8 first. If decoding produces garbled characters (replacement characters), fall back to Windows-1252, then Latin-1. Strip BOM (byte order mark) if present.

**Quote handling:** Standard RFC 4180 rules. Fields containing the delimiter, newlines, or quotes are wrapped in double quotes. Escaped quotes are doubled (`""`).

### Excel Parsing

Use SheetJS (xlsx) library for client-side parsing.

**Multi-sheet handling:** If the workbook contains multiple sheets, show a dropdown: "This file has {N} sheets. Which one contains your data?" Default to the first sheet.

**Merged cells:** Flatten merged cells by copying the value to all cells in the merge range. Flag the column mapping step with a warning: "Merged cells detected. Please verify the data looks correct."

**Formulas:** Read computed values, not formulas. If a cell contains `=SUM(B2:B11)`, extract the calculated result.

## Column Mapping

### Auto-Detection

Scan header row (first row) for patterns. Match case-insensitively.

| Column Purpose | Header Patterns |
|----------------|-----------------|
| Student name (full) | "name", "student", "student name", "nombre", "full name" |
| First name | "first", "first name", "given name", "fname" |
| Last name | "last", "last name", "surname", "family name", "lname" |
| Total score | "score", "total", "grade", "points", "mark", "puntos", "result" |
| Per-question answer | Regex: `q\d+`, `question\s*\d+`, `#\d+`, or bare numbers "1", "2", "3" |

**No header row:** If the first row looks like data (contains names or numbers rather than labels), prompt the teacher: "No header row detected. Is row 1 a header or data?" If data, treat all columns as unmapped and require manual mapping.

### Manual Override

Each column gets a dropdown with options:
- "Student Name"
- "First Name"
- "Last Name"
- "Total Score"
- "Question 1 Answer", "Question 2 Answer", ... (numbered sequentially)
- "Ignore"

Auto-detected mappings are pre-selected. Teacher can change any mapping.

**Validation rules:**
- Exactly one name column (full name) OR one first name + one last name column required
- At least one data column required (total score or per-question answers)
- Duplicate mappings not allowed (cannot map two columns to "Total Score")

### Name Column Handling

**Single "Name" column:** Parse into first and last name using the same logic as roster entry (see `07_Class_Roster_Management.md`) -- split on last space.

**Separate first/last columns:** Use directly. Concatenate for display.

**Missing names:** If a row has data but no name (empty name cell), include it in the extraction result with `rawName: ""`. This becomes an unmatched entry on Review & Confirm for the teacher to assign manually.

## Score Normalization

Scores must be normalized to a 0-1 scale. The system detects the format per cell and normalizes.

### Format Detection and Conversion

| Format | Example | Detection | Normalization |
|--------|---------|-----------|---------------|
| Fraction | "8/10" | Contains "/" with numbers on both sides | Divide: 8/10 = 0.8 |
| Percentage | "80%" | Ends with "%" | Divide by 100: 0.8 |
| Decimal | "0.8" | Number between 0 and 1 (inclusive) | Use directly |
| Points | "16" | Number > 1, no "/" or "%" | Divide by `assignment.totalPoints`. Requires totalPoints from Setup. |
| Letter grade | "B+" | Matches letter grade pattern | Requires grade scale (see below) |
| Empty | "" | Empty cell | Do not normalize. Flag as "Absent or zero?" |

### Mixed Format Handling

If the score column contains multiple formats, show a preview callout per format detected (see `09_Upload_Flow.md` for the UI). Each cell is normalized independently based on its detected format.

**Ambiguous bare numbers:** A value like "8" is ambiguous -- is it 8 out of 10 (80%) or 8 out of 20 (40%)? Resolution:
- If `assignment.totalPoints` is set: divide by total points
- If not set: prompt teacher with the interpretation: "Found bare numbers in score column. What's the total possible?" with a number input

### Letter Grade Scale

If letter grades detected, show an inline form for the teacher to define the scale:

| Grade | Min % |
|-------|-------|
| A+ | 97 |
| A | 93 |
| A- | 90 |
| B+ | 87 |
| ... | ... |

Pre-fill with standard US 10-point scale. Teacher can adjust. Each letter grade normalizes to the midpoint of its range (e.g., B+ = 87-89, midpoint = 0.88).

## Building the ExtractionResult

After mapping and normalization, the frontend constructs an `ExtractionResult` identical in shape to the image extraction output. This ensures the rest of the pipeline (roster matching, validation, grading, analysis) works identically regardless of input source.

| Field | CSV Source |
|-------|-----------|
| `sourceType` | `"csv"` |
| `extractedStudents[].rawName` | From name column(s) |
| `extractedStudents[].nameConfidence` | `1.0` (text data, no OCR ambiguity) |
| `extractedStudents[].answers[]` | From per-question columns, if mapped |
| `extractedStudents[].answers[].confidence` | `1.0` |
| `extractedStudents[].totalScore.raw` | Original cell value |
| `extractedStudents[].totalScore.normalized` | Computed normalized value |
| `extractedStudents[].totalScore.confidence` | `1.0` for unambiguous formats, `0.8` for bare numbers requiring totalPoints |
| `extractedStudents[].flags` | Empty unless ambiguous values detected |
| `metadata.totalExtracted` | Row count |
| `metadata.imagesProcessed` | `0` |

**Key difference from image extraction:** All confidence scores are high (1.0 or near it) because the data is typed text, not OCR. The Review & Confirm screen will have fewer yellow/red rows. Review still happens to catch roster matching issues and empty cells.

## Cloud Function: runCsvExtraction

The frontend sends the constructed `ExtractionResult` to the `runCsvExtraction` callable function. The function:

1. Validates the payload against `ExtractionResultSchema`
2. Writes it to `assignment.pipelineState.extractionResult`
3. Runs roster matching (see `12_Roster_Matching.md`)
4. Writes `RosterMatchResult` to `assignment.pipelineState.rosterMatchResult`
5. Updates assignment `status` to `"needs_review"`

No AI call. Total function execution time: under 2 seconds.

## Edge Cases

### Structural Problems

| Condition | Handling |
|-----------|----------|
| Completely empty file | Reject: "This file appears to be empty." |
| Single column only | If it contains names, accept but warn: "No score data found. Only student names will be imported." |
| Thousands of rows | Warn if > 100 rows: "This file has {N} rows. Expected ~{rosterSize} for your class." First 200 rows loaded; excess truncated with warning. |
| Header row repeated mid-file | Detect duplicate of row 1 pattern, skip it silently. |

### Data Quality

| Condition | Handling |
|-----------|----------|
| Empty cell in score column | Do not assume zero. Flag: "Empty cell for {name}. Mark as: Absent / Zero / Skip." Teacher resolves on Review & Confirm. |
| Non-numeric score value | Flag the cell. Show original value and ask for manual interpretation. |
| Negative score | Flag: "{name} has a negative score ({value}). Verify this is correct." Allow it (some teachers use negative for penalties). |
| Score exceeding total points | Flag: "{name} scored {value} out of {total}. This exceeds the maximum." Allow it (extra credit is possible). |
| Duplicate student names | Include both rows. Roster matching may flag them. Teacher resolves on Review & Confirm. |

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Client-side parsing security | Assumption | CSV/XLSX parsing happens entirely in the browser. No untrusted file is sent to the server unprocessed. SheetJS handles the binary Excel format safely. |
| Large file performance | Assumption | Files under 5MB parse quickly client-side. The 5MB upload limit (see `09_Upload_Flow.md`) effectively caps the data volume. |
| International number formats | Gap | Some locales use comma as decimal separator ("8,5" instead of "8.5"). No locale-aware parsing in MVP. The teacher can manually correct on Review & Confirm. Add locale detection post-MVP. |
| Per-question answers in CSV | Assumption | If per-question columns are mapped, the values are treated as raw answers (e.g., "A", "C", "True"). For Path B, these feed into grading. For Path A, they are informational and enable skill analysis. |
| CSV not uploaded to Storage | Assumption | The raw CSV file is not stored. Only the parsed `ExtractionResult` persists. If the teacher needs to re-process, they re-upload the file. This avoids Storage costs and simplifies cleanup. |  
