// src/core/library/figure/dress.ts
import type { Accessory, Hair, Outfit } from '../city/people';

// Forme d'une tenue pour le pantin : seul ce qui change la géométrie (les couleurs vont dans des variables CSS).
// La signature sert de clé aux symboles : deux passants de même forme partagent leurs poses.
export type TopShape = 'coat' | 'tee' | 'long';
export type BottomShape = 'skirt' | 'shorts' | 'pants';
// Tenue de travail par-dessus (gilet de chantier, tablier de commerçant) : `none` pour les passants.
export type Work = 'none' | 'vest' | 'apron';
export type Shape = { hair: Hair; top: TopShape; bottom: BottomShape; acc: Accessory; umbrella: boolean; work: Work };
const WORK_CODE: Record<Work, string> = { none: 'n', vest: 'v', apron: 'a' };

export function shapeOf(o: Outfit, umbrella: boolean, work: Work = 'none'): Shape {
  const top: TopShape = o.top === 'coat' ? 'coat' : o.top === 'tee' || o.top === 'jersey' ? 'tee' : 'long';
  const bottom: BottomShape = o.bottom === 'skirt' || o.bottom === 'dress' ? 'skirt' : o.bottom === 'shorts' ? 'shorts' : 'pants';
  return { hair: o.hair, top, bottom, acc: o.accessory, umbrella, work };
}

// Six champs : coiffure.haut.bas.accessoire.parapluie.travail (n / v / a).
export const signatureOf = (s: Shape): string => `${s.hair}.${s.top}.${s.bottom}.${s.acc}.${s.umbrella ? 'u' : 'n'}.${WORK_CODE[s.work]}`;

// Relit aussi les signatures à cinq champs (avant les tenues de travail) : travail `none`.
export function shapeFromSignature(sig: string): Shape {
  const [hair, top, bottom, acc, u, w] = sig.split('.');
  const work: Work = w === 'v' ? 'vest' : w === 'a' ? 'apron' : 'none';
  return { hair: hair as Hair, top: top as TopShape, bottom: bottom as BottomShape, acc: acc as Accessory, umbrella: u === 'u', work };
}
