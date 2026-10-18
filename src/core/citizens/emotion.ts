// Émotions des habitants 3D, sans three.js : la table geste → émotion (face.ts la ré-exporte) et l'humeur de fond d'un
// habitant des scènes des commerces. Importable par le code des scènes : à CITIZENS_3D = false, le bundle n'embarque pas
// three.js (face.ts, lui, l'importe).
import type { Emotion } from './catalogue';
import { rng } from './catalogue';
import type { ArmPose } from '../library/figure/skeleton';

// Payer, recevoir → content ; trinquer, acclamer → heureux ; éternuer → surpris ; bras croisés, main au menton → inquiet.
const GESTURE_EMOTION: Partial<Record<ArmPose, Emotion>> = {
  'pay-card': 'content', 'pay-cash': 'content', take: 'content', give: 'content', wave: 'content',
  'toast-1': 'heureux', 'toast-2': 'heureux', cheer: 'heureux', raise: 'heureux',
  sneeze: 'surpris',
  crossed: 'inquiet', chin: 'inquiet',
};

/** Émotion affichée pendant un geste ; hors des gestes expressifs, l'humeur de l'habitant. */
export function emotionFor(arms: ArmPose, mood: Emotion): Emotion {
  return GESTURE_EMOTION[arms] ?? mood;
}

// Humeur de fond d'un client ou d'un employé (spec : « surtout neutre ou content ») : tirée de sa graine, donc la même à
// chaque visite. Elle fait partie de la clé de l'habitant ; le visage de chaque pose en dérive par `emotionFor`.
export function moodOf(seed: number): Emotion {
  const R = rng(seed ^ 0x6d6f6f64);
  return R() < 0.4 ? 'content' : 'neutre';
}
