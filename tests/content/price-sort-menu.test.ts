// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PRICE_SORT_ATTRIBUTE, sortModeOf, syncPriceSort } from '../../src/content/price-sort-menu';
import { createSortSource } from '../../src/content/sort-source';

// Comme sur le site : la liste est dans un portail, hors du parent du bouton, rattachée par aria-controls ;
// l'entrée choisie porte une classe de couleur et aria-selected="true".
function mount() {
  document.body.innerHTML = `
    <div><button aria-label="Trier la collection" aria-controls="sort-list">Rareté</button></div>
    <ul id="sort-list" role="listbox">
      <li role="none"><button role="option" aria-selected="true" class="on">Rareté</button></li>
      <li role="none"><button role="option" aria-selected="false" class="off">Nom</button></li>
    </ul>`;
}

const priceButton = () => document.querySelector<HTMLElement>(`[${PRICE_SORT_ATTRIBUTE}] button`);
const rarityButton = () => document.querySelector<HTMLElement>('#sort-list li:first-child button');

describe('syncPriceSort', () => {
  it("ajoute « Prix de vente décroissant » à une liste affichée dans un portail", () => {
    mount();
    syncPriceSort(document, true, createSortSource());
    expect(document.querySelector(`[${PRICE_SORT_ATTRIBUTE}]`)?.textContent?.trim()).toBe('Prix de vente décroissant');
  });

  it("n'est colorée que lorsque le tri par prix est choisi", () => {
    mount();
    const source = createSortSource();
    syncPriceSort(document, true, source);
    expect(priceButton()?.className).toBe('off');
    expect(priceButton()?.getAttribute('aria-selected')).toBe('false');
    expect(rarityButton()?.className).toBe('on');

    source.set('price');
    syncPriceSort(document, true, source);
    expect(priceButton()?.className).toBe('on');
    expect(priceButton()?.getAttribute('aria-selected')).toBe('true');
    expect(rarityButton()?.className).toBe('off');

    source.set('rarity');
    syncPriceSort(document, true, source);
    expect(priceButton()?.className).toBe('off');
    expect(rarityButton()?.className).toBe('on');
    expect(rarityButton()?.getAttribute('aria-selected')).toBe('true');
  });

  it("retire l'entrée hors de la vue Homemade", () => {
    mount();
    syncPriceSort(document, true, createSortSource());
    syncPriceSort(document, false, createSortSource());
    expect(document.querySelector(`[${PRICE_SORT_ATTRIBUTE}]`)).toBeNull();
  });

  it('lit le tri sur l’entrée choisie dans la liste du site', () => {
    mount();
    const source = createSortSource();
    syncPriceSort(document, true, source);
    document.querySelector<HTMLElement>('#sort-list li:nth-child(2) button')?.click();
    expect(source.current()).toBe('name');
    rarityButton()?.click();
    expect(source.current()).toBe('rarity');
  });

  it('reprend le tri affiché par le site au premier affichage', () => {
    mount();
    document.querySelector('button[aria-label]')!.textContent = "Date d'ajout";
    const source = createSortSource();
    syncPriceSort(document, true, source);
    expect(source.current()).toBe('added');
  });
});

describe('sortModeOf', () => {
  it('associe les libellés du site à leur tri', () => {
    expect(sortModeOf('Rareté')).toBe('rarity');
    expect(sortModeOf('Nom')).toBe('name');
    expect(sortModeOf('Favoris')).toBe('starred');
    expect(sortModeOf("Date d'ajout")).toBe('added');
  });
});

describe('clic sur « Prix de vente décroissant »', () => {
  it('pose le tri par prix même après le clic de rareté', async () => {
    mount();
    const source = createSortSource();
    syncPriceSort(document, true, source);
    priceButton()?.click();
    await Promise.resolve();
    expect(source.current()).toBe('price');
  });
});
