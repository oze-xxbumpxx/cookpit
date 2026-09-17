import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionCookie } from 'better-auth/cookies';
import { getAuth, isAuthConfigured } from '@/server/auth';
import { config, proxy } from '@/proxy';

const BASE_URL = 'http://localhost';

vi.mock('@/server/auth', () => ({
  getAuth: vi.fn(),
  isAuthConfigured: vi.fn(),
}));

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn(),
}));

function makeRequest(pathname: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(pathname, BASE_URL), { headers });
}

type SessionResult = { response: unknown; headers: Headers };

function mockGetSession(result: SessionResult): void {
  const getSession = vi.fn().mockResolvedValue(result);
  vi.mocked(getAuth).mockReturnValue({
    api: { getSession },
  } as unknown as ReturnType<typeof getAuth>);
}

const VALID_SESSION = { user: { id: 'u1', email: 'a@example.test' }, session: { id: 's1' } };

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthConfigured).mockReturnValue(true);
    vi.mocked(getSessionCookie).mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('UT-P-01: 未認証 navigation → 302 と next の生成', async () => {
    const res = await proxy(makeRequest('/pantry?x=1'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${BASE_URL}/login?next=%2Fpantry%3Fx%3D1`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('UT-P-02: _rsc クエリは next から除去される', async () => {
    const res = await proxy(makeRequest('/pantry?_rsc=abc123'));

    const location = res.headers.get('Location') ?? '';
    expect(location).not.toContain('_rsc');
    expect(location).toBe(`${BASE_URL}/login?next=%2Fpantry`);
  });

  it('UT-P-04: next が 2,000 文字超は / にフォールバック', async () => {
    const longPath = `/${'a'.repeat(2000)}`;
    const res = await proxy(makeRequest(longPath));

    expect(res.headers.get('Location')).toBe(`${BASE_URL}/login?next=%2F`);
  });

  it('UT-P-05: next がちょうど 2,000 文字は採用される', async () => {
    const path = `/${'a'.repeat(1999)}`;
    expect(path.length).toBe(2000);
    const res = await proxy(makeRequest(path));

    expect(res.headers.get('Location')).toBe(`${BASE_URL}/login?next=${encodeURIComponent(path)}`);
  });

  it('UT-P-06: ルート / への next', async () => {
    const res = await proxy(makeRequest('/'));

    expect(res.headers.get('Location')).toBe(`${BASE_URL}/login?next=%2F`);
  });

  it('UT-P-07: クエリ付き相対パスが正しく URL エンコードされる', async () => {
    const res = await proxy(makeRequest('/pantry?tab=a&b=c'));

    const location = res.headers.get('Location') ?? '';
    const url = new URL(location, BASE_URL);
    expect(url.searchParams.get('next')).toBe('/pantry?tab=a&b=c');
  });

  it('UT-P-08: /api/* 未認証 → 401 JSON + no-store（リダイレクトしない）', async () => {
    const res = await proxy(makeRequest('/api/pantry'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('UT-P-09: secret 未設定 × production → 503・本文空・console.error 1 回', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await proxy(makeRequest('/'));

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toMatch(/[a-z0-9+/]{16,}={0,2}/i);
  });

  it('UT-P-10: secret 未設定 × 非 production → 通過（getAuth は呼ばれない）', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);

    const res = await proxy(makeRequest('/'));

    expect(res.status).toBe(200);
    expect(getAuth).not.toHaveBeenCalled();
  });

  // UT-P-11〜14（除外パスの通過）: `proxy()` 自体は matcher を参照しない（Next.js の
  // ルーティング層が matcher に基づいて `proxy()` を呼ぶかどうかを決める。除外パスでは
  // 呼ばれること自体が無い）。旧 Basic 認証時代のテストも同様に、除外の確認は
  // `config.matcher` の正規表現構造テスト（下の `describe('config.matcher...')`
  // MW-M02/M04/M05/M07/M08/M10/M10b）でのみ行う。UT-P-11〜17 はそれらに対応する。

  it('UT-P-15: api/cron/* は除外（proxy 内では判定しない）', () => {
    expect(config.matcher[0]).toBeDefined();
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/api/cron/expiry-alerts')).toBe(false);
  });

  it('UT-P-16: api/auth/* は matcher で除外される', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/api/auth/sign-in/email')).toBe(false);
  });

  it('UT-P-17: favicon.ico は除外される（既存回帰）', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/favicon.ico')).toBe(false);
  });

  it('UT-P-18: /login × ログイン済み → 302 /', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value');
    mockGetSession({ response: VALID_SESSION, headers: new Headers() });

    const res = await proxy(makeRequest('/login'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${BASE_URL}/`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('UT-P-19: /login × 未ログイン → 通過', async () => {
    const res = await proxy(makeRequest('/login'));

    expect(res.status).toBe(200);
  });

  it('UT-P-20: 保護パス × 有効セッション → Set-Cookie 転送（実装上の罠1）', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value');
    const headers = new Headers();
    headers.append('set-cookie', 'cookpit.session_token=abc; Path=/');
    headers.append('set-cookie', 'cookpit.session_data=def; Path=/');
    mockGetSession({ response: VALID_SESSION, headers });

    const res = await proxy(makeRequest('/pantry'));

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('cookpit.session_token');
    expect(setCookies[1]).toContain('cookpit.session_data');
  });

  it('UT-P-21: getSession が例外を投げた場合は伝播する（通さない）', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value');
    const getSession = vi.fn().mockRejectedValue(new Error('db down'));
    vi.mocked(getAuth).mockReturnValue({
      api: { getSession },
    } as unknown as ReturnType<typeof getAuth>);

    await expect(proxy(makeRequest('/pantry'))).rejects.toThrow('db down');
  });

  it('UT-P-22: Cookie 無し → getAuth は呼ばれない（性能: 早期 return）', async () => {
    await proxy(makeRequest('/pantry'));

    expect(getAuth).not.toHaveBeenCalled();
  });

  it('UT-P-23: 偽造・署名不一致 Cookie（getSession が null 相当）→ 未認証扱い', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value');
    mockGetSession({ response: null, headers: new Headers() });

    const pageRes = await proxy(makeRequest('/pantry'));
    expect(pageRes.status).toBe(302);

    mockGetSession({ response: null, headers: new Headers() });
    const apiRes = await proxy(makeRequest('/api/pantry'));
    expect(apiRes.status).toBe(401);
  });

  it('UT-P-24: 期限切れ Cookie（getSession が null 相当）→ 未認証扱い', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value');
    mockGetSession({ response: null, headers: new Headers() });

    const res = await proxy(makeRequest('/pantry'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login');
  });

  it('UT-P-25: matcher 構造 - api/authx は保護対象のまま（前方一致境界）', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/api/authx')).toBe(true);
    expect(pattern.test('/api/auth/ok')).toBe(false);
  });

  it('UT-P-26: matcher 構造 - 除外名に前方一致するだけのパスは保護対象（回帰防止）', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/sw.js/api/pantry')).toBe(true);
    expect(pattern.test('/manifest.webmanifest/api/pantry')).toBe(true);
  });

  it('UT-P-27: _next/image は除外に追加されていない（ADR-0021 継承）', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/_next/image')).toBe(true);
  });

  it('UT-P-28: 503 応答に WWW-Authenticate を付与しない', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await proxy(makeRequest('/'));

    expect(res.headers.get('WWW-Authenticate')).toBeNull();
  });

  it('UT-P-29: 503 発生時のみ console.error、資格情報の値を出力しない', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await proxy(makeRequest('/'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('UT-P-30: 401 / 302 発生時は console.error / console.log を呼ばない', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await proxy(makeRequest('/'));
    await proxy(makeRequest('/api/pantry'));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('config.matcher（構造テスト・近似。既存 MW-M01〜M12 パターンを踏襲）', () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/', '/pantry', '/api/pantry', '/login'])(
    'MW-M01: 保護対象パス %s がマッチする',
    (pathname) => {
      expect(pattern.test(pathname)).toBe(true);
    },
  );

  it('MW-M02: _next/static 配下が除外される', () => {
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
  });

  it('MW-M03: _next/image は除外せず保護対象', () => {
    expect(pattern.test('/_next/image')).toBe(true);
  });

  it('MW-M04: favicon.ico が除外される', () => {
    expect(pattern.test('/favicon.ico')).toBe(false);
  });

  it('MW-M05: icons/ 配下が除外される', () => {
    expect(pattern.test('/icons/icon-192.png')).toBe(false);
  });

  it('MW-M06: icons（末尾スラッシュなし単体）は除外対象外', () => {
    expect(pattern.test('/icons')).toBe(true);
  });

  it('MW-M07: manifest.webmanifest が除外される', () => {
    expect(pattern.test('/manifest.webmanifest')).toBe(false);
  });

  it('MW-M08: sw.js が除外される', () => {
    expect(pattern.test('/sw.js')).toBe(false);
  });

  it('MW-M09: workbox-*.js は除外せず保護対象', () => {
    expect(pattern.test('/workbox-abc123.js')).toBe(true);
  });

  it('MW-M10: api/cron/ 配下が除外される', () => {
    expect(pattern.test('/api/cron/expiry-alerts')).toBe(false);
  });

  it('MW-M10b: api/auth/ 配下が除外される', () => {
    expect(pattern.test('/api/auth/sign-in/email')).toBe(false);
  });

  it.each([
    '/sw.js/api/pantry',
    '/sw.jsx',
    '/favicon.icofoo',
    '/manifest.webmanifest/api/pantry',
    '/_next/static',
  ])('MW-M12【回帰防止】: 除外名に前方一致するだけの %s は保護対象', (pathname) => {
    expect(pattern.test(pathname)).toBe(true);
  });

  it('MW-M11: 除外プレフィックスに似ているだけの保護対象パスは誤除外しない', () => {
    expect(pattern.test('/apixcron/foo')).toBe(true);
  });
});
