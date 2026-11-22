import request from 'supertest';
import { createApp } from '../src/app';
import { catalog } from '../src/domain/catalog';
import { InMemoryChatRepository, InMemoryProfileRepository, InMemoryUserDirectory } from '../src/repositories/memory';
import { buildRouter } from '../src/routes';
import { buildOpenApiDocument } from '../src/routes/openapi';
import { AdvisorService } from '../src/services/advisor.service';
import { FakeLlm } from './helpers';

const doc = buildOpenApiDocument();

function registeredRoutes(): string[] {
  const profiles = new InMemoryProfileRepository();
  const chats = new InMemoryChatRepository(60_000);
  const llm = new FakeLlm(() => 'x');
  const router = buildRouter({
    products: catalog.all(),
    users: new InMemoryUserDirectory(),
    profiles,
    chats,
    advisor: new AdvisorService(catalog.all(), profiles, chats, llm),
    llm,
    storage: 'memory',
    ready: async () => true,
  });
  const out: string[] = [];
  for (const layer of (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${layer.route.path.replace(/:(\w+)/g, '{$1}')}`);
  }
  return out.filter((r) => !r.endsWith('/openapi.json'));
}

describe('OpenAPI document', () => {
  it('documents every registered API route (docs cannot silently drift)', () => {
    const documented = Object.entries(doc.paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`));
    const routes = registeredRoutes();
    expect(routes.length).toBeGreaterThan(15);
    expect(routes.filter((r) => !documented.includes(r))).toEqual([]);
    expect(documented.filter((d) => !routes.includes(d))).toEqual([]);
  });

  it('derives request schemas from the Zod validators', () => {
    const profile = doc.components.schemas.BorrowerProfile as { required: string[]; properties: Record<string, { enum?: string[] }> };
    expect(profile.required).toEqual(
      expect.arrayContaining(['requestedAmount', 'purpose', 'monthlyIncome', 'employmentType', 'riskProfile']),
    );
    expect(profile.properties.riskProfile.enum).toEqual(['low', 'medium', 'high']);
    const chat = doc.components.schemas.ChatMessageRequest as { properties: { message: { maxLength: number } } };
    expect(chat.properties.message.maxLength).toBe(1000);
  });

  it('marks /me routes as bearer-secured', () => {
    for (const [path, ops] of Object.entries(doc.paths)) {
      if (!path.startsWith('/me')) continue;
      for (const op of Object.values(ops) as { security?: unknown }[]) expect(op.security).toEqual([{ bearerAuth: [] }]);
    }
  });

  it('serves /api/openapi.json and Swagger UI', async () => {
    const { app } = createApp({ llm: new FakeLlm(() => 'x') });
    const spec = await request(app).get('/api/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.1.0');
    const ui = await request(app).get('/api/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
  });
});
