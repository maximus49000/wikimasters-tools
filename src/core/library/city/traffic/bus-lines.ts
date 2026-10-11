// Lignes de bus (spec véhicules §5). Lignes réelles : relais /buslines (OpenStreetMap autour de la position arrondie, voir
// relay/src/buslines.ts et content/use-bus-lines.ts). Repli déterministe quand on n'en a pas (position désactivée, relais en
// échec, aucune ligne autour) : numéro de 1 à 99, parfois une lettre et un chiffre (« C3 ») ; départ et terminus types ;
// arrêts plausibles ; couleur tirée d'une palette de tons de réseau.
// Un bus roule dans un sens : vers la droite (voie du premier plan) il va au terminus `to`, vers la gauche il en revient
// (`directed`). Sa girouette latérale fait défiler les prochains arrêts à partir de celui de la scène (`nextStops`).
import { RELAY_BASE } from '../../../documentary/config';
import { hashString, mulberry32 } from '../../scene-world';

export const BUS_LINES_RELAY = `${RELAY_BASE}/buslines`;

export type BusLine = { ref: string; from: string; to: string; colour: string; stops: readonly string[] };
export type BusNetwork = { lines: readonly BusLine[]; school: string | null };

export const TERMINI = [
  'Gare SNCF', 'Hôtel de Ville', 'Place de la République', 'Centre hospitalier', 'Lycée Victor Hugo', 'Zone commerciale',
  'Parc des expositions', 'Campus', 'Les Coteaux', 'Le Port', 'Stade', 'Cimetière', 'Mairie annexe', 'Piscine', 'Collège Jean Moulin',
  'Porte de la Ville', 'Le Bourg', 'Les Tilleuls',
] as const;
const STOPS = [
  'Église', 'Marché', 'La Poste', 'Jean Jaurès', 'Pasteur', 'Gambetta', 'Les Lilas', 'Liberté', 'Clemenceau', 'Les Écoles',
  'Foch', 'Les Peupliers', 'Victor Hugo', 'Moulin', 'Saint-Michel', 'Les Acacias', 'Théâtre', 'Square Wilson', 'Belle-Vue',
  'Les Vignes', 'Carnot', 'Rue Neuve', 'Le Lavoir', 'Les Platanes', 'Mail', 'Champ de Foire', 'Bibliothèque', 'Château d’Eau',
] as const;
const COLOURS = ['#2f7d64', '#c0463a', '#2f5e8a', '#d9862e', '#7a4a8a', '#3b8fb0', '#b5395c', '#5f7a2e'] as const;
const NAME_LENGTH = 24;
const STOPS_MAX = 30;

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

export function fallbackLine(seed: number): BusLine {
  const r = mulberry32((seed * 2654435761) ^ 0xb05);
  const lettered = r() < 0.2;
  const ref = lettered ? `${'ABCLT'[Math.floor(r() * 5)]}${1 + Math.floor(r() * 9)}` : `${1 + Math.floor(r() * 99)}`;
  const to = pick(r, TERMINI);
  const colour = pick(r, COLOURS);
  let from = pick(r, TERMINI);
  if (from === to) from = TERMINI[(TERMINI.indexOf(to) + 5) % TERMINI.length]!;
  // Arrêts intermédiaires : 7 à 11 noms distincts tirés de la liste.
  const pool: string[] = [...STOPS];
  const middle: string[] = [];
  for (let n = 7 + Math.floor(r() * 5); n > 0; n--) middle.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  return { ref, from, to, colour, stops: [from, ...middle, to] };
}

// Sens de circulation : +1 (vers la droite) va vers `to` ; −1 en revient (départ et terminus échangés, arrêts inversés).
export function directed(line: BusLine, dir: 1 | -1): BusLine {
  return dir > 0 ? line : { ...line, from: line.to, to: line.from, stops: [...line.stops].reverse() };
}

// Arrêt de la scène sur une ligne (déjà orientée) : un arrêt intermédiaire tiré par la graine.
export function sceneStopIndex(line: BusLine, seed: number): number {
  const n = line.stops.length;
  if (n <= 2) return 0;
  return 1 + Math.floor(mulberry32(seed ^ hashString(`stop|${line.ref}`))() * (n - 2));
}

// Prochains arrêts affichés sur la girouette latérale : à partir de l'arrêt de la scène (`stop`, ou celui tiré par la graine
// s'il n'est pas sur la ligne) tant qu'il n'est pas desservi, après lui ensuite ; le terminus termine toujours la liste.
export function nextStops(line: BusLine, stop: string, served: boolean, seed: number, max = 5): string[] {
  const at = line.stops.indexOf(stop);
  const i = (at >= 0 ? at : sceneStopIndex(line, seed)) + (served ? 1 : 0);
  const list = line.stops.slice(i, i + max);
  if (list[list.length - 1] !== line.to) {
    if (list.length >= max) list.pop();
    list.push(line.to);
  }
  return list;
}

const colourOf = (ref: string, colour: unknown): string =>
  typeof colour === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour) ? colour.toLowerCase() : COLOURS[hashString(`ref|${ref}`) % COLOURS.length]!;
const nameOf = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 && v.length <= NAME_LENGTH ? v.trim() : null);

// Réponse du relais → lignes (valeurs invalides écartées ; couleur absente : tirée du numéro), ou null si la forme est fausse.
export function parseBusNetwork(body: unknown): BusNetwork | null {
  const b = body as { ok?: unknown; lines?: unknown; school?: unknown } | null;
  if (b?.ok !== true || !Array.isArray(b.lines)) return null;
  const lines: BusLine[] = [];
  for (const raw of b.lines.slice(0, 8)) {
    const l = raw as { ref?: unknown; from?: unknown; to?: unknown; colour?: unknown; stops?: unknown } | null;
    const ref = nameOf(l?.ref);
    const from = nameOf(l?.from);
    const to = nameOf(l?.to);
    if (!l || !ref || ref.length > 6 || !from || !to) continue;
    const stops = (Array.isArray(l.stops) ? l.stops : []).map(nameOf).filter((s): s is string => s !== null).slice(0, STOPS_MAX);
    if (stops[0] !== from) stops.unshift(from);
    if (stops[stops.length - 1] !== to) stops.push(to);
    lines.push({ ref, from, to, colour: colourOf(ref, l.colour), stops });
  }
  return { lines, school: nameOf(b.school) };
}
