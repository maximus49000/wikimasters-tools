import { overpass } from './overpass';
import { failure, type Fetcher, type ProxyResult } from './proxy';

// Lignes de bus réelles autour de l'utilisateur (OpenStreetMap, par Overpass : overpass.ts), pour les girouettes des bus de la
// scène Ville (spec véhicules §5). Position reçue dans le corps d'un POST (jamais dans une URL), arrondie à 0,1° et gardée
// seulement comme clé du cache en mémoire.
// Mesuré le 2026-10-11 (plan V4) : les relations d'un cadre de ±3 km coûtaient 8 à 17 s et jusqu'à 10 Mo (Paris) ; on part
// donc des arrêts (`public_transport=platform`) d'un cadre de ±2 km et des relations qui les desservent (1 à 3 s, 0,3 à 1,7 Mo),
// sorties plafonnées à 24. Les lignes qui desservent le plus d'arrêts du cadre passent devant.
// Réponse réduite : 8 lignes au plus (numéro, départ, terminus, couleur, noms des arrêts dans l'ordre), et le nom d'un
// établissement scolaire du cadre (car scolaire), ou null.
const RADIUS_M = 2_000;
export const BUS_LINES_MAX = 8;
export const BUS_STOPS_MAX = 30;
export const BUS_NAME_LENGTH = 24;
const RELATIONS_MAX = 24;
const CACHE_MS = 30 * 86_400_000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; body: string }>();
const rounded = (v: number): number => Math.round(v * 10) / 10 + 0;

export type BusLineOut = { ref: string; from: string; to: string; colour: string | null; stops: string[] };
type Tags = Record<string, string>;
type Member = { type?: string; ref?: number; role?: string };
type Element = { type?: string; id?: number; tags?: Tags; members?: Member[] };

const query = (lat: number, lon: number): string => {
  const dLat = RADIUS_M / 111_000;
  const dLon = RADIUS_M / (111_000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(3)).join(',');
  return (
    `[out:json][timeout:25];nwr["public_transport"="platform"](${bbox})->.p;(rel(bn.p);rel(bw.p);)->.c;` +
    `rel.c["type"="route"]["route"~"^(bus|trolleybus)$"]->.r;.r out body ${RELATIONS_MAX};.p out ids;` +
    `(node(r.r:"platform");way(r.r:"platform");node(r.r:"platform_entry_only");node(r.r:"platform_exit_only"););out tags;` +
    `nwr["amenity"="school"]["name"](${bbox});out tags 30;`
  );
};

const clean = (s: string | undefined): string | null => {
  const v = s?.replace(/\s+/g, ' ').trim();
  return v && v.length <= BUS_NAME_LENGTH ? v : null;
};
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const natural = (a: string, b: string): number => a.localeCompare(b, 'fr', { numeric: true });

// Éléments Overpass → lignes réduites et établissement scolaire.
export function reduceBusLines(elements: readonly unknown[]): { lines: BusLineOut[]; school: string | null } {
  const names = new Map<string, string>();
  const near = new Set<string>();
  const relations: Element[] = [];
  let school: string | null = null;
  for (const raw of elements) {
    const el = raw as Element;
    const key = `${el.type}/${el.id}`;
    if (el.type === 'relation') relations.push(el);
    else if (!el.tags) near.add(key);
    else if (el.tags.amenity === 'school') school ??= clean(el.tags.name);
    else {
      const name = clean(el.tags.name);
      if (name) names.set(key, name);
    }
  }
  const best = new Map<string, { line: BusLineOut; score: number; size: number }>();
  for (const rel of relations) {
    const tags = rel.tags ?? {};
    const ref = clean(tags.ref);
    if (!ref || ref.length > 6) continue;
    const stops: string[] = [];
    let score = 0;
    for (const m of rel.members ?? []) {
      if (!m.role?.startsWith('platform')) continue;
      const key = `${m.type}/${m.ref}`;
      if (near.has(key)) score++;
      const name = names.get(key);
      if (name && stops[stops.length - 1] !== name) stops.push(name);
    }
    const from = clean(tags.from) ?? stops[0];
    const to = clean(tags.to) ?? stops[stops.length - 1];
    if (!from || !to) continue;
    const line: BusLineOut = { ref, from, to, colour: tags.colour && HEX.test(tags.colour) ? tags.colour.toLowerCase() : null, stops: stops.slice(0, BUS_STOPS_MAX) };
    const prev = best.get(ref);
    if (!prev || score > prev.score || (score === prev.score && stops.length > prev.size)) best.set(ref, { line, score, size: stops.length });
  }
  const lines = [...best.values()]
    .sort((a, b) => b.score - a.score || natural(a.line.ref, b.line.ref))
    .slice(0, BUS_LINES_MAX)
    .map((b) => b.line);
  return { lines, school };
}

export async function proxyBusLines(rawBody: string, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return failure(400, 'bad-request');
  }
  const lat = Number((parsed as { lat?: unknown } | null)?.lat);
  const lon = Number((parsed as { lon?: unknown } | null)?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return failure(400, 'bad-request');
  const la = rounded(lat);
  const lo = rounded(lon);
  const key = `${la.toFixed(1)},${lo.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const result = await overpass(deps.fetch, query(la, lo));
  if (result.ok === false) return result.fail;
  const body = JSON.stringify({ ok: true, ...reduceBusLines(result.elements) });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
