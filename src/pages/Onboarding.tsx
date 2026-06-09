import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { generateDisplayNames } from '@/components/ClassForm';
import {
  ArrowRight,
  ArrowLeft,
  FileSpreadsheet,
  Plus,
  AlertCircle,
  X,
  Loader2,
  GraduationCap,
  Users,
  Check,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface ParsedStudent {
  firstName: string;
  lastName: string;
  displayName: string;
}

const GRADE_LEVELS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const SUBJECTS = ['Math', 'ELA', 'Science', 'Social Studies', 'Other'];

// ---------------------------------------------------------------------------
// Name parsing (reused from ClassForm)
// ---------------------------------------------------------------------------

function parseNames(raw: string): ParsedStudent[] {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const parsed = lines.map(line => {
    const lastSpace = line.lastIndexOf(' ');
    if (lastSpace === -1) return { firstName: line, lastName: '' };
    return { firstName: line.slice(0, lastSpace).trim(), lastName: line.slice(lastSpace + 1).trim() };
  });
  const displayNames = generateDisplayNames(parsed);
  return parsed.map((s, i) => ({ ...s, displayName: displayNames[i] }));
}

function parseCSV(text: string): ParsedStudent[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'student' || h === 'student name');
  const firstIdx = headers.findIndex(h => h === 'first' || h === 'first name' || h === 'firstname');
  const lastIdx = headers.findIndex(h => h === 'last' || h === 'last name' || h === 'lastname');

  const dataRows = lines.slice(1);
  let parsed: { firstName: string; lastName: string }[];

  if (firstIdx !== -1 && lastIdx !== -1) {
    parsed = dataRows.map(row => {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
      return { firstName: cols[firstIdx] ?? '', lastName: cols[lastIdx] ?? '' };
    });
  } else if (nameIdx !== -1) {
    parsed = dataRows.map(row => {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
      const full = cols[nameIdx] ?? '';
      const lastSpace = full.lastIndexOf(' ');
      if (lastSpace === -1) return { firstName: full, lastName: '' };
      return { firstName: full.slice(0, lastSpace).trim(), lastName: full.slice(lastSpace + 1).trim() };
    });
  } else {
    parsed = dataRows.map(row => {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
      const full = cols[0] ?? '';
      const lastSpace = full.lastIndexOf(' ');
      if (lastSpace === -1) return { firstName: full, lastName: '' };
      return { firstName: full.slice(0, lastSpace).trim(), lastName: full.slice(lastSpace + 1).trim() };
    });
  }

  parsed = parsed.filter(s => s.firstName.length > 0);
  const displayNames = generateDisplayNames(parsed);
  return parsed.map((s, i) => ({ ...s, displayName: displayNames[i] }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Onboarding() {
  const { user, teacher } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);

  // Step 1: Class details
  const [className, setClassName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');

  // Step 2: Student roster
  const [rosterText, setRosterText] = useState('');
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveSubject = subject === 'Other' ? customSubject : subject;

  const rosterWarning =
    students.length > 0 && students.length < 5
      ? `Only ${students.length} student${students.length === 1 ? '' : 's'}. Is this the complete roster?`
      : students.length > 50
        ? 'This seems like a large class. Verify this is a single class.'
        : null;

  // Step 1 validation
  const step1Valid = className.trim() && gradeLevel && effectiveSubject.trim();

  // ---------------------------------------------------------------------------
  // Roster actions
  // ---------------------------------------------------------------------------

  function handleParseNames() {
    const parsed = parseNames(rosterText);
    setStudents(parsed);
    setShowPreview(true);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setStudents(parsed);
      setShowPreview(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function updateStudent(index: number, field: keyof ParsedStudent, value: string) {
    setStudents(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'firstName' || field === 'lastName') {
        const displayNames = generateDisplayNames(next);
        return next.map((s, i) => ({ ...s, displayName: displayNames[i] }));
      }
      return next;
    });
  }

  function removeStudent(index: number) {
    setStudents(prev => {
      const next = prev.filter((_, i) => i !== index);
      const displayNames = generateDisplayNames(next);
      return next.map((s, i) => ({ ...s, displayName: displayNames[i] }));
    });
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    if (!user) return;

    if (students.length === 0) {
      toast('error', 'Add at least one student to the roster.');
      return;
    }

    setSaving(true);
    try {
      // Create the class document first — Firestore security rules for the
      // students subcollection use get() on the parent class doc, which must
      // already exist before students can be written.
      const classRef = doc(collection(db, 'classes'));
      await setDoc(classRef, {
        teacherId: user.uid,
        name: className.trim(),
        gradeLevel,
        subject: effectiveSubject.trim(),
        studentCount: students.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const batch = writeBatch(db);
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
      toast('success', `Welcome! "${className.trim()}" is ready with ${students.length} students.`);
      navigate('/dashboard');
    } catch {
      toast('error', 'Failed to create class. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step indicators
  // ---------------------------------------------------------------------------

  const steps = [
    { label: 'Class Details', icon: GraduationCap },
    { label: 'Add Students', icon: Users },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <span className="font-heading text-xl font-bold text-primary tracking-tight">ClassPulse</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-8">
        {/* Welcome */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-heading text-foreground">
            Welcome{teacher?.displayName ? `, ${teacher.displayName.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Let's set up your first class so you can start analyzing student work.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.label} className="flex items-center gap-3">
                {i > 0 && (
                  <div className={`w-12 h-px ${isDone ? 'bg-primary' : 'bg-border'}`} />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isDone
                        ? 'bg-primary text-primary-foreground'
                        : isActive
                          ? 'bg-primary/10 text-primary border-2 border-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`text-sm font-medium hidden sm:block ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="w-full max-w-2xl bg-card border border-border rounded-[--radius-lg] shadow-[--shadow-sm] p-6 sm:p-8">

          {/* Step 1: Class Details */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold font-heading text-foreground">Create Your Class</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Tell us about the class you'll be analyzing.
                </p>
              </div>

              <div>
                <label htmlFor="ob-className" className="block text-sm font-medium text-foreground mb-1.5">
                  Class Name
                </label>
                <input
                  id="ob-className"
                  type="text"
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder='e.g., "5th Grade Math - Period 2"'
                  className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ob-grade" className="block text-sm font-medium text-foreground mb-1.5">
                    Grade Level
                  </label>
                  <select
                    id="ob-grade"
                    value={gradeLevel}
                    onChange={e => setGradeLevel(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                  >
                    <option value="">Select grade...</option>
                    {GRADE_LEVELS.map(g => (
                      <option key={g} value={g}>
                        {g === 'K' ? 'Kindergarten' : `Grade ${g}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ob-subject" className="block text-sm font-medium text-foreground mb-1.5">
                    Subject
                  </label>
                  <select
                    id="ob-subject"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                  >
                    <option value="">Select subject...</option>
                    {SUBJECTS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {subject === 'Other' && (
                    <input
                      type="text"
                      placeholder="Enter subject"
                      value={customSubject}
                      onChange={e => setCustomSubject(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 pt-2">
                <button
                  onClick={() => setStep(1)}
                  disabled={!step1Valid}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
                {!step1Valid && (
                  <p className="text-xs text-muted-foreground/70">Fill in all fields above to continue.</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Add Students */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold font-heading text-foreground">Add Your Students</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Paste student names (one per line) or upload a CSV roster.
                </p>
              </div>

              <div>
                <textarea
                  rows={8}
                  placeholder={"Emma Johnson\nMarcus Rivera\nSophia Chen\n..."}
                  value={rosterText}
                  onChange={e => setRosterText(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-[--radius-md] bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                />

                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={handleParseNames}
                    disabled={!rosterText.trim()}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 disabled:text-muted-foreground/50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Parse Names
                  </button>

                  <span className="text-border">|</span>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
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

              {/* Preview table */}
              {showPreview && students.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      {students.length} student{students.length === 1 ? '' : 's'} found
                    </span>
                  </div>

                  {rosterWarning && (
                    <div className="flex items-start gap-2 mb-3 p-3 bg-warning/10 border border-warning/20 rounded-[--radius-md]">
                      <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                      <p className="text-sm text-warning">{rosterWarning}</p>
                    </div>
                  )}

                  <div className="border border-border rounded-[--radius-md] overflow-hidden">
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
                                onChange={e => updateStudent(i, 'firstName', e.target.value)}
                                className="w-full px-2 py-1 border border-transparent hover:border-border focus:border-primary rounded-[--radius-sm] text-sm focus:outline-none bg-transparent"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={s.lastName}
                                onChange={e => updateStudent(i, 'lastName', e.target.value)}
                                className="w-full px-2 py-1 border border-transparent hover:border-border focus:border-primary rounded-[--radius-sm] text-sm focus:outline-none bg-transparent"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={s.displayName}
                                onChange={e => updateStudent(i, 'displayName', e.target.value)}
                                className="w-full px-2 py-1 border border-transparent hover:border-border focus:border-primary rounded-[--radius-sm] text-sm focus:outline-none bg-transparent text-muted-foreground"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => removeStudent(i)}
                                className="p-1 text-muted-foreground/70 hover:text-destructive rounded-[--radius-sm] transition-colors"
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

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(0)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>

                <div className="flex flex-col items-end gap-1.5">
                  <button
                    onClick={handleSubmit}
                    disabled={saving || students.length === 0}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Get Started
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  {!saving && students.length === 0 && (
                    <p className="text-xs text-muted-foreground/70">Paste names or upload a CSV to add students.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
