import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { authSchema } from '@cookpit/infrastructure';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth } from '@/server/auth/create-auth';

/**
 * `apps/web/src/db/migrations/*.sql` を journal 順に PGlite へ適用する。
 * `scripts/setup-pglite-dev.mjs` と同じロジック（新規ヘルパーファイルは実装計画の
 * 承認一覧に無いためインライン化する。§14 の位置づけは `auth-route.test.ts` と同じ）。
 */
async function applyMigrations(dataDir: string): Promise<void> {
  const pglite = new PGlite(dataDir);
  const migrationsDir = new URL('../../src/db/migrations', import.meta.url);
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
  await pglite.close();
}

function runScript(
  script: 'auth-create-user' | 'auth-set-password',
  env: Record<string, string>,
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('pnpm', ['exec', 'tsx', `scripts/${script}.ts`], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status ?? 1, stdout: e.stdout, stderr: e.stderr };
  }
}

describe('IT-S: auth-create-user / auth-set-password（実サブプロセス実行）', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cookpit-auth-script-'));
    await applyMigrations(dataDir);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('IT-S-01: 正常発行は終了コード 0', () => {
    const result = runScript('auth-create-user', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'it-s-01@example.test',
      AUTH_USER_NAME: 'テスト太郎',
      AUTH_USER_PASSWORD: 'it-s-test-password-1',
    });

    expect(result.status).toBe(0);
  });

  it('IT-S-02: 同一 email の再実行は非ゼロ終了（E-11）', () => {
    const env = {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'it-s-02@example.test',
      AUTH_USER_NAME: 'テスト太郎',
      AUTH_USER_PASSWORD: 'it-s-test-password-1',
    };
    expect(runScript('auth-create-user', env).status).toBe(0);

    const second = runScript('auth-create-user', env);
    expect(second.status).not.toBe(0);
  });

  it('IT-S-03: パスワード 11 文字は非ゼロ終了（境界）', () => {
    const result = runScript('auth-create-user', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'it-s-03@example.test',
      AUTH_USER_NAME: 'x',
      AUTH_USER_PASSWORD: 'a'.repeat(11),
    });

    expect(result.status).not.toBe(0);
  });

  it('IT-S-04/IT-S-08: パスワード 12 文字・128 文字は終了コード 0（境界）', () => {
    const short = runScript('auth-create-user', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'it-s-04@example.test',
      AUTH_USER_NAME: 'x',
      AUTH_USER_PASSWORD: 'a'.repeat(12),
    });
    expect(short.status).toBe(0);

    const long = runScript('auth-create-user', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'it-s-08@example.test',
      AUTH_USER_NAME: 'x',
      AUTH_USER_PASSWORD: 'a'.repeat(128),
    });
    expect(long.status).toBe(0);
  });

  it('IT-S-09: パスワード 129 文字は非ゼロ終了（境界）', () => {
    const result = runScript('auth-create-user', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'it-s-09@example.test',
      AUTH_USER_NAME: 'x',
      AUTH_USER_PASSWORD: 'a'.repeat(129),
    });

    expect(result.status).not.toBe(0);
  });

  it('IT-S-05: DB 接続失敗は終了コード 2', () => {
    const result = runScript('auth-create-user', {
      DATABASE_URL: 'postgres://invalid-host-xyz:5432/nope',
      AUTH_USER_EMAIL: 'it-s-05@example.test',
      AUTH_USER_NAME: 'x',
      AUTH_USER_PASSWORD: 'it-s-test-password-1',
    });

    expect(result.status).toBe(2);
  }, 15000);

  it('IT-S-06/IT-S-07: パスワード再設定 → 新パスワードで成功・旧パスワード失敗・全セッション失効', async () => {
    const email = 'it-s-06@example.test';
    const oldPassword = 'it-s-old-password-1';
    const newPassword = 'it-s-new-password-2';
    expect(
      runScript('auth-create-user', {
        DATABASE_URL: `pglite://${dataDir}`,
        AUTH_USER_EMAIL: email,
        AUTH_USER_NAME: 'テスト太郎',
        AUTH_USER_PASSWORD: oldPassword,
      }).status,
    ).toBe(0);

    // 旧セッションを作っておく（失効の確認対象）。PGlite は同一 dataDir への
    // 複数プロセス同時アクセスを想定していないため、サブプロセス（auth-set-password）を
    // 起動する前に必ず接続を閉じる。
    const createSignInAuth = (): { pglite: PGlite; auth: ReturnType<typeof createAuth> } => {
      const pglite = new PGlite(dataDir);
      const db = drizzle(pglite, { schema: authSchema });
      const auth = createAuth({
        db: db as never,
        secret: 'it-s-verify-secret-it-s-verify-32',
        baseURL: null,
        trustedOrigins: [],
        allowSignUp: false,
        rateLimitStorage: 'memory',
      });
      return { pglite, auth };
    };

    const before = createSignInAuth();
    await before.auth.api.signInEmail({ body: { email, password: oldPassword } });
    const sessionsBefore = await drizzle(before.pglite, { schema: authSchema })
      .select()
      .from(authSchema.sessions);
    expect(sessionsBefore.length).toBeGreaterThan(0);
    await before.pglite.close();

    const setResult = runScript('auth-set-password', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: email,
      AUTH_USER_PASSWORD: newPassword,
    });
    expect(setResult.status).toBe(0);

    const after = createSignInAuth();
    const sessionsAfter = await drizzle(after.pglite, { schema: authSchema })
      .select()
      .from(authSchema.sessions);
    expect(sessionsAfter).toHaveLength(0);

    await expect(
      after.auth.api.signInEmail({ body: { email, password: oldPassword } }),
    ).rejects.toThrow();
    const signIn = await after.auth.api.signInEmail({ body: { email, password: newPassword } });
    expect(signIn.user.email).toBe(email);

    await after.pglite.close();
  });

  it('IT-S-10: auth-set-password の再実行は冪等', () => {
    const email = 'it-s-10@example.test';
    expect(
      runScript('auth-create-user', {
        DATABASE_URL: `pglite://${dataDir}`,
        AUTH_USER_EMAIL: email,
        AUTH_USER_NAME: 'テスト太郎',
        AUTH_USER_PASSWORD: 'it-s-initial-password-1',
      }).status,
    ).toBe(0);

    const first = runScript('auth-set-password', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: email,
      AUTH_USER_PASSWORD: 'it-s-final-password-99',
    });
    const second = runScript('auth-set-password', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: email,
      AUTH_USER_PASSWORD: 'it-s-final-password-99',
    });

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
  });

  it('存在しないユーザーへの auth-set-password は非ゼロ終了', () => {
    const result = runScript('auth-set-password', {
      DATABASE_URL: `pglite://${dataDir}`,
      AUTH_USER_EMAIL: 'nobody@example.test',
      AUTH_USER_PASSWORD: 'it-s-test-password-1',
    });

    expect(result.status).not.toBe(0);
  });
});
