import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

neonConfig.webSocketConstructor = WebSocket;

const globalStore = globalThis as unknown as {
  __cookpitNeonPool?: Pool;
  __cookpitNeonPoolUrl?: string;
};

export function createDb(databaseUrl: string) {
  if (
    globalStore.__cookpitNeonPool === undefined ||
    globalStore.__cookpitNeonPoolUrl !== databaseUrl
  ) {
    globalStore.__cookpitNeonPool = new Pool({ connectionString: databaseUrl, max: 1 });
    globalStore.__cookpitNeonPoolUrl = databaseUrl;
  }
  return drizzle(globalStore.__cookpitNeonPool, { schema });
}

export type DrizzleClient = ReturnType<typeof createDb>;
