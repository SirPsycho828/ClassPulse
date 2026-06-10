import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalysisContext } from '@/components/layout/AnalysisLayout';

function masteryColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}

function relativeStandingBadge(standing: string) {
  const styles: Record<string, string> = {
    above_average: 'bg-success/15 text-success',
    average: 'bg-muted text-muted-foreground',
    below_average: 'bg-destructive/15 text-destructive',
  };
  const labels: Record<string, string> = {
    above_average: 'Above Avg',
    average: 'Average',
    below_average: 'Below Avg',
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[standing] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[standing] ?? standing}
    </span>
  );
}

type SortKey = 'name' | 'score';
type SortDir = 'asc' | 'desc';

export default function StudentList() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { analysis } = useAnalysisContext();
  const { studentInsights } = analysis;

  const [studentSort, setStudentSort] = useState<SortKey>('score');
  const [studentSortDir, setStudentSortDir] = useState<SortDir>('asc');

  const sortedStudents = useMemo(() => {
    const students = [...studentInsights];
    students.sort((a, b) => {
      let cmp: number;
      if (studentSort === 'name') {
        cmp = a.studentName.localeCompare(b.studentName);
      } else {
        cmp = a.totalScore - b.totalScore;
      }
      return studentSortDir === 'asc' ? cmp : -cmp;
    });
    return students;
  }, [studentInsights, studentSort, studentSortDir]);

  function toggleSort(key: SortKey) {
    if (studentSort === key) {
      setStudentSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setStudentSort(key);
      setStudentSortDir('asc');
    }
  }

  return (
    <div className="bg-card border border-border rounded-[--radius-md] overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/50">
            <th
              className="px-4 py-2.5 cursor-pointer hover:text-primary"
              onClick={() => toggleSort('name')}
            >
              Name{' '}
              {studentSort === 'name' && (studentSortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="px-4 py-2.5 cursor-pointer hover:text-primary text-right"
              onClick={() => toggleSort('score')}
            >
              Score{' '}
              {studentSort === 'score' && (studentSortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="px-4 py-2.5 hidden sm:table-cell">Standing</th>
            <th className="px-4 py-2.5 hidden md:table-cell">Gap Skills</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sortedStudents.map((s) => (
            <tr
              key={s.studentId}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/analysis/${id}/student/${s.studentId}`)}
            >
              <td className="px-4 py-2.5">
                <span className="font-medium text-primary">
                  {s.studentName}
                </span>
              </td>
              <td
                className={`px-4 py-2.5 text-right font-semibold ${masteryColor(s.totalScore)}`}
              >
                {Math.round(s.totalScore * 100)}%
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell">
                {relativeStandingBadge(s.relativeToClass)}
              </td>
              <td className="px-4 py-2.5 hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {s.gapAreas.slice(0, 3).map((gap) => (
                    <span
                      key={gap}
                      className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
                    >
                      {gap}
                    </span>
                  ))}
                  {s.gapAreas.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{s.gapAreas.length - 3}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
