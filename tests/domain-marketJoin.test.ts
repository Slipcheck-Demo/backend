import { joinMarketsWithOutcomes } from "../src/domain/marketJoin";
import type { UpcomingMarket, UpcomingOutcome, UpcomingPrice } from "../src/betway/types";

function market(overrides: Partial<UpcomingMarket>): UpcomingMarket {
  return {
    marketId: "1",
    eventId: 1,
    name: "[Win/Draw/Win]",
    displayName: "1X2",
    marketTypeCName: "win-draw-win",
    isActive: true,
    isSuspended: false,
    isSquashedParent: false,
    isSquashedMarket: false,
    ...overrides,
  };
}

function outcome(overrides: Partial<UpcomingOutcome>): UpcomingOutcome {
  return {
    outcomeId: "11",
    marketId: "1",
    originalMarketId: "1",
    eventId: 1,
    name: "Home",
    displayName: "Home",
    sbv: "",
    index: 2,
    isTradingActive: true,
    ...overrides,
  };
}

describe("joinMarketsWithOutcomes", () => {
  test("joins a plain (non-squashed) market to its outcomes and prices", () => {
    const markets = [market({ marketId: "746991981" })];
    const outcomes = [
      outcome({ outcomeId: "7469919811", marketId: "746991981", originalMarketId: "746991981" }),
    ];
    const prices: UpcomingPrice[] = [
      { outcomeId: "7469919811", priceDecimal: 2.26, numerator: 63, denominator: 50 },
    ];

    const result = joinMarketsWithOutcomes(markets, outcomes, prices);

    expect(result).toHaveLength(1);
    expect(result[0].market.marketId).toBe("746991981");
    expect(result[0].outcomes).toHaveLength(1);
    expect(result[0].outcomes[0].outcome.outcomeId).toBe("7469919811");
    expect(result[0].outcomes[0].price?.priceDecimal).toBe(2.26);
  });

  // docs/betway-api.md §4.4/§6: real squashed-market shape verified on event 74699198 —
  // parent "Total Goals" (isSquashedParent), child "Total (5.5)" (isSquashedMarket), and the
  // outcome's originalMarketId points at the child while marketId points at the parent.
  test("drops the squashed parent and joins outcomes under the qualified child market", () => {
    const markets = [
      market({
        marketId: "7469919818",
        displayName: "Total Goals",
        isSquashedParent: true,
      }),
      market({
        marketId: "7469919818total=5.5~",
        displayName: "Total (5.5)",
        isSquashedMarket: true,
      }),
    ];
    const outcomes = [
      outcome({
        outcomeId: "7469919818total=5.5~12",
        marketId: "7469919818",
        originalMarketId: "7469919818total=5.5~",
        name: "Over ",
        sbv: " (5.5)",
      }),
      outcome({
        outcomeId: "7469919818total=5.5~13",
        marketId: "7469919818",
        originalMarketId: "7469919818total=5.5~",
        name: "Under ",
        sbv: " (5.5)",
      }),
    ];

    const result = joinMarketsWithOutcomes(markets, outcomes, []);

    expect(result).toHaveLength(1);
    expect(result[0].market.displayName).toBe("Total (5.5)");
    expect(result[0].outcomes).toHaveLength(2);
    expect(result[0].outcomes.map((o) => o.outcome.name)).toEqual(["Over ", "Under "]);
  });
});
