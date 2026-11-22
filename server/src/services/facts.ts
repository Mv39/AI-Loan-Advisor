import crypto from 'node:crypto';
import { checkEligibility } from '../domain/eligibility';
import type { BorrowerProfile, Product, RecommendationResult } from '../domain/types';
import { formatINR, formatPct, formatTenure } from '../utils/format';

/**
 * Builds the grounding FACTS block: a compact, pre-formatted, PII-free view of
 * the deterministic engine output. The LLM only ever sees this (plus the
 * redacted user message), never names, ids or raw documents.
 */

export const PRODUCT_ALIASES: Record<string, RegExp> = {
  'PL-001': /\b(personal loan|flexi)\b/i,
  'SA-001': /\b(salary advance|advance salary|payday)\b/i,
  'BNPL-001': /\b(bnpl|buy now|pay later)\b/i,
  'SME-001': /\b(sme|business loan|msme)\b/i,
  'TOP-001': /\btop[- ]?up\b/i,
  'SEC-001': /\b(secured|against property|lap|gold loan|loan against|collateral)\b/i,
};

export function mentionedProducts(text: string): string[] {
  return Object.entries(PRODUCT_ALIASES)
    .filter(([, re]) => re.test(text))
    .map(([id]) => id);
}

export function profileFacts(p: BorrowerProfile) {
  return {
    requestedAmount: formatINR(p.requestedAmount),
    purpose: p.purpose.replaceAll('_', ' '),
    monthlyIncome: formatINR(p.monthlyIncome),
    existingEmi: formatINR(p.existingEmi),
    preferredTenure: formatTenure(p.preferredTenureMonths),
    employmentType: p.employmentType.replaceAll('_', ' '),
    riskProfile: p.riskProfile,
    hasExistingLoanWithUs: p.hasExistingLoanWithUs,
    hasCollateral: p.hasCollateral,
    ...(p.businessVintageYears !== undefined ? { businessVintageYears: p.businessVintageYears } : {}),
  };
}

export interface ComparisonRow {
  productId: string;
  product: string;
  status: string;
  annualRate?: string;
  loanAmount?: string;
  tenure?: string;
  emi?: string;
  totalInterest?: string;
  processingFee?: string;
  totalRepayment?: string;
  aprInclFees?: string;
  notes: string[];
}

export function compareProducts(ids: string[], profile: BorrowerProfile, products: readonly Product[]): ComparisonRow[] {
  return ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .map((product) => {
      const e = checkEligibility(product, profile);
      const base: ComparisonRow = {
        productId: product.id,
        product: product.name,
        status: e.status,
        notes: [...e.reasons, ...e.suggestions],
      };
      if (!e.emi) return base;
      return {
        ...base,
        annualRate: `${e.emi.annualRatePct}% p.a.`,
        loanAmount: formatINR(e.pricedAmount),
        tenure: formatTenure(e.pricedTenureMonths),
        emi: formatINR(e.emi.emi),
        totalInterest: formatINR(e.emi.totalInterest),
        processingFee: formatINR(e.emi.processingFee),
        totalRepayment: formatINR(e.emi.totalRepayment),
        aprInclFees: formatPct(e.emi.aprPct),
      };
    });
}

export function buildFacts(opts: {
  result: RecommendationResult;
  products: readonly Product[];
  mentioned: string[];
  comparison?: ComparisonRow[];
}) {
  const { result, products, mentioned, comparison } = opts;
  const facts = {
    currency: 'INR',
    borrowerProfile: profileFacts(result.profile),
    recommendations: result.recommendations.map((r) => ({
      rank: r.rank,
      product: r.productName,
      productId: r.productId,
      status: r.status,
      annualRate: `${r.annualRatePct}% p.a. (reducing balance)`,
      loanAmount: formatINR(r.emi.principal),
      tenure: formatTenure(r.emi.tenureMonths),
      emi: formatINR(r.emi.emi),
      totalInterest: formatINR(r.emi.totalInterest),
      processingFee: formatINR(r.emi.processingFee),
      totalRepayment: formatINR(r.emi.totalRepayment),
      totalCostOfCredit: formatINR(r.emi.totalCostOfCredit),
      aprInclFees: formatPct(r.emi.aprPct),
      whyThisFits: r.whyThisFits,
      watchOuts: r.watchOuts,
      tenureOptions: r.tenureOptions.map((o) => ({
        tenure: formatTenure(o.tenureMonths),
        emi: formatINR(o.emi),
        totalInterest: formatINR(o.totalInterest),
        totalRepayment: formatINR(o.totalRepayment),
        totalEmiToIncome: formatPct(o.foirAfterLoanPct),
        withinAffordabilityLimit: o.affordable,
      })),
    })),
    notEligible: result.notEligible.map((n) => ({ product: n.productName, reasons: n.reasons })),
    tenureTradeoff: result.tenureTradeoff,
    ...(mentioned.length
      ? {
          productDetails: mentioned
            .map((id) => products.find((p) => p.id === id))
            .filter((p): p is Product => Boolean(p))
            .map((p) => ({
              product: p.name,
              description: p.description,
              amountRange: `${formatINR(p.minAmount)} - ${formatINR(p.maxAmount)}`,
              tenureRange: `${p.minTenureMonths}-${p.maxTenureMonths} months`,
              rateRange: `${p.annualRateByRisk.low}% - ${p.annualRateByRisk.high}% p.a. depending on risk profile`,
              processingFee: `${p.processingFeePct}% (minimum ${formatINR(p.minProcessingFee)})`,
              features: p.features,
              caveats: p.caveats,
            })),
        }
      : {}),
    ...(comparison?.length ? { comparison } : {}),
    policy: {
      approval: 'All figures are indicative. Final approval depends on underwriting and verification.',
      affordability: 'Total EMIs (existing + new) must stay within each product limit of monthly income (FOIR).',
      glossary: {
        EMI: 'Equated Monthly Instalment - fixed monthly payment covering interest and principal',
        APR: 'Annual Percentage Rate - yearly cost including processing fee',
        FOIR: 'Fixed Obligation to Income Ratio - share of monthly income going to EMIs',
      },
    },
  };
  return facts;
}

export type Facts = ReturnType<typeof buildFacts>;

export const hashFacts = (facts: unknown): string => crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16);
