import { fileURLToPath } from 'node:url';
import { baseConfig } from '@cookpit/config/vitest/base';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseConfig.test,
    name: 'dom',
    environment: 'happy-dom',
    setupFiles: ['./tests/setup/fake-indexeddb.ts'],
    include: ['tests/**/*.dom.test.ts', 'tests/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      // `URL#pathname` percent-encodes 非 ASCII 文字（Cookpit をローカルで日本語パス配下に
      // clone した場合など）を含むため、実ファイルパスへ正しく戻す `fileURLToPath` を使う。
      // `vi.mock('@/...')` の内部解決は `resolve.alias` のこの値をそのままファイルパスとして
      // 使うため、percent-encoded のままだと `Cannot find package` で失敗する
      // （ASCII のみのパスでは両者の出力は同一で挙動は変わらない）。
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
