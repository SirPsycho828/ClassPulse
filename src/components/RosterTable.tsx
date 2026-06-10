import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/ui/Toast';
import { generateDisplayNames } from '@/components/ClassForm';
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentDoc {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  knownAliases: string[];
}

interface RosterTableProps {
  classId: string;
}

// ---------------------------------------------------------------------------
// Confirmation Dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-[--radius-md] shadow-xl border border-border max-w-sm w-full mx-4 p-5">
        <p className="text-sm text-foreground mb-5">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted rounded-[--radius-md] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-[--radius-md] transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alias Tag
// ---------------------------------------------------------------------------

function AliasTag({
  alias,
  onRemove,
}: {
  alias: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs rounded-full px-2 py-0.5">
      {alias}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground/70 hover:text-destructive"
        title={`Remove alias "${alias}"`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// RosterTable
// ---------------------------------------------------------------------------

export function RosterTable({ classId }: RosterTableProps) {
  const { toast } = useToast();

  // State
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<StudentDoc | null>(null);
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Real-time student subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const studentsRef = collection(db, 'classes', classId, 'students');
    const unsub = onSnapshot(studentsRef, (snap) => {
      const data = snap.docs
        .map((d) => ({
          id: d.id,
          firstName: (d.data().firstName as string) ?? '',
          lastName: (d.data().lastName as string) ?? '',
          displayName: (d.data().displayName as string) ?? '',
          knownAliases: (d.data().knownAliases as string[]) ?? [],
        }))
        .sort((a, b) => {
          const aName = `${a.lastName} ${a.firstName}`.toLowerCase();
          const bName = `${b.lastName} ${b.firstName}`.toLowerCase();
          return aName.localeCompare(bName);
        });
      setStudents(data);
      setLoading(false);
    });
    return () => unsub();
  }, [classId]);

  // ---------------------------------------------------------------------------
  // Start editing
  // ---------------------------------------------------------------------------
  function startEdit(student: StudentDoc) {
    setEditingId(student.id);
    setEditFirstName(student.firstName);
    setEditLastName(student.lastName);
    setEditDisplayName(student.displayName);
    setEditAliases(student.knownAliases.join(', '));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditFirstName('');
    setEditLastName('');
    setEditDisplayName('');
    setEditAliases('');
  }

  // ---------------------------------------------------------------------------
  // Save edit
  // ---------------------------------------------------------------------------
  async function saveEdit() {
    if (!editingId) return;
    if (!editFirstName.trim()) {
      toast('error', 'First name is required.');
      return;
    }

    setSaving(true);
    try {
      const aliases = editAliases
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      // Regenerate display name considering all students
      const allStudents = students.map((s) =>
        s.id === editingId
          ? { firstName: editFirstName.trim(), lastName: editLastName.trim() }
          : { firstName: s.firstName, lastName: s.lastName }
      );
      const displayNames = generateDisplayNames(allStudents);
      const idx = students.findIndex((s) => s.id === editingId);
      const newDisplayName = editDisplayName.trim() || displayNames[idx] || `${editFirstName.trim()} ${editLastName.trim()}`;

      await updateDoc(doc(db, 'classes', classId, 'students', editingId), {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        displayName: newDisplayName,
        knownAliases: aliases,
      });

      cancelEdit();
      toast('success', 'Student updated.');
    } catch {
      toast('error', 'Failed to update student.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Add student
  // ---------------------------------------------------------------------------
  async function handleAddStudent() {
    if (!newFirstName.trim()) {
      toast('error', 'First name is required.');
      return;
    }

    setSaving(true);
    try {
      // Generate display name considering existing students
      const allStudents = [
        ...students.map((s) => ({ firstName: s.firstName, lastName: s.lastName })),
        { firstName: newFirstName.trim(), lastName: newLastName.trim() },
      ];
      const displayNames = generateDisplayNames(allStudents);
      const newDisplayName = displayNames[displayNames.length - 1];

      await addDoc(collection(db, 'classes', classId, 'students'), {
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        displayName: newDisplayName,
        knownAliases: [],
        createdAt: serverTimestamp(),
      });

      setNewFirstName('');
      setNewLastName('');
      setAddingStudent(false);
      toast('success', 'Student added.');
    } catch {
      toast('error', 'Failed to add student.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Remove student
  // ---------------------------------------------------------------------------
  async function handleRemoveStudent(student: StudentDoc) {
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'classes', classId, 'students', student.id));
      setConfirmRemove(null);
      toast('success', `${student.firstName} ${student.lastName} removed from roster.`);
    } catch {
      toast('error', 'Failed to remove student.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Remove alias inline (when not in full edit mode)
  // ---------------------------------------------------------------------------
  async function removeAlias(student: StudentDoc, aliasToRemove: string) {
    try {
      const updated = student.knownAliases.filter((a) => a !== aliasToRemove);
      await updateDoc(doc(db, 'classes', classId, 'students', student.id), {
        knownAliases: updated,
      });
    } catch {
      toast('error', 'Failed to remove alias.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-muted rounded" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Confirmation dialog */}
      {confirmRemove && (
        <ConfirmDialog
          message={`Remove ${confirmRemove.firstName} ${confirmRemove.lastName} from roster? This won't delete their data from past analyses.`}
          onConfirm={() => handleRemoveStudent(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      <div className="border border-border rounded-[--radius-md] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Student Name</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Display Name</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Aliases</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const isEditing = editingId === student.id;

              if (isEditing) {
                return (
                  <tr key={student.id} className="border-b border-border/50 bg-primary/5">
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          placeholder="First"
                          className="w-1/2 px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        />
                        <input
                          type="text"
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          placeholder="Last"
                          className="w-1/2 px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Auto-generated"
                        className="w-full px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editAliases}
                        onChange={(e) => setEditAliases(e.target.value)}
                        placeholder="Comma-separated"
                        className="w-full px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={saving}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="p-1.5 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted rounded"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={student.id} className="border-b border-border/50 last:border-b-0">
                  <td className="px-3 py-2 text-foreground">
                    {student.firstName} {student.lastName}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{student.displayName}</td>
                  <td className="px-3 py-2">
                    {student.knownAliases.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {student.knownAliases.map((alias) => (
                          <AliasTag
                            key={alias}
                            alias={alias}
                            onRemove={() => removeAlias(student, alias)}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-border">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(student)}
                        className="p-1.5 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(student)}
                        className="p-1.5 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Add student inline row */}
            {addingStudent && (
              <tr className="border-b border-border/50 bg-success/5">
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      placeholder="First name"
                      autoFocus
                      className="w-1/2 px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    />
                    <input
                      type="text"
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-1/2 px-2 py-1 border border-input rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground/70 italic">Auto-generated</td>
                <td className="px-3 py-2 text-xs text-muted-foreground/70 italic">--</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={handleAddStudent}
                      disabled={saving}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                      title="Add"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingStudent(false);
                        setNewFirstName('');
                        setNewLastName('');
                      }}
                      className="p-1.5 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted rounded"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Empty state */}
            {students.length === 0 && !addingStudent && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground/70">
                  No students in this roster.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add student button */}
      {!addingStudent && (
        <button
          type="button"
          onClick={() => setAddingStudent(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Student
        </button>
      )}

      {/* Student count */}
      <p className="mt-2 text-xs text-muted-foreground/70">
        {students.length} student{students.length === 1 ? '' : 's'} in roster
      </p>
    </div>
  );
}
