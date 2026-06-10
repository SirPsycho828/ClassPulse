import { z } from 'zod';

export const TrendSchema = z.enum(['up', 'down', 'flat']);
export type Trend = z.infer<typeof TrendSchema>;

export const ClassSummaryDocSchema = z.object({
  classId: z.string(),
  teacherId: z.string(),
  className: z.string(),
  studentCount: z.number(),
  analysisCount: z.number(),
  lastAnalysisDate: z.string(),
  latestMeanScore: z.number(),
  trend: TrendSchema,
  sparklineData: z.array(z.number()),
  updatedAt: z.any(), // Firestore Timestamp
});
export type ClassSummaryDoc = z.infer<typeof ClassSummaryDocSchema>;

export const StudentSummaryDocSchema = z.object({
  classId: z.string(),
  studentId: z.string(),
  teacherId: z.string(),
  studentName: z.string(),
  className: z.string(),
  analysisCount: z.number(),
  lastAnalysisDate: z.string(),
  latestScore: z.number(),
  latestPercentile: z.number(),
  trend: TrendSchema,
  sparklineData: z.array(z.number()),
  updatedAt: z.any(), // Firestore Timestamp
});
export type StudentSummaryDoc = z.infer<typeof StudentSummaryDocSchema>;
