import { ChatMarkdownPipe, InrPipe, TenurePipe } from './format';

describe('InrPipe', () => {
  const p = new InrPipe();
  it('uses Indian digit grouping', () => {
    expect(p.transform(1234567)).toBe('₹12,34,567');
    expect(p.transform(16607.15)).toBe('₹16,607');
  });
  it('handles missing values', () => {
    expect(p.transform(undefined)).toBe('-');
    expect(p.transform(NaN)).toBe('-');
  });
});

describe('TenurePipe', () => {
  it('formats months and years', () => {
    expect(new TenurePipe().transform(36)).toBe('36 mo (3 yr)');
    expect(new TenurePipe().transform(18)).toBe('18 mo');
  });
});

describe('ChatMarkdownPipe', () => {
  const p = new ChatMarkdownPipe();
  it('escapes HTML to prevent XSS from model output', () => {
    const out = p.transform('<img src=x onerror=alert(1)> hi');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
  it('renders bold and bullet lists', () => {
    expect(p.transform('**Top-up Loan**\n- EMI ₹16,251\n• Lower rate')).toBe(
      '<p><strong>Top-up Loan</strong></p><ul><li>EMI ₹16,251</li><li>Lower rate</li></ul>',
    );
  });
});
