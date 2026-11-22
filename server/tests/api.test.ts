import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { FakeLlm } from './helpers';

const { app } = createApp({ llm: new FakeLlm(() => 'The Top-up Loan looks suitable. Approval depends on verification.') });

async function login(username: string) {
  const r = await request(app).post('/api/auth/demo-login').send({ username }).expect(200);
  return r.body.token as string;
}

describe('Public endpoints', () => {
  it('GET /api/health', async () => {
    const r = await request(app).get('/api/health').expect(200);
    expect(r.body.status).toBe('ok');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/products returns the catalog', async () => {
    const r = await request(app).get('/api/products').expect(200);
    expect(r.body.map((p: { type: string }) => p.type).sort()).toEqual([
      'bnpl',
      'personal_loan',
      'salary_advance',
      'secured_loan',
      'sme_loan',
      'top_up_loan',
    ]);
  });

  it('POST /api/emi/calculate computes EMI and optional schedule', async () => {
    const r = await request(app)
      .post('/api/emi/calculate')
      .send({ principal: 500000, annualRatePct: 12, tenureMonths: 36, includeSchedule: true })
      .expect(200);
    expect(r.body.emi).toBe(16607.15);
    expect(r.body.schedule).toHaveLength(36);
  });

  it('validates EMI input', async () => {
    const r = await request(app).post('/api/emi/calculate').send({ principal: -1, annualRatePct: 12, tenureMonths: 36 }).expect(400);
    expect(r.body.error).toBe('validation_error');
  });

  it('rejects unknown demo users', async () => {
    await request(app).post('/api/auth/demo-login').send({ username: 'mallory' }).expect(401);
  });

  it('rejects oversized payloads', async () => {
    await request(app)
      .post('/api/emi/calculate')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(30_000) }))
      .expect(413);
  });
});

describe('Authentication', () => {
  it('requires a bearer token', async () => {
    await request(app).get('/api/me/profile').expect(401);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = jwt.sign({}, 'attacker-secret-attacker-secret', {
      subject: 'usr_7f3a9c',
      issuer: 'loan-advisor-demo-idp',
      audience: 'loan-advisor-api',
    });
    await request(app).get('/api/me/profile').set('authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects alg=none tokens', async () => {
    const none = jwt.sign({ sub: 'usr_7f3a9c', iss: 'loan-advisor-demo-idp', aud: 'loan-advisor-api' }, '', { algorithm: 'none' });
    await request(app).get('/api/me/profile').set('authorization', `Bearer ${none}`).expect(401);
  });

  it('rejects expired tokens', async () => {
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET!, {
      subject: 'usr_7f3a9c',
      issuer: 'loan-advisor-demo-idp',
      audience: 'loan-advisor-api',
    });
    await request(app).get('/api/me/profile').set('authorization', `Bearer ${expired}`).expect(401);
  });
});

describe('Per-user data isolation', () => {
  it("returns only the caller's profile", async () => {
    const [priya, rahul] = await Promise.all([login('priya'), login('rahul')]);
    const a = await request(app).get('/api/me/profile').set('authorization', `Bearer ${priya}`).expect(200);
    const b = await request(app).get('/api/me/profile').set('authorization', `Bearer ${rahul}`).expect(200);
    expect(a.body.employmentType).toBe('salaried');
    expect(b.body.employmentType).toBe('business_owner');
  });

  it("cannot read, post to, or delete another user's chat session", async () => {
    const [priya, rahul] = await Promise.all([login('priya'), login('rahul')]);
    const s = await request(app).post('/api/me/chat/sessions').set('authorization', `Bearer ${priya}`).expect(201);
    await request(app).get(`/api/me/chat/sessions/${s.body.id}`).set('authorization', `Bearer ${rahul}`).expect(404);
    await request(app)
      .post(`/api/me/chat/sessions/${s.body.id}/messages`)
      .set('authorization', `Bearer ${rahul}`)
      .send({ message: 'hi' })
      .expect(404);
    await request(app).delete(`/api/me/chat/sessions/${s.body.id}`).set('authorization', `Bearer ${rahul}`).expect(404);
    await request(app).get(`/api/me/chat/sessions/${s.body.id}`).set('authorization', `Bearer ${priya}`).expect(200);
    const list = await request(app).get('/api/me/chat/sessions').set('authorization', `Bearer ${rahul}`).expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).not.toContain(s.body.id);
  });

  it('ignores a userId smuggled in the request body', async () => {
    const priya = await login('priya');
    await request(app).put('/api/me/profile').set('authorization', `Bearer ${priya}`).send({ userId: 'usr_2b81e4' }).expect(400);
  });
});

describe('Profile, recommendations, chat and summary', () => {
  let token: string;
  beforeAll(async () => {
    token = await login('ananya');
  });

  it('validates the profile', async () => {
    const r = await request(app)
      .put('/api/me/profile')
      .set('authorization', `Bearer ${token}`)
      .send({
        requestedAmount: 40000,
        purpose: 'consumer_purchase',
        monthlyIncome: 20000,
        existingEmi: 30000,
        preferredTenureMonths: 12,
        employmentType: 'gig_worker',
        riskProfile: 'high',
      })
      .expect(400);
    expect(r.body.issues[0].path).toBe('existingEmi');
  });

  it('returns recommendations with a disclaimer', async () => {
    const r = await request(app).post('/api/me/recommendations').set('authorization', `Bearer ${token}`).send({}).expect(200);
    expect(r.body.recommendations[0].productId).toBe('BNPL-001');
    expect(r.body.disclaimer).toMatch(/underwriting/);
  });

  it('supports what-if overrides without persisting them', async () => {
    await request(app)
      .post('/api/me/recommendations')
      .set('authorization', `Bearer ${token}`)
      .send({ preferredTenureMonths: 6 })
      .expect(200);
    const p = await request(app).get('/api/me/profile').set('authorization', `Bearer ${token}`).expect(200);
    expect(p.body.preferredTenureMonths).toBe(12);
  });

  it('compares products side by side', async () => {
    const r = await request(app).get('/api/me/compare?ids=BNPL-001,PL-001').set('authorization', `Bearer ${token}`).expect(200);
    expect(r.body.comparison).toHaveLength(2);
    expect(r.body.comparison[1].status).toBe('ineligible');
  });

  it('runs a full chat turn', async () => {
    const s = await request(app).post('/api/me/chat/sessions').set('authorization', `Bearer ${token}`).expect(201);
    const r = await request(app)
      .post(`/api/me/chat/sessions/${s.body.id}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ message: 'Which option is best for my phone purchase?' })
      .expect(200);
    expect(r.body.message.role).toBe('assistant');
    expect(r.body.source).toBe('llm');
    expect(r.body.grounding.promptVersion).toMatch(/^advisor-v/);
    const history = await request(app).get(`/api/me/chat/sessions/${s.body.id}`).set('authorization', `Bearer ${token}`).expect(200);
    expect(history.body.messages).toHaveLength(2);
    expect(history.body.userId).toBeUndefined();
  });

  it('rejects empty and overlong chat messages', async () => {
    const s = await request(app).post('/api/me/chat/sessions').set('authorization', `Bearer ${token}`).expect(201);
    await request(app)
      .post(`/api/me/chat/sessions/${s.body.id}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ message: '' })
      .expect(400);
    await request(app)
      .post(`/api/me/chat/sessions/${s.body.id}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ message: 'x'.repeat(1001) })
      .expect(400);
  });

  it('downloads a recommendation summary', async () => {
    const md = await request(app).get('/api/me/summary?format=md').set('authorization', `Bearer ${token}`).expect(200);
    expect(md.headers['content-disposition']).toMatch(/attachment; filename="loan-summary-.*\.md"/);
    expect(md.text).toContain('# Loan Recommendation Summary');
    expect(md.text).toContain('Buy Now Pay Later');
    const html = await request(app).get('/api/me/summary?format=html').set('authorization', `Bearer ${token}`).expect(200);
    expect(html.text).toContain('<table>');
  });
});
