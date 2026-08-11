import { baseConfig } from '@cookpit/config/vitest/base';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseConfig.test,
    name: 'node',
    environment: 'node',
    include: ['tests/**/*.node.test.ts', 'tests/server/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // Next.js は webpack のエイリアス（サーバービルドのみ）でこのパッケージを空実装
      // （`server-only/empty.js`）へ差し替える。Vitest はその仕組みを持たないため、
      // Hono ルート（node プロジェクト = サーバー実行が前提）でも同様にエイリアスする。
      // dom プロジェクト（Client Component 想定）は意図的にエイリアスせず、誤って
      // `repositories.ts` を import すると throw する既存パッケージの挙動をガードとして残す
      // （`apps/web/src/server/repositories.ts` の `import 'server-only'` 追加に伴う対応）。
      'server-only': new URL('./node_modules/server-only/empty.js', import.meta.url).pathname,
    },
  },
});
