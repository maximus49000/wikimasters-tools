import type { DocCandidate } from '../core/documentary/types';

// Toutes les vidéos de la liste : les proposées d'abord (la vidéo choisie en tête), puis celles de pertinence moins sûre, sans doublon.
export function allVideos(good: DocCandidate[], possible: DocCandidate[]): DocCandidate[] {
  const seen = new Set<string>();
  return [...good, ...possible].filter((candidate) => !seen.has(candidate.id) && seen.add(candidate.id));
}

// Une vidéo « possible » : dans la liste des possibles et pas dans celle des proposées.
export const isPossible = (candidate: DocCandidate, good: DocCandidate[], possible: DocCandidate[]): boolean =>
  possible.some((entry) => entry.id === candidate.id) && !good.some((entry) => entry.id === candidate.id);
