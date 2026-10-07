// relay/src/index.ts
import { indexStatus, indexStep } from './indexer';
import type { KvLike } from './kv';
import { parseSearchRequest, searchDocumentaries } from './search';

// Relais de recherche de documentaires (voir docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md).
export type Env = { YOUTUBE_API_KEY?: string; DOC_CACHE?: KvLike; DEBUG_TOKEN?: string };

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'x-debug',
  'cache-control': 'no-store',
};
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });

// Une vidéo existe et peut être intégrée ailleurs : l'oEmbed de YouTube répond 200 ; 401/403 = intégration interdite ; 400/404 = introuvable.
async function oembed(id: string): Promise<Response> {
  if (!/^[\w-]{3,32}$/.test(id)) return json({ ok: false, reason: 'not-found' }, 400);
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`);
  if (response.ok) {
    const body = (await response.json()) as { title?: string; author_name?: string };
    return json({ ok: true, title: body.title ?? '', channel: body.author_name ?? '' });
  }
  if (response.status === 401 || response.status === 403) return json({ ok: false, reason: 'not-embeddable' });
  if (response.status === 400 || response.status === 404) return json({ ok: false, reason: 'not-found' });
  return json({ ok: false, reason: 'upstream' }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/ping') return json({ ok: true, service: 'wikimasters-tools' });
    if (url.pathname === '/oembed') return oembed(url.searchParams.get('id') ?? '');
    // Contrôle : avancement de l'index et présence (jamais la valeur) des réglages du Worker.
    if (url.pathname === '/status') {
      const config = { youtubeKey: Boolean(env.YOUTUBE_API_KEY), kv: Boolean(env.DOC_CACHE), debugToken: Boolean(env.DEBUG_TOKEN) };
      return json({ ok: true, config, channels: env.DOC_CACHE ? await indexStatus(env.DOC_CACHE) : [] });
    }
    if (url.pathname === '/search') {
      const parsed = parseSearchRequest(url.searchParams);
      if (!parsed) return json({ ok: false, reason: 'bad-request' }, 400);
      if (!env.YOUTUBE_API_KEY || !env.DOC_CACHE) return json({ ok: false, reason: 'upstream' }, 503);
      const debug = env.DEBUG_TOKEN !== undefined && env.DEBUG_TOKEN !== '' && request.headers.get('x-debug') === env.DEBUG_TOKEN;
      const result = await searchDocumentaries({ fetch: (target) => fetch(target), kv: env.DOC_CACHE, apiKey: env.YOUTUBE_API_KEY, now: () => new Date() }, { ...parsed, debug });
      return json(result);
    }
    return json({ ok: false, error: 'Route inconnue' }, 404);
  },

  // Toutes les 30 minutes : avance l'index des chaînes de confiance (voir `wrangler.toml`, `crons`).
  async scheduled(_event: unknown, env: Env): Promise<void> {
    if (!env.YOUTUBE_API_KEY || !env.DOC_CACHE) return;
    await indexStep({ fetch: (target) => fetch(target), kv: env.DOC_CACHE, apiKey: env.YOUTUBE_API_KEY, now: () => new Date() });
  },
};
