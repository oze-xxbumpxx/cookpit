import type { PrecacheEntry, RouteHandler, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';

// `apps/web/tsconfig.json` の `lib` は `["dom", "dom.iterable", "esnext"]` で `webworker` を
// 含まない（`dom` と型が衝突するため追加しない）。そのため `PushEvent`/`NotificationEvent`/
// `Clients`/`ServiceWorkerGlobalScope.registration` 等の Service Worker 専用の型は標準の
// `lib.dom.d.ts` からは解決できない。ここで使用箇所に必要な最小限だけを宣言する
// （実装計画 Step 8-1・設計書 M-4 の申し送りに従う）。
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    readonly registration: ServiceWorkerRegistration;
    readonly clients: Clients;
  }

  interface PushMessageData {
    json(): unknown;
  }

  interface PushEvent extends Event {
    readonly data: PushMessageData | null;
    waitUntil(promise: Promise<unknown>): void;
  }

  interface NotificationEvent extends Event {
    readonly notification: Notification;
    waitUntil(promise: Promise<unknown>): void;
  }

  interface WindowClient {
    readonly url: string;
  }

  interface Clients {
    openWindow(url: string): Promise<WindowClient | null>;
  }
}

const sw = self as unknown as WorkerGlobalScope & typeof globalThis;

// 認証切れ（401）をキャッシュしない。NetworkFirst / StaleWhileRevalidate が 401 を保存すると、
// 再認証後もキャッシュから 401 が返り続ける。
const cacheOnlyOk = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 ? response : null,
};

/**
 * 画面遷移で 401 を受けたとき、SW 非経由の `/` へ 302 で逃がす。
 *
 * Service Worker が `respondWith` した 401 に対してブラウザは Basic 認証ダイアログを出さない
 * （Chromium issue 623464）。`proxy.ts` の 401 は本文も Content-Type も持たないため、
 * ブラウザはそれを不明なファイルとみなしダウンロードを提案し、実体が無いので完了しない
 * （2026-09-16 に iOS Safari で顕在化。ADR-0021 の残存リスクが現実化したもの）。
 * SW が横取りしない `/` へ送れば、ブラウザが認証を引き受けられる。
 *
 * ネットワーク障害（オフライン）では 401 ではなくキャッシュへフォールバックするため、
 * オフライン再訪問（O-01）の挙動は変わらない。
 */
const redirectToRootOn401 = (strategy: NetworkFirst): RouteHandler => {
  return async (options) => {
    const response = await strategy.handle(options);
    if (response.status !== 401) {
      return response;
    }
    return Response.redirect(new URL('/', options.url).toString(), 302);
  };
};

const serwist = new Serwist({
  // Serwist の InjectManifest プラグインは本番ビルド後の JS 文字列中に文字どおり
  // `self.__SW_MANIFEST` が 1 箇所だけ現れることを前提に置換する（デフォルトの
  // injectionPoint）。以前は `sw` エイリアスの参照がこの 1 箇所のみだったため、
  // terser の単一使用変数インライン化により結果的に `self.__SW_MANIFEST` が残っていたが、
  // 本ユニットで `sw` の参照箇所が増えた（`sw.registration`/`sw.clients`/
  // `sw.addEventListener` 追加）ことで terser がインライン化しなくなり、
  // `Can't find self.__SW_MANIFEST in your SW source.` でビルドが失敗するようになった
  // （実測）。ここだけ `self` を直接参照することで、ビルド成果物中に文字どおりの
  // `self.__SW_MANIFEST` を確実に残す（値・キャスト先の型は `sw.__SW_MANIFEST` と同一で
  // 挙動は変わらない）。
  precacheEntries: (self as unknown as WorkerGlobalScope).__SW_MANIFEST,
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
        plugins: [
          cacheOnlyOk,
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // 店舗マスタは更新頻度が低いため StaleWhileRevalidate。
    {
      matcher: ({ url, request }) => request.method === 'GET' && url.pathname === '/api/stores',
      handler: new StaleWhileRevalidate({
        cacheName: 'stores-cache',
        plugins: [
          cacheOnlyOk,
          new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        ],
      }),
    },
    // /shopping-lists/[id] は動的セグメントのため build 時 precache 不可。オフライン再訪問
    // （O-01）を成立させるため実行時キャッシュが必要（設計書 §PWA設計）。
    {
      matcher: ({ url, request }) =>
        request.method === 'GET' && url.pathname.startsWith('/shopping-lists'),
      handler: redirectToRootOn401(
        new NetworkFirst({
          cacheName: 'shopping-lists-pages-cache',
          networkTimeoutSeconds: 3,
          plugins: [
            cacheOnlyOk,
            new ExpirationPlugin({ maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 }),
          ],
        }),
      ),
    },
  ],
});

serwist.addEventListeners();

/** 期限アラートの通知ペイロード（`PushPayload`（`@cookpit/domain`）と同形。 */
interface PushDigestPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * `event.data?.json()` は不正 JSON で throw しうるため try/catch する。`title`/`body` が
 * 文字列でなければ通知を出さない。`url` は `/` で始まる相対パスのときだけ採用し、
 * それ以外は `/` にフォールバックする（外部サイトへの `openWindow` を防ぐ。security-reviewer L-3）。
 */
function parsePushDigestPayload(event: PushEvent): PushDigestPayload | null {
  let data: unknown;
  try {
    data = event.data?.json();
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const { title, body, url } = data as Record<string, unknown>;
  if (typeof title !== 'string' || typeof body !== 'string') {
    return null;
  }
  const safeUrl = typeof url === 'string' && url.startsWith('/') ? url : '/';
  return { title, body, url: safeUrl };
}

// `sw.addEventListener` は `WorkerGlobalScope`（`lib.dom.d.ts` 由来の汎用ワーカー用の型）の
// 汎用オーバーロードにしか解決できず、`event` は `Event` にしか型付けされない（`webworker` lib
// が無いため）。上で宣言した最小限の `PushEvent`/`NotificationEvent` へ明示的にキャストする。
sw.addEventListener('push', (event) => {
  const pushEvent = event as PushEvent;
  const payload = parsePushDigestPayload(pushEvent);
  if (payload === null) {
    return;
  }
  pushEvent.waitUntil(
    sw.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  const notificationEvent = event as NotificationEvent;
  notificationEvent.notification.close();
  const rawUrl = (notificationEvent.notification.data as { url?: unknown } | undefined)?.url;
  const url = typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : '/';
  notificationEvent.waitUntil(sw.clients.openWindow(url));
});
