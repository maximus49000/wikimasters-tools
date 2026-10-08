// relay/src/igdb.ts
import { DETAIL_FIELDS, SEARCH_FIELDS } from '../../src/core/game/igdb-queries';
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GAMES_URL = 'https://api.igdb.com/v4/games';
// Un jeton est renouvelé une heure avant son expiration.
const MARGIN_MS = 3_600_000;
const MAX_BODY = 600;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DETAIL = new RegExp(`^fields ${escape(DETAIL_FIELDS)}; where (?:id = \\d{1,9}|slug = "[\\w.-]{1,120}"); limit 1;$`);
const SEARCH = new RegExp(`^search "[^"\\\\;]{1,100}"; fields ${escape(SEARCH_FIELDS)}; limit 10;$`);

// Seules les deux formes de requête du client passent (jamais de `fields *`, ni de `limit` libre).
export const isAllowedQuery = (body: string): boolean => body.length <= MAX_BODY && (DETAIL.test(body) || SEARCH.test(body));

// Jeton Twitch gardé en mémoire de l'isolat (pas de KV : 1 000 écritures par jour seulement).
export type TokenState = { current: { token: string; expiresAt: number } | null };

type Deps = { fetch: Fetcher; clientId: string | undefined; clientSecret: string | undefined; state: TokenState; now: () => number };

async function token(deps: Deps, renew: boolean): Promise<string | null> {
  const kept = deps.state.current;
  if (!renew && kept && kept.expiresAt - deps.now() > MARGIN_MS) return kept.token;
  const url = `${TOKEN_URL}?client_id=${encodeURIComponent(deps.clientId ?? '')}&client_secret=${encodeURIComponent(deps.clientSecret ?? '')}&grant_type=client_credentials`;
  let response: Response;
  try {
    response = await deps.fetch(url, { method: 'POST' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') return null;
  deps.state.current = { token: data.access_token, expiresAt: deps.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function proxyIgdb(body: string, deps: Deps): Promise<ProxyResult> {
  if (!isAllowedQuery(body)) return failure(400, 'bad-request');
  if (!deps.clientId || !deps.clientSecret) return failure(503, 'not-configured');
  for (let attempt = 0; ; attempt += 1) {
    const bearer = await token(deps, attempt > 0);
    if (!bearer) return failure(502, 'upstream');
    const init = { method: 'POST', headers: { 'Client-ID': deps.clientId, Authorization: `Bearer ${bearer}`, Accept: 'application/json' }, body };
    // Un 401 d'IGDB (jeton refusé) est retenté une fois avec un jeton neuf.
    if (attempt === 0) {
      let probe: Response;
      try {
        probe = await deps.fetch(GAMES_URL, init);
      } catch {
        return failure(502, 'upstream');
      }
      if (probe.status !== 401) return forward(async () => probe, GAMES_URL);
      continue;
    }
    return forward(deps.fetch, GAMES_URL, init);
  }
}
