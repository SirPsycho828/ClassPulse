import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. OverrideEnvelopeSchema
// ---------------------------------------------------------------------------
export const OverrideEnvelopeSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  status: z.enum(['pending', 'confirmed', 'corrected', 'excluded']),
  teacherOverride: z.string().nullable(),
  teacherNote: z.string().nullable(),
});
export type OverrideEnvelope = z.infer<typeof OverrideEnvelopeSchema>;

// ---------------------------------------------------------------------------
// 2. ExtractedStudentSchema
// ---------------------------------------------------------------------------
export const ExtractedStudentSchema = z.object({
  extractionIndex: z.number().int().min(0),
  sourceImageIndex: z.number().int().min(0),
  sourceImagePath: z.string().default(''),
  rawName: z.string(),
  nameConfidence: z.number().min(0).max(1),
  answers: z
    .array(
      z.object({
        questionNumber: z.number().int().min(1),
        extractedAnswer: z.string(),
        confidence: z.number().min(0).max(1),
        multipleAnswersDetected: z.boolean(),
      }),
    )
    .default([]),
  totalScore: z.object({
    raw: z.string(),
    normalized: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
  }),
  flags: z.array(z.string()).default([]),
});
export type ExtractedStudent = z.infer<typeof ExtractedStudentSchema>;

// ---------------------------------------------------------------------------
// 3. ExtractionResultSchema
// ---------------------------------------------------------------------------
export const ExtractionResultSchema = z.object({
  extractionId: z.string(),
  assignmentId: z.string(),
  sourceType: z.enum(['image', 'csv']),
  extractedStudents: z.array(ExtractedStudentSchema).default([]),
  metadata: z.object({
    totalExtracted: z.number().int().min(0),
    imagesProcessed: z.number().int().min(0),
    partialPapersDetected: z.boolean(),
    processingTimeMs: z.number(),
  }),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ---------------------------------------------------------------------------
// 4. RosterMatchSchema
// ---------------------------------------------------------------------------
export const RosterMatchSchema = z.object({
  extractionIndex: z.number().int(),
  rawName: z.string(),
  matchTier: z.enum(['exact', 'alias', 'fuzzy', 'unmatched']),
  topCandidate: z
    .object({
      studentId: z.string(),
      rosterName: z.string(),
      confidence: z.number().min(0).max(1),
    })
    .nullable(),
  otherCandidates: z
    .array(
      z.object({
        studentId: z.string(),
        rosterName: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  status: z.enum(['confirmed', 'needs_review', 'unmatched']),
});
export type RosterMatch = z.infer<typeof RosterMatchSchema>;

// ---------------------------------------------------------------------------
// 5. RosterMatchResultSchema
// ---------------------------------------------------------------------------
export const RosterMatchResultSchema = z.object({
  matches: z.array(RosterMatchSchema).default([]),
  unmatchedRosterStudents: z.array(z.string()).default([]),
  summary: z.object({
    confirmed: z.number().int(),
    needsReview: z.number().int(),
    unmatched: z.number().int(),
    absentFromSubmissions: z.number().int(),
  }),
});
export type RosterMatchResult = z.infer<typeof RosterMatchResultSchema>;

// ---------------------------------------------------------------------------
// 6. ValidatedStudentSchema
// ---------------------------------------------------------------------------
export const ValidatedStudentSchema = z.object({
  studentId: z.string(),
  rosterName: z.string(),
  answers: z
    .array(
      z.object({
        questionNumber: z.number().int().min(1),
        answer: z.string(),
      }),
    )
    .default([]),
  totalScore: z.object({
    earned: z.number(),
    possible: z.number(),
    normalized: z.number().min(0).max(1),
  }),
  status: z.enum([
    'auto_confirmed',
    'teacher_confirmed',
    'teacher_corrected',
    'manual_entry',
  ]),
  corrections: z
    .array(
      z.object({
        field: z.string(),
        originalValue: z.string(),
        correctedValue: z.string(),
        savedAsAlias: z.boolean(),
      }),
    )
    .default([]),
});
export type ValidatedStudent = z.infer<typeof ValidatedStudentSchema>;

// ---------------------------------------------------------------------------
// 7. ValidatedResultSchema
// ---------------------------------------------------------------------------
export const ValidatedResultSchema = z.object({
  validationId: z.string(),
  assignmentId: z.string(),
  validatedStudents: z.array(ValidatedStudentSchema).default([]),
  absentStudents: z.array(z.string()).default([]),
  excludedStudents: z.array(z.string()).default([]),
});
export type ValidatedResult = z.infer<typeof ValidatedResultSchema>;

// ---------------------------------------------------------------------------
// 8. GradedQuestionSchema
// ---------------------------------------------------------------------------
export const GradedQuestionSchema = z.object({
  questionNumber: z.number().int().min(1),
  pointsEarned: z.number(),
  pointsPossible: z.number(),
  studentAnswer: z.string(),
  correctAnswer: z.string(),
  isCorrect: z.boolean(),
  distractorIndex: z.number().int().nullable(),
});
export type GradedQuestion = z.infer<typeof GradedQuestionSchema>;

// ---------------------------------------------------------------------------
// 9. GradedStudentSchema
// ---------------------------------------------------------------------------
export const GradedStudentSchema = z.object({
  studentId: z.string(),
  perQuestion: z.array(GradedQuestionSchema).default([]),
  total: z.object({
    earned: z.number(),
    possible: z.number(),
    normalized: z.number().min(0).max(1),
  }),
});
export type GradedStudent = z.infer<typeof GradedStudentSchema>;

// ---------------------------------------------------------------------------
// 10. GradedResultSchema
// ---------------------------------------------------------------------------
export const GradedResultSchema = z.object({
  assignmentId: z.string(),
  gradedStudents: z.array(GradedStudentSchema).default([]),
  answerKeyFlags: z
    .array(
      z.object({
        questionNumber: z.number().int().min(1),
        flag: z.string(),
        missRate: z.number().min(0).max(1),
        mostCommonAnswer: z.string(),
      }),
    )
    .default([]),
});
export type GradedResult = z.infer<typeof GradedResultSchema>;

// ---------------------------------------------------------------------------
// 11. SkillMappingEntrySchema
// ---------------------------------------------------------------------------
export const SkillMappingEntrySchema = z.object({
  questionNumber: z.number().int().min(1),
  primarySkill: OverrideEnvelopeSchema,
  secondarySkills: z.array(OverrideEnvelopeSchema).default([]),
});
export type SkillMappingEntry = z.infer<typeof SkillMappingEntrySchema>;

// ---------------------------------------------------------------------------
// 12. SkillInferenceResultSchema
// ---------------------------------------------------------------------------
export const SkillInferenceResultSchema = z.object({
  assignmentId: z.string(),
  skillMapping: z.array(SkillMappingEntrySchema).default([]),
  uniqueSkillsSummary: z
    .array(
      z.object({
        skillTag: z.string(),
        questionNumbers: z.array(z.number().int().min(1)).default([]),
        questionCount: z.number().int(),
      }),
    )
    .default([]),
  learningObjectivesUsed: z.boolean(),
});
export type SkillInferenceResult = z.infer<typeof SkillInferenceResultSchema>;

// ---------------------------------------------------------------------------
// 13. AnalysisResultSchema
// ---------------------------------------------------------------------------
export const AnalysisResultSchema = z.object({
  analysisId: z.string(),
  assignmentId: z.string(),
  classId: z.string(),
  generatedAt: z.string(),
  modelUsed: z.string(),
  stale: z.boolean(),
  teacherOverridesApplied: z.number().int(),

  classSummary: z.object({
    oneSentence: z.string(),
    studentsAnalyzed: z.number().int(),
    studentsAbsent: z.number().int(),
    meanScore: z.number().min(0).max(1),
    medianScore: z.number().min(0).max(1),
    stdDev: z.number(),
    minScore: z.number().min(0).max(1),
    maxScore: z.number().min(0).max(1),
    distributionShape: z.enum([
      'normal',
      'bimodal',
      'ceiling',
      'floor',
      'uniform',
    ]),
    outliers: z
      .array(
        z.object({
          studentId: z.string(),
          score: z.number().min(0).max(1),
          direction: z.enum(['above', 'below']),
        }),
      )
      .default([]),
  }),

  skillBreakdown: z
    .array(
      z.object({
        skillTag: z.string(),
        displayName: z.string(),
        questionNumbers: z.array(z.number().int().min(1)).default([]),
        questionCount: z.number().int(),
        classMastery: z.number().min(0).max(1),
        masteryLevel: z.enum(['green', 'yellow', 'red']),
        studentsStrugglingCount: z.number().int(),
        studentsProficientCount: z.number().int(),
        commonWrongAnswers: z
          .array(
            z.object({
              answerValue: z.string(),
              frequency: z.number().int(),
              frequencyPercent: z.number().min(0).max(1),
              misconception: z.string(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),

  studentInsights: z
    .array(
      z.object({
        studentId: z.string(),
        studentName: z.string(),
        totalScore: z.number().min(0).max(1),
        relativeToClass: z.enum([
          'above_average',
          'average',
          'below_average',
        ]),
        percentile: z.number(),
        skillPerformance: z
          .array(
            z.object({
              skillTag: z.string(),
              mastery: z.number().min(0).max(1),
              classAverage: z.number().min(0).max(1),
              gap: z.number(),
            }),
          )
          .default([]),
        gapAreas: z.array(z.string()).default([]),
        wrongAnswerAnalysis: z
          .array(
            z.object({
              questionNumber: z.number().int().min(1),
              studentAnswer: z.string(),
              correctAnswer: z.string(),
              questionText: z.string().optional(),
              misconception: z.string(),
            }),
          )
          .default([]),
        interventionPlan: z
          .object({
            summary: z.string(),
            steps: z.array(z.string()),
          })
          .nullable()
          .default(null),
        sourceImagePath: z.string().nullable().default(null),
      }),
    )
    .default([]),

  interventions: z
    .array(
      z.object({
        interventionId: z.string(),
        priority: z.number().int(),
        scope: z.enum(['whole_class', 'small_group', 'individual']),
        skillTag: z.string(),
        displayName: z.string(),
        affectedStudentIds: z.array(z.string()).default([]),
        affectedCount: z.number().int(),
        misconceptionSummary: z.string(),
        effortTiers: z.object({
          quick: z.object({
            label: z.string(),
            description: z.string(),
          }),
          lesson: z.object({
            label: z.string(),
            description: z.string(),
          }),
          individual: z.object({
            label: z.string(),
            description: z.string(),
          }),
        }),
        status: z.enum([
          'pending',
          'planned',
          'in_progress',
          'done',
          'dismissed',
        ]),
        teacherNote: z.string().nullable(),
        plannedDate: z.string().nullable(),
        selectedEffortTier: z.string().nullable(),
      }),
    )
    .default([]),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ---------------------------------------------------------------------------
// 14. AnswerKeyQuestionSchema
// ---------------------------------------------------------------------------
export const AnswerKeyQuestionSchema = z.object({
  questionNumber: z.number().int().min(1),
  questionText: z.string().nullable(),
  correctAnswer: z.string(),
  answerChoices: z.array(z.string()).nullable(),
  points: z.number().default(1),
  extraCredit: z.boolean().default(false),
});
export type AnswerKeyQuestion = z.infer<typeof AnswerKeyQuestionSchema>;

// ---------------------------------------------------------------------------
// 15. AnswerKeySchema
// ---------------------------------------------------------------------------
export const AnswerKeySchema = z.object({
  source: z.enum(['manual', 'image']),
  questions: z.array(AnswerKeyQuestionSchema).default([]),
});
export type AnswerKey = z.infer<typeof AnswerKeySchema>;
