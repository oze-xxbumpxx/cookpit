import { Hono } from 'hono';
import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

/** DB 接続失敗の種別。原因の切り分けに足りる最小限だけを持つ。 */
interface DbErrorKind {
  name: string;
  /** `ECONNREFUSED` など。持たない例外もあるので null 可。 */
  code: string | null;
}

function readErrorCode(error: object): string | null {
  if ('code' in error) {
    const { code } = error as { code: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * 例外から種別だけを取り出す。
 *
 * `message` は接続文字列・ホスト名・認証情報を含みうるため**戻り値に含めない**。
 * 全文はサーバーログ側にのみ出す。
 */
function toDbErrorKind(error: unknown): DbErrorKind {
  if (error instanceof Error) {
    return { name: error.name, code: readErrorCode(error) };
  }
  return { name: 'UnknownError', code: null };
}

export const healthRoute = new Hono().get('/', async (c) => {
  if (!db) {
    return c.json({
      status: 'ok',
      db: 'disconnected (no DATABASE_URL)',
      dbError: null,
      timestamp: new Date().toISOString(),
    });
  }
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: 'ok',
      db: 'connected',
      dbError: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // 接続方式を変える変更（ADR-0019）の切り分けには例外の種別が要る。捨てると
    // 「約 15 秒後に db: error」しか残らず、原因が推定止まりになる（PR #164 → #168）。
    // 全文は Vercel のランタイムログ側でだけ読む。
    console.error('health db check failed', error);
    return c.json({
      status: 'ok',
      db: 'error',
      dbError: toDbErrorKind(error),
      timestamp: new Date().toISOString(),
    });
  }
});
