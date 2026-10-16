import { describe, expect, it } from 'vitest';
import hollow from './fixtures/tgdb-hollow-knight.json';
import rdr2 from './fixtures/tgdb-rdr2.json';
import { boxartUrl, defaultVersion, fetchTgdbImages, fetchTgdbVersions, matchingVersions, parseTgdbGames, regionLabel, type TgdbVersion } from '../../../src/core/game/tgdb-api';

const v = (over: Partial<TgdbVersion>): TgdbVersion => ({
  id: 1, title: 'X', platformId: 1, platformName: 'PC', format: 'generic', style: { plastic: '#000', band: null }, ...over,
});

describe('parseTgdbGames', () => {
  it('lit les versions et leurs pochettes', () => {
    const list = parseTgdbGames(rdr2);
    const ps4 = list.find((x) => x.platformId === 4919 && x.id === 55247);
    expect(ps4).toBeDefined();
    expect(ps4?.format).toBe('bluray');
    expect(ps4?.back).toBe('boxart/back/55247-1.jpg');
    expect(ps4?.front).toBe('boxart/front/55247-1.jpg');
    expect(ps4?.platformName).toBe('Sony Playstation 4');
    expect(ps4?.year).toBe(2018);
    expect(ps4?.regionId).toBe(2);
    expect(ps4?.style).toBeDefined();
  });
  it('rend [] pour une forme inattendue', () => {
    expect(parseTgdbGames({ code: 418 })).toEqual([]);
    expect(parseTgdbGames(null)).toEqual([]);
  });
});

describe('matchingVersions', () => {
  it('garde les consoles de Hollow Knight et écarte Silksong', () => {
    const all = parseTgdbGames(hollow);
    expect(all.some((x) => x.title.includes('Silksong'))).toBe(true);
    const kept = matchingVersions(all, ['Hollow Knight']);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((x) => x.title === 'Hollow Knight')).toBe(true);
    expect(new Set(kept.map((x) => x.platformId))).toEqual(new Set([1, 41, 4916, 4971, 4919, 4980].filter((p) => kept.some((x) => x.platformId === p))));
    expect(kept.some((x) => x.platformId === 4971)).toBe(true);
  });
  it('ignore casse, accents, ponctuation et « the »', () => {
    const list = [v({ id: 1, title: 'Pokémon Red' }), v({ id: 2, title: 'Pokémon Red: Battle Factory' }), v({ id: 3, title: 'The Legend of Zelda' })];
    expect(matchingVersions(list, ['Pokemon Red']).map((x) => x.id)).toEqual([1]);
    expect(matchingVersions(list, ['legend of zelda!']).map((x) => x.id)).toEqual([3]);
  });
  it('filtre l’année à ±1 quand elle est connue', () => {
    const list = [v({ id: 1, title: 'A', year: 2000 }), v({ id: 2, title: 'A', year: 2001 }), v({ id: 3, title: 'A', year: 2005 }), v({ id: 4, title: 'A' })];
    expect(matchingVersions(list, ['A'], 2000).map((x) => x.id)).toEqual([1, 2, 4]);
    expect(matchingVersions(list, ['A']).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('defaultVersion', () => {
  it('liste vide : null', () => expect(defaultVersion([])).toBeNull());
  it('préfère celle qui a un dos à une plus ancienne sans dos', () => {
    const old = v({ id: 1, year: 1999, front: 'f' });
    const withBack = v({ id: 2, year: 2010, front: 'f', back: 'b' });
    expect(defaultVersion([old, withBack])?.id).toBe(2);
  });
  it('à dos égal, le format préféré gagne', () => {
    const a = v({ id: 1, back: 'b', format: 'dvd' });
    const b = v({ id: 2, back: 'b', format: 'bluray' });
    expect(defaultVersion([a, b], 'bluray')?.id).toBe(2);
  });
  it('puis PAL, puis année la plus ancienne, puis plus petit id', () => {
    expect(defaultVersion([v({ id: 1, regionId: 2 }), v({ id: 2, regionId: 6 })])?.id).toBe(2);
    expect(defaultVersion([v({ id: 1, year: 2010 }), v({ id: 2, year: 2005 })])?.id).toBe(2);
    expect(defaultVersion([v({ id: 9 }), v({ id: 4 })])?.id).toBe(4);
  });
});

describe('boxartUrl', () => {
  it('compose l’URL du CDN', () => {
    expect(boxartUrl('boxart/front/1-1.jpg', 'medium')).toBe('https://cdn.thegamesdb.net/images/medium/boxart/front/1-1.jpg');
  });
});

const reply = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status });

describe('fetchTgdbVersions', () => {
  it('amont 502 : null (panne)', async () => expect(await fetchTgdbVersions('Hollow Knight', reply(502))).toBeNull());
  it('réseau coupé : null', async () => expect(await fetchTgdbVersions('x', async () => { throw new Error('off'); })).toBeNull());
  it('rien trouvé : []', async () => expect(await fetchTgdbVersions('x', reply(200, { code: 200, data: { count: 0 } }))).toEqual([]));
  it('interroge le relais avec le nom encodé', async () => {
    let seen = '';
    const list = await fetchTgdbVersions('Red Dead & co', async (url) => { seen = url; return new Response(JSON.stringify(rdr2)); });
    expect(seen).toMatch(/\/tgdb\/games\?name=Red%20Dead%20%26%20co$/);
    expect(list?.length).toBeGreaterThan(0);
  });
});

describe('fetchTgdbImages', () => {
  it('sépare captures et logo', async () => {
    const body = { data: { images: { '5': [
      { id: 1, type: 'screenshot', filename: 'screenshots/5-1.jpg' },
      { id: 2, type: 'screenshot', filename: 'screenshots/5-2.jpg' },
      { id: 3, type: 'clearlogo', filename: 'clearlogo/5.png' },
      { id: 4, type: 'fanart', filename: 'fanart/original/5-1.jpg' },
    ] } } };
    let seen = '';
    const out = await fetchTgdbImages([5, 6], async (url) => { seen = url; return new Response(JSON.stringify(body)); });
    expect(seen).toMatch(/\/tgdb\/images\?ids=5,6$/);
    expect(out).toEqual({ 5: { shots: ['screenshots/5-1.jpg', 'screenshots/5-2.jpg'], logo: 'clearlogo/5.png' } });
  });
  it('panne : null', async () => expect(await fetchTgdbImages([5], reply(500))).toBeNull());
  it('aucun id : {}', async () => expect(await fetchTgdbImages([], reply(500))).toEqual({}));
});

describe('regionLabel', () => {
  it('nomme PAL, NTSC-U et NTSC, rien pour le reste', () => {
    expect(regionLabel(6)).toBe('Europe (PAL)');
    expect(regionLabel(2)).toBe('Amérique (NTSC-U)');
    expect(regionLabel(1)).toBe('NTSC');
    expect([0, 9, 42, undefined].map((id) => regionLabel(id))).toEqual([null, null, null, null]);
  });
});
