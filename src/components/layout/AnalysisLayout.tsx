import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link, Outlet } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAnalysis } from '@/lib/resolveAnalysis';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisResult, GradedResult } from '@/lib/schemas';
import { AlertTriangle, BarChart3, Loader2, Users, Zap, Calendar, Check, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { formatDate } from '@/lib/longitudinalUtils';

export interface AnalysisOutletContext {
  analysis: AnalysisResult;
  analysisDocId: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentDate: string;
  setAssignmentDate: (d: string) => void;
  gradedResult: GradedResult | null;
  answerKeyQuestions: { questionNumber: number; questionText: string | null }[];
}

export function useAnalysisContext() {
  return useOutletContext<AnalysisOutletContext>();
}

const tabs = [
  { label: 'Class', path: '', icon: BarChart3 },
  { label: 'Students', path: '/students', icon: Users },
  { label: 'Interventions', path: '/interventions', icon: Zap },
];

function EditableDate({
  date,
  assignmentId,
  onSaved,
}: {
  date: string;
  assignmentId: string;
  onSaved: (d: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(date);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function save() {
    if (!value || value === date) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'assignments', assignmentId), { date: value });
      onSaved(value);
      setEditing(false);
    } catch {
      toast('error', 'Failed to update date.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="px-2 py-1 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setValue(date); setEditing(false); }
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="p-1 text-success hover:bg-success/10 rounded transition-colors"
          title="Save"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => { setValue(date); setEditing(false); }}
          className="p-1 text-muted-foreground hover:bg-muted rounded transition-colors"
          title="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(date); setEditing(true); }}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      title="Edit date"
    >
      <Calendar className="w-3.5 h-3.5" />
      {date ? formatDate(date) : 'No date'}
    </button>
  );
}

export default function AnalysisLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisDocId, setAnalysisDocId] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDate, setAssignmentDate] = useState('');
  const [gradedResult, setGradedResult] = useState<GradedResult | null>(null);
  const [answerKeyQuestions, setAnswerKeyQuestions] = useState<
    { questionNumber: number; questionText: string | null }[]
  >([]);

  useEffect(() => {
    if (!id || !user) return;

    async function loadData() {
      try {
        const analysisDoc = await resolveAnalysis(id!, user!.uid);
        if (!analysisDoc || !analysisDoc.exists()) {
          toast('info', 'This analysis is still processing. Check back shortly.');
          navigate('/dashboard', { replace: true });
          return;
        }
        const analysisData = analysisDoc.data() as AnalysisResult;
        setAnalysis(analysisData);
        setAnalysisDocId(analysisDoc.id);

        const assignDoc = await getDoc(
          doc(db, 'assignments', analysisData.assignmentId),
        );
        if (assignDoc.exists()) {
          const ad = assignDoc.data();
          setAssignmentTitle(ad.title ?? 'Untitled Assignment');
          setAssignmentDate(ad.date ?? '');

          if (ad.pipelineState?.gradedResult) {
            setGradedResult(ad.pipelineState.gradedResult);
          }

          if (ad.answerKey?.questions) {
            setAnswerKeyQuestions(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ad.answerKey.questions as any[]).map((q: any) => ({
                questionNumber: q.questionNumber,
                questionText: q.questionText || null,
              })),
            );
          }
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load analysis data.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user, toast, navigate]);

  if (loading || !analysis) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading analysis...</span>
      </div>
    );
  }

  // Determine active tab from pathname
  const basePath = `/analysis/${id}`;
  const isStudentDetail = location.pathname.includes('/student/');
  const activePath = isStudentDetail
    ? '/students'
    : location.pathname === basePath
      ? ''
      : location.pathname.replace(basePath, '');

  const context: AnalysisOutletContext = {
    analysis,
    analysisDocId,
    assignmentId: analysis.assignmentId,
    assignmentTitle,
    assignmentDate,
    setAssignmentDate,
    gradedResult,
    answerKeyQuestions,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/dashboard" className="hover:text-primary">
          Dashboard
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{assignmentTitle}</span>
      </nav>

      {/* Title + editable date */}
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold text-foreground">{assignmentTitle}</h1>
        <EditableDate
          date={assignmentDate}
          assignmentId={analysis.assignmentId}
          onSaved={setAssignmentDate}
        />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = activePath === tab.path;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={`${basePath}${tab.path}`}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Stale banner */}
      {analysis.stale && (
        <div className="flex items-center gap-2 px-4 py-3 bg-warning/10 border border-warning/20 rounded-[--radius-md] text-sm text-warning">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          This analysis may be stale. Student data or answer key has changed since it was generated.
        </div>
      )}

      {/* Answer key flags */}
      {gradedResult && gradedResult.answerKeyFlags.length > 0 && (
        <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-[--radius-md] text-sm text-destructive">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="font-medium">Answer Key Concerns</span>
          </div>
          <ul className="ml-6 list-disc space-y-1">
            {gradedResult.answerKeyFlags.map((f) => (
              <li key={f.questionNumber}>
                Q{f.questionNumber}: {f.flag} ({Math.round(f.missRate * 100)}%
                miss rate, most common answer: {f.mostCommonAnswer})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}
