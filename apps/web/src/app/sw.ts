import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

const sw = self as unknown as WorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: sw.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-fonts-cache',
        plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
      }),
    },
    // 買い物中に頻繁に更新されるため NetworkFirst。POST（bought/target-store/items 追加）を
    // 誤ってキャッシュ対象にしないよう matcher で GET を明示する（設計書 §PWA設計）。
    {
      matcher: ({ url, request }) =>
        request.method === 'GET' && /^\/api\/shopping-lists\/[^/]+$/.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: 'shopping-list-detail-cache',
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 })],
      }),
    },
    // 店舗マスタは更新頻度が低いため StaleWhileRevalidate。
    {
      matcher: ({ url, request }) => request.method === 'GET' && url.pathname === '/api/stores',
      handler: new StaleWhileRevalidate({
        cacheName: 'stores-cache',
        plugins: [new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 })],
      }),
    },
    // /shopping-lists/[id] は動的セグメントのため build 時 precache 不可。オフライン再訪問
    // （O-01）を成立させるため実行時キャッシュが必要（設計書 §PWA設計）。
    {
      matcher: ({ url, request }) =>
        request.method === 'GET' && url.pathname.startsWith('/shopping-lists'),
      handler: new NetworkFirst({
        cacheName: 'shopping-lists-pages-cache',
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 })],
      }),
    },
  ],
});

serwist.addEventListeners();
