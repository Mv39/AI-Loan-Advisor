import { catalog } from '../src/domain/catalog';
import { checkEligibility } from '../src/domain/eligibility';
import { baseProfile } from './helpers';

const product = (id: string) => catalog.byId(id)!;

describe('Eligibility rules', () => {
  it('salaried, low-risk borrower with existing loan is eligible for Top-up', () => {
    const r = checkEligibility(product('TOP-001'), baseProfile());
    expect(r.status).toBe('eligible');
    expect(r.emi?.annualRatePct).toBe(10.5);
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  it('Top-up requires an existing loan with us', () => {
    const r = checkEligibility(product('TOP-001'), baseProfile({ hasExistingLoanWithUs: false }));
    expect(r.status).toBe('ineligible');
    expect(r.reasons).toContain('Requires an active loan with us');
    expect(r.emi).toBeUndefined();
  });

  it('Secured loan requires collateral', () => {
    expect(checkEligibility(product('SEC-001'), baseProfile()).status).toBe('ineligible');
    expect(checkEligibility(product('SEC-001'), baseProfile({ hasCollateral: true })).status).toBe('eligible');
  });

  it('SME loan is not offered to salaried applicants and needs business vintage', () => {
    const r = checkEligibility(product('SME-001'), baseProfile({ purpose: 'business_expansion' }));
    expect(r.status).toBe('ineligible');
    const owner = baseProfile({
      employmentType: 'business_owner',
      purpose: 'business_expansion',
      businessVintageYears: 1,
      monthlyIncome: 150000,
    });
    expect(checkEligibility(product('SME-001'), owner).reasons).toContain('Requires at least 2 years of business vintage');
    expect(checkEligibility(product('SME-001'), { ...owner, businessVintageYears: 3 }).status).toBe('eligible');
  });

  it('applies the rate for the borrower risk band', () => {
    const pl = product('PL-001');
    expect(checkEligibility(pl, baseProfile({ riskProfile: 'medium' })).emi?.annualRatePct).toBe(14.5);
    expect(checkEligibility(pl, baseProfile({ riskProfile: 'high' })).emi?.annualRatePct).toBe(19);
  });

  it('clamps tenure to the product range and marks the result conditional', () => {
    const r = checkEligibility(product('PL-001'), baseProfile({ requestedAmount: 200000, preferredTenureMonths: 6 }));
    expect(r.status).toBe('conditional');
    expect(r.pricedTenureMonths).toBe(12);
  });

  it('caps the amount at the product/income limit and marks conditional', () => {
    const r = checkEligibility(product('PL-001'), baseProfile({ requestedAmount: 3000000, preferredTenureMonths: 60 }));
    expect(r.status).toBe('conditional');
    expect(r.pricedAmount).toBe(1500000);
  });

  it('suggests a longer tenure when the EMI breaches FOIR', () => {
    // 6 lakh over 12 months -> EMI ~53k; (12k + 53k)/95k = 68% > 50%
    const r = checkEligibility(product('PL-001'), baseProfile({ requestedAmount: 600000, preferredTenureMonths: 12 }));
    expect(r.status).toBe('conditional');
    expect(r.pricedTenureMonths).toBeGreaterThan(12);
    expect(r.foirAfterLoanPct).toBeLessThanOrEqual(50);
    expect(r.suggestions.join(' ')).toMatch(/Extending tenure/);
  });

  it('reduces the amount when no tenure is affordable', () => {
    const r = checkEligibility(
      product('PL-001'),
      baseProfile({ requestedAmount: 1500000, preferredTenureMonths: 60, monthlyIncome: 60000, existingEmi: 5000 }),
    );
    expect(r.status).toBe('conditional');
    expect(r.pricedAmount).toBeLessThan(1500000);
    expect(r.foirAfterLoanPct).toBeLessThanOrEqual(50);
  });

  it('is ineligible when existing EMIs leave no headroom', () => {
    const r = checkEligibility(product('PL-001'), baseProfile({ monthlyIncome: 40000, existingEmi: 20000 }));
    expect(r.status).toBe('ineligible');
    expect(r.reasons.join(' ')).toMatch(/Existing obligations/);
  });

  it('rejects amounts below the product minimum', () => {
    const r = checkEligibility(product('PL-001'), baseProfile({ requestedAmount: 20000 }));
    expect(r.status).toBe('ineligible');
    expect(r.reasons.join(' ')).toMatch(/Minimum loan amount/);
  });

  it('only allows Salary Advance for salaried borrowers and caps it at 50% of salary', () => {
    const p = baseProfile({ purpose: 'emergency', requestedAmount: 80000, preferredTenureMonths: 3 });
    const r = checkEligibility(product('SA-001'), p);
    expect(r.status).toBe('conditional');
    expect(r.pricedAmount).toBe(47500);
    expect(checkEligibility(product('SA-001'), { ...p, employmentType: 'gig_worker' }).status).toBe('ineligible');
  });
});
