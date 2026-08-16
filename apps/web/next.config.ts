import type { NextConfig } from 'next';
import withSerwist from '@serwist/next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // dev の PGlite 経路（src/db/pglite-client.ts）用。wasm 同梱パッケージのため
  // バンドルさせない。本番では pglite を import しないので実質 dev 専用の指定
  serverExternalPackages: ['@electric-sql/pglite'],
  // ws はネイティブアドオン bufferutil / utf-8-validate を optional に require する。
  // Next はこの 2 つを空モジュールへエイリアスするため require が throw せず、ws の
  // 「ネイティブが無ければ JS 実装へフォールバック」という try/catch が働かない。
  // 結果 48 バイト以上のフレーム送信で `b.mask is not a function` になり、
  // coalesceWrites の setTimeout 内なので未捕捉例外としてプロセスごと落ちる。
  // ここで '1' を埋め込むと ws 側のガードが静的に false になり、try ブロックごと消える。
  env: { WS_NO_BUFFER_UTIL: '1' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// withSerwist は disable 時でも webpack 設定を注入するため、Turbopack 既定の dev
// （next dev）では「webpack 設定併存」で Next 16 がエラーになる。本番ビルド
// （next build --webpack）でのみ Serwist を適用し、dev は素の設定で Turbopack を使う。
export default process.env.NODE_ENV === 'production'
  ? withSerwist({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
    })(nextConfig)
  : nextConfig;
