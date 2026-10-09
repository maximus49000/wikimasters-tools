// relay/src/index.ts
import { proxyBooks } from './books';
import { proxyIgdb, type TokenState } from './igdb';
import { createIssue } from './issues';
import { createLimiter } from './limiter';
import type { ProxyResult } from './proxy';
import { proxyTmdb } from './tmdb';
import { proxyWeather } from './weather';
import { proxySchoolCalendar } from './school-calendar';
import { proxyDepartment } from './department';
import { proxyShops } from './shops';
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
export type Env = {
  YOUTUBE_API_KEY?: string;
  DOC_CACHE?: KvLike;
  DEBUG_TOKEN?: string;
  USAGE_DB?: D1Like;
  STATS_TOKEN?: string;
  TMDB_API_KEY?: string;
  IGDB_CLIENT_ID?: string;
  IGDB_CLIENT_SECRET?: string;
  GITHUB_ISSUES_TOKEN?: string;
  GOOGLE_BOOKS_API_KEY?: string;
};

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'x-debug, content-type',
  // Retry-After lisible depuis une page web (l'APK n'a pas d'autre moyen de connaître l'attente).
  'access-control-expose-headers': 'retry-after',
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
  // Espaces et retours à la ligne autour du jeton ignorés des deux côtés (un collage dans `wrangler secret put` en ajoute souvent un).
  const expected = env.STATS_TOKEN?.trim();
  if (!expected || !env.USAGE_DB) return json({ ok: false, reason: 'not-configured' }, 503);
  if ((request.headers.get('x-stats') ?? '').trim() !== expected) return json({ ok: false, reason: 'unauthorized' }, 401);
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

// Limites par adresse (compteurs en mémoire, voir limiter.ts) : [nombre d'appels, fenêtre en ms].
const LIMITS = { tmdb: [300, 60_000], igdb: [240, 60_000], books: [60, 60_000], weather: [60, 60_000], schoolCalendar: [30, 60_000], department: [60, 60_000], shops: [20, 60_000], issues: [5, 3_600_000] } as const;
const limiter = createLimiter(() => Date.now());
const igdbToken: TokenState = { current: null };

const relayed = (result: ProxyResult): Response =>
  new Response(result.body, { status: result.status, headers: { ...HEADERS, ...(result.retryAfter ? { 'retry-after': result.retryAfter } : {}) } });

function limited(request: Request, route: keyof typeof LIMITS): Response | null {
  const [limit, windowMs] = LIMITS[route];
  const verdict = limiter.check(`${route}:${request.headers.get('cf-connecting-ip') ?? 'inconnue'}`, limit, windowMs);
  return verdict.ok ? null : new Response(JSON.stringify({ ok: false, reason: 'rate-limited' }), { status: 429, headers: { ...HEADERS, 'retry-after': String(verdict.retryAfterSec) } });
}

// Corps d'un POST : au plus MAX_BODY octets, sinon null. Le flux est lu par morceaux et abandonné dès que la limite est dépassée
// (le content-length, absent ou mensonger, ne suffit pas).
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const net = (target: string, init?: RequestInit): Promise<Response> => fetch(target, init);

// Routes qui transmettent un appel à un service tiers avec les secrets du relais ; null si l'adresse n'en fait pas partie.
async function relay(request: Request, url: URL, env: Env): Promise<Response | null> {
  const get = request.method === 'GET';
  const post = request.method === 'POST';
  if (get && url.pathname.startsWith('/tmdb/')) return limited(request, 'tmdb') ?? relayed(await proxyTmdb(url, { fetch: net, apiKey: env.TMDB_API_KEY }));
  if (get && url.pathname.startsWith('/books/')) return limited(request, 'books') ?? relayed(await proxyBooks(url, { fetch: net, apiKey: env.GOOGLE_BOOKS_API_KEY }));
  if (get && url.pathname === '/weather') return limited(request, 'weather') ?? relayed(await proxyWeather(url, { fetch: net, now: () => Date.now() }));
  if (get && url.pathname === '/school-calendar') return limited(request, 'schoolCalendar') ?? relayed(await proxySchoolCalendar(url, { fetch: net, now: () => Date.now() }));
  if (get && url.pathname === '/department') return limited(request, 'department') ?? relayed(await proxyDepartment(url, { fetch: net, now: () => Date.now() }));
  if (get && url.pathname === '/shops') return limited(request, 'shops') ?? relayed(await proxyShops(url, { fetch: net, now: () => Date.now() }));
  if (post && url.pathname === '/igdb/games') {
    return (
      limited(request, 'igdb') ??
      relayed(await proxyIgdb((await readBody(request)) ?? '', { fetch: net, clientId: env.IGDB_CLIENT_ID, clientSecret: env.IGDB_CLIENT_SECRET, state: igdbToken, now: () => Date.now() }))
    );
  }
  if (post && url.pathname === '/issues') return limited(request, 'issues') ?? relayed(await createIssue((await readBody(request)) ?? '', { fetch: net, token: env.GITHUB_ISSUES_TOKEN }));
  return null;
}

// Routes du Worker (hors préambule CORS).
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const relayedResponse = await relay(request, url, env);
  if (relayedResponse) return relayedResponse;
  if (url.pathname === '/' || url.pathname === '/ping') return json({ ok: true, service: 'wikimasters-tools' });
  if (url.pathname === '/oembed') return oembed(url.searchParams.get('id') ?? '');
  // Contrôle : avancement de l'index et présence (jamais la valeur) des réglages du Worker.
  if (url.pathname === '/status') {
    const config = {
      youtubeKey: Boolean(env.YOUTUBE_API_KEY),
      kv: Boolean(env.DOC_CACHE),
      debugToken: Boolean(env.DEBUG_TOKEN),
      tmdbKey: Boolean(env.TMDB_API_KEY),
      igdb: Boolean(env.IGDB_CLIENT_ID) && Boolean(env.IGDB_CLIENT_SECRET),
      issuesToken: Boolean(env.GITHUB_ISSUES_TOKEN),
      booksKey: Boolean(env.GOOGLE_BOOKS_API_KEY),
    };
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    // Toute exception inattendue devient un 502 neutre qui garde les en-têtes CORS (sans eux, le navigateur la lirait comme une panne réseau).
    try {
      return await handle(request, env);
    } catch {
      return json({ ok: false, reason: 'upstream' }, 502);
    }
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
