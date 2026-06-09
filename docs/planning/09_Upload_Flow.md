▸ TodoWrite  
  ← result received  
## Overview

The Upload screen accepts teacher data -- either photos/scans of student papers or a CSV/spreadsheet file. Which variant is shown depends on the upload mode selected during Setup (see `08_Assignment_Setup.md`). Both variants end by triggering the extraction pipeline and navigating to Review & Confirm (see `13_Review_Confirm.md`).

Route: `/analysis/{assignmentId}/upload`

## Dependencies

- `02_Database_Schema.md` -- assignment document (reads `sourceType`, writes `imageUrls` and `status`)
- `04_UI_Design_System.md` -- drag-drop zone styling, progress indicators
- `08_Assignment_Setup.md` -- creates the assignment document before this screen loads
- `10_Image_Extraction.md` -- `runExtraction` Cloud Function triggered from image path
- `11_CSV_Processing.md` -- CSV parsing and column mapping happen on this screen
- `13_Review_Confirm.md` -- destination after extraction completes

## Image Upload Variant

Shown when `assignment.sourceType == "image"`.

### Drop Zone

A large drag-and-drop zone centered on the screen. Also supports click-to-browse.

- Accepted formats: JPEG, PNG, HEIC/HEIF (common iPhone format), WebP
- Max file size per image: 10MB
- Max images per assignment: 30
- Guidance text inside the zone: "Drag photos of student papers here, or click to browse"
- Secondary guidance below: "For best results: good lighting, flat paper, 2-4 student papers per photo"

### Thumbnail Strip

As images upload, a horizontal strip of thumbnails appears below the drop zone. Each thumbnail shows:

- Image preview (small square crop)
- Upload progress ring around the thumbnail (while uploading)
- Green check overlay when upload completes
- Red X with "Retry" on failure
- Remove button (small X) to delete an uploaded image

The strip scrolls horizontally if more images than fit the viewport.

### Count Indicator

Below the thumbnail strip:

```
12 images uploaded  |  ~28 students expected (based on roster)
```

The expected student count comes from the roster size of the selected class. This helps the teacher gauge whether they have captured everyone. It is informational only -- the teacher can proceed with any number of images.

### Upload Mechanics

1. Teacher drops or selects files
2. Frontend uploads each file to Firebase Storage at `uploads/{teacherId}/{assignmentId}/{filename}`
3. Each upload runs in parallel (up to 3 concurrent uploads to avoid saturating the connection)
4. On completion, the Storage download URL is added to the `imageUrls` array on the assignment document
5. Failed uploads show a retry button on the thumbnail. Teacher can also remove and re-add.

**Partial upload recovery:** If the teacher navigates away and returns (assignment status is still `"uploading"`), previously uploaded images are shown in the thumbnail strip by reading `imageUrls` from the assignment document. The teacher can add more or proceed.

### Start Extraction

"Start Extraction" primary button below the thumbnails. Disabled until at least 1 image has uploaded successfully.

On click:
1. Button changes to loading state
2. Frontend calls `runExtraction` Cloud Function with `assignmentId`
3. Assignment status updates to `"extracting"`
4. Navigate to processing view (see Processing State section below)

### Answer Key Image (Path B Sub-Step)

For Path B assignments where the teacher chose to upload an answer key image (see `08_Assignment_Setup.md`), the answer key image was already handled during Setup Step 3. By the time the teacher reaches the Upload screen, the answer key is confirmed and stored on the assignment document.

The Upload screen only handles student paper uploads.

## CSV Upload Variant

Shown when `assignment.sourceType == "csv"`.

### File Drop Zone

Same drag-and-drop pattern as image mode but accepts:
- CSV files (.csv)
- Excel files (.xlsx, .xls)
- Tab-separated files (.tsv)
- Max file size: 5MB

Single file only. If the teacher drops multiple files, show: "Please upload one file at a time."

### Processing Steps

After file selection, the CSV is processed client-side (no Cloud Function needed):

**Step 1: Parse**
- Detect delimiter (comma, tab, semicolon) by sampling first 5 lines
- Detect encoding (UTF-8, Latin-1, Windows-1252), strip BOM if present
- For XLSX: read with a client-side library, handle multi-sheet by showing sheet names and letting teacher pick

**Step 2: Preview**
Display the first 5 rows in a table with detected headers.

**Step 3: Column Mapping**
Auto-detect column purposes using header text matching:

| Purpose | Header Patterns |
|---------|----------------|
| Student name | "name", "student", "nombre", "first name", "last name" |
| Score / total | "score", "total", "grade", "points", "mark", "puntos" |
| Per-question answers | "q1", "question 1", "q2", etc. or numeric headers |

Each column gets a dropdown to override the auto-detection:
- "Student Name"
- "Total Score"
- "Question {N} Answer"
- "Ignore this column"

If separate "First Name" and "Last Name" columns detected, map both.

**Step 4: Format Detection**
Scan the score column for mixed formats. If found (e.g., "8/10" and "80%" in the same column), show a callout:

```
Mixed score formats detected:
  "8/10" -> interpreted as 80%
  "B+"   -> needs grade scale (provide below)
  "85%"  -> interpreted as 85%
```

Letter grades require the teacher to provide a conversion scale (A=93+, B=83+, etc.) via a small inline form. If no letter grades detected, skip this.

**Step 5: Row Count Check**
Compare row count against roster size:
- Match: "28 rows found, matching your roster of 28 students."
- Mismatch: "42 rows found, but your roster has 28 students. May contain duplicates or extra data."
- Fewer: "20 rows found. 8 students may be missing."

Warnings only, not blockers.

### Process Button

"Process" primary button. On click:
1. Frontend normalizes all scores to 0-1 scale
2. Builds `ExtractionResult` from parsed/mapped data
3. Calls `runCsvExtraction` Cloud Function with `assignmentId` and the structured data
4. Function runs roster matching and writes results to `pipelineState`
5. Navigate to Review & Confirm

CSV processing is near-instant (no AI call), so there is no separate processing screen. The teacher goes directly to Review & Confirm.

## Processing State (Image Path Only)

After "Start Extraction" is clicked, the teacher sees a processing view while the Cloud Function runs.

```
+-------------------------------------------+
|                                           |
|    Analyzing student papers...            |
|                                           |
|    Processing images       [check]        |
|    Extracting student data [check]        |
|    Matching to roster      [spinner]      |
|                                           |
|    Usually takes 15-30 seconds            |
|                                           |
+-------------------------------------------+
```

- Steps update in real-time by listening to the assignment document's `status` field (Firestore onSnapshot listener)
- Each step shows a check mark when complete, spinner for current step
- Time estimate shown below the steps
- On completion (`status` changes to `"needs_review"`), auto-navigate to Review & Confirm

**If the teacher closes the browser:** Processing continues server-side. When the teacher returns and clicks the assignment on the Dashboard, they land on:
- Review & Confirm (if processing finished)
- Processing view (if still running)
- Error state (if failed)

## Error Handling

### Upload Failures

| Scenario | Handling |
|----------|----------|
| Single image fails | Red X on thumbnail, "Retry" button. Other uploads unaffected. |
| Network drops mid-batch | Pause remaining uploads. "Connection lost. Retry {N} remaining?" |
| File too large | Reject immediately with inline message: "This image is over 10MB. Try a lower resolution." |
| Wrong file type | Reject with: "Unsupported format. Please use JPEG, PNG, or HEIC." |

### Extraction Failures

| Scenario | Handling |
|----------|----------|
| Cloud Function timeout | Assignment status set to `"error"`. Show: "Analysis took too long. Try uploading fewer images or re-take blurry photos." with "Retry" button. |
| AI response parse failure | Status set to `"error"`. Show: "Couldn't process these images. Try re-uploading or switch to CSV." |
| Partial extraction | Not an error. Partial results go to Review & Confirm where unextracted students show as red rows for manual entry. |

### CSV Failures

| Scenario | Handling |
|----------|----------|
| Unparseable file | "Couldn't read this file. Ensure it's a CSV or Excel file." |
| No name column detected | Force manual column mapping. No auto-advance past Step 3. |
| Empty file | "This file appears to be empty." |

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| HEIC conversion | Assumption | Modern browsers handle HEIC display. Firebase Storage accepts HEIC. The vision AI model must accept HEIC or the Cloud Function converts to JPEG before sending. Verify with the chosen extraction model. |
| Image compression | Gap | No client-side compression before upload. Large phone photos (5-8MB each) upload at full size. Consider client-side resize to max 2048px on longest edge if upload times are problematic. |
| XLSX library | Assumption | A client-side library (e.g., SheetJS/xlsx) handles Excel parsing. Adds to bundle size. Acceptable since CSV upload is a core feature. |
| Multi-sheet Excel | Assumption | Show sheet names in a dropdown, teacher picks one. Default to first sheet. |
| Re-upload after extraction | Gap | If the teacher wants to add more images after extraction ran, they would need to re-trigger extraction. No "add more images" flow post-extraction in MVP. The teacher can use the "Retry" option which returns to the upload screen. |
| Storage cleanup | Gap | Failed or abandoned uploads leave orphaned files in Storage. No cleanup mechanism in MVP. Add a scheduled function to purge orphaned uploads post-MVP. |  
