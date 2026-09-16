---
name: api-test-supertest
description: Use when writing or generating Supertest/Jest tests for the backend/ Express or Fastify service (resolve/create/convert booking-code endpoints, sports/events proxy endpoints). Triggers on "write api tests", "add supertest tests", "test the resolve endpoint", "generate tests from the endpoint list".
---

> **Adapted from** [`naodeng/awesome-qa-skills`](https://github.com/naodeng/awesome-qa-skills)
> (`skills/en/testing-types/api-test-supertest`).
>
> ⚠️ **License note: PolyForm Noncommercial 1.0.0.** The source repository is licensed for
> non-commercial use only. Using it here is acceptable for this take-home assessment as a
> learning/reference basis. **If this project or its generated test suite is ever reused
> commercially, this skill (and any test code produced from `scripts/generate_supertest_tests.py`
> as bundled here) must be rewritten from scratch or replaced with an MIT-licensed
> alternative** — do not carry it forward into a commercial fork without addressing this.

# API testing for the booking-code backend (Supertest + Jest)

## Scope

Test `backend/` in-process (`request(app)`, not a live `baseUrl`) — the app is a thin proxy
over Betway's API plus a Postgres history table, so tests must **mock the outbound Betway
calls**, not hit the real betway.com.ng from CI. Endpoints in scope (see
`docs/betway-api.md` for the upstream contracts they wrap):

- `POST /api/booking-codes/resolve` (decode)
- `POST /api/booking-codes` (create/encode)
- `POST /api/booking-codes/convert`
- `GET /api/sports`, `GET /api/events`, `GET /api/events/:id/markets`

## Defaults

**Directory layout**
```
backend/
  tests/
    booking-codes.resolve.test.ts
    booking-codes.create.test.ts
    booking-codes.convert.test.ts
    sports.test.ts
  jest.config.cjs
```

**Entry mode**: in-process, `request(app)` where `app` is the exported Express/Fastify
instance from `backend/src/app.ts` — never a `BASE_URL` integration mode for this project,
since there's nothing to stand up separately in CI.

**Mocking Betway**: use `nock` (or `jest.mock` on the fetch wrapper module) to stub the
upstream calls documented in `docs/betway-api.md`:
- `FindBookABet` 200 (valid code), 400 `BookABetInvalidCode`, 400 `BookABetSelectionsExpired`
- `BookABet` 200 with a well-formed code, including the "dead outcome id" and "conflicting
  selections" cases from `docs/betway-api.md` §3 — these are the two edge cases the backend
  is specifically supposed to catch by decoding what it just created
- `Widget/BookingCodes` catalogue 200

**Naming**: `describe('POST /api/booking-codes/resolve', ...)`,
`test('returns 200 with parsed selections for a valid code', ...)`.

**Assertions**: Supertest `.expect(status)` + Jest `expect` on `res.body` shape. Minimum
per endpoint:
- happy path returns the expected shape and a 2xx
- upstream `BookABetInvalidCode` / `BookABetSelectionsExpired` map to the backend's own
  `invalid_code` error shape — never leak Betway's raw `errorCode` to the client
- create with a dead-id outcome or same-event conflicting outcomes is rejected before a
  code is handed back (`conflicting_selections`, per `docs/betway-api.md` §3)
- convert removes exactly the legs that fail the six staleness signals and keeps the rest

**Config**: `jest.config.cjs` (bundled in `scripts/templates/`), `package.json` script
`"test": "jest --runInBand"` — `runInBand` avoids flaky shared-mock races between test
files that stub the same outbound Betway calls differently.

## Never do this

- Never call the live betway.com.ng endpoints from the test suite — the whole point of
  mocking is that CI must not depend on Betway's uptime or return live, ever-changing odds.
- Never hardcode a real booking code expecting it to still decode later — codes expire
  (~24h, per `docs/betway-api.md` §2).
- Never assert on exact odds values from a mocked response as if they were meaningful
  business logic — assert on shape and on the backend's own derived fields (leg count,
  status), not on numbers that were just made up for the mock.

## Generating a first draft from the endpoint list

`scripts/generate_supertest_tests.py` turns a normalized JSON endpoint list into a
skeleton test file (status-code smoke tests only — always flesh out the mocked-response
assertions above by hand afterward, the generator does not know about Betway's error
shapes):

```bash
python3 .claude/skills/api-test-supertest/scripts/generate_supertest_tests.py \
  --input endpoints.json \
  --output-dir backend/tests
```

Where `endpoints.json` looks like:
```json
{ "endpoints": [
  { "method": "POST", "path": "/api/booking-codes/resolve" },
  { "method": "POST", "path": "/api/booking-codes" },
  { "method": "POST", "path": "/api/booking-codes/convert" }
] }
```

## What was left out of the source skill

- The generic multi-format input parsing (OpenAPI/Postman/Insomnia/Bruno/curl priority
  order) — we only ever have one source of truth, `docs/betway-api.md`, so that parsing
  hierarchy doesn't apply here.
- Auth/token handling guidance — every endpoint in scope is anonymous (per
  `docs/betway-api.md` §1), so there's no auth contract to test.
