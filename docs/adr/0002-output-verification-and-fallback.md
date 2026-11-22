# ADR 0002: Verify every LLM answer and fall back to rules

**Status:** Accepted

## Context
Even with a grounded prompt, models occasionally re-round figures, invent rates or slip in approval language. Prompt instructions alone are not a control.

## Decision
- After every LLM call, `validateOutput` extracts every amount (₹, lakh, crore, k), percentage, month and year figure (English and Hindi units) and checks it **by kind** against the numbers present in FACTS or the user's own message. Amounts get rupee-rounding tolerance (1%, or 5% when written as "5 lakh").
- A banned-claim filter rejects approval promises ("you will be approved", "guaranteed", "pre-approved"), investment advice and prompt leakage.
- On any failure, or if the LLM errors or times out, the user gets a deterministic answer composed from the same FACTS. The UI labels which path produced the answer.
- A property test asserts that the deterministic composer always passes the same verifier (3 personas × 5 intents).

## Consequences
- Unverified numbers never reach the user.
- The verifier is deliberately strict. A correct but re-derived figure is rejected, which costs readability, never correctness.
- The eval harness (`npm run eval`) measures the acceptance rate, so prompt changes can be judged on data.

## Alternatives considered
- **LLM-as-judge**: probabilistic, adds latency and cost, and can itself hallucinate.
- **Structured JSON output with template rendering**: safer still but less conversational. Good future option for specific intents.
