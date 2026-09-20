import { defineConfig } from 'vitest/config';

// node（Hono ルート）と happy-dom（コンポーネント）で環境を分けるため
// projects で 2 設定に分割する（設計書 §6.3 案 1）。
export default defineConfig({
  test: {
    projects: ['./vitest.node.config.mts', './vitest.dom.config.mts'],
    // カバレッジは projects をまたいで集約するため、この親設定側に置く。
    // 既定の `test` タスクでは収集せず、`test:coverage` でのみ有効化する。
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // バレル・型定義・生成物・自動生成マイグレーションは計測対象から外す。
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/db/migrations/**',
      ],
    },
  },
});
