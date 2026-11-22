#!/usr/bin/env node
/**
 * Local stand-in for the LLM wrapper (POST /llm/query, Bearer auth) for offline
 * development and demos. It reads the <FACTS> block from the prompt and writes
 * a short grounded answer. Set MOCK_HALLUCINATE=1 to return a made-up rate and
 * watch the output verifier reject it in the UI.
 *
 *   node scripts/mock-llm.mjs            # listens on :4010
 *   LLM_BASE_URL=http://localhost:4010 LLM_API_TOKEN=dev npm run dev
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4010);

function answer(prompt) {
  // Match the data block (starts with "{"), not the mentions of <FACTS> in the rules text.
  const facts = JSON.parse(prompt.match(/<FACTS>\s*(\{[\s\S]*?\})\s*<\/FACTS>/)?.[1] ?? '{}');
  const user = prompt.match(/<USER_MESSAGE>\n([\s\S]*?)\n<\/USER_MESSAGE>/)?.[1] ?? '';
  if (process.env.MOCK_HALLUCINATE === '1') return 'Great news! You qualify at just 6.99% with an EMI of ₹9,999.';
  const top = facts.recommendations?.[0];
  if (!top)
    return "Based on what you've shared, none of our products fit right now. A smaller amount, longer tenure or collateral could help.";
  if (facts.comparison?.length >= 2) {
    const rows = facts.comparison.filter((c) => c.emi);
    return [
      `Here's how they compare for you:`,
      ...rows.map((c) => `- **${c.product}**: EMI ${c.emi} for ${c.tenure}, total interest ${c.totalInterest}, APR ${c.aprInclFees}`),
      'The one with the lower APR costs less overall once fees are included.',
    ].join('\n');
  }
  if (/tenure|longer|shorter|month|year/i.test(user)) {
    return [`For the **${top.product}**:`, ...facts.tenureTradeoff.slice(0, 2).map((t) => `- ${t}`)].join('\n');
  }
  return [
    `The **${top.product}** looks like the best fit. Your estimated EMI is ${top.emi} for ${top.tenure} at ${top.annualRate}.`,
    `- Total interest: ${top.totalInterest}; processing fee: ${top.processingFee}`,
    `- APR including fees: ${top.aprInclFees} (APR = yearly cost including fees)`,
    `- Watch out: ${top.watchOuts[0] ?? 'review the Key Fact Statement'}`,
  ].join('\n');
}

http
  .createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/llm/query') return res.writeHead(404).end();
    if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) return res.writeHead(401).end('unauthorized');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { prompt } = JSON.parse(body);
        const text = answer(prompt);
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { response: text } }));
        }, 400);
      } catch (e) {
        res.writeHead(400).end(String(e));
      }
    });
  })
  .listen(PORT, () => console.log(`mock LLM listening on http://localhost:${PORT}/llm/query`));
