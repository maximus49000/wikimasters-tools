import type { CardKinds } from '../kinds/wikidata-kinds';

// Natures Wikidata d'un événement historique : événement historique, bataille, guerre, conflit armé, opération militaire, siège militaire,
// révolution, traité, bataille navale, guerre civile, rébellion, guerre de libération nationale.
export const EVENT_NATURES: ReadonlySet<string> = new Set(['Q13418847', 'Q178561', 'Q198', 'Q350604', 'Q645883', 'Q188055', 'Q10931', 'Q131569', 'Q1261499', 'Q8465', 'Q124734', 'Q1006311']);
const HUMAN = 'Q5';
// Un humain est « historique » s'il est mort en 1950 ou avant ; les vivants sont exclus.
export const MAX_DEATH_YEAR = 1950;

export type HistoryKind = 'event' | 'person';

// La carte peut être historique : on ira lire ses dates (un humain n'est « historique » qu'une fois sa date de décès connue).
export const mayBeHistory = (kinds: CardKinds | undefined): boolean => kinds !== undefined && (kinds.natures.includes(HUMAN) || kinds.natures.some((id) => EVENT_NATURES.has(id)));

export function historyKindOf(kinds: CardKinds | undefined, deathYear: number | null): HistoryKind | null {
  if (!kinds) return null;
  if (kinds.natures.some((id) => EVENT_NATURES.has(id))) return 'event';
  if (kinds.natures.includes(HUMAN) && deathYear !== null && deathYear <= MAX_DEATH_YEAR) return 'person';
  return null;
}
