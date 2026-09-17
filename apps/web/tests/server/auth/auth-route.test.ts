import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { authSchema } from '@cookpit/infrastructure';
import type { DrizzleClient } from '@cookpit/infrastructure';
import { drizzle } from 'drizzle-orm/pglite';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
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

// IT-H-06/07/08/09/12/13（B-01）: HTTP 面（handler 直叩き）の結合試験。Origin 検査・
// レート制限・Set-Cookie の失効属性は `.api.*` の直接呼び出し（Request を経由しない）では
// 再現できないため、reviewer が実証した createAuth(...).handler(new Request(...)) を使う
// （`docs/reviews/better-auth-login.md` EV-03〜EV-06）。
describe('IT-H: /api/auth/* HTTP 面（handler 直叩き。PGlite 実結合）', () => {
  const BASE_URL = 'https://auth-http-test.example';
  const SECRET = 'it-h-http-test-secret-it-h-http-test-32';
  const EMAIL = 'http-user@example.test';
  const PASSWORD = 'it-h-http-password-1234';

  let pglite: PGlite;
  let rawDb: ReturnType<typeof drizzle>;
  let auth: ReturnType<typeof createAuth>;

  beforeEach(async () => {
    pglite = new PGlite();
    await applyMigrations(pglite);
    rawDb = drizzle(pglite, { schema: authSchema });
    const db = rawDb as unknown as DrizzleClient;
    const setupAuth = createAuth({
      db,
      secret: SECRET,
      baseURL: BASE_URL,
      trustedOrigins: [BASE_URL],
      allowSignUp: true,
      rateLimitStorage: 'database',
    });
    await setupAuth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: 'HTTP太郎' },
    });
    auth = createAuth({
      db,
      secret: SECRET,
      baseURL: BASE_URL,
      trustedOrigins: [BASE_URL],
      allowSignUp: false,
      rateLimitStorage: 'database',
    });
  });

  afterEach(async () => {
    await pglite.close();
  });

  function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
    return new Request(`${BASE_URL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, ...headers },
      body: JSON.stringify(body),
    });
  }

  function cookieHeaderFrom(setCookies: string[]): string {
    return setCookies.map((c) => c.split(';')[0]).join('; ');
  }

  /** `session_data`（キャッシュ）を落とし `session_token` だけにする。DB 再検証を強制するため。 */
  function sessionTokenOnly(cookie: string): string {
    return cookie
      .split('; ')
      .filter((pair) => pair.includes('session_token'))
      .join('; ');
  }

  async function signIn(
    email = EMAIL,
    password = PASSWORD,
  ): Promise<{ res: Response; cookie: string }> {
    const res = await auth.handler(jsonRequest('/sign-in/email', { email, password }));
    const cookie = cookieHeaderFrom(res.headers.getSetCookie());
    return { res, cookie };
  }

  it('IT-H-06: sign-in の Set-Cookie 属性、sign-out での両 Cookie 失効・DB 行削除', async () => {
    const { res: signInRes, cookie } = await signIn();
    expect(signInRes.status).toBe(200);
    const sessionCookie = signInRes.headers.getSetCookie().find((c) => c.includes('session_token'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('Max-Age=2592000');

    const rowsBefore = await rawDb.select().from(authSchema.sessions);
    expect(rowsBefore.length).toBe(1);

    const signOutRes = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { origin: BASE_URL, cookie },
      }),
    );
    expect(signOutRes.status).toBe(200);
    const signOutCookies = signOutRes.headers.getSetCookie();
    expect(signOutCookies.find((c) => c.includes('session_token'))).toContain('Max-Age=0');
    expect(signOutCookies.find((c) => c.includes('session_data'))).toContain('Max-Age=0');

    const rowsAfter = await rawDb.select().from(authSchema.sessions);
    expect(rowsAfter.length).toBe(0);
  });

  it('IT-H-24: 未ログイン状態での sign-out は例外を投げず完了する（冪等性）', async () => {
    const res = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { origin: BASE_URL },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('IT-H-07: change-password 正常 → 新パスワードで再ログインでき旧パスワードは失敗する', async () => {
    const { cookie } = await signIn();

    const res = await auth.handler(
      jsonRequest(
        '/change-password',
        {
          currentPassword: PASSWORD,
          newPassword: 'new-http-password-1234',
          revokeOtherSessions: true,
        },
        { cookie },
      ),
    );
    expect(res.status).toBe(200);

    const newLogin = await auth.handler(
      jsonRequest('/sign-in/email', { email: EMAIL, password: 'new-http-password-1234' }),
    );
    expect(newLogin.status).toBe(200);

    const oldLogin = await auth.handler(
      jsonRequest('/sign-in/email', { email: EMAIL, password: PASSWORD }),
    );
    expect(oldLogin.ok).toBe(false);
  });

  it('IT-H-08: change-password の現在パスワード誤りは拒否され、パスワードは変更されない', async () => {
    const { cookie } = await signIn();

    const res = await auth.handler(
      jsonRequest(
        '/change-password',
        { currentPassword: 'wrong-current-password', newPassword: 'new-http-password-1234' },
        { cookie },
      ),
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const stillOldLogin = await auth.handler(
      jsonRequest('/sign-in/email', { email: EMAIL, password: PASSWORD }),
    );
    expect(stillOldLogin.status).toBe(200);
  });

  it('IT-H-09: revoke-other-sessions で他端末のセッションのみ失効し自端末は継続する', async () => {
    const deviceA = await signIn();
    const deviceB = await signIn();
    const rowsBefore = await rawDb.select().from(authSchema.sessions);
    expect(rowsBefore.length).toBe(2);

    const res = await auth.handler(
      new Request(`${BASE_URL}/api/auth/revoke-other-sessions`, {
        method: 'POST',
        headers: { origin: BASE_URL, cookie: deviceA.cookie },
      }),
    );
    expect(res.status).toBe(200);

    const rowsAfter = await rawDb.select().from(authSchema.sessions);
    expect(rowsAfter.length).toBe(1);

    // session_data（キャッシュ）を落として DB 再検証を強制し、B 端末が本当に失効したことを確認する。
    const deviceBSession = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: sessionTokenOnly(deviceB.cookie) },
      }),
    );
    expect(await deviceBSession.json()).toBeNull();

    const deviceASession = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: sessionTokenOnly(deviceA.cookie) },
      }),
    );
    expect(await deviceASession.json()).not.toBeNull();
  });

  it('IT-H-12: 短時間の連続 sign-in 試行はレート制限され、閾値超過分が 429 になる', async () => {
    const attempt = (): Promise<Response> =>
      auth.handler(
        jsonRequest('/sign-in/email', { email: EMAIL, password: 'wrong-password-xxxx' }),
      );

    const first = await attempt();
    const second = await attempt();
    const third = await attempt();
    const fourth = await attempt();

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(401);
    expect(fourth.status).toBe(429);
  });

  it('IT-H-13: trustedOrigins に含まれない Origin からの POST は拒否される', async () => {
    // Better Auth は advanced.disableOriginCheck 未指定時、NODE_ENV==='test' なら
    // 既定で Origin 検査自体をスキップする（isTest() ショートカット。better-auth の
    // env 判定はモジュール読み込み時に一度だけ確定するため vi.stubEnv では上書きできない）。
    // 本番（createAuth() は disableOriginCheck を設定しない）では isTest() が false になり
    // 常に検査されるため、ここだけ明示的に disableOriginCheck: false を指定して同じ経路を
    // vitest 上で再現する（production コードの `create-auth.ts` は変更しない）。
    const db = rawDb as unknown as DrizzleClient;
    const prodAuth = betterAuth({
      secret: SECRET,
      baseURL: BASE_URL,
      basePath: '/api/auth',
      trustedOrigins: [BASE_URL],
      database: drizzleAdapter(db, { provider: 'pg', schema: authSchema, usePlural: true }),
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
      },
      rateLimit: { enabled: true, storage: 'database' },
      advanced: { cookiePrefix: 'cookpit', disableOriginCheck: false },
    });

    const res = await prodAuth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('INVALID_ORIGIN');
  });
});

// SEC-2: rate_limits.key の IP 解決（`docs/reviews/better-auth-login.security.md` SEC-2）。
// reviewer が実証した `createAuth(...).handler(new Request(...))` による HTTP 面の直叩きで
// 検証する（`.api.*` 直接呼び出しは Request オブジェクトを経由しないため getIP() の
// ヘッダ解決を再現できない）。
describe('SEC-2: レート制限のキーが x-vercel-forwarded-for で IP 別に分離される', () => {
  const BASE_URL = 'https://auth-sec2-test.example';

  it('多段 x-forwarded-for があっても x-vercel-forwarded-for を優先し、rate_limits.key が IP 別の行になる', async () => {
    const pglite = new PGlite();
    try {
      await applyMigrations(pglite);
      const rawDb = drizzle(pglite, { schema: authSchema });
      const db = rawDb as unknown as DrizzleClient;
      const auth = createAuth({
        db,
        secret: 'sec-2-test-secret-sec-2-test-secret-32',
        baseURL: BASE_URL,
        trustedOrigins: [BASE_URL],
        allowSignUp: false,
        rateLimitStorage: 'database',
      });

      const signInRequest = (ip: string): Request =>
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: BASE_URL,
            // 多段プロキシ・詐称を模した複数値。Better Auth はこれ単独では信頼しない
            // （getIPFromHeader は trustedProxies 未設定時、複数値ヘッダを null に落とす）。
            'x-forwarded-for': `${ip}, 10.0.0.1`,
            // Vercel が付与しクライアントからは上書きできないヘッダ（想定）。ipAddressHeaders
            // でこちらを先に見るため、上の多段ヘッダに関わらず ip が解決される（SEC-2 修正）。
            'x-vercel-forwarded-for': ip,
          },
          body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-xxxx' }),
        });

      await auth.handler(signInRequest('203.0.113.10'));
      await auth.handler(signInRequest('203.0.113.20'));

      const rows = await rawDb.select().from(authSchema.rateLimits);
      const keys = rows.map((row) => row.key);

      expect(keys.some((key) => key.startsWith('203.0.113.10|'))).toBe(true);
      expect(keys.some((key) => key.startsWith('203.0.113.20|'))).toBe(true);
      // 修正前は複数値ヘッダが信頼されず、両リクエストが同一の共有バケットへ落ちていた。
      expect(keys.some((key) => key.startsWith('no-trusted-ip'))).toBe(false);
    } finally {
      await pglite.close();
    }
  });
});
