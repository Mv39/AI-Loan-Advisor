import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { catalog } from './domain/catalog';
import { errorHandler, noStore, requestContext } from './middleware/common';
import { InMemoryChatRepository, InMemoryProfileRepository, InMemoryUserDirectory } from './repositories/memory';
import type { ChatRepository, ProfileRepository, UserDirectory } from './repositories/types';
import { buildRouter } from './routes';
import { AdvisorService } from './services/advisor.service';
import { CircuitBreakerLlmClient } from './services/circuit-breaker';
import { HttpLlmClient, LlmClient } from './services/llm.client';
import { renderMetrics } from './utils/metrics';

export interface AppDeps {
  llm?: LlmClient;
  users?: UserDirectory;
  profiles?: ProfileRepository;
  chats?: ChatRepository;
  /** Readiness probe for backing services (e.g. MongoDB ping). */
  ready?: () => Promise<boolean>;
  storage?: 'memory' | 'mongodb';
}

/** Composition root - dependencies are injectable so tests can swap the LLM and stores. */
export function createApp(deps: AppDeps = {}) {
  const llm = deps.llm ?? new CircuitBreakerLlmClient(new HttpLlmClient(), env.LLM_BREAKER_FAILURES, env.LLM_BREAKER_COOLDOWN_MS);
  const users = deps.users ?? new InMemoryUserDirectory();
  const profiles = deps.profiles ?? new InMemoryProfileRepository();
  const chats = deps.chats ?? new InMemoryChatRepository(env.SESSION_TTL_MINUTES * 60_000);
  const products = catalog.all();
  const advisor = new AdvisorService(products, profiles, chats, llm);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '20kb' }));
  app.use(requestContext);
  if (env.METRICS_ENABLED) {
    // Prometheus scrape endpoint. In production expose only on the internal network / via ingress allowlist.
    app.get('/metrics', (_req, res) => {
      res.type('text/plain; version=0.0.4').send(renderMetrics());
    });
  }
  app.use(
    '/api',
    noStore,
    buildRouter({
      products,
      users,
      profiles,
      chats,
      advisor,
      llm,
      storage: deps.storage ?? 'memory',
      ready: deps.ready ?? (async () => true),
    }),
  );
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Serve the built Angular app if present (single-container deployment).
  const webDir = path.resolve(__dirname, '../../client/dist/client/browser');
  if (fs.existsSync(webDir)) {
    app.use(
      helmet.contentSecurityPolicy({
        directives: { 'default-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:'] },
      }),
    );
    app.use(express.static(webDir, { index: 'index.html', maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
  }

  app.use(errorHandler);
  return { app, chats };
}
