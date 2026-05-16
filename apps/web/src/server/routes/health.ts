import { Hono } from 'hono';
import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

export const healthRoute = new Hono().get('/', async (c) => {
  if (!db) {
    return c.json({
      status: 'ok',
      db: 'disconnected (no DATABASE_URL)',
      timestamp: new Date().toISOString(),
    });
  }
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'ok', db: 'error', timestamp: new Date().toISOString() });
  }
});
