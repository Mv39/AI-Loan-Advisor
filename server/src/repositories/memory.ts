import crypto from 'node:crypto';
import usersJson from '../data/users.json';
import type { BorrowerProfile } from '../domain/types';
import type { ChatMessage, ChatRepository, ChatSession, DemoUser, ProfileRepository, UserDirectory } from './types';

const clone = <T>(v: T): T => structuredClone(v);
type SeedUser = DemoUser & { profile: BorrowerProfile };
const seed = usersJson as SeedUser[];

export class InMemoryUserDirectory implements UserDirectory {
  private readonly users: DemoUser[] = seed.map(({ profile: _p, ...u }) => u);
  findByUsername(username: string) {
    return this.users.find((u) => u.username === username.toLowerCase());
  }
  findById(id: string) {
    return this.users.find((u) => u.id === id);
  }
  list() {
    return this.users.map(clone);
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly store = new Map<string, BorrowerProfile>(seed.map((u) => [u.id, clone(u.profile)]));
  async get(userId: string) {
    const p = this.store.get(userId);
    return p ? clone(p) : undefined;
  }
  async upsert(userId: string, profile: BorrowerProfile) {
    this.store.set(userId, clone(profile));
    return clone(profile);
  }
}

export class InMemoryChatRepository implements ChatRepository {
  /** Partitioned by user: userId -> (sessionId -> session). */
  private readonly store = new Map<string, Map<string, ChatSession>>();
  constructor(
    private readonly ttlMs: number,
    private readonly maxMessagesPerSession = 200,
  ) {}

  private bucket(userId: string) {
    let b = this.store.get(userId);
    if (!b) {
      b = new Map();
      this.store.set(userId, b);
    }
    return b;
  }

  async create(userId: string) {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: `ses_${crypto.randomUUID()}`,
      userId,
      createdAt: now,
      updatedAt: now,
      messages: [],
      lastComparedProductIds: [],
    };
    this.bucket(userId).set(session.id, session);
    return clone(session);
  }

  async get(userId: string, sessionId: string) {
    const s = this.store.get(userId)?.get(sessionId);
    return s ? clone(s) : undefined;
  }

  async list(userId: string) {
    return Array.from(this.store.get(userId)?.values() ?? []).map(({ id, createdAt, updatedAt }) => ({ id, createdAt, updatedAt }));
  }

  async append(userId: string, sessionId: string, ...messages: ChatMessage[]) {
    const s = this.store.get(userId)?.get(sessionId);
    if (!s) return undefined;
    s.messages.push(...messages);
    if (s.messages.length > this.maxMessagesPerSession) s.messages.splice(0, s.messages.length - this.maxMessagesPerSession);
    s.updatedAt = new Date().toISOString();
    return clone(s);
  }

  async setCompared(userId: string, sessionId: string, productIds: string[]) {
    const s = this.store.get(userId)?.get(sessionId);
    if (s) s.lastComparedProductIds = [...productIds];
  }

  async delete(userId: string, sessionId: string) {
    return this.store.get(userId)?.delete(sessionId) ?? false;
  }

  async purgeExpired(now = Date.now()) {
    let purged = 0;
    for (const bucket of this.store.values()) {
      for (const [id, s] of bucket) {
        if (now - Date.parse(s.updatedAt) > this.ttlMs) {
          bucket.delete(id);
          purged++;
        }
      }
    }
    return purged;
  }
}
