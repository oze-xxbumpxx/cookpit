import type { NextConfig } from 'next'
import withSerwist from '@serwist/next'

const nextConfig: NextConfig = {}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // 開発時は Turbopack と競合するため無効化し、本番ビルドのみ有効にする
  disable: process.env.NODE_ENV !== 'production',
})(nextConfig)
