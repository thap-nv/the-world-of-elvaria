// Roman numerals for the ordinal of a sibling tribe (PS-27b): "Sao Bạc II" in the CLI today, the same numeral under
// the crest in the UI later, so both read it from here.

/** The letters a numeral is built from and their values, largest first, the subtractive pairs among them. */
const NUMERALS = {
  M: 1000,
  CM: 900,
  D: 500,
  CD: 400,
  C: 100,
  XC: 90,
  L: 50,
  XL: 40,
  X: 10,
  IX: 9,
  V: 5,
  IV: 4,
  I: 1,
} as const;

/** The Roman numeral of `n`, for a whole `n ≥ 1`; there is no cap, as a kingdom has no cap on its siblings. */
export function romanOf(n: number): string {
  let left = n;
  let text = '';
  for (const [letters, value] of Object.entries(NUMERALS)) {
    const times = Math.floor(left / value);
    text += letters.repeat(times);
    left -= times * value;
  }
  return text;
}
