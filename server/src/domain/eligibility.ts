import { calculateEmi, maxPrincipalForEmi, processingFee, round2 } from './emi';
import type { BorrowerProfile, EligibilityCheck, EligibilityResult, Product } from './types';
import { formatINR, formatPct } from '../utils/format';

/**
 * Rule-based eligibility engine. Deterministic and explainable: every decision
 * is backed by a named check so the UI, the audit log and the LLM all see the
 * same reasons. The LLM never decides eligibility.
 */

export const STANDARD_TENURES = [1, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60, 84, 120, 180];

export const rateFor = (product: Product, profile: BorrowerProfile): number => product.annualRateByRisk[profile.riskProfile];

export const feeFor = (product: Product, amount: number): number =>
  processingFee(amount, product.processingFeePct, product.minProcessingFee);

/** Maximum EMI the borrower can take on for this product under its FOIR cap. */
export const maxNewEmi = (product: Product, profile: BorrowerProfile): number =>
  Math.max(0, profile.monthlyIncome * product.maxFoir - profile.existingEmi);

export const foirPct = (profile: BorrowerProfile, newEmi: number): number =>
  profile.monthlyIncome > 0 ? round2(((profile.existingEmi + newEmi) / profile.monthlyIncome) * 100) : Infinity;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function amountCap(product: Product, profile: BorrowerProfile): number {
  const incomeCap = product.maxIncomeMultiple ? Math.floor(profile.monthlyIncome * product.maxIncomeMultiple) : Number.POSITIVE_INFINITY;
  return Math.min(product.maxAmount, incomeCap);
}

export function checkEligibility(product: Product, profile: BorrowerProfile): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const hardReasons: string[] = [];
  const reasons: string[] = []; // adjustable (soft) reasons
  const suggestions: string[] = [];
  let hardFail = false;
  let conditional = false;

  const hard = (rule: string, passed: boolean, detail: string) => {
    checks.push({ rule, passed, detail });
    if (!passed) {
      hardFail = true;
      hardReasons.push(detail);
    }
  };

  // ---- Hard rules (cannot be fixed by changing amount/tenure) ----
  hard(
    'employment_type',
    product.eligibleEmployment.includes(profile.employmentType),
    product.eligibleEmployment.includes(profile.employmentType)
      ? `Available for ${profile.employmentType.replaceAll('_', ' ')} applicants`
      : `Not offered to ${profile.employmentType.replaceAll('_', ' ')} applicants`,
  );
  hard(
    'min_income',
    profile.monthlyIncome >= product.minMonthlyIncome,
    profile.monthlyIncome >= product.minMonthlyIncome
      ? `Income meets minimum of ${formatINR(product.minMonthlyIncome)}/month`
      : `Requires minimum monthly income of ${formatINR(product.minMonthlyIncome)}`,
  );
  hard(
    'risk_band',
    product.allowedRisk.includes(profile.riskProfile),
    product.allowedRisk.includes(profile.riskProfile)
      ? `Available for ${profile.riskProfile} risk profile`
      : `Not available for ${profile.riskProfile} risk profile`,
  );
  const purposeOk = product.purposes === 'any' || product.purposes.includes(profile.purpose);
  hard(
    'purpose',
    purposeOk,
    purposeOk ? `Suitable for ${profile.purpose.replaceAll('_', ' ')}` : `Not designed for ${profile.purpose.replaceAll('_', ' ')}`,
  );
  if (product.requiresExistingLoan) {
    hard(
      'existing_relationship',
      profile.hasExistingLoanWithUs,
      profile.hasExistingLoanWithUs ? 'Existing loan with us found' : 'Requires an active loan with us',
    );
  }
  if (product.requiresCollateral) {
    hard('collateral', profile.hasCollateral, profile.hasCollateral ? 'Collateral declared' : 'Requires collateral (property, FD or gold)');
  }
  if (product.minBusinessVintageYears !== undefined) {
    const v = profile.businessVintageYears ?? 0;
    hard(
      'business_vintage',
      v >= product.minBusinessVintageYears,
      v >= product.minBusinessVintageYears
        ? `Business vintage of ${v} years meets requirement`
        : `Requires at least ${product.minBusinessVintageYears} years of business vintage`,
    );
  }
  hard(
    'min_amount',
    profile.requestedAmount >= product.minAmount,
    profile.requestedAmount >= product.minAmount
      ? `Amount above product minimum of ${formatINR(product.minAmount)}`
      : `Minimum loan amount is ${formatINR(product.minAmount)}`,
  );

  // ---- Adjustable rules (amount cap, tenure bounds, affordability) ----
  const rate = rateFor(product, profile);
  const cap = amountCap(product, profile);
  let amount = profile.requestedAmount;
  if (amount > cap) {
    conditional = true;
    amount = cap;
    const msg = `Maximum available under this product for your profile is ${formatINR(cap)}`;
    checks.push({ rule: 'max_amount', passed: false, detail: msg });
    reasons.push(msg);
    suggestions.push(`Consider borrowing ${formatINR(cap)} or combining with savings`);
  } else {
    checks.push({ rule: 'max_amount', passed: true, detail: `Within maximum of ${formatINR(cap)}` });
  }

  let tenure = clamp(profile.preferredTenureMonths, product.minTenureMonths, product.maxTenureMonths);
  if (tenure !== profile.preferredTenureMonths) {
    conditional = true;
    const msg = `Tenure must be ${product.minTenureMonths}-${product.maxTenureMonths} months; priced at ${tenure} months`;
    checks.push({ rule: 'tenure_range', passed: false, detail: msg });
    reasons.push(msg);
  } else {
    checks.push({
      rule: 'tenure_range',
      passed: true,
      detail: `Tenure within ${product.minTenureMonths}-${product.maxTenureMonths} months`,
    });
  }

  const maxEmi = maxNewEmi(product, profile);
  const maxAffordableAmount = Math.min(cap, maxPrincipalForEmi(maxEmi, rate, product.maxTenureMonths));
  let emi = hardFail ? undefined : calculateEmi(amount, rate, tenure, feeFor(product, amount));
  let foirAfter = emi ? foirPct(profile, emi.emi) : foirPct(profile, 0);

  if (!hardFail && emi && foirAfter > product.maxFoir * 100) {
    conditional = true;
    // 1) Try the shortest longer tenure that brings FOIR within limits.
    const longer = STANDARD_TENURES.filter((t) => t > tenure && t <= product.maxTenureMonths)
      .concat(product.maxTenureMonths > tenure ? [product.maxTenureMonths] : [])
      .sort((a, b) => a - b)
      .find((t) => calculateEmi(amount, rate, t).emi <= maxEmi);

    if (longer) {
      const msg = `EMI at ${tenure} months would take total obligations to ${formatPct(foirAfter)} of income (limit ${formatPct(product.maxFoir * 100)})`;
      reasons.push(msg);
      suggestions.push(`Extending tenure to ${longer} months keeps EMIs within the affordability limit`);
      checks.push({ rule: 'affordability_foir', passed: false, detail: msg });
      tenure = longer;
      emi = calculateEmi(amount, rate, tenure, feeFor(product, amount));
    } else if (maxAffordableAmount >= product.minAmount) {
      // 2) Reduce amount to what is affordable at max tenure.
      const msg = `Requested amount is not affordable under the ${formatPct(product.maxFoir * 100)} obligation-to-income limit`;
      reasons.push(msg);
      suggestions.push(`You could afford up to about ${formatINR(maxAffordableAmount)} over ${product.maxTenureMonths} months`);
      checks.push({ rule: 'affordability_foir', passed: false, detail: msg });
      amount = maxAffordableAmount;
      tenure = product.maxTenureMonths;
      emi = calculateEmi(amount, rate, tenure, feeFor(product, amount));
    } else {
      hardFail = true;
      const msg = `Existing obligations leave too little room for a new EMI (limit ${formatPct(product.maxFoir * 100)} of income)`;
      hardReasons.push(msg);
      checks.push({ rule: 'affordability_foir', passed: false, detail: msg });
      suggestions.push('Reducing existing EMIs or adding a co-applicant could improve eligibility');
      emi = undefined;
    }
    foirAfter = emi ? foirPct(profile, emi.emi) : foirPct(profile, 0);
  } else if (!hardFail && emi) {
    checks.push({
      rule: 'affordability_foir',
      passed: true,
      detail: `Total EMIs would be ${formatPct(foirAfter)} of income (limit ${formatPct(product.maxFoir * 100)})`,
    });
  }

  return {
    productId: product.id,
    productName: product.name,
    status: hardFail ? 'ineligible' : conditional ? 'conditional' : 'eligible',
    checks,
    // Ineligible: only the blocking reasons; otherwise the adjustments we made.
    reasons: hardFail ? hardReasons : reasons,
    suggestions,
    pricedAmount: amount,
    pricedTenureMonths: tenure,
    maxAffordableAmount: Math.max(0, maxAffordableAmount),
    foirAfterLoanPct: foirAfter,
    emi,
  };
}
