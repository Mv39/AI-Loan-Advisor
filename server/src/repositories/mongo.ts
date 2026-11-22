import { Collection, Db, MongoClient } from 'mongodb';
import crypto from 'node:crypto';
import usersJson from '../data/users.json';
import type { BorrowerProfile } from '../domain/types';
import type { ChatMessage, ChatRepository, ChatSession, ProfileRepository } from './types';

/**
 * MongoDB repositories.
 *
 * Isolation: every filter includes `userId` (or uses it as `_id`), so even a
 * leaked/guessed session id cannot read another user's data - the same
 * guarantee the in-memory store gives, proven by the shared contract tests.
 *
 * Retention: a TTL index on `updatedAt` lets MongoDB delete idle chat sessions
 * automatically; purgeExpired() is kept for deterministic cleanup/tests.
 */

interface ProfileDoc extends BorrowerProfile {
  _id: string; // = userId
  updatedAt: Date;
}

interface SessionDoc {
  _id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
  lastComparedProductIds: string[];
}

const toSession = (d: SessionDoc): ChatSession => ({
  id: d._id,
  userId: d.userId,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
  messages: d.messages,
  lastComparedProductIds: d.lastComparedProductIds,
});

export class MongoProfileRepository implements ProfileRepository {
  constructor(private readonly col: Collection<ProfileDoc>) {}

  async get(userId: string) {
    const doc = await this.col.findOne({ _id: userId }, { projection: { _id: 0, updatedAt: 0 } });
    return (doc as BorrowerProfile | null) ?? undefined;
  }

  async upsert(userId: string, profile: BorrowerProfile) {
    // Replace (not merge) so removed optional fields (e.g. businessVintageYears) are really removed.
    await this.col.replaceOne({ _id: userId }, { ...profile, updatedAt: new Date() }, { upsert: true });
    return { ...profile };
  }

  /** Insert demo profiles only if missing - never overwrites user edits on restart. */
  async seedDemoProfiles() {
    const seeds = usersJson as { id: string; profile: BorrowerProfile }[];
    await Promise.all(
      seeds.map((u) => this.col.updateOne({ _id: u.id }, { $setOnInsert: { ...u.profile, updatedAt: new Date() } }, { upsert: true })),
    );
  }
}

export class MongoChatRepository implements ChatRepository {
  constructor(
    private readonly col: Collection<SessionDoc>,
    private readonly ttlMs: number,
    private readonly maxMessagesPerSession = 200,
  ) {}

  async create(userId: string) {
    const now = new Date();
    const doc: SessionDoc = {
      _id: `ses_${crypto.randomUUID()}`,
      userId,
      createdAt: now,
      updatedAt: now,
      messages: [],
      lastComparedProductIds: [],
    };
    await this.col.insertOne(doc);
    return toSession(doc);
  }

  async get(userId: string, sessionId: string) {
    const doc = await this.col.findOne({ _id: sessionId, userId });
    return doc ? toSession(doc) : undefined;
  }

  async list(userId: string) {
    const docs = await this.col
      .find({ userId }, { projection: { _id: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    return docs.map((d) => ({ id: d._id, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() }));
  }

  async append(userId: string, sessionId: string, ...messages: ChatMessage[]) {
    const doc = await this.col.findOneAndUpdate(
      { _id: sessionId, userId },
      {
        $push: { messages: { $each: messages, $slice: -this.maxMessagesPerSession } },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    );
    return doc ? toSession(doc) : undefined;
  }

  async setCompared(userId: string, sessionId: string, productIds: string[]) {
    await this.col.updateOne({ _id: sessionId, userId }, { $set: { lastComparedProductIds: [...productIds] } });
  }

  async delete(userId: string, sessionId: string) {
    const r = await this.col.deleteOne({ _id: sessionId, userId });
    return r.deletedCount === 1;
  }

  async purgeExpired(now = Date.now()) {
    const r = await this.col.deleteMany({ updatedAt: { $lt: new Date(now - this.ttlMs) } });
    return r.deletedCount;
  }
}

export async function ensureIndexes(db: Db, ttlMs: number): Promise<void> {
  const sessions = db.collection<SessionDoc>('chat_sessions');
  await sessions.createIndex({ userId: 1, updatedAt: -1 }, { name: 'by_user_recent' });
  await sessions.createIndex({ _id: 1, userId: 1 }, { name: 'owner_lookup' });
  await sessions.createIndex({ updatedAt: 1 }, { name: 'retention_ttl', expireAfterSeconds: Math.round(ttlMs / 1000) });
}

export interface MongoStores {
  client: MongoClient;
  profiles: MongoProfileRepository;
  chats: MongoChatRepository;
  ping: () => Promise<boolean>;
}

export async function connectMongo(uri: string, dbName: string, ttlMs: number): Promise<MongoStores> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 20, appName: 'loan-advisor' });
  await client.connect();
  const db = client.db(dbName);
  await ensureIndexes(db, ttlMs);
  const profiles = new MongoProfileRepository(db.collection<ProfileDoc>('profiles'));
  await profiles.seedDemoProfiles();
  const chats = new MongoChatRepository(db.collection<SessionDoc>('chat_sessions'), ttlMs);
  return {
    client,
    profiles,
    chats,
    ping: async () => {
      try {
        await db.command({ ping: 1 });
        return true;
      } catch {
        return false;
      }
    },
  };
}
