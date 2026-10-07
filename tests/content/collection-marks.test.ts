import { describe, expect, it, vi } from 'vitest';
import { createCollectionMarks } from '../../src/content/collection-marks';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { ownedCardOf } from '../../src/core/collection/work-marks';
import type { ScreenState } from '../../src/core/screen/screen-repo';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup(cards: KnownCard[], initial: ScreenState, wikidata: ScreenState) {
  let state = initial;
  let collectionListener: (() => void) | undefined;
  const resolve = vi.fn(async (slugs: string[]) => {
    state = { ...state, ...Object.fromEntries(slugs.filter((slug) => wikidata[slug]).map((slug) => [slug, wikidata[slug]!])) };
    return state;
  });
  const marks = createCollectionMarks({
    collection: { list: async () => cards, subscribe: (listener) => ((collectionListener = listener), () => undefined) },
    screen: { load: async () => state, resolve },
    screenSlugs: async (list) => new Set(list.filter((card) => card.slug !== 'Paris').map((card) => card.slug)),
  });
  return { marks, resolve, notify: () => collectionListener?.() };
}

describe('createCollectionMarks', () => {
  it('rend l’état déjà connu, puis complète par Wikidata en arrière-plan', async () => {
    const cards = [{ slug: 'Inception', title: 'Inception', rarity: 'L', copies: 1 }, { slug: 'Paris', title: 'Paris' }];
    const { marks, resolve } = setup(cards, {}, { Inception: { movieId: 27205 } });
    const listener = vi.fn();
    marks.subscribe(listener);
    expect(marks.ownership().movie.size).toBe(0);
    marks.ensure();
    await flush();
    expect(ownedCardOf(marks.ownership(), 'movie', 27205)?.slug).toBe('Inception');
    expect(listener).toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(['Inception']); // « Paris » n'est pas une carte de cinéma
  });

  it('ne publie un nouvel objet que si ce qui s’affiche change', async () => {
    const { marks, notify } = setup([{ slug: 'A', title: 'A', copies: 1 }], { A: { movieId: 1 } }, {});
    marks.ensure();
    await flush();
    const first = marks.ownership();
    notify();
    await flush();
    expect(marks.ownership()).toBe(first);
  });

  it('ne lance la résolution qu’une fois, même après plusieurs appels', async () => {
    const { marks, resolve } = setup([{ slug: 'A', title: 'A' }], {}, {});
    marks.ensure();
    marks.ensure();
    await flush();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('résout par lots de 50 articles', async () => {
    const cards = Array.from({ length: 120 }, (_, i) => ({ slug: `C${i}`, title: `C${i}` }));
    const { marks, resolve } = setup(cards, {}, {});
    marks.ensure();
    await flush();
    expect(resolve.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it('survit à un échec réseau sans lever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const marks = createCollectionMarks({
      collection: { list: async () => [{ slug: 'A', title: 'A' }], subscribe: () => () => undefined },
      screen: { load: async () => ({}), resolve: async () => Promise.reject(new Error('429')) },
      screenSlugs: async () => new Set(['A']),
    });
    marks.ensure();
    await flush();
    expect(marks.ownership().movie.size).toBe(0);
  });
});
