import { baseConfig } from '@cookpit/config/vitest/base';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseConfig.test,
    name: 'node',
    environment: 'node',
    include: ['src/**/*.node.test.ts', 'src/server/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
