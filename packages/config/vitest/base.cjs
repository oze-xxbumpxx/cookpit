// 共有 Vitest base 設定。各パッケージの vitest.config.ts から取り込む。
// globals は無効化し、describe/it/expect は vitest から明示 import する（明示志向の規約に整合）。
const baseConfig = {
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      // apps/web の子設定（vitest.node/dom.config.mts）が `...baseConfig.test` で取り込むため、
      // ここが `string` に広がると vitest の InlineConfig と型が合わない。リテラルに固定する。
      /** @type {'v8'} */
      provider: 'v8',
      // text-summary はローカル実行時の要約、json-summary は README バッジ等の機械可読出力、
      // html は詳細確認用。既定の `test` タスクでは収集せず、`test:coverage` でのみ有効化する。
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // バレルファイルは再エクスポートのみで分岐を持たないため計測対象から外す。
      exclude: ['src/**/index.ts'],
    },
  },
};

module.exports = { baseConfig };
