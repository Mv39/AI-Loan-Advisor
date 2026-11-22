import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ISSUER = 'loan-advisor-demo-idp';
const AUDIENCE = 'loan-advisor-api';

export interface AuthContext {
  userId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    traceId?: string;
  }
}

/**
 * Mock identity provider: issues a short-lived HS256 JWT for a demo user.
 * In production this is replaced by an OIDC provider (Cognito/Auth0/Keycloak)
 * and the API only verifies tokens (RS256 via JWKS).
 */
export function issueToken(userId: string): { token: string; expiresIn: number } {
  const token = jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.JWT_TTL_SECONDS,
  });
  return { token, expiresIn: env.JWT_TTL_SECONDS };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
    return;
  }
  try {
    // Algorithm pinned to prevent alg-confusion ("none"/RS->HS) attacks.
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload === 'string' || !payload.sub) throw new Error('invalid subject');
    req.auth = { userId: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}

/** Use after requireAuth. Identity always comes from the verified token, never from body/query/params. */
export const currentUserId = (req: Request): string => {
  if (!req.auth) throw new Error('requireAuth middleware missing');
  return req.auth.userId;
};
