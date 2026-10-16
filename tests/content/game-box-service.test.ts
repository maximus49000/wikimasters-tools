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
    cache: { getOrLoad: (_key, loader) => loader() },
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

  it('panne : repli, et pas de nouvel essai avant 60 s', async () => {
    let t = 1_000;
    const { service, versions } = setup({ versions: null, now: () => t });
    service.request('Jeu', 'Hollow Knight');
    await vi.waitFor(() => expect(service.peek('Jeu')).toBeTruthy());
    expect(service.peek('Jeu')?.frontUrl).toBe('https://img.test/cover.jpg');
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
  it('une réponse vide n’est plus servie après 7 jours, une réponse trouvée est gardée', async () => {
    const store = new Map<string, unknown>();
    let t = 0;
    const versions = vi.fn(async () => [] as TgdbVersion[]);
    const service = createGameBoxService({
      versions, images: async () => ({}), choices: createGameVersionRepo(createMemoryStore()),
      game: { view: async () => ({ status: 'detail', detail }) },
      cache: { getOrLoad: async (key: string, loader: () => Promise<unknown>) => (store.has(key) ? store.get(key) : (store.set(key, await loader()), store.get(key))) } as never,
      now: () => t,
    });
    await service.box('Jeu', 'Hollow Knight');
    await service.box('Jeu', 'Hollow Knight');
    expect(versions).toHaveBeenCalledTimes(1);
    t = 8 * 24 * 3_600_000;
    await service.box('Jeu', 'Hollow Knight');
    expect(versions).toHaveBeenCalledTimes(2);
  });

  it('chooseVersion / resetVersion oublient l’affiche et préviennent', async () => {
    const { service, choices, onChanged } = setup();
    const listener = vi.fn();
    service.subscribe(listener);
    await service.chooseVersion('Jeu', 20);
    expect(await choices.load()).toEqual({ Jeu: { tgdbId: 20 } });
    await service.resetVersion('Jeu');
    expect(await choices.load()).toEqual({});
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('versions() liste les versions du jeu', async () => {
    expect((await setup().service.versions('Jeu', 'Hollow Knight')).map((v) => v.id)).toEqual([10, 20]);
  });
});
