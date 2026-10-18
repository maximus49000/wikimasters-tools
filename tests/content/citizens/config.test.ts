import { describe, expect, it } from 'vitest';
import { CITIZENS_3D, RELAY_PERSOS, RENDER_BUDGET_MS, WAIT3D_FALLBACK_MS } from '../../../src/content/figure/citizen-config';

describe('réglages des habitants 3D', () => {
  it('l’interrupteur est un booléen', () => {
    expect(typeof CITIZENS_3D).toBe('boolean');
  });

  it('l’adresse du relais des persos finit par /persos', () => {
    expect(RELAY_PERSOS.endsWith('/persos')).toBe(true);
  });

  it('les budgets de rendu et d’attente sont positifs', () => {
    expect(RENDER_BUDGET_MS).toBeGreaterThan(0);
    expect(WAIT3D_FALLBACK_MS).toBeGreaterThan(0);
  });
});
