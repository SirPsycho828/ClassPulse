import * as admin from 'firebase-admin';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenRouterUsage {
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface OpenRouterResponse {
  content: string;
  usage: OpenRouterUsage;
  modelUsed: string;
}

export type PipelineFunction = 'extraction' | 'skillInference' | 'analysis';

interface ModelConfig {
  modelId: string;
  requiresVision: boolean;
}

// ---------------------------------------------------------------------------
// Defaults (used when Firestore doc does not exist)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIGS: Record<PipelineFunction, ModelConfig> = {
  extraction: {
    modelId: 'google/gemini-2.5-flash',
    requiresVision: true,
  },
  skillInference: {
    modelId: 'anthropic/claude-sonnet-4-6',
    requiresVision: false,
  },
  analysis: {
    modelId: 'anthropic/claude-sonnet-4-6',
    requiresVision: false,
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const RETRY_DELAY_MS = 1000;
const TRANSIENT_STATUS_CODES = new Set([500, 502, 503, 504, 429]);

// ---------------------------------------------------------------------------
// Firestore model config validation
// ---------------------------------------------------------------------------

const ModelConfigSchema = z.object({
  modelId: z.string().min(1),
  requiresVision: z.boolean(),
});

// ---------------------------------------------------------------------------
// Firestore model config reader
// ---------------------------------------------------------------------------

/**
 * Reads the model config for a specific pipeline function from the
 * `config/openrouter` Firestore document. Falls back to defaults if the
 * document is missing or the function entry is absent.
 */
export async function getModelConfig(fn: PipelineFunction): Promise<ModelConfig> {
  const db = admin.firestore();
  const docSnap = await db.collection('config').doc('openrouter').get();

  if (!docSnap.exists) {
    return DEFAULT_CONFIGS[fn];
  }

  const data = docSnap.data();
  const entry = data?.models?.[fn];

  if (!entry) {
    return DEFAULT_CONFIGS[fn];
  }

  const result = ModelConfigSchema.safeParse(entry);
  if (!result.success) {
    console.warn(`Invalid model config for ${fn}, using defaults:`, result.error.message);
    return DEFAULT_CONFIGS[fn];
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface OpenRouterRequestBody {
  model: string;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  response_format?: { type: 'json_object' };
}

interface OpenRouterAPIResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment secret is not set');
  }
  return key;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes a single HTTP request to the OpenRouter chat completions endpoint.
 * Throws on non-2xx responses, including transient errors. The caller
 * decides whether to retry.
 */
async function sendRequest(
  body: OpenRouterRequestBody,
): Promise<{ apiResponse: OpenRouterAPIResponse; costHeader: number }> {
  const apiKey = getApiKey();

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://classpulse.app',
      'X-Title': 'ClassPulse',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const isTransient = TRANSIENT_STATUS_CODES.has(response.status);
    const errorText = await response.text().catch(() => '');
    // Sanitize error text — never include the API key in error messages
    const sanitized = errorText.includes(apiKey) ? '[redacted]' : errorText;
    const err = new OpenRouterError(
      `OpenRouter request failed: ${response.status} ${response.statusText} — ${sanitized}`,
      response.status,
      isTransient,
    );
    throw err;
  }

  // OpenRouter returns cost in a response header when available
  const costStr = response.headers.get('x-openrouter-cost') ?? '0';
  const costHeader = parseFloat(costStr) || 0;

  const apiResponse = (await response.json()) as OpenRouterAPIResponse;
  return { apiResponse, costHeader };
}

class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isTransient: boolean,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

function extractContent(apiResponse: OpenRouterAPIResponse): string {
  const choice = apiResponse.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('OpenRouter response contained no content');
  }
  return choice.message.content;
}

function extractUsage(
  apiResponse: OpenRouterAPIResponse,
  costHeader: number,
): OpenRouterUsage {
  const usage = apiResponse.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return {
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    cost: costHeader,
  };
}

// ---------------------------------------------------------------------------
// Main exported call function
// ---------------------------------------------------------------------------

/**
 * Calls OpenRouter for a given pipeline function.
 *
 * - Reads the model assignment from Firestore (`config/openrouter`).
 * - Sends messages to the chat completions endpoint with `response_format:
 *   json_object` so the model is instructed to return valid JSON.
 * - On 5xx / timeout: retries once after a short delay.
 * - On 4xx: throws immediately (no retry).
 * - Returns the raw content string; the caller is responsible for Zod
 *   parsing.
 */
export async function callOpenRouter(
  fn: PipelineFunction,
  messages: Array<{ role: string; content: string | Array<unknown> }>,
): Promise<OpenRouterResponse> {
  const config = await getModelConfig(fn);
  console.log(`[callOpenRouter] fn=${fn} model=${config.modelId}`);

  const body: OpenRouterRequestBody = {
    model: config.modelId,
    messages,
    response_format: { type: 'json_object' },
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS);
    }

    try {
      const { apiResponse, costHeader } = await sendRequest(body);

      const content = extractContent(apiResponse);
      const usage = extractUsage(apiResponse, costHeader);
      const modelUsed = apiResponse.model ?? config.modelId;

      return { content, usage, modelUsed };
    } catch (err: unknown) {
      lastError = err;

      // Only retry on transient failures (5xx / timeout) — not on 4xx.
      if (err instanceof OpenRouterError && !err.isTransient) {
        throw err;
      }

      // On the first attempt, log and retry once.
      if (attempt === 0) {
        console.warn(
          `[openrouter] Transient error on attempt ${attempt + 1} for fn="${fn}". Retrying.`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }
    }
  }

  // Both attempts failed — surface the last error.
  throw lastError;
}
