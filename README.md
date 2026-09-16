# betway-booking-backend

Node.js/TypeScript (Fastify) service for the Betway Nigeria booking-code product. Sits
between the web/mobile clients and Betway's anonymous, unofficial API — decode, encode
(create), and convert operations over booking codes.

API contract: `docs/betway-api.md` (our own verified reverse-engineering, 2026-09-16).

## Endpoints (planned, see `docs/betway-api.md` §10)

- `POST /api/booking-codes/resolve` — decode
- `POST /api/booking-codes` — encode (create), with post-check: decode the code just
  created, reject empty/conflicting slips
- `POST /api/booking-codes/convert` — decode → drop unbettable legs → re-encode
- `GET /api/sports`, `GET /api/events`, `GET /api/events/:id/markets` — proxy for the
  Create-screen picker

## Dev

```
npm install
npm run dev
```
