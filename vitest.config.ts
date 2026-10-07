import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __WMT_FIXES__: '[]' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
