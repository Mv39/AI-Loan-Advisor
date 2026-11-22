import type { ChatMessage, ChatRepository, ProfileRepository } from '../src/repositories/types';
import { InMemoryChatRepository, InMemoryProfileRepository } from '../src/repositories/memory';
import { connectMongo, MongoStores } from '../src/repositories/mongo';
import { baseProfile } from './helpers';

/**
 * One behavioural contract, run against every storage implementation, so
 * isolation/retention guarantees cannot silently differ between in-memory and
 * MongoDB. The Mongo run executes in CI against a real mongo:7 service
 * (set MONGO_URI_TEST locally to run it too).
 */

const TTL = 60_000;
const ALICE = 'usr_alice';
const BOB = 'usr_bob';
const msg = (content: string): ChatMessage => ({ id: content, role: 'user', content, createdAt: new Date().toISOString() });

interface Stores {
  profiles: ProfileRepository;
  chats: ChatRepository;
}

function contract(name: string, setup: () => Promise<Stores>, teardown: () => Promise<void> = async () => undefined) {
  describe(`Repository contract: ${name}`, () => {
    let s: Stores;
    beforeEach(async () => {
      s = await setup();
    });
    afterAll(teardown);

    it('upserts and reads profiles per user', async () => {
      await s.profiles.upsert(ALICE, baseProfile({ requestedAmount: 111111 }));
      await s.profiles.upsert(BOB, baseProfile({ requestedAmount: 222222 }));
      expect((await s.profiles.get(ALICE))?.requestedAmount).toBe(111111);
      expect((await s.profiles.get(BOB))?.requestedAmount).toBe(222222);
      expect(await s.profiles.get('usr_nobody')).toBeUndefined();
    });

    it('replaces the profile (removed optional fields disappear)', async () => {
      await s.profiles.upsert(ALICE, baseProfile({ businessVintageYears: 5 }));
      await s.profiles.upsert(ALICE, baseProfile());
      expect((await s.profiles.get(ALICE))?.businessVintageYears).toBeUndefined();
    });

    it('returns copies, not live references', async () => {
      await s.profiles.upsert(ALICE, baseProfile());
      const p = (await s.profiles.get(ALICE))!;
      p.requestedAmount = 1;
      expect((await s.profiles.get(ALICE))!.requestedAmount).not.toBe(1);
    });

    it('creates sessions owned by the caller', async () => {
      const ses = await s.chats.create(ALICE);
      expect(ses.id).toMatch(/^ses_/);
      expect((await s.chats.get(ALICE, ses.id))?.userId).toBe(ALICE);
    });

    it("never exposes another user's session (get / append / setCompared / delete / list)", async () => {
      const ses = await s.chats.create(ALICE);
      expect(await s.chats.get(BOB, ses.id)).toBeUndefined();
      expect(await s.chats.append(BOB, ses.id, msg('intrusion'))).toBeUndefined();
      await s.chats.setCompared(BOB, ses.id, ['PL-001']);
      expect(await s.chats.delete(BOB, ses.id)).toBe(false);
      expect((await s.chats.list(BOB)).map((x) => x.id)).not.toContain(ses.id);
      const own = (await s.chats.get(ALICE, ses.id))!;
      expect(own.messages).toHaveLength(0);
      expect(own.lastComparedProductIds).toEqual([]);
    });

    it('appends messages in order and tracks compared products', async () => {
      const ses = await s.chats.create(ALICE);
      await s.chats.append(ALICE, ses.id, msg('one'), msg('two'));
      await s.chats.append(ALICE, ses.id, msg('three'));
      await s.chats.setCompared(ALICE, ses.id, ['PL-001', 'TOP-001']);
      const got = (await s.chats.get(ALICE, ses.id))!;
      expect(got.messages.map((m) => m.content)).toEqual(['one', 'two', 'three']);
      expect(got.lastComparedProductIds).toEqual(['PL-001', 'TOP-001']);
    });

    it('deletes own sessions', async () => {
      const ses = await s.chats.create(ALICE);
      expect(await s.chats.delete(ALICE, ses.id)).toBe(true);
      expect(await s.chats.get(ALICE, ses.id)).toBeUndefined();
    });

    it('purges sessions idle longer than the TTL', async () => {
      const ses = await s.chats.create(ALICE);
      expect(await s.chats.purgeExpired(Date.now() + TTL + 1000)).toBeGreaterThanOrEqual(1);
      expect(await s.chats.get(ALICE, ses.id)).toBeUndefined();
    });
  });
}

contract('in-memory', async () => ({ profiles: new InMemoryProfileRepository(), chats: new InMemoryChatRepository(TTL) }));

const mongoUri = process.env.MONGO_URI_TEST;
if (mongoUri) {
  const dbName = `loan_advisor_test_${Date.now()}`;
  let stores: MongoStores | undefined;
  contract(
    'mongodb',
    async () => {
      // One client for the suite; wipe collections between tests.
      stores ??= await connectMongo(mongoUri, dbName, TTL);
      const db = stores.client.db(dbName);
      await Promise.all([db.collection('profiles').deleteMany({}), db.collection('chat_sessions').deleteMany({})]);
      return stores;
    },
    async () => {
      if (!stores) return;
      await stores.client.db(dbName).dropDatabase();
      await stores.client.close();
    },
  );
} else {
  describe.skip('Repository contract: mongodb (set MONGO_URI_TEST to run)', () => {
    it('skipped', () => undefined);
  });
}
