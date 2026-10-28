import { loadConfig } from './config.ts';
import { mailerFromEnv } from './mailer.ts';
import { createMemoryStore } from './store-memory.ts';
import { createMysqlStore } from './store-mysql.ts';
import { createService, type LiteService } from './service.ts';
import type { Store } from './store.ts';

// Builds the service once per server process from the environment. In production it needs LITE_SECRET, MYSQL_URL,
// RESEND_API_KEY and MAIL_FROM; without them the endpoints answer demo_unavailable instead of half working.

interface Holder {
  service?: Promise<LiteService | null>;
  memory?: Store;
}
const holder = ((globalThis as { __liteRuntime?: Holder }).__liteRuntime ??= {});

function chooseStore(env: NodeJS.ProcessEnv): Store | null {
  const production = env.NODE_ENV === 'production';
  if (!production && env.LITE_STORE === 'memory') return (holder.memory ??= createMemoryStore());
  return env.MYSQL_URL ? createMysqlStore(env.MYSQL_URL) : null;
}

async function build(): Promise<LiteService | null> {
  const config = loadConfig();
  if (!config.secret) {
    console.error('lite: LITE_SECRET is not set (16+ characters required in production); the demo is disabled');
    return null;
  }
  const store = chooseStore(process.env);
  if (!store) {
    console.error('lite: MYSQL_URL is not set; the demo is disabled');
    return null;
  }
  try {
    await store.migrate();
  } catch (e) {
    console.error(`lite: database setup failed (${(e as Error).name}); the demo is disabled until it works`);
    return null;
  }
  const mailer = mailerFromEnv();
  if (!mailer) console.error('lite: no mailer (RESEND_API_KEY and MAIL_FROM); the demo is disabled');
  return createService({ store, mailer, config });
}

/** Null when the lite backend is not configured. A failed setup is retried on the next request. */
export async function getService(): Promise<LiteService | null> {
  const pending = (holder.service ??= build());
  const service = await pending;
  if (!service || !service.available()) holder.service = undefined;
  return service;
}

export { loadConfig };
