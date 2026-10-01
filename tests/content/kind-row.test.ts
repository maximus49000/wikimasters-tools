// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KIND_ROW_ATTRIBUTE, ensureKindRow, removeKindRow, type KindRowModel } from '../../src/content/kind-row';
import { ensureViewSwitch } from '../../src/content/world-toggle';

const model = (over: Partial<KindRowModel> = {}): KindRowModel => ({
  category: '',
  categories: [
    { id: 'music', label: 'Musique', count: 5 },
    { id: 'film', label: 'Films / Série', count: 1 },
    { id: 'other', label: 'Autre', count: 0 },
  ],
  nature: '',
  facet: '',
  natures: [
    { id: 'group:Personne', label: 'Personne', count: 3 },
    { id: 'group:Album', label: 'Album', count: 2 },
  ],
  facets: [{ id: 'Q177220', label: 'Chanteur', count: 2 }],
  facetPlaceholder: 'Occupation / genre',
  progress: null,
  ...over,
});
const handlers = () => ({ onCategory: vi.fn(), onNature: vi.fn(), onFacet: vi.fn() });

let target: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="pills"><button>L</button><button>UR</button></div>';
  target = document.getElementById('pills') as HTMLElement;
});

const texts = (row: HTMLElement, kind: string) =>
  [...row.querySelectorAll(`[data-wmt-kind-list="${kind}"] [role="option"]`)].map((o) => o.textContent);
const trigger = (row: HTMLElement, kind: string) => row.querySelector(`button[data-wmt-kind="${kind}"]`) as HTMLButtonElement;
const listOf = (row: HTMLElement, kind: string) => row.querySelector(`[data-wmt-kind-list="${kind}"]`) as HTMLElement;
const option = (row: HTMLElement, kind: string, index: number) =>
  row.querySelectorAll(`[data-wmt-kind-list="${kind}"] [role="option"]`)[index] as HTMLElement;

describe('ensureKindRow', () => {
  it('insère la rangée juste avant la cible, avec trois listes qui commencent par « Tout »', () => {
    const row = ensureKindRow(target, model(), handlers());
    expect(target.previousElementSibling).toBe(row);
    expect(row.hasAttribute(KIND_ROW_ATTRIBUTE)).toBe(true);
    expect(texts(row, 'category')).toEqual(['Tout', 'Musique (5)', 'Films / Série (1)', 'Autre (0)']);
    expect(texts(row, 'nature')).toEqual(['Tout', 'Personne (3)', 'Album (2)']);
    expect(texts(row, 'facet')).toEqual(['Tout', 'Chanteur (2)']);
  });

  it('signale le choix d’une catégorie', () => {
    const h = handlers();
    const row = ensureKindRow(target, model(), h);
    document.body.append(row);
    trigger(row, 'category').click();
    option(row, 'category', 1).click();
    expect(h.onCategory).toHaveBeenCalledWith('music');
    expect(trigger(row, 'category').textContent).toBe('Catégorie');
  });

  it('affiche le nom de la liste quand rien n’est choisi, et le choix courant sinon', () => {
    const row = ensureKindRow(target, model(), handlers());
    expect(trigger(row, 'nature').textContent).toBe('Nature');
    expect(trigger(row, 'facet').textContent).toBe('Occupation / genre');
    ensureKindRow(target, model({ nature: 'group:Album', facet: 'Q177220' }), handlers());
    expect(trigger(row, 'nature').textContent).toBe('Album (2)');
    expect(trigger(row, 'facet').textContent).toBe('Chanteur (2)');
    expect(option(row, 'nature', 2).getAttribute('aria-selected')).toBe('true');
    expect(option(row, 'nature', 0).getAttribute('aria-selected')).toBe('false');
  });

  it('s’ouvre au clic, se ferme au choix, au clic ailleurs et sur Échap', () => {
    const row = ensureKindRow(target, model(), handlers());
    document.body.append(row);
    expect(listOf(row, 'nature').hidden).toBe(true);
    trigger(row, 'nature').click();
    expect(listOf(row, 'nature').hidden).toBe(false);
    expect(trigger(row, 'nature').getAttribute('aria-expanded')).toBe('true');
    trigger(row, 'facet').click();
    expect(listOf(row, 'nature').hidden).toBe(true);
    expect(listOf(row, 'facet').hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(listOf(row, 'facet').hidden).toBe(true);
    trigger(row, 'nature').click();
    trigger(row, 'nature').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(listOf(row, 'nature').hidden).toBe(true);
    trigger(row, 'nature').click();
    option(row, 'nature', 1).click();
    expect(listOf(row, 'nature').hidden).toBe(true);
  });

  it('est idempotent et ne reconstruit pas des options inchangées', () => {
    const first = ensureKindRow(target, model(), handlers());
    const kept = option(first, 'nature', 1);
    const second = ensureKindRow(target, model({ nature: 'group:Album' }), handlers());
    expect(second).toBe(first);
    expect(document.querySelectorAll(`[${KIND_ROW_ATTRIBUTE}]`)).toHaveLength(1);
    expect(option(second, 'nature', 1)).toBe(kept);
  });

  it('met à jour les options quand elles changent', () => {
    const row = ensureKindRow(target, model(), handlers());
    ensureKindRow(target, model({ facets: [{ id: 'Q11399', label: 'Rock', count: 1 }], facetPlaceholder: 'Genre' }), handlers());
    expect(texts(row, 'facet')).toEqual(['Tout', 'Rock (1)']);
    expect(trigger(row, 'facet').textContent).toBe('Genre');
  });

  it('grise le 2ᵉ filtre quand il n’a aucun choix, mais garde « Tout »', () => {
    const row = ensureKindRow(target, model({ facets: [], facetPlaceholder: 'Aucun choix' }), handlers());
    expect(trigger(row, 'facet').disabled).toBe(true);
    expect(texts(row, 'facet')).toEqual(['Tout']);
    ensureKindRow(target, model(), handlers());
    expect(trigger(row, 'facet').disabled).toBe(false);
  });

  it('appelle le dernier gestionnaire fourni avec la valeur choisie, « Tout » donnant une valeur vide', () => {
    const old = handlers();
    const latest = handlers();
    ensureKindRow(target, model(), old);
    const row = ensureKindRow(target, model({ nature: 'group:Album', facet: 'Q177220' }), latest);
    option(row, 'nature', 1).click();
    option(row, 'facet', 0).click();
    option(row, 'nature', 0).click();
    expect(old.onNature).not.toHaveBeenCalled();
    expect(latest.onNature).toHaveBeenNthCalledWith(1, 'group:Personne');
    expect(latest.onNature).toHaveBeenNthCalledWith(2, '');
    expect(latest.onFacet).toHaveBeenCalledWith('');
  });

  it('affiche la progression du relevé, et la masque quand elle est terminée', () => {
    const row = ensureKindRow(target, model({ progress: '120 / 450 cartes classées' }), handlers());
    const progress = row.querySelector('[data-wmt-kind="progress"]') as HTMLElement;
    expect(progress.textContent).toBe('120 / 450 cartes classées');
    expect(progress.hidden).toBe(false);
    ensureKindRow(target, model({ progress: null }), handlers());
    expect(progress.hidden).toBe(true);
  });
});

describe('ensureKindRow — pas d’écriture inutile', () => {
  it('ne touche pas au DOM quand rien ne change (sinon l’observateur de la page boucle)', () => {
    const row = ensureKindRow(target, model({ nature: 'group:Album', progress: '1 / 3 cartes classées' }), handlers());
    const observer = new MutationObserver(() => undefined);
    observer.observe(row, { childList: true, subtree: true, attributes: true, characterData: true });

    ensureKindRow(target, model({ nature: 'group:Album', progress: '1 / 3 cartes classées' }), handlers());

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});

describe('removeKindRow', () => {
  it('retire la rangée', () => {
    ensureKindRow(target, model(), handlers());
    removeKindRow(document);
    expect(document.querySelector(`[${KIND_ROW_ATTRIBUTE}]`)).toBeNull();
  });
});

describe('sans pastilles de rareté (repli sur « Sélectionner »)', () => {
  it('ne duplique ni la rangée ni le sélecteur de vues à la synchronisation suivante', () => {
    document.body.innerHTML = '<div id="bar"><button type="button" class="px-3">Sélectionner</button></div>';
    const button = document.querySelector('button') as HTMLButtonElement;
    for (let round = 0; round < 2; round += 1) {
      ensureViewSwitch(button, button, 'homemade', () => undefined);
      ensureKindRow(button, model(), handlers());
    }
    expect(document.querySelectorAll('[data-wmt-view-switch]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-wmt-kind-row]')).toHaveLength(1);
    expect(button.nextElementSibling?.hasAttribute('data-wmt-view-switch')).toBe(true);
  });
});
