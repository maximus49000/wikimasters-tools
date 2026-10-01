import { describe, expect, it } from 'vitest';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createHistoryRepo } from '../../../src/core/market/history-repo';
import { createMarketCollector, POLL_INTERVAL_MS } from '../../../src/core/market/market-poll';
import type { MarketAuction } from '../../../src/core/market/schemas';

const T0 = Date.parse('2026-09-30T10:00:00Z');
const MIN = 60_000;

const slugOf = (title: string): string => title.replace(/ /g, '_');

function auction(id: string, title: string, price: number, bid = true): MarketAuction {
  return {
    id,
    card_id: `card-${title}`,
    status: 'active',
    end_at: new Date(T0 + 3_600_000 * 5).toISOString(),
    effective_bid: price,
    current_bidder_id: bid ? 'b' : null,
    is_shiny: false,
    snapshot_rarity: 'SR',
    card: { wikipedia_title: title, wikipedia_url: `https://fr.wikipedia.org/wiki/${slugOf(title)}` },
  };
}

const target = (title: string) => ({ slug: slugOf(title), title });

// Un faux site : chaque recherche renvoie les enchères du catalogue dont le titre contient la requête.
function site(catalog: MarketAuction[]) {
  const calls: string[] = [];
  const hooks = new Map<string, () => Promise<{ auctions: MarketAuction[] }>>();
  return {
    calls,
    hooks,
    api: {
      searchMarket: async (title: string) => {
        calls.push(title);
        const hook = hooks.get(title);
        if (hook) return hook();
        return { auctions: catalog.filter((a) => a.card.wikipedia_title.includes(title)) };
      },
    },
  };
}

// Chaque `tab(id)` simule un onglet : un collecteur neuf sur le même stockage et la même horloge.
function world(catalog: MarketAuction[] = []) {
  const store = createMemoryStore();
  const clock = { now: T0 };
  const fake = site(catalog);
  const history = createHistoryRepo(store, () => clock.now);
  const tab = (id: string, visible = true) =>
    createMarketCollector({
      api: fake.api,
      history,
      store,
      now: () => clock.now,
      isVisible: () => visible,
      id,
    });
  return { store, clock, fake, history, tab };
}

type Tab = ReturnType<ReturnType<typeof world>['tab']>;

// La requête de `title` est en vol quand l'utilisateur change de page : l'onglet se décharge.
function unloadDuring(w: ReturnType<typeof world>, tab: Tab, title: string) {
  w.fake.hooks.set(title, async () => {
    void tab.release();
    throw new TypeError('Failed to fetch');
  });
}

const samplesOf = async (w: ReturnType<typeof world>, title: string) =>
  (await w.history.lookup(slugOf(title)))[0]?.samples ?? [];

describe('relevé des cartes de la Collection', () => {
  it('ne cherche que les cartes demandées, une requête par carte', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100), auction('a2', 'Mad Max', 50)]);
    const tab = w.tab('A');
    await tab.want([target('Ted Lasso')]);
    expect(await tab.tick()).toBe('ran');
    expect(w.fake.calls).toEqual(['Ted Lasso']);
    expect(await samplesOf(w, 'Ted Lasso')).toEqual([{ t: T0, avgBid: 100, bidCount: 1, minBid: 100, maxBid: 100 }]);
    expect(await samplesOf(w, 'Mad Max')).toEqual([]);
  });

  it('ne garde que les enchères de la carte elle-même, pas celles des titres voisins', async () => {
    const w = world([
      auction('a1', 'Paris', 100),
      auction('a2', 'Paris Saint-Germain', 9_000),
      auction('a3', 'Banlieue de Paris', 5_000),
    ]);
    const tab = w.tab('A');
    await tab.want([target('Paris')]);
    await tab.tick();
    expect(w.fake.calls).toEqual(['Paris']);
    expect(await samplesOf(w, 'Paris')).toEqual([{ t: T0, avgBid: 100, bidCount: 1, minBid: 100, maxBid: 100 }]);
    expect(await samplesOf(w, 'Paris Saint-Germain')).toEqual([]);
  });

  it('ne relève pas une carte avant 30 min, puis la relève de nouveau', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const tab = w.tab('A');
    await tab.want([target('Ted Lasso')]);
    await tab.tick();
    w.clock.now += POLL_INTERVAL_MS - 1;
    await tab.want([target('Ted Lasso')]);
    expect(await w.tab('B').tick()).toBe('skipped');
    w.clock.now += 1;
    await tab.want([target('Ted Lasso')]);
    expect(await w.tab('C').tick()).toBe('ran');
    expect(w.fake.calls).toEqual(['Ted Lasso', 'Ted Lasso']);
    expect(await samplesOf(w, 'Ted Lasso')).toHaveLength(2);
  });

  it('une carte sans enchère est quand même marquée comme relevée', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want([target('Mad Max')]);
    expect(await tab.tick()).toBe('ran');
    expect(await w.tab('B').tick()).toBe('skipped');
    expect(w.fake.calls).toEqual(['Mad Max']);
  });

  it('rien à relever : aucune requête', async () => {
    const w = world([]);
    expect(await w.tab('A').tick()).toBe('skipped');
    expect(w.fake.calls).toEqual([]);
  });

  it('oublie les cartes vues il y a plus de 10 min', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    await w.tab('A').want([target('Ted Lasso')]);
    w.clock.now += 11 * MIN;
    expect(await w.tab('B').tick()).toBe('skipped');
    expect(w.fake.calls).toEqual([]);
  });

  it('plafonne une passe à 60 requêtes ; le reste suit à la passe suivante', async () => {
    const w = world([]);
    const tab = w.tab('A');
    const titles = Array.from({ length: 75 }, (_, i) => `Carte ${i}`);
    await tab.want(titles.map(target));
    await tab.tick();
    expect(w.fake.calls).toHaveLength(60);
    await tab.tick();
    expect(w.fake.calls).toHaveLength(75);
    expect(new Set(w.fake.calls).size).toBe(75);
  });

  it('seul l’état visible de l’onglet compte, aucune page du site n’est exigée', async () => {
    const w = world([]);
    await w.tab('hidden').want([target('Ted Lasso')]);
    expect(await w.tab('hidden', false).tick()).toBe('skipped');
    expect(w.fake.calls).toEqual([]);
    expect(await w.tab('visible', true).tick()).toBe('ran');
  });
});

describe('navigation, onglets multiples, erreurs', () => {
  const titles = Array.from({ length: 25 }, (_, i) => `Carte ${String(i).padStart(2, '0')}`);

  it('une navigation en cours de passe : la page suivante ne reprend que les cartes restantes', async () => {
    const w = world(titles.map((t, i) => auction(`a${i}`, t, 100 + i)));
    const first = w.tab('A');
    await first.want(titles.map(target));
    unloadDuring(w, first, 'Carte 12');
    expect(await first.tick()).toBe('interrupted');

    w.fake.hooks.clear();
    w.fake.calls.length = 0;
    w.clock.now += 5_000;
    const second = w.tab('B');
    expect(await second.tick()).toBe('ran');
    // Les 10 premières (lot enregistré) ne sont pas relues ; on repart de la 11e.
    expect(w.fake.calls[0]).toBe('Carte 10');
    expect(w.fake.calls).toHaveLength(15);
    for (const t of titles) expect(await samplesOf(w, t)).toHaveLength(1);
  });

  it('l’erreur due au déchargement de la page n’empêche pas la reprise', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const first = w.tab('A');
    await first.want([target('Ted Lasso')]);
    unloadDuring(w, first, 'Ted Lasso');
    expect(await first.tick()).toBe('interrupted');
    w.fake.hooks.clear();
    w.clock.now += 5_000;
    expect(await w.tab('B').tick()).toBe('ran');
    expect(await samplesOf(w, 'Ted Lasso')).toHaveLength(1);
  });

  it('un autre onglet qui relève en ce moment est respecté', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const a = w.tab('A');
    await a.want([target('Ted Lasso')]);
    let other: string | undefined;
    w.fake.hooks.set('Ted Lasso', async () => {
      other = await w.tab('B').tick();
      return { auctions: [auction('a1', 'Ted Lasso', 100)] };
    });
    expect(await a.tick()).toBe('ran');
    expect(other).toBe('skipped');
  });

  it('reprend après 20 s le travail d’un onglet mort dont le verrou n’a jamais été libéré', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    await w.tab('A').want([target('Ted Lasso')]);
    w.fake.hooks.set('Ted Lasso', () => new Promise(() => {}));
    void w.tab('A').tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    w.fake.hooks.clear();

    w.clock.now += 5_000;
    expect(await w.tab('B').tick()).toBe('skipped');
    w.clock.now += 20_000;
    expect(await w.tab('B').tick()).toBe('ran');
  });

  it('une vraie erreur (401, 429 persistant…) arrête la passe et attend 30 min', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const tab = w.tab('A');
    await tab.want([target('Ted Lasso')]);
    w.fake.hooks.set('Ted Lasso', async () => {
      throw new Error('401');
    });
    expect(await tab.tick()).toBe('failed');
    expect(await samplesOf(w, 'Ted Lasso')).toEqual([]);

    w.fake.hooks.clear();
    w.fake.calls.length = 0;
    w.clock.now += 5 * MIN;
    await tab.want([target('Ted Lasso')]);
    expect(await w.tab('B').tick()).toBe('skipped');
    expect(w.fake.calls).toEqual([]);

    w.clock.now += 30 * MIN;
    await tab.want([target('Ted Lasso')]);
    expect(await w.tab('C').tick()).toBe('ran');
  });

  it('ne lance jamais deux passes en même temps dans un même onglet', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const tab = w.tab('A');
    await tab.want([target('Ted Lasso')]);
    const results = await Promise.all([tab.tick(), tab.tick()]);
    expect(results.sort()).toEqual(['ran', 'skipped']);
    expect(w.fake.calls).toEqual(['Ted Lasso']);
  });
});

describe('createGameApi.searchMarket', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const setup = (responses: Response[]) => {
    const calls: string[] = [];
    const queue = [...responses];
    const fetch: FetchLike = async (input) => {
      calls.push(input);
      return queue.shift() ?? json({}, 500);
    };
    return { calls, api: createGameApi({ fetch, sleep: async () => {}, now: () => 0, minIntervalMs: 0, maxRetries: 0 }) };
  };

  it('envoie la même requête que la recherche du site, titre encodé', async () => {
    const { api, calls } = setup([json({ auctions: [auction('a', 'Ted Lasso', 10)], hasMore: false })]);
    const result = await api.searchMarket('Théorème de Ptolémée & co');
    expect(calls).toEqual([
      '/api/marketplace?page=1&limit=50&sort=recent&q=Th%C3%A9or%C3%A8me%20de%20Ptol%C3%A9m%C3%A9e%20%26%20co',
    ]);
    expect(result.auctions).toHaveLength(1);
  });

  it('accepte un résultat vide, refuse une réponse sans tableau', async () => {
    expect((await setup([json({ auctions: [] })]).api.searchMarket('x')).auctions).toEqual([]);
    await expect(setup([json({ error: 'x' })]).api.searchMarket('x')).rejects.toThrow();
  });

  it('propage une déconnexion', async () => {
    await expect(setup([json({}, 401)]).api.searchMarket('x')).rejects.toThrow();
  });
});

describe('historique local', () => {
  it('l’historique survit à la relecture du stockage', async () => {
    const store = createMemoryStore();
    await createHistoryRepo(store, () => T0).record([auction('a', 'Ted Lasso', 100)]);
    const later = createHistoryRepo(store, () => T0 + MIN);
    expect((await later.lookup('Ted_Lasso'))[0]?.samples).toHaveLength(1);
  });
});

describe('cartes en attente de relevé (glyphe de chargement)', () => {
  const names = ['Carte A', 'Carte B', 'Carte C'];

  it('une carte demandée est en attente, puis ne l’est plus une fois relevée', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want(names.map(target));
    expect([...(await tab.pendingSlugs())].sort()).toEqual(names.map(slugOf));
    await tab.tick();
    expect((await tab.pendingSlugs()).size).toBe(0);
  });

  it('chaque carte sort de l’attente dès sa propre requête, sans attendre la fin du lot', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want(names.map(target));
    let during: string[] = [];
    w.fake.hooks.set('Carte B', async () => {
      during = [...(await tab.pendingSlugs())].sort();
      return { auctions: [] };
    });
    await tab.tick();
    // A est terminée ; B (en cours) et C (en file) attendent encore.
    expect(during).toEqual([slugOf('Carte B'), slugOf('Carte C')]);
  });

  it('une carte relevée il y a moins de 30 min n’est pas en attente : pas de glyphe', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want([target('Carte A')]);
    await tab.tick();
    w.clock.now += 10 * MIN;
    await tab.want([target('Carte A'), target('Carte B')]);
    expect([...(await tab.pendingSlugs())]).toEqual([slugOf('Carte B')]);
    w.clock.now += 20 * MIN;
    await tab.want([target('Carte A')]);
    // A est de nouveau due ; B, vue il y a 20 min, n'est plus demandée.
    expect([...(await tab.pendingSlugs())]).toEqual([slugOf('Carte A')]);
  });

  it('plus aucune carte en attente après une erreur (rien n’est retenté avant 30 min)', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want(names.map(target));
    w.fake.hooks.set('Carte B', async () => {
      throw new Error('429');
    });
    expect(await tab.tick()).toBe('failed');
    expect((await tab.pendingSlugs()).size).toBe(0);
  });

  it('une carte qui n’est plus affichée depuis plus de 10 min n’est plus en attente', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want([target('Carte A')]);
    w.clock.now += 11 * MIN;
    expect((await tab.pendingSlugs()).size).toBe(0);
  });

  it('prévient les abonnés quand la liste change, jusqu’au désabonnement', async () => {
    const w = world([]);
    const tab = w.tab('A');
    let calls = 0;
    const unsubscribe = tab.subscribe(() => (calls += 1));
    await tab.want([target('Carte A')]);
    expect(calls).toBeGreaterThan(0);
    await tab.tick();
    const afterTick = calls;
    expect(afterTick).toBeGreaterThan(1);
    unsubscribe();
    await tab.want([target('Carte B')]);
    expect(calls).toBe(afterTick);
  });
});

describe('rechargement forcé d’une page', () => {
  it('relève tout de suite des cartes pourtant à jour (moins de 30 min)', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const tab = w.tab('A');
    await tab.want([target('Ted Lasso')]);
    await tab.tick();
    w.fake.calls.length = 0;
    w.clock.now += 5 * MIN;
    expect(await tab.tick()).toBe('skipped');

    await tab.force([target('Ted Lasso')]);
    expect(await tab.tick()).toBe('ran');
    expect(w.fake.calls).toEqual(['Ted Lasso']);
    expect(await samplesOf(w, 'Ted Lasso')).toHaveLength(2);
  });

  it('passe devant les cartes déjà en attente', async () => {
    const w = world([]);
    const tab = w.tab('A');
    const waiting = ['Carte 1', 'Carte 2', 'Carte 3', 'Carte 4', 'Carte 5'];
    await tab.want(waiting.map(target));
    await tab.force([target('Zeta'), target('Alpha')]);
    await tab.tick();
    expect(w.fake.calls.slice(0, 2)).toEqual(['Zeta', 'Alpha']);
    expect(w.fake.calls.slice(2).sort()).toEqual(waiting);
  });

  it('prend aussi la priorité sur une passe déjà en cours', async () => {
    const w = world([]);
    const tab = w.tab('A');
    const waiting = ['Carte 1', 'Carte 2', 'Carte 3', 'Carte 4', 'Carte 5'];
    await tab.want(waiting.map(target));
    // Pendant la première requête de la passe, l'utilisateur clique sur « Recharger ».
    w.fake.hooks.set('Carte 1', async () => {
      await tab.force([target('Urgent')]);
      return { auctions: [] };
    });
    await tab.tick();
    expect(w.fake.calls[0]).toBe('Carte 1');
    expect(w.fake.calls[1]).toBe('Urgent');
    expect(w.fake.calls).toHaveLength(6);
  });

  it('les cartes forcées ne sont pas limitées par les 60 requêtes d’une passe', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.want(Array.from({ length: 70 }, (_, i) => target(`N ${i}`)));
    await tab.force(Array.from({ length: 5 }, (_, i) => target(`F ${i}`)));
    await tab.tick();
    expect(w.fake.calls).toHaveLength(65);
    expect(w.fake.calls.slice(0, 5)).toEqual(['F 0', 'F 1', 'F 2', 'F 3', 'F 4']);
  });

  it('outrepasse l’attente qui suit une erreur', async () => {
    const w = world([auction('a1', 'Ted Lasso', 100)]);
    const tab = w.tab('A');
    await tab.want([target('Ted Lasso')]);
    w.fake.hooks.set('Ted Lasso', async () => {
      throw new Error('429');
    });
    expect(await tab.tick()).toBe('failed');
    w.fake.hooks.clear();
    expect(await tab.tick()).toBe('skipped');

    await tab.force([target('Ted Lasso')]);
    expect(await tab.tick()).toBe('ran');
  });

  it('une erreur pendant un forçage libère le bouton : plus rien en attente', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.force([target('Carte A'), target('Carte B')]);
    w.fake.hooks.set('Carte A', async () => {
      throw new Error('401');
    });
    expect(await tab.tick()).toBe('failed');
    expect(await tab.forceProgress()).toEqual({ remaining: 0, total: 0 });
    expect((await tab.pendingSlugs()).size).toBe(0);
  });

  it('suit l’avancement du forçage', async () => {
    const w = world([]);
    const tab = w.tab('A');
    expect(await tab.forceProgress()).toEqual({ remaining: 0, total: 0 });
    await tab.force(['A', 'B', 'C'].map((n) => target(`Carte ${n}`)));
    expect(await tab.forceProgress()).toEqual({ remaining: 3, total: 3 });
    let during: { remaining: number; total: number } | undefined;
    w.fake.hooks.set('Carte C', async () => {
      during = await tab.forceProgress();
      return { auctions: [] };
    });
    await tab.tick();
    expect(during).toEqual({ remaining: 1, total: 3 });
    expect(await tab.forceProgress()).toEqual({ remaining: 0, total: 0 });
  });

  it('un nouveau forçage après un premier terminé repart de zéro', async () => {
    const w = world([]);
    const tab = w.tab('A');
    await tab.force([target('Carte A')]);
    await tab.tick();
    await tab.force([target('Carte A')]);
    expect(await tab.forceProgress()).toEqual({ remaining: 1, total: 1 });
    expect(await tab.tick()).toBe('ran');
    expect(w.fake.calls).toEqual(['Carte A', 'Carte A']);
  });
});
