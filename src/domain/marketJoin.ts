import type { UpcomingMarket, UpcomingOutcome, UpcomingPrice } from "../betway/types";

export interface JoinedMarket {
  market: UpcomingMarket;
  outcomes: Array<{ outcome: UpcomingOutcome; price?: UpcomingPrice }>;
}

// docs/betway-api.md §4.4/§6: a market with a line (Totals, Handicap) arrives as a squashed
// pair — a parent row with no line and no outcomes, and a child row that carries the
// qualified name. Outcomes point their `marketId` at the parent and `originalMarketId` at
// the child, so joining on `marketId` (the naive read of the flat/joined shape from §4.3)
// files them under the wrong, unnamed market. Join on `originalMarketId ?? marketId`
// instead, then drop the now-empty parent rows.
export function joinMarketsWithOutcomes(
  markets: UpcomingMarket[],
  outcomes: UpcomingOutcome[],
  prices: UpcomingPrice[],
): JoinedMarket[] {
  const priceByOutcomeId = new Map(prices.map((price) => [price.outcomeId, price]));

  const outcomesByMarketId = new Map<string, UpcomingOutcome[]>();
  for (const outcome of outcomes) {
    const key = outcome.originalMarketId ?? outcome.marketId;
    const existing = outcomesByMarketId.get(key);
    if (existing) {
      existing.push(outcome);
    } else {
      outcomesByMarketId.set(key, [outcome]);
    }
  }

  return markets
    .filter((market) => !market.isSquashedParent)
    .map((market) => ({
      market,
      outcomes: (outcomesByMarketId.get(market.marketId) ?? []).map((outcome) => ({
        outcome,
        price: priceByOutcomeId.get(outcome.outcomeId),
      })),
    }));
}
