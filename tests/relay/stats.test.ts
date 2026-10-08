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
  it('ignore les espaces et retours à la ligne autour du jeton enregistré', async () => {
    const db = sqliteD1();
    expect((await call({ 'x-stats': 'secret' }, { USAGE_DB: db, STATS_TOKEN: 'secret\n' })).status).toBe(200);
    expect((await call({ 'x-stats': 'secret' }, { USAGE_DB: db, STATS_TOKEN: ' secret ' })).status).toBe(200);
    expect((await call({ 'x-stats': 'secret' }, { USAGE_DB: db, STATS_TOKEN: '  \n' })).status).toBe(503);
    expect((await call({ 'x-stats': 'sec ret' }, { USAGE_DB: db, STATS_TOKEN: 'secret\n' })).status).toBe(401);
  });
  it('rend les agrégats avec le bon jeton et ignore les filtres inconnus', async () => {
    const response = await call({ 'x-stats': 'secret' }, { USAGE_DB: sqliteD1(), STATS_TOKEN: 'secret' }, '?days=7&platform=ios&channel=prod');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, stats: { days: 7, actives: { today: 0, week: 0, month: 0 } } });
  });
});
