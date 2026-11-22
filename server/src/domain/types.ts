export type EmploymentType = 'salaried' | 'self_employed' | 'business_owner' | 'gig_worker' | 'student';
export type RiskProfile = 'low' | 'medium' | 'high';
export type LoanPurpose =
  | 'medical'
  | 'education'
  | 'wedding'
  | 'travel'
  | 'home_renovation'
  | 'debt_consolidation'
  | 'business_expansion'
  | 'working_capital'
  | 'consumer_purchase'
  | 'emergency'
  | 'vehicle'
  | 'other';

export type ProductType = 'personal_loan' | 'salary_advance' | 'bnpl' | 'sme_loan' | 'top_up_loan' | 'secured_loan';

export interface Product {
  id: string;
  name: string;
  type: ProductType;
  description: string;
  minAmount: number;
  maxAmount: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  /** Annual interest rate (%) by borrower risk band. Reducing-balance unless flatFeeInsteadOfInterest. */
  annualRateByRisk: Record<RiskProfile, number>;
  processingFeePct: number;
  /** Minimum processing fee in INR (applied when % fee is lower). */
  minProcessingFee: number;
  eligibleEmployment: EmploymentType[];
  minMonthlyIncome: number;
  /** Max fixed-obligation-to-income ratio after this loan (0-1). */
  maxFoir: number;
  /** Max loan as a multiple of net monthly income (optional cap). */
  maxIncomeMultiple?: number;
  allowedRisk: RiskProfile[];
  purposes: LoanPurpose[] | 'any';
  requiresExistingLoan?: boolean;
  requiresCollateral?: boolean;
  minBusinessVintageYears?: number;
  /** Key features shown to user, also used as grounding text for the LLM. */
  features: string[];
  /** Plain-language caveats - always surfaced. */
  caveats: string[];
}

export interface BorrowerProfile {
  requestedAmount: number;
  purpose: LoanPurpose;
  monthlyIncome: number;
  existingEmi: number;
  preferredTenureMonths: number;
  employmentType: EmploymentType;
  riskProfile: RiskProfile;
  hasExistingLoanWithUs: boolean;
  hasCollateral: boolean;
  businessVintageYears?: number;
}

export interface EmiResult {
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
  emi: number;
  totalInterest: number;
  totalRepayment: number;
  processingFee: number;
  totalCostOfCredit: number;
  /** Annual Percentage Rate including processing fee (IRR-based), % */
  aprPct: number;
}

export interface AmortizationRow {
  month: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
}

export type EligibilityStatus = 'eligible' | 'conditional' | 'ineligible';

export interface EligibilityCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface EligibilityResult {
  productId: string;
  productName: string;
  status: EligibilityStatus;
  checks: EligibilityCheck[];
  /** Human-readable reasons for failed / conditional checks. */
  reasons: string[];
  /** Suggested adjustments that would make the product work (e.g. longer tenure). */
  suggestions: string[];
  /** The amount/tenure we actually priced (may be clamped to product bounds). */
  pricedAmount: number;
  pricedTenureMonths: number;
  maxAffordableAmount: number;
  foirAfterLoanPct: number;
  emi?: EmiResult;
}

export interface TenureOption {
  tenureMonths: number;
  emi: number;
  totalInterest: number;
  totalRepayment: number;
  foirAfterLoanPct: number;
  affordable: boolean;
}

export interface Recommendation {
  rank: number;
  productId: string;
  productName: string;
  productType: ProductType;
  status: EligibilityStatus;
  score: number;
  annualRatePct: number;
  emi: EmiResult;
  tenureOptions: TenureOption[];
  whyThisFits: string[];
  watchOuts: string[];
}

export interface RecommendationResult {
  profile: BorrowerProfile;
  recommendations: Recommendation[];
  notEligible: { productId: string; productName: string; reasons: string[] }[];
  tenureTradeoff: string[];
  generatedAt: string;
}
