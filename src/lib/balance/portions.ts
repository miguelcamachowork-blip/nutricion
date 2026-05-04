/** Portion utilities. All portions are stored as numbers in steps of 0.25. */


const FRACTION_GLYPH: Record<string, string> = {
  "0.125": "⅛",
  "0.25": "¼",
  "0.333": "⅓",
  "0.5": "½",
  "0.666": "⅔",
  "0.75": "¾",
};

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
  for (const [k, glyph] of Object.entries(FRACTION_GLYPH)) {
    if (Math.abs(frac - Number(k)) < 0.02) {
      fracStr = glyph;
      break;
    }
  }
  if (whole === 0) return sign + (fracStr || abs.toFixed(2).replace(/\.00$/, ""));
  if (!fracStr) return sign + String(whole) + (frac > 0 ? "." + String(Math.round(frac * 100)).padStart(2, "0") : "");
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
