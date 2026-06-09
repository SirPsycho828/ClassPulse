// computeStats.ts — Pure computation functions (no AI, no external dependencies)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassStats {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
}

export type DistributionShape = 'normal' | 'bimodal' | 'ceiling' | 'floor' | 'uniform';

export interface OutlierResult {
  studentId: string;
  score: number;
  direction: 'above' | 'below';
}

export interface SkillMasteryPerStudent {
  studentId: string;
  mastery: number;
}

export type MasteryLevel = 'green' | 'yellow' | 'red';

export interface SkillMasteryResult {
  skillTag: string;
  classMastery: number;
  masteryLevel: MasteryLevel;
  studentsStrugglingCount: number;
  studentsProficientCount: number;
  perStudentMastery: SkillMasteryPerStudent[];
}

export interface SkillCluster {
  gapSkills: string[];
  studentIds: string[];
}

export type InterventionScope = 'whole_class' | 'small_group' | 'individual';

export interface AnswerKeyFlag {
  questionNumber: number;
  flag: 'high_miss_rate';
  missRate: number;
  mostCommonAnswer: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Population mean of an array. Returns 0 for empty input. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation. Returns 0 for fewer than 2 values. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Population skewness (Fisher-Pearson). Returns 0 for fewer than 3 values. */
function skewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return 0;
  const cubedDeviations = values.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0);
  return cubedDeviations / n;
}

// ---------------------------------------------------------------------------
// calculateClassStats
// ---------------------------------------------------------------------------

/**
 * Computes descriptive statistics for a set of normalised scores (0-1).
 * Returns zeros for an empty array.
 */
export function calculateClassStats(scores: number[]): ClassStats {
  if (scores.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  const m = mean(scores);
  const sd = stdDev(scores);
  const min = sorted[0];
  const max = sorted[n - 1];

  let median: number;
  if (n % 2 === 1) {
    median = sorted[Math.floor(n / 2)];
  } else {
    median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }

  return { mean: m, median, stdDev: sd, min, max };
}

// ---------------------------------------------------------------------------
// detectDistributionShape
// ---------------------------------------------------------------------------

/**
 * Classifies the distribution of scores into one of five shapes.
 * Evaluation order: uniform → ceiling → floor → bimodal → normal.
 */
export function detectDistributionShape(scores: number[]): DistributionShape {
  if (scores.length === 0) return 'normal';

  const stats = calculateClassStats(scores);
  const sk = skewness(scores);

  // uniform: everyone scored similarly
  if (stats.stdDev < 0.05) return 'uniform';

  // ceiling: clustered near top with negative skew
  if (stats.median > 0.85 && sk < -1) return 'ceiling';

  // floor: clustered near bottom with positive skew
  if (stats.median < 0.4 && sk > 1) return 'floor';

  // bimodal: two non-adjacent histogram bins each contain > 20% of students
  const NUM_BINS = 10;
  const bins = new Array<number>(NUM_BINS).fill(0);
  for (const s of scores) {
    // clamp to [0, 9] so a score of exactly 1.0 goes into the last bin
    const binIndex = Math.min(Math.floor(s * NUM_BINS), NUM_BINS - 1);
    bins[binIndex]++;
  }
  const threshold = 0.2 * scores.length; // 20% of students
  const peakIndices: number[] = [];
  for (let i = 0; i < NUM_BINS; i++) {
    if (bins[i] > threshold) peakIndices.push(i);
  }
  // Two peaks are "distinct" if they are separated by at least one empty/sub-threshold bin
  if (peakIndices.length >= 2) {
    for (let i = 0; i < peakIndices.length - 1; i++) {
      if (peakIndices[i + 1] - peakIndices[i] > 1) {
        return 'bimodal';
      }
    }
  }

  return 'normal';
}

// ---------------------------------------------------------------------------
// detectOutliers
// ---------------------------------------------------------------------------

/**
 * Returns students whose score is more than 2 standard deviations from the
 * class mean, together with the direction of the deviation.
 */
export function detectOutliers(
  students: Array<{ studentId: string; score: number }>
): OutlierResult[] {
  if (students.length === 0) return [];

  const scores = students.map((s) => s.score);
  const m = mean(scores);
  const sd = stdDev(scores);

  if (sd === 0) return []; // all scores identical — no meaningful outliers

  const threshold = 2 * sd;
  const results: OutlierResult[] = [];

  for (const student of students) {
    const deviation = student.score - m;
    if (Math.abs(deviation) > threshold) {
      results.push({
        studentId: student.studentId,
        score: student.score,
        direction: deviation > 0 ? 'above' : 'below',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// calculateSkillMastery
// ---------------------------------------------------------------------------

interface GradedStudentInput {
  studentId: string;
  perQuestion: Array<{ questionNumber: number; isCorrect: boolean }>;
}

interface SkillMappingEntry {
  questionNumber: number;
  primarySkill: { value: string };
}

/**
 * Computes per-skill mastery for the class and for each individual student.
 * A student's mastery on a skill = (correct answers on skill questions) / (total skill questions).
 * Class mastery = average of per-student mastery values.
 */
export function calculateSkillMastery(
  gradedStudents: GradedStudentInput[],
  skillMapping: SkillMappingEntry[]
): SkillMasteryResult[] {
  // Build a map: skillTag -> question numbers
  const skillToQuestions = new Map<string, number[]>();
  for (const entry of skillMapping) {
    const tag = entry.primarySkill.value;
    const existing = skillToQuestions.get(tag) ?? [];
    existing.push(entry.questionNumber);
    skillToQuestions.set(tag, existing);
  }

  const results: SkillMasteryResult[] = [];

  for (const [skillTag, questionNumbers] of skillToQuestions) {
    const questionSet = new Set(questionNumbers);
    const perStudentMastery: SkillMasteryPerStudent[] = [];

    for (const student of gradedStudents) {
      const skillQuestions = student.perQuestion.filter((q) => questionSet.has(q.questionNumber));
      if (skillQuestions.length === 0) continue;

      const correct = skillQuestions.filter((q) => q.isCorrect).length;
      const mastery = correct / skillQuestions.length;
      perStudentMastery.push({ studentId: student.studentId, mastery });
    }

    const classMastery =
      perStudentMastery.length > 0
        ? perStudentMastery.reduce((sum, s) => sum + s.mastery, 0) / perStudentMastery.length
        : 0;

    const masteryLevel: MasteryLevel =
      classMastery > 0.8 ? 'green' : classMastery >= 0.6 ? 'yellow' : 'red';

    const studentsStrugglingCount = perStudentMastery.filter((s) => s.mastery < 0.6).length;
    const studentsProficientCount = perStudentMastery.filter((s) => s.mastery > 0.8).length;

    results.push({
      skillTag,
      classMastery,
      masteryLevel,
      studentsStrugglingCount,
      studentsProficientCount,
      perStudentMastery,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// clusterStudentsByGap
// ---------------------------------------------------------------------------

/**
 * Groups students who share the same set of skill gaps (mastery < 0.6).
 * Students with identical gap profiles are placed in the same cluster.
 * Students with no gaps are excluded from the output.
 */
export function clusterStudentsByGap(
  perStudentSkillMastery: SkillMasteryResult[]
): SkillCluster[] {
  // Build a map: studentId -> set of struggling skill tags
  const studentGaps = new Map<string, Set<string>>();

  for (const skillResult of perStudentSkillMastery) {
    for (const { studentId, mastery } of skillResult.perStudentMastery) {
      if (mastery < 0.6) {
        const gaps = studentGaps.get(studentId) ?? new Set<string>();
        gaps.add(skillResult.skillTag);
        studentGaps.set(studentId, gaps);
      }
    }
  }

  // Group students by their gap signature (sorted skill tags joined as a key)
  const signatureMap = new Map<string, { gapSkills: string[]; studentIds: string[] }>();

  for (const [studentId, gapSet] of studentGaps) {
    const sortedGaps = [...gapSet].sort();
    const key = sortedGaps.join('||');
    const existing = signatureMap.get(key);
    if (existing) {
      existing.studentIds.push(studentId);
    } else {
      signatureMap.set(key, { gapSkills: sortedGaps, studentIds: [studentId] });
    }
  }

  return [...signatureMap.values()];
}

// ---------------------------------------------------------------------------
// determineInterventionScope
// ---------------------------------------------------------------------------

/**
 * Determines whether an intervention targets the whole class, a small group,
 * or an individual student based on the number of affected students.
 */
export function determineInterventionScope(
  affectedCount: number,
  classSize: number
): InterventionScope {
  if (classSize > 0 && affectedCount / classSize > 0.5) return 'whole_class';
  if (affectedCount >= 3 && affectedCount <= 6) return 'small_group';
  return 'individual';
}

// ---------------------------------------------------------------------------
// detectAnswerKeyErrors
// ---------------------------------------------------------------------------

interface GradedStudentForKeyCheck {
  studentId: string;
  perQuestion: Array<{
    questionNumber: number;
    studentAnswer: string;
    isCorrect: boolean;
  }>;
}

/**
 * Flags questions where more than 80% of students chose the same wrong answer,
 * which may indicate an error in the answer key.
 */
export function detectAnswerKeyErrors(
  gradedStudents: GradedStudentForKeyCheck[],
  answerKey: Array<{ questionNumber: number }>
): AnswerKeyFlag[] {
  const flags: AnswerKeyFlag[] = [];

  for (const { questionNumber } of answerKey) {
    // Collect all wrong answers for this question
    const wrongAnswers: string[] = [];

    for (const student of gradedStudents) {
      const questionResult = student.perQuestion.find(
        (q) => q.questionNumber === questionNumber
      );
      if (questionResult && !questionResult.isCorrect) {
        wrongAnswers.push(questionResult.studentAnswer);
      }
    }

    const totalStudents = gradedStudents.length;
    if (totalStudents === 0 || wrongAnswers.length === 0) continue;

    // Count occurrences of each wrong answer
    const answerCounts = new Map<string, number>();
    for (const answer of wrongAnswers) {
      answerCounts.set(answer, (answerCounts.get(answer) ?? 0) + 1);
    }

    // Find the most common wrong answer
    let mostCommonAnswer = '';
    let mostCommonCount = 0;
    for (const [answer, count] of answerCounts) {
      if (count > mostCommonCount) {
        mostCommonCount = count;
        mostCommonAnswer = answer;
      }
    }

    const missRate = mostCommonCount / totalStudents;
    if (missRate > 0.8) {
      flags.push({
        questionNumber,
        flag: 'high_miss_rate',
        missRate,
        mostCommonAnswer,
      });
    }
  }

  return flags;
}
