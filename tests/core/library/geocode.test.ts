import { describe, expect, it, vi } from 'vitest';
import { GEOCODE_RELAY, GeocodeError, searchPlaces } from '../../../src/core/library/geocode';

const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris', population: 152960 };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('searchPlaces', () => {
  it('interroge /geocode du relais avec le texte encodé et rend les villes', async () => {
    const doFetch = vi.fn(async (_url: string, _init?: RequestInit) => reply({ ok: true, cities: [ANGERS] }));
    const controller = new AbortController();
    expect(await searchPlaces(' Saint-Étienne ', controller.signal, doFetch)).toEqual([ANGERS]);
    expect(doFetch.mock.calls[0]![0]).toBe(`${GEOCODE_RELAY}?q=Saint-%C3%89tienne`);
    expect(doFetch.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it('écarte un résultat mal formé ou dont le fuseau est inconnu de l’appareil', async () => {
    const doFetch = async () => reply({ ok: true, cities: [ANGERS, { ...ANGERS, name: 'Olympus', tz: 'Mars/Olympus' }, { name: 'X' }, null] });
    expect(await searchPlaces('Angers', undefined, doFetch)).toEqual([ANGERS]);
  });

  it('réseau coupé → offline ; statut d’erreur ou réponse mal formée → failed', async () => {
    await expect(searchPlaces('Paris', undefined, async () => { throw new TypeError('Failed to fetch'); })).rejects.toMatchObject({ kind: 'offline' });
    await expect(searchPlaces('Paris', undefined, async () => reply({ ok: false, reason: 'upstream' }, 502))).rejects.toMatchObject({ kind: 'failed' });
    await expect(searchPlaces('Paris', undefined, async () => reply({ ok: true, cities: 'x' }))).rejects.toBeInstanceOf(GeocodeError);
  });

  it('une requête annulée rejette avec l’erreur d’annulation, pas « offline »', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('annulée', 'AbortError');
    await expect(searchPlaces('Paris', controller.signal, async () => { throw abort; })).rejects.toBe(abort);
  });
});
