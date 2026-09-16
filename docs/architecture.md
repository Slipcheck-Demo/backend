# Architecture — Betway Nigeria booking-code product

Three independently deployable repos: `backend` (this one — Node.js/TypeScript, Fastify),
`frontend` (Next.js), `mobile` (Flutter). Neither client ever calls Betway directly —
everything goes through this backend, which is the only thing that talks to Betway's
anonymous, unofficial API (`docs/betway-api.md`).

## System overview

```mermaid
graph TD
    subgraph Clients
        Web["frontend (Next.js)<br/>Decode / Create / Convert"]
        Mobile["mobile (Flutter)<br/>Decode only"]
    end

    Backend["backend (Fastify)<br/>resolve / create / convert<br/>+ sports / events / markets proxy"]
    DB[("Postgres<br/>BookingCodeRequest")]
    Betway["Betway Nigeria<br/>anonymous web-client API"]

    Web -- "HTTPS JSON (CORS)" --> Backend
    Mobile -- "HTTPS JSON (dio/retrofit)" --> Backend
    Backend -- "FindBookABet / BookABet /<br/>sports / events / markets" --> Betway
    Backend -- "fire-and-forget<br/>request history log" --> DB
```

Why this shape:
- **One backend, two clients.** Web and mobile share one contract (`docs/betway-api.md`
  §10) instead of each reverse-engineering Betway independently — CORS only matters for
  the browser client (`src/app.ts`'s `CORS_ORIGIN`), Dio on mobile isn't subject to it.
- **History logging is fire-and-forget** (`src/db/logRequest.ts`) — a DB hiccup can never
  turn an otherwise-successful Betway round trip into a 500, and it doesn't add a blocking
  round trip to the response path.
- **Mobile is Decode-only** — the take-home explicitly allows "a rough one-screen version"
  for the Flutter delivery.

## Decode flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client (web/mobile)
    participant B as Backend
    participant BW as Betway

    U->>C: Paste booking code
    C->>B: POST /api/booking-codes/resolve
    B->>BW: POST v2/Betting/FindBookABet
    alt valid code
        BW-->>B: 200 selections[]
        B->>B: normalize (trim names, six-signal isBettable)
        B-->>C: 200 { bookingCode, selections, totalOdds }
    else wrong / expired / empty slip
        BW-->>B: 400 BookABetInvalidCode/SelectionsExpired<br/>or 200 with selections: []
        Note over B: all three collapse to one case —<br/>docs/betway-api.md §2 Расхождение №2
        B-->>C: 404 { error: "invalid_code" }
    end
    B-)DB: log request (fire-and-forget)
    C-->>U: Render slip card / error banner
```

## Create (encode) flow

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Backend
    participant BW as Betway

    C->>B: POST /api/booking-codes { outcomeIds }
    B->>BW: POST v1/Betting/BookABet
    BW-->>B: 200 { bookingCode }
    Note over B: BookABet validates neither dead ids<br/>nor same-event conflicts (§3) — decode<br/>what was just created before trusting it
    B->>BW: POST v2/Betting/FindBookABet (verify)
    BW-->>B: selections[]
    alt every leg dead
        B-->>C: 404 { error: "invalid_code" }
    else two legs share an eventId
        B-->>C: 400 { error: "conflicting_selections" }
    else ok
        B-->>C: 200 { bookingCode, selections, totalOdds }
    end
    B-)B: log request (fire-and-forget)
```

## Convert flow

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Backend
    participant BW as Betway

    C->>B: POST /api/booking-codes/convert { bookingCode }
    B->>BW: POST v2/Betting/FindBookABet
    BW-->>B: selections[]
    B->>B: filter isLegBettable (six staleness signals)
    alt no bettable legs left
        B-->>C: 404 { error: "invalid_code" }
    else at least one bettable leg
        B->>BW: POST v1/Betting/BookABet (bettable outcomeIds only)
        Note over BW: encode is deterministic by content —<br/>same outcome set ⇒ same code (§3)
        BW-->>B: { bookingCode: resultCode }
        B-->>C: 200 { bookingCode: resultCode,<br/>selections, removedLegs, totalOdds }
    end
    B-)B: log request (fire-and-forget)
```

## Data model

One table: a log of every decode/create/convert request the backend has handled. No user
accounts, no cached slip data — slips are always re-fetched live from Betway.

```mermaid
erDiagram

    BookingCodeRequest {
        text id PK
        text operation
        text bookingCode
        text resultCode
        text status
        int legCount
        timestamp createdAt
    }
```

Generated via `.claude/skills/prisma-postgres-history/scripts/erd_generator.py` against a
`prisma migrate diff` DDL dump of `prisma/schema.prisma`. A single-entity diagram is the
correct output here, not an incomplete one — see that skill's SKILL.md.

- `operation`: `"resolve" | "create" | "convert"`
- `bookingCode`: input code for resolve/convert; output code for create
- `resultCode`: the new code produced by convert (null for resolve/create)
- `status`: `"ok" | "invalid_code" | "conflicting_selections" | "upstream_error"`
