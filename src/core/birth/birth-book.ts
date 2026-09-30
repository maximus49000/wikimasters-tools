import type { KnownCard } from '../collection/collection-book';

export type BirthState = {
  // Année décimale de naissance ; null = article interrogé, sans date (on ne le redemande pas).
  years: Record<string, number | null>;
};

export const EMPTY_BIRTH: BirthState = { years: {} };

export function needsBirthLookup(state: BirthState, slug: string): boolean {
  return !Object.prototype.hasOwnProperty.call(state.years, slug);
}

export function setBirths(state: BirthState, years: Record<string, number | null>): BirthState {
  return { years: { ...state.years, ...years } };
}

export type DatedCard = { card: KnownCard; year: number };

const byTitle = (a: KnownCard, b: KnownCard) => a.title.localeCompare(b.title, 'fr');

// `dated` est trié du plus ancien au plus récent.
export function partitionByBirth(cards: KnownCard[], state: BirthState): { dated: DatedCard[]; undated: KnownCard[] } {
  const dated: DatedCard[] = [];
  const undated: KnownCard[] = [];
  for (const card of [...cards].sort(byTitle)) {
    const year = Object.prototype.hasOwnProperty.call(state.years, card.slug) ? state.years[card.slug] : null;
    if (typeof year === 'number') dated.push({ card, year });
    else undated.push(card);
  }
  dated.sort((a, b) => a.year - b.year);
  return { dated, undated };
}
