import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  return {
    execute,
    state: { db: null as { execute: typeof execute } | null },
  };
});

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.state.db;
  },
  getDb: () => {
    if (mocks.state.db === null) {
      throw new Error('DATABASE_URL is not configured');
    }
    return mocks.state.db;
  },
}));

/** 接続文字列・ホスト名を含む想定の message。応答へ漏れないことの検証に使う。 */
const SECRET_MESSAGE =
  'connect ECONNREFUSED postgres://user:pw@ep-secret.ap-southeast-1.aws.neon.tech';

describe('healthRoute', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.db = { execute: mocks.execute };
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('DATABASE_URL が無いときは disconnected を返す', async () => {
    mocks.state.db = null;

    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ok',
      db: 'disconnected (no DATABASE_URL)',
      dbError: null,
    });
  });

  it('DB へ到達できるときは connected を返す', async () => {
    mocks.execute.mockResolvedValue(undefined);

    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: 'connected', dbError: null });
  });

  it('接続失敗時は例外の name と code を返す', async () => {
    const error = Object.assign(new Error(SECRET_MESSAGE), { code: 'ECONNREFUSED' });
    mocks.execute.mockRejectedValue(error);

    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ok',
      db: 'error',
      dbError: { name: 'Error', code: 'ECONNREFUSED' },
    });
  });

  it('接続失敗の message を応答へ載せない', async () => {
    mocks.execute.mockRejectedValue(
      Object.assign(new Error(SECRET_MESSAGE), { code: 'ETIMEDOUT' }),
    );

    const res = await app.request('/api/health');

    const body = await res.text();
    expect(body).not.toContain('ECONNREFUSED postgres://');
    expect(body).not.toContain('ep-secret');
    expect(body).toContain('ETIMEDOUT');
  });

  it('接続失敗の全文をサーバーログへ出す', async () => {
    const error = new Error(SECRET_MESSAGE);
    mocks.execute.mockRejectedValue(error);

    await app.request('/api/health');

    expect(consoleError).toHaveBeenCalledWith('health db check failed', error);
  });

  it('code を持たない例外では code が null になる', async () => {
    mocks.execute.mockRejectedValue(new TypeError('WebSocket is not a constructor'));

    const res = await app.request('/api/health');

    expect(await res.json()).toMatchObject({
      db: 'error',
      dbError: { name: 'TypeError', code: null },
    });
  });

  it('Error でない例外でも応答を返す', async () => {
    mocks.execute.mockRejectedValue('boom');

    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      db: 'error',
      dbError: { name: 'UnknownError', code: null },
    });
  });
});
