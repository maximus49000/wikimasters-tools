import { hashString, mulberry32 } from '../../../scene-world';
import { outfitFor } from '../../people';
import type { ShopTypeId } from '../catalog';
import { ARRIVAL_SHARE, SLOT_S, inScene } from './slots';
import type { Character, Incident, Member, Party, PartyKind, SlotKey } from './types';

// Distribution des partis d'un créneau : qui vient, à plusieurs ou seul, quand, avec quel caractère et quels aléas en
// poche, et qui se connaît. Fonction pure de la clé du créneau : même créneau, même distribution.
// `gate` : affluence de l'instant (0 = personne) ; `capacity` : clients que la boutique sert à la fois ;
// `dayMinutesAtStart` : minute du jour au début du créneau (pondère les caractères par heure).
export type CastInput = SlotKey & { gate: number; capacity: number; dayMinutesAtStart: number };

// Composition de base (spec) ; `friends` ×3 dans les lieux où l'on vient entre amis, ×0,3 ailleurs, puis renormalisé.
const KIND_WEIGHTS: readonly (readonly [PartyKind, number])[] = [['solo', 0.7], ['couple', 0.12], ['parent-child', 0.08], ['friends', 0.1]];
const FRIENDLY: ReadonlySet<ShopTypeId> = new Set(['bar', 'cafe', 'tearoom', 'restaurant', 'pizzeria', 'kebab', 'sushi']);
// Habitués : boulangerie, bar, café, salon de thé, épicerie.
const REGULARS: ReadonlySet<ShopTypeId> = new Set(['bakery', 'bar', 'cafe', 'tearoom', 'grocery']);
// Connaissances fréquentes : bar, café, boulangerie.
const ACQUAINTED: ReadonlySet<ShopTypeId> = new Set(['bar', 'cafe', 'bakery']);
// Poids de base des caractères : l'ordinaire domine, le perdu reste rare.
const CHARACTER_BASE: readonly (readonly [Character, number])[] = [['rushed', 1], ['chatty', 1], ['undecided', 1], ['regular', 1], ['lost', 0.5], ['ordinary', 3]];
const INCIDENTS: readonly Incident[] = ['drop-coin', 'no-change', 'sneeze', 'phone-ring', 'child-tug'];
const INCIDENT_P = 0.12;
// Avant 9 h 30 on est pressé ; entre 14 h et 17 h on a le temps de bavarder.
const RUSH_UNTIL = 9 * 60 + 30;
const CHAT_FROM = 14 * 60;
const CHAT_UNTIL = 17 * 60;
// Première arrivée possible (s) : la boutique est au repos au début du créneau.
const FIRST_ARRIVAL = 2;

// Loi de Poisson par la méthode de Knuth (λ petit), sur le générateur seedé.
function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rng();
  while (p > limit) {
    k++;
    p *= rng();
  }
  return k;
}

function weighted<T>(entries: readonly (readonly [T, number])[], rng: () => number): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r < 0) return value;
  }
  return entries[entries.length - 1]![0];
}

function memberFor(id: string, child: boolean, rng: () => number): Member {
  if (child) return { id, outfit: outfitFor('child', rng), scale: 0.6 + rng() * 0.1, child: true };
  return { id, outfit: outfitFor(rng() < 0.2 ? 'suit' : 'ordinary', rng), scale: 0.95 + rng() * 0.15, child: false };
}

// Taille du parti : meneur compris ; parent-enfant = un adulte et un enfant (parfois deux).
function sizeOf(kind: PartyKind, rng: () => number): number {
  if (kind === 'solo') return 1;
  if (kind === 'couple') return 2;
  if (kind === 'parent-child') return rng() < 0.25 ? 3 : 2;
  return rng() < 0.6 ? 2 : 3;
}

export function castFor(input: CastInput): Party[] {
  const { seed, slotId, type, day, index, gate, capacity, dayMinutesAtStart } = input;
  if (!inScene(type) || gate <= 0 || capacity <= 0) return [];
  const rng = mulberry32(seed ^ hashString(`cast|${slotId}|${type}|${day}|${index}`));
  const slotS = SLOT_S(type);
  const n = Math.min(capacity + 2, poisson(gate * capacity * (slotS / 240) * 0.9, rng));
  if (n === 0) return [];
  const last = slotS * ARRIVAL_SHARE;
  const arrivals = Array.from({ length: n }, () => FIRST_ARRIVAL + rng() * (last - FIRST_ARRIVAL)).sort((a, b) => a - b);

  const friendsW = FRIENDLY.has(type) ? 3 : 0.3;
  const kinds = KIND_WEIGHTS.map(([k, w]) => [k, k === 'friends' ? w * friendsW : w] as const);
  const characters = CHARACTER_BASE.map(([c, w]) => {
    let f = w;
    if (c === 'rushed' && dayMinutesAtStart < RUSH_UNTIL) f *= 2;
    if (c === 'chatty' && dayMinutesAtStart >= CHAT_FROM && dayMinutesAtStart < CHAT_UNTIL) f *= 2;
    if (c === 'regular' && REGULARS.has(type)) f *= 2;
    return [c, f] as const;
  });

  const parties: Party[] = arrivals.map((arriveAt, i) => {
    const id = `${slotId}-c${index}-p${i}`;
    const kind = weighted(kinds, rng);
    const size = sizeOf(kind, rng);
    // Meneur toujours adulte ; les enfants n'existent qu'en parent-enfant.
    const members = Array.from({ length: size }, (_, k) => memberFor(`${id}-m${k}`, kind === 'parent-child' && k > 0, rng));
    const character = weighted(characters, rng);
    const incidents = INCIDENTS.filter((inc) => rng() < INCIDENT_P && (inc !== 'child-tug' || kind === 'parent-child'));
    const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
    return { id, kind, members, character, arriveAt, dir, incidents, knows: null };
  });

  // Connaissances : chaque paire a sa chance, une connaissance au plus par parti, toujours réciproque.
  const knowP = ACQUAINTED.has(type) ? 0.15 : 0.05;
  for (let a = 0; a < parties.length; a++) {
    for (let b = a + 1; b < parties.length; b++) {
      const roll = rng();
      if (parties[a]!.knows || parties[b]!.knows || roll >= knowP) continue;
      parties[a]!.knows = parties[b]!.id;
      parties[b]!.knows = parties[a]!.id;
    }
  }
  return parties;
}
