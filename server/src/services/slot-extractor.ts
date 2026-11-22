import type { BorrowerProfile, EmploymentType, LoanPurpose, RiskProfile } from '../domain/types';
import { extractNumbers } from './numbers';

/**
 * Deterministic extraction of profile fields from free text, e.g.
 *   "I need 3 lakh for my sister's wedding over 2 years, I earn 60k a month"
 * We deliberately do NOT let the LLM write to the profile: extraction is
 * rule-based, validated, and echoed back to the user for transparency.
 */

const PURPOSE_KEYWORDS: [LoanPurpose, RegExp][] = [
  ['medical', /\b(medical|hospital|surgery|treatment|health)\b/i],
  ['education', /\b(education|college|course|tuition|fees|studies|mba)\b/i],
  ['wedding', /\b(wedding|marriage|shaadi)\b/i],
  ['travel', /\b(travel|trip|vacation|holiday)\b/i],
  ['home_renovation', /\b(renovat\w*|home repair|interior|remodel\w*)\b/i],
  ['debt_consolidation', /\b(consolidat\w*|credit card (bill|debt|dues)|pay off|repay other)\b/i],
  ['business_expansion', /\b(expand\w*|expansion|new (shop|outlet|branch|machine\w*)|equipment)\b/i],
  ['working_capital', /\b(working capital|inventory|stock for (my )?(shop|business)|cash ?flow)\b/i],
  ['consumer_purchase', /\b(phone|laptop|tv|television|fridge|appliance|gadget|furniture|purchase|buy(ing)? a)\b/i],
  ['vehicle', /\b(car|bike|scooter|vehicle|two[- ]wheeler)\b/i],
  ['emergency', /\b(emergency|urgent)\b/i],
];

const EMPLOYMENT_KEYWORDS: [EmploymentType, RegExp][] = [
  ['business_owner', /\b(business owner|own (a|my) (business|shop|company)|run (a|my) (business|shop))\b/i],
  ['self_employed', /\b(self[- ]employed|freelance professional|consultant|doctor in private practice)\b/i],
  ['gig_worker', /\b(gig|freelanc\w*|delivery partner|driver for (uber|ola|swiggy|zomato))\b/i],
  ['student', /\b(i am a student|i'm a student|studying)\b/i],
  ['salaried', /\b(salaried|salary|employed at|work (at|for) (a |an )?(company|firm|mnc))\b/i],
];

const RISK_KEYWORDS: [RiskProfile, RegExp][] = [
  ['low', /\b(low risk|conservative|excellent credit|credit score (of )?(7[5-9]\d|8\d\d))\b/i],
  ['medium', /\b(medium risk|moderate risk|average credit|credit score (of )?(6[5-9]\d|7[0-4]\d))\b/i],
  ['high', /\b(high risk|poor credit|bad credit|low credit score|credit score (of )?([3-5]\d\d|6[0-4]\d))\b/i],
];

export type ProfileUpdate = Partial<
  Pick<
    BorrowerProfile,
    | 'requestedAmount'
    | 'purpose'
    | 'monthlyIncome'
    | 'existingEmi'
    | 'preferredTenureMonths'
    | 'employmentType'
    | 'riskProfile'
    | 'hasCollateral'
  >
>;

const INCOME_RE = /\b(earn\w*|income|salary|take[- ]home|make|making)\b/i;
const EMI_RE = /\b(emi|emis|instal+ments?|already pay(ing)?)\b/i;
const ANNUAL_RE = /\b(per annum|p\.?a\.?|annual(ly)?|a year|per year|yearly|lpa|ctc)\b/i;
const LOAN_RE = /\b(need|want|borrow|loan( of| for)?|require|looking for|apply for|amount)\b/i;

export function extractProfileUpdates(message: string): ProfileUpdate {
  const update: ProfileUpdate = {};

  // Clause-level classification keeps "need 3 lakh ... earn 60k" from colliding.
  // Split on punctuation that is NOT inside a number (keeps "2,00,000" and "1.5" intact).
  const clauses = message
    .split(/[;!?]|,(?!\d)|\.(?!\d)|\band\b|\bbut\b|\bwhile\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    // "12 LPA" = 12 lakh per annum.
    const lpa = clause.match(/(\d+(?:\.\d+)?)\s*lpa\b/i);
    if (lpa) {
      update.monthlyIncome = Math.round((parseFloat(lpa[1]) * 100_000) / 12);
      continue;
    }
    const nums = extractNumbers(clause);
    const amounts = nums.filter((n) => n.kind === 'amount' || (n.kind === 'plain' && n.value >= 1000));
    const tenures = nums.filter((n) => n.kind === 'months' || n.kind === 'years');

    if (tenures.length && /\b(over|for|tenure|in|within|repay)\b|months?|years?/i.test(clause)) {
      const t = tenures[0];
      const months = t.kind === 'years' ? Math.round(t.value * 12) : Math.round(t.value);
      if (months >= 1 && months <= 360) update.preferredTenureMonths = months;
    }
    if (!amounts.length) continue;
    const amount = amounts[0].value;

    if (EMI_RE.test(clause) && !LOAN_RE.test(clause.replace(EMI_RE, ''))) {
      update.existingEmi = Math.round(amount);
    } else if (INCOME_RE.test(clause)) {
      update.monthlyIncome = Math.round(ANNUAL_RE.test(clause) ? amount / 12 : amount);
    } else if (LOAN_RE.test(clause) || update.requestedAmount === undefined) {
      if (amount >= 1000) update.requestedAmount = Math.round(amount);
    }
  }

  if (/\bno (existing )?emis?\b|\bdon'?t have any (loans?|emis?)\b/i.test(message)) update.existingEmi = 0;

  const purpose = PURPOSE_KEYWORDS.find(([, re]) => re.test(message));
  if (purpose) update.purpose = purpose[0];
  const employment = EMPLOYMENT_KEYWORDS.find(([, re]) => re.test(message));
  if (employment) update.employmentType = employment[0];
  const risk = RISK_KEYWORDS.find(([, re]) => re.test(message));
  if (risk) update.riskProfile = risk[0];
  if (/\b(i have|own|can pledge|have some) (a )?(property|house|flat|gold|fd|fixed deposit)\b/i.test(message)) {
    update.hasCollateral = true;
  }
  return update;
}
