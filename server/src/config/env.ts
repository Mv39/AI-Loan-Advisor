import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Load .env without an extra dependency (Node >= 20.12 supports process.loadEnvFile).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const boolish = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : !['false', '0', 'no', 'off'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LLM_BASE_URL: z.string().url().default('https://llm-wrapper-741152993481.asia-south1.run.app'),
  LLM_API_TOKEN: z.string().default(''),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  LLM_ENABLED: boolish,
  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  CORS_ORIGINS: z.string().default('http://localhost:4200'),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  // Optional: when set, profiles and chat sessions are persisted in MongoDB (else in-memory).
  MONGO_URI: z.string().optional(),
  MONGO_DB: z.string().default('loan_advisor'),
  LLM_BREAKER_FAILURES: z.coerce.number().int().min(1).default(3),
  LLM_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).default(30000),
  METRICS_ENABLED: boolish,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast on misconfiguration - never start with an invalid security config.
  console.error('Invalid environment configuration', z.treeifyError(parsed.error));
  process.exit(1);
}

const raw = parsed.data;

if (raw.NODE_ENV === 'production' && raw.JWT_SECRET.startsWith('dev-only')) {
  console.error('JWT_SECRET must be set in production');
  process.exit(1);
}

export const env = {
  ...raw,
  // LLM is used only when enabled AND a token is present; otherwise deterministic fallback.
  LLM_ENABLED: (raw.LLM_ENABLED ?? true) && raw.LLM_API_TOKEN.length > 0,
  METRICS_ENABLED: raw.METRICS_ENABLED ?? true,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export type Env = typeof env;
