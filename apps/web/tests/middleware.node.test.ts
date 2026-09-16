import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, middleware } from '@/middleware';

const BASE_URL = 'http://localhost';

function makeRequest(pathname: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(pathname, BASE_URL), { headers });
}

function basicHeader(user: string, password: string): string {
  const base64 = Buffer.from(`${user}:${password}`, 'utf-8').toString('base64');
  return `Basic ${base64}`;
}

describe('middleware', () => {
  const originalUser = process.env.BASIC_AUTH_USER;
  const originalPassword = process.env.BASIC_AUTH_PASSWORD;

  beforeEach(() => {
    process.env.BASIC_AUTH_USER = 'testuser';
    process.env.BASIC_AUTH_PASSWORD = 'testpass';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // NODE_ENV / VERCEL_ENV は @types/node 上 readonly のため、通常の代入・delete では
    // 型検査を通らない。vi.stubEnv は型安全に上書き・復元できる。
    vi.unstubAllEnvs();
    if (originalUser === undefined) {
      delete process.env.BASIC_AUTH_USER;
    } else {
      process.env.BASIC_AUTH_USER = originalUser;
    }
    if (originalPassword === undefined) {
      delete process.env.BASIC_AUTH_PASSWORD;
    } else {
      process.env.BASIC_AUTH_PASSWORD = originalPassword;
    }
  });

  it('MW-01: 正しい資格情報でページ相当パスを通過', async () => {
    const res = await middleware(
      makeRequest('/', { authorization: basicHeader('testuser', 'testpass') }),
    );

    expect(res.status).toBe(200);
  });

  it('MW-02: 正しい資格情報で API 相当パスを通過', async () => {
    const res = await middleware(
      makeRequest('/api/pantry', { authorization: basicHeader('testuser', 'testpass') }),
    );

    expect(res.status).toBe(200);
  });

  it('MW-03: Authorization ヘッダなしで 401', async () => {
    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="Cookpit", charset="UTF-8"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('MW-04: ユーザー名のみ誤りで 401', async () => {
    const res = await middleware(
      makeRequest('/', { authorization: basicHeader('wronguser', 'testpass') }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="Cookpit", charset="UTF-8"');
  });

  it('MW-05: パスワードのみ誤りで 401', async () => {
    const res = await middleware(
      makeRequest('/', { authorization: basicHeader('testuser', 'wrongpass') }),
    );

    expect(res.status).toBe(401);
  });

  it('MW-06: 両方誤りで 401', async () => {
    const res = await middleware(
      makeRequest('/', { authorization: basicHeader('wronguser', 'wrongpass') }),
    );

    expect(res.status).toBe(401);
  });

  it('MW-07: スキームが Basic でない場合 401', async () => {
    const res = await middleware(makeRequest('/', { authorization: 'Bearer xxx' }));

    expect(res.status).toBe(401);
  });

  it('MW-08: スキーム名の大小文字違いは 401', async () => {
    const correctBase64 = basicHeader('testuser', 'testpass').slice('Basic '.length);
    const res = await middleware(makeRequest('/', { authorization: `basic ${correctBase64}` }));

    expect(res.status).toBe(401);
  });

  it('MW-09: base64 デコード失敗時は例外を投げず 401', async () => {
    const res = await middleware(makeRequest('/', { authorization: 'Basic %%%invalid-base64%%%' }));

    expect(res.status).toBe(401);
  });

  it('MW-10: デコード後に : を含まない場合 401', async () => {
    const base64 = Buffer.from('nodelimiter', 'utf-8').toString('base64');
    const res = await middleware(makeRequest('/', { authorization: `Basic ${base64}` }));

    expect(res.status).toBe(401);
  });

  it('MW-11: 資格情報部分が空の場合 401', async () => {
    const res = await middleware(makeRequest('/', { authorization: 'Basic ' }));

    expect(res.status).toBe(401);
  });

  it('MW-12: 環境変数の一方だけ空文字は未設定同義でスキップ', async () => {
    process.env.BASIC_AUTH_USER = '';
    process.env.BASIC_AUTH_PASSWORD = 'testpass';
    vi.stubEnv('NODE_ENV', 'development');

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(200);
  });

  it('MW-13: 環境変数が両方空文字かつ production で 503', async () => {
    process.env.BASIC_AUTH_USER = '';
    process.env.BASIC_AUTH_PASSWORD = '';
    vi.stubEnv('NODE_ENV', 'production');

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(503);
  });

  it('MW-14: UTF-8（日本語）パスワードの正しい復号で通過', async () => {
    process.env.BASIC_AUTH_PASSWORD = 'パスワード123';

    const res = await middleware(
      makeRequest('/', { authorization: basicHeader('testuser', 'パスワード123') }),
    );

    expect(res.status).toBe(200);
  });

  it('MW-15【回帰防止】: 256文字超・末尾のみ相違する資格情報は 401', async () => {
    const longValue = 'a'.repeat(299);
    process.env.BASIC_AUTH_USER = longValue;
    process.env.BASIC_AUTH_PASSWORD = `${longValue}x`;

    const wrongPassword = `${longValue}y`;
    const res = await middleware(
      makeRequest('/', { authorization: basicHeader(longValue, wrongPassword) }),
    );

    expect(res.status).toBe(401);
  });

  it('MW-16: 境界: 256文字の資格情報で完全一致すれば通過', async () => {
    const value = 'b'.repeat(256);
    process.env.BASIC_AUTH_USER = value;
    process.env.BASIC_AUTH_PASSWORD = value;

    const res = await middleware(makeRequest('/', { authorization: basicHeader(value, value) }));

    expect(res.status).toBe(200);
  });

  it('MW-17: 境界: 資格情報が1文字でも通過', async () => {
    process.env.BASIC_AUTH_USER = 'a';
    process.env.BASIC_AUTH_PASSWORD = 'b';

    const res = await middleware(makeRequest('/', { authorization: basicHeader('a', 'b') }));

    expect(res.status).toBe(200);
  });

  it('MW-18: パスワードに : を含む場合も最初の : 以降全体をパスワードとして復元して通過', async () => {
    process.env.BASIC_AUTH_PASSWORD = 'pa:ss';

    const res = await middleware(
      makeRequest('/', { authorization: basicHeader('testuser', 'pa:ss') }),
    );

    expect(res.status).toBe(200);
  });

  it('MW-19: 本番相当・環境変数未設定で 503、本文は空', async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    vi.stubEnv('NODE_ENV', 'production');

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('');
  });

  it('MW-20: Preview 相当でも NODE_ENV 基準で fail-closed', async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(503);
  });

  it('MW-21: 開発相当・環境変数未設定で認証スキップ', async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    vi.stubEnv('NODE_ENV', 'development');

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(200);
  });

  it('MW-22: Vitest 既定の NODE_ENV=test でも未設定時は non-production 分岐で通過', async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(200);
  });

  it('MW-23: 503 応答には WWW-Authenticate を付与しない', async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    vi.stubEnv('NODE_ENV', 'production');

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(503);
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
  });

  it('503 発生時のみ console.error を呼び、資格情報の値を出力しない', async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await middleware(makeRequest('/'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toContain('testuser');
    expect(loggedArgs).not.toContain('testpass');
  });

  it('401 発生時は console.error / console.log を呼ばない', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await middleware(makeRequest('/'));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('config.matcher（構造テスト・近似）', () => {
  const pattern = config.matcher[0];
  const matcherRegExp = new RegExp(`^${pattern}$`);

  it.each(['/', '/pantry', '/api/pantry'])('MW-M01: 保護対象パス %s がマッチする', (pathname) => {
    expect(matcherRegExp.test(pathname)).toBe(true);
  });

  it('MW-M02: _next/static 配下が除外される', () => {
    expect(matcherRegExp.test('/_next/static/chunk.js')).toBe(false);
  });

  it('MW-M03: _next/image が除外される', () => {
    expect(matcherRegExp.test('/_next/image?url=x')).toBe(false);
  });

  it('MW-M04: favicon.ico が除外される', () => {
    expect(matcherRegExp.test('/favicon.ico')).toBe(false);
  });

  it('MW-M05: icons/ 配下が除外される', () => {
    expect(matcherRegExp.test('/icons/icon-192.png')).toBe(false);
  });

  it('MW-M06: icons（末尾スラッシュなし単体）は除外対象外', () => {
    expect(matcherRegExp.test('/icons')).toBe(true);
  });

  it('MW-M07: manifest.webmanifest が除外される', () => {
    expect(matcherRegExp.test('/manifest.webmanifest')).toBe(false);
  });

  it('MW-M08: sw.js が除外される', () => {
    expect(matcherRegExp.test('/sw.js')).toBe(false);
  });

  it('MW-M09: workbox-*.js が除外される', () => {
    expect(matcherRegExp.test('/workbox-abc123.js')).toBe(false);
  });

  it('MW-M10: api/cron/ 配下が除外される', () => {
    expect(matcherRegExp.test('/api/cron/expiry-alerts')).toBe(false);
  });

  it('MW-M11: 除外プレフィックスに似ているだけの保護対象パスは誤除外しない', () => {
    expect(matcherRegExp.test('/apixcron/foo')).toBe(true);
  });
});
