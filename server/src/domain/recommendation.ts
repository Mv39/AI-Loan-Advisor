import { calculateEmi, round2 } from './emi';
import { checkEligibility, foirPct, rateFor, STANDARD_TENURES } from './eligibility';
import type { BorrowerProfile, EligibilityResult, Product, Recommendation, RecommendationResult, TenureOption } from './types';
import { formatINR, formatTenure } from '../utils/format';

/**
 * Recommendation engine: eligibility -> scoring -> ranking -> tenure comparison.
 * Scoring weights are explicit and documented so recommendations are explainable.
 */
export const SCORE_WEIGHTS = {
  eligible: 40,
  conditional: 20,
  cost: 25, // lower APR is better (relative to other candidates)
  purposeSpecific: 15,
  purposeGeneric: 8,
  affordabilityHeadroom: 10,
  exactMatch: 10, // priced at exactly the requested amount & tenure
} as const;

export const MAX_RECOMMENDATIONS = 3;

export function tenureOptions(product: Product, profile: BorrowerProfile, amount: number, around: number): TenureOption[] {
  const rate = rateFor(product, profile);
  const candidates = Array.from(
    new Set(
      [...STANDARD_TENURES, around, product.minTenureMonths, product.maxTenureMonths].filter(
        (t) => t >= product.minTenureMonths && t <= product.maxTenureMonths,
      ),
    ),
  ).sort((a, b) => a - b);
  const idx = candidates.indexOf(around);
  const picked = candidates.slice(Math.max(0, idx - 2), idx + 3);
  return picked.map((t) => {
    const r = calculateEmi(amount, rate, t);
    const foir = foirPct(profile, r.emi);
    return {
      tenureMonths: t,
      emi: r.emi,
      totalInterest: r.totalInterest,
      totalRepayment: r.totalRepayment,
      foirAfterLoanPct: foir,
      affordable: foir <= product.maxFoir * 100,
    };
  });
}

function whyThisFits(product: Product, profile: BorrowerProfile, e: EligibilityResult): string[] {
  const out: string[] = [];
  if (product.purposes !== 'any') out.push(`Designed for ${profile.purpose.replaceAll('_', ' ')} needs`);
  if (e.emi) {
    out.push(`Estimated EMI ${formatINR(e.emi.emi)} for ${formatTenure(e.pricedTenureMonths)} at ${e.emi.annualRatePct}% p.a.`);
    out.push(`Total EMIs would be ${e.foirAfterLoanPct}% of your monthly income`);
  }
  out.push(...product.features.slice(0, 2));
  return out;
}

export function scoreCandidates(
  profile: BorrowerProfile,
  candidates: { product: Product; elig: EligibilityResult }[],
): (Recommendation & { _elig: EligibilityResult })[] {
  const aprs = candidates.map((c) => c.elig.emi!.aprPct);
  const minApr = Math.min(...aprs);
  const maxApr = Math.max(...aprs);

  return candidates.map(({ product, elig }) => {
    const emi = elig.emi!;
    let score = elig.status === 'eligible' ? SCORE_WEIGHTS.eligible : SCORE_WEIGHTS.conditional;
    score += maxApr === minApr ? SCORE_WEIGHTS.cost : SCORE_WEIGHTS.cost * (1 - (emi.aprPct - minApr) / (maxApr - minApr));
    score += product.purposes === 'any' ? SCORE_WEIGHTS.purposeGeneric : SCORE_WEIGHTS.purposeSpecific;
    const headroom = Math.max(0, (product.maxFoir * 100 - elig.foirAfterLoanPct) / (product.maxFoir * 100));
    score += SCORE_WEIGHTS.affordabilityHeadroom * headroom;
    if (elig.pricedAmount === profile.requestedAmount && elig.pricedTenureMonths === profile.preferredTenureMonths) {
      score += SCORE_WEIGHTS.exactMatch;
    }

    return {
      rank: 0,
      productId: product.id,
      productName: product.name,
      productType: product.type,
      status: elig.status,
      score: round2(score),
      annualRatePct: emi.annualRatePct,
      emi,
      tenureOptions: tenureOptions(product, profile, elig.pricedAmount, elig.pricedTenureMonths),
      whyThisFits: whyThisFits(product, profile, elig),
      watchOuts: [...elig.reasons, ...elig.suggestions, ...product.caveats],
      _elig: elig,
    };
  });
}

export function tenureTradeoffNotes(rec: Recommendation | undefined): string[] {
  if (!rec || rec.tenureOptions.length < 2) return [];
  const opts = rec.tenureOptions;
  const shortest = opts[0];
  const longest = opts[opts.length - 1];
  const extraInterest = round2(longest.totalInterest - shortest.totalInterest);
  const emiDrop = round2(shortest.emi - longest.emi);
  return [
    `Shorter tenure of ${formatTenure(shortest.tenureMonths)}: higher EMI of ${formatINR(shortest.emi)} but the lowest total interest of ${formatINR(shortest.totalInterest)}.`,
    `Longer tenure of ${formatTenure(longest.tenureMonths)}: EMI falls by ${formatINR(emiDrop)} to ${formatINR(longest.emi)}, but you pay ${formatINR(extraInterest)} more in interest overall.`,
    'Pick the shortest tenure whose EMI still leaves comfortable room in your monthly budget; part-prepayment can shorten a longer loan later where allowed.',
  ];
}

export function recommend(profile: BorrowerProfile, products: readonly Product[]): RecommendationResult {
  const results = products.map((product) => ({ product, elig: checkEligibility(product, profile) }));
  const viable = results.filter((r) => r.elig.status !== 'ineligible' && r.elig.emi);

  const ranked = scoreCandidates(profile, viable)
    .sort((a, b) => b.score - a.score || a.emi.aprPct - b.emi.aprPct)
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ _elig, ...rec }, i) => ({ ...rec, rank: i + 1 }));

  return {
    profile,
    recommendations: ranked,
    notEligible: results
      .filter((r) => r.elig.status === 'ineligible')
      .map((r) => ({ productId: r.product.id, productName: r.product.name, reasons: r.elig.reasons })),
    tenureTradeoff: tenureTradeoffNotes(ranked[0]),
    generatedAt: new Date().toISOString(),
  };
}
