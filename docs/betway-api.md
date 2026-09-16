# Betway Nigeria — API contract (our own verification)

> Every request below was run live on 2026-09-16 via `curl`, no cookies/auth, straight from
> a home machine (not a browser). This is the single source of truth for the implementation;
> look. Below, three nuances worth calling out explicitly:> three places where we **recorded a discrepancy** — these need to be accounted for in the
> backend.

## 1. Domains (confirmed)

| Key | Base URL |
|---|---|
| `configDomain` | `https://config.betwayafrica.com` |
| `apicDomain` | `https://apic.betwayafrica.com/api` |
| `feeds` | `https://feeds-roa2.betwayafrica.com/br/_apis/sport/v1` |
| `bettingDomain` | `https://www.betway.com.ng/appsynapse/bet-api-sr` |

Every request worked as a plain `fetch`/`curl` with no headers beyond `Content-Type:
application/json` on POST — CORS/Cloudflare don't block the JSON API, only the HTML
document.

## 2. DECODE — `POST .../v2/Betting/FindBookABet`

```
POST https://www.betway.com.ng/appsynapse/bet-api-sr/v2/Betting/FindBookABet
Content-Type: application/json

{ "countryCode": "NG", "bookingCode": "BW72B383EE", "cultureCode": "en-US" }
```

Successful response (`200`) — confirmed on a code we created ourselves in the step below
(`BW72B383EE`, one outcome):

```json
{
  "selections": [
    {
      "outcomeId": "7469919811",
      "marketId": "746991981",
      "marketName": "1X2",
      "outcomeName": "Chelsea FC (Nathan)",
      "eventId": 74699198,
      "eventName": "Chelsea FC (Nathan) vs. Tottenham Hotspur FC (Kai)",
      "eventEpoch": 1789545600,
      "priceDecimal": 2.26,
      "priceNumerator": 63,
      "priceDenominator": 50,
      "isMarketActive": true,
      "isEventActive": true,
      "isOutcomeActive": true,
      "market": { "isSuspended": false },
      "sportEvent": { "isFinished": false },
      "outcome": { "isTradingActive": true }
    }
  ],
  "isBuildABet": false,
  "isSingleBet": false,
  "accountId": "00000000-0000-0000-0000-000000000000"
}
```

**Six signals of a "dead" leg** (confirmed by the response shape): top-level
`isMarketActive`/`isEventActive`/`isOutcomeActive` plus nested `market.isSuspended`,
`sportEvent.isFinished`, `outcome.isTradingActive`. A leg is only bettable if all six agree
— the three nested ones are easy to miss, since a suspended market still reports
`isMarketActive: true` at the top level.

Error on an unknown code (`400`, confirmed):

```json
{ "errorCode": 6000331, "errorMessage": "BookABetInvalidCode", "responseMetadata": null }
```

### ⚠️ Nuance #1 — a rate limit on rapid decode requests

Under frequent back-to-back requests to `FindBookABet` (several in a row with no pause), the
service once responded not with the expected `BookABetInvalidCode` but with:

```json
{ "errorCode": 6000359, "errorMessage": "BookABetLimitExceeded", "responseMetadata": null }
```

`400`. After a ~5s pause, the same request body worked normally. **Conclusion for the
backend:** our own requests to decode/encode need light throttling or retry-with-backoff,
`6000359`
should be mapped the same way as a transient error (retry), not as `invalid_code`.

### ⚠️ Discrepancy #2 — decoding a "dead" outcomeId

A code created from a non-existent `outcomeId` (`00000000000`) does not decode
as `200 {"selections": []}`. In our check (2026-09-16), the same `outcomeId` produced **the
same code** `BW6E59F360` (see §3 — encode is deterministic by content), but decoding it
returned:

```json
{ "errorCode": 6000332, "errorMessage": "BookABetSelectionsExpired", "responseMetadata": null }
```

`400`, not `200` with an empty array. **Conclusion:** both outcomes (an empty `selections`
array and `BookABetSelectionsExpired`) need to be treated the same way by the backend — "the
code exists, but there's nothing bettable on it" (`invalid_code`/dead-slip) — without relying
on one specific response shape. Live behavior may have changed on Betway's side between
2026-09-03 and 2026-09-16 — don't rely on a fixed shape for this edge case.

## 3. ENCODE — `POST .../v1/Betting/BookABet`

```
POST https://www.betway.com.ng/appsynapse/bet-api-sr/v1/Betting/BookABet
Content-Type: application/json

{
  "cultureCode": "en-US",
  "countryCode": "NG",
  "isSingleBet": false,
  "outcomes": [ { "outcomeId": "7469919811" } ]
}
```

Response (`200`, confirmed): `{ "bookingCode": "BW72B383EE" }`.

**Round-trip decode ⇄ encode confirmed** — the created code immediately decoded with the
same `outcomeId`/`eventId`/`marketId` (see §2).

**Encode is deterministic by the content of `outcomes`** (our own observation, not explicit
: re-sending `{"outcomeId":"00000000000"}` — the same non-existent id
reference used on 2026-09-03 — returned **the exact same** `bookingCode: "BW6E59F360"` as
the returned the same code both times. So the code isn't a random token, it's derived
deterministically (likely a hash/id) from the set of outcome ids. Worth accounting for in
tests: two identical encode requests will produce the same code — that's not a race
condition or a bug.

An empty `outcomes` array (confirmed, `400`):

```json
{ "errorCode": 10, "errorMessage": "UnexpectedError", "responseMetadata": null }
```

**Conflicting selections from the same event aren't validated** (confirmed): sending the
home-win and draw `outcomeId`s for the same match (`7469919811` + `7469919812`, event
`74699198`) returned `200` with a valid code that decodes with both legs, each
`isActive: true`. The backend must check `selection.eventId` for duplicates itself after
create and reject them as `conflicting_selections`.

## 4. Sports catalog — `GET config.betwayafrica.com/cron/sports/NG/en-US`

Confirmed: **28** entries, of which **3** aren't sports but promo tiles (`Codes`,
`Swipe Bet`, `Betway Stream`), with `sportType: "Promo"` instead of `"Sport"`. Filter by
`sportType === "Sport"` (25 real sports: soccer, tennis, basketball, cricket, rugby-union,
american-football, boxing, table-tennis, volleyball, golf, formula-1, aussie-rules,
handball, ice-hockey, baseball, darts, speedway, water-polo, cycling, badminton, futsal,
lacrosse, snooker, pesapallo, floorball).

## 5. Upcoming events — `GET feeds-roa2.../BetBook/Upcoming/`

```
GET .../BetBook/Upcoming/?countryCode=NG&sportId=soccer&Skip=0&Take=5&cultureCode=en-US
    &isEsport=false&boostedOnly=false&marketTypes=%5BWin%2FDraw%2FWin%5D
```

Response shape confirmed — flat, normalized `events`/`markets`/`outcomes`/`prices` arrays,
joined by `eventId`/`marketId`/`outcomeId`. On a sample of 5 events: the 1X2 market always
has 3 outcomes, indices `[2,3,4]` (home, draw, away), the middle one is always `"Draw"`,
`outcome.sbv` is empty. The `outcomeId` suffixes `1,2,3` are an outcome-type code, not a
position (see §7).

A nuance worth flagging: in the current sample (2026-09-16), most soccer
fixtures in the next few hours are **eSoccer** (`regionId: "esoccer"`), not live football.
This is expected (eSoccer cycles roughly every ~15 minutes and dominates the "upcoming"
window), but it's worth not being surprised by it when showing demo data.

## 6. An event's full market list (squashed markets)

```
GET .../MarketGroupings/group-names?eventId={eventId}&countryCode=NG
GET .../MarketGroupings/MarketGroupNamesAndMarketsForEvent?eventId={eventId}
    &marketGroupId=Main&countryCode=NG&cultureCode=en-US&skip=0&take=20
    &isBuildABetOnly=false&searchQuery=
```

Squashed-markets behavior is **fully confirmed** on a live event (`eventId=74699198`, group
`Main`, Totals market):

| | `isSquashedParent` | `isSquashedMarket` | `displayName` |
|---|---|---|---|
| parent | `true` | `false` | `"Total Goals"` — no line |
| child | `false` | `true` | `"Total (5.5)"` — with a line |

Outcomes join on the **child** id (`originalMarketId`), not on `marketId` (which points at
the parent):

```json
{
  "outcomeId": "7469919818total=5.5~12",
  "marketId": "7469919818",
  "originalMarketId": "7469919818total=5.5~",
  "name": "Over ",
  "sbv": " (5.5)"
}
```

**Rule confirmed:** join on `outcome.originalMarketId ?? outcome.marketId`, then drop rows
with `isSquashedParent: true` — otherwise Total/Handicap markets are duplicated, one copy
empty.

## 7. ID scheme (confirmed by response structure)

- `eventId` (`74699198`) → `marketId` (`746991981`, = eventId + type code `1` for 1X2) →
  `outcomeId` (`7469919811`, = marketId + suffix `1/2/3`).
- The suffix is an outcome-type code, not a position — sort outcomes by the `index` field,
  not by the id suffix.
- Squashed markets encode their parameter as text: `"7469919818total=5.5~"`.

## 8. Public booking-code catalog — `GET apic.betwayafrica.com/api/v1/Widget/BookingCodes`

### ⚠️ Discrepancy #3 — the catalog is currently empty

```
GET https://apic.betwayafrica.com/api/v1/Widget/BookingCodes?skip=0&limit=6&source=sportsradar
→ 200 { "total": 0, "nextSubset": 0, "data": [] }
```

Checked repeatedly (2026-09-16, with delays, with different combinations of query
parameters, including without `source`, with `countryCode=NG`, with `limit=20`) — stably
`total: 0`. Also note: the response
shape uses (`"nextSubset"` instead of a plain paginated `skip`,
though `skip`/`limit` are still accepted as query parameters).

**Open question — doesn't block launch, but affects design:** this endpoint can't be relied
on for "popular codes" in the empty state of the Decode screen right now. Before
implementing that part of the UI — recheck the endpoint again (possibly a temporary issue on
Betway's/the sportsradar feed's side); if it stays empty for a long time — use a code we
generate ourselves from live upcoming events instead (§5), as a demo fallback.

## 9. Platform notes (confirmed)

- Cloudflare protects the HTML document, not the JSON API — confirmed on every endpoint
  checked (GET and POST).
- All requests are anonymous, no auth/signature/captcha.
- Throttling was observed on decode (see Discrepancy #1) — build in retry-with-backoff.

## 10. Summary for the backend implementation

All three operations (decode, encode, sport→event→market→outcome browse) are confirmed to
be anonymous, reachable with a plain `fetch`/`curl` from Node with no headless browser. In


1. **Retry/backoff** on decode is needed not just for one transient 400, but also for
   `BookABetLimitExceeded` (6000359) — throttle our own outgoing requests to Betway.
2. **Unbettable/dead-code detection** after encode must check both possible decode
   responses: `200` with an empty/reduced `selections`, **and**
   `400 BookABetSelectionsExpired` — both map to the same internal status.
3. **The public code catalog is currently unavailable as a data source** — don't design the
   Decode empty state around it without rechecking before implementing that screen.
