# ADR 0001: Deterministic decision engine, LLM as narrator

**Status:** Accepted

## Context
Loan advice is regulated and high-stakes. Wrong EMIs, invented rates or implied approvals cause real financial harm and compliance exposure. LLMs are good at explaining but unreliable at arithmetic and policy, and they can be manipulated through prompt injection.

## Decision
- Eligibility, pricing (EMI, interest, fee, APR), ranking and tenure comparison live in a pure, framework-free TypeScript domain layer (`server/src/domain`) with 100% unit-test coverage.
- Profile changes from chat are extracted with deterministic rules and echoed back to the user. The LLM never writes state.
- The LLM receives only a pre-formatted, PII-free `FACTS` JSON built from engine output and is instructed to use nothing else.

## Consequences
- Every number shown is reproducible and auditable (`factsHash` is logged per reply).
- The assistant cannot "creatively" find a better deal than the catalog allows. This is intended.
- The same engine powers the UI cards, the chat, the summary download and the fallback answers, so they can never disagree.

## Alternatives considered
- **LLM with tool calls for calculations**: still lets the model choose what to compute and how to describe eligibility. Harder to test exhaustively.
- **RAG over product PDFs**: useful for policy Q&A later, but retrieval doesn't guarantee correct arithmetic or eligibility.
