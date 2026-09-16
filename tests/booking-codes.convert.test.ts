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
    outcomeId: "1",
    marketId: "1",
    marketName: "1X2",
    outcomeName: "Home",
    eventId: 1,
    eventName: "Home vs Away",
    eventEpoch: 0,
    priceDecimal: 2,
    priceNumerator: 1,
    priceDenominator: 1,
    isMarketActive: true,
    isEventActive: true,
    isOutcomeActive: true,
    market: { isSuspended: false },
    sportEvent: { isFinished: false },
    outcome: { isTradingActive: true },
    ...overrides,
  };
}

function deadSelection(overrides: Partial<DecodeSelection> = {}): DecodeSelection {
  return selection({ isEventActive: false, ...overrides });
}

describe("POST /api/booking-codes/convert", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  test("drops dead legs and re-encodes the remaining bettable ones", async () => {
    mockedFindBookABet.mockResolvedValueOnce({
      kind: "ok",
      selections: [
        selection({ outcomeId: "1", eventId: 1 }),
        deadSelection({ outcomeId: "2", eventId: 2 }),
      ],
    });
    mockedBookABet.mockResolvedValueOnce({ bookingCode: "BWNEWCODE1" });

    const res = await request(app.server)
      .post("/api/booking-codes/convert")
      .send({ bookingCode: "BWOLDCODE" });

    expect(res.status).toBe(200);
    expect(res.body.bookingCode).toBe("BWNEWCODE1");
    expect(res.body.selections).toHaveLength(1);
    expect(res.body.selections[0].outcomeId).toBe("1");
    expect(res.body.removedLegs).toHaveLength(1);
    expect(res.body.removedLegs[0].outcomeId).toBe("2");
    expect(mockedBookABet).toHaveBeenCalledWith(["1"]);
  });

  test("returns invalid_code when the input code is already dead, without calling bookABet", async () => {
    mockedFindBookABet.mockResolvedValueOnce({ kind: "dead" });

    const res = await request(app.server)
      .post("/api/booking-codes/convert")
      .send({ bookingCode: "BWDEADBEEF" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_code" });
    expect(mockedBookABet).not.toHaveBeenCalled();
  });

  test("returns invalid_code when every leg is dead, without calling bookABet", async () => {
    mockedFindBookABet.mockResolvedValueOnce({
      kind: "ok",
      selections: [deadSelection({ outcomeId: "1" }), deadSelection({ outcomeId: "2" })],
    });

    const res = await request(app.server)
      .post("/api/booking-codes/convert")
      .send({ bookingCode: "BWALLDEAD" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_code" });
    expect(mockedBookABet).not.toHaveBeenCalled();
  });

  test("rejects a missing bookingCode with a validation error", async () => {
    const res = await request(app.server).post("/api/booking-codes/convert").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "validation_error" });
  });

  test("maps an upstream failure to 502 upstream_error", async () => {
    mockedFindBookABet.mockRejectedValueOnce(new UpstreamError("boom"));

    const res = await request(app.server)
      .post("/api/booking-codes/convert")
      .send({ bookingCode: "BW00000000" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "upstream_error" });
  });
});
