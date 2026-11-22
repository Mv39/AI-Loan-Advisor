import crypto from 'node:crypto';
import { redactPII } from '../services/guardrails';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Pseudonymise user ids in logs so log access != knowing who asked what. */
export const hashUserId = (id: string): string => crypto.createHash('sha256').update(id).digest('hex').slice(0, 12);

const scrub = (v: unknown): unknown => {
  if (typeof v === 'string') return redactPII(v).text;
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, scrub(val)]));
  return v;
};

const RANK: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const min = (process.env.LOG_LEVEL as Level | 'silent' | undefined) ?? (process.env.NODE_ENV === 'test' ? 'error' : 'info');
  if (RANK[level] < (RANK[min] ?? RANK.info)) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(scrub(fields) as object) });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  debug: (m: string, f?: Record<string, unknown>) => write('debug', m, f),
  info: (m: string, f?: Record<string, unknown>) => write('info', m, f),
  warn: (m: string, f?: Record<string, unknown>) => write('warn', m, f),
  error: (m: string, f?: Record<string, unknown>) => write('error', m, f),
};
