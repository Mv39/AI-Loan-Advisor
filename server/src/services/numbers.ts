/**
 * Number extraction used by the grounding verifier and the slot extractor.
 * Understands Indian formats: ₹1,23,456.78, Rs 5 lakh, 1.5 crore, 50k, 12.5%,
 * 36 months, 3 years, and Hindi units (लाख, करोड़, महीने, साल).
 */

export type NumberKind = 'amount' | 'percent' | 'months' | 'years' | 'plain';

export interface ExtractedNumber {
  value: number;
  kind: NumberKind;
  raw: string;
  /** True when the figure was written with a rounding unit (lakh/crore/k) - verify with wider tolerance. */
  approximate: boolean;
}

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  hazaar: 1_000,
  हज़ार: 1_000,
  हजार: 1_000,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  लाख: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
  करोड़: 10_000_000,
  करोड: 10_000_000,
};

// One token: optional currency, a number (with Indian/Western commas), optional unit/suffix.
const TOKEN_RE =
  /(₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%|percent|lakhs?|lacs?|l\b|crores?|cr\b|k\b|thousand|hazaar|हज़ार|हजार|लाख|करोड़|करोड|months?|mos?\b|महीने|महीना|माह|years?|yrs?\b|साल|वर्ष)?/giu;

export function extractNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const [raw, currency, numStr, unitRaw] = m;
    const base = parseFloat(numStr.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const unit = unitRaw?.toLowerCase();
    let kind: NumberKind = currency ? 'amount' : 'plain';
    let value = base;
    let approximate = false;

    if (unit) {
      if (unit === '%' || unit === 'percent') kind = 'percent';
      else if (/^(months?|mos?|महीने|महीना|माह)$/u.test(unit)) kind = 'months';
      else if (/^(years?|yrs?|साल|वर्ष)$/u.test(unit)) kind = 'years';
      else if (UNIT_MULTIPLIER[unit] !== undefined) {
        value = base * UNIT_MULTIPLIER[unit];
        kind = 'amount';
        approximate = true;
      }
    }
    out.push({ value, kind, raw: raw.trim(), approximate });
  }
  return out;
}

export type AllowedNumbers = Record<NumberKind, Set<number>>;

/**
 * Collect the numbers present in the facts, bucketed by kind, so a percentage in
 * the answer can only be justified by a percentage in the facts (not by, say,
 * "84 months" -> 7 years matching a hallucinated "6.99%").
 */
export function collectAllowedNumbers(...sources: unknown[]): AllowedNumbers {
  const acc: AllowedNumbers = { amount: new Set(), percent: new Set(), months: new Set(), years: new Set(), plain: new Set() };
  const add = (n: ExtractedNumber) => {
    acc[n.kind].add(n.value);
    acc.plain.add(n.value);
  };
  const visit = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) acc.plain.add(v);
    else if (typeof v === 'string') extractNumbers(v).forEach(add);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  sources.forEach(visit);
  // Legitimate unit conversions between tenures.
  for (const m of Array.from(acc.months)) if (m % 12 === 0) acc.years.add(m / 12);
  for (const y of Array.from(acc.years)) acc.months.add(Math.round(y * 12));
  return acc;
}
