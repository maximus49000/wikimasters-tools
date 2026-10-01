// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KIND_ROW_ATTRIBUTE, ensureKindRow, removeKindRow, type KindRowModel } from '../../src/content/kind-row';

const model = (over: Partial<KindRowModel> = {}): KindRowModel => ({
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
const handlers = () => ({ onNature: vi.fn(), onFacet: vi.fn() });

let target: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="pills"><button>L</button><button>UR</button></div>';
  target = document.getElementById('pills') as HTMLElement;
});

const selects = (row: HTMLElement) => [...row.querySelectorAll('select')];

describe('ensureKindRow', () => {
  it('insère la rangée juste avant la cible, avec deux listes', () => {
    const row = ensureKindRow(target, model(), handlers());
    expect(target.previousElementSibling).toBe(row);
    expect(row.hasAttribute(KIND_ROW_ATTRIBUTE)).toBe(true);
    const [nature, facet] = selects(row);
    expect([...(nature?.options ?? [])].map((o) => o.text)).toEqual(['Nature', 'Personne (3)', 'Album (2)']);
    expect([...(facet?.options ?? [])].map((o) => o.text)).toEqual(['Occupation / genre', 'Chanteur (2)']);
  });

  it('sélectionne les valeurs courantes', () => {
    const row = ensureKindRow(target, model({ nature: 'group:Album', facet: 'Q177220' }), handlers());
    const [nature, facet] = selects(row);
    expect(nature?.value).toBe('group:Album');
    expect(facet?.value).toBe('Q177220');
  });

  it('est idempotent et ne reconstruit pas des options inchangées', () => {
    const first = ensureKindRow(target, model(), handlers());
    const option = selects(first)[0]?.options[1];
    const second = ensureKindRow(target, model({ nature: 'group:Album' }), handlers());
    expect(second).toBe(first);
    expect(document.querySelectorAll(`[${KIND_ROW_ATTRIBUTE}]`)).toHaveLength(1);
    expect(selects(second)[0]?.options[1]).toBe(option);
    expect(selects(second)[0]?.value).toBe('group:Album');
  });

  it('met à jour les options quand elles changent', () => {
    const row = ensureKindRow(target, model(), handlers());
    ensureKindRow(target, model({ facets: [{ id: 'Q11399', label: 'Rock', count: 1 }], facetPlaceholder: 'Genre' }), handlers());
    expect([...(selects(row)[1]?.options ?? [])].map((o) => o.text)).toEqual(['Genre', 'Rock (1)']);
  });

  it('grise le 2ᵉ filtre quand il n’a aucun choix', () => {
    const row = ensureKindRow(target, model({ facets: [], facetPlaceholder: 'Aucun choix' }), handlers());
    expect(selects(row)[1]?.disabled).toBe(true);
    ensureKindRow(target, model(), handlers());
    expect(selects(row)[1]?.disabled).toBe(false);
  });

  it('appelle le dernier gestionnaire fourni avec la valeur choisie', () => {
    const old = handlers();
    const latest = handlers();
    ensureKindRow(target, model(), old);
    const row = ensureKindRow(target, model(), latest);
    const [nature, facet] = selects(row);
    if (!nature || !facet) throw new Error('listes absentes');
    nature.value = 'group:Album';
    nature.dispatchEvent(new Event('change'));
    facet.value = 'Q177220';
    facet.dispatchEvent(new Event('change'));
    expect(old.onNature).not.toHaveBeenCalled();
    expect(latest.onNature).toHaveBeenCalledWith('group:Album');
    expect(latest.onFacet).toHaveBeenCalledWith('Q177220');
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
