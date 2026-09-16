// docs/betway-api.md §3: Betway's own betslip prints a total that can sit ~0.01 off the
// product of the leg odds shown right beside it, because it totals a full-precision live
// snapshot separately from the 2dp odds it displays per leg. We don't try to reproduce that
// number — we total the same 2dp odds we display, so our badge always equals the card.
export function calculateTotalOdds(priceDecimals: number[]): number {
  const total = priceDecimals.reduce((product, price) => product * price, 1);
  return Math.round(total * 100) / 100;
}
