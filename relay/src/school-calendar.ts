import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BASE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
const CACHE_MS = 24 * 3_600_000;
const ZONES = ['A', 'B', 'C', 'Corse'] as const;
type Zone = (typeof ZONES)[number];

const cache = new Map<Zone, { at: number; body: string }>();

// Zone dans le jeu de données : « Zone A », « Zone B », « Zone C », « Corse ».
const zoneLabel = (zone: Zone): string => (zone === 'Corse' ? 'Corse' : `Zone ${zone}`);

const paris = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
// « 2026-10-16T22:00:00+00:00 » est le 17 octobre à Paris : la date doit être lue dans le fuseau de Paris.
const parisDate = (iso: string): string | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : paris.format(new Date(t));
};

export async function proxySchoolCalendar(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const zone = ZONES.find((z) => z === url.searchParams.get('zone'));
  if (!zone) return failure(400, 'bad-request');
  const hit = cache.get(zone);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  // Une ligne par académie dans le jeu : on regroupe côté source pour ne recevoir qu'une ligne par période et population.
  const since = new Date(deps.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    select: 'description,population,start_date,end_date',
    group_by: 'description,population,start_date,end_date',
    where: `zones="${zoneLabel(zone)}" and start_date>=date'${since}'`,
    order_by: 'start_date',
    limit: '100',
  });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let rows: unknown;
  try {
    rows = (JSON.parse(result.body) as { results?: unknown }).results;
  } catch {
    return failure(502, 'upstream');
  }
  if (!Array.isArray(rows)) return failure(502, 'upstream');
  const periods: { name: string; start: string; end: string }[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    // Seules les vacances des élèves comptent : ni les lignes des enseignants, ni « Début des vacances » (début = fin, hors description).
    if (typeof row.description !== 'string' || !/^(vacances|pont)/i.test(row.description)) continue;
    if (typeof row.population === 'string' && /enseignant/i.test(row.population)) continue;
    if (typeof row.start_date !== 'string' || typeof row.end_date !== 'string') continue;
    const start = parisDate(row.start_date);
    let end = parisDate(row.end_date);
    if (!start || !end || end < start) continue;
    // Un pont d'un seul instant (début = fin) dure un jour.
    if (end === start) end = parisDate(new Date(Date.parse(row.start_date) + 86_400_000).toISOString());
    if (!end) continue;
    periods.push({ name: row.description, start, end });
  }
  if (periods.length === 0) return failure(502, 'upstream');
  const body = JSON.stringify({ ok: true, zone, periods });
  cache.set(zone, { at: deps.now(), body });
  return { status: 200, body };
}
