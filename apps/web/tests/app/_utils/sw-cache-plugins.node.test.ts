import { describe, expect, it } from 'vitest';
import { cacheWillUpdate } from '../../../src/app/_utils/sw-cache-plugins';

function response(init: { status: number; redirected: boolean }): Response {
  const res = new Response(null, { status: init.status === 0 ? 200 : init.status });
  Object.defineProperty(res, 'status', { value: init.status });
  Object.defineProperty(res, 'redirected', { value: init.redirected });
  return res;
}

describe('cacheWillUpdate', () => {
  it('UT-SW-01: 200 かつ非 redirected → 応答をそのまま cache する', async () => {
    const res = response({ status: 200, redirected: false });

    const result = await cacheWillUpdate({ response: res });

    expect(result).toBe(res);
  });

  it('UT-SW-02: redirected → cache しない', async () => {
    const res = response({ status: 200, redirected: true });

    const result = await cacheWillUpdate({ response: res });

    expect(result).toBeNull();
  });

  it('UT-SW-03: 200 以外（401）→ cache しない', async () => {
    const res = response({ status: 401, redirected: false });

    const result = await cacheWillUpdate({ response: res });

    expect(result).toBeNull();
  });

  it('UT-SW-04: opaqueredirect（status: 0）→ cache しない', async () => {
    const res = response({ status: 0, redirected: true });

    const result = await cacheWillUpdate({ response: res });

    expect(result).toBeNull();
  });
});
