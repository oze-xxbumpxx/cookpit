import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

neonConfig.webSocketConstructor = WebSocket;

const globalStore = globalThis as unknown as {
  __cookpitNeonPool?: Pool;
  __cookpitNeonPoolUrl?: string;
};

const CONNECTION_TIMEOUT_MS = 5_000;

export function createDb(databaseUrl: string) {
  if (
    globalStore.__cookpitNeonPool === undefined ||
    globalStore.__cookpitNeonPoolUrl !== databaseUrl
  ) {
    const previous = globalStore.__cookpitNeonPool;
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });
    pool.on('error', (err: Error) => {
      // eslint-disable-next-line no-console -- 接続層にロガーが無く、未捕捉例外を防ぐには listener が必要
      console.error('neon pool error', err.message);
    });
    globalStore.__cookpitNeonPool = pool;
    globalStore.__cookpitNeonPoolUrl = databaseUrl;
    if (previous !== undefined) {
      void previous.end().catch(() => undefined);
    }
  }
  return drizzle(globalStore.__cookpitNeonPool, { schema });
}

export type DrizzleClient = ReturnType<typeof createDb>;
