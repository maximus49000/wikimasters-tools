// Niveau d'activité humaine de la ville (0 à 1) selon l'heure locale : pic de début de soirée, creux vers 4 h.
const KEYS: readonly (readonly [number, number])[] = [
  [0, 0.3],
  [1, 0.2],
  [2, 0.12],
  [3, 0.06],
  [4, 0.04],
  [5, 0.1],
  [6, 0.3],
  [7, 0.45],
  [8, 0.25],
  [10, 0.1],
  [14, 0.08],
  [17, 0.3],
  [19, 0.85],
  [21, 1],
  [22, 0.9],
  [23, 0.55],
  [24, 0.3],
];

export function activityAt(minutes: number): number {
  const hours = (((minutes % 1440) + 1440) % 1440) / 60;
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, a1] = KEYS[i]!;
    const [h0, a0] = KEYS[i - 1]!;
    if (hours <= h1) return a0 + ((a1 - a0) * (hours - h0)) / (h1 - h0);
  }
  return KEYS[KEYS.length - 1]![1];
}

// Chaque fenêtre d'immeuble a un seuil u ∈ [0,1) tiré de sa graine : elle est allumée quand l'activité dépasse ce seuil.
// Au crépuscule les lumières s'allument donc en cascade ; vers 4 h il ne reste que les seuils les plus bas (insomniaques).
export const lampLit = (u: number, minutes: number): boolean => u < activityAt(minutes) * 0.92;

// Même principe pour les passants et les véhicules ; u < 0 : toujours présent (nuages, oiseaux, satellites).
export const actorActive = (u: number, minutes: number): boolean => u < 0 || u < activityAt(minutes);
