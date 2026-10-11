import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Overpass (OpenStreetMap, sans clé) avec repli sur plusieurs serveurs publics, essayés l'un après l'autre (jamais en
// parallèle : pas de charge doublée). Constat du 2026-10-11 (journal du relais) : overpass-api.de refuse les connexions venant
// de Cloudflare (521) — la « panne » des noms de commerces n'en était pas une — et le miroir maps.mail.ru (VK) répond 504
// partout. D'où, dans l'ordre : OpenStreetMap France, private.coffee, Kumi Systems, puis overpass-api.de en dernier recours.
// Une réponse n'est retenue que complète : 200, JSON, liste `elements`, sans « remark » (requête interrompue, résultat partiel).
// Overpass refuse (406) les requêtes sans User-Agent identifiable.
export const OVERPASS_ENDPOINTS: readonly { url: string; timeoutMs: number }[] = [
  { url: 'https://overpass.openstreetmap.fr/api/interpreter', timeoutMs: 15_000 },
  { url: 'https://overpass.private.coffee/api/interpreter', timeoutMs: 15_000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 15_000 },
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 15_000 },
];
export const OVERPASS_UA = 'WikimastersTools/1.0 (relais)';

export type OverpassResult = { ok: true; elements: unknown[] } | { ok: false; fail: ProxyResult };

export async function overpass(doFetch: Fetcher, query: string): Promise<OverpassResult> {
  let limited = false;
  for (const { url, timeoutMs } of OVERPASS_ENDPOINTS) {
    const result = await forward(doFetch, url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': OVERPASS_UA },
      signal: AbortSignal.timeout(timeoutMs),
      body: `data=${encodeURIComponent(query)}`,
    });
    if (result.status === 429) limited = true;
    if (result.status !== 200) {
      // Journal Cloudflare (wrangler tail) : refus non transformé par forward (406, 429…), jamais la position.
      if (result.status !== 502) console.warn(`overpass ${new URL(url).host} ${result.status}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.body);
    } catch {
      continue;
    }
    if (typeof (parsed as { remark?: unknown }).remark === 'string') continue;
    const elements = (parsed as { elements?: unknown }).elements;
    if (Array.isArray(elements)) return { ok: true, elements };
  }
  return { ok: false, fail: limited ? failure(429, 'rate-limited') : failure(502, 'upstream') };
}
