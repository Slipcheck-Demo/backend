import type { DecodeSelection } from "../betway/types";
import { isLegBettable } from "./staleness";

export interface NormalizedSelection {
  outcomeId: string;
  marketId: string;
  marketName: string;
  outcomeName: string;
  eventId: number;
  eventName: string;
  eventEpoch: number;
  priceDecimal: number;
  isBettable: boolean;
}

// Shared by resolve and create: trims outcomeName (docs/betway-api.md §2 — Totals carry a
// trailing space, e.g. "Over ") and attaches the six-signal bettability flag.
export function normalizeSelection(selection: DecodeSelection): NormalizedSelection {
  return {
    outcomeId: selection.outcomeId,
    marketId: selection.marketId,
    marketName: selection.marketName,
    outcomeName: selection.outcomeName.trim(),
    eventId: selection.eventId,
    eventName: selection.eventName,
    eventEpoch: selection.eventEpoch,
    priceDecimal: selection.priceDecimal,
    isBettable: isLegBettable(selection),
  };
}
