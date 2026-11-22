# ADR 0003: Per-user isolation at the repository boundary

**Status:** Accepted

## Context
Borrower profiles and chat histories are personal financial data. IDOR (insecure direct object reference) is the most common access-control bug in APIs: a route forgets an ownership check and returns another user's record by id.

## Decision
- Identity comes **only** from the verified JWT (`req.auth.userId`). Routes are `/api/me/...`. No user id is ever accepted from path, query or body, and strict Zod schemas reject unexpected fields.
- Every repository method takes `userId` as its first argument and filters by it (`{ _id: sessionId, userId }` in MongoDB, user-partitioned maps in memory). There is no owner-less "get by id".
- Another user's resource returns `404`, never `403`, so ids can't be enumerated.

## Consequences
- A route handler cannot accidentally leak data, because the data layer has no API that would allow it.
- Covered by API tests (read, post, delete across users) and by the repository contract suite for both storage backends.
- Staff and admin access will need an explicit, separately audited path, which is intended.
