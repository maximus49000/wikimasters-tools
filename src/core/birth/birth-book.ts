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

// `end` : mort, ou fin de l'évènement / de la construction, quand elle est connue.
export type DatedCard = { card: KnownCard; year: number; end?: number };

const byTitle = (a: KnownCard, b: KnownCard) => a.title.localeCompare(b.title, 'fr');

// Au-delà, une personne sans date de mort est plutôt inconnue de Wikidata que vivante : sa barre s'arrête à la naissance.
export const MAX_LIVING_AGE = 110;

// Personne : de la naissance à la mort ; sans date de mort, jusqu'à l'année en cours si elle peut encore être en vie.
// Évènement : du début à la fin si elle est connue. `dated` est trié du plus ancien au plus récent.
export function partitionByDates(
  cards: KnownCard[],
  state: BirthState,
  mode: TimelineMode,
  nowYear: number = new Date().getFullYear(),
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
    const alive = dates?.death == null && nowYear - year <= MAX_LIVING_AGE;
    const end = mode === 'event' ? dates?.end : (dates?.death ?? (alive ? nowYear : null));
    dated.push(typeof end === 'number' && end >= year ? { card, year, end } : { card, year });
  }
  dated.sort((a, b) => a.year - b.year);
  return { dated, undated };
}
