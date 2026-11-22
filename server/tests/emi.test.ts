import { amortizationSchedule, aprPct, calculateEmi, exactEmi, maxPrincipalForEmi, processingFee } from '../src/domain/emi';

describe('EMI calculator', () => {
  it.each([
    // principal, rate, months, expected EMI (verified against standard bank EMI calculators)
    [500000, 12, 36, 16607.15],
    [100000, 10, 12, 8791.59],
    [1000000, 9, 120, 12667.58],
    [50000, 18, 6, 8776.26],
  ])('EMI for %d at %d%% over %d months = %d', (p, r, n, expected) => {
    expect(calculateEmi(p, r, n).emi).toBeCloseTo(expected, 2);
  });

  it('handles 0% interest as straight division', () => {
    const r = calculateEmi(120000, 0, 12);
    expect(r.emi).toBe(10000);
    expect(r.totalInterest).toBe(0);
    expect(r.totalRepayment).toBe(120000);
  });

  it('reconciles: total repayment = principal + total interest', () => {
    const r = calculateEmi(737000, 13.75, 47, 5000);
    expect(r.totalRepayment).toBeCloseTo(r.principal + r.totalInterest, 2);
    expect(r.totalCostOfCredit).toBeCloseTo(r.totalInterest + 5000, 2);
  });

  it('amortization schedule repays exactly the principal and closes at zero', () => {
    const rows = amortizationSchedule(333333, 11.25, 59);
    const principalPaid = rows.reduce((s, x) => s + Math.round(x.principal * 100), 0);
    expect(principalPaid).toBe(33333300);
    expect(rows.at(-1)!.balance).toBe(0);
    expect(rows).toHaveLength(59);
    // interest portion decreases over time on a reducing balance loan
    expect(rows[0].interest).toBeGreaterThan(rows[30].interest);
  });

  it('longer tenure => lower EMI but higher total interest', () => {
    const short = calculateEmi(500000, 12, 24);
    const long = calculateEmi(500000, 12, 60);
    expect(long.emi).toBeLessThan(short.emi);
    expect(long.totalInterest).toBeGreaterThan(short.totalInterest);
  });

  it('APR equals nominal rate without fees and exceeds it with fees', () => {
    expect(calculateEmi(500000, 12, 36).aprPct).toBeCloseTo(12, 1);
    expect(calculateEmi(500000, 12, 36, 10000).aprPct).toBeGreaterThan(13);
  });

  it('APR rejects a fee larger than the principal', () => {
    expect(() => aprPct(1000, 1000, [100])).toThrow(RangeError);
  });

  it('processing fee respects the minimum', () => {
    expect(processingFee(10000, 1, 199)).toBe(199);
    expect(processingFee(500000, 2, 1999)).toBe(10000);
  });

  it('maxPrincipalForEmi is the inverse of EMI', () => {
    const p = maxPrincipalForEmi(16607.15, 12, 36);
    expect(Math.abs(p - 500000)).toBeLessThan(2);
    expect(maxPrincipalForEmi(0, 12, 36)).toBe(0);
    expect(maxPrincipalForEmi(1000, 0, 12)).toBe(12000);
  });

  it.each([
    [0, 12, 12],
    [-5, 12, 12],
    [1000, -1, 12],
    [1000, 12, 0],
    [1000, 12, 1.5],
    [NaN, 12, 12],
  ])('rejects invalid input (%p, %p, %p)', (p, r, n) => {
    expect(() => exactEmi(p, r, n)).toThrow(RangeError);
  });
});
