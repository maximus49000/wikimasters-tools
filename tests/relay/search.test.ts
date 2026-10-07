// tests/relay/search.test.ts
import { describe, expect, it } from 'vitest';
import type { ChannelDef } from '../../relay/src/channels';
import { toLine } from '../../relay/src/indexer';
import { parseSearchRequest, searchDocumentaries, type SearchRequest } from '../../relay/src/search';
import { memoryKv } from './memory-kv';

const request: SearchRequest = { qid: 'Q2280', kind: 'event', names: ['Bataille de Verdun', 'Verdun'], startYear: 1916, endYear: 1916 };
const arte: ChannelDef = { id: 'UCarte0000000000000000A', name: 'ARTE', language: 'fr' };

const youtubeFetch = (calls: string[]) => async (url: string) => {
  calls.push(url);
  if (url.includes('/search?')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'GOOD' } }, { id: { videoId: 'BAD' } }] }));
  return new Response(
    JSON.stringify({
      items: [
        { id: 'GOOD', snippet: { title: 'Verdun, la bataille - documentaire', channelTitle: 'ARTE', description: '', defaultAudioLanguage: 'fr' }, contentDetails: { duration: 'PT52M' } },
        { id: 'BAD', snippet: { title: 'Verdun reaction', channelTitle: 'Z', description: '' }, contentDetails: { duration: 'PT20M' } },
      ],
    }),
  );
};

// `channels: []` : pas d'index, sauf dans les tests qui en veulent un.
const deps = (kv: ReturnType<typeof memoryKv>, calls: string[], channels: ChannelDef[] = []) => ({ fetch: youtubeFetch(calls), kv, apiKey: 'CLE', now: () => new Date('2026-10-07T10:00:00Z'), channels });

describe('searchDocumentaries', () => {
  it('cherche, note, ne garde que les pertinents et met en cache', async () => {
    const kv = memoryKv();
    const calls: string[] = [];
    const first = await searchDocumentaries(deps(kv, calls), request);
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(first.ok && first.candidates.map((c) => c.id)).toEqual(['GOOD']);
    const second = await searchDocumentaries(deps(kv, calls), request);
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(2);
  });

  it('répond depuis l’index des chaînes sans appeler YouTube ni dépenser d’unités', async () => {
    const kv = memoryKv();
    kv.data.set('chan-v1-UCarte0000000000000000A', toLine({ id: 'IDX', title: 'Verdun, la bataille de l’impossible', durationSec: 3120 }));
    const calls: string[] = [];
    const result = await searchDocumentaries(deps(kv, calls, [arte]), request);
    expect(result.ok && result.candidates.map((c) => c.id)).toEqual(['IDX']);
    expect(calls).toHaveLength(0);
    expect(kv.data.has('units-2026-10-07')).toBe(false);
  });

  it('passe à la recherche YouTube quand l’index ne donne rien de pertinent', async () => {
    const kv = memoryKv();
    kv.data.set('chan-v1-UCarte0000000000000000A', toLine({ id: 'COURT', title: 'Verdun', durationSec: 90 }));
    const calls: string[] = [];
    const result = await searchDocumentaries(deps(kv, calls, [arte]), request);
    expect(result.ok && result.candidates.map((c) => c.id)).toEqual(['GOOD']);
    expect(calls).toHaveLength(2);
  });

  it('mémorise aussi « rien de pertinent »', async () => {
    const kv = memoryKv();
    const empty = async () => new Response(JSON.stringify({ items: [] }));
    const result = await searchDocumentaries({ ...deps(kv, []), fetch: empty }, request);
    expect(result).toEqual({ ok: true, candidates: [], cached: false });
    expect(kv.data.get('doc-v1-Q2280')).toBe('[]');
  });

  it('s’arrête au plafond du jour sans appeler YouTube ni mémoriser', async () => {
    const kv = memoryKv();
    kv.data.set('units-2026-10-07', '9000');
    const calls: string[] = [];
    expect(await searchDocumentaries(deps(kv, calls), request)).toEqual({ ok: false, reason: 'budget' });
    expect(calls).toHaveLength(0);
    expect(kv.data.has('doc-v1-Q2280')).toBe(false);
  });

  it('compte 101 unités par recherche neuve', async () => {
    const kv = memoryKv();
    await searchDocumentaries(deps(kv, []), request);
    expect(kv.data.get('units-2026-10-07')).toBe('101');
  });

  it('signale une panne de YouTube sans mémoriser', async () => {
    const kv = memoryKv();
    const result = await searchDocumentaries({ ...deps(kv, []), fetch: async () => new Response('', { status: 403 }) }, request);
    expect(result).toEqual({ ok: false, reason: 'upstream' });
    expect(kv.data.has('doc-v1-Q2280')).toBe(false);
  });

  it('en mode debug rend tous les candidats notés (index et recherche), sans cache', async () => {
    const kv = memoryKv();
    kv.data.set('chan-v1-UCarte0000000000000000A', toLine({ id: 'IDX', title: 'Verdun, la bataille de l’impossible', durationSec: 3120 }));
    const result = await searchDocumentaries(deps(kv, [], [arte]), { ...request, debug: true });
    expect(result.ok && result.debug?.map((entry) => [entry.candidate.id, entry.result.reason ?? 'ok'])).toEqual([['IDX', 'ok'], ['GOOD', 'ok'], ['BAD', 'mot parasite']]);
    expect(kv.data.has('doc-v1-Q2280')).toBe(false);
  });
});

describe('parseSearchRequest', () => {
  it('lit des paramètres valides', () => {
    const params = new URLSearchParams({ qid: 'Q2280', kind: 'event', names: 'Bataille de Verdun|Verdun', start: '1916', end: '1916' });
    expect(parseSearchRequest(params)).toEqual(request);
  });
  it('rejette un QID, un genre ou des noms invalides', () => {
    expect(parseSearchRequest(new URLSearchParams({ qid: 'x', kind: 'event', names: 'A B' }))).toBeNull();
    expect(parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'lieu', names: 'A B' }))).toBeNull();
    expect(parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'event', names: '' }))).toBeNull();
    expect(parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'event', names: 'x'.repeat(121) }))).toBeNull();
  });
  it('année absente ou illisible : null', () => {
    const parsed = parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'person', names: 'Cléopâtre', start: 'abc' }));
    expect(parsed).toMatchObject({ startYear: null, endYear: null });
  });
});
