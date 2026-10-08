// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readView } from '../../src/content/collection-view';
import { decorateLibraryEntry } from '../../src/content/library-menu';

describe('Ma Pièce', () => {
  it('n’est plus une vue de la Collection : l’ancien choix retombe sur homemade', () => {
    expect(readView({ getItem: () => 'library' })).toBe('homemade');
  });

  it('s’ajoute juste après « Collection », une seule fois, et ouvre la fenêtre', () => {
    document.body.innerHTML = '<nav style="display:flex"><a href="/home">Accueil</a><a href="/collection"><svg></svg>Collection</a><a href="/shop">Boutique</a></nav>';
    const onOpen = vi.fn();
    expect(decorateLibraryEntry(document, onOpen)).toBe(1);
    expect(decorateLibraryEntry(document, onOpen)).toBe(0);
    const entry = document.querySelector<HTMLElement>('[data-wmt-library-entry]');
    expect(entry?.previousElementSibling?.getAttribute('href')).toBe('/collection');
    expect(entry?.textContent).toContain('Ma Pièce');
    entry?.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
