# Changelog

## 1.1.0
- **MongoDB persistence** (optional via `MONGO_URI`): user-scoped indexes, TTL-based retention, seed-on-insert. Shared repository contract tests run against in-memory storage locally and real MongoDB in CI.
- **Reliability:** LLM circuit breaker (closed, open, half-open), `/api/ready` readiness probe.
- **Observability:** Prometheus `/metrics` (HTTP, LLM outcomes and latency, circuit state, reply source, guardrail events), `LOG_LEVEL`.
- **API docs:** OpenAPI 3.1 generated from the Zod validators, Swagger UI at `/api/docs`. A test fails if any route is undocumented.
- **Quality gates:** ESLint (typescript-eslint, angular-eslint), Prettier, CI lint, format, typecheck, test, audit, E2E and Docker jobs.
- **LLM eval harness:** `npm run eval`, 16 golden scenarios, reports verifier acceptance rate, behavioural pass rate and latency.
- **E2E:** Playwright suite against the production build.
- **Docs:** five ADRs, SECURITY.md.

## 1.0.0
- Conversational loan advisor: deterministic eligibility, EMI and APR engine, ranked recommendations, tenure trade-offs.
- Grounded LLM answers with numeric verification and rules fallback. PII redaction, prompt-injection and scope guardrails.
- JWT auth with per-user isolation, summary download, multi-turn comparison, Hindi and voice.
