# Monitoring de l'utilisation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesurer, de façon anonyme, les utilisateurs actifs, les actions réalisées dans les modules, les mises à jour et les erreurs d'API de l'extension et de l'app Android, avec un tableau de bord protégé sur le relais Cloudflare.

**Architecture:** Un module client `src/core/telemetry/` met en file des événements typés sur une liste fermée et les envoie par lots (`POST /t`) au relais existant. Le relais valide contre la même liste (fichier partagé), écrit dans Cloudflare D1 et sert `GET /stats` (JSON, jeton) et `GET /dashboard` (page HTML). Une purge à 90 jours tourne dans le cron existant.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers + D1, React (réglage), `node:sqlite` (faux D1 des tests, Node ≥ 22.13).

**Spec:** `docs/superpowers/specs/2026-10-08-monitoring-usage-design.md`

## Global Constraints

- On suit **l'action réalisée**, jamais l'affichage d'un module (lecture démarrée, lien sortant ouvert, changement confirmé).
- Erreurs techniques : toujours remontées, **sans identifiant** (`client_id` NULL). Usage (`active`, `action`, `update`) : activé par défaut, désactivable ; le défaut est la constante unique `USAGE_STATS_DEFAULT`.
- Jamais collecté : titres de cartes, pseudo, adresse IP stockée, contenu de page, URL complète, texte saisi, identifiants ou jetons.
- Noms d'événements : uniquement la liste fermée de `src/core/telemetry/catalogue.ts`, partagée par le client (typage) et le relais (validation).
- Un échec d'envoi n'a aucune conséquence : lot abandonné, aucune exception vers l'application.
- Extension **et** application Android : mêmes comportements ; texte des réglages en français, glyphes plutôt que du texte quand c'est possible.
- Rétention : 90 jours. Lot : 50 événements au plus. Corps de requête : 16 000 caractères au plus.
- Mêmes règles de livraison que d'habitude : `npm run typecheck`, `npm test`, `npm run build` avant PR ; fiche WikiHow (`entries.ts`) et entrée « Quoi de neuf » dans la même PR.
- Ne **jamais** committer de secret ; `STATS_TOKEN` et l'identifiant D1 sont fournis par l'utilisateur.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/core/telemetry/catalogue.ts` (créer) | Liste fermée, types, validation d'un événement et d'un lot (client + relais) |
| `src/core/telemetry/telemetry.ts` (créer) | File, lots, consentement, `active` quotidien, détection de mise à jour |
| `src/core/telemetry/registry.ts` (créer) | Singleton : `track` / `reportError` utilisables partout, sans plomberie |
| `src/core/telemetry/config.ts` (créer) | Adresse d'envoi, défaut du réglage |
| `src/core/telemetry/environment.ts` (créer) | Plateforme et canal |
| `src/core/telemetry/fetch-observer.ts` (créer) | Enveloppe de `fetch` qui signale 429 / 5xx / réseau par service |
| `relay/migrations/0001_events.sql` (créer) | Table `events` |
| `relay/src/usage-db.ts` (créer) | Type `D1Like` |
| `relay/src/ingest.ts` (créer) | Écriture d'un lot validé |
| `relay/src/stats.ts` (créer) | Agrégats et purge |
| `relay/src/dashboard.ts` (créer) | Page HTML |
| `relay/src/index.ts` (modifier) | Routes `/t`, `/stats`, `/dashboard`, purge au cron |
| `src/content/TelemetrySettings.tsx` (créer) | Écran du réglage |
| `src/content/ExtensionSettings.tsx`, `mount.tsx`, `src/app/overlay.ts` (modifier) | Ligne du réglage, câblage |
| `scripts/build-info.mjs`, `wxt.config.ts`, `vite.android.config.ts`, `vitest.config.ts`, `src/env.d.ts` (modifier) | `__WMT_BUILD__` |
| `tests/relay/sqlite-d1.ts` (créer) | Faux D1 sur `node:sqlite` |

---

### Task 1: Catalogue partagé et validation

**Files:**
- Create: `src/core/telemetry/catalogue.ts`
- Test: `tests/core/telemetry/catalogue.test.ts`

**Interfaces:**
- Produces:
  - `ACTIONS`, `ERRORS`, `SERVICES`, `PLATFORMS`, `CHANNELS`, `ACTIVE_NAME = 'jour-actif'`, `UPDATE_NAME = 'maj-appliquee'`, `MAX_EVENTS_PER_BATCH = 50`
  - types `Platform`, `Channel`, `ActionName`, `ErrorName`, `Service`, `ActionArgs<N>`, `ErrorArgs<N>`, `WireEvent`, `ValidEvent`, `ValidBatch`
  - `validateEvent(raw: unknown): ValidEvent | null`, `validateBatch(raw: unknown): ValidBatch | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/telemetry/catalogue.test.ts
import { describe, expect, it } from 'vitest';
import { validateBatch, validateEvent } from '../../../src/core/telemetry/catalogue';

const ID = '123e4567-e89b-42d3-a456-426614174000';

describe('validateEvent', () => {
  it('accepte une action connue avec son identifiant', () => {
    expect(validateEvent({ type: 'action', name: 'plein-ecran', clientId: ID })).toEqual({ type: 'action', name: 'plein-ecran', detail: null, clientId: ID, fromVersion: null });
  });
  it('exige un détail de la liste quand l’action en porte un, et le refuse sinon', () => {
    expect(validateEvent({ type: 'action', name: 'lecture-musique', detail: 'spotify', clientId: ID })?.detail).toBe('spotify');
    expect(validateEvent({ type: 'action', name: 'lecture-musique', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'lecture-musique', detail: 'deezer', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'plein-ecran', detail: 'x', clientId: ID })).toBeNull();
  });
  it('refuse un nom hors liste, y compris ceux du prototype', () => {
    expect(validateEvent({ type: 'action', name: 'inconnu', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'constructor', clientId: ID })).toBeNull();
  });
  it('refuse une action sans identifiant valide', () => {
    expect(validateEvent({ type: 'action', name: 'plein-ecran' })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'plein-ecran', clientId: 'abc' })).toBeNull();
  });
  it('une erreur n’a jamais d’identifiant, même si le client en envoie un', () => {
    expect(validateEvent({ type: 'error', name: 'api-429', detail: 'spotify', clientId: ID })).toEqual({ type: 'error', name: 'api-429', detail: 'spotify', clientId: null, fromVersion: null });
    expect(validateEvent({ type: 'error', name: 'js-erreur' })?.detail).toBeNull();
  });
  it('active : nom fixe, identifiant obligatoire', () => {
    expect(validateEvent({ type: 'active', name: 'jour-actif', clientId: ID })).not.toBeNull();
    expect(validateEvent({ type: 'active', name: 'autre', clientId: ID })).toBeNull();
  });
  it('update : version génératrice obligatoire et bien formée', () => {
    expect(validateEvent({ type: 'update', name: 'maj-appliquee', clientId: ID, fromVersion: '0.1.0+480' })?.fromVersion).toBe('0.1.0+480');
    expect(validateEvent({ type: 'update', name: 'maj-appliquee', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'update', name: 'maj-appliquee', clientId: ID, fromVersion: '<script>' })).toBeNull();
  });
  it('refuse tout ce qui n’est pas un objet', () => {
    for (const raw of [null, undefined, 3, 'x', [], [1]]) expect(validateEvent(raw)).toBeNull();
  });
});

describe('validateBatch', () => {
  const header = { platform: 'android', channel: 'preprod', version: '0.1.0+481' };
  it('garde les événements valides et ignore les autres', () => {
    const batch = validateBatch({ ...header, events: [{ type: 'action', name: 'plein-ecran', clientId: ID }, { type: 'action', name: 'nimporte', clientId: ID }] });
    expect(batch?.events).toHaveLength(1);
    expect(batch).toMatchObject({ platform: 'android', channel: 'preprod', version: '0.1.0+481' });
  });
  it('refuse une plateforme, un canal ou une version invalides', () => {
    expect(validateBatch({ ...header, platform: 'ios', events: [] })).toBeNull();
    expect(validateBatch({ ...header, channel: 'beta', events: [] })).toBeNull();
    expect(validateBatch({ ...header, version: 'v1', events: [] })).toBeNull();
  });
  it('refuse plus de 50 événements', () => {
    const events = Array.from({ length: 51 }, () => ({ type: 'action', name: 'plein-ecran', clientId: ID }));
    expect(validateBatch({ ...header, events })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/telemetry/catalogue.test.ts`
Expected: FAIL (`Cannot find module '.../catalogue'`)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/telemetry/catalogue.ts
// Liste fermée des événements mesurés. Un événement = une ACTION réalisée (lecture démarrée, lien ouvert, changement confirmé),
// jamais l'affichage d'un module. Partagée par le client (typage) et le relais (validation).
export const SERVICES = ['wikipedia', 'wikidata', 'commons', 'spotify', 'tidal', 'tmdb', 'steam', 'igdb', 'openlibrary', 'googlebooks', 'github', 'relais'] as const;
export type Service = (typeof SERVICES)[number];

// Valeurs permises du détail ; `[]` = pas de détail.
export const ACTIONS = {
  'lecture-musique': ['spotify', 'tidal'],
  'liaison-compte': ['spotify', 'tidal'],
  'bo-lue': [],
  'bande-annonce-lue': [],
  'streaming-lien-ouvert': [],
  'film-change': [],
  'jeu-video-lu': [],
  'jeu-change': [],
  'livre-lecture-ouverte': ['wikisource', 'gutenberg', 'internet-archive'],
  'livre-achat-ouvert': ['papier', 'ebook'],
  'livre-change': [],
  'documentaire-lu': [],
  'documentaire-change': [],
  'documentaire-propose': [],
  'carte-liee-ouverte': [],
  'toile-generee': [],
  'echange-prepare': [],
  'plein-ecran': [],
  'anomalie-signalee': [],
  'wikihow-fiche-lue': [],
  'visite-terminee': [],
  'reglage-modifie': ['images', 'publicite-achat', 'lecteur'],
} as const satisfies Record<string, readonly string[]>;

export const ERRORS = {
  'api-429': SERVICES,
  'api-5xx': SERVICES,
  'api-reseau': SERVICES,
  'js-erreur': [],
  'lecture-echec': ['spotify', 'tidal', 'video'],
} as const satisfies Record<string, readonly string[]>;

export const ACTIVE_NAME = 'jour-actif';
export const UPDATE_NAME = 'maj-appliquee';
export const PLATFORMS = ['extension', 'android'] as const;
export const CHANNELS = ['preprod', 'prod'] as const;
export const MAX_EVENTS_PER_BATCH = 50;

export type Platform = (typeof PLATFORMS)[number];
export type Channel = (typeof CHANNELS)[number];
export type ActionName = keyof typeof ACTIONS;
export type ErrorName = keyof typeof ERRORS;
type DetailArgs<D> = [D] extends [never] ? [] : [detail: D];
export type ActionArgs<N extends ActionName> = DetailArgs<(typeof ACTIONS)[N][number]>;
export type ErrorArgs<N extends ErrorName> = DetailArgs<(typeof ERRORS)[N][number]>;

export type WireEvent = { type: 'active' | 'action' | 'update' | 'error'; name: string; detail?: string; clientId?: string; fromVersion?: string };
export type ValidEvent = { type: WireEvent['type']; name: string; detail: string | null; clientId: string | null; fromVersion: string | null };
export type ValidBatch = { platform: Platform; channel: Channel; version: string; events: ValidEvent[] };

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(\+\d{1,7})?$/;
const CLIENT_ID = /^[0-9a-f-]{36}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const detailOk = (allowed: readonly string[], detail: string | undefined): boolean => (allowed.length === 0 ? detail === undefined : detail !== undefined && allowed.includes(detail));

export function validateEvent(raw: unknown): ValidEvent | null {
  if (!isRecord(raw)) return null;
  const type = text(raw.type);
  const name = text(raw.name);
  const detail = text(raw.detail);
  const clientId = text(raw.clientId);
  const fromVersion = text(raw.fromVersion);
  if (name === undefined) return null;
  const hasId = clientId !== undefined && CLIENT_ID.test(clientId);
  const made = (id: string | null, from: string | null = null): ValidEvent => ({ type: type as WireEvent['type'], name, detail: detail ?? null, clientId: id, fromVersion: from });
  if (type === 'error') {
    if (!Object.hasOwn(ERRORS, name) || !detailOk((ERRORS as Record<string, readonly string[]>)[name]!, detail)) return null;
    return made(null);
  }
  if (!hasId) return null;
  if (type === 'active') return name === ACTIVE_NAME && detail === undefined ? made(clientId) : null;
  if (type === 'update') return name === UPDATE_NAME && detail === undefined && fromVersion !== undefined && VERSION.test(fromVersion) ? made(clientId, fromVersion) : null;
  if (type === 'action') {
    if (!Object.hasOwn(ACTIONS, name) || !detailOk((ACTIONS as Record<string, readonly string[]>)[name]!, detail)) return null;
    return made(clientId);
  }
  return null;
}

export function validateBatch(raw: unknown): ValidBatch | null {
  if (!isRecord(raw) || !Array.isArray(raw.events) || raw.events.length > MAX_EVENTS_PER_BATCH) return null;
  const platform = PLATFORMS.find((candidate) => candidate === raw.platform);
  const channel = CHANNELS.find((candidate) => candidate === raw.channel);
  const version = text(raw.version);
  if (!platform || !channel || version === undefined || !VERSION.test(version)) return null;
  const events = raw.events.map(validateEvent).filter((event): event is ValidEvent => event !== null);
  return { platform, channel, version, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/telemetry/catalogue.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/catalogue.ts tests/core/telemetry/catalogue.test.ts
git commit -m "feat(monitoring): catalogue fermé des événements et validation"
```

---

### Task 2: Relais — stockage D1 et réception `POST /t`

**Files:**
- Create: `relay/migrations/0001_events.sql`, `relay/src/usage-db.ts`, `relay/src/ingest.ts`
- Create: `tests/relay/sqlite-d1.ts`
- Modify: `relay/src/index.ts` (type `Env`, route `/t`)
- Test: `tests/relay/ingest.test.ts`

**Interfaces:**
- Consumes: `validateBatch`, `ValidBatch` (Task 1)
- Produces:
  - `D1Like` (`prepare(sql): D1Statement`, `batch(statements): Promise<unknown[]>`), `D1Statement` (`bind(...values): D1Statement`, `run()`, `all<T>(): Promise<{ results: T[] }>`)
  - `ingest(db: D1Like, batch: ValidBatch, nowSec: number): Promise<number>`
  - `sqliteD1(): D1Like & { exec(sql: string): void }` (tests uniquement) : base mémoire avec la migration appliquée
  - `Env` reçoit `USAGE_DB?: D1Like; STATS_TOKEN?: string`

- [ ] **Step 1: Write the migration and the D1 type**

```sql
-- relay/migrations/0001_events.sql
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  client_id TEXT,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  from_version TEXT,
  channel TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_type_name_ts ON events (type, name, ts);
```

```ts
// relay/src/usage-db.ts
// Partie de l'API Cloudflare D1 utilisée par le relais (le faux des tests s'appuie sur `node:sqlite`).
export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};
export type D1Like = { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown[]> };
```

- [ ] **Step 2: Write the fake D1 for tests**

```ts
// tests/relay/sqlite-d1.ts
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Like, D1Statement } from '../../relay/src/usage-db';

// Faux D1 : une base SQLite en mémoire avec la vraie migration, pour tester le SQL réel.
export function sqliteD1(): D1Like & { exec(sql: string): void } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../relay/migrations/0001_events.sql', import.meta.url), 'utf8'));
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...next) => statement(sql, next),
    run: async () => db.prepare(sql).run(...(values as SQLInputValue[])),
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as SQLInputValue[])) as T[] }),
  });
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const done: unknown[] = [];
        for (const item of statements) done.push(await item.run());
        db.exec('COMMIT');
        return done;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/relay/ingest.test.ts
import { describe, expect, it } from 'vitest';
import worker from '../../relay/src/index';
import { ingest } from '../../relay/src/ingest';
import { validateBatch } from '../../src/core/telemetry/catalogue';
import { sqliteD1 } from './sqlite-d1';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const header = { platform: 'extension', channel: 'prod', version: '0.1.0+482' };
const post = (body: string, env: Parameters<typeof worker.fetch>[1]) =>
  worker.fetch(new Request('https://relais.test/t', { method: 'POST', body, headers: { 'content-type': 'text/plain' } }), env);

describe('ingest', () => {
  it('écrit chaque événement avec l’en-tête du lot et l’heure du serveur', async () => {
    const db = sqliteD1();
    const batch = validateBatch({ ...header, events: [{ type: 'action', name: 'lecture-musique', detail: 'tidal', clientId: ID }, { type: 'error', name: 'api-429', detail: 'spotify' }] })!;
    expect(await ingest(db, batch, 1000)).toBe(2);
    const rows = (await db.prepare('SELECT ts, type, name, client_id, platform, version, channel, detail FROM events ORDER BY id').all()).results;
    expect(rows).toEqual([
      { ts: 1000, type: 'action', name: 'lecture-musique', client_id: ID, platform: 'extension', version: '0.1.0+482', channel: 'prod', detail: 'tidal' },
      { ts: 1000, type: 'error', name: 'api-429', client_id: null, platform: 'extension', version: '0.1.0+482', channel: 'prod', detail: 'spotify' },
    ]);
  });
  it('un lot vide n’écrit rien', async () => {
    const db = sqliteD1();
    expect(await ingest(db, validateBatch({ ...header, events: [] })!, 1)).toBe(0);
  });
});

describe('POST /t', () => {
  it('répond 204 et enregistre', async () => {
    const db = sqliteD1();
    const response = await post(JSON.stringify({ ...header, events: [{ type: 'action', name: 'plein-ecran', clientId: ID }] }), { USAGE_DB: db });
    expect(response.status).toBe(204);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM events').all<{ n: number }>()).results[0]!.n).toBe(1);
  });
  it('503 sans base configurée', async () => {
    expect((await post('{}', {})).status).toBe(503);
  });
  it('400 sur un JSON invalide ou un lot invalide', async () => {
    const env = { USAGE_DB: sqliteD1() };
    expect((await post('pas du json', env)).status).toBe(400);
    expect((await post(JSON.stringify({ ...header, platform: 'ios', events: [] }), env)).status).toBe(400);
  });
  it('413 au-delà de 16 000 caractères', async () => {
    expect((await post('x'.repeat(16001), { USAGE_DB: sqliteD1() })).status).toBe(413);
  });
  it('les autres méthodes sur /t ne passent pas', async () => {
    const response = await worker.fetch(new Request('https://relais.test/t'), { USAGE_DB: sqliteD1() });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/relay/ingest.test.ts`
Expected: FAIL (`Cannot find module '../../relay/src/ingest'`)

- [ ] **Step 5: Write minimal implementation**

```ts
// relay/src/ingest.ts
import type { ValidBatch } from '../../src/core/telemetry/catalogue';
import type { D1Like } from './usage-db';

const INSERT = 'INSERT INTO events (ts, type, name, client_id, platform, version, from_version, channel, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

// Écrit un lot déjà validé (une seule transaction) ; rend le nombre d'événements écrits.
export async function ingest(db: D1Like, batch: ValidBatch, nowSec: number): Promise<number> {
  if (batch.events.length === 0) return 0;
  await db.batch(batch.events.map((e) => db.prepare(INSERT).bind(nowSec, e.type, e.name, e.clientId, batch.platform, batch.version, e.fromVersion, batch.channel, e.detail)));
  return batch.events.length;
}
```

Dans `relay/src/index.ts` :

```ts
// en haut
import { validateBatch } from '../../src/core/telemetry/catalogue';
import { ingest } from './ingest';
import type { D1Like } from './usage-db';

export type Env = { YOUTUBE_API_KEY?: string; DOC_CACHE?: KvLike; DEBUG_TOKEN?: string; USAGE_DB?: D1Like; STATS_TOKEN?: string };

const MAX_BODY = 16_000;
const empty = (status: number): Response => new Response(null, { status, headers: HEADERS });

// Mesure d'usage anonyme : voir docs/superpowers/specs/2026-10-08-monitoring-usage-design.md.
async function collect(request: Request, env: Env): Promise<Response> {
  if (!env.USAGE_DB) return empty(503);
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY) return empty(413);
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
```

et dans `fetch`, avant la route inconnue :

```ts
if (url.pathname === '/t' && request.method === 'POST') return collect(request, env);
```

(la ligne `export type Env` existante est remplacée par celle ci-dessus).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/relay`
Expected: PASS (tous les tests du relais, anciens compris)

- [ ] **Step 7: Commit**

```bash
git add relay tests/relay
git commit -m "feat(monitoring): réception des événements sur le relais (D1)"
```

---

### Task 3: Relais — agrégats, `GET /stats`, purge

**Files:**
- Create: `relay/src/stats.ts`
- Modify: `relay/src/index.ts` (route `/stats`, purge au cron)
- Test: `tests/relay/stats.test.ts`

**Interfaces:**
- Consumes: `D1Like` (Task 2), `PLATFORMS`, `CHANNELS` (Task 1)
- Produces:
  - `type Filters = { platform: string | null; channel: string | null }`
  - `computeStats(db: D1Like, filters: Filters, days: number, nowSec: number): Promise<Stats>` avec
    `Stats = { days: number; actives: { today: number; week: number; month: number }; activeByDay: { day: string; count: number }[]; actions: { name: string; detail: string; count: number; users: number }[]; errors: { name: string; detail: string; count: number }[]; errorsByDay: { day: string; count: number }[]; versions: { version: string; count: number }[]; updates: { day: string; from: string; to: string; count: number }[] }`
  - `purgeOlderThan(db: D1Like, beforeSec: number): Promise<void>`, `RETENTION_DAYS = 90`

- [ ] **Step 1: Write the failing test**

```ts
// tests/relay/stats.test.ts
import { describe, expect, it } from 'vitest';
import worker from '../../relay/src/index';
import { computeStats, purgeOlderThan } from '../../relay/src/stats';
import { sqliteD1 } from './sqlite-d1';

const DAY = 86400;
const NOW = 1_800_000_000 - (1_800_000_000 % DAY) + 3600; // 01:00 UTC d'un jour
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const none = { platform: null, channel: null };

type Row = { ts: number; type: string; name: string; client?: string | null; platform?: string; version?: string; from?: string | null; channel?: string; detail?: string | null };
async function seed(db: ReturnType<typeof sqliteD1>, rows: Row[]) {
  for (const r of rows) {
    await db
      .prepare('INSERT INTO events (ts, type, name, client_id, platform, version, from_version, channel, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(r.ts, r.type, r.name, r.client ?? null, r.platform ?? 'extension', r.version ?? '0.1.0+10', r.from ?? null, r.channel ?? 'prod', r.detail ?? null)
      .run();
  }
}

describe('computeStats', () => {
  it('compte les actifs distincts aujourd’hui, sur 7 et 30 jours', async () => {
    const db = sqliteD1();
    await seed(db, [
      { ts: NOW, type: 'active', name: 'jour-actif', client: A },
      { ts: NOW + 10, type: 'active', name: 'jour-actif', client: A },
      { ts: NOW - 3 * DAY, type: 'active', name: 'jour-actif', client: B },
      { ts: NOW - 20 * DAY, type: 'active', name: 'jour-actif', client: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    ]);
    expect((await computeStats(db, none, 30, NOW)).actives).toEqual({ today: 1, week: 2, month: 3 });
  });
  it('classe les actions par nombre, avec le nombre d’utilisateurs', async () => {
    const db = sqliteD1();
    await seed(db, [
      { ts: NOW, type: 'action', name: 'lecture-musique', detail: 'spotify', client: A },
      { ts: NOW, type: 'action', name: 'lecture-musique', detail: 'spotify', client: A },
      { ts: NOW, type: 'action', name: 'lecture-musique', detail: 'spotify', client: B },
      { ts: NOW, type: 'action', name: 'plein-ecran', client: A },
    ]);
    const { actions } = await computeStats(db, none, 30, NOW);
    expect(actions[0]).toEqual({ name: 'lecture-musique', detail: 'spotify', count: 3, users: 2 });
    expect(actions[1]).toEqual({ name: 'plein-ecran', detail: '', count: 1, users: 1 });
  });
  it('sépare les erreurs, par jour aussi', async () => {
    const db = sqliteD1();
    await seed(db, [
      { ts: NOW, type: 'error', name: 'api-429', detail: 'wikipedia' },
      { ts: NOW, type: 'error', name: 'api-429', detail: 'wikipedia' },
      { ts: NOW - DAY, type: 'error', name: 'js-erreur' },
    ]);
    const stats = await computeStats(db, none, 30, NOW);
    expect(stats.errors[0]).toEqual({ name: 'api-429', detail: 'wikipedia', count: 2 });
    expect(stats.errorsByDay.map((d) => d.count)).toEqual([1, 2]);
  });
  it('répartit par dernière version connue de chaque installation', async () => {
    const db = sqliteD1();
    await seed(db, [
      { ts: NOW - DAY, type: 'active', name: 'jour-actif', client: A, version: '0.1.0+10' },
      { ts: NOW, type: 'active', name: 'jour-actif', client: A, version: '0.1.0+12' },
      { ts: NOW, type: 'active', name: 'jour-actif', client: B, version: '0.1.0+10' },
    ]);
    const { versions } = await computeStats(db, none, 30, NOW);
    expect(versions).toEqual(expect.arrayContaining([{ version: '0.1.0+12', count: 1 }, { version: '0.1.0+10', count: 1 }]));
    expect(versions).toHaveLength(2);
  });
  it('journal des mises à jour : génératrice → ciblée', async () => {
    const db = sqliteD1();
    await seed(db, [
      { ts: NOW, type: 'update', name: 'maj-appliquee', client: A, from: '0.1.0+10', version: '0.1.0+12' },
      { ts: NOW, type: 'update', name: 'maj-appliquee', client: B, from: '0.1.0+10', version: '0.1.0+12' },
    ]);
    const { updates } = await computeStats(db, none, 30, NOW);
    expect(updates).toEqual([{ day: new Date(NOW * 1000).toISOString().slice(0, 10), from: '0.1.0+10', to: '0.1.0+12', count: 2 }]);
  });
  it('filtre par plateforme et par canal', async () => {
    const db = sqliteD1();
    await seed(db, [
      { ts: NOW, type: 'active', name: 'jour-actif', client: A, platform: 'android', channel: 'preprod' },
      { ts: NOW, type: 'active', name: 'jour-actif', client: B, platform: 'extension', channel: 'prod' },
    ]);
    expect((await computeStats(db, { platform: 'android', channel: null }, 30, NOW)).actives.month).toBe(1);
    expect((await computeStats(db, { platform: null, channel: 'prod' }, 30, NOW)).actives.month).toBe(1);
    expect((await computeStats(db, { platform: 'android', channel: 'prod' }, 30, NOW)).actives.month).toBe(0);
  });
});

describe('purgeOlderThan', () => {
  it('supprime ce qui précède la date donnée', async () => {
    const db = sqliteD1();
    await seed(db, [{ ts: 10, type: 'error', name: 'js-erreur' }, { ts: 100, type: 'error', name: 'js-erreur' }]);
    await purgeOlderThan(db, 50);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM events').all<{ n: number }>()).results[0]!.n).toBe(1);
  });
});

describe('GET /stats', () => {
  const call = (headers: Record<string, string>, env: Parameters<typeof worker.fetch>[1], query = '') =>
    worker.fetch(new Request(`https://relais.test/stats${query}`, { headers }), env);
  it('401 sans le bon jeton, 503 si aucun jeton n’est configuré', async () => {
    const db = sqliteD1();
    expect((await call({}, { USAGE_DB: db, STATS_TOKEN: 'secret' })).status).toBe(401);
    expect((await call({ 'x-stats': 'faux' }, { USAGE_DB: db, STATS_TOKEN: 'secret' })).status).toBe(401);
    expect((await call({ 'x-stats': 'secret' }, { USAGE_DB: db })).status).toBe(503);
  });
  it('rend les agrégats avec le bon jeton et ignore les filtres inconnus', async () => {
    const response = await call({ 'x-stats': 'secret' }, { USAGE_DB: sqliteD1(), STATS_TOKEN: 'secret' }, '?days=7&platform=ios&channel=prod');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, stats: { days: 7, actives: { today: 0, week: 0, month: 0 } } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relay/stats.test.ts`
Expected: FAIL (`Cannot find module '../../relay/src/stats'`)

- [ ] **Step 3: Write minimal implementation**

```ts
// relay/src/stats.ts
import type { D1Like } from './usage-db';

export const RETENTION_DAYS = 90;
const DAY = 86400;

export type Filters = { platform: string | null; channel: string | null };
export type Stats = {
  days: number;
  actives: { today: number; week: number; month: number };
  activeByDay: { day: string; count: number }[];
  actions: { name: string; detail: string; count: number; users: number }[];
  errors: { name: string; detail: string; count: number }[];
  errorsByDay: { day: string; count: number }[];
  versions: { version: string; count: number }[];
  updates: { day: string; from: string; to: string; count: number }[];
};

// Condition commune : depuis `from`, puis plateforme et canal si demandés.
function scope(filters: Filters, from: number): { where: string; params: unknown[] } {
  const parts = ['ts >= ?'];
  const params: unknown[] = [from];
  if (filters.platform) {
    parts.push('platform = ?');
    params.push(filters.platform);
  }
  if (filters.channel) {
    parts.push('channel = ?');
    params.push(filters.channel);
  }
  return { where: parts.join(' AND '), params };
}

async function rows<T>(db: D1Like, sql: string, params: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results;
}

export async function computeStats(db: D1Like, filters: Filters, days: number, nowSec: number): Promise<Stats> {
  const since = scope(filters, nowSec - days * DAY);
  const distinct = async (from: number): Promise<number> => {
    const s = scope(filters, from);
    return (await rows<{ n: number }>(db, `SELECT COUNT(DISTINCT client_id) AS n FROM events WHERE type = 'active' AND ${s.where}`, s.params))[0]?.n ?? 0;
  };
  const [today, week, month] = await Promise.all([distinct(nowSec - (nowSec % DAY)), distinct(nowSec - 7 * DAY), distinct(nowSec - 30 * DAY)]);
  const [activeByDay, actions, errors, errorsByDay, versions, updates] = await Promise.all([
    rows<{ day: string; count: number }>(db, `SELECT date(ts, 'unixepoch') AS day, COUNT(DISTINCT client_id) AS count FROM events WHERE type = 'active' AND ${since.where} GROUP BY day ORDER BY day`, since.params),
    rows<{ name: string; detail: string; count: number; users: number }>(db, `SELECT name, COALESCE(detail, '') AS detail, COUNT(*) AS count, COUNT(DISTINCT client_id) AS users FROM events WHERE type = 'action' AND ${since.where} GROUP BY name, detail ORDER BY count DESC, name LIMIT 100`, since.params),
    rows<{ name: string; detail: string; count: number }>(db, `SELECT name, COALESCE(detail, '') AS detail, COUNT(*) AS count FROM events WHERE type = 'error' AND ${since.where} GROUP BY name, detail ORDER BY count DESC, name LIMIT 100`, since.params),
    rows<{ day: string; count: number }>(db, `SELECT date(ts, 'unixepoch') AS day, COUNT(*) AS count FROM events WHERE type = 'error' AND ${since.where} GROUP BY day ORDER BY day`, since.params),
    rows<{ version: string; count: number }>(db, `SELECT version, COUNT(*) AS count FROM (SELECT client_id, version, MAX(ts) FROM events WHERE type = 'active' AND ${since.where} GROUP BY client_id) GROUP BY version ORDER BY count DESC, version`, since.params),
    rows<{ day: string; from: string; to: string; count: number }>(db, `SELECT date(ts, 'unixepoch') AS day, from_version AS "from", version AS "to", COUNT(*) AS count FROM events WHERE type = 'update' AND ${since.where} GROUP BY day, from_version, version ORDER BY day DESC, count DESC LIMIT 200`, since.params),
  ]);
  return { days, actives: { today, week, month }, activeByDay, actions, errors, errorsByDay, versions, updates };
}

export async function purgeOlderThan(db: D1Like, beforeSec: number): Promise<void> {
  await db.prepare('DELETE FROM events WHERE ts < ?').bind(beforeSec).run();
}
```

Dans `relay/src/index.ts` :

```ts
import { CHANNELS, PLATFORMS } from '../../src/core/telemetry/catalogue';
import { computeStats, purgeOlderThan, RETENTION_DAYS } from './stats';

async function statistics(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.STATS_TOKEN || !env.USAGE_DB) return json({ ok: false, reason: 'not-configured' }, 503);
  if (request.headers.get('x-stats') !== env.STATS_TOKEN) return json({ ok: false, reason: 'unauthorized' }, 401);
  const days = Math.min(90, Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '30', 10) || 30));
  const pick = <T extends string>(allowed: readonly T[], value: string | null): T | null => allowed.find((candidate) => candidate === value) ?? null;
  const filters = { platform: pick(PLATFORMS, url.searchParams.get('platform')), channel: pick(CHANNELS, url.searchParams.get('channel')) };
  return json({ ok: true, stats: await computeStats(env.USAGE_DB, filters, days, Math.floor(Date.now() / 1000)) });
}
```

route : `if (url.pathname === '/stats') return statistics(request, env, url);` placée **avant** la route `/status` existante n'est pas nécessaire (chemins distincts) ; la placer juste avant la route inconnue.

Cron : remplacer la signature `scheduled(_event: unknown, env: Env)` par

```ts
async scheduled(event: { scheduledTime: number }, env: Env): Promise<void> {
  // Purge quotidienne (03:00 UTC, première exécution de l'heure) : rétention de 90 jours.
  const at = new Date(event.scheduledTime);
  if (env.USAGE_DB && at.getUTCHours() === 3 && at.getUTCMinutes() < 30) await purgeOlderThan(env.USAGE_DB, Math.floor(event.scheduledTime / 1000) - RETENTION_DAYS * 86400);
  if (!env.YOUTUBE_API_KEY || !env.DOC_CACHE) return;
  await indexStep({ fetch: (target) => fetch(target), kv: env.DOC_CACHE, apiKey: env.YOUTUBE_API_KEY, now: () => new Date() });
},
```

(attention : l'ancien `return` précoce quand la clé YouTube manque ne doit plus empêcher la purge — d'où l'ordre ci-dessus). Si un test existant appelle `scheduled(…)` avec un autre premier argument, l'adapter à `{ scheduledTime: Date.now() }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/relay`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add relay tests/relay
git commit -m "feat(monitoring): agrégats, route /stats protégée et purge à 90 jours"
```

---

### Task 4: Relais — page `GET /dashboard`

**Files:**
- Create: `relay/src/dashboard.ts`
- Modify: `relay/src/index.ts` (route)
- Test: `tests/relay/dashboard.test.ts`

**Interfaces:**
- Consumes: forme de `Stats` (Task 3), route `/stats` avec en-tête `x-stats`
- Produces: `DASHBOARD_HTML: string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/relay/dashboard.test.ts
import { describe, expect, it } from 'vitest';
import worker from '../../relay/src/index';

describe('GET /dashboard', () => {
  it('sert la page HTML sans secret, avec une politique de contenu stricte', async () => {
    const response = await worker.fetch(new Request('https://relais.test/dashboard'), { STATS_TOKEN: 'secret-value' });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).not.toContain('secret-value');
    expect(html).toContain('/stats');
  });
  it('n’injecte jamais de données dans le HTML (textContent seulement)', async () => {
    const html = await (await worker.fetch(new Request('https://relais.test/dashboard'), {})).text();
    expect(html).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/relay/dashboard.test.ts`
Expected: FAIL (404)

- [ ] **Step 3: Write the implementation**

```ts
// relay/src/dashboard.ts
// Tableau de bord : une page, sans dépendance. Le jeton est saisi une fois puis gardé dans le navigateur ; toutes les valeurs
// sont posées avec `textContent` (jamais de HTML injecté).
export const DASHBOARD_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Usage — Wikimasters Tools</title>
<style>
:root{--bg:#f6f7f9;--fg:#111827;--muted:#6b7280;--card:#fff;--line:#e5e7eb;--accent:#2563eb;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9ca3af;--card:#161b22;--line:#30363d;--accent:#60a5fa;--bad:#f87171}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:0 0 8px}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
select,input,button{min-height:44px;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:0 10px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px;overflow-x:auto}
.tile b{display:block;font-size:28px}.tile span{color:var(--muted);font-size:13px}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);font-size:14px}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
svg{width:100%;height:120px;display:block}
.muted{color:var(--muted)}.bad{color:var(--bad)}
#login{display:none}
</style>
</head>
<body>
<main>
<h1>Usage de Wikimasters Tools</h1>
<form id="login" class="card"><h2>Jeton d’accès</h2><div class="bar"><input id="token" type="password" autocomplete="off" aria-label="Jeton" placeholder="Jeton"><button>Valider</button></div><p id="loginError" class="bad"></p></form>
<div id="app" hidden>
<div class="bar">
<select id="platform" aria-label="Plateforme"><option value="">Toutes plateformes</option><option value="extension">Extension</option><option value="android">Android</option></select>
<select id="channel" aria-label="Canal"><option value="">Tous canaux</option><option value="prod">Production</option><option value="preprod">Pré-production</option></select>
<select id="days" aria-label="Période"><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option></select>
<button id="logout" type="button">Changer de jeton</button>
</div>
<div class="tiles"><div class="card tile"><b id="t-today">–</b><span>actifs aujourd’hui</span></div><div class="card tile"><b id="t-week">–</b><span>actifs 7 jours</span></div><div class="card tile"><b id="t-month">–</b><span>actifs 30 jours</span></div></div>
<div class="card"><h2>Actifs par jour</h2><div id="c-active"></div></div>
<div class="card"><h2>Actions les plus utilisées</h2><div id="c-actions"></div></div>
<div class="card"><h2>Erreurs</h2><div id="c-errors"></div><div id="c-errors-day"></div></div>
<div class="card"><h2>Versions installées</h2><div id="c-versions"></div></div>
<div class="card"><h2>Mises à jour réalisées</h2><div id="c-updates"></div></div>
<p id="status" class="muted"></p>
</div>
</main>
<script>
(function () {
  var KEY = 'wmt-stats-token';
  var $ = function (id) { return document.getElementById(id); };
  var token = ''; try { token = localStorage.getItem(KEY) || ''; } catch (e) {}
  function el(tag, text, cls) { var n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; }
  function table(target, head, rows) {
    target.textContent = '';
    if (!rows.length) { target.appendChild(el('p', 'Aucune donnée sur la période.', 'muted')); return; }
    var t = el('table'), h = el('tr');
    head.forEach(function (c, i) { h.appendChild(el('th', c, i === head.length - 1 ? 'n' : '')); });
    t.appendChild(h);
    rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { tr.appendChild(el('td', c, i === r.length - 1 ? 'n' : '')); }); t.appendChild(tr); });
    target.appendChild(t);
  }
  function bars(target, points, label) {
    target.textContent = '';
    if (!points.length) { target.appendChild(el('p', 'Aucune donnée sur la période.', 'muted')); return; }
    var ns = 'http://www.w3.org/2000/svg', max = Math.max.apply(null, points.map(function (p) { return p.count; })) || 1;
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + points.length * 10 + ' 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
    points.forEach(function (p, i) {
      var h = Math.max(1, (p.count / max) * 96), r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', i * 10 + 1); r.setAttribute('y', 100 - h); r.setAttribute('width', 8); r.setAttribute('height', h); r.setAttribute('fill', 'var(--accent)');
      var tip = document.createElementNS(ns, 'title'); tip.textContent = p.day + ' : ' + p.count; r.appendChild(tip); svg.appendChild(r);
    });
    target.appendChild(svg);
    target.appendChild(el('p', points[0].day + ' → ' + points[points.length - 1].day + ' (max ' + max + ')', 'muted'));
  }
  function render(s) {
    $('t-today').textContent = s.actives.today; $('t-week').textContent = s.actives.week; $('t-month').textContent = s.actives.month;
    bars($('c-active'), s.activeByDay, 'Actifs par jour');
    table($('c-actions'), ['Action', 'Détail', 'Utilisateurs', 'Fois'], s.actions.map(function (a) { return [a.name, a.detail, a.users, a.count]; }));
    table($('c-errors'), ['Erreur', 'Service', 'Fois'], s.errors.map(function (e) { return [e.name, e.detail, e.count]; }));
    bars($('c-errors-day'), s.errorsByDay, 'Erreurs par jour');
    table($('c-versions'), ['Version', 'Installations'], s.versions.map(function (v) { return [v.version, v.count]; }));
    table($('c-updates'), ['Jour', 'De', 'Vers', 'Installations'], s.updates.map(function (u) { return [u.day, u.from, u.to, u.count]; }));
  }
  function show(loggedIn) { $('login').style.display = loggedIn ? 'none' : 'block'; $('app').hidden = !loggedIn; }
  function load() {
    var q = '?days=' + $('days').value + '&platform=' + $('platform').value + '&channel=' + $('channel').value;
    $('status').textContent = 'Chargement…';
    fetch('/stats' + q, { headers: { 'x-stats': token } }).then(function (r) {
      if (r.status === 401) { token = ''; try { localStorage.removeItem(KEY); } catch (e) {} $('loginError').textContent = 'Jeton refusé.'; show(false); return null; }
      return r.json();
    }).then(function (body) {
      if (!body) return;
      if (!body.ok) { $('status').textContent = 'Service non configuré (' + body.reason + ').'; return; }
      show(true); render(body.stats); $('status').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR') + '.';
    }).catch(function () { $('status').textContent = 'Impossible de joindre le relais.'; });
  }
  $('login').addEventListener('submit', function (e) { e.preventDefault(); token = $('token').value.trim(); if (!token) return; try { localStorage.setItem(KEY, token); } catch (err) {} $('token').value = ''; $('loginError').textContent = ''; load(); });
  $('logout').addEventListener('click', function () { token = ''; try { localStorage.removeItem(KEY); } catch (e) {} show(false); });
  ['platform', 'channel', 'days'].forEach(function (id) { $(id).addEventListener('change', load); });
  if (token) load(); else show(false);
})();
</script>
</body>
</html>`;
```

Dans `relay/src/index.ts` :

```ts
import { DASHBOARD_HTML } from './dashboard';

// avant la route inconnue
if (url.pathname === '/dashboard') {
  return new Response(DASHBOARD_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/relay`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add relay tests/relay
git commit -m "feat(monitoring): tableau de bord /dashboard sur le relais"
```

---

### Task 5: Client — module de mesure

**Files:**
- Create: `src/core/telemetry/telemetry.ts`, `src/core/telemetry/registry.ts`, `src/core/telemetry/config.ts`
- Test: `tests/core/telemetry/telemetry.test.ts`

**Interfaces:**
- Consumes: `ActionName`, `ActionArgs`, `ErrorName`, `ErrorArgs`, `WireEvent`, `Platform`, `Channel`, `ACTIVE_NAME`, `UPDATE_NAME`, `MAX_EVENTS_PER_BATCH` (Task 1)
- Produces:
  - `createTelemetry(deps: TelemetryDeps): Telemetry` ; `Telemetry = ReturnType<typeof createTelemetry>` avec `enabled(): boolean`, `setEnabled(next: boolean): void`, `subscribe(l: () => void): () => void`, `track<N extends ActionName>(name: N, ...detail: ActionArgs<N>): void`, `reportError<N extends ErrorName>(name: N, ...detail: ErrorArgs<N>): void`, `start(scheduler: TelemetryScheduler): void`, `flush(): void`
  - `TelemetryDeps = { storage: Pick<Storage, 'getItem' | 'setItem'>; send(body: string): void; now(): number; newId(): string; platform: Platform; channel: Channel; version: string; defaultEnabled: boolean }`
  - `TelemetryScheduler = { every(run: () => void, ms: number): void; onHide(run: () => void): void }`
  - `registry.ts` : `setTelemetry(t: Telemetry | null)`, `track`, `reportError` (même signatures génériques, sans effet tant qu'aucun module n'est posé)
  - `config.ts` : `TELEMETRY_ENDPOINT`, `USAGE_STATS_DEFAULT = true`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/telemetry/telemetry.test.ts
import { describe, expect, it } from 'vitest';
import { createTelemetry, type TelemetryDeps, type TelemetryScheduler } from '../../../src/core/telemetry/telemetry';

const ID = '123e4567-e89b-42d3-a456-426614174000';
type Sent = { platform: string; channel: string; version: string; events: { type: string; name: string; detail?: string; clientId?: string; fromVersion?: string }[] };

function setup(overrides: Partial<TelemetryDeps> = {}, saved: Record<string, string> = {}) {
  const data = new Map(Object.entries(saved));
  const sent: Sent[] = [];
  let clock = Date.UTC(2026, 9, 8, 10, 0, 0);
  const deps: TelemetryDeps = {
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    send: (body) => void sent.push(JSON.parse(body) as Sent),
    now: () => clock,
    newId: () => ID,
    platform: 'extension',
    channel: 'prod',
    version: '0.1.0+482',
    defaultEnabled: true,
    ...overrides,
  };
  const jobs: (() => void)[] = [];
  const hidden: (() => void)[] = [];
  const scheduler: TelemetryScheduler = { every: (run) => void jobs.push(run), onHide: (run) => void hidden.push(run) };
  return { telemetry: createTelemetry(deps), sent, data, jobs, hidden, scheduler, advanceDay: () => void (clock += 86400_000) };
}
const names = (sent: Sent[]) => sent.flatMap((b) => b.events.map((e) => e.name));

describe('track', () => {
  it('met en file puis envoie par lot avec l’identifiant d’installation', () => {
    const { telemetry, sent } = setup();
    telemetry.track('lecture-musique', 'spotify');
    telemetry.track('plein-ecran');
    expect(sent).toHaveLength(0);
    telemetry.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ platform: 'extension', channel: 'prod', version: '0.1.0+482' });
    expect(sent[0]!.events).toEqual([
      { type: 'action', name: 'lecture-musique', detail: 'spotify', clientId: ID },
      { type: 'action', name: 'plein-ecran', clientId: ID },
    ]);
  });
  it('envoie par lots de 50 au plus', () => {
    const { telemetry, sent } = setup();
    for (let i = 0; i < 120; i += 1) telemetry.track('plein-ecran');
    telemetry.flush();
    expect(sent.map((b) => b.events.length)).toEqual([50, 50, 20]);
  });
  it('réutilise l’identifiant mémorisé', () => {
    const { telemetry, sent } = setup({ newId: () => 'ne-doit-pas-servir' }, { 'wmt:clientId': ID });
    telemetry.track('plein-ecran');
    telemetry.flush();
    expect(sent[0]!.events[0]!.clientId).toBe(ID);
  });
});

describe('consentement', () => {
  it('désactivé : ni action ni active ni update, mais les erreurs partent sans identifiant', () => {
    const { telemetry, sent, scheduler } = setup({}, { 'wmt:usageStats': 'off', 'wmt:lastVersion': '0.1.0+400' });
    telemetry.start(scheduler);
    telemetry.track('plein-ecran');
    telemetry.reportError('api-429', 'spotify');
    telemetry.flush();
    expect(sent[0]!.events).toEqual([{ type: 'error', name: 'api-429', detail: 'spotify' }]);
  });
  it('couper la mesure vide les événements d’usage en attente mais garde les erreurs', () => {
    const { telemetry, sent } = setup();
    telemetry.track('plein-ecran');
    telemetry.reportError('js-erreur');
    telemetry.setEnabled(false);
    telemetry.flush();
    expect(names(sent)).toEqual(['js-erreur']);
  });
  it('le défaut vient de defaultEnabled, le choix de l’utilisateur le remplace', () => {
    expect(setup({ defaultEnabled: false }).telemetry.enabled()).toBe(false);
    const { telemetry, data } = setup({ defaultEnabled: false });
    telemetry.setEnabled(true);
    expect(data.get('wmt:usageStats')).toBe('on');
    expect(setup({ defaultEnabled: true }, { 'wmt:usageStats': 'off' }).telemetry.enabled()).toBe(false);
  });
  it('prévient les abonnés quand le réglage change', () => {
    const { telemetry } = setup();
    let calls = 0;
    telemetry.subscribe(() => (calls += 1));
    telemetry.setEnabled(false);
    telemetry.setEnabled(false);
    expect(calls).toBe(1);
  });
});

describe('start', () => {
  it('envoie un seul « jour-actif » par jour', () => {
    const { telemetry, sent, scheduler, advanceDay } = setup();
    telemetry.start(scheduler);
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).toEqual(['jour-actif']);
    advanceDay();
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).toEqual(['jour-actif', 'jour-actif']);
  });
  it('mise à jour : version génératrice → version ciblée, une fois', () => {
    const { telemetry, sent, scheduler, data } = setup({}, { 'wmt:lastVersion': '0.1.0+400' });
    telemetry.start(scheduler);
    telemetry.flush();
    const update = sent[0]!.events.find((e) => e.type === 'update')!;
    expect(update).toEqual({ type: 'update', name: 'maj-appliquee', clientId: ID, fromVersion: '0.1.0+400' });
    expect(sent[0]!.version).toBe('0.1.0+482');
    expect(data.get('wmt:lastVersion')).toBe('0.1.0+482');
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent).filter((n) => n === 'maj-appliquee')).toHaveLength(1);
  });
  it('premier lancement : pas de mise à jour', () => {
    const { telemetry, sent, scheduler } = setup();
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).toEqual(['jour-actif']);
  });
  it('mesure coupée : la version est tout de même mémorisée (pas de fausse mise à jour à la réactivation)', () => {
    const { telemetry, sent, scheduler, data } = setup({}, { 'wmt:usageStats': 'off', 'wmt:lastVersion': '0.1.0+400' });
    telemetry.start(scheduler);
    expect(data.get('wmt:lastVersion')).toBe('0.1.0+482');
    telemetry.setEnabled(true);
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).not.toContain('maj-appliquee');
  });
  it('planifie l’envoi périodique et à la fermeture', () => {
    const { telemetry, sent, scheduler, jobs, hidden } = setup();
    telemetry.start(scheduler);
    telemetry.track('plein-ecran');
    jobs[0]!();
    expect(names(sent)).toContain('plein-ecran');
    telemetry.track('plein-ecran');
    hidden[0]!();
    expect(names(sent).filter((n) => n === 'plein-ecran')).toHaveLength(2);
  });
});

describe('robustesse', () => {
  it('un stockage qui échoue ne casse rien', () => {
    const { telemetry } = setup({ storage: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } } });
    expect(() => { telemetry.track('plein-ecran'); telemetry.setEnabled(false); telemetry.flush(); }).not.toThrow();
  });
  it('plafonne les erreurs d’une session', () => {
    const { telemetry, sent } = setup();
    for (let i = 0; i < 100; i += 1) telemetry.reportError('js-erreur');
    telemetry.flush();
    expect(sent.flatMap((b) => b.events)).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/telemetry/telemetry.test.ts`
Expected: FAIL (`Cannot find module '.../telemetry'`)

- [ ] **Step 3: Write the implementation**

```ts
// src/core/telemetry/config.ts
import { RELAY_BASE } from '../documentary/config';

export const TELEMETRY_ENDPOINT = `${RELAY_BASE}/t`;
// Usage (actifs, actions, mises à jour) : activé par défaut, désactivable dans Paramètre d'extension.
// À passer à `false` (opt-in) au passage en diffusion publique. Les erreurs techniques anonymes ne dépendent pas de ce réglage.
export const USAGE_STATS_DEFAULT = true;
```

```ts
// src/core/telemetry/telemetry.ts
import { ACTIVE_NAME, MAX_EVENTS_PER_BATCH, UPDATE_NAME, type ActionArgs, type ActionName, type Channel, type ErrorArgs, type ErrorName, type Platform, type WireEvent } from './catalogue';

const KEY_ENABLED = 'wmt:usageStats';
const KEY_CLIENT = 'wmt:clientId';
const KEY_VERSION = 'wmt:lastVersion';
const KEY_ACTIVE = 'wmt:lastActiveDay';
const CLIENT_ID = /^[0-9a-f-]{36}$/;
export const FLUSH_MS = 60_000;
export const MAX_ERRORS_PER_SESSION = 30;
const MAX_QUEUE = 200;

export type TelemetryDeps = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  send(body: string): void;
  now(): number;
  newId(): string;
  platform: Platform;
  channel: Channel;
  version: string;
  defaultEnabled: boolean;
};
export type TelemetryScheduler = { every(run: () => void, ms: number): void; onHide(run: () => void): void };

// Mesure d'usage anonyme : l'identifiant d'installation est aléatoire et sans lien avec un compte ; les erreurs n'en portent pas.
// Aucune méthode ne lève d'exception et un envoi qui échoue est simplement abandonné.
export function createTelemetry(deps: TelemetryDeps) {
  const read = (key: string): string | null => {
    try {
      return deps.storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      deps.storage.setItem(key, value);
    } catch {
      // stockage indisponible
    }
  };
  let enabled = ((): boolean => {
    const saved = read(KEY_ENABLED);
    return saved === null ? deps.defaultEnabled : saved === 'on';
  })();
  let queue: WireEvent[] = [];
  let errors = 0;
  let memoryId: string | null = null;
  const listeners = new Set<() => void>();

  const clientId = (): string => {
    const known = read(KEY_CLIENT);
    if (known !== null && CLIENT_ID.test(known)) return known;
    memoryId ??= deps.newId();
    write(KEY_CLIENT, memoryId);
    return memoryId;
  };
  const push = (event: WireEvent): void => {
    if (queue.length < MAX_QUEUE) queue.push(event);
  };
  const today = (): string => new Date(deps.now()).toISOString().slice(0, 10);

  const flush = (): void => {
    if (queue.length === 0) return;
    const pending = queue;
    queue = [];
    for (let from = 0; from < pending.length; from += MAX_EVENTS_PER_BATCH) {
      try {
        deps.send(JSON.stringify({ platform: deps.platform, channel: deps.channel, version: deps.version, events: pending.slice(from, from + MAX_EVENTS_PER_BATCH) }));
      } catch {
        // envoi impossible : lot abandonné
      }
    }
  };

  return {
    enabled: (): boolean => enabled,
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      write(KEY_ENABLED, next ? 'on' : 'off');
      if (!next) queue = queue.filter((event) => event.type === 'error');
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // Une action RÉALISÉE (lecture démarrée, lien ouvert, changement confirmé) — jamais l'affichage d'un module.
    track<N extends ActionName>(name: N, ...detail: ActionArgs<N>): void {
      if (!enabled) return;
      const value = (detail as string[])[0];
      push({ type: 'action', name, ...(value !== undefined ? { detail: value } : {}), clientId: clientId() });
    },
    reportError<N extends ErrorName>(name: N, ...detail: ErrorArgs<N>): void {
      if (errors >= MAX_ERRORS_PER_SESSION) return;
      errors += 1;
      const value = (detail as string[])[0];
      push({ type: 'error', name, ...(value !== undefined ? { detail: value } : {}) });
    },
    // Au démarrage : mise à jour détectée (version mémorisée ≠ version courante), « jour-actif » du jour, envois périodiques.
    start(scheduler: TelemetryScheduler): void {
      const last = read(KEY_VERSION);
      if (enabled && last !== null && last !== deps.version) push({ type: 'update', name: UPDATE_NAME, fromVersion: last, clientId: clientId() });
      write(KEY_VERSION, deps.version);
      if (enabled && read(KEY_ACTIVE) !== today()) {
        push({ type: 'active', name: ACTIVE_NAME, clientId: clientId() });
        write(KEY_ACTIVE, today());
      }
      scheduler.every(flush, FLUSH_MS);
      scheduler.onHide(flush);
    },
    flush,
  };
}

export type Telemetry = ReturnType<typeof createTelemetry>;
```

```ts
// src/core/telemetry/registry.ts
import type { ActionArgs, ActionName, ErrorArgs, ErrorName } from './catalogue';
import type { Telemetry } from './telemetry';

// Le module est posé une fois au démarrage ; avant cela (et dans les tests) `track` et `reportError` ne font rien.
let current: Telemetry | null = null;

export const setTelemetry = (telemetry: Telemetry | null): void => {
  current = telemetry;
};
export const getTelemetry = (): Telemetry | null => current;
export function track<N extends ActionName>(name: N, ...detail: ActionArgs<N>): void {
  current?.track(name, ...detail);
}
export function reportError<N extends ErrorName>(name: N, ...detail: ErrorArgs<N>): void {
  current?.reportError(name, ...detail);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/telemetry && npm run typecheck`
Expected: PASS ; typecheck sans erreur (le typage empêche `track('plein-ecran', 'x')` et `track('lecture-musique')`).

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry tests/core/telemetry
git commit -m "feat(monitoring): module client de mesure (file, lots, consentement, mises à jour)"
```

---

### Task 6: Client — build id, environnement, observation des erreurs d'API, câblage

**Files:**
- Modify: `scripts/build-info.mjs`, `wxt.config.ts`, `vite.android.config.ts`, `vitest.config.ts`, `src/env.d.ts`, `src/app/overlay.ts`
- Create: `src/core/telemetry/environment.ts`, `src/core/telemetry/fetch-observer.ts`
- Test: `tests/scripts/build-info.test.ts` (compléter le fichier existant s'il y en a un, sinon le créer), `tests/core/telemetry/environment.test.ts`, `tests/core/telemetry/fetch-observer.test.ts`

**Interfaces:**
- Consumes: `createTelemetry`, `setTelemetry`, `USAGE_STATS_DEFAULT`, `TELEMETRY_ENDPOINT` (Task 5) ; `Service`, `SERVICES` (Task 1)
- Produces:
  - `buildId(cwd: string): string` (`"<version package.json>+<nombre de commits>"`, `"<version>+0"` sans git) et constante globale `__WMT_BUILD__: string`
  - `telemetryEnvironment(win: { WmtSpotify?: { scheme?(): string } }): { platform: Platform; channel: Channel }`
  - `serviceOf(url: string): Service | null` ; `observeFetch(base: typeof fetch, report: (name: 'api-429' | 'api-5xx' | 'api-reseau', service: Service) => void): typeof fetch`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/telemetry/environment.test.ts
import { describe, expect, it } from 'vitest';
import { telemetryEnvironment } from '../../../src/core/telemetry/environment';

describe('telemetryEnvironment', () => {
  it('extension : pas de pont Android', () => {
    expect(telemetryEnvironment({})).toEqual({ platform: 'extension', channel: 'prod' });
  });
  it('Android production et pré-production, selon le schéma de retour', () => {
    expect(telemetryEnvironment({ WmtSpotify: { scheme: () => 'wikimasterstools' } })).toEqual({ platform: 'android', channel: 'prod' });
    expect(telemetryEnvironment({ WmtSpotify: { scheme: () => 'wikimasterstools-preprod' } })).toEqual({ platform: 'android', channel: 'preprod' });
    expect(telemetryEnvironment({ WmtSpotify: {} })).toEqual({ platform: 'android', channel: 'prod' });
  });
});
```

```ts
// tests/core/telemetry/fetch-observer.test.ts
import { describe, expect, it, vi } from 'vitest';
import { observeFetch, serviceOf } from '../../../src/core/telemetry/fetch-observer';

describe('serviceOf', () => {
  it('reconnaît les services de la liste, rien d’autre', () => {
    expect(serviceOf('https://fr.wikipedia.org/w/api.php?x=1')).toBe('wikipedia');
    expect(serviceOf('https://api.spotify.com/v1/me')).toBe('spotify');
    expect(serviceOf('https://openapi.tidal.com/v2/x')).toBe('tidal');
    expect(serviceOf('https://wikimasters-tools.maxime-protais-baumer.workers.dev/search?q=1')).toBe('relais');
    expect(serviceOf('https://www.wiki-masters.com/api/cards')).toBeNull();
    expect(serviceOf('pas une url')).toBeNull();
  });
  it('n’observe jamais l’envoi des statistiques lui-même', () => {
    expect(serviceOf('https://wikimasters-tools.maxime-protais-baumer.workers.dev/t')).toBeNull();
  });
});

describe('observeFetch', () => {
  const run = async (base: typeof fetch, url: string) => {
    const report = vi.fn();
    const wrapped = observeFetch(base, report);
    const outcome = await wrapped(url).then((r) => r, (e: unknown) => e);
    return { report, outcome };
  };
  it('signale 429 et 5xx avec le service, et rend la réponse intacte', async () => {
    const r429 = new Response('', { status: 429 });
    const a = await run(async () => r429, 'https://fr.wikipedia.org/x');
    expect(a.report).toHaveBeenCalledWith('api-429', 'wikipedia');
    expect(a.outcome).toBe(r429);
    const b = await run(async () => new Response('', { status: 503 }), 'https://api.themoviedb.org/3/x');
    expect(b.report).toHaveBeenCalledWith('api-5xx', 'tmdb');
  });
  it('signale une panne réseau et relance l’erreur ; ignore une requête annulée', async () => {
    const down = await run(async () => { throw new TypeError('Failed to fetch'); }, 'https://api.igdb.com/v4/games');
    expect(down.report).toHaveBeenCalledWith('api-reseau', 'igdb');
    expect(down.outcome).toBeInstanceOf(TypeError);
    const aborted = await run(async () => { throw new DOMException('x', 'AbortError'); }, 'https://api.igdb.com/v4/games');
    expect(aborted.report).not.toHaveBeenCalled();
  });
  it('laisse passer sans rien signaler les autres adresses et les réponses 200/404', async () => {
    expect((await run(async () => new Response('', { status: 500 }), 'https://www.wiki-masters.com/api')).report).not.toHaveBeenCalled();
    expect((await run(async () => new Response('', { status: 404 }), 'https://fr.wikipedia.org/x')).report).not.toHaveBeenCalled();
    expect((await run(async () => new Response('ok'), 'https://fr.wikipedia.org/x')).report).not.toHaveBeenCalled();
  });
});
```

Compléter `tests/scripts/` (créer `tests/scripts/build-id.test.ts`) :

```ts
// tests/scripts/build-id.test.ts
import { describe, expect, it } from 'vitest';
import { buildId } from '../../scripts/build-info.mjs';

describe('buildId', () => {
  it('version du paquet + nombre de commits (même nombre que le versionCode Android)', () => {
    expect(buildId(process.cwd())).toMatch(/^\d+\.\d+\.\d+\+\d+$/);
  });
  it('dossier sans package.json ni git : retombe sur 0.0.0+0 sans lever d’exception', () => {
    expect(buildId('/dossier/inexistant')).toBe('0.0.0+0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/telemetry tests/scripts/build-id.test.ts`
Expected: FAIL (modules et `buildId` introuvables)

- [ ] **Step 3: Write the implementation**

`scripts/build-info.mjs` — ajouter :

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Identifiant de build injecté dans le bundle : « version du paquet + nombre de commits » (le nombre de commits est aussi le versionCode Android).
// La version du paquet ne change pas, le nombre de commits distingue donc deux livraisons ; « +0 » si git est indisponible (archive de sources).
export function buildId(cwd) {
  let version = '0.0.0';
  try {
    version = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version ?? version;
  } catch {
    // package.json illisible : on garde 0.0.0
  }
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd, encoding: 'utf8' });
  const commits = result.status === 0 ? Number.parseInt(result.stdout, 10) : 0;
  return `${version}+${Number.isInteger(commits) ? commits : 0}`;
}
```

`wxt.config.ts` : `import { buildId, recentFixes } from './scripts/build-info.mjs';` et `define: { __WMT_FIXES__: …, __WMT_BUILD__: JSON.stringify(buildId(process.cwd())) }`.
`vite.android.config.ts` : même ajout dans `define`.
`vitest.config.ts` : `define: { __WMT_FIXES__: '[]', __WMT_BUILD__: '"0.0.0+0"' }`.
`src/env.d.ts` : `declare const __WMT_BUILD__: string;`.

```ts
// src/core/telemetry/environment.ts
import type { Channel, Platform } from './catalogue';

type BridgeWindow = { WmtSpotify?: { scheme?(): string } };

// L'application Android expose le pont `WmtSpotify` ; son schéma de retour distingue la pré-production. L'extension n'a pas de canal de pré-production.
export function telemetryEnvironment(win: BridgeWindow): { platform: Platform; channel: Channel } {
  const bridge = win.WmtSpotify;
  if (!bridge) return { platform: 'extension', channel: 'prod' };
  return { platform: 'android', channel: bridge.scheme?.()?.includes('preprod') ? 'preprod' : 'prod' };
}
```

```ts
// src/core/telemetry/fetch-observer.ts
import type { Service } from './catalogue';
import { RELAY_BASE } from '../documentary/config';

const HOSTS: Record<string, Service> = {
  'www.wikidata.org': 'wikidata',
  'commons.wikimedia.org': 'commons',
  'query.wikidata.org': 'wikidata',
  'api.spotify.com': 'spotify',
  'accounts.spotify.com': 'spotify',
  'openapi.tidal.com': 'tidal',
  'api.themoviedb.org': 'tmdb',
  'store.steampowered.com': 'steam',
  'api.steampowered.com': 'steam',
  'api.igdb.com': 'igdb',
  'openlibrary.org': 'openlibrary',
  'www.googleapis.com': 'googlebooks',
  'api.github.com': 'github',
};
const RELAY_HOST = new URL(RELAY_BASE).host;

// Service concerné par une adresse (liste fermée) ; null pour tout le reste, y compris le site du jeu et l'envoi des statistiques.
export function serviceOf(url: string): Service | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.host === RELAY_HOST) return parsed.pathname === '/t' ? null : 'relais';
  if (parsed.host.endsWith('.wikipedia.org')) return 'wikipedia';
  return HOSTS[parsed.host] ?? null;
}

type Report = (name: 'api-429' | 'api-5xx' | 'api-reseau', service: Service) => void;

// Enveloppe transparente de `fetch` : la réponse (ou l'erreur) est rendue telle quelle, on note seulement 429, 5xx et pannes réseau.
export function observeFetch(base: typeof fetch, report: Report): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const service = serviceOf(url);
    if (!service) return base(input, init);
    try {
      const response = await base(input, init);
      if (response.status === 429) report('api-429', service);
      else if (response.status >= 500) report('api-5xx', service);
      return response;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) report('api-reseau', service);
      throw error;
    }
  };
}
```

`src/app/overlay.ts` — lire d'abord les lignes 127-150 (début de `startOverlay`), puis insérer **en première instruction** du corps de `startOverlay` :

```ts
  // Mesure d'usage anonyme (voir docs/superpowers/specs/2026-10-08-monitoring-usage-design.md).
  const rawFetch = window.fetch.bind(window);
  const { platform, channel } = telemetryEnvironment(window as unknown as { WmtSpotify?: { scheme?(): string } });
  const telemetry = createTelemetry({
    storage: window.localStorage,
    send: (body) => void rawFetch(TELEMETRY_ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true }).catch(() => undefined),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    platform,
    channel,
    version: __WMT_BUILD__,
    defaultEnabled: USAGE_STATS_DEFAULT,
  });
  setTelemetry(telemetry);
  window.fetch = observeFetch(rawFetch, (name, service) => telemetry.reportError(name, service));
  window.addEventListener('error', () => telemetry.reportError('js-erreur'));
  window.addEventListener('unhandledrejection', () => telemetry.reportError('js-erreur'));
  telemetry.start({
    every: (run, ms) => void window.setInterval(run, ms),
    onHide: (run) => {
      window.addEventListener('pagehide', run);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && run());
    },
  });
```

avec les imports en tête de fichier :

```ts
import { createTelemetry } from '../core/telemetry/telemetry';
import { setTelemetry } from '../core/telemetry/registry';
import { telemetryEnvironment } from '../core/telemetry/environment';
import { observeFetch } from '../core/telemetry/fetch-observer';
import { TELEMETRY_ENDPOINT, USAGE_STATS_DEFAULT } from '../core/telemetry/config';
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/core/telemetry tests/scripts && npm run typecheck`
Expected: PASS ; typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add scripts wxt.config.ts vite.android.config.ts vitest.config.ts src tests
git commit -m "feat(monitoring): identifiant de build, plateforme/canal, observation des erreurs d'API et câblage au démarrage"
```

---

### Task 7: Client — réglage « Statistiques d'usage anonymes »

**Files:**
- Create: `src/content/TelemetrySettings.tsx`
- Modify: `src/content/ExtensionSettings.tsx`, `src/content/mount.tsx:269-270`, `src/app/overlay.ts` (appel `openExtensionSettings`, ~ligne 432)
- Test: `tests/content/telemetry-settings.test.tsx`, adapter `tests/content/extension-menu.test.tsx` (nouvelle prop)

**Interfaces:**
- Consumes: `Telemetry` (Task 5)
- Produces: `TelemetrySettings({ telemetry, onClose })` ; `ExtensionSettings` reçoit la prop `telemetry: Telemetry` ; `openExtensionSettings(images, player, ads, telemetry)`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/telemetry-settings.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TelemetrySettings } from '../../src/content/TelemetrySettings';
import { createTelemetry } from '../../src/core/telemetry/telemetry';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const make = () => {
  const data = new Map<string, string>();
  return createTelemetry({
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    send: () => undefined, now: () => 0, newId: () => '123e4567-e89b-42d3-a456-426614174000',
    platform: 'extension', channel: 'prod', version: '0.1.0+1', defaultEnabled: true,
  });
};
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; });

describe('TelemetrySettings', () => {
  it('montre l’état, explique ce qui est envoyé et bascule le réglage', () => {
    const telemetry = make();
    const host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    act(() => root!.render(<TelemetrySettings telemetry={telemetry} onClose={() => undefined} />));
    const explain = host.querySelector('[data-wmt-stats-explain]')!.textContent!;
    expect(explain).toContain('anonymes');
    expect(explain).toContain('erreurs');
    const [on, off] = [...host.querySelectorAll<HTMLButtonElement>('[data-wmt-stats-choice] button')];
    expect(on!.getAttribute('aria-pressed')).toBe('true');
    act(() => off!.click());
    expect(telemetry.enabled()).toBe(false);
    expect(off!.getAttribute('aria-pressed')).toBe('true');
    act(() => on!.click());
    expect(telemetry.enabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/telemetry-settings.test.tsx`
Expected: FAIL (module introuvable)

- [ ] **Step 3: Write the implementation**

```tsx
// src/content/TelemetrySettings.tsx
import { useSyncExternalStore } from 'react';
import type { Telemetry } from '../core/telemetry/telemetry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const choice = (selected: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: selected ? '#0d1117' : 'inherit',
    background: selected ? 'var(--color-accent, #34d399)' : 'none',
    border: selected ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

// « Statistiques d'usage anonymes » : activer ou couper la mesure d'usage. Les erreurs techniques anonymes restent envoyées.
export function TelemetrySettings({ telemetry, onClose }: { telemetry: Telemetry; onClose: () => void }) {
  const enabled = useSyncExternalStore(telemetry.subscribe, telemetry.enabled);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Statistiques d’usage anonymes"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Statistiques d’usage anonymes</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p data-wmt-stats-explain="" style={{ margin: '0 0 12px', opacity: 0.8 }}>
          Activé : l’application envoie des informations anonymes pour savoir combien de personnes l’utilisent, quelles actions elles font (par exemple « lecture d’un morceau », « bande-annonce lue ») et quand une mise à jour est installée. Un identifiant aléatoire propre à cet appareil sert à compter les utilisateurs ; il n’est lié à aucun compte. Jamais envoyés : titres de cartes, pseudo, adresse, contenu des pages, recherches. Désactivé : plus rien de cela n’est envoyé. Dans les deux cas, les erreurs techniques (par exemple « limite de Wikipédia atteinte ») sont comptées sans aucun identifiant.
        </p>
        <div role="group" data-wmt-stats-choice="" aria-label="Statistiques d’usage anonymes" style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-pressed={enabled} onClick={() => telemetry.setEnabled(true)} style={choice(enabled)}>
            Activé
          </button>
          <button type="button" aria-pressed={!enabled} onClick={() => telemetry.setEnabled(false)} style={choice(!enabled)}>
            Désactivé
          </button>
        </div>
      </div>
    </div>
  );
}
```

`ExtensionSettings.tsx` : importer `TelemetrySettings` et `type Telemetry`, ajouter `telemetry` aux props, élargir `view` à `'list' | 'images' | 'player' | 'ads' | 'stats'`, ajouter

```tsx
  if (view === 'stats') return <TelemetrySettings telemetry={telemetry} onClose={() => setView('list')} />;
```

et, après la ligne « Publicité d’achat » :

```tsx
        <button type="button" data-wmt-ext-row="stats" onClick={() => setView('stats')} style={row}>
          <span aria-hidden="true">📊</span>
          <span>Statistiques d’usage</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
        </button>
```

`mount.tsx:269` :

```tsx
export const openExtensionSettings = (images: ImageService, player: PlayerSource | null, ads: PurchaseAds, telemetry: Telemetry): void =>
  openSettingsWindow(EXTENSION_SETTINGS_HOST_ATTRIBUTE, (close) => <ExtensionSettings images={images} player={player} ads={ads} telemetry={telemetry} onClose={close} />);
```
(+ `import type { Telemetry } from '../core/telemetry/telemetry';`)

`overlay.ts` (~432) : `openExtensionSettings(images, getPlayerSource() ?? null, purchaseAds, telemetry)`.

`tests/content/extension-menu.test.tsx` : partout où `<ExtensionSettings … />` est rendu, ajouter `telemetry={…}` (un `createTelemetry` de test comme ci-dessus) ; lancer `npx vitest run tests/content/extension-menu.test.tsx` pour repérer les endroits.

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/content && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(monitoring): réglage « Statistiques d'usage anonymes » dans Paramètre d'extension"
```

---

### Task 8: Instrumentation des actions

**Règle :** `track(…)` se place là où l'action **aboutit** (lecture démarrée, lien ouvert, choix confirmé), jamais dans un rendu ni à l'ouverture d'une section. Import à ajouter dans chaque fichier : `import { track } from '../core/telemetry/registry';` (ou `reportError`). Le typage (`npm run typecheck`) refuse tout nom ou détail hors de `catalogue.ts`.

**Files (modifier) :** voir les sous-tâches ci-dessous.
**Test :** `tests/core/telemetry/instrumentation.test.ts` (garde-fou sur la liste) + vérification manuelle.

**Interfaces:**
- Consumes: `track`, `reportError` (Task 5)

- [ ] **Step 1: Write the guard test**

Un test qui empêche de laisser un nom du catalogue sans point d'appel (l'inverse, un appel hors catalogue, est déjà refusé par le typage) :

```ts
// tests/core/telemetry/instrumentation.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../../../src/core/telemetry/catalogue';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });

describe('catalogue et points d’appel', () => {
  const source = files('src').filter((f) => !f.includes('telemetry')).map((f) => readFileSync(f, 'utf8')).join('\n');
  it.each(Object.keys(ACTIONS))('l’action « %s » a au moins un point d’appel', (name) => {
    expect(source).toContain(`track('${name}'`);
  });
});
```

- [ ] **Step 2: Run it to see what is missing**

Run: `npx vitest run tests/core/telemetry/instrumentation.test.ts`
Expected: FAIL pour chaque action sans point d'appel (liste de travail des étapes suivantes).

- [ ] **Step 3: Musique, BO, liaison de compte**

- `src/content/music-service.ts`, dans `play`, juste après `onPlayed(card);` : `track('lecture-musique', 'spotify');`
- Même méthode `link()` : après `await session.link();` ajouter `track('liaison-compte', 'spotify');`
- `src/content/tidal-service.ts` : repérer la méthode `play` (`grep -n "play(" src/content/tidal-service.ts`) et la méthode de liaison ; mêmes ajouts avec `'tidal'`, au succès uniquement.
- BO : `src/content/SoundtrackButton.tsx:80` remplacer `void service.play(first, listen).then(setMessage)` par
  `void service.play(first, listen).then((message) => { if (message === null) track('bo-lue'); setMessage(message); })` ; `src/content/SoundtrackDialog.tsx:80` : après `const failure = await service.play(...)`, `if (failure === null) track('bo-lue');`.
- Échec de lecture : dans le `catch` de `play` de `music-service.ts` et de `tidal-service.ts` : `reportError('lecture-echec', 'spotify')` / `'tidal'`.

- [ ] **Step 4: Film / série, jeu vidéo**

- `src/content/TrailerPlayer.tsx` : `onClick={() => setPlaying(true)}` → `onClick={() => { setPlaying(true); track('bande-annonce-lue'); }}`.
- `src/content/HlsTrailerPlayer.tsx` : lire le fichier ; l'événement part quand le lecteur démarre sur action de l'utilisateur (clic sur la miniature ou ▶ — chercher `setPlaying(true)` / le gestionnaire qui monte la balise `<video>` ligne 69) : `track('jeu-video-lu')` à cet endroit. Si la vidéo se monte sans clic (lecture automatique à l'ouverture), poser l'appel dans `onPlaying` de la balise `<video>` à la place (`onPlaying={() => track('jeu-video-lu')}`), une seule fois par montage.
- `src/content/WatchProviders.tsx:50` : ajouter `onClick={() => track('streaming-lien-ouvert')}` au lien JustWatch.
- Changement confirmé : `grep -rn "choose\|pick\|select" src/content/GameChoiceDialog.tsx src/content/BookChoiceDialog.tsx src/content/ScreenSection.tsx` pour trouver la fonction appelée à la confirmation (le service `…-service.ts` expose le choix ; le point d'appel est l'appel du service qui enregistre le choix, pas l'ouverture du dialogue) : `track('jeu-change')` (jeu), `track('film-change')` (film/série, `ScreenSection.tsx` ou son dialogue), `track('livre-change')` (livre).

- [ ] **Step 5: Livre, documentaire**

- `src/content/BookSection.tsx` : lien principal (≈ ligne 140) `onClick={() => track('livre-lecture-ouverte', main.source)}` ; liens secondaires (≈ ligne 149) `onClick={() => track('livre-lecture-ouverte', other.source)}`. Si `source` n'est pas exactement `wikisource` / `gutenberg` / `internet-archive`, le typage le signale : corriger en convertissant avec une table (`{ wikisource: 'wikisource', gutenberg: 'gutenberg', archive: 'internet-archive' }`) lue dans `core/book/` (`grep -n "source:" src/core/book/*.ts`).
- `ShopRow` (≈ ligne 60) : `onClick={() => track('livre-achat-ouvert', shop.kind === 'ebook' ? 'ebook' : 'papier')}`.
- `src/content/DocumentaryPlayer.tsx` : `onClick={() => setPlaying(true)}` → `onClick={() => { setPlaying(true); track('documentaire-lu'); }}`.
- `src/content/DocumentarySection.tsx` : au choix d'un autre documentaire confirmé (≈ lignes 150-175, la fonction appelée au clic sur un candidat) `track('documentaire-change')` ; `src/content/DocumentaryProposeDialog.tsx` : après l'envoi réussi (`grep -n "propose" src/content/documentary-service.ts` : le service rend un résultat `sent` / `ok`) `track('documentaire-propose')`.

- [ ] **Step 6: Cartes liées, Toile, échange, plein écran, anomalie, WikiHow, visite, réglages**

- Cartes liées : `src/content/open-linked-card.ts` (ou le gestionnaire de clic de `LinkedCards.tsx`) → `track('carte-liee-ouverte')` quand la carte s'ouvre.
- Toile : `grep -rn "toile\|Toile\|buildWeb\|createWeb" src/content/mount.tsx src/content/WebPanel.tsx src/content/WebCanvas.tsx | head` ; l'appel va là où la toile est **construite** après le choix de l'utilisateur (lancement depuis la barre ou depuis la sélection de 2 cartes), pas à l'ouverture du panneau : `track('toile-generee')`.
- Échange : `grep -rn "poignée\|handshake\|echange\|exchange" src/content/*.ts* | head` ; le gestionnaire du bouton poignée de main, une fois les cartes posées dans l'offre : `track('echange-prepare')`.
- Plein écran : `src/content/fullscreen.tsx`, dans `toggle`, au passage à l'état actif : `track('plein-ecran')` (pas à la sortie).
- Anomalie : `src/content/AnomalyDialog.tsx`, après un envoi qui réussit (`ok === true`) : `track('anomalie-signalee')`.
- WikiHow : `src/content/WikiHowDialog.tsx`, quand l'utilisateur lance la visite d'une fiche ou la déplie (`grep -n "onClick" src/content/WikiHowDialog.tsx`) : `track('wikihow-fiche-lue')`.
- Visite : `src/content/tour-session.ts` (ou `tour-control.ts`), à la dernière étape franchie, pas à l'abandon : `track('visite-terminee')`.
- Réglages : `PurchaseAdsSettings.tsx` boutons : `onClick={() => { ads.setEnabled(true); track('reglage-modifie', 'publicite-achat'); }}` (idem `false`) ; `ImageSettings.tsx` et `PlayerSettings.tsx` : au changement de valeur (`grep -n "onClick\|onChange" …`) `track('reglage-modifie', 'images')` / `'lecteur'`.

- [ ] **Step 7: Run guard, typecheck and full tests**

Run: `npx vitest run tests/core/telemetry/instrumentation.test.ts && npm run typecheck && npm test`
Expected: PASS ; si un nom du catalogue n'a toujours pas de point d'appel parce que l'action n'existe pas dans l'application, le **retirer** du catalogue (et de la spécification) plutôt que d'ajouter un appel artificiel.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(monitoring): instrumentation des actions des modules (jamais l'affichage)"
```

---

### Task 9: Documentation, guide WikiHow, Quoi de neuf, déclarations

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle fiche), `docs/guides/cloudflare-relais.md`, `wxt.config.ts` (Firefox), `wrangler.toml` et `relay/wrangler.toml` (après fourniture de l'identifiant D1, voir étape 4), `relay/README.md`
- Test: `tests/core/whats-new/entries.test.ts` (existant : doit rester vert)

- [ ] **Step 1: Fiche WikiHow**

Ajouter à la fin du tableau d'`entries.ts`, sur le modèle de `publicite-achat-v5` (mêmes `openPlus(...)` et mêmes `scene`), une fiche :

```ts
  {
    id: 'statistiques-usage-v1',
    theme: 'app',
    glyph: '📊',
    title: 'Statistiques d’usage anonymes',
    summary: 'Savoir ce qui est mesuré, et le couper',
    steps: [
      openPlus('puis « Paramètre d’extension », où se trouve le réglage « Statistiques d’usage ».'),
      {
        target: '[data-wmt-ext-row="stats"]',
        title: 'Ouvrir « Statistiques d’usage »',
        text: 'Cette ligne ouvre le réglage qui décide si l’application envoie des informations anonymes sur son utilisation.',
        gesture: 'tap',
        details: [
          { label: 'À quoi ça sert', text: 'À savoir combien de personnes utilisent l’application, quelles fonctions servent vraiment et quand une panne survient, pour améliorer ce qui compte.' },
          { label: 'Comment faire', text: 'Touchez la ligne « Statistiques d’usage » dans Paramètre d’extension : la fenêtre du réglage s’affiche.' },
        ],
        scene: { closeWindows: true, reveal: [{ text: 'Plus' }, '[data-wmt-extension-setting]'] },
      },
      {
        target: '[data-wmt-stats-choice]',
        title: 'Choisir Activé ou Désactivé',
        text: 'Activé : des informations anonymes sont envoyées. Désactivé : plus aucune information d’usage n’est envoyée.',
        gesture: 'tap',
        details: [
          { label: 'Ce qui est envoyé', text: 'Le nom d’une action réalisée (par exemple « lecture d’un morceau »), un identifiant aléatoire propre à l’appareil, la version de l’application et la date. Les mises à jour installées sont comptées avec la version de départ et la version d’arrivée.' },
          { label: 'Ce qui n’est jamais envoyé', text: 'Titres de cartes, pseudo, adresse, contenu des pages, recherches, identifiants de vos comptes.' },
          { label: 'Limites', text: 'Les erreurs techniques (par exemple une limite de Wikipédia atteinte) sont comptées même si le réglage est désactivé, mais sans aucun identifiant. Les chiffres restent des estimations : réinstaller l’application crée un nouvel identifiant.' },
        ],
        scene: { reveal: [{ text: 'Plus' }, '[data-wmt-extension-setting]', '[data-wmt-ext-row="stats"]'] },
      },
      {
        target: '[data-wmt-stats-explain]',
        title: 'Lire le texte du réglage',
        text: 'Le texte de la fenêtre résume ce qui est envoyé et ce qui ne l’est jamais.',
        scene: { reveal: [{ text: 'Plus' }, '[data-wmt-extension-setting]', '[data-wmt-ext-row="stats"]'] },
      },
    ],
  },
```

Run: `npx vitest run tests/core/whats-new` — Expected: PASS (l'id est nouveau, donc annoncé dans « Quoi de neuf » ; adapter un test de comptage de fiches s'il en existe un, en lisant son message d'échec).

- [ ] **Step 2: Déclaration Firefox**

Dans `wxt.config.ts`, remplacer le commentaire et la valeur de `data_collection_permissions` :

```ts
          // Les erreurs techniques anonymes sont toujours envoyées (catégorie « technicalAndInteraction ») ; l'usage est désactivable dans l'application.
          data_collection_permissions: { required: ['technicalAndInteraction'] },
```

Run: `npx wxt build -b firefox --mv3` — Expected: build réussi ; ouvrir `.output/firefox-mv3/manifest.json` et vérifier que la clé est présente telle quelle. Si le validateur de WXT ou `web-ext lint` refuse la catégorie, remonter l'erreur à l'utilisateur (elle conditionne la publication sur addons.mozilla.org) au lieu de la contourner.

- [ ] **Step 3: Guide Cloudflare**

Ajouter à `docs/guides/cloudflare-relais.md` une « Partie E — Mesure d'usage (D1 et tableau de bord) » reprenant les commandes de la section « Actions de l'utilisateur » du message de fin de plan (création de la base, migration, secret, adresse du tableau de bord) et `relay/README.md` : une ligne sur les routes `/t`, `/stats`, `/dashboard`.

- [ ] **Step 4: Liaison D1 — après fourniture de l'identifiant par l'utilisateur**

**Ne pas faire avant que l'utilisateur ait créé la base** : un identifiant faux ferait échouer le déploiement automatique du relais (le service de documentaires tomberait). Une fois `database_id` reçu, ajouter dans `wrangler.toml` (racine) :

```toml
# Mesure d'usage anonyme (voir docs/superpowers/specs/2026-10-08-monitoring-usage-design.md).
[[d1_databases]]
binding = "USAGE_DB"
database_name = "wikimasters-usage"
database_id = "<IDENTIFIANT FOURNI PAR L'UTILISATEUR>"
migrations_dir = "relay/migrations"
```

et la même table dans `relay/wrangler.toml` avec `migrations_dir = "migrations"`. Le secret `STATS_TOKEN` se pose par `npx wrangler secret put STATS_TOKEN` (jamais dans le dépôt).

- [ ] **Step 5: Vérifications finales, PR**

Run: `npm run typecheck && npm test && npm run build`
Expected: tout vert. Puis PR vers `main` et fusion, `npm run preprod` (routine habituelle du dépôt, sans `npm run promouvoir`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(monitoring): fiche WikiHow, guide Cloudflare, déclaration Firefox, liaison D1"
```

---

## Auto-revue de la spécification

| Exigence de la spécification | Tâche |
|---|---|
| Routes `POST /t`, `GET /stats`, `GET /dashboard`, validation, 413/400/204 | 2, 3, 4 |
| Table `events` avec `from_version`, index | 2 |
| Purge à 90 jours dans le cron existant | 3 |
| Liste fermée partagée, type `update`, `error` sans identifiant | 1 |
| File, lots de 50, `sendBeacon`/`keepalive`, échec abandonné, plafond d'erreurs | 5 (envoi en `fetch` + `keepalive` : même effet que `sendBeacon`, compatible Android) |
| `clientId` aléatoire, `jour-actif` quotidien, détection de mise à jour (génératrice → ciblée) | 5 |
| Interrupteur, défaut `USAGE_STATS_DEFAULT`, erreurs hors consentement | 5, 7 |
| Plateforme / canal / version | 6 |
| Erreurs d'API (429, 5xx, réseau) et erreurs JavaScript | 6 |
| Actions de tous les modules, jamais l'affichage | 8 (garde-fou de test) |
| Tableau de bord : tuiles, courbes, actions, erreurs, versions, journal des mises à jour, filtres | 3, 4 |
| WikiHow, Quoi de neuf, guide Cloudflare | 9 |
| Politique de confidentialité avant diffusion publique | Hors de ce plan (limite connue de la spécification) |

Écarts assumés et signalés : l'envoi utilise `fetch` avec `keepalive` plutôt que `sendBeacon` (équivalent, un seul chemin de code) ; la déclaration Firefox `required: ['none']` devient `technicalAndInteraction` parce que les erreurs techniques sont toujours envoyées ; l'extension n'a pas de canal de pré-production, elle est toujours déclarée `prod`.
