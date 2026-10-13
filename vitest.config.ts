import { defineConfig } from 'vitest/config';
import { DELAI_LOURD_MS, FAMILLES, TRAVAILLEURS_LOURDS, motifsDeTests } from './tests/familles.ts';

// Une famille de tests = un projet vitest (voir tests/familles.ts).
// `npm test` (TNR global) joue tout : d'abord les familles légères, puis la scène (groupOrder 1),
// pour que les simulations de la scène ne se disputent pas le processeur avec le reste.
export default defineConfig({
  define: { __WMT_FIXES__: '[]', __WMT_BUILD__: '"0.0.0+0"', __WMT_ART_DEFAULT__: '"classic"' },
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'familles', include: ['tests/familles.test.ts'] } },
      ...FAMILLES.map((f) => ({
        extends: true,
        test: {
          name: f.nom,
          include: motifsDeTests(f),
          ...(f.lourde ? { testTimeout: DELAI_LOURD_MS, maxWorkers: TRAVAILLEURS_LOURDS, sequence: { groupOrder: 1 } } : {}),
        },
      })),
    ],
  },
});
