# Architecture Decision Records

| # | Decision | Status |
|---|---|---|
| [0001](0001-deterministic-engine-llm-as-narrator.md) | Deterministic decision engine; the LLM only narrates verified facts | Accepted |
| [0002](0002-output-verification-and-fallback.md) | Verify every LLM answer (kind-aware numeric grounding) and fall back to rules | Accepted |
| [0003](0003-data-isolation-at-repository-boundary.md) | Enforce per-user isolation at the repository boundary, identity only from the token | Accepted |
| [0004](0004-pluggable-storage-contract-tests.md) | In-memory by default, MongoDB optional, one contract test suite for both | Accepted |
| [0005](0005-degrade-gracefully-circuit-breaker.md) | Circuit breaker and degrade-to-rules; LLM outage never makes the service unready | Accepted |
