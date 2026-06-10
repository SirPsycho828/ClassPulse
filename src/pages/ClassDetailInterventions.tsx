import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { formatDate } from '@/lib/longitudinalUtils';
import { Loader2, Zap } from 'lucide-react';

interface InterventionRow {
  interventionId: string;
  displayName: string;
  skillTag: string;
  scope: string;
  status: string;
  analysisId: string;
  assignmentTitle: string;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  planned: 'bg-primary/15 text-primary',
  in_progress: 'bg-accent/15 text-accent-foreground',
  done: 'bg-success/15 text-success',
  dismissed: 'bg-muted text-muted-foreground',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  dismissed: 'Dismissed',
};

export default function ClassDetailInterventions() {
  const { user } = useAuth();
  const { classId, analyses } = useClassDetailContext();
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Build a map of analysisId -> assignmentTitle for display
  const analysisTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of analyses) {
      map.set(a.analysisId, a.assignmentTitle);
    }
    return map;
  }, [analyses]);

  // Fetch all interventions for analyses in this class
  useEffect(() => {
    if (!user || analyses.length === 0) {
      setLoading(false);
      return;
    }

    async function loadInterventions() {
      try {
        const analysisIds = analyses.map((a) => a.analysisId);

        // Firestore 'in' queries limited to 30 items — batch
        const allRows: InterventionRow[] = [];
        for (let i = 0; i < analysisIds.length; i += 30) {
          const batch = analysisIds.slice(i, i + 30);
          const snap = await getDocs(
            query(
              collection(db, 'interventions'),
              where('analysisId', 'in', batch),
              where('teacherId', '==', user!.uid),
            ),
          );
          for (const d of snap.docs) {
            const data = d.data();
            allRows.push({
              interventionId: d.id,
              displayName: data.displayName || data.skillTag || '',
              skillTag: data.skillTag || '',
              scope: data.scope || '',
              status: data.status || 'pending',
              analysisId: data.analysisId,
              assignmentTitle: analysisTitleMap.get(data.analysisId) || 'Unknown',
              createdAt: data.createdAt?.toDate ? formatDate(data.createdAt.toDate()) : '',
            });
          }
        }

        setInterventions(allRows);
      } catch (err) {
        console.error('Failed to load interventions:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInterventions();
  }, [user, analyses, analysisTitleMap]);

  const filtered = useMemo(
    () =>
      statusFilter === 'all'
        ? interventions
        : interventions.filter((i) => i.status === statusFilter),
    [interventions, statusFilter],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading interventions...</span>
      </div>
    );
  }

  if (interventions.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[--radius-md]">
        <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No interventions have been recommended for this class yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter:</span>
        {['all', 'pending', 'planned', 'in_progress', 'done', 'dismissed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Intervention</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Skill</th>
                <th className="text-center py-3 px-4 text-muted-foreground font-medium">Scope</th>
                <th className="text-center py-3 px-4 text-muted-foreground font-medium">Status</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Analysis</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.interventionId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-foreground">{inv.displayName}</td>
                  <td className="py-2.5 px-4 text-muted-foreground">{inv.skillTag}</td>
                  <td className="py-2.5 px-4 text-center text-muted-foreground capitalize">{inv.scope.replace('_', ' ')}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[inv.status] || ''}`}>
                      {statusLabels[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <Link
                      to={`/analysis/${inv.analysisId}/interventions`}
                      className="text-primary hover:underline"
                    >
                      {inv.assignmentTitle}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">{inv.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-4">
          No interventions with status &ldquo;{statusLabels[statusFilter]}&rdquo;.
        </p>
      )}
    </div>
  );
}
