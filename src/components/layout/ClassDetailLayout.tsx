import { useEffect, useState } from 'react';
import { useParams, useLocation, Link, Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { TrendArrow } from '@/components/ui/TrendArrow';
import { computeTrend } from '@/lib/longitudinalUtils';
import type { AnalysisResult } from '@/lib/schemas';
import { BarChart3, Loader2, Plus, Users, Zap } from 'lucide-react';

export interface ClassDetailOutletContext {
  classId: string;
  className: string;
  gradeLevel: string;
  subject: string;
  studentCount: number;
  analyses: Array<AnalysisResult & { assignmentTitle: string; docId: string }>;
  refreshAnalyses: () => void;
}

export function useClassDetailContext() {
  return useOutletContext<ClassDetailOutletContext>();
}

const tabs = [
  { label: 'Overview', path: '', icon: BarChart3 },
  { label: 'Roster', path: '/roster', icon: Users },
  { label: 'Interventions', path: '/interventions', icon: Zap },
];

export default function ClassDetailLayout() {
  const { classId } = useParams<{ classId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [studentCount, setStudentCount] = useState(0);
  const [analyses, setAnalyses] = useState<Array<AnalysisResult & { assignmentTitle: string; docId: string }>>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  function refreshAnalyses() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    if (!classId || !user) return;

    async function loadData() {
      try {
        // Fetch class doc
        const classDoc = await getDoc(doc(db, 'classes', classId!));
        if (!classDoc.exists()) {
          toast('error', 'Class not found.');
          navigate('/classes', { replace: true });
          return;
        }
        const cd = classDoc.data();
        setClassName(cd.name || '');
        setGradeLevel(cd.gradeLevel || '');
        setSubject(cd.subject || '');
        setStudentCount(cd.studentCount || 0);

        // Fetch all analyses for this class
        const analysesSnap = await getDocs(
          query(
            collection(db, 'analyses'),
            where('classId', '==', classId),
            where('teacherId', '==', user!.uid),
            orderBy('generatedAt', 'asc'),
          ),
        );

        // For each analysis, fetch the assignment title
        const analysesWithTitles: Array<AnalysisResult & { assignmentTitle: string; docId: string }> = [];
        for (const aDoc of analysesSnap.docs) {
          const aData = aDoc.data() as AnalysisResult;
          let assignmentTitle = 'Untitled';
          try {
            const assignDoc = await getDoc(doc(db, 'assignments', aData.assignmentId));
            if (assignDoc.exists()) {
              assignmentTitle = assignDoc.data().title || 'Untitled';
            }
          } catch {
            // ignore
          }
          analysesWithTitles.push({ ...aData, assignmentTitle, docId: aDoc.id });
        }

        setAnalyses(analysesWithTitles);
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load class data.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classId, user, toast, navigate, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading class...</span>
      </div>
    );
  }

  const basePath = `/classes/${classId}`;
  const activePath = location.pathname === basePath
    ? ''
    : location.pathname.replace(basePath, '');

  const meanScores = analyses.map((a) => a.classSummary.meanScore);
  const trend = computeTrend(meanScores);
  const latestMean = meanScores.length > 0 ? meanScores[meanScores.length - 1] : null;

  const context: ClassDetailOutletContext = {
    classId: classId!,
    className,
    gradeLevel,
    subject,
    studentCount,
    analyses,
    refreshAnalyses,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/classes" className="hover:text-primary">Classes</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{className}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{className}</h1>
          {(gradeLevel || subject) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {[gradeLevel, subject].filter(Boolean).join(' \u00b7 ')}
            </p>
          )}
        </div>
        <Link
          to={`/analysis/new?classId=${classId}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:bg-primary/90 transition-colors shadow-[--shadow-sm] self-start"
        >
          <Plus className="w-4 h-4" />
          New Analysis
        </Link>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>{studentCount} student{studentCount !== 1 ? 's' : ''}</span>
        <span>{analyses.length} analys{analyses.length !== 1 ? 'es' : 'is'}</span>
        {latestMean !== null && (
          <span className="flex items-center gap-1.5">
            {Math.round(latestMean * 100)}% avg
            <TrendArrow trend={trend} size={14} />
          </span>
        )}
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

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}
