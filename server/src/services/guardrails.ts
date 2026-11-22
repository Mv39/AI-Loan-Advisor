import { AllowedNumbers, collectAllowedNumbers, extractNumbers, ExtractedNumber } from './numbers';

/* ------------------------------------------------------------------ */
/* Input guardrails                                                    */
/* ------------------------------------------------------------------ */

export type RedactionType = 'pan' | 'aadhaar' | 'card' | 'phone' | 'email' | 'ifsc' | 'account';

// Order matters: more specific patterns (account with keyword) run before generic digit runs.
const PII_PATTERNS: { type: RedactionType; re: RegExp }[] = [
  { type: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: 'pan', re: /\b[A-Z]{5}\d{4}[A-Z]\b/gi },
  { type: 'ifsc', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { type: 'account', re: /\b(?:a\/c|acct|account)(?:\s*(?:no\.?|number))?\s*[:#-]?\s*\d{9,18}\b/gi },
  { type: 'card', re: /\b(?:\d[ -]?){13,19}\b/g },
  { type: 'aadhaar', re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g },
  { type: 'phone', re: /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g },
];

/** Redact sensitive identifiers before anything is stored, logged or sent to the LLM. */
export function redactPII(text: string): { text: string; redactions: RedactionType[] } {
  const redactions = new Set<RedactionType>();
  let out = text;
  for (const { type, re } of PII_PATTERNS) {
    out = out.replace(re, () => {
      redactions.add(type);
      return `[REDACTED_${type.toUpperCase()}]`;
    });
  }
  return { text: out, redactions: Array.from(redactions) };
}

const INJECTION_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i,
  /disregard (all |the )?(previous|prior|above|system)/i,
  /(reveal|show|print|repeat) (me )?(your|the) (system )?(prompt|instructions|rules)/i,
  /\byou are now\b/i,
  /\b(developer|dan|jailbreak|god) mode\b/i,
  /pretend (to be|you are)/i,
  /<\/?(facts|system|user_message)>/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

export type ScopeIssue = 'investment_advice' | 'approval_guarantee' | 'fraud' | null;

const SCOPE_RULES: { issue: Exclude<ScopeIssue, null>; re: RegExp }[] = [
  {
    issue: 'fraud',
    re: /\b(fake|forge|forged|edit(ed)?|fabricat\w*|morph\w*)\b.*\b(salary slip|payslip|bank statement|itr|documents?|income proof)\b|\bhide (my )?(existing )?(loans?|emis?|debts?)\b|\blie about\b/i,
  },
  {
    issue: 'approval_guarantee',
    re: /\b(guarantee[ds]?|100 ?%|definitely|surely)\b.*\b(approv\w*|sanction\w*|get (the )?loan)\b|\bwill (i|my loan) (definitely |surely )?(be|get) approved\b/i,
  },
  {
    issue: 'investment_advice',
    re: /\b(stocks?|shares|crypto\w*|bitcoin|mutual funds?|invest(ing)? (the )?(loan|money) in|trading|f&o|options trading|lottery|betting)\b/i,
  },
];

export function classifyScope(text: string): ScopeIssue {
  return SCOPE_RULES.find((r) => r.re.test(text))?.issue ?? null;
}

/* ------------------------------------------------------------------ */
/* Output guardrails                                                   */
/* ------------------------------------------------------------------ */

const BANNED_OUTPUT_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'approval_promise', re: /\b(guaranteed?|assured|certain(ly)?|definitely|100 ?%)\b[^.]{0,40}\b(approv\w*|sanction\w*|eligib\w*)/i },
  { id: 'approval_promise', re: /\byou (will|are going to) (be|get) (approved|sanctioned)\b/i },
  { id: 'approval_promise', re: /\b(pre-?approved|instant approval)\b/i },
  { id: 'investment_advice', re: /\b(invest (it|the loan|the money) in|buy (stocks|shares|crypto))\b/i },
  { id: 'prompt_leak', re: /<\/?(facts|user_message|conversation_so_far)>|grounding rules/i },
];

export interface OutputValidation {
  ok: boolean;
  issues: string[];
  ungroundedNumbers: string[];
}

function isGrounded(n: ExtractedNumber, allowed: AllowedNumbers, userNumbers: AllowedNumbers): boolean {
  // Numbers the user typed themselves may be echoed back in any form.
  const pool = new Set([...allowed[n.kind], ...userNumbers.plain]);
  if (n.kind === 'plain') allowed.plain.forEach((v) => pool.add(v));
  return Array.from(pool).some((a) => {
    if (n.kind === 'percent') return Math.abs(n.value - a) <= 0.05;
    if (n.kind === 'months' || n.kind === 'years') return n.value === a;
    // Amounts: allow rupee rounding; wider band when written as "5 lakh"-style figures.
    const tol = Math.max(1, Math.abs(a) * (n.approximate ? 0.05 : 0.01));
    return Math.abs(n.value - a) <= tol;
  });
}

/**
 * Verifies an LLM answer against the grounding facts:
 *  - no banned claims (approval promises, investment advice, prompt leakage)
 *  - every money / percent / tenure figure must trace back to the facts or the user's own message.
 */
export function validateOutput(answer: string, facts: unknown, userMessage = ''): OutputValidation {
  const issues = new Set<string>();
  for (const { id, re } of BANNED_OUTPUT_PATTERNS) if (re.test(answer)) issues.add(id);

  const allowed = collectAllowedNumbers(facts);
  const userNumbers = collectAllowedNumbers(userMessage);
  const ungroundedNumbers: string[] = [];
  for (const n of extractNumbers(answer)) {
    // Plain small integers ("3 options", list numbering) carry no financial claim.
    if (n.kind === 'plain' && n.value < 100) continue;
    if (!isGrounded(n, allowed, userNumbers)) ungroundedNumbers.push(n.raw);
  }
  if (ungroundedNumbers.length) issues.add('ungrounded_numbers');

  return { ok: issues.size === 0, issues: Array.from(issues), ungroundedNumbers };
}
