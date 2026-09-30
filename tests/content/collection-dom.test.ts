// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findCardGrid,
  findCollectionRoot,
  findSelectButton,
  restoreHiddenGrids,
  scanCollectionCards,
  setGridHidden,
} from '../../src/content/collection-dom';

const SELECT =
  '<button type="button" class="px-3"><svg class="lucide lucide-square-check-big size-4"></svg>Sélectionner</button>';

function card(title: string): string {
  return `<div class="card"><div><img src="x.png"><h3>${title}</h3></div></div>`;
}

function page(cards: string[]): string {
  return `<main><h1>Collection</h1><div id="tools">${SELECT}</div><div id="grid">${cards.join('')}</div></main>`;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findSelectButton', () => {
  it('repère le bouton par son texte', () => {
    document.body.innerHTML = '<button>Autre</button>' + SELECT;
    expect(findSelectButton(document)?.textContent).toBe('Sélectionner');
  });

  it("se rabat sur l'icône si le texte change", () => {
    document.body.innerHTML = '<button><svg class="lucide-square-check-big"></svg>Choisir</button>';
    expect(findSelectButton(document)?.textContent).toBe('Choisir');
  });

  it('renvoie null s\'il est absent', () => {
    document.body.innerHTML = '<button>Autre</button>';
    expect(findSelectButton(document)).toBeNull();
  });
});

describe('scanCollectionCards', () => {
  it('lit le titre et le slug des cartes, sans doublon', () => {
    document.body.innerHTML = page([card('Tour Eiffel'), card('Paris'), card('Paris')]);
    const root = findCollectionRoot(findSelectButton(document) as HTMLElement) as HTMLElement;
    expect(scanCollectionCards(root)).toEqual([
      { slug: 'Tour_Eiffel', title: 'Tour Eiffel' },
      { slug: 'Paris', title: 'Paris' },
    ]);
  });
});

describe('findCollectionRoot', () => {
  it('renvoie le premier ancêtre du bouton qui contient des cartes', () => {
    document.body.innerHTML = page([card('Paris')]);
    const button = findSelectButton(document) as HTMLElement;
    expect(findCollectionRoot(button)?.tagName).toBe('MAIN');
  });

  it('renvoie null quand aucune carte n\'est affichée', () => {
    document.body.innerHTML = page([]);
    expect(findCollectionRoot(findSelectButton(document) as HTMLElement)).toBeNull();
  });
});

describe('findCardGrid', () => {
  it('renvoie le conteneur commun des cartes', () => {
    document.body.innerHTML = page([card('Paris'), card('Berlin')]);
    const button = findSelectButton(document) as HTMLElement;
    expect(findCardGrid(findCollectionRoot(button) as HTMLElement, button)?.id).toBe('grid');
  });

  it('avec une seule carte, ne masque jamais la page entière', () => {
    document.body.innerHTML = page([card('Paris')]);
    const button = findSelectButton(document) as HTMLElement;
    expect(findCardGrid(findCollectionRoot(button) as HTMLElement, button)).toBeNull();
  });

  it('refuse un conteneur qui contient le bouton ou qui est la page entière', () => {
    document.body.innerHTML = `<main><div id="all">${SELECT}${card('Paris')}${card('Berlin')}</div></main>`;
    const button = findSelectButton(document) as HTMLElement;
    expect(findCardGrid(findCollectionRoot(button) as HTMLElement, button)).toBeNull();
  });
});

describe('setGridHidden / restoreHiddenGrids', () => {
  it('masque puis rétablit l\'affichage d\'origine', () => {
    document.body.innerHTML = '<div id="g" style="display:grid"></div>';
    const grid = document.getElementById('g') as HTMLElement;

    setGridHidden(grid, true);
    setGridHidden(grid, true);
    expect(grid.style.display).toBe('none');

    setGridHidden(grid, false);
    expect(grid.style.display).toBe('grid');
    expect(grid.hasAttribute('data-wmt-grid-hidden')).toBe(false);
  });

  it('restoreHiddenGrids rétablit toutes les grilles masquées', () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    for (const id of ['a', 'b']) setGridHidden(document.getElementById(id) as HTMLElement, true);
    restoreHiddenGrids(document);
    expect(document.querySelectorAll('[data-wmt-grid-hidden]')).toHaveLength(0);
    expect((document.getElementById('a') as HTMLElement).style.display).toBe('');
  });
});
