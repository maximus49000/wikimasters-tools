// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PRICE_SORT_ATTRIBUTE, syncPriceSort } from '../../src/content/price-sort-menu';
import { createSortSource } from '../../src/content/sort-source';

// Comme sur le site : la liste est dans un portail, hors du parent du bouton, rattachée par aria-controls.
function mount() {
  document.body.innerHTML = `
    <div><button aria-label="Trier la collection" aria-controls="sort-list">Rareté</button></div>
    <ul id="sort-list" role="listbox">
      <li role="none"><button>Rareté</button></li>
      <li role="none"><button>Nom</button></li>
    </ul>`;
}

describe('syncPriceSort', () => {
  it("ajoute « Prix de vente décroissant » à une liste affichée dans un portail", () => {
    mount();
    syncPriceSort(document, true, createSortSource());
    const entry = document.querySelector(`[${PRICE_SORT_ATTRIBUTE}]`);
    expect(entry?.textContent?.trim()).toBe('Prix de vente décroissant');
  });

  it("retire l'entrée hors de la vue Homemade", () => {
    mount();
    syncPriceSort(document, true, createSortSource());
    syncPriceSort(document, false, createSortSource());
    expect(document.querySelector(`[${PRICE_SORT_ATTRIBUTE}]`)).toBeNull();
  });
});
