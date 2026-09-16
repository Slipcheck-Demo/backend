import { isLegBettable } from "../src/domain/staleness";
import type { DecodeSelection } from "../src/betway/types";

function bettableSelection(overrides: Partial<DecodeSelection> = {}): DecodeSelection {
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

describe("isLegBettable", () => {
  test("is true when all six signals agree", () => {
    expect(isLegBettable(bettableSelection())).toBe(true);
  });

  test.each([
    ["isMarketActive", { isMarketActive: false }],
    ["isEventActive", { isEventActive: false }],
    ["isOutcomeActive", { isOutcomeActive: false }],
  ] as const)("is false when top-level %s is false", (_name, overrides) => {
    expect(isLegBettable(bettableSelection(overrides))).toBe(false);
  });

  test("is false when the market is suspended, even if isMarketActive is true", () => {
    // docs/betway-api.md §2: a suspended market still reports isMarketActive: true.
    expect(
      isLegBettable(bettableSelection({ market: { isSuspended: true } })),
    ).toBe(false);
  });

  test("is false when the event has finished", () => {
    expect(
      isLegBettable(bettableSelection({ sportEvent: { isFinished: true } })),
    ).toBe(false);
  });

  test("is false when the outcome isn't trading", () => {
    expect(
      isLegBettable(bettableSelection({ outcome: { isTradingActive: false } })),
    ).toBe(false);
  });
});
