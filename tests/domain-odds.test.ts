import { calculateTotalOdds } from "../src/domain/odds";

describe("calculateTotalOdds", () => {
  test("multiplies the displayed 2dp odds together", () => {
    // docs/betway-api.md §3: legs 5.60 and 2.60 → 14.56, the product of the displayed
    // numbers (Betway's own badge showed 14.55 from an un-displayed higher-precision total,
    // which we deliberately don't reproduce).
    expect(calculateTotalOdds([5.6, 2.6])).toBe(14.56);
  });

  test("returns the single price for one leg", () => {
    expect(calculateTotalOdds([2.26])).toBe(2.26);
  });

  test("rounds to 2 decimal places", () => {
    expect(calculateTotalOdds([1.1, 1.1, 1.1])).toBe(1.33);
  });
});
