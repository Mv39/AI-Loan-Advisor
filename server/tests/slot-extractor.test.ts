import { extractProfileUpdates } from '../src/services/slot-extractor';

describe('Slot extraction from free text', () => {
  it.each([
    [
      "I need 3 lakh for my sister's wedding over 2 years, I earn 60k a month",
      { requestedAmount: 300000, preferredTenureMonths: 24, monthlyIncome: 60000, purpose: 'wedding' },
    ],
    [
      'My salary is 12 LPA and I already pay 8,000 EMI. Want ₹1.5 lakh for a laptop',
      { monthlyIncome: 100000, existingEmi: 8000, requestedAmount: 150000, purpose: 'consumer_purchase' },
    ],
    [
      'I run a business and need 20 lakh for inventory',
      { requestedAmount: 2000000, purpose: 'working_capital', employmentType: 'business_owner' },
    ],
    ['I have gold and need 2,00,000 for medical emergency', { requestedAmount: 200000, purpose: 'medical', hasCollateral: true }],
    ['What if I take 48 months?', { preferredTenureMonths: 48 }],
    ['I have no existing EMIs', { existingEmi: 0 }],
  ])('%s', (message, expected) => {
    expect(extractProfileUpdates(message)).toMatchObject(expected);
  });

  it('returns nothing for messages without profile data', () => {
    expect(extractProfileUpdates('Which product is cheaper?')).toEqual({});
  });
});
