import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { authSchema } from '@cookpit/infrastructure';
import type { DrizzleClient } from '@cookpit/infrastructure';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';
import { createAuth } from '@/server/auth/create-auth';
import { getAuth } from '@/server/auth';

vi.mock('@/db/client', () => ({
  db: null,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@/server/auth', () => ({
  getAuth: vi.fn(),
  isAuthConfigured: vi.fn(() => true),
}));

describe('IT-H: /api/auth/* マウント（@/server/auth をモック）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('IT-H-01: GET /api/auth/ok がモックした handler に到達し応答が透過する', async () => {
    const handler = vi.fn<(request: Request) => Promise<Response>>(async () =>
      Response.json({ ok: true }),
    );
    vi.mocked(getAuth).mockReturnValue({ handler } as unknown as ReturnType<typeof getAuth>);

    const res = await app.request('/api/auth/ok');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    const calledRequest = handler.mock.calls[0]?.[0];
    expect(calledRequest?.url).toContain('/api/auth/ok');
  });

  it('IT-H-01b: POST /api/auth/sign-in/email もモックした handler に到達する', async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    vi.mocked(getAuth).mockReturnValue({ handler } as unknown as ReturnType<typeof getAuth>);

    const res = await app.request('/api/auth/sign-in/email', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('既存ルート（/api/health 等）は無変更のまま到達する（罠5の回帰確認）', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
  });
});

/**
 * `apps/web/src/db/migrations/*.sql` を journal 順に PGlite へ適用する。
 * `scripts/setup-pglite-dev.mjs` と同じロジック（実装計画は専用ヘルパーへの
 * 切り出しを許容しているが、新規ファイルは実装計画の承認一覧に限るためインライン化する）。
 */
async function applyMigrations(pglite: PGlite): Promise<void> {
  const migrationsDir = new URL('../../../src/db/migrations', import.meta.url);
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', `${migrationsDir}/`), 'utf8'),
  ) as { entries: Array<{ tag: string }> };

  for (const entry of journal.entries) {
    const sql = readFileSync(new URL(`${entry.tag}.sql`, `${migrationsDir}/`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await pglite.exec(trimmed);
    }
  }
}

// 0-4（Step 0 スパイク）で `drizzle-orm/pglite` 上のアダプタ疎通を確認済みのため実施する。
describe('IT-H: PGlite 実結合（createAuth() を直接構築）', () => {
  let pglite: PGlite;

  beforeEach(async () => {
    pglite = new PGlite();
    await applyMigrations(pglite);
  });

  afterEach(async () => {
    await pglite.close();
  });

  it('IT-H-02: allowSignUp:false のインスタンスでは sign-up/email が拒否される', async () => {
    const db = drizzle(pglite, { schema: authSchema }) as unknown as DrizzleClient;
    const closedAuth = createAuth({
      db,
      secret: 'it-h-test-secret-it-h-test-secret-32',
      baseURL: null,
      trustedOrigins: [],
      allowSignUp: false,
      rateLimitStorage: 'memory',
    });

    await expect(
      closedAuth.api.signUpEmail({
        body: { email: 'closed@example.test', password: 'it-h-test-password-1234', name: 'x' },
      }),
    ).rejects.toThrow();
  });

  it('IT-H-03/IT-H-10: allowSignUp:true でサインアップ→サインインが 200 + Set-Cookie', async () => {
    const db = drizzle(pglite, { schema: authSchema }) as unknown as DrizzleClient;
    const openAuth = createAuth({
      db,
      secret: 'it-h-test-secret-it-h-test-secret-32',
      baseURL: null,
      trustedOrigins: [],
      allowSignUp: true,
      rateLimitStorage: 'memory',
    });

    await openAuth.api.signUpEmail({
      body: {
        email: 'it-h-user@example.test',
        password: 'it-h-test-password-1234',
        name: 'テスト太郎',
      },
    });

    const signIn = await openAuth.api.signInEmail({
      body: { email: 'it-h-user@example.test', password: 'it-h-test-password-1234' },
      returnHeaders: true,
    });

    const setCookies = signIn.headers.getSetCookie();
    expect(setCookies.length).toBeGreaterThan(0);
    expect(setCookies.some((c) => c.includes('cookpit.session_token'))).toBe(true);
    expect(signIn.response.user.email).toBe('it-h-user@example.test');
  });

  it('IT-H-04: 誤パスワードは 401 相当のエラーで拒否される（列挙防止）', async () => {
    const db = drizzle(pglite, { schema: authSchema }) as unknown as DrizzleClient;
    const openAuth = createAuth({
      db,
      secret: 'it-h-test-secret-it-h-test-secret-32',
      baseURL: null,
      trustedOrigins: [],
      allowSignUp: true,
      rateLimitStorage: 'memory',
    });
    await openAuth.api.signUpEmail({
      body: {
        email: 'it-h-user-2@example.test',
        password: 'it-h-test-password-1234',
        name: 'テスト花子',
      },
    });

    await expect(
      openAuth.api.signInEmail({
        body: { email: 'it-h-user-2@example.test', password: 'wrong-password-xxxx' },
      }),
    ).rejects.toThrow();
  });
});
