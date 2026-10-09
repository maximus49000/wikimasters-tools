import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

// Cache par case de 0,1° (compteur en mémoire de l'instance, comme le limiteur).
const cache = new Map<string, { at: number; body: string }>();

const rounded = (v: number): number => Math.round(v * 10) / 10;

export async function proxyWeather(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!url.searchParams.has('lat') || !url.searchParams.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return failure(400, 'bad-request');
  }
  const key = `${rounded(lat).toFixed(1)},${rounded(lon).toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const query = new URLSearchParams({
    latitude: rounded(lat).toFixed(1),
    longitude: rounded(lon).toFixed(1),
    current: 'weather_code,temperature_2m,cloud_cover,precipitation,wind_speed_10m,visibility',
    wind_speed_unit: 'kmh',
  });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let current: Record<string, unknown> | undefined;
  try {
    current = (JSON.parse(result.body) as { current?: Record<string, unknown> }).current;
  } catch {
    return failure(502, 'upstream');
  }
  const num = (name: string): number | null => (typeof current?.[name] === 'number' ? (current[name] as number) : null);
  const code = num('weather_code');
  const temp = num('temperature_2m');
  if (code === null || temp === null) return failure(502, 'upstream');
  const body = JSON.stringify({
    ok: true,
    code,
    temp,
    cloud: num('cloud_cover') ?? 0,
    precip: num('precipitation') ?? 0,
    wind: num('wind_speed_10m') ?? 0,
    visibility: num('visibility') ?? 20000,
  });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
