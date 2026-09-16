import request from "supertest";
import { buildApp } from "../src/app";
import { bookABet, findBookABet } from "../src/betway/client";
import { UpstreamError } from "../src/betway/errors";
import type { DecodeSelection } from "../src/betway/types";

jest.mock("../src/betway/client");

const mockedBookABet = bookABet as jest.MockedFunction<typeof bookABet>;
const mockedFindBookABet = findBookABet as jest.MockedFunction<typeof findBookABet>;

function selection(overrides: Partial<DecodeSelection> = {}): DecodeSelection {
  return {
    outcomeId: "7469919811",
    marketId: "746991981",
    marketName: "1X2",
    outcomeName: "Chelsea FC (Nathan)",
    eventId: 74699198,
    eventName: "Chelsea FC (Nathan) vs. Tottenham Hotspur FC (Kai)",
    eventEpoch: 1789545600,
    priceDecimal: 2.26,
    priceNumerator: 63,
    priceDenominator: 50,
    isMarketActive: true,
    isEventActive: true,
    isOutcomeActive: true,
    market: { isSuspended: false },
    sportEvent: { isFinished: false },
    outcome: { isTradingActive: true },
    ...overrides,
  };
}

describe("POST /api/booking-codes", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test("creates a code and returns the decoded selections", async () => {
    mockedBookABet.mockResolvedValueOnce({ bookingCode: "BW72B383EE" });
    mockedFindBookABet.mockResolvedValueOnce({ kind: "ok", selections: [selection()] });

    const res = await request(app.server)
      .post("/api/booking-codes")
      .send({ outcomeIds: ["7469919811"] });

    expect(res.status).toBe(200);
    expect(res.body.bookingCode).toBe("BW72B383EE");
    expect(res.body.selections).toHaveLength(1);
  });

  // docs/betway-api.md §3: BookABet accepts a nonexistent outcome id and still returns a
  // well-formed code; decoding it comes back dead. The service must catch this itself.
  test("rejects a code that decodes to zero selections (dead outcome id)", async () => {
    mockedBookABet.mockResolvedValueOnce({ bookingCode: "BW6E59F360" });
    mockedFindBookABet.mockResolvedValueOnce({ kind: "dead" });

    const res = await request(app.server)
      .post("/api/booking-codes")
      .send({ outcomeIds: ["00000000000"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_code" });
  });

  // docs/betway-api.md §3: two outcomes from the same event (e.g. home + draw) round-trip
  // through decode cleanly with isActive: true on both legs — the service must reject this
  // before handing back a code that a real betslip would refuse.
  test("rejects conflicting selections from the same event", async () => {
    mockedBookABet.mockResolvedValueOnce({ bookingCode: "BW72B38ED2" });
    mockedFindBookABet.mockResolvedValueOnce({
      kind: "ok",
      selections: [
        selection({ outcomeId: "7469919811", outcomeName: "Chelsea FC (Nathan)" }),
        selection({ outcomeId: "7469919812", outcomeName: "Draw" }),
      ],
    });

    const res = await request(app.server)
      .post("/api/booking-codes")
      .send({ outcomeIds: ["7469919811", "7469919812"] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "conflicting_selections" });
  });

  test("rejects an empty outcomeIds array with a validation error", async () => {
    const res = await request(app.server).post("/api/booking-codes").send({ outcomeIds: [] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "validation_error" });
  });

  test("maps an upstream BookABet failure to 502 upstream_error", async () => {
    mockedBookABet.mockRejectedValueOnce(new UpstreamError("boom"));

    const res = await request(app.server)
      .post("/api/booking-codes")
      .send({ outcomeIds: ["7469919811"] });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "upstream_error" });
  });
});
