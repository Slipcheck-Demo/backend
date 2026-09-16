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

## How the solution works

Three repos, one product: `backend` (this one), `frontend` (Next.js, deployed to Vercel),
`mobile` (Flutter, Android APK via Firebase App Distribution). Full diagrams in
`docs/architecture.md`; this is the short prose version.

**The core problem**: Betway Nigeria has no public API. Booking codes are produced/consumed
by an anonymous endpoint the website itself calls (`docs/betway-api.md`), reverse-engineered
by watching the site's own network traffic. Everything this product does is a thin,
validated layer on top of two calls: `FindBookABet` (decode a code into its selections) and
`BookABet` (encode a set of outcome ids into a new code).

**Backend is the only thing that talks to Betway.** Neither client calls it directly — this
avoids each client independently reverse-engineering the same undocumented contract, and
keeps CORS a solved problem in one place (`src/app.ts`). It's intentionally stateless: no
database, because nothing here needs one — every slip is decoded fresh from Betway on each
request, there are no user accounts, and the one thing that *could* go in a database (a log
of every request) was never read by anything, so it was cut rather than shipped as dead
weight.

**Three operations, one shared normalization step**: decode, create (encode), and convert
(decode → drop stale legs → re-encode) all funnel through the same `normalizeSelection` /
`isLegBettable` logic (`src/domain/`), because Betway's raw response conflates "this leg is
still bettable" across six different signals (market/selection suspended, event started,
etc.) — see `docs/betway-api.md` for the full enumeration. Getting this list right was the
single trickiest part of the whole build: it's not documented anywhere, and getting it wrong
either shows a dead leg as live (user generates a slip Betway rejects) or a live leg as dead
(user loses a leg that was actually fine).

**Frontend** (`../frontend`) is the full experience — Decode, Create (sport → match → market
picker), Convert — built against the same design tokens as mobile (`../docs/design-tokens.md`)
so the two clients read as one product, not two separate builds.

**Mobile** (`../mobile`) is deliberately Decode-only, per the assessment's explicit "a rough
one-screen version is sufficient" — same backend contract, `dio`/`retrofit` instead of
`fetch`, no CORS concern since it's not a browser.

**Deployment**: backend + this repo run on a Hetzner VPS behind an isolated Caddy instance
terminating TLS via a Let's Encrypt cert issued for a `sslip.io` hostname (no owned domain
was available) — kept deliberately separate from the other Caddy already running on that box
for an unrelated project, rather than editing shared production config. Frontend is a
standalone deploy on Vercel. Neither deployment step required provisioning a database.
