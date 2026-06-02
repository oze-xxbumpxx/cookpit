import { createDb as createInfrastructureDb, type DrizzleClient } from '@cookpit/infrastructure';

export function createDb(databaseUrl: string): DrizzleClient {
  return createInfrastructureDb(databaseUrl);
}
const databaseUrl = process.env.DATABASE_URL ?? null;

export const db: DrizzleClient | null = databaseUrl !== null ? createDb(databaseUrl) : null;

export function getDb(): DrizzleClient {
  if (db === null) {
    throw new Error('DATABASE_URL is not configured');
  }
  return db;
}
