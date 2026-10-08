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
