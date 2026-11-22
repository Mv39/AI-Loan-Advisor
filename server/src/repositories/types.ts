import type { BorrowerProfile } from '../domain/types';

export interface DemoUser {
  id: string;
  username: string;
  displayName: string;
  persona: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Stored content is always PII-redacted. */
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Products the user compared last - enables "compare them again for 48 months". */
  lastComparedProductIds: string[];
}

/**
 * Every method takes the authenticated userId as its first argument and only
 * ever returns that user's data. There is intentionally no "get by id"
 * without an owner - data isolation is enforced at the repository boundary,
 * not just in route handlers. A MongoDB implementation would add
 * `{ userId }` to every filter and a compound index on (userId, _id).
 */
export interface ProfileRepository {
  get(userId: string): Promise<BorrowerProfile | undefined>;
  upsert(userId: string, profile: BorrowerProfile): Promise<BorrowerProfile>;
}

export interface ChatRepository {
  create(userId: string): Promise<ChatSession>;
  get(userId: string, sessionId: string): Promise<ChatSession | undefined>;
  list(userId: string): Promise<Pick<ChatSession, 'id' | 'createdAt' | 'updatedAt'>[]>;
  append(userId: string, sessionId: string, ...messages: ChatMessage[]): Promise<ChatSession | undefined>;
  setCompared(userId: string, sessionId: string, productIds: string[]): Promise<void>;
  delete(userId: string, sessionId: string): Promise<boolean>;
  purgeExpired(now?: number): Promise<number>;
}

export interface UserDirectory {
  findByUsername(username: string): DemoUser | undefined;
  findById(id: string): DemoUser | undefined;
  list(): DemoUser[];
}
