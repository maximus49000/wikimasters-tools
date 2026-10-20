// src/core/library/figure/dress.ts
import type { Accessory, Guise, Hair, Outfit } from '../city/people';

// Forme d'une tenue pour le pantin : seul ce qui change la géométrie (les couleurs vont dans des variables CSS).
// La signature sert de clé aux symboles : deux passants de même forme partagent leurs poses.
export type TopShape = 'coat' | 'tee' | 'long';
export type BottomShape = 'skirt' | 'shorts' | 'pants';
// Tenue de travail par-dessus (gilet de chantier, tablier de commerçant) : `none` pour les passants.
export type Work = 'none' | 'vest' | 'apron';
// `santa` (G5) : tenue du père Noël (corpulence, barbe, fourrure, ceinture, gants, bottes, bonnet à pompon).
// `guise` : déguisement d'Halloween (bake.ts : chapeau pointu, drap, os, cape, cornes, oreilles, queue, citrouille…).
export type Shape = { hair: Hair; top: TopShape; bottom: BottomShape; acc: Accessory; umbrella: boolean; work: Work; santa?: boolean; guise?: Guise };
const WORK_CODE: Record<Work, string> = { none: 'n', vest: 'v', apron: 'a' };

export function shapeOf(o: Outfit, umbrella: boolean, work: Work = 'none', santa = false, guise?: Guise): Shape {
  const top: TopShape = o.top === 'coat' ? 'coat' : o.top === 'tee' || o.top === 'jersey' ? 'tee' : 'long';
  const bottom: BottomShape = o.bottom === 'skirt' || o.bottom === 'dress' ? 'skirt' : o.bottom === 'shorts' ? 'shorts' : 'pants';
  return guise ? { hair: o.hair, top, bottom, acc: o.accessory, umbrella, work, santa, guise } : { hair: o.hair, top, bottom, acc: o.accessory, umbrella, work, santa };
}

// Tenue d'un déguisé (forme et couleurs de base ; les pièces du déguisement ont leurs cases `cos`, `cos2`, `cos3`, `bone`).
// Un accessoire (chapeau pointu, cornes, oreilles) garde la tenue.
type Base = Pick<Outfit, 'hair' | 'top' | 'bottom'> & { topColor: string; bottomColor: string; skin?: string; hairColor?: string };
const GUISE_BASE: Readonly<Partial<Record<Guise, Base>>> = {
  witch: { hair: 'long', hairColor: '#C8602A', top: 'sweater', topColor: '#3A2A4A', bottom: 'dress', bottomColor: '#3A2A4A' },
  ghost: { hair: 'bald', top: 'sweater', topColor: '#F4F2EC', bottom: 'pants', bottomColor: '#F4F2EC' },
  skeleton: { hair: 'bald', skin: '#EEEAE0', top: 'sweater', topColor: '#1C1A22', bottom: 'pants', bottomColor: '#1C1A22' },
  vampire: { hair: 'short', hairColor: '#14101A', skin: '#E8E2DC', top: 'sweater', topColor: '#1E1A24', bottom: 'pants', bottomColor: '#1E1A24' },
  mummy: { hair: 'bald', skin: '#E6DCC4', top: 'sweater', topColor: '#E6DCC4', bottom: 'pants', bottomColor: '#E0D4B8' },
  zombie: { hair: 'short', hairColor: '#3A3A2A', skin: '#9CB88A', top: 'tee', topColor: '#6A7A5A', bottom: 'pants', bottomColor: '#4A4A5A' },
  devil: { hair: 'short', hairColor: '#2A1414', top: 'sweater', topColor: '#C8302A', bottom: 'pants', bottomColor: '#A8262A' },
  pumpkin: { hair: 'short', top: 'sweater', topColor: '#3F7A3A', bottom: 'pants', bottomColor: '#2A3A2A' },
  cat: { hair: 'short', hairColor: '#1E1A22', top: 'sweater', topColor: '#1E1A22', bottom: 'pants', bottomColor: '#1E1A22' },
  hero: { hair: 'short', top: 'sweater', topColor: '#2E6AD8', bottom: 'pants', bottomColor: '#2E6AD8' },
};
export function guiseOutfit(o: Outfit, guise: Guise | null | undefined): Outfit {
  const b = guise ? GUISE_BASE[guise] : undefined;
  return b ? { ...o, ...b, skin: b.skin ?? o.skin, hairColor: b.hairColor ?? o.hairColor, accessory: 'none' } : o;
}
// Couleurs des pièces du déguisement : `cos` (chapeau, drap, cape, cornes, oreilles et queue, citrouille), `cos2` (bandeau du
// chapeau, doublure et col de la cape, bandelettes, tige, masque), `cos3` (yeux sculptés, insigne), `bone` (os).
export const GUISE_COLORS: Readonly<Record<Guise, { cos: string; cos2: string; cos3: string; bone: string }>> = {
  witch: { cos: '#2A1E30', cos2: '#8A5ABE', cos3: '#2A1E30', bone: '#F2EEE2' },
  'witch-hat': { cos: '#2A1E30', cos2: '#8A5ABE', cos3: '#2A1E30', bone: '#F2EEE2' },
  ghost: { cos: '#F4F2EC', cos2: '#F4F2EC', cos3: '#14101A', bone: '#F2EEE2' },
  skeleton: { cos: '#1C1A22', cos2: '#1C1A22', cos3: '#14101A', bone: '#F2EEE2' },
  vampire: { cos: '#1A1420', cos2: '#A82A3A', cos3: '#14101A', bone: '#F2EEE2' },
  mummy: { cos: '#E6DCC4', cos2: '#9A8A6A', cos3: '#2A2018', bone: '#F2EEE2' },
  zombie: { cos: '#6A7A5A', cos2: '#7A3A3A', cos3: '#2A2A1E', bone: '#F2EEE2' },
  devil: { cos: '#E83A2A', cos2: '#A8262A', cos3: '#14101A', bone: '#F2EEE2' },
  horns: { cos: '#E83A2A', cos2: '#A8262A', cos3: '#14101A', bone: '#F2EEE2' },
  pumpkin: { cos: '#E8772E', cos2: '#3F8A3A', cos3: '#3A1A08', bone: '#F2EEE2' },
  cat: { cos: '#1E1A22', cos2: '#D88AA0', cos3: '#14101A', bone: '#F2EEE2' },
  ears: { cos: '#1E1A22', cos2: '#D88AA0', cos3: '#14101A', bone: '#F2EEE2' },
  hero: { cos: '#D83A3A', cos2: '#14101A', cos3: '#FFD84A', bone: '#F2EEE2' },
};

// Six champs : coiffure.haut.bas.accessoire.parapluie.travail (n / v / a) ; champ `s` pour le père Noël seulement, champ
// `g:<déguisement>` pour un déguisé seulement (les signatures des autres pantins, donc les clés de leurs sprites, ne changent pas).
export const signatureOf = (s: Shape): string => `${s.hair}.${s.top}.${s.bottom}.${s.acc}.${s.umbrella ? 'u' : 'n'}.${WORK_CODE[s.work]}${s.santa ? '.s' : ''}${s.guise ? `.g:${s.guise}` : ''}`;

// Relit aussi les signatures à cinq champs (avant les tenues de travail) : travail `none`.
export function shapeFromSignature(sig: string): Shape {
  const [hair, top, bottom, acc, u, w, ...rest] = sig.split('.');
  const work: Work = w === 'v' ? 'vest' : w === 'a' ? 'apron' : 'none';
  const g = rest.find((x) => x.startsWith('g:'));
  const shape: Shape = { hair: hair as Hair, top: top as TopShape, bottom: bottom as BottomShape, acc: acc as Accessory, umbrella: u === 'u', work, santa: rest.includes('s') };
  return g ? { ...shape, guise: g.slice(2) as Guise } : shape;
}
