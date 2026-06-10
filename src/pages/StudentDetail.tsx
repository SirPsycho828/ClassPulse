import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';
import { useToast } from '@/components/ui/Toast';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileImage,
  TrendingDown,
  TrendingUp,
  Minus,
  X,
  Target,
} from 'lucide-react';
import { NextStepCard } from '@/components/ux/NextStepCard';

// ---- helpers ----
function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function masteryBg(score: number) {
  if (score >= 0.8) return 'bg-success';
  if (score >= 0.6) return 'bg-yellow-600';
  return 'bg-red-600';
}

function masteryBgLight(score: number) {
  if (score >= 0.8) return 'bg-success/15';
  if (score >= 0.6) return 'bg-warning/15';
  return 'bg-destructive/15';
}

function relativeStandingBadge(standing: string) {
  const styles: Record<string, string> = {
    above_average: 'bg-success/15 text-success',
    average: 'bg-muted text-muted-foreground',
    below_average: 'bg-destructive/15 text-destructive',
  };
  const labels: Record<string, string> = {
    above_average: 'Above Average',
    average: 'Average',
    below_average: 'Below Average',
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[standing] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[standing] ?? standing}
    </span>
  );
}

function gapStatusLabel(gap: number) {
  if (gap > 0.1) return { label: 'Ahead', color: 'text-success', icon: TrendingUp };
  if (gap < -0.1) return { label: 'Behind', color: 'text-destructive', icon: TrendingDown };
  return { label: 'On track', color: 'text-muted-foreground', icon: Minus };
}

export default function StudentDetail() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { analysis, gradedResult, answerKeyQuestions } = useAnalysisContext();

  const [showWrongOnly, setShowWrongOnly] = useState(false);
  const [quizPhotoUrl, setQuizPhotoUrl] = useState<string | null>(null);
  const [photoExpanded, setPhotoExpanded] = useState(true);
  const [gradedStudentQuestions, setGradedStudentQuestions] = useState<
    { questionNumber: number; studentAnswer: string; correctAnswer: string; isCorrect: boolean }[]
  >([]);

  // ---- load student-specific data ----
  useEffect(() => {
    if (!studentId) return;

    async function loadStudentData() {
      try {
        // Load quiz photo for this student
        const studentInsight = analysis.studentInsights.find(
          (s) => s.studentId === studentId,
        );
        if (studentInsight?.sourceImagePath) {
          try {
            const url = await getDownloadURL(ref(storage, studentInsight.sourceImagePath));
            setQuizPhotoUrl(url);
          } catch {
            // Photo not available — not critical
          }
        }

        // Extract graded student questions from the shared gradedResult
        if (gradedResult?.gradedStudents) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gs = (gradedResult.gradedStudents as any[]).find(
            (s) => s.studentId === studentId,
          );
          if (gs?.perQuestion) {
            setGradedStudentQuestions(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              gs.perQuestion.map((pq: any) => ({
                questionNumber: pq.questionNumber,
                studentAnswer: pq.studentAnswer || '',
                correctAnswer: pq.correctAnswer || '',
                isCorrect: !!pq.isCorrect,
              })),
            );
          }
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load student data.');
      }
    }

    loadStudentData();
  }, [studentId, analysis, gradedResult, toast]);

  // ---- find student + neighbors ----
  const studentIndex = useMemo(() => {
    if (!analysis) return -1;
    return analysis.studentInsights.findIndex((s) => s.studentId === studentId);
  }, [analysis, studentId]);

  const student = analysis?.studentInsights[studentIndex] ?? null;
  const prevStudent =
    studentIndex > 0 ? analysis?.studentInsights[studentIndex - 1] : null;
  const nextStudent =
    analysis && studentIndex < analysis.studentInsights.length - 1
      ? analysis.studentInsights[studentIndex + 1]
      : null;

  // ---- question-by-question: prefer graded data, fall back to wrongAnswerAnalysis ----
  const questionRows = useMemo(() => {
    if (!student) return [];

    // If we have graded data, use it (has ALL questions, correct + wrong)
    if (gradedStudentQuestions.length > 0) {
      return gradedStudentQuestions
        .slice()
        .sort((a, b) => a.questionNumber - b.questionNumber)
        .map((gq) => {
          const akq = answerKeyQuestions.find((q) => q.questionNumber === gq.questionNumber);
          const wa = student.wrongAnswerAnalysis.find((w) => w.questionNumber === gq.questionNumber);
          return {
            questionNumber: gq.questionNumber,
            questionText: akq?.questionText || wa?.questionText || '',
            studentAnswer: gq.studentAnswer,
            correctAnswer: gq.correctAnswer,
            isCorrect: gq.isCorrect,
            misconception: wa?.misconception || '',
          };
        });
    }

    // Fallback: only wrong answers available
    return student.wrongAnswerAnalysis.map((wa) => ({
      questionNumber: wa.questionNumber,
      questionText: wa.questionText ?? '',
      studentAnswer: wa.studentAnswer,
      correctAnswer: wa.correctAnswer,
      isCorrect: false,
      misconception: wa.misconception,
    }));
  }, [student, gradedStudentQuestions, answerKeyQuestions]);

  // ---- skill comparison table ----
  const skillRows = useMemo(() => {
    if (!student || !analysis) return [];
    return student.skillPerformance.map((sp) => {
      const skillInfo = analysis.skillBreakdown.find(
        (sb) => sb.skillTag === sp.skillTag,
      );
      return {
        skillTag: sp.skillTag,
        displayName: skillInfo?.displayName ?? sp.skillTag,
        studentMastery: sp.mastery,
        classMastery: sp.classAverage,
        gap: sp.gap,
      };
    });
  }, [student, analysis]);

  // Misconception cards: group wrong answers by misconception
  const misconceptionGroups = useMemo(() => {
    if (!student) return [];
    const groups: Record<
      string,
      {
        misconception: string;
        questions: typeof student.wrongAnswerAnalysis;
      }
    > = {};

    student.wrongAnswerAnalysis.forEach((wa) => {
      const key = wa.misconception;
      if (!groups[key]) {
        groups[key] = { misconception: key, questions: [] };
      }
      groups[key].questions.push(wa);
    });

    return Object.values(groups);
  }, [student]);

  if (!student) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Student not found in this analysis.</p>
        <Link
          to={`/analysis/${id}`}
          className="mt-4 inline-block text-sm text-primary hover:text-primary font-medium"
        >
          Back to Class Overview
        </Link>
      </div>
    );
  }

  const classAvg = analysis.classSummary.meanScore;
  const scoreDiff = student.totalScore - classAvg;

  return (
    <div className="space-y-6">
      {/* ====== STUDENT HEADER ====== */}
      <section className="bg-card border border-border rounded-[--radius-md] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: navigation arrows + name */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex gap-1">
              {prevStudent ? (
                <button
                  onClick={() =>
                    navigate(`/analysis/${id}/student/${prevStudent.studentId}`)
                  }
                  className="p-1.5 rounded-[--radius-md] text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                  title={`Previous: ${prevStudent.studentName}`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="p-1.5 text-border/60" title="No previous student">
                  <ChevronLeft className="w-5 h-5" />
                </span>
              )}
              {nextStudent ? (
                <button
                  onClick={() =>
                    navigate(`/analysis/${id}/student/${nextStudent.studentId}`)
                  }
                  className="p-1.5 rounded-[--radius-md] text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                  title={`Next: ${nextStudent.studentName}`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <span className="p-1.5 text-border/60" title="No next student">
                  <ChevronRight className="w-5 h-5" />
                </span>
              )}
            </div>

            <div>
              <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
                {student.studentName}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                {relativeStandingBadge(student.relativeToClass)}
                <span className="text-xs text-muted-foreground">
                  {Math.round(student.percentile)}th percentile
                </span>
              </div>
            </div>
          </div>

          {/* Right: big score */}
          <div className="flex items-center justify-between sm:block sm:text-right pl-2 sm:pl-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/50">
            <div
              className={`text-3xl sm:text-4xl font-bold ${masteryColor(student.totalScore)}`}
            >
              {Math.round(student.totalScore * 100)}%
            </div>
            <div className="text-xs text-muted-foreground sm:mt-1">
              Class avg: {Math.round(classAvg * 100)}%{' '}
              <span
                className={`font-medium ${scoreDiff >= 0 ? 'text-success' : 'text-destructive'}`}
              >
                ({scoreDiff >= 0 ? '+' : ''}
                {Math.round(scoreDiff * 100)}%)
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SKILL COMPARISON TABLE ====== */}
      {skillRows.length > 0 && (
        <section className="bg-card border border-border rounded-[--radius-md] p-6">
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Skill Comparison
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="pb-2 pr-3">Skill</th>
                  <th className="pb-2 pr-3 w-36">Student</th>
                  <th className="pb-2 pr-3 w-36">Class Avg</th>
                  <th className="pb-2 pr-3 text-right w-16">Gap</th>
                  <th className="pb-2 w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {skillRows.map((row) => {
                  const status = gapStatusLabel(row.gap);
                  const StatusIcon = status.icon;
                  return (
                    <tr key={row.skillTag}>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${masteryBgLight(row.studentMastery)} ${masteryColor(row.studentMastery)}`}
                        >
                          {row.displayName}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${masteryBg(row.studentMastery)}`}
                              style={{
                                width: `${Math.round(row.studentMastery * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold w-9 text-right">
                            {Math.round(row.studentMastery * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-muted-foreground/50"
                              style={{
                                width: `${Math.round(row.classMastery * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground w-9 text-right">
                            {Math.round(row.classMastery * 100)}%
                          </span>
                        </div>
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right text-xs font-semibold ${row.gap >= 0 ? 'text-success' : 'text-destructive'}`}
                      >
                        {row.gap >= 0 ? '+' : ''}
                        {Math.round(row.gap * 100)}%
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`flex items-center gap-1 text-xs font-medium ${status.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ====== QUESTION-BY-QUESTION TABLE ====== */}
      {questionRows.length > 0 && (
        <section className="bg-card border border-border rounded-[--radius-md] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Question-by-Question
            </h2>
            <div className="flex items-center gap-1 bg-muted rounded-[--radius-md] p-0.5 self-start sm:self-auto">
              <button
                onClick={() => setShowWrongOnly(false)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${
                  !showWrongOnly
                    ? 'bg-card text-foreground shadow-[--shadow-sm] font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All questions
              </button>
              <button
                onClick={() => setShowWrongOnly(true)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${
                  showWrongOnly
                    ? 'bg-card text-foreground shadow-[--shadow-sm] font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Wrong answers only
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="pb-2 pr-3 w-12">Q#</th>
                  <th className="pb-2 pr-3">Question</th>
                  <th className="pb-2 pr-3 w-28">Student Answer</th>
                  <th className="pb-2 pr-3 w-28">Correct Answer</th>
                  <th className="pb-2 w-16 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {questionRows
                  .filter((q) => !showWrongOnly || !q.isCorrect)
                  .map((q) => (
                    <tr key={q.questionNumber}>
                      <td className="py-2.5 pr-3 font-medium text-muted-foreground">
                        {q.questionNumber}
                      </td>
                      <td className="py-2.5 pr-3 text-foreground">
                        {q.questionText || (
                          <span className="text-muted-foreground italic">No text available</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`font-medium ${q.isCorrect ? 'text-success' : 'text-destructive'}`}
                        >
                          {q.studentAnswer}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {q.correctAnswer}
                      </td>
                      <td className="py-2.5 text-center">
                        {q.isCorrect ? (
                          <Check className="w-4 h-4 text-success mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-destructive mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {showWrongOnly && questionRows.filter((q) => q.isCorrect).length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {questionRows.filter((q) => q.isCorrect).length} correct answers hidden.
            </p>
          )}
        </section>
      )}

      {/* ====== WRONG ANSWER ANALYSIS ====== */}
      {misconceptionGroups.length > 0 && (
        <section>
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Wrong Answer Analysis
          </h2>

          <div className="space-y-4">
            {misconceptionGroups.map((group, idx) => (
              <div
                key={idx}
                className="bg-card border border-border border-l-4 border-l-destructive/60 rounded-[--radius-md] p-4"
              >
                <h3 className="font-heading text-sm font-semibold text-foreground mb-2">
                  {group.misconception}
                </h3>

                <div className="space-y-2">
                  {group.questions.map((q) => (
                    <div
                      key={q.questionNumber}
                      className="flex items-center gap-3 text-sm bg-destructive/10 rounded-[--radius-md] px-3 py-2"
                    >
                      <span className="text-xs font-medium text-muted-foreground w-8">
                        Q{q.questionNumber}
                      </span>
                      <div className="flex-1 text-muted-foreground text-xs">
                        {q.questionText && (
                          <span className="text-muted-foreground">{q.questionText}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-destructive font-medium">
                          {q.studentAnswer}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-success font-medium">
                          {q.correctAnswer}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ====== INDIVIDUAL INTERVENTION PLAN ====== */}
      {student.interventionPlan && (
        <section className="bg-card border border-border border-l-4 border-l-primary rounded-[--radius-md] p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Individual Intervention Plan
            </h2>
          </div>
          <p className="text-sm text-foreground mb-4">
            {student.interventionPlan.summary}
          </p>
          <ol className="space-y-3">
            {student.interventionPlan.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ====== ORIGINAL QUIZ PHOTO ====== */}
      {quizPhotoUrl && (
        <section className="bg-card border border-border rounded-[--radius-md] p-4 sm:p-6">
          <button
            onClick={() => setPhotoExpanded(!photoExpanded)}
            className="flex items-center gap-2 mb-3 w-full text-left"
          >
            <FileImage className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Original Quiz Photo
            </h2>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${photoExpanded ? 'rotate-90' : ''}`}
            />
          </button>
          {photoExpanded && (
            <div className="mt-2">
              <img
                src={quizPhotoUrl}
                alt={`${student.studentName}'s quiz`}
                className="w-full max-w-lg rounded-[--radius-md] border border-border shadow-sm"
              />
            </div>
          )}
        </section>
      )}

      {/* Intervention CTA — shown when student has gap areas */}
      {student.gapAreas.length > 0 && (
        <NextStepCard
          title="View Interventions"
          description={`${student.studentName} is struggling in ${student.gapAreas.slice(0, 2).join(' and ')}. See recommended interventions.`}
          to={`/analysis/${id}/interventions`}
          actionLabel="View Plan"
          icon={<Target className="w-5 h-5" />}
        />
      )}

    </div>
  );
}
