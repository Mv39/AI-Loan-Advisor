import type { BorrowerProfile } from '../src/domain/types';
import type { LlmClient, LlmRequest } from '../src/services/llm.client';

export const baseProfile = (o: Partial<BorrowerProfile> = {}): BorrowerProfile => ({
  requestedAmount: 500000,
  purpose: 'home_renovation',
  monthlyIncome: 95000,
  existingEmi: 12000,
  preferredTenureMonths: 36,
  employmentType: 'salaried',
  riskProfile: 'low',
  hasExistingLoanWithUs: true,
  hasCollateral: false,
  ...o,
});

/** Scriptable fake LLM that records every prompt it receives. */
export class FakeLlm implements LlmClient {
  readonly enabled = true;
  readonly calls: LlmRequest[] = [];
  constructor(private responder: (req: LlmRequest) => string | Promise<string>) {}
  async complete(req: LlmRequest) {
    this.calls.push(req);
    return this.responder(req);
  }
  respondWith(fn: (req: LlmRequest) => string | Promise<string>) {
    this.responder = fn;
  }
}
