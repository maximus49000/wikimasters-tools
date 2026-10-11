import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Overpass (OpenStreetMap, sans clé) avec repli : le serveur principal (communautaire, souvent saturé le soir : 504 constatés
// le 2026-10-09) puis le miroir maps.mail.ru (opéré par VK, plus lent : ≈ 33 s), choisi avec l'accord de l'utilisateur
// (2026-10-11). Essais l'un après l'autre (jamais en parallèle : pas de charge doublée sur des serveurs publics). Une
// réponse n'est retenue que complète : 200, JSON, liste `elements`, sans « remark » (requête interrompue, résultat partiel).
// Overpass refuse (406) les requêtes sans User-Agent identifiable.
export const OVERPASS_ENDPOINTS: readonly { url: string; timeoutMs: number }[] = [
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 20_000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', timeoutMs: 40_000 },
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
    if (result.status !== 200) continue;
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
