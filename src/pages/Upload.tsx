import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  Upload as UploadIcon,
  Camera,
  Image,
  FileSpreadsheet,
  X,
  RotateCw,
  Check,
  Loader2,
  AlertCircle,
  Download,
  ArrowLeft,
} from 'lucide-react';
import { GuidanceTip } from '@/components/ux/GuidanceTip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceType = 'image' | 'csv';

interface AssignmentDoc {
  sourceType: SourceType;
  classId: string;
  teacherId: string;
  status: string;
  imageUrls: string[];
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  url?: string;
  storagePath?: string;
  error?: string;
}

interface CsvPreviewRow {
  [key: string]: string;
}

interface ColumnMapping {
  column: string;
  mappedTo: 'student_name' | 'score' | 'ignore' | string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_ACCEPT = 'image/*';
const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const IMAGE_MAX_COUNT = 30;
const MAX_CONCURRENT = 3;

const CSV_ACCEPT = '.csv,.xlsx,.tsv,.txt';
const CSV_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Elapsed Timer
// ---------------------------------------------------------------------------

function useElapsed(startedAt?: Date | null) {
  const [elapsed, setElapsed] = useState(() => {
    if (startedAt) return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    return 0;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (startedAt) {
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000)));
      } else {
        setElapsed((e) => e + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  const statusMessage =
    elapsed < 60
      ? 'This usually takes 1–3 minutes'
      : elapsed < 180
        ? 'Still working… AI is analyzing each response'
        : 'Almost there…';

  return { elapsed, timeStr, statusMessage };
}

// ---------------------------------------------------------------------------
// Processing View (shared)
// ---------------------------------------------------------------------------

function ProcessingView({
  assignmentId,
  status,
  progress,
  startedAt,
}: {
  assignmentId: string;
  status: string;
  progress: { phase: string; current: number; total: number } | null;
  startedAt?: Date | null;
}) {
  const navigate = useNavigate();

  // Determine if we're in the analysis phase (post-review)
  const isAnalysisPhase = status === 'analyzing' || status === 'complete';

  // Build step label with live count
  function stepLabel(key: string) {
    if (key === 'extracting' && progress?.phase === 'extracting' && progress.total > 0) {
      return `Reading papers (${progress.current} of ${progress.total})`;
    }
    if (key === 'extracting') return 'Reading student papers';
    if (key === 'matching') return 'Matching to roster';
    if (key === 'analyzing') return 'Running AI analysis';
    return key;
  }

  const extractionSteps = [
    { key: 'extracting' },
    { key: 'matching' },
  ];

  const analysisSteps = [
    { key: 'analyzing' },
  ];

  const steps = isAnalysisPhase ? analysisSteps : extractionSteps;

  // Derive step states from status
  function getStepState(stepKey: string) {
    if (isAnalysisPhase) {
      if (status === 'complete') return 'done';
      return 'active';
    }
    const order = ['uploading', 'extracting', 'matching', 'needs_review', 'complete'];
    const statusIndex = order.indexOf(status);
    const stepIndex = order.indexOf(stepKey);

    if (stepIndex < statusIndex) return 'done';
    if (stepIndex === statusIndex) return 'active';
    return 'pending';
  }

  useEffect(() => {
    if (status === 'complete') {
      navigate(`/analysis/${assignmentId}`, { replace: true });
    } else if (status === 'needs_review') {
      navigate(`/analysis/${assignmentId}/review`, { replace: true });
    }
  }, [status, assignmentId, navigate]);

  const { timeStr, statusMessage } = useElapsed(startedAt);

  if (status === 'error') {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          The analysis encountered an error. You can try again from the dashboard.
        </p>
        <button
          onClick={() => navigate('/dashboard', { replace: true })}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-10 max-w-md mx-auto">
      {/* Animated spinner with elapsed badge */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-primary tabular-nums">{timeStr}</span>
        </div>
      </div>

      {/* Heading */}
      <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
        {isAnalysisPhase ? 'Analyzing results' : 'Reading student papers'}
      </h2>
      <p className="text-sm text-muted-foreground mb-8">{statusMessage}</p>

      {/* Step progress */}
      <div className="max-w-xs mx-auto space-y-3 mb-8">
        {steps.map((s) => {
          const state = getStepState(s.key);
          return (
            <div key={s.key} className="flex items-center gap-3">
              {state === 'done' ? (
                <div className="w-6 h-6 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-success" />
                </div>
              ) : state === 'active' ? (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-input flex-shrink-0" />
              )}
              <span
                className={`text-sm ${
                  state === 'done'
                    ? 'text-success'
                    : state === 'active'
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                }`}
              >
                {stepLabel(s.key)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Navigate away callout — always visible */}
      <div className="bg-primary/5 border border-primary/15 rounded-[--radius-md] px-5 py-4">
        <p className="text-sm font-medium text-foreground mb-1">
          You don't need to wait here
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Your analysis will keep running in the background. We'll have results ready when you come back.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image Upload
// ---------------------------------------------------------------------------

function ImageUpload({
  assignmentId,
  teacherId,
  rosterCount,
  onStartExtraction,
}: {
  assignmentId: string;
  teacherId: string;
  rosterCount: number | null;
  onStartExtraction: () => void;
}) {
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [starting, setStarting] = useState(false);
  const activeUploads = useRef(0);
  const queueRef = useRef<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const completedCount = files.filter((f) => f.status === 'done').length;
  const hasErrors = files.some((f) => f.status === 'error');

  // Process upload queue
  const processQueue = useCallback(() => {
    while (activeUploads.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      activeUploads.current++;

      setFiles((prev) =>
        prev.map((f) => (f.id === next.id ? { ...f, status: 'uploading' as const } : f)),
      );

      const storageRef = ref(
        storage,
        `uploads/${teacherId}/${assignmentId}/${next.file.name}`,
      );
      const task = uploadBytesResumable(storageRef, next.file);

      task.on(
        'state_changed',
        (snap) => {
          const progress = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setFiles((prev) =>
            prev.map((f) => (f.id === next.id ? { ...f, progress } : f)),
          );
        },
        (err) => {
          activeUploads.current--;
          setFiles((prev) =>
            prev.map((f) =>
              f.id === next.id
                ? { ...f, status: 'error' as const, error: err.message }
                : f,
            ),
          );
          processQueue();
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            activeUploads.current--;
            setFiles((prev) =>
              prev.map((f) =>
                f.id === next.id
                  ? { ...f, status: 'done' as const, progress: 100, url, storagePath: task.snapshot.ref.fullPath }
                  : f,
              ),
            );
          } catch {
            activeUploads.current--;
            setFiles((prev) =>
              prev.map((f) =>
                f.id === next.id
                  ? { ...f, status: 'error' as const, error: 'Failed to get download URL' }
                  : f,
              ),
            );
          }
          processQueue();
        },
      );
    }
  }, [assignmentId, teacherId]);

  // Add files and start uploading
  function addFiles(incoming: FileList | File[]) {
    const newFiles: UploadingFile[] = [];
    const existing = files.length;

    for (let i = 0; i < incoming.length; i++) {
      if (existing + newFiles.length >= IMAGE_MAX_COUNT) {
        toast('error', `Maximum ${IMAGE_MAX_COUNT} images allowed.`);
        break;
      }

      const file = incoming[i];

      if (file.size > IMAGE_MAX_SIZE) {
        toast('error', `${file.name} exceeds 10 MB limit.`);
        continue;
      }

      const entry: UploadingFile = {
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        progress: 0,
        status: 'queued',
      };
      newFiles.push(entry);
    }

    if (newFiles.length === 0) return;

    setFiles((prev) => [...prev, ...newFiles]);
    queueRef.current.push(...newFiles);
    processQueue();
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    queueRef.current = queueRef.current.filter((f) => f.id !== id);
  }

  function retryFile(id: string) {
    const found = files.find((f) => f.id === id);
    if (!found) return;

    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: 'queued' as const, progress: 0, error: undefined } : f,
      ),
    );
    queueRef.current.push({ ...found, status: 'queued', progress: 0, error: undefined });
    processQueue();
  }

  // Drag-and-drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }

  // Start extraction
  async function handleStartExtraction() {
    if (completedCount === 0) return;

    setStarting(true);
    try {
      // Collect storage paths from completed uploads
      const paths = files
        .filter((f) => f.status === 'done' && f.storagePath)
        .map((f) => f.storagePath!);

      // Update assignment with storage paths (not download URLs)
      await updateDoc(doc(db, 'assignments', assignmentId), {
        imageUrls: paths,
        status: 'extracting',
      });

      // Fire-and-forget — ProcessingView listens to Firestore for real-time progress
      const runExtraction = httpsCallable(functions, 'runExtraction');
      runExtraction({ assignmentId }).catch((err) => {
        console.error('Extraction error:', err);
      });

      // Immediately show the processing view
      onStartExtraction();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[handleStartExtraction]', err);
      toast('error', `Extraction failed: ${msg}`);
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Image className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-heading text-lg font-semibold text-foreground">Upload Photos</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Upload photos or scans of student papers. Supports JPEG, PNG, HEIC, and WebP (max 10 MB each, up to 30 images).
      </p>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="border-2 border-dashed border-input rounded-[--radius-md] p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <UploadIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">
          Upload photos of student papers
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-primary/90"
          >
            <Camera className="w-4 h-4" />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 border border-input text-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-muted/50"
          >
            <UploadIcon className="w-4 h-4" />
            Browse Files
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          JPEG, PNG, HEIC, WebP -- max 10 MB each
        </p>
      </div>

      {/* Thumbnail strip */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{completedCount}</span> image{completedCount !== 1 ? 's' : ''} uploaded
              {rosterCount !== null && (
                <span className="text-muted-foreground">
                  {' '}| ~{rosterCount} students expected (based on roster)
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="relative group bg-muted rounded-[--radius-md] overflow-hidden aspect-[4/3] border border-border"
              >
                {/* Thumbnail preview for images */}
                {f.file.type.startsWith('image/') && (
                  <img
                    src={URL.createObjectURL(f.file)}
                    alt={f.file.name}
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

                {/* Status indicator */}
                {f.status === 'uploading' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}

                {f.status === 'done' && (
                  <div className="absolute top-1 right-1 bg-success rounded-full p-0.5">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}

                {f.status === 'error' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-destructive/8">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryFile(f.id);
                      }}
                      className="flex items-center gap-1 text-xs text-destructive hover:text-destructive font-medium"
                    >
                      <RotateCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.id);
                  }}
                  className="absolute top-1 left-1 bg-black/50 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start extraction button */}
      <div className="flex flex-col items-end gap-1.5 pt-2">
        <div className="flex items-center gap-3">
          {hasErrors && (
            <p className="text-xs text-warning flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Some uploads failed. Retry or remove them.
            </p>
          )}
          <button
            type="button"
            onClick={handleStartExtraction}
            disabled={completedCount === 0 || starting}
            className="bg-primary text-primary-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 flex items-center gap-2"
          >
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Extraction'
            )}
          </button>
        </div>
        {!starting && completedCount === 0 && (
          <p className="text-xs text-muted-foreground/70">Upload at least one image to begin.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV Upload
// ---------------------------------------------------------------------------

function CsvUpload({ assignmentId }: { assignmentId: string }) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvPreviewRow[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [processing, setProcessing] = useState(false);
  const [delimiter, setDelimiter] = useState(',');
  const [answerKeyRow, setAnswerKeyRow] = useState<string[] | null>(null);
  const [answerKeyRowIndex, setAnswerKeyRowIndex] = useState<number>(-1);
  const [detectedType, setDetectedType] = useState<'scored' | 'objective' | null>(null);
  const [questionTextRow, setQuestionTextRow] = useState<string[] | null>(null);
  const [questionTextRowIndex, setQuestionTextRowIndex] = useState<number>(-1);
  const [pointsRow, setPointsRow] = useState<string[] | null>(null);
  const [pointsRowIndex, setPointsRowIndex] = useState<number>(-1);

  // Detect delimiter
  function detectDelimiter(text: string): string {
    const firstLine = text.split('\n')[0] || '';
    const counts: Record<string, number> = { ',': 0, '\t': 0, '|': 0, ';': 0 };
    for (const char of firstLine) {
      if (char in counts) counts[char]++;
    }
    let best = ',';
    let max = 0;
    for (const [d, c] of Object.entries(counts)) {
      if (c > max) {
        max = c;
        best = d;
      }
    }
    return best;
  }

  // Parse CSV
  function parseCsv(text: string, delim: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headerLine = lines[0].split(delim).map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const dataRows = lines.slice(1).map((line) =>
      line.split(delim).map((cell) => cell.trim().replace(/^["']|["']$/g, '')),
    );

    return { headers: headerLine, rows: dataRows };
  }

  // Auto-detect column mappings and CSV type
  function autoDetectMappings(hdrs: string[]): { mappings: ColumnMapping[]; detected: 'scored' | 'objective' } {
    const namePatterns = /^(student|name|student.?name|full.?name|last.?name|first.?name)$/i;
    const scorePatterns = /^(score|grade|points|total|marks|result|percent|pct)$/i;
    const questionPatterns = /^(q|question\s*)\d+$/i;

    const hasQuestionCols = hdrs.some((h) => questionPatterns.test(h));
    const detected: 'scored' | 'objective' = hasQuestionCols ? 'objective' : 'scored';

    const mappings = hdrs.map((h) => {
      if (namePatterns.test(h)) return { column: h, mappedTo: 'student_name' };
      if (scorePatterns.test(h)) return { column: h, mappedTo: 'score' };
      if (hasQuestionCols && questionPatterns.test(h)) return { column: h, mappedTo: 'question_answer' };
      return { column: h, mappedTo: 'ignore' };
    });

    return { mappings, detected };
  }

  // Handle file selection
  async function handleFile(f: File) {
    if (f.size > CSV_MAX_SIZE) {
      toast('error', 'File exceeds 5 MB limit.');
      return;
    }

    // TODO: For XLSX files, the xlsx library is needed. This currently only handles CSV/TSV text files.
    const isXlsx = f.name.endsWith('.xlsx');
    if (isXlsx) {
      toast('error', 'XLSX support coming soon. Please export as CSV for now.');
      return;
    }

    const text = await f.text();
    const delim = detectDelimiter(text);
    setDelimiter(delim);

    const parsed = parseCsv(text, delim);
    if (parsed.headers.length === 0) {
      toast('error', 'Could not parse file. Check the format.');
      return;
    }

    setFile(f);
    setHeaders(parsed.headers);
    setAllRows(parsed.rows);

    // Auto-detect column mappings and type
    const { mappings, detected } = autoDetectMappings(parsed.headers);
    setColumnMappings(mappings);
    setDetectedType(detected);

    // Detect metadata rows
    const namePatterns = /^(student|name|student.?name|full.?name|last.?name|first.?name)$/i;
    const nameIdx = parsed.headers.findIndex((h) => namePatterns.test(h));

    let detectedKeyIdx = -1;
    let detectedTextIdx = -1;
    let detectedPointsIdx = -1;

    if (nameIdx !== -1) {
      const keyPatterns = /^(answer\s*key|key|correct|answer)$/i;
      const textPatterns = /^(question\s*text|questions?|text|prompt)$/i;
      const pointsPatterns = /^(points?|weight|value|pts)$/i;

      for (let i = 0; i < parsed.rows.length; i++) {
        const cellValue = parsed.rows[i][nameIdx]?.trim() ?? '';
        if (keyPatterns.test(cellValue)) {
          detectedKeyIdx = i;
          setAnswerKeyRow(parsed.rows[i]);
          setAnswerKeyRowIndex(i);
        } else if (textPatterns.test(cellValue)) {
          detectedTextIdx = i;
          setQuestionTextRow(parsed.rows[i]);
          setQuestionTextRowIndex(i);
        } else if (pointsPatterns.test(cellValue)) {
          detectedPointsIdx = i;
          setPointsRow(parsed.rows[i]);
          setPointsRowIndex(i);
        }
      }
    }

    if (detectedKeyIdx === -1) { setAnswerKeyRow(null); setAnswerKeyRowIndex(-1); }
    if (detectedTextIdx === -1) { setQuestionTextRow(null); setQuestionTextRowIndex(-1); }
    if (detectedPointsIdx === -1) { setPointsRow(null); setPointsRowIndex(-1); }

    // Preview excluding metadata rows
    const metadataIndices = new Set(
      [detectedKeyIdx, detectedTextIdx, detectedPointsIdx].filter((i) => i >= 0)
    );
    const previewRows = parsed.rows.filter((_, i) => !metadataIndices.has(i));
    const preview: CsvPreviewRow[] = previewRows.slice(0, 5).map((row) => {
      const obj: CsvPreviewRow = {};
      parsed.headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
    setRows(preview);
  }

  // Drag-and-drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  // Update a mapping
  function updateMapping(index: number, mappedTo: string) {
    setColumnMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, mappedTo } : m)),
    );
  }

  // Get mapped column index
  function getMappedIndex(target: string): number {
    return columnMappings.findIndex((m) => m.mappedTo === target);
  }

  // Score normalization preview
  const scoreColIndex = getMappedIndex('score');
  const nameColIndex = getMappedIndex('student_name');

  const questionColIndices = columnMappings
    .map((m, i) => (m.mappedTo === 'question_answer' ? i : -1))
    .filter((i) => i !== -1);

  const hasRequiredMappings =
    detectedType === 'objective'
      ? nameColIndex !== -1 && questionColIndices.length > 0 && answerKeyRow !== null
      : nameColIndex !== -1 && scoreColIndex !== -1;

  // Process CSV
  async function handleProcess() {
    if (!hasRequiredMappings) {
      if (detectedType === 'objective') {
        toast('error', 'Ensure a student name column and question answer columns are mapped, and an ANSWER KEY row is present.');
      } else {
        toast('error', 'Map both a student name and score column.');
      }
      return;
    }

    setProcessing(true);
    try {
      let extractedStudents: object[];
      let answerKey: Array<{
        questionNumber: number;
        correctAnswer: string;
        points: number;
        questionText: string | null;
      }> | null = null;

      const metadataIndices = new Set(
        [answerKeyRowIndex, questionTextRowIndex, pointsRowIndex].filter((i) => i >= 0)
      );

      if (detectedType === 'objective') {
        answerKey = questionColIndices.map((colIdx, i) => {
          const header = headers[colIdx];
          const num = parseInt(header.replace(/\D/g, ''), 10) || (i + 1);
          const correctAnswer = answerKeyRow![colIdx]?.trim() ?? '';
          const questionText = questionTextRow ? (questionTextRow[colIdx]?.trim() || null) : null;
          const pts = pointsRow ? (parseFloat(pointsRow[colIdx]?.trim() ?? '') || 1) : 1;
          return { questionNumber: num, correctAnswer, points: pts, questionText };
        });

        extractedStudents = allRows
          .filter((_, i) => !metadataIndices.has(i))
          .filter((row) => row[nameColIndex]?.trim())
          .map((row, i) => {
            const rawName = row[nameColIndex]?.trim() ?? '';
            const answers = questionColIndices.map((colIdx, j) => {
              const header = headers[colIdx];
              const num = parseInt(header.replace(/\D/g, ''), 10) || (j + 1);
              return {
                questionNumber: num,
                extractedAnswer: row[colIdx]?.trim() ?? '',
                confidence: 1.0,
                multipleAnswersDetected: false,
              };
            });
            return {
              extractionIndex: i,
              sourceImageIndex: 0,
              rawName,
              nameConfidence: 1.0,
              answers,
              totalScore: { raw: '0', normalized: 0, confidence: 1.0 },
              flags: [],
            };
          });
      } else {
        extractedStudents = allRows
          .filter((row) => row[nameColIndex]?.trim())
          .map((row, i) => {
            const rawName = row[nameColIndex]?.trim() ?? '';
            const rawScore = row[scoreColIndex]?.trim() ?? '0';
            const scoreNum = parseFloat(rawScore) || 0;
            return {
              extractionIndex: i,
              sourceImageIndex: 0,
              rawName,
              nameConfidence: 1.0,
              answers: [],
              totalScore: {
                raw: rawScore,
                normalized: scoreNum > 1 ? scoreNum / 100 : scoreNum,
                confidence: 1.0,
              },
              flags: [],
            };
          });
      }

      await updateDoc(doc(db, 'assignments', assignmentId), {
        status: 'processing_images',
      });

      const runCsvExtraction = httpsCallable(functions, 'runCsvExtraction');
      await runCsvExtraction({
        assignmentId,
        extractedStudents,
        metadata: {
          totalExtracted: extractedStudents.length,
          imagesProcessed: 0,
          partialPapersDetected: false,
          processingTimeMs: 0,
        },
        ...(answerKey ? { answerKey } : {}),
      });

      navigate(`/analysis/${assignmentId}/review`);
    } catch {
      toast('error', 'Failed to process CSV. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-heading text-lg font-semibold text-foreground">Upload Spreadsheet</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Upload a CSV, TSV, or spreadsheet file with student data (max 5 MB).
      </p>

      {/* Drop zone or file info */}
      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed border-input rounded-[--radius-md] p-8 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = CSV_ACCEPT;
            input.onchange = () => {
              if (input.files?.[0]) handleFile(input.files[0]);
            };
            input.click();
          }}
        >
          <UploadIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            Drag & drop a spreadsheet here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">CSV, TSV, XLSX -- max 5 MB</p>
          <div
            className="mt-3 flex items-center justify-center gap-1.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Not sure about the format?</span>
            <a
              href="/classpulse-csv-template.csv"
              download
              className="text-primary hover:underline font-medium"
            >
              Download template
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* File info */}
          <div className="bg-muted/50 border border-border rounded-[--radius-md] p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                ({allRows.length} rows, delimiter: {delimiter === '\t' ? 'TAB' : `"${delimiter}"`})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setHeaders([]);
                setRows([]);
                setAllRows([]);
                setColumnMappings([]);
                setDetectedType(null);
                setAnswerKeyRow(null);
                setAnswerKeyRowIndex(-1);
                setQuestionTextRow(null);
                setQuestionTextRowIndex(-1);
                setPointsRow(null);
                setPointsRowIndex(-1);
              }}
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview table */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">
              Preview (first 5 rows)
            </p>
            <div className="overflow-x-auto border border-border rounded-[--radius-md]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-foreground whitespace-nowrap">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column mapping */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Column Mapping</p>
            <div className="space-y-2">
              {columnMappings.map((m, i) => (
                <div key={m.column} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-40 truncate font-mono">
                    {m.column}
                  </span>
                  <select
                    value={m.mappedTo}
                    onChange={(e) => updateMapping(i, e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-input rounded-[--radius-md] text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 bg-card"
                  >
                    <option value="ignore">Ignore</option>
                    <option value="student_name">Student Name</option>
                    <option value="score">Score</option>
                    {detectedType === 'objective' && (
                      <option value="question_answer">Question Answer</option>
                    )}
                  </select>
                  {m.mappedTo !== 'ignore' && (
                    <Check className="w-4 h-4 text-success flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Score normalization preview / ready banner */}
          {hasRequiredMappings && (
            <div className="bg-success/10 border border-success/20 rounded-[--radius-md] p-3">
              <p className="text-sm text-success font-medium">Ready to process</p>
              <p className="text-xs text-success mt-1">
                {detectedType === 'objective'
                  ? `${allRows.filter((row, i) => {
                      const mdSet = new Set([answerKeyRowIndex, questionTextRowIndex, pointsRowIndex].filter((x) => x >= 0));
                      return !mdSet.has(i) && row[nameColIndex]?.trim();
                    }).length} students detected · ${questionColIndices.length} question column${questionColIndices.length !== 1 ? 's' : ''} mapped.`
                  : `${allRows.filter((r) => r[nameColIndex]?.trim()).length} students detected from ${allRows.length} data rows.`}
              </p>
            </div>
          )}

          {!hasRequiredMappings && (
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {detectedType === 'objective'
                ? 'Map a student name column and at least one question answer column to continue.'
                : 'Map both a student name column and a score column to continue.'}
            </div>
          )}

          {/* Answer key status indicator (objective only) */}
          {detectedType === 'objective' && file && (
            answerKeyRow ? (
              <div className="bg-success/10 border border-success/20 rounded-[--radius-md] p-3">
                <p className="text-sm text-success font-medium">Answer key detected</p>
                <p className="text-xs text-success mt-1">
                  Row &ldquo;{answerKeyRow[nameColIndex]}&rdquo; will be used as the answer key and excluded from student data.
                </p>
                {questionTextRow && (
                  <p className="text-xs text-success mt-0.5">
                    Question text row detected &mdash; will be included in answer key metadata.
                  </p>
                )}
                {pointsRow && (
                  <p className="text-xs text-success mt-0.5">
                    Points row detected &mdash; custom point values will be used for scoring.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-warning">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No answer key row found. Add a row with &ldquo;ANSWER KEY&rdquo; in the name column.
              </div>
            )
          )}

          {/* Detected type badge */}
          {file && detectedType && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Detected format:</span>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {detectedType === 'objective' ? 'Grade For Me' : 'Already Scored'}
              </span>
            </div>
          )}

          {/* Process button */}
          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={handleProcess}
              disabled={!hasRequiredMappings || processing}
              className="bg-primary text-primary-foreground py-2 px-4 rounded-full text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 flex items-center gap-2"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Upload Page
// ---------------------------------------------------------------------------

export default function Upload() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProcessing, setShowProcessing] = useState(false);
  const [liveStatus, setLiveStatus] = useState('uploading');
  const [processingStartedAt, setProcessingStartedAt] = useState<Date | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{
    phase: string;
    current: number;
    total: number;
  } | null>(null);
  const [rosterCount, setRosterCount] = useState<number | null>(null);

  // Load assignment document
  useEffect(() => {
    if (!id || !user) return;

    async function load() {
      try {
        const snap = await getDoc(doc(db, 'assignments', id!));
        if (!snap.exists()) {
          toast('error', 'Assignment not found.');
          navigate('/dashboard', { replace: true });
          return;
        }

        const data = snap.data() as AssignmentDoc;

        // Verify ownership
        if (data.teacherId !== user!.uid) {
          toast('error', 'You do not have access to this assignment.');
          navigate('/dashboard', { replace: true });
          return;
        }

        setAssignment(data);
        setLiveStatus(data.status);

        // If already processing, show processing view
        if (
          data.status !== 'uploading' &&
          data.status !== 'needs_review' &&
          data.status !== 'complete'
        ) {
          setShowProcessing(true);
        }

        // If already reviewed, redirect
        if (data.status === 'needs_review' || data.status === 'complete') {
          navigate(`/analysis/${id}/review`, { replace: true });
          return;
        }

        // Fetch roster count for image upload context
        try {
          const classSnap = await getDoc(doc(db, 'classes', data.classId));
          if (classSnap.exists()) {
            setRosterCount((classSnap.data().studentCount as number) || null);
          }
        } catch {
          // Non-critical, ignore
        }
      } catch {
        toast('error', 'Failed to load assignment.');
        navigate('/dashboard', { replace: true });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, user, toast, navigate]);

  // Live status listener for processing view
  const analysisTriggeredRef = useRef(false);
  useEffect(() => {
    if (!id || !showProcessing) return;

    const unsub = onSnapshot(doc(db, 'assignments', id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveStatus(data.status as string);
        setExtractionProgress(data.pipelineState?.extractionProgress ?? null);
        // Use processingStartedAt if available, fall back to updatedAt
        const ts = data.processingStartedAt ?? data.updatedAt;
        if (ts && !processingStartedAt) {
          setProcessingStartedAt(ts.toDate());
        }
        // Recovery: if status is 'analyzing' but runAnalysis was never triggered, fire it
        if (data.status === 'analyzing' && !analysisTriggeredRef.current) {
          analysisTriggeredRef.current = true;
          const runAnalysis = httpsCallable(functions, 'runAnalysis');
          runAnalysis({ assignmentId: id }).catch((err) =>
            console.error('runAnalysis recovery error:', err),
          );
        }
      }
    });

    return () => unsub();
  }, [id, showProcessing]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!assignment || !id) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {!showProcessing && (
        <GuidanceTip id="upload-mode-guidance">
          {assignment?.sourceType === 'image'
            ? 'Upload one photo per student paper. The AI will read handwriting and extract scores automatically.'
            : 'Upload a CSV or spreadsheet with student names and scores. Map the columns and we\'ll handle the rest.'}
        </GuidanceTip>
      )}
      <div className="bg-card rounded-[--radius-md] shadow-[--shadow-sm] border border-border p-6">
        {showProcessing ? (
          <ProcessingView assignmentId={id} status={liveStatus} progress={extractionProgress} startedAt={processingStartedAt} />
        ) : assignment.sourceType === 'image' ? (
          <ImageUpload
            assignmentId={id}
            teacherId={assignment.teacherId}
            rosterCount={rosterCount}
            onStartExtraction={() => setShowProcessing(true)}
          />
        ) : (
          <CsvUpload assignmentId={id} />
        )}
      </div>
    </div>
  );
}
