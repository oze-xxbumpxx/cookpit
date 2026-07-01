import type { NextConfig } from 'next';
import withSerwist from '@serwist/next';

const nextConfig: NextConfig = {};

// withSerwist は disable 時でも webpack 設定を注入するため、Turbopack 既定の dev
// （next dev）では「webpack 設定併存」で Next 16 がエラーになる。本番ビルド
// （next build --webpack）でのみ Serwist を適用し、dev は素の設定で Turbopack を使う。
export default process.env.NODE_ENV === 'production'
  ? withSerwist({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
    })(nextConfig)
  : nextConfig;
