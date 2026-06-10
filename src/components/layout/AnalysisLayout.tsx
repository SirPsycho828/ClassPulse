import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link, Outlet } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAnalysis } from '@/lib/resolveAnalysis';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisResult, GradedResult } from '@/lib/schemas';
import { AlertTriangle, BarChart3, Loader2, Users, Zap } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export interface AnalysisOutletContext {
  analysis: AnalysisResult;
  analysisDocId: string;
  assignmentTitle: string;
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
    assignmentTitle,
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
