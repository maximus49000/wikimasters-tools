// relay/src/tgdb.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';
import type { KvLike } from './kv';

const TGDB_BASE = 'https://api.thegamesdb.net';

// Proxy TheGamesDB : la clé reste côté relais. Quota ≈ 1000 requêtes par mois : toute réponse 200 est gardée en KV sans expiration.
export async function proxyTgdb(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined; kv: KvLike | undefined }): Promise<ProxyResult> {
  const path = url.pathname.replace(/^\/tgdb/, '');
  let cacheKey: string;
  let upstream: string;
  let query: URLSearchParams;
  if (path === '/games') {
    const name = (url.searchParams.get('name') ?? '').trim();
    if (name.length < 1 || name.length > 120) return failure(400, 'bad-request');
    cacheKey = `tgdb:games:${name.toLowerCase().replace(/\s+/g, ' ')}`;
    upstream = '/v1.1/Games/ByGameName';
    query = new URLSearchParams({ name, include: 'boxart,platform', fields: 'overview,platform' });
  } else if (path === '/images') {
    const ids = (url.searchParams.get('ids') ?? '').split(',');
    if (ids.length < 1 || ids.length > 20 || !ids.every((id) => /^\d{1,9}$/.test(id))) return failure(400, 'bad-request');
    cacheKey = `tgdb:images:${[...ids].sort((a, b) => Number(a) - Number(b)).join(',')}`;
    upstream = '/v1/Games/Images';
    query = new URLSearchParams({ games_id: ids.join(','), 'filter[type]': 'screenshot,clearlogo' });
  } else {
    return failure(404, 'not-found');
  }
  if (!deps.apiKey) return failure(503, 'not-configured');
  const cached = await deps.kv?.get(cacheKey);
  if (cached) return { status: 200, body: cached };
  query.set('apikey', deps.apiKey);
  const result = await forward(deps.fetch, `${TGDB_BASE}${upstream}?${query.toString()}`);
  if (result.status !== 200) return result;
  // TheGamesDB renvoie l'URL de la requête (clé comprise) dans `pages` : on la retire avant de répondre ou de mémoriser.
  const body = sanitize(result.body, deps.apiKey);
  if (body === null) return failure(502, 'upstream');
  // Jamais d'erreur en mémoire : seule une réponse 200 (code 200 dans le corps) est gardée.
  await deps.kv?.put(cacheKey, body);
  return { status: 200, body };
}

function sanitize(raw: string, key: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null || (json as { code?: unknown }).code !== 200) return null;
  delete (json as { pages?: unknown }).pages;
  // Ceinture : toute trace restante d'un paramètre apikey est effacée.
  return JSON.stringify(json).split(key).join('').replace(/apikey=[^&"\\\s]*/gi, 'apikey=');
}
