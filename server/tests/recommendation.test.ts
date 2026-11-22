import users from '../src/data/users.json';
import { catalog } from '../src/domain/catalog';
import { MAX_RECOMMENDATIONS, recommend } from '../src/domain/recommendation';
import type { BorrowerProfile } from '../src/domain/types';
import { baseProfile } from './helpers';

const persona = (username: string) => users.find((u) => u.username === username)!.profile as BorrowerProfile;

describe('Recommendation engine', () => {
  it.each([
    ['priya', 'TOP-001'],
    ['rahul', 'SEC-001'],
    ['ananya', 'BNPL-001'],
  ])('top pick for %s is %s', (u, expected) => {
    expect(recommend(persona(u), catalog.all()).recommendations[0].productId).toBe(expected);
  });

  it('never recommends an ineligible product and ranks sequentially', () => {
    for (const u of users) {
      const r = recommend(u.profile as BorrowerProfile, catalog.all());
      expect(r.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
      r.recommendations.forEach((rec, i) => {
        expect(rec.rank).toBe(i + 1);
        expect(rec.status).not.toBe('ineligible');
        expect(r.notEligible.map((n) => n.productId)).not.toContain(rec.productId);
      });
      // every product is accounted for exactly once (recommended, not eligible, or ranked out)
      expect(r.recommendations.length + r.notEligible.length).toBeLessThanOrEqual(catalog.all().length);
    }
  });

  it('prefers the cheaper product when both fit (Top-up over Personal Loan)', () => {
    const r = recommend(baseProfile(), catalog.all());
    const ids = r.recommendations.map((x) => x.productId);
    expect(ids.indexOf('TOP-001')).toBeLessThan(ids.indexOf('PL-001'));
  });

  it('provides tenure options with monotonic EMI/interest trade-off', () => {
    const rec = recommend(baseProfile(), catalog.all()).recommendations[0];
    expect(rec.tenureOptions.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rec.tenureOptions.length; i++) {
      expect(rec.tenureOptions[i].emi).toBeLessThan(rec.tenureOptions[i - 1].emi);
      expect(rec.tenureOptions[i].totalInterest).toBeGreaterThan(rec.tenureOptions[i - 1].totalInterest);
    }
  });

  it('explains the shorter vs longer tenure trade-off', () => {
    const r = recommend(baseProfile(), catalog.all());
    expect(r.tenureTradeoff.join(' ')).toMatch(/Shorter tenure.*lowest total interest/);
    expect(r.tenureTradeoff.join(' ')).toMatch(/more in interest/);
  });

  it('returns no recommendations (with reasons) when nothing fits', () => {
    const r = recommend(
      baseProfile({
        employmentType: 'student',
        monthlyIncome: 5000,
        existingEmi: 0,
        requestedAmount: 500000,
        hasExistingLoanWithUs: false,
      }),
      catalog.all(),
    );
    expect(r.recommendations).toHaveLength(0);
    expect(r.notEligible.length).toBe(catalog.all().length);
    expect(r.notEligible.every((n) => n.reasons.length > 0)).toBe(true);
  });
});
