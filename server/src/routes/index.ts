import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { calculateEmi, amortizationSchedule, processingFee } from '../domain/emi';
import { recommend } from '../domain/recommendation';
import type { Product } from '../domain/types';
import { currentUserId, issueToken, requireAuth } from '../middleware/auth';
import type { ChatRepository, ProfileRepository, UserDirectory } from '../repositories/types';
import { AdvisorService, NotFoundError } from '../services/advisor.service';
import { compareProducts } from '../services/facts';
import { DISCLAIMER } from '../services/i18n';
import type { LlmClient } from '../services/llm.client';
import { buildSummaryHtml, buildSummaryMarkdown } from '../services/summary.service';
import { buildOpenApiDocument } from './openapi';
import { ChatMessageSchema, CompareSchema, EmiRequestSchema, LoginSchema, ProfileSchema, SummaryQuerySchema } from './schemas';

export interface RouteDeps {
  products: readonly Product[];
  users: UserDirectory;
  profiles: ProfileRepository;
  chats: ChatRepository;
  advisor: AdvisorService;
  llm: LlmClient & { currentState?: string };
  storage: 'memory' | 'mongodb';
  ready: () => Promise<boolean>;
}

export function buildRouter(deps: RouteDeps): Router {
  const r = Router();
  const { products, users, profiles, chats, advisor } = deps;

  // Per-user limiter for the expensive LLM path (falls back to IP before auth).
  const chatLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? ''),
    message: { error: 'rate_limited', message: 'Too many messages. Please wait a minute.' },
  });
  const loginLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

  /* ---------- public ---------- */
  /** Liveness: the process is up. */
  r.get('/health', (_req, res) => {
    res.json({ status: 'ok', llm: deps.llm.enabled ? 'enabled' : 'disabled (rules-only mode)', time: new Date().toISOString() });
  });

  /** Readiness: backing services reachable. LLM outage does NOT make us unready - we degrade to rules. */
  r.get('/ready', async (_req, res) => {
    const storageOk = await deps.ready();
    res.status(storageOk ? 200 : 503).json({
      status: storageOk ? 'ready' : 'not_ready',
      storage: { type: deps.storage, ok: storageOk },
      llm: { enabled: deps.llm.enabled, circuit: deps.llm.currentState ?? 'n/a' },
    });
  });

  const openApi = buildOpenApiDocument();
  r.get('/openapi.json', (_req, res) => {
    res.json(openApi);
  });
  r.use('/docs', swaggerUi.serve, swaggerUi.setup(openApi, { customSiteTitle: 'LoanSense API docs' }));

  r.get('/auth/demo-users', (_req, res) => {
    res.json(users.list().map(({ username, displayName, persona }) => ({ username, displayName, persona })));
  });

  r.post('/auth/demo-login', loginLimiter, (req, res) => {
    const { username } = LoginSchema.parse(req.body);
    const user = users.findByUsername(username);
    if (!user) {
      res.status(401).json({ error: 'unauthorized', message: 'Unknown demo user' });
      return;
    }
    res.json({ ...issueToken(user.id), user: { username: user.username, displayName: user.displayName } });
  });

  r.get('/products', (_req, res) => {
    res.json(products);
  });

  r.post('/emi/calculate', (req, res) => {
    const b = EmiRequestSchema.parse(req.body);
    const fee = processingFee(b.principal, b.processingFeePct, 0);
    res.json({
      ...calculateEmi(b.principal, b.annualRatePct, b.tenureMonths, fee),
      ...(b.includeSchedule ? { schedule: amortizationSchedule(b.principal, b.annualRatePct, b.tenureMonths) } : {}),
    });
  });

  /* ---------- authenticated: everything below is scoped to the token's user ---------- */
  r.use(requireAuth);

  r.get('/me', (req, res) => {
    const u = users.findById(currentUserId(req));
    if (!u) throw new NotFoundError('User not found');
    res.json({ username: u.username, displayName: u.displayName, persona: u.persona });
  });

  r.get('/me/profile', async (req, res) => {
    const p = await profiles.get(currentUserId(req));
    if (!p) throw new NotFoundError('Profile not found');
    res.json(p);
  });

  r.put('/me/profile', async (req, res) => {
    const profile = ProfileSchema.parse(req.body);
    res.json(await profiles.upsert(currentUserId(req), profile));
  });

  r.post('/me/recommendations', async (req, res) => {
    const userId = currentUserId(req);
    // Optional what-if overrides are validated against the full schema but NOT persisted.
    const stored = await profiles.get(userId);
    if (!stored) throw new NotFoundError('Profile not found');
    const profile = req.body && Object.keys(req.body).length ? ProfileSchema.parse({ ...stored, ...req.body }) : stored;
    res.json({ ...recommend(profile, products), disclaimer: DISCLAIMER.en });
  });

  r.get('/me/compare', async (req, res) => {
    const { ids } = CompareSchema.parse(req.query);
    const profile = await profiles.get(currentUserId(req));
    if (!profile) throw new NotFoundError('Profile not found');
    res.json({ comparison: compareProducts(ids, profile, products), disclaimer: DISCLAIMER.en });
  });

  r.get('/me/summary', async (req, res) => {
    const { format, language } = SummaryQuerySchema.parse(req.query);
    const profile = await profiles.get(currentUserId(req));
    if (!profile) throw new NotFoundError('Profile not found');
    const result = recommend(profile, products);
    const ref = req.traceId?.slice(0, 8) ?? '';
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'md') {
      res.type('text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="loan-summary-${date}.md"`);
      res.send(buildSummaryMarkdown(result, language, ref));
    } else {
      res.type('text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="loan-summary-${date}.html"`);
      res.send(buildSummaryHtml(result, language, ref));
    }
  });

  r.get('/me/chat/sessions', async (req, res) => {
    res.json(await chats.list(currentUserId(req)));
  });

  r.post('/me/chat/sessions', async (req, res) => {
    const s = await chats.create(currentUserId(req));
    res.status(201).json({ id: s.id, createdAt: s.createdAt });
  });

  r.get('/me/chat/sessions/:id', async (req, res) => {
    const s = await chats.get(currentUserId(req), String(req.params.id));
    if (!s) throw new NotFoundError('Session not found');
    const { userId: _omit, ...rest } = s;
    res.json(rest);
  });

  r.delete('/me/chat/sessions/:id', async (req, res) => {
    const ok = await chats.delete(currentUserId(req), String(req.params.id));
    if (!ok) throw new NotFoundError('Session not found');
    res.status(204).end();
  });

  r.post('/me/chat/sessions/:id/messages', chatLimiter, async (req, res) => {
    const { message, language } = ChatMessageSchema.parse(req.body);
    const reply = await advisor.handleMessage({
      userId: currentUserId(req),
      sessionId: String(req.params.id),
      message,
      language,
      traceId: req.traceId,
    });
    res.json(reply);
  });

  return r;
}
