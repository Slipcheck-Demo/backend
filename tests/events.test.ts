import request from "supertest";
import { buildApp } from "../src/app";
import { getUpcomingEvents } from "../src/betway/client";

jest.mock("../src/betway/client");
jest.mock("../src/db/client", () => ({
  prisma: { bookingCodeRequest: { create: jest.fn().mockResolvedValue({}) } },
}));

const mockedGetUpcomingEvents = getUpcomingEvents as jest.MockedFunction<typeof getUpcomingEvents>;

describe("GET /api/events", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test("joins events with their inline 1X2 markets and outcomes", async () => {
    mockedGetUpcomingEvents.mockResolvedValueOnce({
      events: [
        {
          eventId: 1,
          name: "A vs B",
          homeTeam: "A",
          awayTeam: "B",
          league: "L",
          region: "R",
          expectedStartEpoch: 0,
          isActive: true,
          isLive: false,
        },
      ],
      markets: [
        {
          marketId: "10",
          eventId: 1,
          name: "[Win/Draw/Win]",
          displayName: "1X2",
          marketTypeCName: "win-draw-win",
          isActive: true,
          isSuspended: false,
          isSquashedParent: false,
          isSquashedMarket: false,
        },
      ],
      outcomes: [
        {
          outcomeId: "101",
          marketId: "10",
          originalMarketId: "10",
          eventId: 1,
          name: "A",
          displayName: "A",
          sbv: "",
          index: 2,
          isTradingActive: true,
        },
      ],
      prices: [{ outcomeId: "101", priceDecimal: 1.9, numerator: 9, denominator: 10 }],
      isFinalPage: true,
    });

    const res = await request(app.server).get("/api/events?sportId=soccer");

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].markets[0].outcomes[0].priceDecimal).toBe(1.9);
  });

  test("rejects a missing sportId with a validation error", async () => {
    const res = await request(app.server).get("/api/events");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "validation_error" });
  });
});
