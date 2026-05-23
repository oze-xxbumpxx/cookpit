import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from 'drizzle-kit';

const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

export default {
  schema: '../../packages/infrastructure/src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
