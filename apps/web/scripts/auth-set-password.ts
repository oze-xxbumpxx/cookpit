/**
 * auth-set-password.ts — 既存アカウントのパスワードを再設定し、全セッションを失効させる
 * 開発者手動実行専用スクリプト（D-10）。
 *
 * 使い方:
 *   DATABASE_URL=<接続文字列> AUTH_USER_EMAIL=a@example.com \
 *     pnpm --filter @cookpit/web auth:set-password
 *   AUTH_USER_PASSWORD 未指定なら TTY（対話・エコー無し）で入力を求める。
 *   DATABASE_URL が pglite://<dir> なら PGlite、それ以外は WebSocket 接続を使う。
 *
 * 終了コード: 0=成功 / 1=入力不正（必須 env 欠落・非 TTY で AUTH_USER_PASSWORD 無し・
 * パスワード長が範囲外・該当ユーザーが存在しない）/ 2=DB 接続失敗
 *
 * `BETTER_AUTH_SECRET` は不要（パスワードハッシュは secret に依存せず、
 * セッションを発行しないため署名も不要）。
 */
import { PGlite } from '@electric-sql/pglite';
import { createTxConnection, type DrizzleClient } from '@cookpit/infrastructure';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/server/auth/create-auth';

/**
 * TTY からエコー無効でパスワードを読み取る。シェル履歴・`ps` に残る引数渡しを避けるため
 * （F-05）、`AUTH_USER_PASSWORD` 未指定時のみ呼ばれる。
 */
function promptPasswordNoEcho(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    let password = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char: string): void => {
      switch (char) {
        case '\n':
        case '\r':
        case '':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          break;
        case '':
          process.stdout.write('\n');
          process.exit(1);
          break;
        case '':
          password = password.slice(0, -1);
          break;
        default:
          password += char;
          break;
      }
    };
    stdin.on('data', onData);
  });
}

async function resolveDb(
  databaseUrl: string,
): Promise<{ db: DrizzleClient; close: () => Promise<void> }> {
  if (databaseUrl.startsWith('pglite:')) {
    const dataDir = databaseUrl.replace(/^pglite:\/\//, '');
    const pglite = new PGlite(dataDir);
    return {
      db: drizzle(pglite) as unknown as DrizzleClient,
      close: () => pglite.close(),
    };
  }
  return createTxConnection(databaseUrl);
}

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.AUTH_USER_EMAIL;

  if (databaseUrl === undefined || databaseUrl === '') {
    console.error('DATABASE_URL is required');
    return 1;
  }
  if (email === undefined || email === '') {
    console.error('AUTH_USER_EMAIL is required');
    return 1;
  }

  let password = process.env.AUTH_USER_PASSWORD;
  if (password === undefined || password === '') {
    if (!process.stdin.isTTY) {
      console.error('AUTH_USER_PASSWORD is required (non-interactive environment)');
      return 1;
    }
    password = await promptPasswordNoEcho('新しいパスワードを入力してください: ');
  }
  if (password.length < 12 || password.length > 128) {
    console.error('パスワードは 12〜128 文字にしてください');
    return 1;
  }

  let connection: { db: DrizzleClient; close: () => Promise<void> } | null = null;
  try {
    connection = await resolveDb(databaseUrl);
  } catch (error) {
    console.error('DB 接続に失敗しました:', error instanceof Error ? error.message : error);
    return 2;
  }

  try {
    const auth = createAuth({
      db: connection.db,
      secret: `script-local-${Date.now()}`,
      baseURL: null,
      trustedOrigins: [],
      allowSignUp: false,
      rateLimitStorage: 'memory',
    });

    const ctx = await auth.$context;
    const found = await ctx.internalAdapter.findUserByEmail(email);
    if (found === null) {
      console.error(`該当するユーザーが見つかりません: ${email}`);
      return 1;
    }

    const hashed = await ctx.password.hash(password);
    await ctx.internalAdapter.updatePassword(found.user.id, hashed);
    await ctx.internalAdapter.deleteUserSessions(found.user.id);

    console.log(`パスワードを再設定しました: ${email}（全セッションを失効しました）`);
    return 0;
  } catch (error) {
    console.error(
      'パスワード再設定に失敗しました:',
      error instanceof Error ? error.message : error,
    );
    return 1;
  } finally {
    await connection.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error('予期しないエラー:', error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
