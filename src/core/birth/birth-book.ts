import type { KnownCard } from '../collection/collection-book';
import type { CardDates } from './wikidata-birth';

export type BirthState = {
  // Une entrée par article interrogé ; toutes les dates à null = article sans date (on ne le redemande pas).
  dates: Record<string, CardDates>;
};

export const EMPTY_BIRTH: BirthState = { dates: {} };

export type TimelineMode = 'person' | 'event';

export function needsBirthLookup(state: BirthState, slug: string): boolean {
  return !Object.prototype.hasOwnProperty.call(state.dates, slug);
}

export function setBirths(state: BirthState, dates: Record<string, CardDates>): BirthState {
  return { dates: { ...state.dates, ...dates } };
}

// `end` : fin de l'évènement, quand elle est connue (jamais pour une personne).
export type DatedCard = { card: KnownCard; year: number; end?: number };

const byTitle = (a: KnownCard, b: KnownCard) => a.title.localeCompare(b.title, 'fr');

// Personne : date de naissance. Évènement : date de début, et de fin si elle existe.
// `dated` est trié du plus ancien au plus récent.
export function partitionByDates(
  cards: KnownCard[],
  state: BirthState,
  mode: TimelineMode,
): { dated: DatedCard[]; undated: KnownCard[] } {
  const dated: DatedCard[] = [];
  const undated: KnownCard[] = [];
  for (const card of [...cards].sort(byTitle)) {
    const dates = Object.prototype.hasOwnProperty.call(state.dates, card.slug) ? state.dates[card.slug] : undefined;
    const year = mode === 'person' ? dates?.birth : dates?.start;
    if (typeof year !== 'number') {
      undated.push(card);
      continue;
    }
    const end = mode === 'event' ? dates?.end : null;
    dated.push(typeof end === 'number' && end >= year ? { card, year, end } : { card, year });
  }
  dated.sort((a, b) => a.year - b.year);
  return { dated, undated };
}
