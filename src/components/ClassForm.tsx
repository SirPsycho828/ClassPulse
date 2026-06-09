import { useRef, useState } from 'react';
import {
  collection,
  doc,
  writeBatch,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  Plus,
  FileSpreadsheet,
  AlertCircle,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedStudent {
  firstName: string;
  lastName: string;
  displayName: string;
}

interface ClassFormProps {
  onComplete: (classId: string) => void;
  onCancel?: () => void;
  editingClass?: { id: string; name: string; gradeLevel: string; subject: string };
}

// Legacy props interface used by SetupWizard
interface LegacyClassFormProps {
  onCreated: (classId: string, className: string, studentCount: number) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRADE_LEVELS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const SUBJECTS = ['Math', 'ELA', 'Science', 'Social Studies', 'Other'];

// ---------------------------------------------------------------------------
// Display name generation
// ---------------------------------------------------------------------------

export function generateDisplayNames(students: { firstName: string; lastName: string }[]): string[] {
  const names: string[] = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];

    if (!s.lastName) {
      names.push(s.firstName);
      continue;
    }

    const baseDisplay = `${s.firstName} ${s.lastName.charAt(0)}.`;

    // Find collisions: same first name AND same last initial
    const collisions = students
      .map((other, idx) => ({ other, idx }))
      .filter(
        ({ other, idx }) =>
          idx !== i &&
          other.firstName.toLowerCase() === s.firstName.toLowerCase() &&
          other.lastName.charAt(0).toLowerCase() === s.lastName.charAt(0).toLowerCase()
      );

    if (collisions.length === 0) {
      names.push(baseDisplay);
    } else {
      // Extend last name until unique among colliders
      const allSameName = [s, ...collisions.map((c) => c.other)];
      let charCount = 2;
      let resolved = false;

      while (charCount <= s.lastName.length && !resolved) {
        const prefix = s.lastName.slice(0, charCount).toLowerCase();
        const matchingSamePrefix = allSameName.filter(
          (other) =>
            other !== s &&
            other.lastName.slice(0, charCount).toLowerCase() === prefix
        );
        if (matchingSamePrefix.length === 0) {
          resolved = true;
        } else {
          charCount++;
        }
      }

      if (resolved && charCount <= s.lastName.length) {
        names.push(`${s.firstName} ${s.lastName.slice(0, charCount)}.`);
      } else {
        names.push(`${s.firstName} ${s.lastName}`);
      }
    }
  }

  return names;
}

function parseNames(raw: string): ParsedStudent[] {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsed = lines.map((line) => {
    const lastSpace = line.lastIndexOf(' ');
    if (lastSpace === -1) {
      return { firstName: line, lastName: '' };
    }
    return {
      firstName: line.slice(0, lastSpace).trim(),
      lastName: line.slice(lastSpace + 1).trim(),
    };
  });

  const displayNames = generateDisplayNames(parsed);

  return parsed.map((s, i) => ({
    ...s,
    displayName: displayNames[i],
  }));
}

function parseCSV(text: string): ParsedStudent[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));

  // Detect column layout
  const nameIdx = headers.findIndex((h) => h === 'name' || h === 'student' || h === 'student name');
  const firstIdx = headers.findIndex((h) => h === 'first' || h === 'first name' || h === 'firstname');
  const lastIdx = headers.findIndex((h) => h === 'last' || h === 'last name' || h === 'lastname');

  const dataRows = lines.slice(1);
  let parsed: { firstName: string; lastName: string }[];

  if (firstIdx !== -1 && lastIdx !== -1) {
    parsed = dataRows.map((row) => {
      const cols = row.split(',').map((c) => c.trim().replace(/"/g, ''));
      return {
        firstName: cols[firstIdx] ?? '',
        lastName: cols[lastIdx] ?? '',
      };
    });
  } else if (nameIdx !== -1) {
    parsed = dataRows.map((row) => {
      const cols = row.split(',').map((c) => c.trim().replace(/"/g, ''));
      const full = cols[nameIdx] ?? '';
      const lastSpace = full.lastIndexOf(' ');
      if (lastSpace === -1) {
        return { firstName: full, lastName: '' };
      }
      return {
        firstName: full.slice(0, lastSpace).trim(),
        lastName: full.slice(lastSpace + 1).trim(),
      };
    });
  } else {
    // Fallback: use first column as full name
    parsed = dataRows.map((row) => {
      const cols = row.split(',').map((c) => c.trim().replace(/"/g, ''));
      const full = cols[0] ?? '';
      const lastSpace = full.lastIndexOf(' ');
      if (lastSpace === -1) {
        return { firstName: full, lastName: '' };
      }
      return {
        firstName: full.slice(0, lastSpace).trim(),
        lastName: full.slice(lastSpace + 1).trim(),
      };
    });
  }

  // Filter out empty entries
  parsed = parsed.filter((s) => s.firstName.length > 0);

  const displayNames = generateDisplayNames(parsed);
  return parsed.map((s, i) => ({
    ...s,
    displayName: displayNames[i],
  }));
}

// ---------------------------------------------------------------------------
// ClassForm (full-featured version)
// ---------------------------------------------------------------------------

export function ClassForm({ onComplete, onCancel, editingClass }: ClassFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState(editingClass?.name ?? '');
  const [gradeLevel, setGradeLevel] = useState(editingClass?.gradeLevel ?? '');
  const [subject, setSubject] = useState(editingClass?.subject ?? '');
  const [customSubject, setCustomSubject] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editingClass;
  const effectiveSubject = subject === 'Other' ? customSubject : subject;

  // Roster warnings
  const rosterWarning =
    students.length > 0 && students.length < 5
      ? `Only ${students.length} student${students.length === 1 ? '' : 's'}. Is this the complete roster?`
      : students.length > 50
        ? 'This seems like a large class. Verify this is a single class.'
        : null;

  // ---------------------------------------------------------------------------
  // Parse roster from textarea
  // ---------------------------------------------------------------------------
  function handleParseNames() {
    const parsed = parseNames(rosterText);
    setStudents(parsed);
    setShowPreview(true);
  }

  // ---------------------------------------------------------------------------
  // CSV file upload
  // ---------------------------------------------------------------------------
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setStudents(parsed);
      setShowPreview(true);
    };
    reader.readAsText(file);

    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Inline edit in preview
  // ---------------------------------------------------------------------------
  function updateStudent(index: number, field: keyof ParsedStudent, value: string) {
    setStudents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      // Regenerate display names if first/last name changed
      if (field === 'firstName' || field === 'lastName') {
        const displayNames = generateDisplayNames(next);
        return next.map((s, i) => ({ ...s, displayName: displayNames[i] }));
      }

      return next;
    });
  }

  function removeStudent(index: number) {
    setStudents((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const displayNames = generateDisplayNames(next);
      return next.map((s, i) => ({ ...s, displayName: displayNames[i] }));
    });
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      toast('error', 'Class name is required.');
      return;
    }
    if (!gradeLevel) {
      toast('error', 'Please select a grade level.');
      return;
    }
    if (!effectiveSubject.trim()) {
      toast('error', 'Please select or enter a subject.');
      return;
    }
    if (!isEditing && students.length === 0) {
      toast('error', 'Please add at least one student to the roster.');
      return;
    }

    setSaving(true);

    try {
      if (isEditing) {
        // Update existing class document only (roster editing is done via RosterTable)
        const classRef = doc(db, 'classes', editingClass.id);
        await updateDoc(classRef, {
          name: name.trim(),
          gradeLevel,
          subject: effectiveSubject.trim(),
          updatedAt: serverTimestamp(),
        });
        onComplete(editingClass.id);
      } else {
        // Create new class + students in a single batch
        const batch = writeBatch(db);
        const classRef = doc(collection(db, 'classes'));

        batch.set(classRef, {
          teacherId: user.uid,
          name: name.trim(),
          gradeLevel,
          subject: effectiveSubject.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        for (const student of students) {
          const studentRef = doc(collection(db, 'classes', classRef.id, 'students'));
          batch.set(studentRef, {
            firstName: student.firstName,
            lastName: student.lastName,
            displayName: student.displayName,
            knownAliases: [],
            createdAt: serverTimestamp(),
          });
        }

        await batch.commit();
        toast('success', `Class "${name.trim()}" created with ${students.length} students.`);
        onComplete(classRef.id);
      }
    } catch (err) {
      console.error('Failed to save class:', err);
      toast('error', 'Failed to save class. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Class name */}
      <div>
        <label htmlFor="cf-className" className="block text-sm font-medium text-foreground mb-1">
          Class Name
        </label>
        <input
          id="cf-className"
          type="text"
          required
          placeholder='e.g., "5th Grade Math - Period 2"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Grade level + Subject row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cf-gradeLevel" className="block text-sm font-medium text-foreground mb-1">
            Grade Level
          </label>
          <select
            id="cf-gradeLevel"
            required
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-card"
          >
            <option value="">Select grade...</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g === 'K' ? 'Kindergarten' : `Grade ${g}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cf-subject" className="block text-sm font-medium text-foreground mb-1">
            Subject
          </label>
          <select
            id="cf-subject"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-card"
          >
            <option value="">Select subject...</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {subject === 'Other' && (
            <input
              type="text"
              placeholder="Enter subject"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="mt-2 w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          )}
        </div>
      </div>

      {/* Roster entry (only for new classes) */}
      {!isEditing && (
        <div>
          <label htmlFor="cf-roster" className="block text-sm font-medium text-foreground mb-1">
            Student Roster
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Paste student names (one per line) or upload a CSV file.
          </p>

          <textarea
            id="cf-roster"
            rows={8}
            placeholder={"Emma Johnson\nMarcus Rivera\nSophia Chen\n..."}
            value={rosterText}
            onChange={(e) => setRosterText(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />

          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={handleParseNames}
              disabled={!rosterText.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/90 disabled:text-muted-foreground/70 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Parse Names
            </button>

            <span className="text-border">|</span>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/90"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Upload CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Roster preview table */}
      {showPreview && students.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {students.length} student{students.length === 1 ? '' : 's'} found
            </span>
          </div>

          {rosterWarning && (
            <div className="flex items-start gap-2 mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-700">{rosterWarning}</p>
            </div>
          )}

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">First Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Display Name</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-b-0">
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={s.firstName}
                        onChange={(e) => updateStudent(i, 'firstName', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent hover:border-input focus:border-primary rounded text-sm focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={s.lastName}
                        onChange={(e) => updateStudent(i, 'lastName', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent hover:border-input focus:border-primary rounded text-sm focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={s.displayName}
                        onChange={(e) => updateStudent(i, 'displayName', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent hover:border-input focus:border-primary rounded text-sm focus:outline-none text-muted-foreground"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeStudent(i)}
                        className="p-1 text-muted-foreground/70 hover:text-destructive rounded"
                        title="Remove student"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving
            ? 'Saving...'
            : isEditing
              ? 'Save Changes'
              : `Create Class${students.length > 0 ? ` (${students.length} students)` : ''}`}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Default export: backward-compatible wrapper for SetupWizard
// ---------------------------------------------------------------------------

export default function ClassFormLegacy({ onCreated, onCancel }: LegacyClassFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [className, setClassName] = useState('');
  const [studentNames, setStudentNames] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmedName = className.trim();
    if (!trimmedName) return;

    const names = studentNames
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length === 0) {
      toast('error', 'Add at least one student name.');
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const classRef = doc(collection(db, 'classes'));

      // Parse names into first/last and generate display names
      const parsed = names.map((fullName) => {
        const lastSpace = fullName.lastIndexOf(' ');
        if (lastSpace === -1) {
          return { firstName: fullName, lastName: '' };
        }
        return {
          firstName: fullName.slice(0, lastSpace).trim(),
          lastName: fullName.slice(lastSpace + 1).trim(),
        };
      });

      const displayNames = generateDisplayNames(parsed);

      batch.set(classRef, {
        teacherId: user.uid,
        className: trimmedName,
        name: trimmedName,
        gradeLevel: '',
        subject: '',
        studentCount: names.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create student sub-documents with proper schema
      for (let i = 0; i < parsed.length; i++) {
        const studentRef = doc(collection(db, 'classes', classRef.id, 'students'));
        batch.set(studentRef, {
          firstName: parsed[i].firstName,
          lastName: parsed[i].lastName,
          displayName: displayNames[i],
          knownAliases: [],
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      toast('success', `Class "${trimmedName}" created with ${names.length} students.`);
      onCreated(classRef.id, trimmedName, names.length);
    } catch {
      toast('error', 'Failed to create class. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="className" className="block text-sm font-medium text-foreground mb-1">
          Class Name
        </label>
        <input
          id="className"
          type="text"
          required
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          placeholder="e.g., 5th Grade Math - Period 2"
          className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      <div>
        <label htmlFor="studentNames" className="block text-sm font-medium text-foreground mb-1">
          Student Names
          <span className="text-muted-foreground/70 font-normal ml-1">(one per line)</span>
        </label>
        <textarea
          id="studentNames"
          required
          rows={8}
          value={studentNames}
          onChange={(e) => setStudentNames(e.target.value)}
          placeholder={"John Smith\nJane Doe\nAlex Johnson"}
          className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y"
        />
        <p className="text-xs text-muted-foreground/70 mt-1">
          {studentNames.split('\n').filter((n) => n.trim()).length} student(s)
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground py-2 px-4 rounded-lg text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Class'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
