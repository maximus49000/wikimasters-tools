// relay/src/tmdb.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const TMDB_BASE = 'https://api.themoviedb.org/3';
// Les seules routes TMDB que l'appli utilise (fiche, filmographie, recherches).
const PATHS = [/^\/movie\/\d{1,9}$/, /^\/tv\/\d{1,9}$/, /^\/person\/\d{1,9}\/combined_credits$/, /^\/search\/(?:movie|tv|person|multi)$/];
// Les seuls paramètres transmis, chacun avec sa forme ; tout autre paramètre est ignoré.
const PARAMS = new Map<string, (value: string) => boolean>([
  ['language', (value) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value)],
  ['query', (value) => value.length >= 1 && value.length <= 200],
  ['append_to_response', (value) => /^[a-z/_,]{1,60}$/.test(value)],
  ['include_video_language', (value) => /^[a-z,]{1,20}$/.test(value)],
]);

export async function proxyTmdb(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined }): Promise<ProxyResult> {
  const path = url.pathname.replace(/^\/tmdb/, '');
  if (!PATHS.some((allowed) => allowed.test(path))) return failure(404, 'not-found');
  if (!deps.apiKey) return failure(503, 'not-configured');
  const query = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    const valid = PARAMS.get(name);
    if (!valid) continue;
    if (!valid(value)) return failure(400, 'bad-request');
    query.set(name, value);
  }
  query.set('api_key', deps.apiKey);
  return forward(deps.fetch, `${TMDB_BASE}${path}?${query.toString()}`);
}
