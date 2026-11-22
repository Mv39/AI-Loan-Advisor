import type { AmortizationRow, EmiResult } from './types';

/**
 * EMI & cost calculations.
 *
 * All schedule maths is done in integer paise to avoid floating-point drift, so
 * totals reconcile exactly with the amortization schedule (sum of principal
 * components === principal). Rates are annual nominal %, reducing balance,
 * compounded monthly - the standard convention for Indian retail loans.
 */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function assertInputs(principal: number, annualRatePct: number, tenureMonths: number): void {
  if (!Number.isFinite(principal) || principal <= 0) throw new RangeError('principal must be > 0');
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0 || annualRatePct > 100) {
    throw new RangeError('annualRatePct must be between 0 and 100');
  }
  if (!Number.isInteger(tenureMonths) || tenureMonths < 1 || tenureMonths > 600) {
    throw new RangeError('tenureMonths must be an integer between 1 and 600');
  }
}

/** Exact (unrounded) EMI using P * r * (1+r)^n / ((1+r)^n - 1). */
export function exactEmi(principal: number, annualRatePct: number, tenureMonths: number): number {
  assertInputs(principal, annualRatePct, tenureMonths);
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / tenureMonths;
  const f = Math.pow(1 + r, tenureMonths);
  return (principal * r * f) / (f - 1);
}

export function amortizationSchedule(principal: number, annualRatePct: number, tenureMonths: number): AmortizationRow[] {
  const r = annualRatePct / 12 / 100;
  const emiPaise = Math.round(exactEmi(principal, annualRatePct, tenureMonths) * 100);
  let balancePaise = Math.round(principal * 100);
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= tenureMonths; month++) {
    const interestPaise = Math.round(balancePaise * r);
    const isLast = month === tenureMonths;
    // Last instalment absorbs rounding residue so the loan closes at exactly 0.
    const principalPaise = isLast ? balancePaise : Math.min(emiPaise - interestPaise, balancePaise);
    const paymentPaise = principalPaise + interestPaise;
    balancePaise -= principalPaise;
    rows.push({
      month,
      emi: paymentPaise / 100,
      principal: principalPaise / 100,
      interest: interestPaise / 100,
      balance: balancePaise / 100,
    });
  }
  return rows;
}

export function processingFee(principal: number, feePct: number, minFee: number): number {
  return round2(Math.max((principal * feePct) / 100, minFee));
}

/**
 * APR (annualised IRR) including upfront fees: solves
 *   (P - fee) = sum_{k=1..n} payment_k / (1+i)^k
 * via bisection (monotonic, always converges). Mirrors the APR disclosure that
 * RBI's Key Fact Statement (KFS) guidelines require for retail loans.
 */
export function aprPct(principal: number, fee: number, payments: number[]): number {
  const netDisbursed = principal - fee;
  if (netDisbursed <= 0) throw new RangeError('fee must be lower than principal');
  const pv = (i: number) => payments.reduce((acc, p, k) => acc + p / Math.pow(1 + i, k + 1), 0);
  let lo = 0;
  let hi = 1; // 100% per month upper bound
  if (pv(lo) <= netDisbursed) return 0;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > netDisbursed) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return round2(((lo + hi) / 2) * 12 * 100);
}

export function calculateEmi(principal: number, annualRatePct: number, tenureMonths: number, fee = 0): EmiResult {
  const schedule = amortizationSchedule(principal, annualRatePct, tenureMonths);
  const totalRepayment = round2(schedule.reduce((s, row) => s + row.emi, 0));
  const totalInterest = round2(schedule.reduce((s, row) => s + row.interest, 0));
  return {
    principal: round2(principal),
    annualRatePct,
    tenureMonths,
    emi: schedule[0].emi,
    totalInterest,
    totalRepayment,
    processingFee: round2(fee),
    totalCostOfCredit: round2(totalInterest + fee),
    aprPct: aprPct(
      principal,
      fee,
      schedule.map((r) => r.emi),
    ),
  };
}

/** Largest principal whose EMI fits within maxEmi at the given rate/tenure. */
export function maxPrincipalForEmi(maxEmi: number, annualRatePct: number, tenureMonths: number): number {
  if (maxEmi <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return Math.floor(maxEmi * tenureMonths);
  const f = Math.pow(1 + r, tenureMonths);
  return Math.floor((maxEmi * (f - 1)) / (r * f));
}
