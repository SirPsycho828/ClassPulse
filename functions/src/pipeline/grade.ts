// grade.ts — Answer grading for Path B (no AI, no external dependencies)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnswerKeyQuestion {
  questionNumber: number;
  questionText: string | null;
  correctAnswer: string;
  answerChoices: string[] | null;
  points: number;
  extraCredit: boolean;
}

export interface StudentAnswerInput {
  questionNumber: number;
  answer: string;
}

export interface ValidatedStudentInput {
  studentId: string;
  answers: StudentAnswerInput[];
}

export interface GradedQuestion {
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  distractorIndex: number | null;
}

export interface GradedStudentTotal {
  earned: number;
  possible: number;
  normalized: number;
}

export interface GradedStudent {
  studentId: string;
  perQuestion: GradedQuestion[];
  total: GradedStudentTotal;
}

export interface AnswerKeyFlag {
  questionNumber: number;
  flag: string;
  missRate: number;
  mostCommonAnswer: string;
}

export interface GradedResult {
  assignmentId: string;
  gradedStudents: GradedStudent[];
  answerKeyFlags: AnswerKeyFlag[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Finds the zero-based index of the student's wrong answer within the
 * provided answer choices. Returns null if:
 *   - No answer choices are defined.
 *   - The answer is correct (not a distractor).
 *   - The chosen answer is not found in the choices list.
 */
function findDistractorIndex(
  studentAnswer: string,
  correctAnswer: string,
  answerChoices: string[] | null
): number | null {
  if (!answerChoices || answerChoices.length === 0) return null;
  if (normalizeAnswer(studentAnswer) === normalizeAnswer(correctAnswer)) return null;

  const idx = answerChoices.findIndex(
    (choice) => normalizeAnswer(choice) === normalizeAnswer(studentAnswer)
  );
  return idx === -1 ? null : idx;
}

// ---------------------------------------------------------------------------
// gradeStudents
// ---------------------------------------------------------------------------

/**
 * Grades each student's answers against the answer key and detects potential
 * answer key errors (questions where > 80% of students gave the same wrong answer).
 *
 * Extra-credit questions contribute to `earned` but not to `possible`, so a
 * student can score above 1.0 normalized if they get extra credit. This
 * matches standard educational practice.
 *
 * @param validatedStudents  Students with per-question answer strings.
 * @param answerKey          The answer key for the assignment.
 * @returns GradedResult     (without `assignmentId` pre-filled — caller must set it)
 */
export function gradeStudents(
  validatedStudents: ValidatedStudentInput[],
  answerKey: AnswerKeyQuestion[]
): GradedResult {
  // Build a fast lookup: questionNumber -> key entry
  const keyMap = new Map<number, AnswerKeyQuestion>();
  for (const question of answerKey) {
    keyMap.set(question.questionNumber, question);
  }

  // Compute total possible points (non-extra-credit questions only)
  const totalPossible = answerKey
    .filter((q) => !q.extraCredit)
    .reduce((sum, q) => sum + q.points, 0);

  const gradedStudents: GradedStudent[] = [];

  for (const student of validatedStudents) {
    const perQuestion: GradedQuestion[] = [];
    let earnedTotal = 0;

    for (const answerEntry of student.answers) {
      const keyQuestion = keyMap.get(answerEntry.questionNumber);
      if (!keyQuestion) {
        // Question not in answer key — skip gracefully
        continue;
      }

      const isCorrect =
        normalizeAnswer(answerEntry.answer) === normalizeAnswer(keyQuestion.correctAnswer);

      const pointsEarned = isCorrect ? keyQuestion.points : 0;
      const pointsPossible = keyQuestion.extraCredit ? 0 : keyQuestion.points;

      earnedTotal += pointsEarned;

      const distractorIndex = isCorrect
        ? null
        : findDistractorIndex(
            answerEntry.answer,
            keyQuestion.correctAnswer,
            keyQuestion.answerChoices
          );

      perQuestion.push({
        questionNumber: answerEntry.questionNumber,
        studentAnswer: answerEntry.answer,
        correctAnswer: keyQuestion.correctAnswer,
        isCorrect,
        pointsEarned,
        pointsPossible,
        distractorIndex,
      });
    }

    const normalized = totalPossible > 0 ? earnedTotal / totalPossible : 0;

    gradedStudents.push({
      studentId: student.studentId,
      perQuestion,
      total: {
        earned: earnedTotal,
        possible: totalPossible,
        normalized,
      },
    });
  }

  // ------------------------------------------------------------------
  // Detect answer key errors
  // ------------------------------------------------------------------
  const answerKeyFlags: AnswerKeyFlag[] = [];

  for (const keyQuestion of answerKey) {
    const { questionNumber } = keyQuestion;
    const wrongAnswers: string[] = [];

    for (const student of gradedStudents) {
      const q = student.perQuestion.find((p) => p.questionNumber === questionNumber);
      if (q && !q.isCorrect) {
        wrongAnswers.push(q.studentAnswer);
      }
    }

    const totalStudents = gradedStudents.length;
    if (totalStudents === 0 || wrongAnswers.length === 0) continue;

    // Tally wrong answers (case-insensitive, trimmed)
    const answerCounts = new Map<string, number>();
    for (const answer of wrongAnswers) {
      const key = normalizeAnswer(answer);
      answerCounts.set(key, (answerCounts.get(key) ?? 0) + 1);
    }

    // Find the most common wrong answer (use the original casing of first occurrence)
    let mostCommonKey = '';
    let mostCommonCount = 0;
    for (const [key, count] of answerCounts) {
      if (count > mostCommonCount) {
        mostCommonCount = count;
        mostCommonKey = key;
      }
    }

    // Restore original casing: find the first student answer matching the key
    const mostCommonAnswer =
      wrongAnswers.find((a) => normalizeAnswer(a) === mostCommonKey) ?? mostCommonKey;

    const missRate = mostCommonCount / totalStudents;
    if (missRate > 0.8) {
      answerKeyFlags.push({
        questionNumber,
        flag: 'high_miss_rate',
        missRate,
        mostCommonAnswer,
      });
    }
  }

  return {
    assignmentId: '', // caller must set this before persisting
    gradedStudents,
    answerKeyFlags,
  };
}
