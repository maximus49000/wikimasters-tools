// relay/src/index.ts
import { indexStatus, indexStep } from './indexer';
import type { KvLike } from './kv';
import { parseSearchRequest, searchDocumentaries } from './search';
import { CHANNELS, PLATFORMS, validateBatch } from '../../src/core/telemetry/catalogue';
import { DASHBOARD_HTML } from './dashboard';
import { ingest } from './ingest';
import { computeStats, purgeOlderThan, RETENTION_DAYS } from './stats';
import type { D1Like } from './usage-db';

// Relais de recherche de documentaires (voir docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md)
// et collecte de la mesure d'usage anonyme (voir docs/superpowers/specs/2026-10-08-monitoring-usage-design.md).
export type Env = { YOUTUBE_API_KEY?: string; DOC_CACHE?: KvLike; DEBUG_TOKEN?: string; USAGE_DB?: D1Like; STATS_TOKEN?: string };

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'x-debug',
  'cache-control': 'no-store',
};
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });

const MAX_BODY = 16_000;
const empty = (status: number): Response => new Response(null, { status, headers: HEADERS });

// Réception d'un lot d'événements : 204 si écrit, 400 lot invalide, 413 trop gros, 503 base non configurée.
async function collect(request: Request, env: Env): Promise<Response> {
  if (!env.USAGE_DB) return empty(503);
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) return empty(413);
  const body = await request.text();
  if (body.length > MAX_BODY) return empty(413);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return empty(400);
  }
  const batch = validateBatch(raw);
  if (!batch) return empty(400);
  await ingest(env.USAGE_DB, batch, Math.floor(Date.now() / 1000));
  return empty(204);
}

// Agrégats du tableau de bord : réservés au porteur du jeton.
async function statistics(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.STATS_TOKEN || !env.USAGE_DB) return json({ ok: false, reason: 'not-configured' }, 503);
  if (request.headers.get('x-stats') !== env.STATS_TOKEN) return json({ ok: false, reason: 'unauthorized' }, 401);
  const days = Math.min(90, Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '30', 10) || 30));
  const pick = <T extends string>(allowed: readonly T[], value: string | null): T | null => allowed.find((candidate) => candidate === value) ?? null;
  const filters = { platform: pick(PLATFORMS, url.searchParams.get('platform')), channel: pick(CHANNELS, url.searchParams.get('channel')) };
  return json({ ok: true, stats: await computeStats(env.USAGE_DB, filters, days, Math.floor(Date.now() / 1000)) });
}

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
    if (url.pathname === '/t' && request.method === 'POST') return collect(request, env);
    if (url.pathname === '/stats') return statistics(request, env, url);
    if (url.pathname === '/dashboard') {
      return new Response(DASHBOARD_HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        },
      });
    }
    return json({ ok: false, error: 'Route inconnue' }, 404);
  },

  // Toutes les 30 minutes : avance l'index des chaînes de confiance (voir `wrangler.toml`, `crons`).
  async scheduled(event: { scheduledTime: number }, env: Env): Promise<void> {
    // Purge quotidienne (03:00 UTC, première exécution de l'heure) : rétention de 90 jours de la mesure d'usage.
    const at = new Date(event.scheduledTime);
    if (env.USAGE_DB && at.getUTCHours() === 3 && at.getUTCMinutes() < 30) {
      await purgeOlderThan(env.USAGE_DB, Math.floor(event.scheduledTime / 1000) - RETENTION_DAYS * 86400);
    }
    if (!env.YOUTUBE_API_KEY || !env.DOC_CACHE) return;
    await indexStep({ fetch: (target) => fetch(target), kv: env.DOC_CACHE, apiKey: env.YOUTUBE_API_KEY, now: () => new Date() });
  },
};
