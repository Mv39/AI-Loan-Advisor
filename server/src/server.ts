import { env } from './config/env';
import { createApp, AppDeps } from './app';
import { connectMongo } from './repositories/mongo';
import { logger } from './utils/logger';

async function main() {
  const ttlMs = env.SESSION_TTL_MINUTES * 60_000;
  const deps: AppDeps = {};
  let closeStorage = async () => undefined as void;

  if (env.MONGO_URI) {
    const mongo = await connectMongo(env.MONGO_URI, env.MONGO_DB, ttlMs);
    Object.assign(deps, { profiles: mongo.profiles, chats: mongo.chats, ready: mongo.ping, storage: 'mongodb' });
    closeStorage = () => mongo.client.close();
  }

  const { app, chats } = createApp(deps);
  const server = app.listen(env.PORT, () => {
    logger.info('server.started', {
      port: env.PORT,
      llm: env.LLM_ENABLED ? 'enabled' : 'rules-only',
      storage: env.MONGO_URI ? 'mongodb' : 'memory',
    });
  });

  // Retention for the in-memory store (MongoDB additionally enforces it with a TTL index).
  const purgeTimer = setInterval(() => {
    chats.purgeExpired().then((n) => n && logger.info('chat.purged', { sessions: n }));
  }, 5 * 60_000);
  purgeTimer.unref();

  const shutdown = (signal: string) => {
    logger.info('server.stopping', { signal });
    server.close(async () => {
      await closeStorage();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('server.failed_to_start', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
