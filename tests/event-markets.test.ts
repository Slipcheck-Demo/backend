import request from "supertest";
import { buildApp } from "../src/app";
import { getEventMarkets } from "../src/betway/client";

jest.mock("../src/betway/client");

const mockedGetEventMarkets = getEventMarkets as jest.MockedFunction<typeof getEventMarkets>;

describe("GET /api/events/:eventId/markets", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // docs/betway-api.md §4.4: real squashed-market shape — drop the parent, keep the child.
  test("drops squashed parents and returns joined markets", async () => {
    mockedGetEventMarkets.mockResolvedValueOnce({
      marketsInGroup: [
        {
          marketId: "18",
          eventId: 1,
          name: "[Total]",
          displayName: "Total Goals",
          marketTypeCName: "total",
          isActive: true,
          isSuspended: false,
          isSquashedParent: true,
          isSquashedMarket: false,
        },
        {
          marketId: "18total=5.5~",
          eventId: 1,
          name: "[Total]",
          displayName: "Total (5.5)",
          marketTypeCName: "total",
          isActive: true,
          isSuspended: false,
          isSquashedParent: false,
          isSquashedMarket: true,
        },
      ],
      outcomes: [
        {
          outcomeId: "18total=5.5~12",
          marketId: "18",
          originalMarketId: "18total=5.5~",
          eventId: 1,
          name: "Over ",
          displayName: "Over ",
          sbv: " (5.5)",
          index: 12,
          isTradingActive: true,
        },
      ],
      prices: [{ outcomeId: "18total=5.5~12", priceDecimal: 1.8, numerator: 4, denominator: 5 }],
    });

    const res = await request(app.server).get("/api/events/1/markets");

    expect(res.status).toBe(200);
    expect(res.body.markets).toHaveLength(1);
    expect(res.body.markets[0].displayName).toBe("Total (5.5)");
    expect(res.body.markets[0].outcomes[0].priceDecimal).toBe(1.8);
  });

  test("rejects a non-numeric eventId", async () => {
    const res = await request(app.server).get("/api/events/abc/markets");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "validation_error" });
  });
});
