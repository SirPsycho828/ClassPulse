import * as admin from 'firebase-admin';

const db = admin.firestore();

type Trend = 'up' | 'down' | 'flat';

function computeTrend(scores: number[]): Trend {
  if (scores.length < 2) return 'flat';
  const prev = scores[scores.length - 2];
  const curr = scores[scores.length - 1];
  const diff = curr - prev;
  if (diff > 0.02) return 'up';
  if (diff < -0.02) return 'down';
  return 'flat';
}

function buildSparkline(scores: number[], max = 10): number[] {
  return scores.slice(-max);
}

interface AnalysisDoc {
  analysisId: string;
  classId: string;
  generatedAt: string;
  classSummary: {
    meanScore: number;
    studentsAnalyzed: number;
  };
  studentInsights: Array<{
    studentId: string;
    studentName: string;
    totalScore: number;
    percentile: number;
  }>;
}

/**
 * Update classSummaries and studentSummaries after an analysis completes.
 * Call this at the end of runAnalysis.
 */
export async function updateSummaries(
  classId: string,
  teacherId: string,
): Promise<void> {
  // 1. Fetch all analyses for this class, ordered by date
  const analysesSnap = await db
    .collection('analyses')
    .where('classId', '==', classId)
    .where('teacherId', '==', teacherId)
    .orderBy('generatedAt', 'asc')
    .get();

  const analyses: AnalysisDoc[] = analysesSnap.docs.map(
    (d) => d.data() as AnalysisDoc,
  );

  if (analyses.length === 0) return;

  // 2. Fetch the class doc for metadata
  const classDoc = await db.collection('classes').doc(classId).get();
  const classData = classDoc.data();
  if (!classData) return;

  // 3. Build class summary
  const meanScores = analyses.map((a) => a.classSummary.meanScore);
  const latest = analyses[analyses.length - 1];

  const classSummaryDoc = {
    classId,
    teacherId,
    className: classData.name || '',
    studentCount: classData.studentCount || 0,
    analysisCount: analyses.length,
    lastAnalysisDate: latest.generatedAt,
    latestMeanScore: latest.classSummary.meanScore,
    trend: computeTrend(meanScores),
    sparklineData: buildSparkline(meanScores),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('classSummaries').doc(classId).set(classSummaryDoc);

  // 4. Build student summaries
  const studentScores = new Map<
    string,
    {
      studentName: string;
      scores: number[];
      percentiles: number[];
      dates: string[];
    }
  >();

  for (const a of analyses) {
    for (const si of a.studentInsights) {
      if (!studentScores.has(si.studentId)) {
        studentScores.set(si.studentId, {
          studentName: si.studentName,
          scores: [],
          percentiles: [],
          dates: [],
        });
      }
      const entry = studentScores.get(si.studentId)!;
      entry.scores.push(si.totalScore);
      entry.percentiles.push(si.percentile);
      entry.dates.push(a.generatedAt);
      entry.studentName = si.studentName;
    }
  }

  // Batch write student summaries (max 500 per batch)
  const studentEntries = Array.from(studentScores.entries());
  const BATCH_SIZE = 450;
  for (let i = 0; i < studentEntries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = studentEntries.slice(i, i + BATCH_SIZE);

    for (const [studentId, data] of chunk) {
      const docId = `${classId}_${studentId}`;
      const latestScore = data.scores[data.scores.length - 1];
      const latestPercentile = data.percentiles[data.percentiles.length - 1];
      const latestDate = data.dates[data.dates.length - 1];

      const studentSummaryDoc = {
        classId,
        studentId,
        teacherId,
        studentName: data.studentName,
        className: classData.name || '',
        analysisCount: data.scores.length,
        lastAnalysisDate: latestDate,
        latestScore,
        latestPercentile,
        trend: computeTrend(data.scores),
        sparklineData: buildSparkline(data.scores),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(db.collection('studentSummaries').doc(docId), studentSummaryDoc);
    }

    await batch.commit();
  }
}
