import { isBookCard } from '../book/book-kinds';
import { isVideoGame } from '../game/game-kinds';
import type { CardKinds } from '../kinds/wikidata-kinds';
import { musicKindOf } from '../music/music-kinds';
import { screenKindOf } from '../screen/screen-kinds';

// Natures Wikidata d'un événement historique : événement historique, bataille, guerre, conflit armé, opération militaire, siège militaire,
// révolution, traité, bataille navale, guerre civile, rébellion, guerre de libération nationale.
export const EVENT_NATURES: ReadonlySet<string> = new Set(['Q13418847', 'Q178561', 'Q198', 'Q350604', 'Q645883', 'Q188055', 'Q10931', 'Q131569', 'Q1261499', 'Q8465', 'Q124734', 'Q1006311']);

// Autres sujets d'histoire et de culture, reconnus par leur nature même sans date : œuvres d'art (œuvre d'art, sculpture, peinture, tapisserie,
// série de tapisseries, dessin, statue), monuments et sites (monument, palais, château fort, temple, église, bien culturel, patrimoine mondial,
// site archéologique), civilisations et périodes (civilisation, civilisation antique, État historique, empire, période historique, région
// historique), religions (religion, mouvement religieux).
export const TOPIC_NATURES: ReadonlySet<string> = new Set([
  'Q838948', 'Q860861', 'Q3305213', 'Q184296', 'Q18609875', 'Q93184', 'Q179700',
  'Q4989906', 'Q16560', 'Q23413', 'Q44539', 'Q16970', 'Q2065736', 'Q9259', 'Q839954',
  'Q8432', 'Q28171280', 'Q3024240', 'Q48349', 'Q11514315', 'Q1620908',
  'Q9174', 'Q1826286',
]);

const HUMAN = 'Q5';
// Un humain est « historique » s'il est mort avant 1970 ; tout autre sujet l'est s'il date de 1950 ou avant. Les vivants sont exclus.
export const MAX_YEAR = 1950;
export const MAX_DEATH_YEAR = 1969;

// 'event' = tout sujet qui n'est pas une personne (événement, œuvre, monument, épidémie, civilisation, culte…) ; sa période va de `start` à `end`.
export type HistoryKind = 'event' | 'person';

const isHistoryNature = (id: string): boolean => EVENT_NATURES.has(id) || TOPIC_NATURES.has(id);

// Les films, séries, jeux vidéo, livres et morceaux ont déjà leur propre fiche.
export function hasOwnSection(kinds: CardKinds): boolean {
  const screen = screenKindOf(kinds);
  return screen === 'film' || screen === 'series' || isVideoGame(kinds) || isBookCard(kinds) || musicKindOf(kinds) !== null;
}

// La carte peut être historique : on ira lire ses dates (un humain, ou un sujet hors liste, n'est « historique » qu'une fois ses dates connues).
export const mayBeHistory = (kinds: CardKinds | undefined): boolean => kinds !== undefined && !hasOwnSection(kinds);

// `datedYear` : première année connue du sujet (début, ou naissance), pour juger un sujet que sa nature ne désigne pas.
export function historyKindOf(kinds: CardKinds | undefined, deathYear: number | null, datedYear: number | null = null): HistoryKind | null {
  if (!kinds || hasOwnSection(kinds)) return null;
  if (kinds.natures.some(isHistoryNature)) return 'event';
  if (kinds.natures.includes(HUMAN)) return deathYear !== null && deathYear <= MAX_DEATH_YEAR ? 'person' : null;
  return datedYear !== null && datedYear <= MAX_YEAR ? 'event' : null;
}
