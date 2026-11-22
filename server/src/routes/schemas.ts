import { z } from 'zod';

export const EMPLOYMENT = ['salaried', 'self_employed', 'business_owner', 'gig_worker', 'student'] as const;
export const RISK = ['low', 'medium', 'high'] as const;
export const PURPOSES = [
  'medical',
  'education',
  'wedding',
  'travel',
  'home_renovation',
  'debt_consolidation',
  'business_expansion',
  'working_capital',
  'consumer_purchase',
  'emergency',
  'vehicle',
  'other',
] as const;

const money = (max: number) => z.coerce.number().finite().min(0).max(max);

export const ProfileSchema = z
  .object({
    requestedAmount: money(100_000_000).refine((v) => v >= 1000, 'Minimum ₹1,000'),
    purpose: z.enum(PURPOSES),
    monthlyIncome: money(10_000_000),
    existingEmi: money(10_000_000),
    preferredTenureMonths: z.coerce.number().int().min(1).max(360),
    employmentType: z.enum(EMPLOYMENT),
    riskProfile: z.enum(RISK),
    hasExistingLoanWithUs: z.boolean().default(false),
    hasCollateral: z.boolean().default(false),
    businessVintageYears: z.coerce.number().min(0).max(100).optional(),
  })
  .strict()
  .refine((p) => p.existingEmi <= p.monthlyIncome, { message: 'Existing EMI cannot exceed monthly income', path: ['existingEmi'] });

export const EmiRequestSchema = z
  .object({
    principal: z.coerce.number().finite().positive().max(100_000_000),
    annualRatePct: z.coerce.number().min(0).max(60),
    tenureMonths: z.coerce.number().int().min(1).max(360),
    processingFeePct: z.coerce.number().min(0).max(10).default(0),
    includeSchedule: z.boolean().default(false),
  })
  .strict();

export const LoginSchema = z.object({ username: z.string().trim().min(1).max(40) }).strict();

export const ChatMessageSchema = z
  .object({
    message: z.string().trim().min(1, 'Message is empty').max(1000, 'Message too long (max 1000 characters)'),
    language: z.enum(['en', 'hi']).default('en'),
  })
  .strict();

export const CompareSchema = z.object({
  ids: z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().regex(/^[A-Z]+-\d{3}$/))
        .min(2)
        .max(4),
    ),
});

export const SummaryQuerySchema = z.object({
  format: z.enum(['md', 'html']).default('html'),
  language: z.enum(['en', 'hi']).default('en'),
});
