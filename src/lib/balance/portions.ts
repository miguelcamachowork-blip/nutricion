/** Portion utilities. All portions are stored as numbers in steps of 0.25. */


const FRACTION_GLYPH: { value: number; glyph: string }[] = [
  { value: 1 / 8, glyph: "⅛" },
  { value: 1 / 7, glyph: "⅐" },
  { value: 1 / 6, glyph: "⅙" },
  { value: 1 / 5, glyph: "⅕" },
  { value: 1 / 4, glyph: "¼" },
  { value: 1 / 3, glyph: "⅓" },
  { value: 3 / 8, glyph: "⅜" },
  { value: 2 / 5, glyph: "⅖" },
  { value: 1 / 2, glyph: "½" },
  { value: 3 / 5, glyph: "⅗" },
  { value: 5 / 8, glyph: "⅝" },
  { value: 2 / 3, glyph: "⅔" },
  { value: 3 / 4, glyph: "¾" },
  { value: 4 / 5, glyph: "⅘" },
  { value: 5 / 6, glyph: "⅚" },
  { value: 7 / 8, glyph: "⅞" },
];

const FRAC_TOL = 1e-3;

/** Snap to nearest quarter. */
export function toQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

export function isQuarter(n: number): boolean {
  return Math.abs(n * 4 - Math.round(n * 4)) < 1e-9;
}

/** Pretty-print a portion using unicode fractions, e.g. 1.25 → "1¼". */
export function formatPortion(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1e-9) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  // Detect close to known fractions
  let fracStr = "";
  if (frac > 0) {
    for (const { value, glyph } of FRACTION_GLYPH) {
      if (Math.abs(frac - value) < FRAC_TOL) {
        fracStr = glyph;
        break;
      }
    }
  }
  if (whole === 0) {
    if (fracStr) return sign + fracStr;
    // Show up to 3 decimals, trimmed.
    return sign + abs.toFixed(3).replace(/\.?0+$/, "");
  }
  if (!fracStr) {
    // Show up to 3 decimals for the fractional part, trimmed.
    const fracPart = frac.toFixed(3).slice(1).replace(/\.?0+$/, "");
    return sign + String(whole) + fracPart;
  }
  return sign + String(whole) + fracStr;
}

/** Build the standard set of selectable portion options [0, 0.25, ..., max]. */
export function portionOptions(max = 6, step = 0.25): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(toQuarter(v));
  return out;
}

export function addPortion(a: number, b: number): number {
  return toQuarter(a + b);
}

export function subPortion(a: number, b: number): number {
  return toQuarter(a - b);
}
