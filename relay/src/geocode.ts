import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Recherche de ville (spec lieu §3.4) : Open-Meteo Geocoding, réponse réduite aux champs du réglage « Lieu de la scène ».
const BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_MS = 24 * 3_600_000;
const CACHE_MAX = 500;

// Cache par texte normalisé (compteur en mémoire de l'instance, comme le limiteur et /weather).
const cache = new Map<string, { at: number; body: string }>();
export const resetGeocodeCacheForTests = (): void => cache.clear();

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const round2 = (v: number): number => Math.round(v * 100) / 100;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

type City = { name: string; admin?: string; country: string; lat: number; lon: number; tz: string; population?: number };

// Un résultat amont → ville, ou null (sans nom, sans coordonnées ou sans fuseau : écarté).
function toCity(raw: unknown): City | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isText(r.name) || !isNum(r.latitude) || !isNum(r.longitude) || !isText(r.timezone)) return null;
  return {
    name: r.name,
    ...(isText(r.admin1) ? { admin: r.admin1 } : {}),
    country: isText(r.country) ? r.country : '',
    lat: round2(r.latitude),
    lon: round2(r.longitude),
    tz: r.timezone,
    ...(isNum(r.population) && r.population > 0 ? { population: r.population } : {}),
  };
}

export async function proxyGeocode(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 60) return failure(400, 'bad-request');
  const key = fold(q);
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const query = new URLSearchParams({ name: q, count: '8', language: 'fr', format: 'json' });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let results: unknown;
  try {
    // Aucun résultat : Open-Meteo omet la clé « results ».
    results = (JSON.parse(result.body) as { results?: unknown }).results ?? [];
  } catch {
    return failure(502, 'upstream');
  }
  if (!Array.isArray(results)) return failure(502, 'upstream');
  const cities = results.map(toCity).filter((c): c is City => c !== null);
  const body = JSON.stringify({ ok: true, cities });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
