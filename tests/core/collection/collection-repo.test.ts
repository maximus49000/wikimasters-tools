import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { mergeCards } from '../../../src/core/collection/collection-book';
import { createCollectionRepo } from '../../../src/core/collection/collection-repo';

const PARIS = { slug: 'Paris', title: 'Paris' };
const EIFFEL = { slug: 'Tour_Eiffel', title: 'Tour Eiffel' };

describe('mergeCards', () => {
  it('ajoute les nouvelles cartes', () => {
    expect(mergeCards({}, [PARIS, EIFFEL])).toEqual({ Paris: PARIS, Tour_Eiffel: EIFFEL });
  });

  it('renvoie le même objet quand rien ne change', () => {
    const state = mergeCards({}, [PARIS]);
    expect(mergeCards(state, [PARIS])).toBe(state);
  });

  it("met à jour un titre modifié sans toucher l'état d'origine", () => {
    const state = mergeCards({}, [PARIS]);
    const next = mergeCards(state, [{ slug: 'Paris', title: 'Paris (ville)' }]);
    expect(next['Paris']?.title).toBe('Paris (ville)');
    expect(state['Paris']?.title).toBe('Paris');
  });
});

describe('mergeCards (rareté et image)', () => {
  it('complète une carte connue avec sa rareté et son image', () => {
    const state = mergeCards({}, [PARIS]);
    const next = mergeCards(state, [{ ...PARIS, rarity: 'SR', imageUrl: 'https://exemple.test/p.jpg' }]);
    expect(next['Paris']).toEqual({ ...PARIS, rarity: 'SR', imageUrl: 'https://exemple.test/p.jpg' });
    expect(state['Paris']).toEqual(PARIS);
  });

  it("n'efface pas la rareté connue quand une observation n'en a pas (lecture de la page)", () => {
    const state = mergeCards({}, [{ ...PARIS, rarity: 'SR' }]);
    expect(mergeCards(state, [PARIS])).toBe(state);
  });
});

describe('mergeCards (consultations)', () => {
  it('complète une carte avec ses consultations, les met à jour, et les garde quand une observation n’en a pas', () => {
    const state = mergeCards({}, [{ ...PARIS, pageviews: 100 }]);
    expect(state['Paris']?.pageviews).toBe(100);
    expect(mergeCards(state, [PARIS])).toBe(state);
    expect(mergeCards(state, [{ ...PARIS, pageviews: 250 }])['Paris']?.pageviews).toBe(250);
  });
});

describe('createCollectionRepo', () => {
  it('persiste les cartes et les relit', async () => {
    const store = createMemoryStore();
    await createCollectionRepo(store).observe([PARIS, EIFFEL]);
    const cards = await createCollectionRepo(store).list();
    expect(cards.map((c) => c.slug).sort()).toEqual(['Paris', 'Tour_Eiffel']);
  });

  it('ne perd aucune carte quand plusieurs observations arrivent en même temps', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    await Promise.all([repo.observe([PARIS]), repo.observe([EIFFEL])]);
    expect(await repo.list()).toHaveLength(2);
  });

  it('prévient les abonnés seulement quand une carte est nouvelle', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);

    await repo.observe([PARIS]);
    await repo.observe([PARIS]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await repo.observe([EIFFEL]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('exemplaires', () => {
  it("s'ajoutent au compte connu en mode cumul, et une observation sans compte les conserve", () => {
    const first = mergeCards({}, [{ ...PARIS, copies: 2 }], true);
    const second = mergeCards(first, [{ ...PARIS, copies: 1 }], true);
    expect(second['Paris']?.copies).toBe(3);
    expect(mergeCards(second, [PARIS])['Paris']?.copies).toBe(3);
  });
});

describe('mouvements de la collection', () => {
  it('une carte vendue perd un exemplaire puis quitte la collection à zéro', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    await repo.observe([{ ...PARIS, copies: 2 }, { ...EIFFEL, copies: 1 }], true);
    await repo.adjustCopies({ [PARIS.slug]: -1, [EIFFEL.slug]: -1 });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ slug: PARIS.slug, copies: 1 });
  });

  it('ne touche pas une carte dont le nombre d’exemplaires est inconnu', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    await repo.observe([PARIS]);
    await repo.adjustCopies({ [PARIS.slug]: -1 });
    expect(await repo.list()).toHaveLength(1);
  });

  it('en fin de parcours complet, remplace les nombres et retire les cartes non recomptées', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    await repo.observe([{ ...PARIS, copies: 1 }, { ...EIFFEL, copies: 4 }], true);
    await repo.replaceCopies({ [PARIS.slug]: 3 });
    expect(await repo.list()).toEqual([{ ...PARIS, copies: 3 }]);
  });

  it('sans aucun nombre compté, ne vide pas la collection', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    await repo.observe([{ ...PARIS, copies: 1 }], true);
    await repo.replaceCopies({});
    expect(await repo.list()).toHaveLength(1);
  });
});
