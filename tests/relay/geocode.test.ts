import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyGeocode, resetGeocodeCacheForTests } from '../../relay/src/geocode';

const upstream = {
  results: [
    { name: 'Angers', admin1: 'Pays de la Loire', country: 'France', latitude: 47.47156, longitude: -0.55202, timezone: 'Europe/Paris', population: 152960 },
    { name: 'Angers', admin1: 'Québec', country: 'Canada', latitude: 45.50011, longitude: -75.48283, timezone: 'America/Toronto' },
    { name: 'Sans fuseau', country: 'Nulle part', latitude: 1, longitude: 1 },
    { name: 'Sans pays', latitude: -75.1, longitude: 123.35, timezone: 'Antarctica/McMurdo' },
  ],
};
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const call = (q: string, deps: { fetch: (url: string) => Promise<Response>; now?: () => number }) =>
  proxyGeocode(new URL(`https://relais.test/geocode?q=${encodeURIComponent(q)}`), { fetch: deps.fetch, now: deps.now ?? (() => 0) });

beforeEach(() => resetGeocodeCacheForTests());

describe('proxyGeocode', () => {
  it('refuse un texte de moins de 2 ou de plus de 60 caractères (après trim)', async () => {
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    for (const q of ['', ' ', ' a ', 'x'.repeat(61)]) expect((await call(q, { fetch: fetchFn })).status, q).toBe(400);
    expect((await proxyGeocode(new URL('https://relais.test/geocode'), { fetch: fetchFn, now: () => 0 })).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await call('Ay', { fetch: fetchFn })).status).toBe(200);
    expect((await call('x'.repeat(60), { fetch: fetchFn })).status).toBe(200);
  });

  it('interroge Open-Meteo en français et rend une liste réduite, arrondie à 0,01°, sans les résultats sans fuseau', async () => {
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    const out = await call('  Angers ', { fetch: fetchFn });
    expect(out.status).toBe(200);
    const sent = new URL(fetchFn.mock.calls[0]![0]);
    expect(sent.origin + sent.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(Object.fromEntries(sent.searchParams)).toEqual({ name: 'Angers', count: '8', language: 'fr', format: 'json' });
    expect(JSON.parse(out.body)).toEqual({
      ok: true,
      cities: [
        { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris', population: 152960 },
        { name: 'Angers', admin: 'Québec', country: 'Canada', lat: 45.5, lon: -75.48, tz: 'America/Toronto' },
        { name: 'Sans pays', country: '', lat: -75.1, lon: 123.35, tz: 'Antarctica/McMurdo' },
      ],
    });
  });

  it('aucun résultat (pas de clé « results ») : liste vide', async () => {
    const out = await call('Zzzzqx', { fetch: async () => reply({ generationtime_ms: 0.3 }) });
    expect(JSON.parse(out.body)).toEqual({ ok: true, cities: [] });
  });

  it('met en cache 24 h par texte normalisé (minuscules, sans accents)', async () => {
    let now = 1_000_000;
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    await call('Évry', { fetch: fetchFn, now: () => now });
    await call('  evry ', { fetch: fetchFn, now: () => now });
    await call('ÉVRY', { fetch: fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 24 * 3_600_000 + 1;
    await call('Évry', { fetch: fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('garde au plus 500 textes en cache', async () => {
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    for (let i = 0; i < 501; i += 1) await call(`ville ${i}`, { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(501);
    await call('ville 0', { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(502);
  });

  it('amont en panne ou réponse illisible → 502 upstream ; 429 relayé avec son délai', async () => {
    const down = await call('Paris', { fetch: async () => { throw new Error('x'); } });
    expect(down.status).toBe(502);
    expect(JSON.parse(down.body)).toEqual({ ok: false, reason: 'upstream' });
    expect((await call('Lyon', { fetch: async () => new Response('pas du json', { status: 200 }) })).status).toBe(502);
    expect((await call('Nice', { fetch: async () => reply({ results: 'x' }) })).status).toBe(502);
    expect((await call('Metz', { fetch: async () => reply({}, 500) })).status).toBe(502);
    const limited = await call('Caen', { fetch: async () => reply({ reason: 'trop' }, 429, { 'retry-after': '30' }) });
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe('30');
  });
});
