// relay/src/tgdb-img.ts
// Images de TheGamesDB (jaquettes, dos, captures, logos) relayées depuis son CDN, qui n'envoie pas d'en-têtes CORS :
// la page peut ainsi les lire pour les garder sur l'appareil, et elles sont gardées un an (un fichier du CDN ne change pas).
const CDN = 'https://cdn.thegamesdb.net/images';
// Seuls les dossiers d'images de jeux, tailles medium et original, fichiers image : pas un relais ouvert.
const PATH = /^\/tgdb-img\/(medium|original)\/((?:boxart\/(?:front|back)|screenshots|clearlogo)\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp|gif))$/;
const YEAR = 'public, max-age=31536000, immutable';
const CORS = { 'access-control-allow-origin': '*' };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function proxyTgdbImage(url: URL, deps: { fetch: Fetcher }): Promise<Response> {
  const match = PATH.exec(url.pathname);
  if (!match) return new Response('bad-request', { status: 400, headers: CORS });
  // Cache de Cloudflare : l'image n'est demandée au CDN qu'une fois par point de présence.
  const upstream = await deps.fetch(`${CDN}/${match[1]}/${match[2]}`, { cf: { cacheEverything: true, cacheTtl: 31_536_000 } } as RequestInit);
  if (upstream.status === 404) return new Response('not-found', { status: 404, headers: { ...CORS, 'cache-control': 'public, max-age=86400' } });
  const type = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) return new Response('upstream', { status: 502, headers: CORS });
  return new Response(upstream.body, { status: 200, headers: { ...CORS, 'content-type': type, 'cache-control': YEAR } });
}
