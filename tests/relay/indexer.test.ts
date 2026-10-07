// tests/relay/indexer.test.ts
import { describe, expect, it } from 'vitest';
import { indexStatus, indexStep, lookupIndex, toLine } from '../../relay/src/indexer';
import type { ChannelDef } from '../../relay/src/channels';
import { memoryKv } from './memory-kv';

const channel: ChannelDef = { id: 'UCchaine00000000000000A', name: 'ARTE', language: 'fr' };
const now = () => new Date('2026-10-07T10:00:00Z');

// Fausse API : `pages` associe un jeton de page (« » pour la première) à ses vidéos et à la page suivante.
const fakeApi = (pages: Record<string, { ids: string[]; next?: string }>, calls: string[] = []) => async (url: string) => {
  calls.push(url);
  const parsed = new URL(url);
  if (parsed.pathname.endsWith('/playlistItems')) {
    const page = pages[parsed.searchParams.get('pageToken') ?? ''];
    return new Response(JSON.stringify({ nextPageToken: page?.next, items: (page?.ids ?? []).map((id) => ({ snippet: { title: `Titre ${id}` }, contentDetails: { videoId: id } })) }));
  }
  const ids = (parsed.searchParams.get('id') ?? '').split(',');
  return new Response(JSON.stringify({ items: ids.map((id) => ({ id, contentDetails: { duration: 'PT10M' } })) }));
};

describe('toLine / lookupIndex', () => {
  const blob = [
    toLine({ id: 'A', title: 'Verdun, la bataille de l’impossible', durationSec: 3120 }),
    toLine({ id: 'B', title: 'Verdunois en fête', durationSec: 600 }),
    toLine({ id: 'C', title: 'Un autre sujet', durationSec: 900 }),
  ].join('\n');
  const kv = memoryKv();
  kv.data.set('chan-v1-UCchaine00000000000000A', blob);

  it('trouve un nom en mots entiers, sans tenir compte des accents ni de la casse', async () => {
    const found = await lookupIndex(kv, ['Bataille de Verdun', 'VERDUN'], [channel]);
    expect(found).toEqual([
      { source: 'youtube', id: 'A', title: 'Verdun, la bataille de l’impossible', channel: 'ARTE', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=A', thumbUrl: 'https://img.youtube.com/vi/A/hqdefault.jpg' },
    ]);
  });
  it('rend une liste vide sans index ou sans correspondance', async () => {
    expect(await lookupIndex(memoryKv(), ['Verdun'], [channel])).toEqual([]);
    expect(await lookupIndex(kv, ['Cléopâtre'], [channel])).toEqual([]);
  });
});

describe('indexStep', () => {
  it('parcourt la chaîne page par page, puis la déclare complète', async () => {
    const kv = memoryKv();
    const api = fakeApi({ '': { ids: ['v1', 'v2'], next: 'P2' }, P2: { ids: ['v3'] } });
    expect(await indexStep({ fetch: api, kv, apiKey: 'K', now, channels: [channel] })).toEqual({ pages: 2 });
    const lines = (kv.data.get('chan-v1-UCchaine00000000000000A') ?? '').split('\n');
    expect(lines).toEqual(['v1\t600\t titre v1 \tTitre v1', 'v2\t600\t titre v2 \tTitre v2', 'v3\t600\t titre v3 \tTitre v3']);
    expect(JSON.parse(kv.data.get('chan-state-v1-UCchaine00000000000000A') ?? '{}')).toMatchObject({ complete: true, count: 3, cursor: null });
    expect(kv.data.get('units-2026-10-07')).toBe(String(20 * 2));
  });

  it('ne refait rien tant que la chaîne est complète et récente', async () => {
    const kv = memoryKv();
    const calls: string[] = [];
    const api = fakeApi({ '': { ids: ['v1'] } }, calls);
    await indexStep({ fetch: api, kv, apiKey: 'K', now, channels: [channel] });
    const before = calls.length;
    expect(await indexStep({ fetch: api, kv, apiKey: 'K', now, channels: [channel] })).toEqual({ pages: 0 });
    expect(calls).toHaveLength(before);
  });

  it('respecte le plafond de pages par passage et reprend où il s’est arrêté', async () => {
    const kv = memoryKv();
    const api = fakeApi({ '': { ids: ['v1'], next: 'P2' }, P2: { ids: ['v2'] } });
    expect(await indexStep({ fetch: api, kv, apiKey: 'K', now, channels: [channel], maxPages: 1 })).toEqual({ pages: 1 });
    expect(JSON.parse(kv.data.get('chan-state-v1-UCchaine00000000000000A') ?? '{}')).toMatchObject({ complete: false, cursor: 'P2', count: 1 });
    expect(await indexStep({ fetch: api, kv, apiKey: 'K', now, channels: [channel], maxPages: 1 })).toEqual({ pages: 1 });
    expect((kv.data.get('chan-v1-UCchaine00000000000000A') ?? '').split('\n')).toHaveLength(2);
    expect(JSON.parse(kv.data.get('chan-state-v1-UCchaine00000000000000A') ?? '{}')).toMatchObject({ complete: true, count: 2 });
  });

  it('une semaine plus tard, ajoute seulement les vidéos nouvelles, en tête', async () => {
    const kv = memoryKv();
    kv.data.set('chan-v1-UCchaine00000000000000A', toLine({ id: 'v1', title: 'Titre v1', durationSec: 600 }));
    kv.data.set('chan-state-v1-UCchaine00000000000000A', JSON.stringify({ cursor: null, complete: true, refreshing: false, count: 1, updatedAt: new Date('2026-09-20T00:00:00Z').getTime() }));
    const api = fakeApi({ '': { ids: ['v0', 'v1'], next: 'P2' } });
    expect(await indexStep({ fetch: api, kv, apiKey: 'K', now, channels: [channel] })).toEqual({ pages: 1 });
    expect((kv.data.get('chan-v1-UCchaine00000000000000A') ?? '').split('\n').map((line) => line.split('\t')[0])).toEqual(['v0', 'v1']);
    expect(JSON.parse(kv.data.get('chan-state-v1-UCchaine00000000000000A') ?? '{}')).toMatchObject({ complete: true });
  });

  it('s’arrête sans appeler YouTube quand le plafond du jour est atteint', async () => {
    const kv = memoryKv();
    kv.data.set('units-2026-10-07', '9000');
    const calls: string[] = [];
    expect(await indexStep({ fetch: fakeApi({ '': { ids: ['v1'] } }, calls), kv, apiKey: 'K', now, channels: [channel] })).toEqual({ pages: 0 });
    expect(calls).toHaveLength(0);
  });

  it('garde ce qui a été lu quand YouTube échoue en cours de route', async () => {
    const kv = memoryKv();
    let call = 0;
    const flaky = async (url: string) => {
      call += 1;
      if (call > 2) return new Response('', { status: 403 });
      return fakeApi({ '': { ids: ['v1'], next: 'P2' } })(url);
    };
    expect(await indexStep({ fetch: flaky, kv, apiKey: 'K', now, channels: [channel] })).toEqual({ pages: 1 });
    expect(JSON.parse(kv.data.get('chan-state-v1-UCchaine00000000000000A') ?? '{}')).toMatchObject({ complete: false, cursor: 'P2', count: 1 });
  });
});

describe('indexStatus', () => {
  it('résume l’avancement de chaque chaîne', async () => {
    const kv = memoryKv();
    kv.data.set('chan-state-v1-UCchaine00000000000000A', JSON.stringify({ cursor: null, complete: true, refreshing: false, count: 42, updatedAt: 1000 }));
    expect(await indexStatus(kv, [channel, { id: 'UCautre', name: 'INA Officiel', language: 'fr' }])).toEqual([
      { name: 'ARTE', count: 42, complete: true, updatedAt: 1000 },
      { name: 'INA Officiel', count: 0, complete: false, updatedAt: 0 },
    ]);
  });
});
