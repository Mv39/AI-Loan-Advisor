import { z } from 'zod';
import { PROMPT_VERSION } from '../services/prompt';
import { ChatMessageSchema, EmiRequestSchema, LoginSchema, ProfileSchema } from './schemas';

/**
 * OpenAPI 3.1 document. Request bodies are generated from the same Zod schemas
 * the routes validate with, so the docs cannot drift from runtime behaviour.
 * A test asserts every registered Express route is documented.
 */

const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const body = (schema: unknown) => ({ required: true, content: { 'application/json': { schema } } });
const err = (description: string) => json(ref('Error'), description);
const secured = { security: [{ bearerAuth: [] }] };
const authErrors = { 401: err('Missing, invalid or expired token') };
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^ses_' } };

const money = { type: 'number', description: 'INR' };

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LoanSense - AI Loan Advisor API',
      version: '1.1.0',
      description:
        'Grounded, auditable loan guidance. Eligibility, EMI and ranking are deterministic; the LLM only phrases verified facts ' +
        `(prompt ${PROMPT_VERSION}) and its output is number-checked before it is returned. All /me routes are scoped to the token's user.`,
    },
    servers: [{ url: '/api' }],
    tags: [{ name: 'Public' }, { name: 'Auth' }, { name: 'Profile & recommendations' }, { name: 'Chat' }, { name: 'Ops' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            issues: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } },
            traceId: { type: 'string' },
          },
          required: ['error'],
        },
        BorrowerProfile: jsonSchema(ProfileSchema),
        EmiRequest: jsonSchema(EmiRequestSchema),
        LoginRequest: jsonSchema(LoginSchema),
        ChatMessageRequest: jsonSchema(ChatMessageSchema),
        EmiResult: {
          type: 'object',
          properties: {
            principal: money,
            annualRatePct: { type: 'number' },
            tenureMonths: { type: 'integer' },
            emi: money,
            totalInterest: money,
            totalRepayment: money,
            processingFee: money,
            totalCostOfCredit: money,
            aprPct: { type: 'number', description: 'Annual Percentage Rate including fees (IRR)' },
          },
        },
        TenureOption: {
          type: 'object',
          properties: {
            tenureMonths: { type: 'integer' },
            emi: money,
            totalInterest: money,
            totalRepayment: money,
            foirAfterLoanPct: { type: 'number' },
            affordable: { type: 'boolean' },
          },
        },
        Recommendation: {
          type: 'object',
          properties: {
            rank: { type: 'integer' },
            productId: { type: 'string' },
            productName: { type: 'string' },
            productType: { type: 'string' },
            status: { type: 'string', enum: ['eligible', 'conditional'] },
            score: { type: 'number' },
            annualRatePct: { type: 'number' },
            emi: ref('EmiResult'),
            tenureOptions: { type: 'array', items: ref('TenureOption') },
            whyThisFits: { type: 'array', items: { type: 'string' } },
            watchOuts: { type: 'array', items: { type: 'string' } },
          },
        },
        RecommendationResult: {
          type: 'object',
          properties: {
            profile: ref('BorrowerProfile'),
            recommendations: { type: 'array', maxItems: 3, items: ref('Recommendation') },
            notEligible: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  productName: { type: 'string' },
                  reasons: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            tenureTradeoff: { type: 'array', items: { type: 'string' } },
            generatedAt: { type: 'string', format: 'date-time' },
            disclaimer: { type: 'string' },
          },
        },
        ChatMessage: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string', description: 'Always PII-redacted' },
            createdAt: { type: 'string', format: 'date-time' },
            meta: { type: 'object' },
          },
        },
        AdvisorReply: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            userMessage: ref('ChatMessage'),
            message: ref('ChatMessage'),
            source: { type: 'string', enum: ['llm', 'rules'], description: 'llm = verified AI wording; rules = deterministic fallback' },
            intent: { type: 'string', enum: ['greeting', 'compare', 'tenure', 'eligibility', 'emi', 'recommend', 'blocked'] },
            profile: ref('BorrowerProfile'),
            profileUpdates: { type: 'object' },
            recommendations: ref('RecommendationResult'),
            comparison: { type: 'array', items: { type: 'object' } },
            guardrails: {
              type: 'object',
              properties: {
                inputFlags: { type: 'array', items: { type: 'string' } },
                redactions: { type: 'array', items: { type: 'string' } },
                outputIssues: { type: 'array', items: { type: 'string' } },
                ungroundedNumbers: { type: 'array', items: { type: 'string' } },
              },
            },
            grounding: {
              type: 'object',
              properties: {
                promptVersion: { type: 'string' },
                factsHash: { type: 'string' },
                productIds: { type: 'array', items: { type: 'string' } },
              },
            },
            disclaimer: { type: 'string' },
            traceId: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/health': { get: { tags: ['Ops'], summary: 'Liveness', responses: { 200: json({ type: 'object' }) } } },
      '/ready': {
        get: {
          tags: ['Ops'],
          summary: 'Readiness (storage reachable; reports LLM circuit state)',
          responses: { 200: json({ type: 'object' }), 503: json({ type: 'object' }, 'Storage unavailable') },
        },
      },
      '/auth/demo-users': {
        get: {
          tags: ['Auth'],
          summary: 'Demo personas for the login screen',
          responses: { 200: json({ type: 'array', items: { type: 'object' } }) },
        },
      },
      '/auth/demo-login': {
        post: {
          tags: ['Auth'],
          summary: 'Mock IdP: issue a signed, expiring JWT for a demo user',
          requestBody: body(ref('LoginRequest')),
          responses: {
            200: json({
              type: 'object',
              properties: { token: { type: 'string' }, expiresIn: { type: 'integer' }, user: { type: 'object' } },
            }),
            401: err('Unknown user'),
            429: err('Rate limited'),
          },
        },
      },
      '/products': {
        get: { tags: ['Public'], summary: 'Product catalog', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } },
      },
      '/emi/calculate': {
        post: {
          tags: ['Public'],
          summary: 'EMI, total cost and APR (optionally the amortization schedule)',
          requestBody: body(ref('EmiRequest')),
          responses: { 200: json(ref('EmiResult')), 400: err('Validation error') },
        },
      },
      '/me': {
        get: {
          tags: ['Profile & recommendations'],
          summary: 'Current user',
          ...secured,
          responses: { 200: json({ type: 'object' }), ...authErrors },
        },
      },
      '/me/profile': {
        get: {
          tags: ['Profile & recommendations'],
          summary: 'Read own borrower profile',
          ...secured,
          responses: { 200: json(ref('BorrowerProfile')), ...authErrors },
        },
        put: {
          tags: ['Profile & recommendations'],
          summary: 'Replace own borrower profile',
          ...secured,
          requestBody: body(ref('BorrowerProfile')),
          responses: { 200: json(ref('BorrowerProfile')), 400: err('Validation error'), ...authErrors },
        },
      },
      '/me/recommendations': {
        post: {
          tags: ['Profile & recommendations'],
          summary: 'Ranked recommendations; optional body = what-if overrides (not persisted)',
          ...secured,
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', description: 'Partial BorrowerProfile' } } },
          },
          responses: { 200: json(ref('RecommendationResult')), 400: err('Validation error'), ...authErrors },
        },
      },
      '/me/compare': {
        get: {
          tags: ['Profile & recommendations'],
          summary: 'Side-by-side comparison for 2-4 products',
          ...secured,
          parameters: [{ name: 'ids', in: 'query', required: true, schema: { type: 'string', example: 'PL-001,TOP-001' } }],
          responses: { 200: json({ type: 'object' }), 400: err('Validation error'), ...authErrors },
        },
      },
      '/me/summary': {
        get: {
          tags: ['Profile & recommendations'],
          summary: 'Downloadable recommendation summary',
          ...secured,
          parameters: [
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['html', 'md'], default: 'html' } },
            { name: 'language', in: 'query', schema: { type: 'string', enum: ['en', 'hi'], default: 'en' } },
          ],
          responses: { 200: { description: 'File attachment', content: { 'text/html': {}, 'text/markdown': {} } }, ...authErrors },
        },
      },
      '/me/chat/sessions': {
        get: {
          tags: ['Chat'],
          summary: 'List own chat sessions',
          ...secured,
          responses: { 200: json({ type: 'array', items: { type: 'object' } }), ...authErrors },
        },
        post: {
          tags: ['Chat'],
          summary: 'Create a chat session',
          ...secured,
          responses: { 201: json({ type: 'object' }, 'Created'), ...authErrors },
        },
      },
      '/me/chat/sessions/{id}': {
        get: {
          tags: ['Chat'],
          summary: 'Read own session history',
          ...secured,
          parameters: [idParam],
          responses: { 200: json({ type: 'object' }), 404: err('Not found (or not yours)'), ...authErrors },
        },
        delete: {
          tags: ['Chat'],
          summary: 'Delete own session',
          ...secured,
          parameters: [idParam],
          responses: { 204: { description: 'Deleted' }, 404: err('Not found (or not yours)'), ...authErrors },
        },
      },
      '/me/chat/sessions/{id}/messages': {
        post: {
          tags: ['Chat'],
          summary: 'Send a message to the advisor',
          ...secured,
          parameters: [idParam],
          requestBody: body(ref('ChatMessageRequest')),
          responses: {
            200: json(ref('AdvisorReply')),
            400: err('Validation error'),
            404: err('Not found (or not yours)'),
            429: err('Rate limited'),
            ...authErrors,
          },
        },
      },
    },
  };
}
