import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useClassDetailContext } from '@/components/layout/ClassDetailLayout';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/longitudinalUtils';
import type { AnalysisResult } from '@/lib/schemas';
import {
  ChevronDown,
  ChevronRight,
  Users,
  User,
  Zap,
} from 'lucide-react';

type Intervention = AnalysisResult['interventions'][number];

interface InterventionRow extends Intervention {
  analysisDocId: string;
  analysisId: string;
  assignmentTitle: string;
  generatedAt: string;
}

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'dismissed', label: 'Dismissed' },
] as const;

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  planned: 'bg-primary/15 text-primary',
  in_progress: 'bg-accent/15 text-accent-foreground',
  done: 'bg-success/15 text-success',
  dismissed: 'bg-muted text-muted-foreground',
};

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    whole_class: 'Whole Class',
    small_group: 'Small Group',
    individual: 'Individual',
  };
  return labels[scope] || scope;
}

function scopeIcon(scope: string) {
  if (scope === 'individual') return User;
  return Users;
}

export default function ClassDetailInterventions() {
  const { analyses, refreshAnalyses } = useClassDetailContext();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  // Flatten all interventions across analyses, newest analysis first
  const allInterventions = useMemo(() => {
    const rows: InterventionRow[] = [];
    for (const a of [...analyses].reverse()) {
      for (const inv of a.interventions) {
        rows.push({
          ...inv,
          analysisDocId: a.docId,
          analysisId: a.analysisId,
          assignmentTitle: a.assignmentTitle,
          generatedAt: a.generatedAt,
        });
      }
    }
    return rows;
  }, [analyses]);

  const filtered = useMemo(
    () =>
      statusFilter === 'all'
        ? allInterventions
        : allInterventions.filter((i) => i.status === statusFilter),
    [allInterventions, statusFilter],
  );

  // Status counts for filter pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allInterventions.length };
    for (const inv of allInterventions) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [allInterventions]);

  // Student name lookup across all analyses
  const studentNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of analyses) {
      for (const si of a.studentInsights) {
        map[si.studentId] = si.studentName;
      }
    }
    return map;
  }, [analyses]);

  function toggleExpand(key: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const handleStatusChange = useCallback(
    async (inv: InterventionRow, newStatus: string) => {
      const key = `${inv.analysisId}_${inv.interventionId}`;
      setUpdatingIds((prev) => new Set(prev).add(key));
      try {
        // Find the analysis and update the specific intervention in the array
        const analysis = analyses.find((a) => a.docId === inv.analysisDocId);
        if (!analysis) return;

        const updatedInterventions = analysis.interventions.map((i) =>
          i.interventionId === inv.interventionId
            ? { ...i, status: newStatus as Intervention['status'] }
            : i,
        );

        await updateDoc(doc(db, 'analyses', inv.analysisDocId), {
          interventions: updatedInterventions,
        });

        refreshAnalyses();
        toast('success', `Status updated to "${statusOptions.find((s) => s.value === newStatus)?.label}".`);
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to update status.');
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [analyses, refreshAnalyses, toast],
  );

  if (allInterventions.length === 0) {
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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Filter:</span>
        {['all', ...statusOptions.map((s) => s.value)].map((s) => {
          const count = statusCounts[s] || 0;
          if (s !== 'all' && count === 0) return null;
          const label = s === 'all' ? 'All' : statusOptions.find((o) => o.value === s)?.label || s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Intervention cards */}
      <div className="space-y-3">
        {filtered.map((inv) => {
          const key = `${inv.analysisId}_${inv.interventionId}`;
          const isExpanded = expandedIds.has(key);
          const isUpdating = updatingIds.has(key);
          const ScopeIcon = scopeIcon(inv.scope);

          return (
            <div
              key={key}
              className="bg-card border border-border rounded-[--radius-md] overflow-hidden"
            >
              {/* Compact header — always visible */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => toggleExpand(key)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{inv.displayName}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ScopeIcon className="w-3 h-3" />
                      {scopeLabel(inv.scope)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {inv.misconceptionSummary}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {inv.affectedCount} student{inv.affectedCount !== 1 ? 's' : ''}
                  </span>

                  {/* Status dropdown */}
                  <select
                    value={inv.status}
                    disabled={isUpdating}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleStatusChange(inv, e.target.value);
                    }}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${statusStyles[inv.status] || 'bg-muted text-muted-foreground'} ${isUpdating ? 'opacity-50' : ''}`}
                  >
                    {statusOptions.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>

                  <Link
                    to={`/analysis/${inv.analysisId}/interventions`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline hidden sm:inline whitespace-nowrap"
                  >
                    {inv.assignmentTitle}
                  </Link>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
                  {/* Misconception summary */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Misconception
                    </h4>
                    <p className="text-sm text-foreground">{inv.misconceptionSummary}</p>
                  </div>

                  {/* Effort tiers */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      Effort Levels
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(['quick', 'lesson', 'individual'] as const).map((tier) => {
                        const tierData = inv.effortTiers[tier];
                        const isSelected = inv.selectedEffortTier === tier;
                        return (
                          <div
                            key={tier}
                            className={`p-2.5 rounded-[--radius-md] border text-left ${
                              isSelected
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-muted/30'
                            }`}
                          >
                            <span className={`text-xs font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                              {tierData.label}
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {tierData.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Affected students */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      Affected Students ({inv.affectedCount})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {inv.affectedStudentIds.map((sid) => (
                        <Link
                          key={sid}
                          to={`/students/${analyses[0]?.classId || ''}/${sid}`}
                          className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                        >
                          {studentNames[sid] ?? sid}
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span>Skill: <span className="text-foreground">{inv.skillTag}</span></span>
                    <span>Date: {formatDate(inv.generatedAt)}</span>
                    {inv.plannedDate && <span>Planned: {formatDate(inv.plannedDate + 'T00:00:00')}</span>}
                    {inv.teacherNote && <span>Note: <span className="text-foreground italic">"{inv.teacherNote}"</span></span>}
                    <Link
                      to={`/analysis/${inv.analysisId}/interventions`}
                      className="text-primary hover:underline ml-auto"
                    >
                      Open in Planner &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-4">
          No interventions with this status.
        </p>
      )}
    </div>
  );
}
