import 'server-only';
import { getDb } from '@/db/client';
import { createAuth, type Auth } from './create-auth';

/**
 * `BETTER_AUTH_SECRET` が設定されているか。`false` の間は `getAuth()` を一度も呼ばない
 * 経路（Proxy の dev スキップ、Step 3）で使う。
 */
export function isAuthConfigured(): boolean {
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret !== undefined && secret !== '';
}

function vercelOrigins(): string[] {
  return [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter((host): host is string => host !== undefined && host !== '')
    .map((host) => `https://${host}`);
}

let instance: Auth | null = null;

/**
 * Better Auth インスタンスの遅延シングルトン。`isAuthConfigured()` が `false` の間は
 * 呼び出し側（Proxy）が早期リターンするため一度も評価されない。
 *
 * @throws Error `DATABASE_URL` が未設定（`getDb()` 経由）
 */
export function getAuth(): Auth {
  instance ??= createAuth({
    db: getDb(),
    secret: process.env.BETTER_AUTH_SECRET ?? null,
    baseURL: process.env.BETTER_AUTH_URL ?? null,
    trustedOrigins: vercelOrigins(),
    allowSignUp: false,
    rateLimitStorage: 'database',
  });
  return instance;
}
