// ---------------------------------------------------------------------------
// Prompt builder types
// ---------------------------------------------------------------------------

export type AssignmentType = 'pathA_simple' | 'pathA_detailed' | 'pathB';

export interface AnswerKeyQuestion {
  questionNumber: number;
  questionText?: string | null;
  correctAnswer: string;
  answerChoices?: string[] | null;
  points?: number;
}

export interface SkillInferenceQuestion {
  questionNumber: number;
  questionText?: string | null;
  correctAnswer?: string | null;
  answerChoices?: string[] | null;
  commonWrongAnswers?: string[];
}

export interface ComputedClassStats {
  studentsAnalyzed: number;
  studentsAbsent: number;
  meanScore: number;
  medianScore: number;
  stdDev: number;
  minScore: number;
  maxScore: number;
  distributionShape: 'normal' | 'bimodal' | 'ceiling' | 'floor' | 'uniform';
  outliers: Array<{ studentId: string; studentName: string; score: number; direction: 'above' | 'below' }>;
}

export interface ComputedSkillStat {
  skillTag: string;
  displayName: string;
  questionNumbers: number[];
  classMastery: number;
  masteryLevel: 'green' | 'yellow' | 'red';
  studentsStrugglingCount: number;
  studentsProficientCount: number;
  strugglingStudentIds: string[];
  commonWrongAnswers: Array<{ answer: string; count: number }>;
}

export interface PerStudentData {
  studentId: string;
  studentName: string;
  totalScore: number;
  perQuestion: Array<{
    questionNumber: number;
    studentAnswer: string;
    isCorrect: boolean;
  }>;
  skillPerformance?: Array<{
    skillTag: string;
    mastery: number;
    questionsAttempted: number;
    questionsCorrect: number;
  }>;
}

export interface ClassContext {
  gradeLevel: string;
  subject: string;
  assignmentTitle: string;
  totalPoints: number;
  questionCount: number;
  answerKeyFlags?: Array<{ questionNumber: number; missRate: number; mostCommonAnswer: string }>;
}

// OpenRouter messages array entry
export type MessageContent = string | Array<unknown>;
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

/**
 * Builds the messages array for the vision extraction call.
 *
 * The caller is responsible for appending the actual image content parts to
 * the user message after calling this function. This function returns the
 * system prompt and the text portion of the user message. The caller should
 * merge the image parts into the user message content array before sending
 * to OpenRouter.
 *
 * @param assignmentType  'pathA_simple' | 'pathA_detailed' | 'pathB'
 * @param questionCount   Total number of questions on the assignment (0 for Path A-Simple)
 * @param answerKey       Answer key questions (only passed for reference context; NOT
 *                        included in the prompt for Path B to avoid biasing extraction)
 * @param imageCount      Number of images being sent in this request
 */
export function buildExtractionPrompt(
  assignmentType: AssignmentType,
  questionCount: number,
  answerKey: AnswerKeyQuestion[] | null,
  imageCount: number,
): ChatMessage[] {
  const systemPrompt = `You are an expert at reading scanned or photographed student assignment papers. Your job is to accurately extract student names, answers, and scores from images of completed student work.

IMPORTANT RULES:
- Return ONLY valid JSON. No prose, no explanation outside the JSON.
- All confidence values must be decimals between 0 and 1 (never percentages like 0.95 expressed as 95).
- Never invent students or answers. Only extract what is visibly present on the paper.
- If a field is not visible or not applicable, omit it or use the default value specified in the schema.

CONFIDENCE CALIBRATION:
- 1.0: Printed text, clearly legible, zero ambiguity
- 0.8–0.9: Clear handwriting, high confidence in reading
- 0.6–0.8: Somewhat legible, reasonable interpretation
- 0.4–0.6: Difficult to read, multiple interpretations possible
- Below 0.4: Essentially guessing — flag for teacher review

DISTINGUISHING STUDENT WRITING FROM TEACHER MARKS:
- Student answers are typically in pencil or blue/black ink.
- Teacher marks are typically in red ink and include checkmarks (✓), X marks, circled items, written scores, or point annotations.
- Extract student-written answers only. Ignore teacher marks except when told to use them (Path A-Detailed).
- If you cannot distinguish student writing from teacher marking on a specific question, set that question's confidence below 0.5 and add "marking_conflict" to the student's flags array.

MULTI-STUDENT IMAGE HANDLING:
- Each image may contain between 1 and 4 student papers. Extract each student separately.
- Only extract complete, fully visible papers. If a paper is partially cut off or only an edge is visible, set partialPapersDetected: true in metadata and skip that paper.
- If two pages appear to belong to the same student (same name visible on both), set their sourceImageIndex values accordingly and note the connection.
- Process the images in the order provided; image index starts at 0.`;

  const pathInstructions = buildPathInstructions(assignmentType, questionCount, answerKey);

  const userText = `Please extract all student data from the ${imageCount} image${imageCount !== 1 ? 's' : ''} provided.

${pathInstructions}

Return JSON matching this exact structure:
{
  "extractedStudents": [
    {
      "extractionIndex": 0,
      "sourceImageIndex": 0,
      "rawName": "string — student name as written on the paper",
      "nameConfidence": 0.95,
      "answers": [
        {
          "questionNumber": 1,
          "extractedAnswer": "string — the student's answer (letter, word, or value)",
          "confidence": 0.9,
          "multipleAnswersDetected": false
        }
      ],
      "totalScore": {
        "raw": "string — original format e.g. '8/10' or '80%' or null if not visible",
        "normalized": 0.8,
        "confidence": 0.95
      },
      "flags": []
    }
  ],
  "metadata": {
    "totalExtracted": 1,
    "imagesProcessed": ${imageCount},
    "partialPapersDetected": false,
    "processingTimeMs": 0
  }
}

Known flag codes: "low_confidence_name", "low_confidence_score", "multiple_answers_q{N}" (replace N with question number), "marking_conflict".

Increment extractionIndex sequentially starting from 0 across all students across all images.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];
}

function buildPathInstructions(
  assignmentType: AssignmentType,
  questionCount: number,
  _answerKey: AnswerKeyQuestion[] | null,
): string {
  switch (assignmentType) {
    case 'pathA_simple':
      return `EXTRACTION MODE: Path A — Simple (Total Score Only)

- Look for a total score written on the paper. It is typically at the top or bottom.
- Common formats: "8/10", "80%", "B+", a circled number, or a fraction.
- Extract the student's name and total score ONLY.
- Do NOT attempt to extract individual question answers. Leave the "answers" array empty ([]).
- For letter grades (A, B+, etc.), set normalized to: A=0.95, A-=0.92, B+=0.88, B=0.85, B-=0.82, C+=0.78, C=0.75, C-=0.72, D=0.65, F=0.5. Set confidence to 0.7 for letter grade conversions.
- If no total score is visible, set totalScore to null and add "low_confidence_score" to flags.`;

    case 'pathA_detailed':
      return `EXTRACTION MODE: Path A — Detailed (Per-Question Marks Visible)

- The teacher has already graded these papers. Extract the teacher's marks per question.
- Look for individual question marks: checkmarks (✓ = correct), X marks (✗ = incorrect), circled answers, points written per question.
- For each question (1 through ${questionCount}), set extractedAnswer to "correct" if the teacher marked it right, or "incorrect" if marked wrong. If the actual written answer is also visible and legible, include it instead of "correct"/"incorrect".
- Also extract the total score if visible.
- If a question has no visible teacher mark, omit it from the answers array.
- Add "marking_conflict" to flags if you cannot determine the teacher's marking on a question.`;

    case 'pathB':
      return `EXTRACTION MODE: Path B — Objective/Ungraded (Extract Raw Student Answers)

- These papers have NOT been graded yet. Do NOT look for or use any answer key.
- Extract the student's selected answer for each question (1 through ${questionCount}).
- Look for: circled letters (A, B, C, D), filled/bubbled circles, written letters, or written short answers.
- Do NOT determine whether answers are correct or incorrect — that will be done algorithmically after extraction.
- Set extractedAnswer to exactly what the student wrote or selected (e.g., "A", "B", "Paris", "42").
- If a student selected two answers for the same question, set multipleAnswersDetected: true for that question.
- Leave the totalScore field as null — no scores are computed at this stage.`;
  }
}

// ---------------------------------------------------------------------------
// Skill inference prompt
// ---------------------------------------------------------------------------

/**
 * Builds the messages array for the skill inference call.
 *
 * @param questions          Array of question objects from the answer key
 * @param learningObjectives Optional teacher-provided learning objectives text
 * @param gradeLevel         e.g. "5"
 * @param subject            e.g. "Math"
 */
export function buildSkillInferencePrompt(
  questions: SkillInferenceQuestion[],
  learningObjectives: string | null,
  gradeLevel: string,
  subject: string,
): ChatMessage[] {
  const systemPrompt = `You are an expert K-12 curriculum analyst. Your job is to map assessment questions to the educational skills they measure.

SKILL TAG GRANULARITY GUIDANCE:
- Too broad (avoid): "math skills", "reading comprehension", "science knowledge"
- Too narrow (avoid): "multiplying 7 by 8", "identifying the word 'photosynthesis'", "question 3 answer"
- Just right (target): "fraction addition unlike denominators", "main idea inference", "cell membrane function", "two-digit multiplication"

The right granularity is a teachable topic — something a teacher would plan a lesson around, but specific enough to guide a targeted intervention.

SKILL TAG FORMAT:
- Use lowercase with spaces: "fraction addition unlike denominators"
- Keep under 6 words
- Avoid question numbers in skill tags
- Each skill tag must be distinct and non-overlapping

IMPORTANT RULES:
- Return ONLY valid JSON. No prose, no explanation outside the JSON.
- Map every question to exactly one primarySkill.
- secondarySkills is optional — only include if a question clearly tests more than one skill.
- All confidence values must be decimals between 0 and 1.
- evidence should be a brief (1-2 sentence) explanation of why this skill applies.`;

  const objectivesSection = learningObjectives
    ? `\nTEACHER-PROVIDED LEARNING OBJECTIVES (use these as preferred vocabulary for skill tags when relevant):\n${learningObjectives}\n`
    : '';

  const questionsText = questions
    .map((q) => {
      const lines: string[] = [`Q${q.questionNumber}:`];
      if (q.questionText) lines.push(`  Text: ${q.questionText}`);
      if (q.correctAnswer) lines.push(`  Correct answer: ${q.correctAnswer}`);
      if (q.answerChoices && q.answerChoices.length > 0) {
        lines.push(`  Answer choices: ${q.answerChoices.join(', ')}`);
      }
      if (q.commonWrongAnswers && q.commonWrongAnswers.length > 0) {
        lines.push(`  Common wrong answers: ${q.commonWrongAnswers.join(', ')}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const userText = `Map the following ${subject} assessment questions (Grade ${gradeLevel}) to educational skill tags.
${objectivesSection}
QUESTIONS:
${questionsText}

Return JSON matching this exact structure:
{
  "skillMapping": [
    {
      "questionNumber": 1,
      "primarySkill": {
        "value": "skill tag here",
        "confidence": 0.9,
        "evidence": "Brief explanation of why this skill applies to this question.",
        "status": "pending",
        "teacherOverride": null,
        "teacherNote": null
      },
      "secondarySkills": []
    }
  ],
  "uniqueSkillsSummary": [
    {
      "skillTag": "skill tag here",
      "displayName": "Human-Readable Skill Name",
      "questionCount": 3,
      "questionNumbers": [1, 4, 7]
    }
  ],
  "learningObjectivesUsed": ${learningObjectives ? 'true' : 'false'}
}

Include an entry in skillMapping for every question: ${questions.map((q) => q.questionNumber).join(', ')}.
In uniqueSkillsSummary, list each distinct skill once with its display name (title-cased, readable), question count, and question numbers.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];
}

// ---------------------------------------------------------------------------
// Analysis prompt
// ---------------------------------------------------------------------------

/**
 * Builds the messages array for the Pass 2 analysis call.
 *
 * The AI receives pre-computed statistics as authoritative facts and is asked
 * to generate ONLY interpretive content (summaries, misconception
 * explanations, intervention descriptions). It must not recalculate or
 * contradict the provided statistics.
 *
 * @param computedStats   Pre-computed class-level statistics
 * @param skillStats      Per-skill computed statistics (empty array for Path A-Simple)
 * @param perStudentData  Per-student score and per-question data
 * @param classContext    Assignment and class metadata
 */
export function buildAnalysisPrompt(
  computedStats: ComputedClassStats,
  skillStats: ComputedSkillStat[],
  perStudentData: PerStudentData[],
  classContext: ClassContext,
): ChatMessage[] {
  const n = computedStats.studentsAnalyzed;
  const useCountsNotPercents = n < 10;

  const systemPrompt = `You are an expert K-12 instructional coach analyzing student assessment data. Your role is to interpret pre-computed statistics and generate actionable, teacher-friendly insights.

CRITICAL RULES:
1. The statistics provided are MATHEMATICALLY CORRECT. Do NOT recalculate, restate as different numbers, or contradict them.
2. Generate ONLY interpretive content: one-sentence summaries, misconception explanations, and intervention descriptions.
3. Return ONLY valid JSON. No prose outside the JSON structure.
4. ${useCountsNotPercents ? 'SMALL CLASS RULE: This class has fewer than 10 students. Use counts ("3 students") NOT percentages ("60%") in all text. Percentages are misleading with small groups.' : 'You may use either counts or percentages in text, but be consistent within each section.'}
5. Interventions: generate a MAXIMUM of 3. Prioritize by impact — whole-class gaps first, then small-group, then individual.
6. Each intervention must target exactly one skill gap and have all three effort tiers.
7. Keep all text teacher-friendly, specific, and actionable. Avoid jargon.
8. affectedStudentIds in each intervention must be drawn ONLY from the list of students provided as struggling with that skill.`;

  const statsSection = buildStatsSection(computedStats);
  const skillSection = buildSkillSection(skillStats, useCountsNotPercents);
  const studentSection = buildStudentSection(perStudentData);
  const answerKeyFlagSection = buildAnswerKeyFlagSection(classContext.answerKeyFlags);

  const schemaSection = buildAnalysisResponseSchema(skillStats.length > 0);

  const userText = `Analyze the following classroom assessment data for ${classContext.subject} (Grade ${classContext.gradeLevel}).
Assignment: "${classContext.assignmentTitle}" — ${classContext.questionCount} questions, ${classContext.totalPoints} points total.
Students analyzed: ${n} | Students absent: ${computedStats.studentsAbsent}

${statsSection}
${skillSection}
${studentSection}
${answerKeyFlagSection}

${schemaSection}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];
}

// ---------------------------------------------------------------------------
// Analysis prompt helpers
// ---------------------------------------------------------------------------

function buildStatsSection(stats: ComputedClassStats): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const outlierText =
    stats.outliers.length === 0
      ? 'None'
      : stats.outliers
          .map((o) => `${o.studentName} (${pct(o.score)}, ${o.direction})`)
          .join('; ');

  return `COMPUTED STATISTICS (do not contradict these):
- Mean score: ${pct(stats.meanScore)} (${stats.meanScore.toFixed(3)})
- Median score: ${pct(stats.medianScore)} (${stats.medianScore.toFixed(3)})
- Std deviation: ${pct(stats.stdDev)} (${stats.stdDev.toFixed(3)})
- Min: ${pct(stats.minScore)} | Max: ${pct(stats.maxScore)}
- Distribution shape: ${stats.distributionShape}
- Outliers (>2 SD from mean): ${outlierText}`;
}

function buildSkillSection(skillStats: ComputedSkillStat[], useCountsNotPercents: boolean): string {
  if (skillStats.length === 0) {
    return 'SKILL DATA: Not available (score-only assignment — no per-question data).';
  }

  const lines = ['SKILL MASTERY (computed — do not contradict):'];
  for (const skill of skillStats) {
    const masteryPct = `${(skill.classMastery * 100).toFixed(1)}%`;
    const level = skill.masteryLevel.toUpperCase();
    const countInfo = useCountsNotPercents
      ? `${skill.studentsStrugglingCount} student${skill.studentsStrugglingCount !== 1 ? 's' : ''} struggling`
      : `${skill.studentsStrugglingCount} struggling / ${skill.studentsProficientCount} proficient`;

    lines.push(`- "${skill.skillTag}" (${skill.displayName})`);
    lines.push(`  Class mastery: ${masteryPct} [${level}] | Questions: ${skill.questionNumbers.join(', ')} | ${countInfo}`);
    lines.push(`  Struggling student IDs: ${skill.strugglingStudentIds.join(', ') || 'none'}`);

    if (skill.commonWrongAnswers.length > 0) {
      const wrongAnswerText = skill.commonWrongAnswers
        .map((w) => `"${w.answer}" (${w.count} students)`)
        .join(', ');
      lines.push(`  Common wrong answers: ${wrongAnswerText}`);
    }
  }
  return lines.join('\n');
}

function buildStudentSection(perStudentData: PerStudentData[]): string {
  if (perStudentData.length === 0) {
    return 'PER-STUDENT DATA: None available.';
  }

  const lines = ['PER-STUDENT DATA:'];
  for (const student of perStudentData) {
    const scorePct = `${(student.totalScore * 100).toFixed(1)}%`;
    lines.push(`- ${student.studentName} (ID: ${student.studentId}): ${scorePct}`);

    if (student.perQuestion.length > 0) {
      const wrongQs = student.perQuestion
        .filter((q) => !q.isCorrect)
        .map((q) => `Q${q.questionNumber}="${q.studentAnswer}"`)
        .join(', ');
      if (wrongQs) {
        lines.push(`  Wrong answers: ${wrongQs}`);
      }
    }

    if (student.skillPerformance && student.skillPerformance.length > 0) {
      const gapSkills = student.skillPerformance
        .filter((sp) => sp.mastery < 0.6)
        .map((sp) => `"${sp.skillTag}" (${(sp.mastery * 100).toFixed(0)}%)`)
        .join(', ');
      if (gapSkills) {
        lines.push(`  Skill gaps: ${gapSkills}`);
      }
    }
  }
  return lines.join('\n');
}

function buildAnswerKeyFlagSection(
  flags?: Array<{ questionNumber: number; missRate: number; mostCommonAnswer: string }>,
): string {
  if (!flags || flags.length === 0) return '';

  const lines = [
    '\nANSWER KEY FLAGS (questions with suspiciously high miss rates — mention if relevant):',
  ];
  for (const flag of flags) {
    lines.push(
      `- Q${flag.questionNumber}: ${(flag.missRate * 100).toFixed(0)}% of students chose "${flag.mostCommonAnswer}" instead of the correct answer. Possible answer key error.`,
    );
  }
  return lines.join('\n');
}

function buildAnalysisResponseSchema(hasSkillData: boolean): string {
  const skillBreakdownSchema = hasSkillData
    ? `  "skillBreakdown": [
    {
      "skillTag": "matches the skillTag from skill data above",
      "commonWrongAnswers": [
        {
          "answer": "the wrong answer students chose",
          "misconception": "1-2 sentence explanation of the likely misunderstanding behind this wrong answer"
        }
      ]
    }
  ],`
    : '  "skillBreakdown": [],';

  const interventionPlanNote = `"interventionPlan": {
        "summary": "1-2 sentences: what this specific student needs to work on and why, referencing their specific wrong answers",
        "steps": [
          "Step 1: A specific, actionable activity the teacher can do with this student (e.g., 'Review Q3 and Q7 together — ask the student to explain their approach to adding fractions')",
          "Step 2: A follow-up practice activity (e.g., 'Have the student complete 5 fraction addition problems using visual fraction strips')",
          "Step 3: A check for understanding (e.g., 'Give 2 new problems and ask the student to talk through each step aloud')"
        ]
      }`;

  const studentInsightsSchema = hasSkillData
    ? `  "studentInsights": [
    {
      "studentId": "must match a student ID from the per-student data above",
      "wrongAnswerAnalysis": [
        {
          "questionNumber": 1,
          "studentAnswer": "the wrong answer given",
          "misconception": "1-2 sentence explanation of this student's likely misunderstanding"
        }
      ],
      "gapAreas": ["skillTag1", "skillTag2"],
      ${interventionPlanNote}
    }
  ],`
    : `  "studentInsights": [
    {
      "studentId": "must match a student ID from the per-student data above",
      "wrongAnswerAnalysis": [],
      "gapAreas": [],
      ${interventionPlanNote}
    }
  ],`;

  return `RESPOND WITH JSON matching this exact structure (your output replaces the placeholder comments):

{
  "classSummary": {
    "oneSentence": "A single sentence summarizing class performance on this assignment. Be specific — reference the subject, the distribution shape, and the most notable gap or strength."
  },
${skillBreakdownSchema}
${studentInsightsSchema}
  "interventions": [
    {
      "priority": 1,
      "scope": "whole_class | small_group | individual",
      "skillTag": "must match a skillTag from the skill data above, or use a score-band description for Path A-Simple",
      "displayName": "Human-Readable Skill or Group Name",
      "affectedStudentIds": ["studentId1", "studentId2"],
      "affectedCount": 2,
      "misconceptionSummary": "1-2 sentences describing the shared misunderstanding or gap these students have.",
      "effortTiers": {
        "quick": {
          "label": "Short label (e.g. '5-Minute Warm-Up')",
          "description": "Specific, actionable description of what the teacher does in 5-10 minutes."
        },
        "lesson": {
          "label": "Short label (e.g. '30-Minute Reteach')",
          "description": "Specific, actionable description of a 20-40 minute re-teaching activity."
        },
        "individual": {
          "label": "Short label (e.g. '1-on-1 Check-In')",
          "description": "Specific, actionable description of a targeted 1-on-1 intervention."
        }
      }
    }
  ]
}

CONSTRAINTS:
- Maximum 3 interventions. Rank by impact (whole-class > small-group > individual).
- Each intervention targets exactly one skill or score band.
- affectedStudentIds must contain ONLY student IDs listed as struggling with that skill above.
- All studentId values in studentInsights must exactly match IDs from the per-student data.
- Do not include numeric statistics in oneSentence or misconception text — the frontend displays the computed numbers separately.
- gapAreas arrays must contain only skillTags that appear in the skill data above. Students with 100% total score must have empty gapAreas.
- interventionPlan: Generate for EVERY student who scored below 80%. For students at 80%+, set interventionPlan to null. The plan should be personalized — reference the student's specific wrong answers and misconceptions, not generic advice. Each step must be concrete and actionable (what the teacher physically does with the student).`;
}

// ---------------------------------------------------------------------------
// Answer key extraction prompt
// ---------------------------------------------------------------------------

/**
 * Builds the messages array for extracting correct answers from a
 * photographed answer key. The caller appends the image content part
 * to the user message before sending to OpenRouter.
 *
 * @param questionCount  Number of questions the teacher specified in Step 2
 */
export function buildAnswerKeyExtractionPrompt(questionCount: number): ChatMessage[] {
  const systemPrompt = `You are an expert at reading scanned or photographed answer keys for student assignments. Your job is to accurately extract the correct answer for each question from an image of a completed answer key.

IMPORTANT RULES:
- Return ONLY valid JSON. No prose, no explanation outside the JSON.
- All confidence values must be decimals between 0 and 1.
- Never invent answers. Only extract what is visibly written on the paper.
- If a question's answer is not visible or illegible, still include it with an empty correctAnswer and low confidence.

CONFIDENCE CALIBRATION:
- 1.0: Printed text, clearly legible, zero ambiguity
- 0.8-0.9: Clear handwriting, high confidence in reading
- 0.6-0.8: Somewhat legible, reasonable interpretation
- 0.4-0.6: Difficult to read, multiple interpretations possible
- Below 0.4: Essentially guessing

WHAT TO EXTRACT:
- The correct answer for each question (letter choice, word, number, or short phrase)
- Question text if visible (the actual question being asked)
- Answer choices if visible (e.g., A, B, C, D options)
- This is an ANSWER KEY — every answer shown is the CORRECT answer`;

  const userText = `This image shows a completed answer key for an assignment with ${questionCount} questions. Extract the correct answer for each question.

If question text or answer choices are visible on the page, include those too. If only the answers are visible (e.g., a list of letters like "1. A, 2. C, 3. B"), that is fine — extract what you can see.

Return JSON matching this exact structure:
{
  "questions": [
    {
      "questionNumber": 1,
      "correctAnswer": "the correct answer as written",
      "confidence": 0.95,
      "questionText": "the question text if visible, or null",
      "answerChoices": ["A option", "B option", "C option", "D option"] or null
    }
  ]
}

Extract exactly ${questionCount} questions, numbered 1 through ${questionCount}. If a question is not visible on the page, include it with an empty correctAnswer string and confidence 0.0.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];
}
