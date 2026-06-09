import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/ui/Toast';
import {
  Check,
  ChevronDown,
  Eye,
  Heart,
  Loader2,
  RefreshCw,
  Search,
  Star,
  Zap,
} from 'lucide-react';
import { GuidanceTip } from '@/components/ux/GuidanceTip';

// ---- types ----
interface ModelAssignment {
  functionName: string;
  description: string;
  currentModel: string;
}

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  hasVision: boolean;
  pricing: {
    prompt: number; // per 1M tokens
    completion: number;
  };
}

interface CachedModelList {
  models: ModelEntry[];
  fetchedAt: string;
}

// ---- static data ----
const DEFAULT_ASSIGNMENTS: ModelAssignment[] = [
  {
    functionName: 'extractStudentData',
    description: 'Reads handwritten or printed student answers from images',
    currentModel: 'google/gemini-2.0-flash-001',
  },
  {
    functionName: 'inferSkillMapping',
    description: 'Maps questions to skills and learning objectives',
    currentModel: 'anthropic/claude-sonnet-4-20250514',
  },
  {
    functionName: 'analyzeClass',
    description: 'Generates class analysis, insights, and intervention recommendations',
    currentModel: 'anthropic/claude-sonnet-4-20250514',
  },
];

const DEFAULT_MODELS: ModelEntry[] = [
  { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic', contextWindow: 200000, hasVision: true, pricing: { prompt: 3.0, completion: 15.0 } },
  { id: 'anthropic/claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'Anthropic', contextWindow: 200000, hasVision: true, pricing: { prompt: 15.0, completion: 75.0 } },
  { id: 'anthropic/claude-haiku-3-5-20241022', name: 'Claude 3.5 Haiku', provider: 'Anthropic', contextWindow: 200000, hasVision: true, pricing: { prompt: 0.8, completion: 4.0 } },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', contextWindow: 128000, hasVision: true, pricing: { prompt: 2.5, completion: 10.0 } },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI', contextWindow: 128000, hasVision: true, pricing: { prompt: 0.15, completion: 0.6 } },
  { id: 'openai/o3-mini', name: 'o3 mini', provider: 'OpenAI', contextWindow: 200000, hasVision: false, pricing: { prompt: 1.1, completion: 4.4 } },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google', contextWindow: 1000000, hasVision: true, pricing: { prompt: 0.1, completion: 0.4 } },
  { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', provider: 'Google', contextWindow: 1000000, hasVision: true, pricing: { prompt: 1.25, completion: 10.0 } },
  { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'Google', contextWindow: 1000000, hasVision: true, pricing: { prompt: 0.0, completion: 0.0 } },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', provider: 'Meta', contextWindow: 1000000, hasVision: true, pricing: { prompt: 0.2, completion: 0.6 } },
  { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3 0324', provider: 'DeepSeek', contextWindow: 131072, hasVision: false, pricing: { prompt: 0.15, completion: 0.45 } },
  { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', provider: 'Mistral', contextWindow: 131072, hasVision: true, pricing: { prompt: 2.0, completion: 6.0 } },
];

const CACHE_KEY = 'classpulse_model_list';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function formatContextWindow(tokens: number) {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  return `${(tokens / 1000).toFixed(0)}K`;
}

function formatPrice(price: number) {
  if (price === 0) return 'Free';
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(2)}`;
}

export default function AdminModels() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ModelAssignment[]>(DEFAULT_ASSIGNMENTS);
  const [models, setModels] = useState<ModelEntry[]>(DEFAULT_MODELS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVision, setFilterVision] = useState(false);
  const [filterFree, setFilterFree] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('classpulse_model_favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [changingFunction, setChangingFunction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ---- load cached model list ----
  useEffect(() => {
    async function loadModels() {
      try {
        // Check localStorage cache first
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: CachedModelList = JSON.parse(cached);
          const age = Date.now() - new Date(parsed.fetchedAt).getTime();
          if (age < CACHE_MAX_AGE_MS && parsed.models.length > 0) {
            setModels(parsed.models);
            setLoading(false);
            return;
          }
        }

        // Try Firestore cache
        const configDoc = await getDoc(doc(db, 'config', 'openrouter'));
        if (configDoc.exists()) {
          const data = configDoc.data() as CachedModelList;
          if (data.models && data.models.length > 0) {
            setModels(data.models);
            // Update localStorage cache
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ models: data.models, fetchedAt: new Date().toISOString() }),
            );
          }
        }

        // Also try to load current assignments from config
        const assignmentsDoc = await getDoc(doc(db, 'config', 'modelAssignments'));
        if (assignmentsDoc.exists()) {
          const data = assignmentsDoc.data();
          if (data.assignments) {
            setAssignments(data.assignments);
          }
        }
      } catch (err) {
        console.error('Failed to load model list from Firestore:', err);
        // Fall back to defaults (already set)
      } finally {
        setLoading(false);
      }
    }

    loadModels();
  }, []);

  // ---- refresh model list ----
  async function handleRefresh() {
    setRefreshing(true);
    try {
      // In production this would call a Cloud Function to refresh from OpenRouter API.
      // For now, just refresh from Firestore cache.
      const configDoc = await getDoc(doc(db, 'config', 'openrouter'));
      if (configDoc.exists()) {
        const data = configDoc.data() as CachedModelList;
        if (data.models && data.models.length > 0) {
          setModels(data.models);
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ models: data.models, fetchedAt: new Date().toISOString() }),
          );
          toast('success', 'Model list refreshed.');
        }
      } else {
        toast('info', 'Using default model list. Cloud Function not yet wired.');
      }
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to refresh model list.');
    } finally {
      setRefreshing(false);
    }
  }

  // ---- favorites ----
  function toggleFavorite(modelId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      try {
        localStorage.setItem(
          'classpulse_model_favorites',
          JSON.stringify([...next]),
        );
      } catch { /* ignore */ }
      return next;
    });
  }

  // ---- assign model ----
  function handleAssignModel(functionName: string, modelId: string) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.functionName === functionName ? { ...a, currentModel: modelId } : a,
      ),
    );
    setChangingFunction(null);
    toast('success', `Model assigned to ${functionName}. Save to apply.`);
  }

  // ---- filtered models ----
  const filteredModels = useMemo(() => {
    let result = [...models];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q),
      );
    }

    if (filterVision) {
      result = result.filter((m) => m.hasVision);
    }
    if (filterFree) {
      result = result.filter(
        (m) => m.pricing.prompt === 0 && m.pricing.completion === 0,
      );
    }
    if (filterFavorites) {
      result = result.filter((m) => favorites.has(m.id));
    }

    return result;
  }, [models, searchQuery, filterVision, filterFree, filterFavorites, favorites]);

  // ---- loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading model configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Model Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage AI model assignments for pipeline functions.
        </p>
      </div>

      <GuidanceTip id="admin-models-intro">
        These settings control which AI models power each step of the analysis pipeline. The defaults work well for most use cases — only change them if you have a specific reason.
      </GuidanceTip>

      {/* ====== SECTION 1: CURRENT ASSIGNMENTS ====== */}
      <section>
        <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Current Assignments
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {assignments.map((assignment) => {
            const model = models.find((m) => m.id === assignment.currentModel);
            const isChanging = changingFunction === assignment.functionName;

            return (
              <div
                key={assignment.functionName}
                className="bg-card border border-border rounded-[--radius-md] p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      {assignment.functionName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {assignment.description}
                    </p>
                  </div>
                  <Zap className="w-4 h-4 text-primary/60 flex-shrink-0" />
                </div>

                <div className="mt-3 p-2 bg-muted/50 rounded-[--radius-md]">
                  <div className="text-xs text-muted-foreground">Current model</div>
                  <div className="text-sm font-medium text-foreground mt-0.5">
                    {model?.name ?? assignment.currentModel}
                  </div>
                  {model && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{model.provider}</span>
                      <span className="text-xs text-border">|</span>
                      <span className="text-xs text-muted-foreground">
                        {formatContextWindow(model.contextWindow)} ctx
                      </span>
                      {model.hasVision && (
                        <>
                          <span className="text-xs text-border">|</span>
                          <Eye className="w-3 h-3 text-blue-400" />
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() =>
                    setChangingFunction(
                      isChanging ? null : assignment.functionName,
                    )
                  }
                  className="mt-3 w-full text-xs text-primary hover:text-primary font-medium py-1.5 rounded-[--radius-md] border border-primary/20 hover:bg-primary/10 transition-colors"
                >
                  {isChanging ? 'Cancel' : 'Change'}
                </button>

                {/* Model selector dropdown */}
                {isChanging && (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-[--radius-md] bg-card shadow-[--shadow-lg]">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() =>
                          handleAssignModel(assignment.functionName, m.id)
                        }
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between border-b border-border/50 last:border-0 ${
                          m.id === assignment.currentModel
                            ? 'bg-primary/10'
                            : ''
                        }`}
                      >
                        <div>
                          <span className="font-medium text-foreground">
                            {m.name}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            {m.provider}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {m.hasVision && (
                            <Eye className="w-3 h-3 text-blue-400" />
                          )}
                          {m.id === assignment.currentModel && (
                            <Check className="w-3 h-3 text-primary" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ====== SECTION 2: MODEL BROWSER ====== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Model Browser
          </h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary font-medium disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-[--radius-md] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <button
            onClick={() => setFilterVision(!filterVision)}
            className={`flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-[--radius-md] border transition-colors ${
              filterVision
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <Eye className="w-3 h-3" />
            Vision Only
          </button>

          <button
            onClick={() => setFilterFree(!filterFree)}
            className={`flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-[--radius-md] border transition-colors ${
              filterFree
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <Star className="w-3 h-3" />
            Free
          </button>

          <button
            onClick={() => setFilterFavorites(!filterFavorites)}
            className={`flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-[--radius-md] border transition-colors ${
              filterFavorites
                ? 'border-pink-300 bg-pink-50 text-pink-700'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <Heart className="w-3 h-3" />
            Favorites
          </button>
        </div>

        {/* Model table */}
        <div className="bg-card border border-border rounded-[--radius-md] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Provider</th>
                  <th className="px-4 py-2.5 text-right">Context</th>
                  <th className="px-4 py-2.5 text-center">Vision</th>
                  <th className="px-4 py-2.5 text-right">Prompt</th>
                  <th className="px-4 py-2.5 text-right">Completion</th>
                  <th className="px-4 py-2.5 w-32">Use for...</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredModels.map((model) => (
                  <tr
                    key={model.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    {/* Favorite */}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleFavorite(model.id)}
                        className={`p-0.5 rounded ${
                          favorites.has(model.id)
                            ? 'text-pink-500'
                            : 'text-border hover:text-pink-400'
                        }`}
                      >
                        <Heart
                          className="w-3.5 h-3.5"
                          fill={favorites.has(model.id) ? 'currentColor' : 'none'}
                        />
                      </button>
                    </td>

                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {model.name}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {model.id}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{model.provider}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatContextWindow(model.contextWindow)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {model.hasVision ? (
                        <Eye className="w-4 h-4 text-blue-500 mx-auto" />
                      ) : (
                        <span className="text-border">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatPrice(model.pricing.prompt)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatPrice(model.pricing.completion)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="relative">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignModel(e.target.value, model.id);
                              e.target.value = '';
                            }
                          }}
                          className="text-xs border border-border rounded-[--radius-md] pl-2 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-ring appearance-none bg-card w-full cursor-pointer"
                        >
                          <option value="">Assign...</option>
                          {assignments.map((a) => (
                            <option key={a.functionName} value={a.functionName}>
                              {a.functionName}
                              {a.currentModel === model.id ? ' (current)' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredModels.length === 0 && (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No models match your filters.
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {models.length} models loaded. Prices per 1M tokens.
          Cloud Function for live refresh not yet wired.
        </p>
      </section>
    </div>
  );
}
