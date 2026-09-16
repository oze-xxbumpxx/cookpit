import { NextResponse, type NextRequest } from 'next/server';

const REALM_HEADER = 'Basic realm="Cookpit", charset="UTF-8"';
// 本文と Content-Type を必ず付ける。どちらも無い応答をブラウザはレンダリングできず、
// 不明なファイルとみなしてダウンロードを提案する。401 は実体が無いのでダウンロードも
// 完了せず、利用者は復帰手段を失う（2026-09-16 に iOS Safari で顕在化）。
// 認証前に返すため、アプリの情報は一切含めない。
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' } as const;

const UNAUTHORIZED_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>認証が必要です</title>
</head><body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.7">
<h1 style="font-size:1.25rem">認証が必要です</h1>
<p>このページを表示するにはユーザー名とパスワードが必要です。</p>
<p>入力欄が出ない場合は、ページを再読み込みしてください。</p>
</body></html>`;

const UNAVAILABLE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>一時的に利用できません</title>
</head><body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.7">
<h1 style="font-size:1.25rem">一時的に利用できません</h1>
<p>時間をおいて再度お試しください。</p>
</body></html>`;

function decodeBasicCredentials(header: string | null): { user: string; password: string } | null {
  if (header === null || !header.startsWith('Basic ')) {
    return null;
  }
  try {
    const binary = atob(header.slice('Basic '.length));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }
    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

// 可変長のまま比較すると「固定長ループで打ち切って末尾を見落とす」「ループ長が秘密の長さに
// 依存する」のどちらかに必ず倒れるため、SHA-256 ダイジェスト（常に32バイト）へ正規化してから
// 比較し、両方を同時に消す。Web Crypto のみに依存するので Node.js / Edge どちらのランタイム
// でも同じコードで動き、`node:crypto` の `timingSafeEqual` の有無に左右されない。
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256(a), sha256(b)]);
  let mismatch = 0;
  for (let i = 0; i < digestA.length; i += 1) {
    mismatch |= digestA[i] ^ digestB[i];
  }
  return mismatch === 0;
}

/**
 * アプリ全体（cron を除く）を HTTP Basic 認証で保護する Proxy（Next.js 16 で `middleware`
 * 規約から改名されたもの。既定ランタイムは Node.js）。
 * `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の一方でも未設定の場合、
 * `NODE_ENV=production`（Vercel Preview を含む）では fail-closed で 503 を返し、
 * それ以外（開発・テスト）では認証をスキップする。対象パスは `config.matcher` の
 * 否定 lookahead で `api/cron/*` 等を除外しており、cron は既存の `Bearer $CRON_SECRET`
 * （`server/routes/cron.ts`）で独立に保護される。
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;
  const isConfigured =
    expectedUser !== undefined &&
    expectedUser !== '' &&
    expectedPassword !== undefined &&
    expectedPassword !== '';

  if (!isConfigured) {
    if (process.env.NODE_ENV === 'production') {
      console.error('BASIC_AUTH_USER/BASIC_AUTH_PASSWORD is not configured');
      return new NextResponse(UNAVAILABLE_HTML, {
        status: 503,
        headers: { ...HTML_HEADERS, 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.next();
  }

  const credentials = decodeBasicCredentials(request.headers.get('authorization'));
  // user と password を別々に比較し、両方の結果を短絡させずに合成する。
  // `user:password` に再結合して 1 本で比較すると、区切り位置の違いを吸収できてしまう。
  const [userMatches, passwordMatches] = await Promise.all([
    timingSafeStringEqual(credentials?.user ?? '', expectedUser),
    timingSafeStringEqual(credentials?.password ?? '', expectedPassword),
  ]);

  if (credentials === null || !(userMatches && passwordMatches)) {
    return new NextResponse(UNAUTHORIZED_HTML, {
      status: 401,
      headers: {
        ...HTML_HEADERS,
        'WWW-Authenticate': REALM_HEADER,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.next();
}

// 除外はセグメント境界に固定する。ファイル型（`sw.js` 等）を `$` で終端しないと
// `/sw.js/api/pantry` が除外側へ落ち、保護対象のパスが素通りしうる。
// 現状はいずれも 404 になるルートだが、ルート直下の catch-all を将来足した時点で穴になる。
// 除外するのは「ブラウザが credentials 無しで取得するもの」（manifest）と「認証済みブラウザが
// 資格情報を自動付与するので保護不要かつ、毎回 Proxy を起動する価値が無い静的アセット」に限る。
// `/_next/image` は除外しない（`next/image` 未使用。Image Optimization API を無認証で晒さない）。
export const config = {
  matcher: [
    '/((?!(?:favicon\\.ico|manifest\\.webmanifest|sw\\.js)$|_next/static/|icons/|api/cron/).*)',
  ],
};
