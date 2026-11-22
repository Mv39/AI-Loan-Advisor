import { env } from '../config/env';
import { logger } from '../utils/logger';

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmRequest {
  prompt: string;
  metadata?: Record<string, string>;
}

export interface LlmClient {
  readonly enabled: boolean;
  complete(req: LlmRequest): Promise<string>;
}

/** Pulls the answer text out of whatever JSON envelope the wrapper returns. */
export function extractText(body: unknown): string | undefined {
  if (typeof body === 'string') return body.trim() || undefined;
  if (!body || typeof body !== 'object') return undefined;
  const o = body as Record<string, unknown>;
  for (const key of ['response', 'text', 'answer', 'output', 'completion', 'result', 'content', 'message', 'reply']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // OpenAI-style: choices[0].message.content | choices[0].text
  const choices = o.choices as Array<{ message?: { content?: unknown }; text?: unknown }> | undefined;
  if (Array.isArray(choices) && choices[0]) {
    const c = choices[0].message?.content ?? choices[0].text;
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  // Anthropic-style: content: [{type:'text', text}]
  if (Array.isArray(o.content)) {
    const t = (o.content as Array<Record<string, unknown>>)
      .filter((b) => typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();
    if (t) return t;
  }
  // Nested envelopes: { data: {...} } / { result: {...} } / { message: {...} }
  for (const key of ['data', 'result', 'message', 'output']) {
    if (o[key] && typeof o[key] === 'object') {
      const nested = extractText(o[key]);
      if (nested) return nested;
    }
  }
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpLlmClient implements LlmClient {
  constructor(
    private readonly baseUrl = env.LLM_BASE_URL,
    private readonly token = env.LLM_API_TOKEN,
    private readonly timeoutMs = env.LLM_TIMEOUT_MS,
    private readonly maxRetries = env.LLM_MAX_RETRIES,
    readonly enabled = env.LLM_ENABLED,
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    if (!this.enabled) throw new LlmError('LLM disabled');
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/llm/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const raw = await res.text();
        if (!res.ok) {
          throw new LlmError(`LLM HTTP ${res.status}`, res.status, res.status === 429 || res.status >= 500);
        }
        let body: unknown = raw;
        try {
          body = JSON.parse(raw);
        } catch {
          /* plain-text body */
        }
        const text = extractText(body);
        if (!text) throw new LlmError('LLM returned an empty or unrecognised response');
        logger.info('llm.ok', { attempt, ms: Date.now() - started, traceId: req.metadata?.traceId });
        return text;
      } catch (err) {
        lastErr = err;
        const retryable = err instanceof LlmError ? err.retryable : true; // network/timeout errors are retryable
        logger.warn('llm.error', {
          attempt,
          ms: Date.now() - started,
          traceId: req.metadata?.traceId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!retryable || attempt === this.maxRetries) break;
        await sleep(300 * 2 ** attempt);
      }
    }
    throw lastErr instanceof LlmError ? lastErr : new LlmError(lastErr instanceof Error ? lastErr.message : 'LLM failed', undefined, true);
  }
}
