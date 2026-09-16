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
    Betway["Betway Nigeria<br/>anonymous web-client API"]

    Web -- "HTTPS JSON (CORS)" --> Backend
    Mobile -- "HTTPS JSON (dio/retrofit)" --> Backend
    Backend -- "FindBookABet / BookABet /<br/>sports / events / markets" --> Betway
```

Why this shape:
- **One backend, two clients.** Web and mobile share one contract (`docs/betway-api.md`
  §10) instead of each reverse-engineering Betway independently — CORS only matters for
  the browser client (`src/app.ts`'s `CORS_ORIGIN`), Dio on mobile isn't subject to it.
- **No database.** Every slip is decoded live from Betway on each request; there's no user
  data or state worth persisting, so there's nothing a database would do here beyond
  logging requests nobody reads — the take-home only asks for one "if required".
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
```
