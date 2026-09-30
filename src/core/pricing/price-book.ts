import type { PriceObservation } from './observations';
import { computeStats, type PriceStats, type StatsOptions } from './stats';

export type PriceBookEntry = {
  cardId: string;
  rarity: string;
  isShiny: boolean;
  stats: PriceStats;
  // Tous les achats connus (sans fenêtre de temps) ; null si la carte n'a jamais été achetée.
  purchase: { min: number; max: number } | null;
};

export type PriceBook = {
  byTitle(title: string): PriceBookEntry | null;
};

export function normalizeTitle(title: string): string {
  return title.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function keyOf(o: PriceObservation): string {
  return `${o.cardId}|${o.rarity}|${o.isShiny ? 1 : 0}`;
}

export function buildPriceBook(
  observations: PriceObservation[],
  options: StatsOptions = {},
): PriceBook {
  const byTitle = new Map<string, Map<string, PriceObservation[]>>();
  for (const o of observations) {
    const title = normalizeTitle(o.title);
    const groups = byTitle.get(title) ?? new Map<string, PriceObservation[]>();
    const key = keyOf(o);
    groups.set(key, [...(groups.get(key) ?? []), o]);
    byTitle.set(title, groups);
  }

  return {
    byTitle(title: string): PriceBookEntry | null {
      const groups = byTitle.get(normalizeTitle(title));
      // Titre inconnu, ou ambigu : on préfère ne rien afficher plutôt qu'un mauvais prix.
      if (!groups || groups.size !== 1) return null;
      const [group] = [...groups.values()];
      const first = group?.[0];
      if (!first) return null;
      const bought = group.filter((o) => o.kind === 'bought').map((o) => o.price);
      const purchase = bought.length > 0 ? { min: Math.min(...bought), max: Math.max(...bought) } : null;
      return {
        cardId: first.cardId,
        rarity: first.rarity,
        isShiny: first.isShiny,
        stats: computeStats(group, options),
        purchase,
      };
    },
  };
}
