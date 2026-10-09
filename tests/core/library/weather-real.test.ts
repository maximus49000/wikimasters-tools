import { describe, expect, it, vi } from 'vitest';
import { createRealWeather, realToWeather, type RealObservation } from '../../../src/core/library/weather/weather-real';

const obs = (over: Partial<RealObservation> = {}): RealObservation => ({ code: 0, tempC: 15, cloud: 10, precipMm: 0, windKmh: 10, visibilityM: 20000, ...over });

describe('realToWeather', () => {
  it('ciel clair → soleil', () => {
    const w = realToWeather(obs());
    expect(w.cloud).toBeLessThan(0.2);
    expect(w.precip).toBe(0);
    expect(w.lightning).toBe(0);
  });
  it('pluie (code 63, 3 mm) → pluie franche, sol mouillé, ciel couvert', () => {
    const w = realToWeather(obs({ code: 63, precipMm: 3, cloud: 100 }));
    expect(w.kind).toBe('rain');
    expect(w.precip).toBeGreaterThan(0.5);
    expect(w.wet).toBeGreaterThan(0.5);
  });
  it('bruine (code 53) → faible précipitation', () => {
    const w = realToWeather(obs({ code: 53, cloud: 80 }));
    expect(w.precip).toBeGreaterThan(0.1);
    expect(w.precip).toBeLessThan(0.4);
  });
  it('neige (code 73) → flocons et sol blanc', () => {
    const w = realToWeather(obs({ code: 73, tempC: -2, cloud: 100 }));
    expect(w.kind).toBe('snow');
    expect(w.snowCover).toBeGreaterThan(0.4);
    expect(w.wet).toBe(0);
  });
  it('orage (code 95) → éclairs', () => {
    expect(realToWeather(obs({ code: 95, precipMm: 5, cloud: 100 })).lightning).toBe(1);
  });
  it('brouillard (code 45) ou faible visibilité → brume', () => {
    expect(realToWeather(obs({ code: 45 })).fog).toBeGreaterThan(0.7);
    expect(realToWeather(obs({ visibilityM: 800 })).fog).toBeGreaterThan(0.3);
  });
  it('le vent est normalisé', () => {
    expect(realToWeather(obs({ windKmh: 100 })).wind).toBe(1);
    expect(realToWeather(obs({ windKmh: 0 })).wind).toBe(0);
  });
});

const memory = () => {
  const data = new Map<string, string>();
  return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => void data.set(k, v) };
};
const ok = (extra = {}) => new Response(JSON.stringify({ ok: true, code: 61, temp: 8, cloud: 90, precip: 1, wind: 12, visibility: 9000, ...extra }), { status: 200 });
const paris = { lat: 48.85, lon: 2.35 };

describe('createRealWeather', () => {
  it('interroge le relais puis sert le cache 15 min', async () => {
    let now = 0;
    const fetchFn = vi.fn(async (_url: string) => ok());
    const real = createRealWeather({ fetch: fetchFn, now: () => now, storage: memory() });
    expect((await real.refresh(paris))?.code).toBe(61);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/weather?lat=48.9&lon=2.4');
    now += 14 * 60_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 2 * 60_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('un seul appel en vol', async () => {
    const fetchFn = vi.fn(async (_url: string) => ok());
    const real = createRealWeather({ fetch: fetchFn, now: () => 0, storage: memory() });
    await Promise.all([real.refresh(paris), real.refresh(paris), real.refresh(paris)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('en cas d’échec : null, garde la dernière valeur, réessaie après 1 puis 2 puis 5 min', async () => {
    let now = 0;
    let fail = false;
    const fetchFn = vi.fn(async (_url: string) => (fail ? new Response('{"ok":false}', { status: 502 }) : ok()));
    const real = createRealWeather({ fetch: fetchFn, now: () => now, storage: memory() });
    await real.refresh(paris);
    now += 16 * 60_000;
    fail = true;
    expect((await real.refresh(paris))?.code).toBe(61);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    now += 30_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    now += 40_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    now += 90_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    now += 40_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
  it('ne lève jamais (réseau coupé, JSON invalide) et ignore une réponse mal formée', async () => {
    const real = createRealWeather({ fetch: async () => { throw new Error('offline'); }, now: () => 0, storage: memory() });
    expect(await real.refresh(paris)).toBeNull();
    const junk = createRealWeather({ fetch: async () => new Response('pas du json', { status: 200 }), now: () => 0, storage: memory() });
    expect(await junk.refresh(paris)).toBeNull();
    const partial = createRealWeather({ fetch: async () => new Response('{"ok":true,"code":"x"}', { status: 200 }), now: () => 0, storage: memory() });
    expect(await partial.refresh(paris)).toBeNull();
  });
  it('relit le cache mémorisé au démarrage', async () => {
    const storage = memory();
    const first = createRealWeather({ fetch: async () => ok(), now: () => 0, storage });
    await first.refresh(paris);
    const second = createRealWeather({ fetch: async () => { throw new Error('offline'); }, now: () => 60_000, storage });
    expect(second.latest()?.code).toBe(61);
  });
});
