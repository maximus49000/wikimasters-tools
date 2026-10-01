// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openCardInPage } from '../../src/content/open-card';

describe('openCardInPage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/collection');
  });

  it("sur la page de la Collection ouverte, rouvre la fiche sans changer de page", () => {
    const reopen = vi.fn();
    openCardInPage('Queen_(band)', reopen);
    expect(reopen).toHaveBeenCalledWith('Queen_(band)');
    expect(window.location.pathname).toBe('/collection');
  });
});
