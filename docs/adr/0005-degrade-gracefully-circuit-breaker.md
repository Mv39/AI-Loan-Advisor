# ADR 0005: Circuit breaker and degrade-to-rules

**Status:** Accepted

## Context
The LLM is an external dependency with variable latency and availability. Without protection, an outage makes every chat request wait for the full timeout, piles up connections and degrades the whole service.

## Decision
- `HttpLlmClient`: 20 s timeout and 1 retry with exponential backoff for 5xx, 429 and network errors. No retry for 4xx.
- `CircuitBreakerLlmClient` wraps it: after `LLM_BREAKER_FAILURES` (3) consecutive failures it **opens** for `LLM_BREAKER_COOLDOWN_MS` (30 s) and short-circuits calls, so users instantly get the deterministic answer. Then it lets a single **half-open** trial through.
- `/api/ready` reflects storage only. An LLM outage does not make the pod unready, because the product still works in rules mode. The breaker state is reported for visibility.
- Prometheus metrics: `llm_requests_total{outcome}`, `llm_request_duration_seconds`, `llm_circuit_state`, `advisor_replies_total{source,intent}`, `guardrail_events_total{stage,type}`.

## Consequences
- An LLM outage turns into a slightly less conversational experience instead of errors or timeouts.
- Alerting can key on `llm_circuit_state == 1` or a rising `advisor_replies_total{source="rules"}` ratio.
