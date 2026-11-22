import { metrics } from '../utils/metrics';
import { logger } from '../utils/logger';
import { LlmClient, LlmError, LlmRequest } from './llm.client';

export type BreakerState = 'closed' | 'open' | 'half_open';
const STATE_GAUGE: Record<BreakerState, number> = { closed: 0, open: 1, half_open: 2 };

/**
 * Circuit breaker around the LLM. After `failureThreshold` consecutive
 * failures it opens and short-circuits calls for `cooldownMs` (users instantly
 * get the deterministic answer instead of waiting for timeouts), then lets a
 * single trial request through (half-open) to probe recovery.
 */
export class CircuitBreakerLlmClient implements LlmClient {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;

  constructor(
    private readonly inner: LlmClient,
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {
    metrics.llmCircuitState.set(0);
  }

  get enabled() {
    return this.inner.enabled;
  }

  get currentState(): BreakerState {
    if (this.state === 'open' && this.now() - this.openedAt >= this.cooldownMs) return 'half_open';
    return this.state;
  }

  private transition(to: BreakerState) {
    if (this.state !== to) logger.warn('llm.circuit', { from: this.state, to });
    this.state = to;
    metrics.llmCircuitState.set(STATE_GAUGE[to]);
  }

  async complete(req: LlmRequest): Promise<string> {
    const state = this.currentState;
    if (state === 'open' || (state === 'half_open' && this.trialInFlight)) {
      metrics.llmRequests.inc({ outcome: 'short_circuited' });
      throw new LlmError('LLM circuit open', undefined, false);
    }
    if (state === 'half_open') {
      this.transition('half_open');
      this.trialInFlight = true;
    }

    const started = this.now();
    try {
      const out = await this.inner.complete(req);
      metrics.llmRequests.inc({ outcome: 'ok' });
      metrics.llmDuration.observe((this.now() - started) / 1000);
      this.failures = 0;
      this.transition('closed');
      return out;
    } catch (err) {
      metrics.llmRequests.inc({ outcome: 'error' });
      metrics.llmDuration.observe((this.now() - started) / 1000);
      this.failures++;
      if (state === 'half_open' || this.failures >= this.failureThreshold) {
        this.openedAt = this.now();
        this.transition('open');
      }
      throw err;
    } finally {
      if (state === 'half_open') this.trialInFlight = false;
    }
  }
}
