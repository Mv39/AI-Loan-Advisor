import crypto from 'node:crypto';
import { recommend } from '../domain/recommendation';
import type { BorrowerProfile, Product, RecommendationResult } from '../domain/types';
import type { ChatMessage, ChatRepository, ProfileRepository } from '../repositories/types';
import { formatINR, formatTenure } from '../utils/format';
import { logger, hashUserId } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { buildFacts, compareProducts, ComparisonRow, hashFacts, mentionedProducts } from './facts';
import { classifyScope, detectPromptInjection, redactPII, validateOutput, ScopeIssue } from './guardrails';
import { DISCLAIMER, t } from './i18n';
import type { LlmClient } from './llm.client';
import { buildAdvisorPrompt, Language, PROMPT_VERSION } from './prompt';
import { extractProfileUpdates, ProfileUpdate } from './slot-extractor';

export type Intent = 'greeting' | 'compare' | 'tenure' | 'eligibility' | 'emi' | 'recommend' | 'blocked';

export function detectIntent(message: string, mentioned: string[]): Intent {
  const m = message.toLowerCase();
  if (/^(hi|hello|hey|namaste|good (morning|evening))\b[\s!.]*$/i.test(m.trim())) return 'greeting';
  if (
    /\b(compare|comparison|vs\.?|versus|difference|better than|which (one )?is (better|cheaper))\b|तुलना/i.test(m) ||
    mentioned.length >= 2
  )
    return 'compare';
  if (/\b(eligib\w*|qualify|why (not|can'?t|cannot|am i not)|reject\w*|not (shown|recommended|available))\b|पात्र/i.test(m))
    return 'eligibility';
  if (/\b(tenure|shorter|longer|duration|period|what if|months?|years?)\b|अवधि/i.test(m)) return 'tenure';
  if (/\b(emi|instal+ment|monthly payment|interest|total cost|repay\w*|apr|fee)\b|ब्याज|किस्त/i.test(m)) return 'emi';
  return 'recommend';
}

export interface AdvisorReply {
  sessionId: string;
  /** The user's message exactly as stored (PII-redacted), so the UI can show what was kept. */
  userMessage: ChatMessage;
  message: ChatMessage;
  source: 'llm' | 'rules';
  intent: Intent;
  profile: BorrowerProfile;
  profileUpdates: ProfileUpdate;
  recommendations: RecommendationResult;
  comparison?: ComparisonRow[];
  guardrails: { inputFlags: string[]; redactions: string[]; outputIssues: string[]; ungroundedNumbers: string[] };
  grounding: { promptVersion: string; factsHash: string; productIds: string[] };
  disclaimer: string;
  traceId: string;
}

export class NotFoundError extends Error {
  readonly status = 404;
}

const HISTORY_TURNS = 6;

export class AdvisorService {
  constructor(
    private readonly products: readonly Product[],
    private readonly profiles: ProfileRepository,
    private readonly chats: ChatRepository,
    private readonly llm: LlmClient,
  ) {}

  async handleMessage(args: {
    userId: string;
    sessionId: string;
    message: string;
    language: Language;
    traceId?: string;
  }): Promise<AdvisorReply> {
    const traceId = args.traceId ?? crypto.randomUUID();
    const { userId, sessionId, language } = args;

    // 1) Ownership check first - another user's session id behaves as "not found".
    const session = await this.chats.get(userId, sessionId);
    if (!session) throw new NotFoundError('Session not found');
    const storedProfile = await this.profiles.get(userId);
    if (!storedProfile) throw new NotFoundError('Profile not found');

    // 2) Input guardrails: redact PII before it is stored, logged or sent anywhere.
    const { text: safeMessage, redactions } = redactPII(args.message.trim());
    const injection = detectPromptInjection(safeMessage);
    const scopeIssue: ScopeIssue = classifyScope(safeMessage);
    const inputFlags = [...(injection ? ['prompt_injection'] : []), ...(scopeIssue ? [scopeIssue] : [])];

    // 3) Deterministic profile updates from the message (never from the LLM).
    const profileUpdates = injection ? {} : extractProfileUpdates(safeMessage);
    const profile: BorrowerProfile = { ...storedProfile, ...profileUpdates };
    if (Object.keys(profileUpdates).length) await this.profiles.upsert(userId, profile);

    // 4) Deterministic engine output = the single source of truth.
    const result = recommend(profile, this.products);
    let mentioned = mentionedProducts(safeMessage);
    const intent: Intent = inputFlags.length ? 'blocked' : detectIntent(safeMessage, mentioned);

    let comparison: ComparisonRow[] | undefined;
    if (intent === 'compare') {
      // Multi-turn: "compare them" reuses the last compared set, else the top two recommendations.
      if (mentioned.length < 2) {
        const fallbackIds = session.lastComparedProductIds.length
          ? session.lastComparedProductIds
          : result.recommendations.slice(0, 2).map((r) => r.productId);
        mentioned = Array.from(new Set([...mentioned, ...fallbackIds]));
      }
      comparison = compareProducts(mentioned, profile, this.products);
      await this.chats.setCompared(userId, sessionId, mentioned);
    }

    const facts = buildFacts({ result, products: this.products, mentioned, comparison });
    const factsHash = hashFacts(facts);

    // 5) Compose the answer: blocked -> canned; else LLM with verification; fallback to rules.
    let content: string;
    let source: 'llm' | 'rules' = 'rules';
    let outputIssues: string[] = [];
    let ungroundedNumbers: string[] = [];

    if (intent === 'blocked') {
      content = t(language, injection ? 'injection' : scopeIssue!);
    } else if (intent === 'greeting') {
      content = t(language, 'greet');
    } else {
      const deterministic = this.composeDeterministic(intent, result, comparison, mentioned, language);
      content = deterministic;
      if (this.llm.enabled) {
        try {
          const history = session.messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: m.content }));
          const prompt = buildAdvisorPrompt({ facts, history, userMessage: safeMessage, language });
          const answer = await this.llm.complete({
            prompt,
            metadata: { client: 'loan-advisor', traceId, promptVersion: PROMPT_VERSION, intent },
          });
          const check = validateOutput(answer, facts, safeMessage);
          outputIssues = check.issues;
          ungroundedNumbers = check.ungroundedNumbers;
          if (check.ok) {
            content = answer;
            source = 'llm';
          } else {
            logger.warn('advisor.output_rejected', { traceId, issues: check.issues, ungroundedNumbers: check.ungroundedNumbers });
          }
        } catch (err) {
          outputIssues = ['llm_unavailable'];
          logger.warn('advisor.llm_fallback', { traceId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    const updatedNote = this.describeUpdates(profileUpdates, language);
    if (updatedNote) content = `${updatedNote}\n\n${content}`;

    const now = new Date().toISOString();
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: safeMessage, createdAt: now };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      meta: { source, intent, factsHash, promptVersion: PROMPT_VERSION, traceId },
    };
    await this.chats.append(userId, sessionId, userMsg, assistantMsg);

    metrics.advisorReplies.inc({ source, intent });
    inputFlags.forEach((type) => metrics.guardrailEvents.inc({ stage: 'input', type }));
    redactions.forEach((type) => metrics.guardrailEvents.inc({ stage: 'redaction', type }));
    outputIssues.forEach((type) => metrics.guardrailEvents.inc({ stage: 'output', type }));

    // 6) Audit trail: what was shown, from which facts, by which path. No raw PII.
    logger.info('advisor.reply', {
      traceId,
      user: hashUserId(userId),
      intent,
      source,
      factsHash,
      promptVersion: PROMPT_VERSION,
      products: result.recommendations.map((r) => r.productId),
      inputFlags,
      redactions,
      outputIssues,
    });

    return {
      sessionId,
      userMessage: userMsg,
      message: assistantMsg,
      source,
      intent,
      profile,
      profileUpdates,
      recommendations: result,
      comparison,
      guardrails: { inputFlags, redactions, outputIssues, ungroundedNumbers },
      grounding: {
        promptVersion: PROMPT_VERSION,
        factsHash,
        productIds: Array.from(new Set([...result.recommendations.map((r) => r.productId), ...mentioned])),
      },
      disclaimer: DISCLAIMER[language],
      traceId,
    };
  }

  private describeUpdates(u: ProfileUpdate, lang: Language): string | undefined {
    const parts: string[] = [];
    if (u.requestedAmount !== undefined) parts.push(`amount ${formatINR(u.requestedAmount)}`);
    if (u.preferredTenureMonths !== undefined) parts.push(`tenure ${formatTenure(u.preferredTenureMonths)}`);
    if (u.monthlyIncome !== undefined) parts.push(`monthly income ${formatINR(u.monthlyIncome)}`);
    if (u.existingEmi !== undefined) parts.push(`existing EMI ${formatINR(u.existingEmi)}`);
    if (u.purpose) parts.push(`purpose ${u.purpose.replaceAll('_', ' ')}`);
    if (u.employmentType) parts.push(`employment ${u.employmentType.replaceAll('_', ' ')}`);
    if (u.riskProfile) parts.push(`risk profile ${u.riskProfile}`);
    if (u.hasCollateral) parts.push('collateral available');
    return parts.length ? t(lang, 'updated', { fields: parts.join(', ') }) : undefined;
  }

  /** Rule-based answer built purely from engine output. Used when the LLM is off, fails, or is not trustworthy. */
  composeDeterministic(
    intent: Intent,
    result: RecommendationResult,
    comparison: ComparisonRow[] | undefined,
    mentioned: string[],
    lang: Language,
  ): string {
    const lines: string[] = [];
    const top = result.recommendations[0];

    if (intent === 'compare' && comparison?.length) {
      lines.push(t(lang, 'compareIntro'));
      for (const c of comparison) {
        if (c.emi) {
          lines.push(
            `• ${c.product} (${t(lang, c.status)}): ${c.annualRate}, EMI ${c.emi} for ${c.tenure}, total interest ${c.totalInterest}, fee ${c.processingFee}, total repayment ${c.totalRepayment}, APR ${c.aprInclFees}.`,
          );
        } else {
          lines.push(`• ${c.product} (${t(lang, 'ineligible')}): ${c.notes.join('; ')}.`);
        }
      }
      const priced = comparison.filter((c) => c.aprInclFees);
      if (priced.length >= 2) {
        const cheapest = priced.reduce((a, b) => (parseFloat(a.aprInclFees!) <= parseFloat(b.aprInclFees!) ? a : b));
        lines.push(`Lowest overall cost (APR incl. fees): ${cheapest.product}.`);
      }
      return lines.join('\n');
    }

    if (!top) {
      lines.push(t(lang, 'noRecs'));
      if (result.notEligible.length) {
        lines.push(t(lang, 'whyNot'));
        result.notEligible.forEach((n) => lines.push(`• ${n.productName}: ${n.reasons.join('; ')}`));
      }
      return lines.join('\n');
    }

    if (intent === 'eligibility') {
      const focus = mentioned.length ? result.notEligible.filter((n) => mentioned.includes(n.productId)) : result.notEligible;
      const conditional = result.recommendations.filter(
        (r) => r.status === 'conditional' && (!mentioned.length || mentioned.includes(r.productId)),
      );
      if (focus.length) {
        lines.push(t(lang, 'whyNot'));
        focus.forEach((n) => lines.push(`• ${n.productName}: ${n.reasons.join('; ')}`));
      }
      conditional.forEach((r) => lines.push(`• ${r.productName} (${t(lang, 'conditional')}): ${r.watchOuts.slice(0, 2).join('; ')}`));
      if (!lines.length) lines.push(...result.recommendations.map((r) => `• ${r.productName}: ${t(lang, r.status)}`));
      return lines.join('\n');
    }

    lines.push(
      t(lang, 'topRec', {
        name: top.productName,
        status: t(lang, top.status),
        emi: formatINR(top.emi.emi),
        tenure: formatTenure(top.emi.tenureMonths),
        rate: top.annualRatePct,
        interest: formatINR(top.emi.totalInterest),
        fee: formatINR(top.emi.processingFee),
        repay: formatINR(top.emi.totalRepayment),
        apr: top.emi.aprPct,
      }),
    );

    if (intent === 'tenure') {
      lines.push('', t(lang, 'tenureIntro', { name: top.productName }));
      top.tenureOptions.forEach((o) =>
        lines.push(
          `• ${formatTenure(o.tenureMonths)}: EMI ${formatINR(o.emi)}, total interest ${formatINR(o.totalInterest)}${o.affordable ? '' : ' (above affordability limit)'}`,
        ),
      );
      lines.push(...result.tenureTradeoff.slice(0, 2).map((s) => `• ${s}`));
      return lines.join('\n');
    }

    if (top.watchOuts.length) lines.push(`• ${top.watchOuts[0]}`);
    if (result.recommendations.length > 1) {
      lines.push('', t(lang, 'otherRecs'));
      result.recommendations
        .slice(1)
        .forEach((r) =>
          lines.push(
            `• ${r.productName}: EMI ${formatINR(r.emi.emi)} for ${formatTenure(r.emi.tenureMonths)} at ${r.annualRatePct}% p.a. (APR ${r.emi.aprPct}%)`,
          ),
        );
    }
    return lines.join('\n');
  }
}
