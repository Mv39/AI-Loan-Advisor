import crypto from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger, hashUserId } from '../utils/logger';
import { metrics } from '../utils/metrics';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.traceId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.traceId);
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    // Route *pattern* (e.g. /me/chat/sessions/:id) keeps metric cardinality bounded.
    const route = req.route?.path ? req.baseUrl + String(req.route.path) : 'unmatched';
    metrics.httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    metrics.httpDuration.observe(ms / 1000, { route });
    // Access log: no bodies, no query strings, pseudonymous user id.
    logger.info('http', {
      traceId: req.traceId,
      method: req.method,
      path: route === 'unmatched' ? req.baseUrl + req.path : route,
      status: res.statusCode,
      ms,
      user: req.auth ? hashUserId(req.auth.userId) : undefined,
    });
  });
  next();
}

/** Financial data must never be cached by browsers or intermediaries. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      traceId: req.traceId,
    });
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
  if (status >= 500)
    logger.error('unhandled', {
      traceId: req.traceId,
      error: err?.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    });
  res.status(status).json({
    error: status >= 500 ? 'internal_error' : err?.type === 'entity.too.large' ? 'payload_too_large' : 'request_error',
    message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
    traceId: req.traceId,
  });
};
