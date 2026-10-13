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

  it('n’hérite pas de la surbrillance de « Collection » quand on est sur la Collection (sans aria-current)', () => {
    window.history.replaceState(null, '', '/collection');
    document.body.innerHTML =
      '<nav style="display:flex"><a class="row rest" href="/pulls">Paquets</a><a class="row active" href="/collection"><svg></svg>Collection</a><a class="row rest" href="/trades">Échanges</a></nav>';
    decorateLibraryEntry(document, () => {});
    const entry = document.querySelector<HTMLElement>('[data-wmt-library-entry]');
    expect(entry?.className).toBe('row rest');
    window.history.replaceState(null, '', '/');
  });

  it('barre latérale : copie un voisin direct au repos (ni le logo, ni le point de « Collection »)', () => {
    window.history.replaceState(null, '', '/collection');
    document.body.innerHTML =
      '<nav><div><a class="logo" href="/">Logo</a></div><a class="row rest" href="/pulls"><svg></svg>Paquets</a>' +
      '<a class="row active" href="/collection"><svg></svg>Collection<span class="dot"></span></a><a class="row rest" href="/trades"><svg></svg>Échanges</a></nav>';
    decorateLibraryEntry(document, () => {});
    const entry = document.querySelector<HTMLElement>('[data-wmt-library-entry]');
    expect(entry?.className).toBe('row rest');
    expect(entry?.querySelector('.dot')).toBeNull();
    expect(entry?.textContent).toBe('Ma Pièce');
    expect(entry?.previousElementSibling?.getAttribute('href')).toBe('/collection');
    window.history.replaceState(null, '', '/');
  });
});
