# ADR 0004: In-memory by default, MongoDB optional, one contract suite

**Status:** Accepted

## Context
Reviewers should be able to run the project with zero infrastructure, while a production-shaped deployment needs durable storage (MEAN stack: MongoDB).

## Decision
- `ProfileRepository` and `ChatRepository` interfaces with two implementations: in-memory (default) and MongoDB (enabled by `MONGO_URI`).
- MongoDB setup: compound index `(userId, updatedAt)` for listing, an owner lookup index, and a **TTL index on `updatedAt`** so idle chat sessions are deleted by the database (retention by design). Demo profiles are seeded with `$setOnInsert`, so restarts never overwrite user edits. Profiles use `replaceOne`, so removed optional fields really disappear.
- One behavioural **contract test suite** runs against both. CI runs it against a real `mongo:7` service container.

## Consequences
- Same isolation and retention guarantees regardless of backend.
- `docker compose up` gives the full MEAN stack (Angular, Express, Node, MongoDB).
- Future: field-level encryption (CSFLE) for income and EMI fields, and a migration tool for schema evolution.
