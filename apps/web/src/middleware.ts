import { NextResponse, type NextRequest } from 'next/server';

const REALM_HEADER = 'Basic realm="Cookpit", charset="UTF-8"';

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

// crypto.timingSafeEqual は Edge Runtime に無い。可変長のまま比較すると「固定長ループで
// 打ち切って末尾を見落とす」「ループ長が秘密の長さに依存する」のどちらかに必ず倒れるため、
// SHA-256 ダイジェスト（常に32バイト）へ正規化してから比較し、両方を同時に消す。
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256(a), sha256(b)]);
  let mismatch = 0;
  for (let i = 0; i < digestA.length; i += 1) {
    mismatch |= digestA[i] ^ digestB[i];
  }
  return mismatch === 0;
}

/**
 * アプリ全体（cron を除く）を HTTP Basic 認証で保護する Edge middleware。
 * `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の一方でも未設定の場合、
 * `NODE_ENV=production`（Vercel Preview を含む）では fail-closed で 503 を返し、
 * それ以外（開発・テスト）では認証をスキップする。対象パスは `config.matcher` の
 * 否定 lookahead で `api/cron/*` 等を除外しており、cron は既存の `Bearer $CRON_SECRET`
 * （`server/routes/cron.ts`）で独立に保護される。
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
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
      return new NextResponse(null, { status: 503 });
    }
    return NextResponse.next();
  }

  const credentials = decodeBasicCredentials(request.headers.get('authorization'));
  const provided = credentials === null ? '' : `${credentials.user}:${credentials.password}`;
  const expected = `${expectedUser}:${expectedPassword}`;

  if (credentials === null || !(await timingSafeStringEqual(provided, expected))) {
    return new NextResponse(null, {
      status: 401,
      headers: {
        'WWW-Authenticate': REALM_HEADER,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|sw\\.js|workbox-.*\\.js|api/cron/).*)',
  ],
};
