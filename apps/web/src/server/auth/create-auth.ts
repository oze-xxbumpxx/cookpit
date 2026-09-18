import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { authSchema, type DrizzleClient } from '@cookpit/infrastructure';

/**
 * `createAuth()` に渡すオプション。`db`/`secret`/`baseURL` 以外は環境非依存の固定値
 * （このファイルは `server-only` を import しない。CLI generate（`cli.config.ts`）と
 * スクリプト（`scripts/auth-*.ts`）から同じ関数を再利用するため）。
 */
export interface CreateAuthOptions {
  db: DrizzleClient;
  /** `null` は Better Auth 既定（dev 用の警告付きフォールバック値）に委ねる。production では必ず渡すこと。 */
  secret: string | null;
  /** `null` はリクエストからの推定に委ねる（Preview / local。D-12）。 */
  baseURL: string | null;
  trustedOrigins: string[];
  /** `true` はスクリプト専用。HTTP 経由のサインアップ（`POST /api/auth/sign-up/email`）は常に閉鎖する。 */
  allowSignUp: boolean;
  /** `rateLimit.storage`。Step 0-5 の検証結果に応じて 'database' か 'memory' を渡す。 */
  rateLimitStorage: 'database' | 'memory';
}

/**
 * Better Auth インスタンスの純粋ファクトリ。env を読まない（読み取りは
 * `apps/web/src/server/auth/index.ts` の責務）。
 */
export function createAuth(o: CreateAuthOptions) {
  return betterAuth({
    ...(o.secret !== null ? { secret: o.secret } : {}),
    ...(o.baseURL !== null ? { baseURL: o.baseURL } : {}),
    basePath: '/api/auth',
    trustedOrigins: o.trustedOrigins,
    database: drizzleAdapter(o.db, { provider: 'pg', schema: authSchema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !o.allowSignUp,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: { enabled: true, storage: o.rateLimitStorage },
    advanced: {
      cookiePrefix: 'cookpit',
      // Vercel が付与しクライアントからは上書きできないヘッダを優先する（SEC-2）。既定の
      // x-forwarded-for 単独は多段プロキシ・詐称で複数値になり得、Better Auth は複数値の
      // ヘッダを一切信頼しないため getIP() が null に落ち、全利用者共有の 1 バケットへ退避する
      // （総当たり制限の実質無効化、または正規ログインの巻き添え 429 のどちらかを招く）。
      ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for'] },
    },
    plugins: [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
