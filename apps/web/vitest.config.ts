import { defineConfig } from 'vitest/config';

// node（Hono ルート）と happy-dom（コンポーネント）で環境を分けるため
// projects で 2 設定に分割する（設計書 §6.3 案 1）。
export default defineConfig({
  test: {
    projects: ['./vitest.node.config.ts', './vitest.dom.config.ts'],
  },
});
