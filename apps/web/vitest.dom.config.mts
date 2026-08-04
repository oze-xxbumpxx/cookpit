import { baseConfig } from '@cookpit/config/vitest/base';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseConfig.test,
    name: 'dom',
    environment: 'happy-dom',
    include: ['tests/**/*.dom.test.ts', 'tests/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
