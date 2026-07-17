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
