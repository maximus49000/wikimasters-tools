// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { KIND_ROW_ATTRIBUTE } from '../../src/content/kind-row';
import { createKindRowController } from '../../src/content/kind-row-controller';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { EMPTY_KINDS, setKinds, type KindsState } from '../../src/core/kinds/kinds-book';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const cards: KnownCard[] = ['Piaf', 'Hugo', 'Thriller'].map((slug) => ({ slug, title: slug, tags: [] }));
const kindsState: KindsState = setKinds(
  EMPTY_KINDS,
  {
    Piaf: { natures: ['Q5'], occupations: ['Q177220'], genres: [] },
    Hugo: { natures: ['Q5'], occupations: ['Q36180'], genres: [] },
    Thriller: { natures: ['Q482994'], occupations: [], genres: ['Q11399'] },
  },
  { Q177220: 'chanteur', Q36180: 'écrivain', Q11399: 'pop' },
);

function setup(state: KindsState = kindsState) {
  document.body.innerHTML = '<div id="pills"><button>L</button></div>';
  const target = document.getElementById('pills') as HTMLElement;
  const kindFilterSource = createKindFilterSource(memory());
  const kinds = { load: vi.fn(async () => state), subscribe: vi.fn(() => () => undefined), resolveMissing: vi.fn(async () => undefined) };
  const collection = { list: vi.fn(async () => cards), subscribe: vi.fn(() => () => undefined) };
  const filterSource = { current: () => '', subscribe: vi.fn(() => () => undefined) };
  const controller = createKindRowController({
    collection: collection as never,
    kinds: kinds as never,
    filterSource: filterSource as never,
    kindFilterSource,
  });
  return { target, controller, kinds, kindFilterSource };
}

const row = () => document.querySelector(`[${KIND_ROW_ATTRIBUTE}]`) as HTMLElement | null;
const select = (kind: string) => row()?.querySelector<HTMLSelectElement>(`[data-wmt-kind="${kind}"]`);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createKindRowController', () => {
  it('pose la rangée avant la cible avec les natures de la collection, et lance le relevé Wikidata', async () => {
    const { target, controller, kinds } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(select('nature')?.options.length).toBe(3));

    expect(target.previousElementSibling).toBe(row());
    expect([...(select('nature')?.options ?? [])].map((o) => o.text)).toEqual(['Nature', 'Personne (2)', 'Album (1)']);
    expect(kinds.resolveMissing).toHaveBeenCalledWith(['Piaf', 'Hugo', 'Thriller']);
  });

  it('un choix de nature met à jour le filtre partagé et les occupations proposées', async () => {
    const { target, controller, kindFilterSource } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(select('nature')?.options.length).toBe(3));

    const nature = select('nature') as HTMLSelectElement;
    nature.value = 'group:Album';
    nature.dispatchEvent(new Event('change'));

    expect(kindFilterSource.current()).toEqual({ nature: 'group:Album', facet: '' });
    await vi.waitFor(() => expect([...(select('facet')?.options ?? [])].map((o) => o.text)).toEqual(['Genre', 'Pop (1)']));
  });

  it('indique la progression tant que des cartes ne sont pas classées', async () => {
    const partial = setKinds(EMPTY_KINDS, { Piaf: { natures: ['Q5'], occupations: [], genres: [] } }, {});
    const { target, controller } = setup(partial);
    controller.mount(target);
    await vi.waitFor(() => expect(row()?.querySelector('[data-wmt-kind="progress"]')?.textContent).toBe('1 / 3 cartes classées'));
  });

  it('ne relit rien quand `mount` est rappelé alors que la rangée est déjà en place (pas de boucle avec l’observateur du DOM)', async () => {
    const { target, controller, kinds } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(row()).not.toBeNull());
    const calls = kinds.load.mock.calls.length;

    controller.mount(target);
    controller.mount(target);
    await Promise.resolve();

    expect(kinds.load.mock.calls.length).toBe(calls);
  });

  it('retire la rangée au démontage, sans effacer le filtre choisi', async () => {
    const { target, controller, kindFilterSource } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(row()).not.toBeNull());
    kindFilterSource.set({ nature: 'group:Film', facet: '' });
    controller.unmount();
    expect(row()).toBeNull();
    expect(kindFilterSource.current()).toEqual({ nature: 'group:Film', facet: '' });
  });
});
