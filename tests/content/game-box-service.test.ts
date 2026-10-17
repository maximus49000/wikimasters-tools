import { describe, expect, it, vi } from 'vitest';
import { createGameBoxService } from '../../src/content/game-box-service';
import { createMemoryStore } from '../../src/core/cache/store';
import type { GameDetail } from '../../src/core/game/game-detail';
import { createGameVersionRepo } from '../../src/core/game/game-version-repo';
import { boxartUrl, type TgdbVersion } from '../../src/core/game/tgdb-api';

const detail: GameDetail = { source: 'igdb', id: 1, title: 'Hollow Knight', genres: [], platforms: ['PC', 'Nintendo Switch'], developers: [], coverUrl: 'https://img.test/cover.jpg', pageUrl: 'x', summary: 'Résumé IGDB' };
const ver = (over: Partial<TgdbVersion>): TgdbVersion => ({
  id: 1, title: 'Hollow Knight', platformId: 1, platformName: 'PC', format: 'dvd', style: { plastic: '#111', band: null }, ...over,
});
const pc = ver({ id: 10, front: 'boxart/front/10.jpg' });
const switchV = ver({ id: 20, platformName: 'Nintendo Switch', format: 'switch', front: 'boxart/front/20.jpg', back: 'boxart/back/20.jpg', overview: 'Résumé TGDB' });

function setup(over: { versions?: TgdbVersion[] | null; view?: unknown; now?: () => number } = {}) {
  const versions = vi.fn(async () => (over.versions === undefined ? [pc, switchV] : over.versions));
  const images = vi.fn(async () => ({ 20: { shots: ['screenshots/20-1.jpg'], logo: 'clearlogo/20.png' } }));
  const choices = createGameVersionRepo(createMemoryStore());
  const onChanged = vi.fn();
  const service = createGameBoxService({
    versions, images, choices, onChanged,
    game: { view: async () => (over.view ?? { status: 'detail', detail }) as never },
    store: createMemoryStore(),
    spacingMs: 0,
    ...(over.now ? { now: over.now } : {}),
  });
  return { service, versions, images, choices, onChanged };
}

describe('createGameBoxService.box', () => {
  it('rend la version mémorisée : format, pochettes, captures, logo', async () => {
    const { service, choices } = setup();
    await choices.save('Jeu', { tgdbId: 20 });
    expect(await service.box('Jeu', 'Hollow Knight')).toMatchObject({
      format: 'switch',
      tgdbId: 20,
      platformName: 'Nintendo Switch',
      frontUrl: boxartUrl('boxart/front/20.jpg', 'medium'),
      backFullUrl: boxartUrl('boxart/back/20.jpg', 'original'),
      shots: [boxartUrl('screenshots/20-1.jpg', 'medium')],
      logoUrl: boxartUrl('clearlogo/20.png', 'original'),
      title: 'Hollow Knight',
      summary: 'Résumé TGDB',
    });
  });

  it('version TheGamesDB sans résumé (ex. édition japonaise) : le dos reprend le résumé de la fiche du jeu', async () => {
    const box = await setup({ versions: [pc] }).service.box('Jeu', 'Hollow Knight');
    expect(box).toMatchObject({ tgdbId: 10, summary: 'Résumé IGDB' });
  });

  it('sans choix : la version par défaut, format de la première plateforme préféré', async () => {
    const { service } = setup({ versions: [pc, ver({ id: 30, front: 'f30', platformName: 'Sony Playstation 4', format: 'bluray' })] });
    expect((await service.box('Jeu', 'Hollow Knight'))?.tgdbId).toBe(10);
  });

  it('pas un jeu : null', async () => {
    expect(await setup({ view: { status: 'none' } }).service.box('Jeu', 'x')).toBeNull();
  });

  it('rien trouvé chez TheGamesDB : repli sur la jaquette, captures vides', async () => {
    const box = await setup({ versions: [] }).service.box('Jeu', 'Hollow Knight');
    expect(box).toMatchObject({ format: 'dvd', frontUrl: 'https://img.test/cover.jpg', shots: [], summary: 'Résumé IGDB' });
    expect(box?.tgdbId).toBeUndefined();
    expect(box?.backUrl).toBeUndefined();
    expect(box?.style).toBeDefined();
  });
});

describe('createGameBoxService.request', () => {
  it('peek est undefined avant request, puis la boîte ; abonné prévenu une fois', async () => {
    const { service } = setup();
    const listener = vi.fn();
    service.subscribe(listener);
    expect(service.peek('Jeu')).toBeUndefined();
    service.request('Jeu', 'Hollow Knight');
    service.request('Jeu', 'Hollow Knight');
    await vi.waitFor(() => expect(service.peek('Jeu')).toBeTruthy());
    expect(listener).toHaveBeenCalledTimes(1);
    service.request('Jeu', 'Hollow Knight');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('panne (429, réseau) : boîtier dessiné sans jaquette Steam, et pas de nouvel essai avant 60 s', async () => {
    let t = 1_000;
    const { service, versions } = setup({ versions: null, now: () => t });
    service.request('Jeu', 'Hollow Knight');
    await vi.waitFor(() => expect(service.peek('Jeu')).toBeTruthy());
    expect(service.peek('Jeu')).toMatchObject({ format: 'dvd', title: 'Hollow Knight', shots: [] });
    expect(service.peek('Jeu')?.frontUrl).toBeUndefined();
    expect(service.peek('Jeu')?.tgdbId).toBeUndefined();
    expect(versions).toHaveBeenCalledTimes(1);
    t += 59_000;
    service.request('Jeu', 'Hollow Knight');
    await new Promise((r) => setTimeout(r, 5));
    expect(versions).toHaveBeenCalledTimes(1);
    t += 2_000;
    service.request('Jeu', 'Hollow Knight');
    await vi.waitFor(() => expect(versions).toHaveBeenCalledTimes(2));
  });
});

describe('createGameBoxService : mise en cache et choix', () => {
  it('vide 7 jours, puis trouvé : gardé 365 jours sous la même clé', async () => {
    let t = 0;
    let found = false;
    const versions = vi.fn(async () => (found ? [pc] : ([] as TgdbVersion[])));
    const service = createGameBoxService({
      versions, images: async () => ({}), choices: createGameVersionRepo(createMemoryStore()),
      game: { view: async () => ({ status: 'detail', detail }) },
      store: createMemoryStore(),
      now: () => t,
      spacingMs: 0,
    });
    await service.box('Jeu', 'Hollow Knight');
    t = 3 * 24 * 3_600_000;
    await service.versions('Jeu', 'Hollow Knight');
    expect(versions).toHaveBeenCalledTimes(1);
    found = true;
    t = 8 * 24 * 3_600_000;
    await service.versions('Jeu', 'Hollow Knight');
    expect(versions).toHaveBeenCalledTimes(2);
    t = 16 * 24 * 3_600_000;
    expect((await service.versions('Jeu', 'Hollow Knight')).length).toBe(1);
    expect(versions).toHaveBeenCalledTimes(2);
  });

  it('les captures sont mémorisées par identifiant, jamais une panne', async () => {
    const { service, images, choices } = setup();
    await choices.save('Jeu', { tgdbId: 20 });
    await service.box('Jeu', 'Hollow Knight');
    await service.box('Jeu', 'Hollow Knight');
    expect(images).toHaveBeenCalledTimes(1);
    images.mockResolvedValue(null as never);
    await choices.save('Autre', { tgdbId: 10 });
    expect((await service.box('Autre', 'Hollow Knight'))?.shots).toEqual([]);
  });

  it('erreur de la fiche : échec, nouvel essai après 60 s seulement', async () => {
    let t = 0;
    const { service } = setup({ view: { status: 'error', message: 'x' }, now: () => t });
    service.request('Jeu', 'x');
    await vi.waitFor(() => expect(service.peek('Jeu')).toBeNull());
    t = 61_000;
    const listener = vi.fn();
    service.subscribe(listener);
    service.request('Jeu', 'x');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
  });

  it('panne puis nouvel essai réussi : le scan TheGamesDB, jamais la jaquette Steam', async () => {
    let quota = true;
    const service = createGameBoxService({
      versions: async () => (quota ? null : [switchV]), images: async () => ({}), choices: createGameVersionRepo(createMemoryStore()),
      game: { view: async () => ({ status: 'detail', detail }) }, store: createMemoryStore(), spacingMs: 0,
    });
    expect((await service.outcome('Jeu', 'Hollow Knight')).box?.frontUrl).toBeUndefined();
    quota = false;
    expect((await service.box('Jeu', 'Hollow Knight'))?.frontUrl).toBe(boxartUrl('boxart/front/20.jpg', 'medium'));
  });

  it('chooseVersion recalcule seul ; un calcul plus ancien ne gagne pas', async () => {
    const { service, onChanged } = setup();
    const listener = vi.fn();
    service.request('Jeu', 'Hollow Knight');
    service.subscribe(listener);
    await service.chooseVersion('Jeu', 10); // la première demande est encore en cours
    await vi.waitFor(() => expect(service.peek('Jeu')?.tgdbId).toBe(10));
    await new Promise((r) => setTimeout(r, 10));
    expect(service.peek('Jeu')?.tgdbId).toBe(10);
    await service.resetVersion('Jeu');
    await vi.waitFor(() => expect(service.peek('Jeu')?.tgdbId).toBe(20));
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalled();
  });

  it('versions() liste les versions du jeu', async () => {
    expect((await setup().service.versions('Jeu', 'Hollow Knight')).map((v) => v.id)).toEqual([10, 20]);
  });
});

describe('createGameBoxService : file des appels au relais', () => {
  const make = (over: { spacingMs?: number; timeoutMs?: number; versions?: (name: string) => Promise<TgdbVersion[] | null>; images?: () => Promise<never> } = {}) => {
    const calls: { name: string; at: number }[] = [];
    const versions = vi.fn(over.versions ?? (async (name: string) => {
      calls.push({ name, at: Date.now() });
      return [] as TgdbVersion[];
    }));
    const service = createGameBoxService({
      versions, images: over.images ?? (async () => ({})), choices: createGameVersionRepo(createMemoryStore()),
      game: { view: async (_slug: string, title: string) => ({ status: 'detail', detail: { ...detail, title } }) },
      store: createMemoryStore(),
      spacingMs: over.spacingMs ?? 40,
      ...(over.timeoutMs !== undefined ? { timeoutMs: over.timeoutMs } : {}),
    });
    return { service, versions, calls };
  };

  it('un appel à la fois, espacés (rafale de la Collection)', async () => {
    const { service, calls } = make();
    await Promise.all(['A', 'B', 'C', 'D'].map((slug) => service.outcome(slug, `Jeu ${slug}`)));
    expect(calls).toHaveLength(4);
    for (let i = 1; i < calls.length; i += 1) expect(calls[i]!.at - calls[i - 1]!.at).toBeGreaterThanOrEqual(35);
  });

  it('la fiche (box) passe devant les affiches en attente', async () => {
    const { service, calls } = make();
    const background = ['A', 'B', 'C'].map((slug) => service.outcome(slug, `Jeu ${slug}`));
    await new Promise((r) => setTimeout(r, 5));
    await service.box('Z', 'Jeu Z');
    await Promise.all(background);
    expect(calls.map((c) => c.name).indexOf('Jeu Z')).toBeLessThanOrEqual(1);
  });

  it('un appel sans réponse au-delà du délai : panne (non mémorisée), la file continue', async () => {
    let hang = true;
    const { service, versions } = make({
      spacingMs: 0, timeoutMs: 30,
      versions: async () => (hang ? new Promise<never>(() => undefined) : []),
    });
    expect(await service.outcome('A', 'Jeu A')).toMatchObject({ failed: true });
    hang = false;
    expect(await service.outcome('A', 'Jeu A')).toMatchObject({ failed: false });
    expect(versions).toHaveBeenCalledTimes(2);
  });

  it('« aucune image » est mémorisé (7 jours), pas une panne', async () => {
    let t = 0;
    const images = vi.fn(async () => ({}) as Record<number, { shots: string[] }>);
    const service = createGameBoxService({
      versions: async () => [switchV], images, choices: createGameVersionRepo(createMemoryStore()),
      game: { view: async () => ({ status: 'detail', detail }) },
      store: createMemoryStore(), now: () => t, spacingMs: 0,
    });
    await service.box('Jeu', 'Hollow Knight');
    await service.box('Jeu', 'Hollow Knight');
    expect(images).toHaveBeenCalledTimes(1);
    t = 8 * 24 * 3_600_000;
    await service.box('Jeu', 'Hollow Knight');
    expect(images).toHaveBeenCalledTimes(2);
  });
});

describe('createGameBoxService : versions et titre imprimé', () => {
  it('±1 an pour la version par défaut, mais la fenêtre liste tous les portages', async () => {
    const original = ver({ id: 1, year: 2011, front: 'f1' });
    const port = ver({ id: 2, year: 2017, platformName: 'Nintendo Switch', format: 'switch', front: 'f2', back: 'b2' });
    const service = createGameBoxService({
      versions: async () => [original, port], images: async () => ({}), choices: createGameVersionRepo(createMemoryStore()),
      game: { view: async () => ({ status: 'detail', detail: { ...detail, year: 2011 } }) },
      store: createMemoryStore(), spacingMs: 0,
    });
    expect((await service.box('Jeu', 'Hollow Knight'))?.tgdbId).toBe(1);
    expect((await service.versions('Jeu', 'Hollow Knight')).map((v) => v.id)).toEqual([1, 2]);
  });

  it('le titre imprimé perd la désambiguïsation « (jeu vidéo) »', async () => {
    expect((await setup().service.box('Jeu', 'Hollow_Knight_(jeu_vidéo)'))?.title).toBe('Hollow Knight');
    expect((await setup({ versions: [] }).service.box('Jeu', 'Hollow Knight (jeu vidéo)'))?.title).toBe('Hollow Knight');
  });
});
