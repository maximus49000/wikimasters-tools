// relay/src/budget.ts
import type { KvLike } from './kv';

// Quota YouTube : 10 000 unités par jour. On en utilise 9 000 au plus (marge pour le décalage d'horloge : Google remet à zéro à minuit, heure du Pacifique).
export const UNIT_CEILING = 9000;
// Une recherche (100) + les durées des résultats (1).
export const SEARCH_COST = 101;
// Une page d'une liste de vidéos (1) + leurs durées (1).
export const INDEX_PAGE_COST = 2;

// Réserve des unités sur la journée (UTC) ; false si cela dépasserait le plafond (rien n'est alors écrit).
export async function reserveUnits(kv: KvLike, now: Date, units: number, ceiling: number = UNIT_CEILING): Promise<boolean> {
  const key = `units-${now.toISOString().slice(0, 10)}`;
  const used = Number((await kv.get(key)) ?? '0');
  if (used + units > ceiling) return false;
  await kv.put(key, String(used + units), { expirationTtl: 2 * 86_400 });
  return true;
}
