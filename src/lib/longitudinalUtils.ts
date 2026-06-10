import type { Trend } from './summaryTypes';

/**
 * Compute trend direction from an array of scores (oldest first).
 * Compares the last two values. Returns 'flat' if fewer than 2 values.
 */
export function computeTrend(scores: number[]): Trend {
  if (scores.length < 2) return 'flat';
  const prev = scores[scores.length - 2];
  const curr = scores[scores.length - 1];
  const diff = curr - prev;
  // Use a 2% threshold to avoid noise
  if (diff > 0.02) return 'up';
  if (diff < -0.02) return 'down';
  return 'flat';
}

/**
 * Build sparkline data from a list of scores, capped to the most recent `max` entries.
 */
export function buildSparklineData(scores: number[], max = 10): number[] {
  return scores.slice(-max);
}

/**
 * A skill that appeared as red (<0.6) or yellow (<0.8) mastery in an analysis.
 */
export interface SkillAppearance {
  analysisId: string;
  analysisDate: string;
  analysisTitle: string;
  mastery: number;
  masteryLevel: 'green' | 'yellow' | 'red';
}

export interface RecurringProblemSkill {
  skillTag: string;
  displayName: string;
  weakCount: number;
  totalCount: number;
  latestMastery: number;
  latestMasteryLevel: 'green' | 'yellow' | 'red';
  trend: 'improving' | 'worsening' | 'stuck';
  appearances: SkillAppearance[];
}

/**
 * Find skills that appeared as red or yellow across 2+ analyses.
 * `analyses` should be sorted oldest-first.
 */
export function findRecurringProblemSkills(
  analyses: Array<{
    analysisId: string;
    generatedAt: string;
    assignmentTitle: string;
    skillBreakdown: Array<{
      skillTag: string;
      displayName: string;
      classMastery: number;
      masteryLevel: 'green' | 'yellow' | 'red';
    }>;
  }>,
): RecurringProblemSkill[] {
  const skillMap = new Map<string, {
    displayName: string;
    appearances: SkillAppearance[];
  }>();

  for (const a of analyses) {
    for (const skill of a.skillBreakdown) {
      if (!skillMap.has(skill.skillTag)) {
        skillMap.set(skill.skillTag, { displayName: skill.displayName, appearances: [] });
      }
      skillMap.get(skill.skillTag)!.appearances.push({
        analysisId: a.analysisId,
        analysisDate: a.generatedAt,
        analysisTitle: a.assignmentTitle,
        mastery: skill.classMastery,
        masteryLevel: skill.masteryLevel,
      });
    }
  }

  const results: RecurringProblemSkill[] = [];
  for (const [skillTag, data] of skillMap) {
    const weakAppearances = data.appearances.filter(a => a.masteryLevel !== 'green');
    if (weakAppearances.length < 2) continue;

    const latest = data.appearances[data.appearances.length - 1];
    const masteries = data.appearances.map(a => a.mastery);
    const recentTrend = computeTrend(masteries);

    results.push({
      skillTag,
      displayName: data.displayName,
      weakCount: weakAppearances.length,
      totalCount: data.appearances.length,
      latestMastery: latest.mastery,
      latestMasteryLevel: latest.masteryLevel,
      trend: recentTrend === 'up' ? 'improving' : recentTrend === 'down' ? 'worsening' : 'stuck',
      appearances: data.appearances,
    });
  }

  // Sort by persistence (most weak appearances first)
  results.sort((a, b) => b.weakCount - a.weakCount);
  return results;
}

export interface PersistentConcern {
  skillTag: string;
  displayName: string;
  consecutiveWeakCount: number;
  masteryTrajectory: number[];
  linkedAnalyses: Array<{ analysisId: string; analysisDate: string; analysisTitle: string }>;
}

/**
 * Find skills that remained red or yellow across 2+ consecutive analyses for a student.
 * `skillEntries` should be sorted oldest-first per skill.
 */
export function findPersistentConcerns(
  analyses: Array<{
    analysisId: string;
    generatedAt: string;
    assignmentTitle: string;
    skillPerformance: Array<{
      skillTag: string;
      displayName: string;
      mastery: number;
    }>;
  }>,
): PersistentConcern[] {
  // Group by skill across all analyses (analyses should be oldest-first)
  const skillMap = new Map<string, {
    displayName: string;
    entries: Array<{
      analysisId: string;
      analysisDate: string;
      analysisTitle: string;
      mastery: number;
    }>;
  }>();

  for (const a of analyses) {
    for (const sp of a.skillPerformance) {
      if (!skillMap.has(sp.skillTag)) {
        skillMap.set(sp.skillTag, { displayName: sp.displayName, entries: [] });
      }
      skillMap.get(sp.skillTag)!.entries.push({
        analysisId: a.analysisId,
        analysisDate: a.generatedAt,
        analysisTitle: a.assignmentTitle,
        mastery: sp.mastery,
      });
    }
  }

  const concerns: PersistentConcern[] = [];
  for (const [skillTag, data] of skillMap) {
    // Find the longest consecutive run of weak (< 0.8) mastery ending at the most recent entry
    let consecutiveWeak = 0;
    for (let i = data.entries.length - 1; i >= 0; i--) {
      if (data.entries[i].mastery < 0.8) {
        consecutiveWeak++;
      } else {
        break;
      }
    }

    if (consecutiveWeak >= 2) {
      const weakEntries = data.entries.slice(-consecutiveWeak);
      concerns.push({
        skillTag,
        displayName: data.displayName,
        consecutiveWeakCount: consecutiveWeak,
        masteryTrajectory: weakEntries.map(e => e.mastery),
        linkedAnalyses: weakEntries.map(e => ({
          analysisId: e.analysisId,
          analysisDate: e.analysisDate,
          analysisTitle: e.analysisTitle,
        })),
      });
    }
  }

  // Sort by consecutive count descending
  concerns.sort((a, b) => b.consecutiveWeakCount - a.consecutiveWeakCount);
  return concerns;
}
