export type EmploymentType = 'salaried' | 'self_employed' | 'business_owner' | 'gig_worker' | 'student';
export type RiskProfile = 'low' | 'medium' | 'high';
export type Language = 'en' | 'hi';
export type EligibilityStatus = 'eligible' | 'conditional' | 'ineligible';

export interface BorrowerProfile {
  requestedAmount: number;
  purpose: string;
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
  aprPct: number;
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
  productType: string;
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
  disclaimer?: string;
}

export interface ComparisonRow {
  productId: string;
  product: string;
  status: EligibilityStatus;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

/** UI-side message enriched with the reply envelope. */
export interface UiMessage extends ChatMessage {
  source?: 'llm' | 'rules';
  flags?: string[];
  disclaimer?: string;
  traceId?: string;
  pending?: boolean;
  error?: boolean;
}

export interface AdvisorReply {
  sessionId: string;
  userMessage: ChatMessage;
  message: ChatMessage;
  source: 'llm' | 'rules';
  intent: string;
  profile: BorrowerProfile;
  profileUpdates: Partial<BorrowerProfile>;
  recommendations: RecommendationResult;
  comparison?: ComparisonRow[];
  guardrails: { inputFlags: string[]; redactions: string[]; outputIssues: string[]; ungroundedNumbers: string[] };
  grounding: { promptVersion: string; factsHash: string; productIds: string[] };
  disclaimer: string;
  traceId: string;
}

export interface DemoUser {
  username: string;
  displayName: string;
  persona: string;
}

export const PURPOSES: { value: string; label: string }[] = [
  { value: 'medical', label: 'Medical' },
  { value: 'education', label: 'Education' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'travel', label: 'Travel' },
  { value: 'home_renovation', label: 'Home renovation' },
  { value: 'debt_consolidation', label: 'Debt consolidation' },
  { value: 'business_expansion', label: 'Business expansion' },
  { value: 'working_capital', label: 'Working capital' },
  { value: 'consumer_purchase', label: 'Consumer purchase' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'other', label: 'Other' },
];

export const EMPLOYMENT: { value: EmploymentType; label: string }[] = [
  { value: 'salaried', label: 'Salaried' },
  { value: 'self_employed', label: 'Self-employed professional' },
  { value: 'business_owner', label: 'Business owner' },
  { value: 'gig_worker', label: 'Gig / freelance worker' },
  { value: 'student', label: 'Student' },
];
