import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { beforeUserCreated } from 'firebase-functions/v2/identity';
import * as admin from 'firebase-admin';
import { callOpenRouter } from './shared/openrouter';
import {
  buildExtractionPrompt,
  buildAnswerKeyExtractionPrompt,
  buildSkillInferencePrompt,
  buildAnalysisPrompt,
  type AssignmentType,
} from './shared/prompts';
import { matchRoster, type RosterStudent } from './pipeline/rosterMatch';
import { gradeStudents, type AnswerKeyQuestion } from './pipeline/grade';
import {
  calculateClassStats,
  detectDistributionShape,
  detectOutliers,
  calculateSkillMastery,
  determineInterventionScope,
  detectAnswerKeyErrors,
} from './pipeline/computeStats';

admin.initializeApp();

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyOwnership(assignmentId: string, uid: string) {
  const doc = await db.collection('assignments').doc(assignmentId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Assignment not found');
  if (doc.data()?.teacherId !== uid)
    throw new HttpsError('permission-denied', 'Not your assignment');
  return doc;
}

async function getRoster(classId: string): Promise<RosterStudent[]> {
  const snap = await db
    .collection('classes')
    .doc(classId)
    .collection('students')
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      studentId: d.id,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      displayName: data.displayName || '',
      knownAliases: data.knownAliases || [],
    };
  });
}

function generateId(): string {
  return db.collection('_').doc().id;
}

// ---------------------------------------------------------------------------
// Auth trigger: create teacher profile on new user
// ---------------------------------------------------------------------------

export const onUserCreate = beforeUserCreated(async (event) => {
  const user = event.data;
  if (!user) return;

  await db.collection('teachers').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    isAdmin: false,
    preferences: {
      confidenceThreshold: 0.7,
      autoConfirmExact: true,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

// ---------------------------------------------------------------------------
// runExtraction — Vision AI extraction from images
// ---------------------------------------------------------------------------

export const runExtraction = onCall(
  { timeoutSeconds: 300, secrets: ['OPENROUTER_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { assignmentId } = request.data as { assignmentId: string };
    if (!assignmentId) throw new HttpsError('invalid-argument', 'assignmentId required');

    const assignmentDoc = await verifyOwnership(assignmentId, request.auth.uid);
    const assignment = assignmentDoc.data()!;

    await db.collection('assignments').doc(assignmentId).update({
      status: 'extracting',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // Determine assignment type
      let assignmentType: AssignmentType = 'pathA_simple';
      if (assignment.type === 'objective') {
        assignmentType = 'pathB';
      } else if (assignment.questionCount && assignment.questionCount > 0) {
        assignmentType = 'pathA_detailed';
      }

      // Build prompt
      const promptMessages = buildExtractionPrompt(
        assignmentType,
        assignment.questionCount || 0,
        assignment.answerKey || null,
        (assignment.imageUrls || []).length,
      );

      // Download images from Storage and build vision content parts
      const bucket = admin.storage().bucket();
      const imageUrls: string[] = assignment.imageUrls || [];
      const imageParts: Array<{ type: string; image_url: { url: string } }> = [];

      for (const imagePath of imageUrls) {
        const file = bucket.file(imagePath);
        const [buffer] = await file.download();
        const base64 = buffer.toString('base64');
        const [metadata] = await file.getMetadata();
        const contentType = metadata.contentType || 'image/jpeg';
        imageParts.push({
          type: 'image_url',
          image_url: { url: `data:${contentType};base64,${base64}` },
        });
      }

      // Combine text prompt with image content parts for vision
      const userMessage = promptMessages.find((m) => m.role === 'user');
      const systemMessage = promptMessages.find((m) => m.role === 'system');

      const messages: Array<{ role: string; content: string | Array<unknown> }> = [];
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage.content as string });
      }
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userMessage?.content as string || '' },
          ...imageParts,
        ],
      });

      const startTime = Date.now();
      const response = await callOpenRouter('extraction', messages);
      const processingTimeMs = Date.now() - startTime;

      // Parse extraction result
      let extractionResult;
      try {
        extractionResult = JSON.parse(response.content);
      } catch {
        throw new HttpsError('internal', 'Failed to parse extraction response');
      }

      // Normalize the extraction result
      const extractionId = generateId();
      const normalizedResult = {
        extractionId,
        assignmentId,
        sourceType: 'image',
        extractedStudents: (extractionResult.extractedStudents || []).map(
          (s: Record<string, unknown>, i: number) => ({
            extractionIndex: i,
            sourceImageIndex: (s.sourceImageIndex as number) || 0,
            rawName: ((s.rawName as string) || '').trim(),
            nameConfidence: clampConfidence(s.nameConfidence as number),
            answers: (s.answers as Array<Record<string, unknown>> || []).map(
              (a: Record<string, unknown>) => ({
                questionNumber: a.questionNumber,
                extractedAnswer: a.extractedAnswer || '',
                confidence: clampConfidence(a.confidence as number),
                multipleAnswersDetected: a.multipleAnswersDetected || false,
              }),
            ),
            totalScore: {
              raw: (s.totalScore as Record<string, unknown>)?.raw || '0',
              normalized: clampConfidence(
                (s.totalScore as Record<string, unknown>)?.normalized as number,
              ),
              confidence: clampConfidence(
                (s.totalScore as Record<string, unknown>)?.confidence as number,
              ),
            },
            flags: s.flags || [],
          }),
        ),
        metadata: {
          totalExtracted: (extractionResult.extractedStudents || []).length,
          imagesProcessed: imageUrls.length,
          partialPapersDetected: extractionResult.metadata?.partialPapersDetected || false,
          processingTimeMs,
        },
      };

      // Run roster matching
      const roster = await getRoster(assignment.classId);
      const extractedNames = normalizedResult.extractedStudents.map(
        (s: { extractionIndex: number; rawName: string }) => ({
          extractionIndex: s.extractionIndex,
          rawName: s.rawName,
        }),
      );
      const rosterMatchResult = matchRoster(extractedNames, roster, 0.7);

      // Write to pipelineState
      await db.collection('assignments').doc(assignmentId).update({
        'pipelineState.extractionResult': normalizedResult,
        'pipelineState.rosterMatchResult': rosterMatchResult,
        status: 'needs_review',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (err: unknown) {
      await db.collection('assignments').doc(assignmentId).update({
        status: 'error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (err instanceof HttpsError) throw err;
      console.error('[runExtraction] Error:', err);
      throw new HttpsError('internal', 'Extraction failed');
    }
  },
);

function clampConfidence(val: unknown): number {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  if (val > 1) return val / 100; // Handle 95 → 0.95
  return Math.max(0, Math.min(1, val));
}

// ---------------------------------------------------------------------------
// extractAnswerKey — Vision AI extraction from answer key photo
// ---------------------------------------------------------------------------

export const extractAnswerKey = onCall(
  { timeoutSeconds: 300, secrets: ['OPENROUTER_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const { questionCount, imageUrl } = request.data as {
      questionCount: number;
      imageUrl: string;
    };

    if (!questionCount || questionCount <= 0) {
      throw new HttpsError('invalid-argument', 'questionCount must be a positive integer');
    }
    if (!imageUrl) {
      throw new HttpsError('invalid-argument', 'imageUrl is required');
    }

    // Verify caller is a teacher
    const teacherDoc = await db.collection('teachers').doc(request.auth.uid).get();
    if (!teacherDoc.exists) {
      throw new HttpsError('permission-denied', 'Teacher profile not found');
    }

    try {
      // Download image from Storage
      const bucket = admin.storage().bucket();
      const file = bucket.file(imageUrl);
      const [buffer] = await file.download();
      const base64 = buffer.toString('base64');
      const [metadata] = await file.getMetadata();
      const contentType = (metadata.contentType as string) || 'image/jpeg';

      // Build prompt
      const promptMessages = buildAnswerKeyExtractionPrompt(questionCount);
      const userMessage = promptMessages.find((m) => m.role === 'user');
      const systemMessage = promptMessages.find((m) => m.role === 'system');

      const messages: Array<{ role: string; content: string | Array<unknown> }> = [];
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage.content as string });
      }
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: (userMessage?.content as string) || '' },
          {
            type: 'image_url',
            image_url: { url: `data:${contentType};base64,${base64}` },
          },
        ],
      });

      // Call OpenRouter with the extraction model (vision-capable)
      const response = await callOpenRouter('extraction', messages);

      // Parse response
      let parsed;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        throw new HttpsError('internal', 'Failed to parse answer key extraction response');
      }

      // Normalize the extracted questions
      const questions = (parsed.questions || []).map(
        (q: Record<string, unknown>, i: number) => ({
          questionNumber: (q.questionNumber as number) || i + 1,
          correctAnswer: ((q.correctAnswer as string) || '').trim(),
          confidence: clampConfidence(q.confidence as number),
          questionText: (q.questionText as string) || null,
          answerChoices: Array.isArray(q.answerChoices) ? q.answerChoices : null,
        }),
      );

      return { questions };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      console.error('[extractAnswerKey] Error:', err);
      throw new HttpsError('internal', 'Answer key extraction failed');
    }
  },
);

// ---------------------------------------------------------------------------
// runCsvExtraction — CSV data (no AI call)
// ---------------------------------------------------------------------------

export const runCsvExtraction = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const { assignmentId, extractionResult } = request.data as {
    assignmentId: string;
    extractionResult: Record<string, unknown>;
  };
  if (!assignmentId) throw new HttpsError('invalid-argument', 'assignmentId required');
  if (!extractionResult) throw new HttpsError('invalid-argument', 'extractionResult required');

  const assignmentDoc = await verifyOwnership(assignmentId, request.auth.uid);
  const assignment = assignmentDoc.data()!;

  // Normalize and store the extraction result from the frontend
  const extractionId = generateId();
  const normalizedResult = {
    ...extractionResult,
    extractionId,
    assignmentId,
    sourceType: 'csv',
  };

  // Run roster matching
  const roster = await getRoster(assignment.classId);
  const students = (extractionResult.extractedStudents as Array<Record<string, unknown>>) || [];
  const extractedNames = students.map(
    (s: Record<string, unknown>, i: number) => ({
      extractionIndex: i,
      rawName: ((s.rawName as string) || '').trim(),
    }),
  );
  const rosterMatchResult = matchRoster(extractedNames, roster, 0.7);

  await db.collection('assignments').doc(assignmentId).update({
    'pipelineState.extractionResult': normalizedResult,
    'pipelineState.rosterMatchResult': rosterMatchResult,
    status: 'needs_review',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// ---------------------------------------------------------------------------
// submitValidation — Teacher confirms/corrects extracted data
// ---------------------------------------------------------------------------

export const submitValidation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const { assignmentId, validatedResult } = request.data as {
    assignmentId: string;
    validatedResult: {
      validatedStudents: Array<{
        studentId: string;
        rosterName: string;
        answers: Array<{ questionNumber: number; answer: string }>;
        totalScore: { earned: number; possible: number; normalized: number };
        status: string;
        corrections: Array<{
          field: string;
          originalValue: string;
          correctedValue: string;
          savedAsAlias: boolean;
        }>;
      }>;
      absentStudents: string[];
      excludedStudents: string[];
    };
  };
  if (!assignmentId) throw new HttpsError('invalid-argument', 'assignmentId required');
  if (!validatedResult) throw new HttpsError('invalid-argument', 'validatedResult required');

  const assignmentDoc = await verifyOwnership(assignmentId, request.auth.uid);
  const assignment = assignmentDoc.data()!;

  const validationId = generateId();
  const fullValidatedResult = {
    validationId,
    assignmentId,
    ...validatedResult,
  };

  // Save alias corrections to roster student docs
  for (const student of validatedResult.validatedStudents) {
    for (const correction of student.corrections) {
      if (correction.savedAsAlias && correction.field === 'name') {
        await db
          .collection('classes')
          .doc(assignment.classId)
          .collection('students')
          .doc(student.studentId)
          .update({
            knownAliases: admin.firestore.FieldValue.arrayUnion(correction.originalValue),
          });
      }
    }
  }

  // If Path B, run grading
  let gradedResult = null;
  if (assignment.type === 'objective' && assignment.answerKey) {
    const answerKeyQuestions: AnswerKeyQuestion[] = (assignment.answerKey.questions || []).map(
      (q: Record<string, unknown>) => ({
        questionNumber: q.questionNumber as number,
        questionText: (q.questionText as string) || null,
        correctAnswer: q.correctAnswer as string,
        answerChoices: (q.answerChoices as string[]) || null,
        points: (q.points as number) || 1,
        extraCredit: (q.extraCredit as boolean) || false,
      }),
    );

    const studentsForGrading = validatedResult.validatedStudents.map((s) => ({
      studentId: s.studentId,
      answers: s.answers,
    }));

    gradedResult = gradeStudents(studentsForGrading, answerKeyQuestions);
    gradedResult.assignmentId = assignmentId;
  }

  const updateData: Record<string, unknown> = {
    'pipelineState.validatedResult': fullValidatedResult,
    status: 'analyzing',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (gradedResult) {
    updateData['pipelineState.gradedResult'] = gradedResult;
  }

  await db.collection('assignments').doc(assignmentId).update(updateData);

  return { success: true };
});

// ---------------------------------------------------------------------------
// runAnalysis — Pass 2: skill inference + stats + analysis AI
// ---------------------------------------------------------------------------

export const runAnalysis = onCall(
  { timeoutSeconds: 300, secrets: ['OPENROUTER_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
    const { assignmentId } = request.data as { assignmentId: string };
    if (!assignmentId) throw new HttpsError('invalid-argument', 'assignmentId required');

    const assignmentDoc = await verifyOwnership(assignmentId, request.auth.uid);
    const assignment = assignmentDoc.data()!;
    const pipelineState = assignment.pipelineState || {};
    const validatedResult = pipelineState.validatedResult;
    if (!validatedResult) throw new HttpsError('failed-precondition', 'No validated data');

    const classDoc = await db.collection('classes').doc(assignment.classId).get();
    const classData = classDoc.data() || {};

    await db.collection('assignments').doc(assignmentId).update({
      status: 'analyzing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      const validatedStudents = validatedResult.validatedStudents || [];
      const gradedResult = pipelineState.gradedResult || null;
      const hasPerQuestionData =
        validatedStudents.some(
          (s: { answers?: unknown[] }) => s.answers && s.answers.length > 0,
        ) || gradedResult;

      // ---------------------------------------------------------------
      // Stage 1: Skill inference (if per-question data exists)
      // ---------------------------------------------------------------
      let skillInferenceResult = null;
      let skillUsage = null;

      if (hasPerQuestionData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const questions: any[] = [];
        if (assignment.answerKey?.questions) {
          for (const q of assignment.answerKey.questions) {
            const questionEntry: Record<string, unknown> = {
              questionNumber: q.questionNumber,
              questionText: q.questionText || null,
              correctAnswer: q.correctAnswer || null,
              answerChoices: q.answerChoices || null,
            };
            // Add common wrong answers from graded result
            if (gradedResult) {
              const wrongAnswers: Record<string, number> = {};
              for (const gs of gradedResult.gradedStudents || []) {
                const pq = (gs.perQuestion || []).find(
                  (p: { questionNumber: number }) => p.questionNumber === q.questionNumber,
                );
                if (pq && !pq.isCorrect && pq.studentAnswer) {
                  wrongAnswers[pq.studentAnswer] = (wrongAnswers[pq.studentAnswer] || 0) + 1;
                }
              }
              const sorted = Object.entries(wrongAnswers)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([answer]) => answer);
              if (sorted.length > 0) {
                questionEntry.commonWrongAnswers = sorted;
              }
            }
            questions.push(questionEntry);
          }
        } else {
          // Path A-Detailed: create question stubs from extracted data
          const questionNums = new Set<number>();
          for (const s of validatedStudents) {
            for (const a of s.answers || []) {
              questionNums.add(a.questionNumber);
            }
          }
          for (const num of Array.from(questionNums).sort((a: number, b: number) => a - b)) {
            questions.push({ questionNumber: num });
          }
        }

        if (questions.length > 0) {
          const skillMessages = buildSkillInferencePrompt(
            questions,
            assignment.learningObjectives || null,
            classData.gradeLevel || '',
            classData.subject || '',
          );

          try {
            const skillResponse = await callOpenRouter(
              'skillInference',
              skillMessages as Array<{ role: string; content: string | Array<unknown> }>,
            );
            skillUsage = skillResponse.usage;

            const parsed = JSON.parse(skillResponse.content);
            skillInferenceResult = {
              assignmentId,
              skillMapping: parsed.skillMapping || [],
              uniqueSkillsSummary: parsed.uniqueSkillsSummary || [],
              learningObjectivesUsed: parsed.learningObjectivesUsed || false,
            };

            // Post-parse: recompute uniqueSkillsSummary from skillMapping
            const skillMap = new Map<string, number[]>();
            for (const entry of skillInferenceResult.skillMapping) {
              const tag = entry.primarySkill?.value || entry.primarySkill;
              if (tag) {
                if (!skillMap.has(tag)) skillMap.set(tag, []);
                skillMap.get(tag)!.push(entry.questionNumber);
              }
            }
            skillInferenceResult.uniqueSkillsSummary = Array.from(skillMap.entries()).map(
              ([skillTag, qNums]) => ({
                skillTag,
                questionNumbers: qNums,
                questionCount: qNums.length,
              }),
            );

            await db.collection('assignments').doc(assignmentId).update({
              'pipelineState.skillInferenceResult': skillInferenceResult,
            });
          } catch (err) {
            console.warn('[runAnalysis] Skill inference failed, proceeding without:', err);
          }
        }
      }

      // ---------------------------------------------------------------
      // Stage 2: Compute class statistics
      // ---------------------------------------------------------------
      const scores = validatedStudents.map(
        (s: { totalScore: { normalized: number } }) => s.totalScore.normalized,
      );
      const classStats = calculateClassStats(scores);
      const distributionShape = detectDistributionShape(scores);
      const studentScores = validatedStudents.map(
        (s: { studentId: string; totalScore: { normalized: number } }) => ({
          studentId: s.studentId,
          score: s.totalScore.normalized,
        }),
      );
      const outliers = detectOutliers(studentScores);

      // Skill mastery (if available)
      let skillMasteryResult = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let answerKeyFlags: any[] = [];

      if (skillInferenceResult && gradedResult) {
        const gradedStudentsForMastery = (gradedResult.gradedStudents || []).map(
          (gs: {
            studentId: string;
            perQuestion: Array<{ questionNumber: number; isCorrect: boolean }>;
          }) => ({
            studentId: gs.studentId,
            perQuestion: gs.perQuestion.map(
              (pq: { questionNumber: number; isCorrect: boolean }) => ({
                questionNumber: pq.questionNumber,
                isCorrect: pq.isCorrect,
              }),
            ),
          }),
        );

        const skillMappingForStats = skillInferenceResult.skillMapping.map(
          (entry: { questionNumber: number; primarySkill: { value: string } | string }) => ({
            questionNumber: entry.questionNumber,
            primarySkill: {
              value:
                typeof entry.primarySkill === 'string'
                  ? entry.primarySkill
                  : entry.primarySkill?.value || '',
            },
          }),
        );

        skillMasteryResult = calculateSkillMastery(gradedStudentsForMastery, skillMappingForStats);

        // Answer key error detection
        if (assignment.answerKey?.questions) {
          answerKeyFlags = detectAnswerKeyErrors(
            gradedStudentsForMastery,
            assignment.answerKey.questions,
          );
        }
      }

      // ---------------------------------------------------------------
      // Stage 3: Build analysis prompt and call AI
      // ---------------------------------------------------------------
      // Build name lookup for outliers
      const studentNameMap = new Map<string, string>();
      for (const s of validatedStudents) {
        studentNameMap.set(s.studentId, s.rosterName || s.studentId);
      }

      const computedStats = {
        studentsAnalyzed: validatedStudents.length,
        studentsAbsent: (validatedResult.absentStudents || []).length,
        meanScore: classStats.mean,
        medianScore: classStats.median,
        stdDev: classStats.stdDev,
        minScore: classStats.min,
        maxScore: classStats.max,
        distributionShape,
        outliers: outliers.map((o) => ({
          ...o,
          studentName: studentNameMap.get(o.studentId) || o.studentId,
        })),
      };

      const skillStats = skillMasteryResult
        ? skillMasteryResult.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sm: any) => ({
              skillTag: sm.skillTag,
              displayName: sm.skillTag,
              questionNumbers: [] as number[],
              classMastery: sm.classMastery,
              masteryLevel: sm.masteryLevel,
              studentsStrugglingCount: sm.studentsStrugglingCount,
              studentsProficientCount: sm.studentsProficientCount,
              strugglingStudentIds: (sm.perStudentMastery || [])
                .filter((p: { mastery: number }) => p.mastery < 0.6)
                .map((p: { studentId: string }) => p.studentId),
              commonWrongAnswers: [],
            }),
          )
        : [];

      // Build per-student data for analysis prompt
      const perStudentData = validatedStudents.map(
        (s: {
          studentId: string;
          rosterName: string;
          totalScore: { normalized: number };
          answers: Array<{ questionNumber: number; answer: string }>;
        }) => {
          // Build per-question data if graded results exist
          const gradedStudent = gradedResult?.gradedStudents?.find(
            (gs: { studentId: string }) => gs.studentId === s.studentId,
          );
          const perQuestion = gradedStudent
            ? (gradedStudent.perQuestion || []).map(
                (pq: {
                  questionNumber: number;
                  studentAnswer: string;
                  isCorrect: boolean;
                }) => ({
                  questionNumber: pq.questionNumber,
                  studentAnswer: pq.studentAnswer,
                  isCorrect: pq.isCorrect,
                }),
              )
            : [];

          return {
            studentId: s.studentId,
            studentName: s.rosterName,
            totalScore: s.totalScore.normalized,
            perQuestion,
          };
        },
      );

      const classContext = {
        gradeLevel: classData.gradeLevel || '',
        subject: classData.subject || '',
        assignmentTitle: assignment.title || '',
        totalPoints: assignment.totalPoints || 0,
        questionCount: assignment.questionCount || 0,
        answerKeyFlags: answerKeyFlags.length > 0 ? answerKeyFlags : undefined,
      };

      const analysisMessages = buildAnalysisPrompt(
        computedStats,
        skillStats,
        perStudentData,
        classContext,
      );

      const analysisResponse = await callOpenRouter(
        'analysis',
        analysisMessages as Array<{ role: string; content: string | Array<unknown> }>,
      );

      let aiResult;
      try {
        aiResult = JSON.parse(analysisResponse.content);
      } catch {
        throw new HttpsError('internal', 'Failed to parse analysis response');
      }

      // ---------------------------------------------------------------
      // Stage 4: Merge computed stats with AI content
      // ---------------------------------------------------------------
      const analysisId = generateId();
      const correctionCount = validatedStudents.reduce(
        (acc: number, s: { corrections?: unknown[] }) => acc + (s.corrections?.length || 0),
        0,
      );

      // Build skill breakdown from computed + AI
      const skillBreakdown = skillMasteryResult
        ? skillMasteryResult.map(
            (sm: {
              skillTag: string;
              classMastery: number;
              masteryLevel: string;
              studentsStrugglingCount: number;
              studentsProficientCount: number;
              perStudentMastery: Array<{ studentId: string; mastery: number }>;
            }) => {
              const summaryEntry = (
                skillInferenceResult?.uniqueSkillsSummary || []
              ).find(
                (u: { skillTag: string }) => u.skillTag === sm.skillTag,
              );
              const aiBreakdown = (aiResult.skillBreakdown || []).find(
                (ab: { skillTag: string }) => ab.skillTag === sm.skillTag,
              );
              return {
                skillTag: sm.skillTag,
                displayName: aiBreakdown?.displayName || sm.skillTag,
                questionNumbers: summaryEntry?.questionNumbers || [],
                questionCount: summaryEntry?.questionCount || 0,
                classMastery: sm.classMastery,
                masteryLevel: sm.masteryLevel,
                studentsStrugglingCount: sm.studentsStrugglingCount,
                studentsProficientCount: sm.studentsProficientCount,
                commonWrongAnswers: aiBreakdown?.commonWrongAnswers || [],
              };
            },
          )
        : [];

      // Build student insights from computed + AI
      const sortedScores = scores.slice().sort((a: number, b: number) => a - b);
      const studentInsights = validatedStudents.map(
        (s: {
          studentId: string;
          rosterName: string;
          totalScore: { normalized: number };
        }) => {
          const score = s.totalScore.normalized;
          const percentile =
            sortedScores.length > 0
              ? (sortedScores.filter((sc: number) => sc <= score).length / sortedScores.length) *
                100
              : 50;
          const relativeToClass =
            score > classStats.mean + classStats.stdDev * 0.5
              ? 'above_average'
              : score < classStats.mean - classStats.stdDev * 0.5
                ? 'below_average'
                : 'average';

          const aiInsight = (aiResult.studentInsights || []).find(
            (ai: { studentId: string }) => ai.studentId === s.studentId,
          );

          // Per-student skill performance
          const skillPerformance = skillMasteryResult
            ? skillMasteryResult
                .map(
                  (sm: {
                    skillTag: string;
                    classMastery: number;
                    perStudentMastery: Array<{ studentId: string; mastery: number }>;
                  }) => {
                    const studentMastery = sm.perStudentMastery.find(
                      (psm: { studentId: string }) => psm.studentId === s.studentId,
                    );
                    return {
                      skillTag: sm.skillTag,
                      mastery: studentMastery?.mastery ?? 0,
                      classAverage: sm.classMastery,
                      gap: (studentMastery?.mastery ?? 0) - sm.classMastery,
                    };
                  },
                )
                .filter(
                  (sp: { mastery: number }) => sp.mastery !== undefined,
                )
            : [];

          const gapAreas =
            score >= 1.0
              ? []
              : skillPerformance
                  .filter((sp: { mastery: number }) => sp.mastery < 0.6)
                  .map((sp: { skillTag: string }) => sp.skillTag);

          return {
            studentId: s.studentId,
            studentName: s.rosterName,
            totalScore: score,
            relativeToClass,
            percentile: Math.round(percentile),
            skillPerformance,
            gapAreas,
            wrongAnswerAnalysis: aiInsight?.wrongAnswerAnalysis || [],
          };
        },
      );

      // Interventions from AI (max 3) with computed data
      const interventions = (aiResult.interventions || []).slice(0, 3).map(
        (
          inv: {
            skillTag: string;
            displayName: string;
            affectedStudentIds: string[];
            misconceptionSummary: string;
            effortTiers: {
              quick: { label: string; description: string };
              lesson: { label: string; description: string };
              individual: { label: string; description: string };
            };
          },
          idx: number,
        ) => {
          const affectedCount = inv.affectedStudentIds?.length || 0;
          const scope = determineInterventionScope(
            affectedCount,
            validatedStudents.length,
          );
          return {
            interventionId: generateId(),
            priority: idx + 1,
            scope,
            skillTag: inv.skillTag || '',
            displayName: inv.displayName || inv.skillTag || '',
            affectedStudentIds: inv.affectedStudentIds || [],
            affectedCount,
            misconceptionSummary: inv.misconceptionSummary || '',
            effortTiers: inv.effortTiers || {
              quick: { label: 'Quick Activity', description: '' },
              lesson: { label: 'Lesson Plan', description: '' },
              individual: { label: '1-on-1 Session', description: '' },
            },
            status: 'pending',
            teacherNote: null,
            plannedDate: null,
            selectedEffortTier: null,
          };
        },
      );

      // ---------------------------------------------------------------
      // Stage 5: Write analysis document
      // ---------------------------------------------------------------
      const analysisResult = {
        analysisId,
        assignmentId,
        classId: assignment.classId,
        generatedAt: new Date().toISOString(),
        modelUsed: analysisResponse.modelUsed,
        stale: false,
        teacherOverridesApplied: correctionCount,
        classSummary: {
          oneSentence: aiResult.classSummary?.oneSentence || '',
          studentsAnalyzed: validatedStudents.length,
          studentsAbsent: (validatedResult.absentStudents || []).length,
          meanScore: classStats.mean,
          medianScore: classStats.median,
          stdDev: classStats.stdDev,
          minScore: classStats.min,
          maxScore: classStats.max,
          distributionShape,
          outliers,
        },
        skillBreakdown,
        studentInsights,
        interventions,
      };

      // Write analysis doc
      await db.collection('analyses').doc(analysisId).set({
        ...analysisResult,
        teacherId: request.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Stage 6: Create intervention documents
      const batch = db.batch();
      for (const inv of interventions) {
        const invRef = db.collection('interventions').doc(inv.interventionId);
        batch.set(invRef, {
          ...inv,
          analysisId,
          assignmentId,
          teacherId: request.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      // Stage 7: Log usage
      const usageBatch = db.batch();
      if (skillUsage) {
        usageBatch.set(db.collection('analyses').doc(analysisId).collection('usage').doc(), {
          function: 'skillInference',
          modelUsed: 'skillInference',
          tokensIn: skillUsage.tokensIn,
          tokensOut: skillUsage.tokensOut,
          cost: skillUsage.cost,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      usageBatch.set(db.collection('analyses').doc(analysisId).collection('usage').doc(), {
        function: 'analysis',
        modelUsed: analysisResponse.modelUsed,
        tokensIn: analysisResponse.usage.tokensIn,
        tokensOut: analysisResponse.usage.tokensOut,
        cost: analysisResponse.usage.cost,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await usageBatch.commit();

      // Stage 8: Update assignment status
      await db.collection('assignments').doc(assignmentId).update({
        status: 'complete',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, analysisId };
    } catch (err: unknown) {
      await db.collection('assignments').doc(assignmentId).update({
        status: 'error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (err instanceof HttpsError) throw err;
      console.error('[runAnalysis] Error:', err);
      throw new HttpsError('internal', 'Analysis failed');
    }
  },
);

// ---------------------------------------------------------------------------
// Admin Functions
// ---------------------------------------------------------------------------

export const fetchAvailableModels = onCall(
  { secrets: ['OPENROUTER_API_KEY'], serviceAccount: 'classpulse-edu@appspot.gserviceaccount.com' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    // Try to read Firestore cache (gracefully skip on permission errors)
    let configData: FirebaseFirestore.DocumentData | undefined;
    try {
      const configDoc = await db.collection('config').doc('openrouter').get();
      configData = configDoc.data();
      const lastFetched = configData?.lastFetched?.toDate?.();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (lastFetched && lastFetched > oneDayAgo && configData?.cachedModelList) {
        return { models: configData.cachedModelList, cached: true };
      }
    } catch (cacheErr) {
      console.warn('[fetchAvailableModels] Could not read Firestore cache:', cacheErr);
    }

    // Fetch from OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new HttpsError('internal', 'OpenRouter API key not configured');

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        if (configData?.cachedModelList) {
          return { models: configData.cachedModelList, cached: true, stale: true };
        }
        throw new HttpsError('internal', 'Failed to fetch models from OpenRouter');
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          name: string;
          context_length: number;
          pricing: { prompt: string; completion: string };
          architecture?: { modality?: string; input_modalities?: string[] };
        }>;
      };
      const models = (data.data || []).map(
        (m: {
          id: string;
          name: string;
          context_length: number;
          pricing: { prompt: string; completion: string };
          architecture?: { modality?: string; input_modalities?: string[] };
        }) => {
          // Extract provider from model ID (e.g. "anthropic/claude-sonnet-4-6" → "Anthropic")
          const slug = m.id.split('/')[0] || '';
          const provider = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');

          // Detect vision support from architecture metadata
          const hasVision =
            m.architecture?.modality === 'multimodal' ||
            (m.architecture?.input_modalities || []).includes('image') ||
            m.id.includes('vision');

          return {
            id: m.id,
            name: m.name,
            provider,
            contextLength: m.context_length,
            pricing: {
              prompt: parseFloat(m.pricing?.prompt || '0') * 1000000,
              completion: parseFloat(m.pricing?.completion || '0') * 1000000,
            },
            vision: hasVision,
          };
        },
      );

      // Cache in Firestore (best-effort)
      try {
        await db.collection('config').doc('openrouter').set(
          {
            cachedModelList: models,
            lastFetched: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (writeErr) {
        console.warn('[fetchAvailableModels] Could not write Firestore cache:', writeErr);
      }

      return { models, cached: false };
    } catch (err: unknown) {
      if (configData?.cachedModelList) {
        return { models: configData.cachedModelList, cached: true, stale: true };
      }
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', 'Failed to fetch models');
    }
  },
);

export const updateModelConfig = onCall({ serviceAccount: 'classpulse-edu@appspot.gserviceaccount.com' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

  const teacherDoc = await db.collection('teachers').doc(request.auth.uid).get();
  if (!teacherDoc.exists || !teacherDoc.data()?.isAdmin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { fn, modelId } = request.data as {
    fn: 'extraction' | 'skillInference' | 'analysis';
    modelId: string;
  };

  if (!fn || !modelId) {
    throw new HttpsError('invalid-argument', 'fn and modelId are required');
  }

  if (!['extraction', 'skillInference', 'analysis'].includes(fn)) {
    throw new HttpsError('invalid-argument', 'Invalid function name');
  }

  // Verify model exists in cached list
  const configDoc = await db.collection('config').doc('openrouter').get();
  const cachedModels = configDoc.data()?.cachedModelList || [];
  const model = cachedModels.find((m: { id: string }) => m.id === modelId);

  if (!model && cachedModels.length > 0) {
    throw new HttpsError('invalid-argument', 'Model not found in catalog');
  }

  // Extraction requires vision
  if (fn === 'extraction' && model && !model.vision) {
    throw new HttpsError('invalid-argument', 'Extraction requires a vision-capable model');
  }

  await db.collection('config').doc('openrouter').set(
    {
      models: {
        [fn]: {
          modelId,
          requiresVision: fn === 'extraction',
        },
      },
    },
    { merge: true },
  );

  return { success: true };
});
