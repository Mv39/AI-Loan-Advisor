import type { RecommendationResult } from '../domain/types';
import { formatINR, formatPct, formatTenure } from '../utils/format';
import { profileFacts } from './facts';
import { DISCLAIMER } from './i18n';
import type { Language } from './prompt';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildSummaryMarkdown(result: RecommendationResult, lang: Language = 'en', ref = ''): string {
  const p = profileFacts(result.profile);
  const out: string[] = [
    '# Loan Recommendation Summary',
    '',
    `Generated: ${new Date(result.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST${ref ? `  |  Ref: ${ref}` : ''}`,
    '',
    '## Your details',
    `- Amount needed: ${p.requestedAmount}`,
    `- Purpose: ${p.purpose}`,
    `- Monthly income: ${p.monthlyIncome}  |  Existing EMIs: ${p.existingEmi}`,
    `- Preferred tenure: ${p.preferredTenure}`,
    `- Employment: ${p.employmentType}  |  Risk profile: ${p.riskProfile}`,
    '',
    '## Recommended products',
  ];
  if (!result.recommendations.length) out.push('No suitable product found for the details provided.');
  for (const r of result.recommendations) {
    out.push(
      '',
      `### ${r.rank}. ${r.productName} - ${r.status === 'eligible' ? 'Eligible' : 'Eligible with adjustments'}`,
      '',
      '| Item | Value |',
      '|---|---|',
      `| Loan amount | ${formatINR(r.emi.principal)} |`,
      `| Interest rate | ${r.annualRatePct}% p.a. (reducing) |`,
      `| Tenure | ${formatTenure(r.emi.tenureMonths)} |`,
      `| Estimated EMI | ${formatINR(r.emi.emi)} |`,
      `| Total interest | ${formatINR(r.emi.totalInterest)} |`,
      `| Processing fee | ${formatINR(r.emi.processingFee)} |`,
      `| Total repayment | ${formatINR(r.emi.totalRepayment)} |`,
      `| APR (incl. fees) | ${formatPct(r.emi.aprPct)} |`,
      '',
      `**Why it fits:** ${r.whyThisFits.join('; ')}`,
      '',
      `**Watch-outs:** ${r.watchOuts.join('; ')}`,
      '',
      '| Tenure | EMI | Total interest | Total repayment | EMIs / income |',
      '|---|---|---|---|---|',
      ...r.tenureOptions.map(
        (o) =>
          `| ${formatTenure(o.tenureMonths)} | ${formatINR(o.emi)} | ${formatINR(o.totalInterest)} | ${formatINR(o.totalRepayment)} | ${formatPct(o.foirAfterLoanPct)}${o.affordable ? '' : ' (over limit)'} |`,
      ),
    );
  }
  if (result.tenureTradeoff.length) out.push('', '## Shorter vs longer tenure', ...result.tenureTradeoff.map((s) => `- ${s}`));
  if (result.notEligible.length) {
    out.push('', '## Products not suitable right now', ...result.notEligible.map((n) => `- **${n.productName}:** ${n.reasons.join('; ')}`));
  }
  out.push('', '---', `*${DISCLAIMER[lang]}*`, '');
  return out.join('\n');
}

/** Minimal Markdown -> HTML for our own generated summary (headings, tables, bullets, bold, italics). */
export function buildSummaryHtml(result: RecommendationResult, lang: Language = 'en', ref = ''): string {
  const md = buildSummaryMarkdown(result, lang, ref);
  const html: string[] = [];
  const lines = md.split('\n');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-| ]+\|$/.test(lines[i]))
          rows.push(
            lines[i]
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim()),
          );
        i++;
      }
      i--;
      const [head, ...body] = rows;
      html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
    } else if (l.startsWith('### ')) html.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (l.startsWith('## ')) html.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith('# ')) html.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith('- ')) html.push(`<li>${inline(l.slice(2))}</li>`);
    else if (l === '---') html.push('<hr/>');
    else if (l.trim()) html.push(`<p>${inline(l)}</p>`);
  }
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>Loan Recommendation Summary</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:32px auto;padding:0 16px;color:#1f2937;line-height:1.5}
h1{color:#0f3d5e}h2{border-bottom:2px solid #e5e7eb;padding-bottom:4px;margin-top:28px}table{border-collapse:collapse;width:100%;margin:8px 0 12px}
th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;font-size:14px}th{background:#f3f4f6}em{color:#6b7280}li{margin:4px 0}
@media print{body{margin:0}}</style></head><body>${html.join('\n')}</body></html>`;
}
