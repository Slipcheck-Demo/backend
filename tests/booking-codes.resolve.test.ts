import request from "supertest";
import { buildApp } from "../src/app";
import { findBookABet } from "../src/betway/client";
import { UpstreamError } from "../src/betway/errors";
import type { DecodeSelection } from "../src/betway/types";

jest.mock("../src/betway/client");

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

describe("POST /api/booking-codes/resolve", () => {
  const app = buildApp();

  // Fastify boots lazily on first request; without an explicit ready() the request queues
  // internally and Supertest's request against app.server times out.
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test("returns 200 with parsed selections for a valid code", async () => {
    mockedFindBookABet.mockResolvedValueOnce({ kind: "ok", selections: [selection()] });

    const res = await request(app.server)
      .post("/api/booking-codes/resolve")
      .send({ bookingCode: "BW72B383EE" });

    expect(res.status).toBe(200);
    expect(res.body.selections).toHaveLength(1);
    expect(res.body.selections[0].outcomeName).toBe("Chelsea FC (Nathan)");
    expect(res.body.selections[0].isBettable).toBe(true);
    expect(res.body.totalOdds).toBe(2.26);
  });

  test("trims the trailing space Totals outcomes carry", async () => {
    mockedFindBookABet.mockResolvedValueOnce({
      kind: "ok",
      selections: [selection({ outcomeName: "Over " })],
    });

    const res = await request(app.server)
      .post("/api/booking-codes/resolve")
      .send({ bookingCode: "BW72B383EE" });

    expect(res.body.selections[0].outcomeName).toBe("Over");
  });

  test("maps a dead code to 404 invalid_code, never leaking Betway's raw error", async () => {
    mockedFindBookABet.mockResolvedValueOnce({ kind: "dead" });

    const res = await request(app.server)
      .post("/api/booking-codes/resolve")
      .send({ bookingCode: "BWDEADBEEF" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_code" });
  });

  test("rejects a missing bookingCode with a validation error", async () => {
    const res = await request(app.server).post("/api/booking-codes/resolve").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "validation_error" });
  });

  test("maps an upstream failure to 502 upstream_error", async () => {
    mockedFindBookABet.mockRejectedValueOnce(new UpstreamError("boom"));

    const res = await request(app.server)
      .post("/api/booking-codes/resolve")
      .send({ bookingCode: "BW00000000" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "upstream_error" });
  });
});
