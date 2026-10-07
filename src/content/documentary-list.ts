import type { DocCandidate } from '../core/documentary/types';

// Les vidéos montrées dans le lecteur : les proposées ; avec le lien ouvert, les possibles (pertinence moins sûre) à la suite.
export function shownList(good: DocCandidate[], possible: DocCandidate[], showPossible: boolean): DocCandidate[] {
  return showPossible ? [...good, ...possible] : good;
}

// Une vidéo « possible » : dans la liste des possibles et pas dans celle des proposées.
export const isPossible = (candidate: DocCandidate, good: DocCandidate[], possible: DocCandidate[]): boolean =>
  possible.some((entry) => entry.id === candidate.id) && !good.some((entry) => entry.id === candidate.id);
