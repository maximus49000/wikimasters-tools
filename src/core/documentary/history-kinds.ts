import { isBookCard } from '../book/book-kinds';
import { isVideoGame } from '../game/game-kinds';
import type { CardKinds } from '../kinds/wikidata-kinds';
import { musicKindOf } from '../music/music-kinds';
import { screenKindOf } from '../screen/screen-kinds';

const HUMAN = 'Q5';
// Page d'homonymie : « Monolithe (homonymie) » ne désigne aucun sujet précis.
const DISAMBIGUATION = 'Q4167410';

// 'person' : personne décédée, période de naissance à décès. 'event' : tout autre sujet (événement, œuvre, monument, épidémie, civilisation, culte, espèce…), de `start` à `end`.
export type HistoryKind = 'event' | 'person';

// Les films, séries, jeux vidéo, livres et morceaux ont déjà leur propre fiche.
export function hasOwnSection(kinds: CardKinds): boolean {
  const screen = screenKindOf(kinds);
  return screen === 'film' || screen === 'series' || isVideoGame(kinds) || isBookCard(kinds) || musicKindOf(kinds) !== null;
}

// La carte peut avoir un documentaire : on ira lire ses dates (une personne n'est retenue qu'une fois sa date de décès connue : les vivants sont exclus).
export const mayBeHistory = (kinds: CardKinds | undefined): boolean => kinds !== undefined && !hasOwnSection(kinds) && !kinds.natures.includes(DISAMBIGUATION);

// Décision du 2026-10-08 : la recherche est large (monuments, menhirs, mausolées, espèces…). La pertinence est jugée par la notation des vidéos, pas par la nature de la carte.
export function historyKindOf(kinds: CardKinds | undefined, deathYear: number | null): HistoryKind | null {
  if (!kinds || !mayBeHistory(kinds)) return null;
  if (kinds.natures.includes(HUMAN)) return deathYear !== null ? 'person' : null;
  return 'event';
}
