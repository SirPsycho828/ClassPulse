// rosterMatch.ts — Algorithmic roster matching (no AI, no external libraries)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RosterStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  knownAliases: string[];
}

export interface ExtractedName {
  extractionIndex: number;
  rawName: string;
}

export interface MatchCandidate {
  studentId: string;
  rosterName: string;
  confidence: number;
}

export interface MatchEntry {
  extractionIndex: number;
  rawName: string;
  matchTier: 'exact' | 'alias' | 'fuzzy' | 'unmatched';
  topCandidate: MatchCandidate | null;
  otherCandidates: MatchCandidate[];
  status: 'confirmed' | 'needs_review' | 'unmatched';
}

export interface RosterMatchResult {
  matches: MatchEntry[];
  unmatchedRosterStudents: string[];
  summary: {
    confirmed: number;
    needsReview: number;
    unmatched: number;
    absentFromSubmissions: number;
  };
}

// ---------------------------------------------------------------------------
// Levenshtein distance (no external library)
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings using the
 * standard dynamic-programming algorithm.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Allocate a (m+1) x (n+1) matrix
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array<number>(n + 1).fill(0);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalised Levenshtein similarity: 1 - (distance / max(len1, len2)).
 * Returns 1 for two identical strings and 0 when the strings share nothing.
 */
function normalizedSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1; // both empty strings — treat as identical
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Returns the display name for a roster student used in candidate output.
 * Prefers `displayName` when it differs from "firstName lastName".
 */
function rosterDisplayName(student: RosterStudent): string {
  return student.displayName || `${student.firstName} ${student.lastName}`.trim();
}

/**
 * Computes the best fuzzy similarity score between a raw extracted name and
 * a single roster student, checking multiple name forms.
 */
function bestFuzzySimilarity(rawNorm: string, student: RosterStudent): number {
  const fullName = normalize(`${student.firstName} ${student.lastName}`);
  const reversedName = normalize(`${student.lastName} ${student.firstName}`);
  const displayName = normalize(student.displayName);
  const firstName = normalize(student.firstName);
  const lastName = normalize(student.lastName);

  return Math.max(
    normalizedSimilarity(rawNorm, fullName),
    normalizedSimilarity(rawNorm, reversedName),
    normalizedSimilarity(rawNorm, displayName),
    normalizedSimilarity(rawNorm, firstName),
    normalizedSimilarity(rawNorm, lastName)
  );
}

// ---------------------------------------------------------------------------
// matchRoster
// ---------------------------------------------------------------------------

/**
 * Matches each extracted name against the class roster using a four-tier
 * strategy: exact → alias → fuzzy → unmatched.
 *
 * @param extractedNames   Names pulled from the extraction stage.
 * @param roster           Full class roster.
 * @param confidenceThreshold  Minimum normalised Levenshtein similarity to
 *                             accept a fuzzy match. Defaults to 0.7.
 */
export function matchRoster(
  extractedNames: ExtractedName[],
  roster: RosterStudent[],
  confidenceThreshold = 0.7
): RosterMatchResult {
  // Track which roster students have been matched (for absent detection)
  const matchedRosterIds = new Set<string>();
  const matches: MatchEntry[] = [];

  for (const extracted of extractedNames) {
    const rawNorm = normalize(extracted.rawName);
    let entry: MatchEntry | null = null;

    // ------------------------------------------------------------------
    // Tier 1: Exact match against full name or display name
    // ------------------------------------------------------------------
    for (const student of roster) {
      const fullName = normalize(`${student.firstName} ${student.lastName}`);
      const displayName = normalize(student.displayName);

      if (rawNorm === fullName || rawNorm === displayName) {
        matchedRosterIds.add(student.studentId);
        entry = {
          extractionIndex: extracted.extractionIndex,
          rawName: extracted.rawName,
          matchTier: 'exact',
          topCandidate: {
            studentId: student.studentId,
            rosterName: rosterDisplayName(student),
            confidence: 1.0,
          },
          otherCandidates: [],
          status: 'confirmed',
        };
        break;
      }
    }

    if (entry) {
      matches.push(entry);
      continue;
    }

    // ------------------------------------------------------------------
    // Tier 2: Alias match
    // ------------------------------------------------------------------
    for (const student of roster) {
      const aliasMatch = student.knownAliases.some(
        (alias) => normalize(alias) === rawNorm
      );
      if (aliasMatch) {
        matchedRosterIds.add(student.studentId);
        entry = {
          extractionIndex: extracted.extractionIndex,
          rawName: extracted.rawName,
          matchTier: 'alias',
          topCandidate: {
            studentId: student.studentId,
            rosterName: rosterDisplayName(student),
            confidence: 1.0,
          },
          otherCandidates: [],
          status: 'confirmed',
        };
        break;
      }
    }

    if (entry) {
      matches.push(entry);
      continue;
    }

    // ------------------------------------------------------------------
    // Tier 3 & 4: Fuzzy matching — rank all roster students by similarity
    // ------------------------------------------------------------------
    const scored: Array<{ student: RosterStudent; similarity: number }> = roster.map(
      (student) => ({
        student,
        similarity: bestFuzzySimilarity(rawNorm, student),
      })
    );

    scored.sort((a, b) => b.similarity - a.similarity);

    const best = scored[0];

    if (best && best.similarity >= confidenceThreshold) {
      // Tier 3: fuzzy match above threshold
      matchedRosterIds.add(best.student.studentId);

      const otherCandidates: MatchCandidate[] = scored
        .slice(1, 4) // up to 3 other candidates
        .filter((s) => s.similarity > 0)
        .map((s) => ({
          studentId: s.student.studentId,
          rosterName: rosterDisplayName(s.student),
          confidence: s.similarity,
        }));

      entry = {
        extractionIndex: extracted.extractionIndex,
        rawName: extracted.rawName,
        matchTier: 'fuzzy',
        topCandidate: {
          studentId: best.student.studentId,
          rosterName: rosterDisplayName(best.student),
          confidence: best.similarity,
        },
        otherCandidates,
        status: 'needs_review',
      };
    } else {
      // Tier 4: unmatched — still populate otherCandidates with best fuzzy guesses
      const otherCandidates: MatchCandidate[] = scored
        .slice(0, 3)
        .filter((s) => s.similarity > 0)
        .map((s) => ({
          studentId: s.student.studentId,
          rosterName: rosterDisplayName(s.student),
          confidence: s.similarity,
        }));

      entry = {
        extractionIndex: extracted.extractionIndex,
        rawName: extracted.rawName,
        matchTier: 'unmatched',
        topCandidate: null,
        otherCandidates,
        status: 'unmatched',
      };
    }

    matches.push(entry);
  }

  // Students on the roster who have no extraction match (absent / no submission)
  const unmatchedRosterStudents = roster
    .filter((s) => !matchedRosterIds.has(s.studentId))
    .map((s) => s.studentId);

  const confirmed = matches.filter((m) => m.status === 'confirmed').length;
  const needsReview = matches.filter((m) => m.status === 'needs_review').length;
  const unmatched = matches.filter((m) => m.status === 'unmatched').length;

  return {
    matches,
    unmatchedRosterStudents,
    summary: {
      confirmed,
      needsReview,
      unmatched,
      absentFromSubmissions: unmatchedRosterStudents.length,
    },
  };
}
