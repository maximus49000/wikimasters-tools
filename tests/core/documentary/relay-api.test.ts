// tests/core/documentary/relay-api.test.ts
import { describe, expect, it } from 'vitest';
import { createRelayApi } from '../../../src/core/documentary/relay-api';

const subject = { qid: 'Q2280', kind: 'event' as const, names: ['Bataille de Verdun', 'Verdun'], startYear: 1916, endYear: 1916 };
const candidate = { source: 'youtube', id: 'AAA', title: 'Verdun', channel: 'ARTE', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=AAA' };
const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe('createRelayApi.search', () => {
  it('envoie le sujet et rend les candidats', async () => {
    let seen = '';
    const api = createRelayApi({ fetch: async (url) => ((seen = url), new Response(JSON.stringify({ ok: true, candidates: [candidate], cached: false }))), base: 'https://relais.test' });
    const result = await api.search(subject);
    expect(result).toEqual({ status: 'ok', candidates: [candidate] });
    expect(seen).toBe('https://relais.test/search?qid=Q2280&kind=event&names=Bataille+de+Verdun%7CVerdun&start=1916&end=1916');
  });
  it('omet les années inconnues', async () => {
    let seen = '';
    const api = createRelayApi({ fetch: async (url) => ((seen = url), new Response(JSON.stringify({ ok: true, candidates: [], cached: true }))), base: 'https://r.test' });
    await api.search({ ...subject, startYear: null, endYear: null });
    expect(seen).not.toContain('start=');
  });
  it('« plafond atteint » et « YouTube en panne » donnent busy', async () => {
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'budget' }) }).search(subject)).toEqual({ status: 'busy' });
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'upstream' }, 503) }).search(subject)).toEqual({ status: 'busy' });
  });
  it('lève sur une réponse illisible ou une requête refusée', async () => {
    await expect(createRelayApi({ fetch: reply({ nimporte: 1 }) }).search(subject)).rejects.toThrow();
    await expect(createRelayApi({ fetch: reply({ ok: false, reason: 'bad-request' }, 400) }).search(subject)).rejects.toThrow('Relais');
  });
});

describe('createRelayApi.oembed', () => {
  it('rend le titre et la chaîne, ou la raison du refus', async () => {
    expect(await createRelayApi({ fetch: reply({ ok: true, title: 'T', channel: 'C' }) }).oembed('AAA')).toEqual({ ok: true, title: 'T', channel: 'C' });
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'not-embeddable' }) }).oembed('AAA')).toEqual({ ok: false, reason: 'not-embeddable' });
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'upstream' }, 502) }).oembed('AAA')).toEqual({ ok: false, reason: 'busy' });
  });
});
