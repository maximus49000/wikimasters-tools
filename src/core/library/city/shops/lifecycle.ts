import { hashString, mulberry32 } from '../../scene-world';
import { SHOP_DEFS, SHOP_TYPE_IDS, type ShopTypeId } from './catalog';
import { nextWorkday } from './hours';
import type { ShopSlot } from './slots';

// Cycle de vie des locaux, calculé (rien n'est enregistré sauf le jour de départ de la pièce, `epochDay`).
// Tous les locaux sont simulés ENSEMBLE, dans l'ordre des jours de changement (à égalité, dans l'ordre des locaux) :
// un nouveau commerce n'a jamais le type de l'ancien, ni celui d'un autre local occupé de la pièce (s'il reste du choix),
// et jamais le nom d'un autre local. Chaque local a son propre générateur ; le choix du nom consomme toujours UN tirage,
// si bien que types et dates ne dépendent pas des noms disponibles (position connue ou non).
export const OPEN_DAYS = [21, 84] as const;
export const SALE_DAYS = [7, 21] as const;
export const RELET_CHANCE = 0.5;

export type NamePool = Partial<Record<ShopTypeId, readonly string[]>>;
export type Tenant = { type: ShopTypeId; name: string; from: number };
export type Change = { day: number; kind: 'relet' | 'to-sale' | 'from-sale'; before: Tenant | null; after: Tenant | null };
export type SlotDay = { slot: ShopSlot; tenant: Tenant | null; change: Change | null };

type Track = { slot: ShopSlot; rng: () => number; tenant: Tenant | null; next: number; last: Change | null };

const between = (rng: () => number, [lo, hi]: readonly [number, number]): number => lo + Math.floor(rng() * (hi - lo + 1));

function pickType(rng: () => number, previous: ShopTypeId | null, taken: ReadonlySet<ShopTypeId>): ShopTypeId {
  const free = SHOP_TYPE_IDS.filter((id) => id !== previous && !taken.has(id));
  const list = free.length > 0 ? free : SHOP_TYPE_IDS.filter((id) => id !== previous);
  return list[Math.floor(rng() * list.length)]!;
}

function pickName(rng: () => number, type: ShopTypeId, pool: NamePool, taken: ReadonlySet<string>): string {
  const u = rng();
  const local = (pool[type] ?? []).filter((n) => !taken.has(n));
  const written = SHOP_DEFS[type].names.filter((n) => !taken.has(n));
  const list = local.length > 0 ? local : written.length > 0 ? written : SHOP_DEFS[type].names;
  return list[Math.floor(u * list.length)]!;
}

export function streetOn(slots: ShopSlot[], seed: number, epochDay: number, day: number, pool: NamePool): SlotDay[] {
  const target = Math.max(day, epochDay);
  const tracks: Track[] = [];
  const typesOf = (except: Track): Set<ShopTypeId> => new Set(tracks.filter((t) => t !== except && t.tenant).map((t) => t.tenant!.type));
  const namesOf = (except: Track): Set<string> => new Set(tracks.filter((t) => t !== except && t.tenant).map((t) => t.tenant!.name));
  const newTenant = (t: Track, previous: ShopTypeId | null, from: number): Tenant => {
    const type = pickType(t.rng, previous, typesOf(t));
    return { type, name: pickName(t.rng, type, pool, namesOf(t)), from };
  };
  // Départ : chaque local est ouvert depuis un « âge » tiré dans sa première période (changements étalés).
  for (const slot of slots) {
    const t: Track = { slot, rng: mulberry32(seed ^ hashString('shops') ^ Math.imul(slot.index + 1, 2654435761)), tenant: null, next: 0, last: null };
    tracks.push(t);
    const length = between(t.rng, OPEN_DAYS);
    const age = Math.floor(t.rng() * length);
    t.tenant = newTenant(t, null, epochDay - age);
    t.next = nextWorkday(epochDay - age + length);
  }
  // Changements dans l'ordre, jusqu'au jour visé compris.
  for (;;) {
    let due: Track | null = null;
    for (const t of tracks) if (t.next <= target && (due === null || t.next < due.next)) due = t;
    if (!due) break;
    const at = due.next;
    const before = due.tenant;
    if (before === null) {
      const after = newTenant(due, null, at);
      due.last = { day: at, kind: 'from-sale', before: null, after };
      due.tenant = after;
      due.next = nextWorkday(at + between(due.rng, OPEN_DAYS));
    } else if (due.rng() < RELET_CHANCE) {
      const after = newTenant(due, before.type, at);
      due.last = { day: at, kind: 'relet', before, after };
      due.tenant = after;
      due.next = nextWorkday(at + between(due.rng, OPEN_DAYS));
    } else {
      due.last = { day: at, kind: 'to-sale', before, after: null };
      due.tenant = null;
      due.next = nextWorkday(at + between(due.rng, SALE_DAYS));
    }
  }
  return tracks.map((t) => ({ slot: t.slot, tenant: t.tenant, change: t.last && t.last.day === target ? t.last : null }));
}
