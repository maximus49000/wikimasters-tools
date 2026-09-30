// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findCardTitle,
  findCollectionSearch,
  reopenCard,
} from '../../src/content/collection-reopen';

const SEARCH = '<input placeholder="Rechercher par titre ou catégorie..." type="text" value="">';

function card(title: string): string {
  return (
    '<div class="relative isolate group"><div class="cursor-pointer">' +
    '<div class="absolute"><h3 class="text-xs">' +
    title +
    '</h3><p>description</p></div></div></div>'
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findCollectionSearch', () => {
  it('repère le champ de recherche de la Collection par son placeholder', () => {
    document.body.innerHTML = SEARCH + '<input placeholder="Rechercher une carte…" type="search">';
    expect(findCollectionSearch(document)?.placeholder).toContain('titre ou catégorie');
  });

  it('renvoie null s’il est absent', () => {
    document.body.innerHTML = '<input placeholder="Ajouter une étiquette…" type="text">';
    expect(findCollectionSearch(document)).toBeNull();
  });
});

describe('findCardTitle', () => {
  it('trouve le titre exact malgré espaces et normalisation Unicode', () => {
    document.body.innerHTML = card('Autre carte') + card('  Théorème   de Ptolémée ');
    const heading = findCardTitle(document, 'Théorème de Ptolémée'.normalize('NFD'));
    expect(heading?.textContent).toContain('Ptolémée');
  });

  it('ne confond pas un titre plus long avec le titre cherché', () => {
    document.body.innerHTML = card('Ted Lasso (série)');
    expect(findCardTitle(document, 'Ted Lasso')).toBeNull();
  });
});

describe('reopenCard', () => {
  it('clique tout de suite si la carte est déjà affichée', async () => {
    document.body.innerHTML = card('Ted Lasso');
    const onClick = vi.fn();
    document.querySelector('.cursor-pointer')!.addEventListener('click', onClick);

    expect(await reopenCard(document, 'Ted_Lasso', { timeoutMs: 200 })).toBe('opened');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('saisit le titre dans la recherche puis clique la carte qui apparaît', async () => {
    document.body.innerHTML = `${SEARCH}<div id="grid">${card('Autre carte')}</div>`;
    const input = document.querySelector('input')!;
    const grid = document.querySelector('#grid')!;
    const onClick = vi.fn();
    grid.addEventListener('click', onClick);
    // Le site filtre la grille peu après la saisie.
    input.addEventListener('input', () => {
      setTimeout(() => (grid.innerHTML = card(input.value)), 40);
    });

    expect(await reopenCard(document, 'Ted_Lasso', { timeoutMs: 500 })).toBe('opened');
    expect(input.value).toBe('Ted Lasso');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('attend l’apparition du champ de recherche (page qui se charge)', async () => {
    const grid = '<div id="grid"></div>';
    setTimeout(() => {
      document.body.innerHTML = SEARCH + grid;
      const input = document.querySelector('input')!;
      input.addEventListener('input', () => {
        document.querySelector('#grid')!.innerHTML = card(input.value);
      });
    }, 50);
    expect(await reopenCard(document, 'Ted_Lasso', { timeoutMs: 500 })).toBe('opened');
  });

  it('renvoie not-found si la carte n’apparaît jamais', async () => {
    document.body.innerHTML = `${SEARCH}<div id="grid">${card('Autre carte')}</div>`;
    expect(await reopenCard(document, 'Ted_Lasso', { timeoutMs: 100 })).toBe('not-found');
  });

  it('renvoie not-found si ni carte ni champ de recherche n’existent', async () => {
    expect(await reopenCard(document, 'Ted_Lasso', { timeoutMs: 80 })).toBe('not-found');
  });
});
