// Shapes verified live against Betway's API on 2026-09-16 — see docs/betway-api.md.
// Only the fields this service actually reads are declared; upstream responses carry more.

export interface DecodeSelection {
  outcomeId: string;
  marketId: string;
  marketName: string;
  outcomeName: string;
  eventId: number;
  eventName: string;
  eventEpoch: number;
  priceDecimal: number;
  priceNumerator: number;
  priceDenominator: number;
  isMarketActive: boolean;
  isEventActive: boolean;
  isOutcomeActive: boolean;
  market: { isSuspended: boolean };
  sportEvent: { isFinished: boolean };
  outcome: { isTradingActive: boolean; sbv?: string };
  handicap?: number;
  marketHandicap?: number;
  league?: string;
  region?: string;
  sportId?: string;
}

// docs/betway-api.md §2 (Nuance #2): a "dead" booking code shows up as either a 200
// with an empty selections array, or a 400 BookABetInvalidCode/BookABetSelectionsExpired.
// The client folds all three into one case so callers never branch on which shape it was.
export type DecodeResult =
  | { kind: "ok"; selections: DecodeSelection[] }
  | { kind: "dead" };

export interface EncodeResult {
  bookingCode: string;
}

export interface Sport {
  sportId: string;
  name: string;
  sportType: "Sport" | "Promo";
}

export interface UpcomingEvent {
  eventId: number;
  name: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  region: string;
  expectedStartEpoch: number;
  isActive: boolean;
  isLive: boolean;
}

export interface UpcomingMarket {
  marketId: string;
  eventId: number;
  name: string;
  displayName: string;
  marketTypeCName: string;
  isActive: boolean;
  isSuspended: boolean;
  isSquashedParent: boolean;
  isSquashedMarket: boolean;
}

export interface UpcomingOutcome {
  outcomeId: string;
  marketId: string;
  originalMarketId: string;
  eventId: number;
  name: string;
  displayName: string;
  sbv: string;
  index: number;
  isTradingActive: boolean;
}

export interface UpcomingPrice {
  outcomeId: string;
  priceDecimal: number;
  numerator: number;
  denominator: number;
}

export interface UpcomingEventsResponse {
  events: UpcomingEvent[];
  markets: UpcomingMarket[];
  outcomes: UpcomingOutcome[];
  prices: UpcomingPrice[];
  isFinalPage: boolean;
}

// Same entity shapes as UpcomingEventsResponse, scoped to one event + market group
// (docs/betway-api.md §4.4).
export interface EventMarketsResponse {
  marketsInGroup: UpcomingMarket[];
  outcomes: UpcomingOutcome[];
  prices: UpcomingPrice[];
}
