// 共有 Vitest base 設定。各パッケージの vitest.config.ts から取り込む。
// globals は無効化し、describe/it/expect は vitest から明示 import する（明示志向の規約に整合）。
const baseConfig = {
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
};

module.exports = { baseConfig };
