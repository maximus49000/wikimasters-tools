import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BASE = 'https://geo.api.gouv.fr/communes';
const CACHE_MS = 30 * 86_400_000;
const CACHE_MAX = 500;
const COORD = /^-?\d{1,3}(\.\d+)?$/;
const cache = new Map<string, { at: number; body: string }>();
const rounded = (v: number): number => Math.round(v * 10) / 10;

// Position (arrondie à 0,1°) → code du département, par le service ouvert de l'État (sans clé). Sert à déduire la zone scolaire.
export async function proxyDepartment(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const rawLat = url.searchParams.get('lat') ?? '';
  const rawLon = url.searchParams.get('lon') ?? '';
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!COORD.test(rawLat) || !COORD.test(rawLon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return failure(400, 'bad-request');
  const key = `${rounded(lat).toFixed(1)},${rounded(lon).toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const query = new URLSearchParams({ lat: rounded(lat).toFixed(1), lon: rounded(lon).toFixed(1), fields: 'codeDepartement', format: 'json' });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let rows: unknown;
  try {
    rows = JSON.parse(result.body);
  } catch {
    return failure(502, 'upstream');
  }
  if (!Array.isArray(rows)) return failure(502, 'upstream');
  const dept = (rows[0] as { codeDepartement?: unknown } | undefined)?.codeDepartement;
  if (typeof dept !== 'string') return failure(404, 'not-found');
  const body = JSON.stringify({ ok: true, dept });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
