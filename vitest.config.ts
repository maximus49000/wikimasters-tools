import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __WMT_FIXES__: '[]', __WMT_BUILD__: '"0.0.0+0"', __WMT_ART_DEFAULT__: '"classic"' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
