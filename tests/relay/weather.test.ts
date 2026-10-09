import { describe, expect, it, vi } from 'vitest';
import { proxyWeather } from '../../relay/src/weather';

const upstream = {
  current: { weather_code: 61, temperature_2m: 7.4, cloud_cover: 90, precipitation: 1.2, wind_speed_10m: 18, visibility: 9000 },
};
const run = (path: string, now = 0, deps?: Partial<Parameters<typeof proxyWeather>[1]>) => {
  const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(upstream), { status: 200 }));
  return { fetchFn, result: proxyWeather(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => now, ...deps }) };
};

describe('proxyWeather', () => {
  it('arrondit les coordonnées à 0,1° et renvoie un JSON réduit', async () => {
    const { fetchFn, result } = run('/weather?lat=48.8566&lon=2.3522');
    const out = await result;
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ ok: true, code: 61, temp: 7.4, cloud: 90, precip: 1.2, wind: 18, visibility: 9000 });
    const sent = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(sent.origin).toBe('https://api.open-meteo.com');
    expect(sent.searchParams.get('latitude')).toBe('48.9');
    expect(sent.searchParams.get('longitude')).toBe('2.4');
  });
  it('refuse des coordonnées absentes ou hors bornes', async () => {
    for (const path of ['/weather', '/weather?lat=abc&lon=1', '/weather?lat=91&lon=0', '/weather?lat=0&lon=181']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('met en cache 10 minutes par case de 0,1°', async () => {
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(upstream), { status: 200 }));
    let now = 1_000_000;
    const deps = { fetch: fetchFn, now: () => now };
    await proxyWeather(new URL('https://r.test/weather?lat=10.01&lon=20.01'), deps);
    await proxyWeather(new URL('https://r.test/weather?lat=10.04&lon=20.04'), deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 11 * 60_000;
    await proxyWeather(new URL('https://r.test/weather?lat=10.01&lon=20.01'), deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('renvoie 502 neutre si l’amont échoue ou répond n’importe quoi', async () => {
    const down = await proxyWeather(new URL('https://r.test/weather?lat=1&lon=2'), { fetch: async () => { throw new Error('x'); }, now: () => 0 });
    expect(down.status).toBe(502);
    const junk = await proxyWeather(new URL('https://r.test/weather?lat=3&lon=4'), { fetch: async () => new Response('{"nope":1}', { status: 200 }), now: () => 0 });
    expect(junk.status).toBe(502);
  });
});
