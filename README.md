# betway-booking-backend

Node.js/TypeScript (Fastify) service for the Betway Nigeria booking-code product. Sits
between the web/mobile clients and Betway's anonymous, unofficial API — decode, encode
(create), and convert operations over booking codes. Stateless: no database — every slip is
re-fetched live from Betway on each request, so there's nothing to persist.

API contract: `docs/betway-api.md` (our own verified reverse-engineering, 2026-09-16).
Architecture (system diagram, decode/create/convert sequence diagrams): `docs/architecture.md`.

## Endpoints

- `POST /api/booking-codes/resolve` — decode a booking code
- `POST /api/booking-codes` — create (encode) a code from `outcomeIds`; decodes what it
  just created and rejects dead-outcome or same-event-conflicting slips before responding
- `POST /api/booking-codes/convert` — decode → drop legs that fail the six staleness
  signals → re-encode the rest
- `GET /api/sports` — real sports only (promo tiles filtered out)
- `GET /api/events?sportId=&skip=&take=` — upcoming events with their inline 1X2 market
- `GET /api/events/:eventId/markets` — full market list for one event (squashed
  Totals/Handicap markets joined correctly)

Error responses are always `{ "error": <code> }` — `invalid_code` (404),
`conflicting_selections` (400), `validation_error` (400), `upstream_error` (502). Betway's
own error codes/messages are never forwarded to clients.

## Dev setup

```
cp .env.example .env
npm install
npm run dev                       # http://localhost:3000
```

## Test

```
npm test          # Jest + Supertest, mocks all outbound Betway calls — no live network
npm run typecheck
```
