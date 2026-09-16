import type { DecodeSelection } from "../betway/types";

// docs/betway-api.md §2: staleness has six signals, not three — a suspended market still
// reports isMarketActive: true at the top level, so the three nested flags matter just as
// much as the three top-level ones. A leg is bettable only when all six agree.
export function isLegBettable(selection: DecodeSelection): boolean {
  return (
    selection.isMarketActive &&
    selection.isEventActive &&
    selection.isOutcomeActive &&
    !selection.market.isSuspended &&
    !selection.sportEvent.isFinished &&
    selection.outcome.isTradingActive
  );
}
