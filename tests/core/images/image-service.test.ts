import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createImageService, type ImageSearch } from '../../../src/core/images/image-service';

const settings = (initial?: string) => {
  const data = new Map<string, string>(initial ? [['wmt:imageReplace', initial]] : []);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const make = (search: ImageSearch = vi.fn(async () => ['u1', 'u2']), initial: string | null = 'on') => ({
  service: createImageService({ store: createMemoryStore(), search, settings: settings(initial ?? undefined) }),
  search,
});

describe('createImageService', () => {
  it('cherche une carte une seule fois, même demandée plusieurs fois', async () => {
    const { service, search } = make();
    expect(await service.resolve('A', 'A')).toBe('u1');
    await service.request('A', 'A');
    await Promise.all([service.request('B', 'B'), service.request('B', 'B')]);
    expect(search).toHaveBeenCalledTimes(2);
    expect(service.peek('A')).toBe('u1');
  });
  it('affiche de jeu vidéo : cherchée une fois pour une carte qui a déjà une image, null si ce n’est pas un jeu', async () => {
    const gameArt = vi.fn(async (_title: string, slug: string) => (slug === 'Jeu' ? ['https://steam/a.jpg'] : []));
    const service = createImageService({ store: createMemoryStore(), search: vi.fn(async () => []), gameArt, settings: settings('on') });
    const listener = vi.fn();
    service.subscribe(listener);
    expect(service.peekGameArt('Jeu')).toBeUndefined();
    await Promise.all([service.requestGameArt('Jeu', 'Jeu'), service.requestGameArt('Jeu', 'Jeu')]);
    await service.requestGameArt('Autre', 'Autre');
    expect(service.peekGameArt('Jeu')).toBe('https://steam/a.jpg');
    expect(service.peekGameArt('Autre')).toBeNull();
    expect(gameArt).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalled();
  });
  it('affiche de jeu vidéo : source pas prête (null) → rien de mémorisé, option coupée → aucune recherche', async () => {
    const gameArt = vi.fn(async () => null);
    const service = createImageService({ store: createMemoryStore(), search: vi.fn(async () => []), gameArt, settings: settings('on') });
    await service.requestGameArt('Jeu', 'Jeu');
    expect(service.peekGameArt('Jeu')).toBeUndefined();
    const off = createImageService({ store: createMemoryStore(), search: vi.fn(async () => []), gameArt, settings: settings() });
    await off.requestGameArt('Jeu', 'Jeu');
    expect(gameArt).toHaveBeenCalledTimes(1);
  });
  it('inactif par défaut : aucune recherche ni image', async () => {
    const { service, search } = make(undefined, null);
    expect(service.enabled()).toBe(false);
    expect(await service.resolve('A', 'A')).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
  it('inactif tant que l’utilisateur ne l’a pas activé, actif une fois activé', () => {
    expect(make(undefined, null).service.enabled()).toBe(false);
    expect(make().service.enabled()).toBe(true);
  });
  it('mémorise le réglage et prévient les abonnés', () => {
    const store = settings();
    const service = createImageService({ store: createMemoryStore(), search: async () => [], settings: store });
    const listener = vi.fn();
    service.subscribe(listener);
    service.setEnabled(true);
    expect(store.getItem('wmt:imageReplace')).toBe('on');
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('« Mauvaise image » passe au candidat suivant sans nouvelle recherche', async () => {
    const { service, search } = make();
    await service.resolve('A', 'A');
    await service.reject('A', 'A');
    expect(service.peek('A')).toBe('u2');
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('relance une recherche (résultats suivants) quand tous les candidats sont écartés', async () => {
    const search = vi.fn(async (_title: string, skip: number) => (skip === 0 ? ['u1'] : ['u9']));
    const { service } = make(search);
    await service.resolve('A', 'A');
    await service.reject('A', 'A');
    expect(search).toHaveBeenLastCalledWith('A', 1, 'A');
    expect(service.peek('A')).toBe('u9');
  });
  it('un échec n’est pas enregistré comme « sans image » et laisse un temps de repos', async () => {
    let now = 0;
    const search = vi.fn<ImageSearch>().mockRejectedValueOnce(new Error('429')).mockResolvedValue(['u1']);
    const service = createImageService({ store: createMemoryStore(), search, settings: settings('on'), now: () => now });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await service.resolve('A', 'A');
    expect(service.peek('A')).toBeUndefined();
    await service.request('A', 'A');
    expect(search).toHaveBeenCalledTimes(1);
    now = 61_000;
    await service.request('A', 'A');
    expect(service.peek('A')).toBe('u1');
  });
  it('recharge ce qui a été enregistré', async () => {
    const store = createMemoryStore();
    await store.set('card-images', { A: { url: 'u7', candidates: ['u7'], rejected: [] } });
    const service = createImageService({ store, search: vi.fn(async () => []), settings: settings('on') });
    expect(await service.resolve('A', 'A')).toBe('u7');
  });

  it('place la pochette officielle devant les images de Wikipédia', async () => {
    const service = createImageService({
      store: createMemoryStore(),
      search: async () => ['wiki'],
      art: async () => ['spotify'],
      settings: settings('on'),
    });
    expect(await service.resolve('A', 'A')).toBe('spotify');
  });

  it('remplace une image déjà trouvée dès que la pochette officielle est disponible', async () => {
    const store = createMemoryStore();
    await store.set('card-images', { A: { url: 'wiki', candidates: ['wiki'], rejected: [] } });
    const service = createImageService({ store, search: vi.fn(async () => []), art: async () => ['spotify'], settings: settings('on') });
    expect(await service.resolve('A', 'A')).toBe('spotify');
  });

  it("ne remet pas une pochette écartée par « Mauvaise image »", async () => {
    const store = createMemoryStore();
    await store.set('card-images', { A: { url: 'wiki', candidates: ['wiki'], rejected: ['spotify'] } });
    const service = createImageService({ store, search: vi.fn(async () => []), art: async () => ['spotify'], settings: settings('on') });
    await service.resolve('A', 'A');
    expect(service.peek('A')).toBe('wiki');
  });
});

// La source de pochettes distingue « j'ai répondu » (liste, éventuellement vide) de « je n'ai pas pu répondre » (null).
describe('mémorisation de la recherche de pochette', () => {
  type ArtFn = (title: string, slug: string) => Promise<string[] | null>;
  const DAY = 86_400_000;
  // Plusieurs services sur le même stockage et la même horloge : chaque `build()` simule un rechargement de la page.
  const setupArt = (deps: { art: ArtFn; fallback?: ArtFn; search?: ImageSearch; store?: ReturnType<typeof createMemoryStore> }) => {
    const clock = { now: 1_000_000 };
    const store = deps.store ?? createMemoryStore();
    const build = () =>
      createImageService({
        store,
        search: deps.search ?? (async () => ['wiki']),
        art: deps.art,
        ...(deps.fallback ? { fallback: deps.fallback } : {}),
        settings: settings('on'),
        now: () => clock.now,
      });
    return { build, clock, store };
  };

  it('garde une pochette trouvée : plus aucune recherche, même longtemps après un rechargement', async () => {
    const art = vi.fn<ArtFn>(async () => ['spotify']);
    const { build, clock } = setupArt({ art });
    await build().resolve('A', 'A');
    clock.now += 365 * DAY;
    expect(await build().resolve('A', 'A')).toBe('spotify');
    expect(art).toHaveBeenCalledTimes(1);
  });

  it('mémorise « rien trouvé » : pas de nouvelle recherche avant 30 jours, même après un rechargement, puis une revérification', async () => {
    const art = vi.fn<ArtFn>(async () => []);
    const { build, clock } = setupArt({ art });
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(1);

    clock.now += 29 * DAY;
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(1);

    // Une pochette est apparue entre-temps : elle est reprise, et gardée pour toujours.
    clock.now += 2 * DAY;
    art.mockResolvedValueOnce(['spotify']);
    expect(await build().resolve('A', 'A')).toBe('spotify');
    expect(art).toHaveBeenCalledTimes(2);
    clock.now += 400 * DAY;
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(2);
  });

  it("une revérification qui ne trouve toujours rien est mémorisée pour 30 jours de plus", async () => {
    const art = vi.fn<ArtFn>(async () => []);
    const { build, clock } = setupArt({ art });
    await build().resolve('A', 'A');
    clock.now += 31 * DAY;
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(2);
    clock.now += 29 * DAY;
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(2);
  });

  it("ne mémorise rien quand la source ne peut pas répondre ou échoue : nouvelle tentative après la minute de repos", async () => {
    const art = vi.fn<ArtFn>().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('429')).mockResolvedValue([]);
    const { build, clock } = setupArt({ art });
    const service = build();
    await service.resolve('A', 'A');
    expect(service.peek('A')).toBe('wiki');

    clock.now += 61_000;
    await service.request('A', 'A');
    clock.now += 61_000;
    await service.request('A', 'A');
    expect(art).toHaveBeenCalledTimes(3);

    // Cette fois la source a répondu : c'est mémorisé.
    clock.now += 61_000;
    await service.request('A', 'A');
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(3);
  });

  it("compte la photo d'artiste (repli) comme une réponse : pas de nouvelle recherche, puis revérification à 30 jours", async () => {
    const art = vi.fn<ArtFn>(async () => []);
    const fallback = vi.fn<ArtFn>(async () => ['artist']);
    const { build, clock } = setupArt({ art, fallback, search: async () => [] });
    expect(await build().resolve('A', 'A')).toBe('artist');
    expect(fallback).toHaveBeenCalledTimes(1);

    clock.now += 5 * DAY;
    expect(await build().resolve('A', 'A')).toBe('artist');
    expect(art).toHaveBeenCalledTimes(1);

    // Après 30 jours, la vraie pochette passe devant la photo.
    clock.now += 30 * DAY;
    art.mockResolvedValueOnce(['spotify']);
    expect(await build().resolve('A', 'A')).toBe('spotify');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('cherche une dernière fois une carte enregistrée avant ce changement, puis la mémorise', async () => {
    const store = createMemoryStore();
    await store.set('card-images', { A: { url: 'wiki', candidates: ['wiki'], rejected: [] } });
    const art = vi.fn<ArtFn>(async () => []);
    const { build, clock } = setupArt({ art, store });
    await build().resolve('A', 'A');
    clock.now += DAY;
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(1);
  });

  it("ne relance pas la recherche pour une pochette écartée par « Mauvaise image »", async () => {
    const store = createMemoryStore();
    await store.set('card-images', { A: { url: 'wiki', candidates: ['wiki'], rejected: ['spotify'] } });
    const art = vi.fn<ArtFn>(async () => ['spotify']);
    const { build, clock } = setupArt({ art, store });
    const service = build();
    await service.resolve('A', 'A');
    expect(service.peek('A')).toBe('wiki');
    clock.now += DAY;
    await build().resolve('A', 'A');
    expect(art).toHaveBeenCalledTimes(1);
  });
});
