import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { getAuth, isAuthConfigured } from '@/server/auth';

const NEXT_MAX_LENGTH = 2000;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

// クライアントナビゲーションの RSC 取得が付ける `_rsc` クエリを除去してから
// `next` を組み立てる（罠3）。除去後も 2,000 文字を超える場合は `/` にフォールバックする（B-02）。
function buildNextParam(request: NextRequest): string {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc');
  const next = `${url.pathname}${url.search}`;
  return next.length <= NEXT_MAX_LENGTH ? next : '/';
}

/**
 * アプリ全体（cron・`/api/auth/*` を除く）をセッション検証で保護する Proxy（Next.js 16 の
 * `middleware` 規約から改名されたもの。既定ランタイムは Node.js）。ADR-0022。
 *
 * `BETTER_AUTH_SECRET` が未設定の場合、`NODE_ENV=production`（Vercel Preview を含む）では
 * fail-closed で 503 を返し、それ以外（開発・テスト）では認証をスキップする。
 * 対象パスは `config.matcher` の否定 lookahead で `api/cron/*`・`api/auth/*` 等を除外しており、
 * cron は既存の `Bearer $CRON_SECRET`（`server/routes/cron.ts`）で独立に保護される。
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('BETTER_AUTH_SECRET is not configured');
      return new NextResponse(null, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  // Cookie が無ければ auth を初期化せず即応答する（DB も HMAC も不要な最適化）。
  // 存在＝認証済みとは扱わない。存在する場合のみ完全検証（getSession）に進む。
  let session: unknown = null;
  let setCookies: string[] = [];
  if (getSessionCookie(request, { cookiePrefix: 'cookpit' }) !== null) {
    const result = await getAuth().api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    session = result.response;
    setCookies = result.headers.getSetCookie();
  }

  if (isLoginPage) {
    return session !== null
      ? NextResponse.redirect(new URL('/', request.url), {
          status: 302,
          headers: NO_STORE_HEADERS,
        })
      : NextResponse.next();
  }

  if (session === null) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', buildNextParam(request));
    return NextResponse.redirect(login, { status: 302, headers: NO_STORE_HEADERS });
  }

  const response = NextResponse.next();
  // Cookie キャッシュの更新を転送する。忘れると `maxAge` 経過後は毎回 DB を叩く（実装上の罠1）。
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
  return response;
}

// 除外はセグメント境界に固定する。ファイル型（`sw.js` 等）を `$` で終端しないと
// `/sw.js/api/pantry` が除外側へ落ち、保護対象のパスが素通りしうる。
// 現状はいずれも 404 になるルートだが、ルート直下の catch-all を将来足した時点で穴になる。
// 除外するのは「ブラウザが credentials 無しで取得するもの」（manifest）と「認証済みブラウザが
// 資格情報を自動付与するので保護不要かつ、毎回 Proxy を起動する価値が無い静的アセット」、
// `api/cron/*`（Bearer で独立保護）、`api/auth/*`（Better Auth 自身が Origin を検査）に限る。
// `/_next/image` は除外しない（`next/image` 未使用。Image Optimization API を無認証で晒さない）。
// `/login` も除外しない（ログイン済みなら `/` へ 302 するため Proxy を通す）。
export const config = {
  matcher: [
    '/((?!(?:favicon\\.ico|manifest\\.webmanifest|sw\\.js)$|_next/static/|icons/|api/cron/|api/auth/).*)',
  ],
};
