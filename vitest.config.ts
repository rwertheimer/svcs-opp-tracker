import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['backend/**', 'node'],
    ],
    setupFiles: ['./test/setup.ts'],
    globals: true,
    css: false,
  },
});
