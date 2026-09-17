/**
 * auth-create-user.ts — Better Auth のアカウント（users + accounts）を発行する
 * 開発者手動実行専用スクリプト（HTTP 経由のサインアップは常に閉鎖している。D-10）。
 *
 * 使い方:
 *   DATABASE_URL=<接続文字列> AUTH_USER_EMAIL=a@example.com AUTH_USER_NAME=太郎 \
 *     pnpm --filter @cookpit/web auth:create-user
 *   AUTH_USER_PASSWORD 未指定なら TTY（対話・エコー無し）で入力を求める。
 *   DATABASE_URL が pglite://<dir> なら PGlite、それ以外は WebSocket 接続を使う。
 *
 * 終了コード: 0=成功 / 1=入力不正（必須 env 欠落・非 TTY で AUTH_USER_PASSWORD 無し・
 * パスワード長が範囲外・既存 email）/ 2=DB 接続失敗
 */
import { PGlite } from '@electric-sql/pglite';
import { authSchema, createTxConnection, type DrizzleClient } from '@cookpit/infrastructure';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/server/auth/create-auth';

const BACKSPACE = '';
const CTRL_C = '';
const CTRL_D = '';

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
        case CTRL_D:
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          break;
        case CTRL_C:
          process.stdout.write('\n');
          process.exit(1);
          break;
        case BACKSPACE:
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
  const name = process.env.AUTH_USER_NAME;

  if (databaseUrl === undefined || databaseUrl === '') {
    console.error('DATABASE_URL is required');
    return 1;
  }
  if (email === undefined || email === '') {
    console.error('AUTH_USER_EMAIL is required');
    return 1;
  }
  if (name === undefined || name === '') {
    console.error('AUTH_USER_NAME is required');
    return 1;
  }

  let password = process.env.AUTH_USER_PASSWORD;
  if (password === undefined || password === '') {
    if (!process.stdin.isTTY) {
      console.error('AUTH_USER_PASSWORD is required (non-interactive environment)');
      return 1;
    }
    password = await promptPasswordNoEcho('パスワードを入力してください: ');
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
    // Better Auth の `signUpEmail` は `autoSignIn: false`（列挙対策。create-auth.ts で固定）
    // のとき既存メールへの再登録でも例外を投げず「成功したふりをした汎用応答」を返す
    // （メール存在の列挙防止のための意図的な仕様）。スクリプトは列挙対策が不要な
    // 管理者操作のため、DB を直接引いて既存判定する（E-11）。
    const existing = await connection.db
      .select({ id: authSchema.users.id })
      .from(authSchema.users)
      .where(eq(authSchema.users.email, email))
      .limit(1);
    if (existing.length > 0) {
      console.error(`既に登録済みの email です: ${email}`);
      return 1;
    }

    const auth = createAuth({
      db: connection.db,
      secret: `script-local-${Date.now()}`,
      baseURL: null,
      trustedOrigins: [],
      allowSignUp: true,
      rateLimitStorage: 'memory',
    });

    await auth.api.signUpEmail({ body: { email, password, name } });
    console.log(`作成しました: ${email}`);
    return 0;
  } catch (error) {
    console.error('アカウント発行に失敗しました:', error instanceof Error ? error.message : error);
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
