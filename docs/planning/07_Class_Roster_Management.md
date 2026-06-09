## Overview

Classes and rosters are the foundation that the entire pipeline depends on. Roster names are the matching targets for extraction (see `12_Roster_Matching.md`), and class context (grade level, subject) informs AI prompts. A teacher creates a class during the Setup wizard when they first need one, and can edit it later from the Class Overview settings. Roster management is lightweight -- create, edit, remove students -- not a full student information system.

## Dependencies

- `02_Database_Schema.md` -- `classes/{classId}` and `classes/{classId}/students/{studentId}` collections
- `04_UI_Design_System.md` -- form patterns, table styles
- `08_Assignment_Setup.md` -- class creation is triggered from Setup when no classes exist
- `12_Roster_Matching.md` -- roster names and aliases are the matching targets

## Class Creation

### Entry Points

1. **Setup wizard** (primary): Step 1 of the Setup wizard is class selection. If the teacher has no classes, or clicks "Create New Class," the creation form appears inline within the wizard. See `08_Assignment_Setup.md`.
2. **Class Overview settings**: A gear icon on the Class Overview screen opens class settings, which includes a "Create New Class" option. This is the secondary path for teachers who want to add a class outside the analysis flow.

### Creation Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Class name | Text input | Yes | e.g., "5th Grade Math - Period 2" |
| Grade level | Dropdown | Yes | Options: K, 1-12. Free text fallback for edge cases (e.g., "K/1 combo"). |
| Subject | Dropdown with free text | Yes | Common options: Math, ELA, Science, Social Studies, Other. "Other" reveals a text input. |
| Roster | Textarea or CSV | Yes | See roster entry below |

### Roster Entry Methods

**Method A: Paste names (primary)**

A textarea where the teacher pastes student names, one per line. The system parses each line into first name and last name using the last space as the delimiter.

Parsing rules:
- "Emma Johnson" -> first: "Emma", last: "Johnson"
- "Emma Rose Johnson" -> first: "Emma Rose", last: "Johnson" (last space splits)
- "Emma" -> first: "Emma", last: "" (single name accepted, flagged for review)
- Blank lines ignored
- Leading/trailing whitespace trimmed

After parsing, show a preview table:

| First Name | Last Name | Display Name |
|------------|-----------|-------------|
| Emma | Johnson | Emma J. |
| Marcus | Rivera | Marcus R. |

`displayName` is auto-generated: first name + last initial with period. If two students share a first name and last initial (e.g., Maria G. and Maria G.), append enough of the last name to disambiguate: "Maria Gar." and "Maria Gom."

Teacher can edit any cell in the preview before confirming.

**Method B: CSV upload**

Accept a CSV or XLSX file with at minimum a name column. Auto-detect columns:
- Look for headers containing "name", "first", "last", "student"
- If a single "name" column: parse like the textarea method
- If separate "first" and "last" columns: use directly
- Fallback: show column mapping dropdown if auto-detection fails

Same preview table as Method A after parsing.

### Roster Size Validation

After parsing, display: "{N} students found."

Sanity checks:
- Fewer than 5 students: warning "Only {N} students. Is this the complete roster?"
- More than 50 students: warning "This seems like a large class. Verify this is a single class."
- Both are warnings, not blockers. The teacher can proceed.

## Class Editing

### Access Point

Gear icon on the Class Overview screen (see `17_Class_Overview.md`). Opens a settings panel or modal with:

1. **Class details**: edit name, grade level, subject
2. **Roster management**: add, edit, remove students

### Editing Class Details

Simple form pre-filled with current values. Save updates the `classes/{classId}` document. Changes to grade level or subject do not retroactively affect past analyses -- they apply to future analysis prompts only.

### Roster Management

Table of current students with inline actions:

| Student | Display Name | Aliases | Actions |
|---------|-------------|---------|---------|
| Emma Johnson | Emma J. | Emmy | Edit, Remove |
| Marcus Rivera | Marcus R. | -- | Edit, Remove |

**Add Student:**
- "Add Student" button below the table
- Inline row appears with first name, last name fields
- Display name auto-generated on save
- `knownAliases` starts empty

**Edit Student:**
- Click "Edit" on any row
- Row becomes editable: first name, last name, display name
- Display name can be manually overridden (auto-generation is a default, not enforced)
- `knownAliases` shown as comma-separated tags, editable

**Remove Student:**
- Click "Remove" on any row
- Confirmation: "Remove {name} from roster? This won't delete their data from past analyses."
- Removal deletes the student document from the subcollection
- Past analyses retain the student's data (the analysis document stores names, not references)

### Alias Management

`knownAliases` on each student document accumulates over time. Two sources:

1. **Automatic**: When a teacher corrects a name match on Review & Confirm and checks "Remember this" (the `savedAsAlias` flag), the corrected name is added to the student's aliases. See `13_Review_Confirm.md`.
2. **Manual**: Teacher edits aliases directly in roster management.

Display aliases as removable tag chips. Teacher can add new aliases or remove incorrect ones.

Aliases are used during roster matching (see `12_Roster_Matching.md`) to improve future extraction accuracy. Example: if the teacher corrects "Bobby K." to "Robert Kim" and saves the alias, future extractions of "Bobby K." auto-match to Robert Kim.

## Data Flow

### Create Class

1. Teacher fills out creation form with roster
2. Frontend creates `classes/{classId}` document with class details
3. Frontend creates `classes/{classId}/students/{studentId}` documents in a batch write (one per student)
4. On success, class appears in the Setup wizard class dropdown

### Edit Class

1. Teacher modifies fields in the settings panel
2. Frontend updates the `classes/{classId}` document
3. For roster changes: individual student document creates/updates/deletes
4. No cascade to existing analyses -- they store denormalized snapshots

### Class Deletion

Not available in MVP. A teacher cannot delete a class from the UI. If a class was created by mistake, the teacher creates a new one and ignores the old one. Deletion requires careful handling of associated assignments and analyses -- deferred to post-MVP.

## Display Name Generation

Auto-generation logic for `displayName`:

1. Start with "{firstName} {lastInitial}." (e.g., "Emma J.")
2. Check for collisions within the same class roster
3. If collision: extend last name until unique
   - "Maria G." collides -> "Maria Gar." and "Maria Gom."
   - If still collides (rare): use full last name "Maria Garcia" and "Maria Gomez"
4. Single-name students: use the single name as display name

Display names are regenerated when students are added or removed (to handle new collisions). Teacher can always override manually.

## Class Selection (in Setup Wizard)

When the teacher starts a new analysis, the first step is selecting a class. See `08_Assignment_Setup.md` for the full Setup flow. The class dropdown:

- Populated from `classes` collection where `teacherId == auth.uid`
- Sorted alphabetically by class name
- Shows student count: "5th Grade Math - Period 2 (28 students)"
- "Create New Class" option at the bottom of the dropdown
- If teacher has only one class, it is pre-selected

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Class deletion | Gap | Not in MVP. Teacher cannot delete a class. Low risk since unused classes are harmless. |
| Roster import from SIS | Gap | No integration with student information systems (PowerSchool, Clever, etc.). Manual entry only. |
| Student transfer mid-semester | Assumption | Add the new student via roster edit. They appear as "absent" on past analyses (no retroactive data). Removing a transferred student does not affect past analyses. |
| Maximum roster size | Assumption | No hard limit enforced. The spec targets 20-35 students. Pipeline and UI designed for up to ~50. Beyond that, performance is untested. |
| Duplicate name detection | Assumption | No enforcement. If a teacher adds two "Emma Johnson" entries, both exist. Display name generation handles the collision. The teacher is expected to notice during the preview. |
| Class archiving | Gap | No archive/hide mechanism for past-semester classes. They remain in the dropdown. Post-MVP: add an "archived" flag and filter. See `23_Future_Features.md`. |  
