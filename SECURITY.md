# Security Policy

## Reporting a vulnerability
Please report suspected vulnerabilities privately to the maintainer rather than opening a public issue. Include steps to reproduce and the impact. You'll get an acknowledgement within 3 business days.

## Security model (summary)
| Area | Control |
|---|---|
| Authentication | Signed, expiring JWT (HS256 pinned, `iss`/`aud`/`exp` verified). The demo IdP is mocked; production uses OIDC with RS256/JWKS and httpOnly cookies |
| Authorization | Identity from the token only. Per-user filtering enforced in every repository method. Cross-user access returns 404 ([ADR 0003](docs/adr/0003-data-isolation-at-repository-boundary.md)) |
| Sensitive data | PAN, Aadhaar, card, phone, email, IFSC and account numbers redacted before storage, logs and LLM. The LLM never sees names or ids |
| AI safety | Prompt-injection and scope filters before the LLM. Kind-aware numeric verification and banned-claim filter after it. Deterministic fallback ([ADR 0002](docs/adr/0002-output-verification-and-fallback.md)) |
| Transport / browser | Helmet (HSTS, strict CSP without inline scripts), CORS allowlist, `Cache-Control: no-store` on API responses |
| Abuse | Per-user chat rate limit, login limiter, 20 kb body limit, 1000-char messages, Zod validation everywhere |
| Retention | Chat sessions expire after `SESSION_TTL_MINUTES` (MongoDB TTL index). History capped per session |
| Logging | Structured JSON, user ids hashed, no request bodies, PII scrubber on every field |
| Secrets | Only via environment (`.env` is git-ignored). Config validated at boot. Production refuses the default JWT secret |
| Supply chain | `npm audit` gate in CI (0 known vulnerabilities at release) |

See README section 6 for the full design and the production hardening plan (DPDP Act 2023, RBI Digital Lending Directions, field-level encryption, zero-retention LLM agreements).
