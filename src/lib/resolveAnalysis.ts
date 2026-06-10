import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DocumentSnapshot } from 'firebase/firestore';

/**
 * Resolves an analysis document from a URL param that could be either
 * an analysisId or an assignmentId. Tries in order:
 * 1. Direct lookup by ID in analyses collection
 * 2. Look up assignment doc's analysisId field
 * 3. Query analyses by assignmentId (requires teacherId for Firestore rules)
 */
export async function resolveAnalysis(
  id: string,
  teacherUid: string,
): Promise<DocumentSnapshot | null> {
  // 1. Direct lookup
  const directDoc = await getDoc(doc(db, 'analyses', id));
  if (directDoc.exists()) return directDoc;

  // 2. Assignment's analysisId field
  const assignDoc = await getDoc(doc(db, 'assignments', id));
  if (assignDoc.exists() && assignDoc.data()?.analysisId) {
    const viaAssign = await getDoc(doc(db, 'analyses', assignDoc.data()!.analysisId));
    if (viaAssign.exists()) return viaAssign;
  }

  // 3. Query by assignmentId + teacherId (required by Firestore rules)
  const q = query(
    collection(db, 'analyses'),
    where('assignmentId', '==', id),
    where('teacherId', '==', teacherUid),
    limit(1),
  );
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0];

  return null;
}
