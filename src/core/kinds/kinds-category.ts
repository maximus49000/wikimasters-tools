import { musicKindOf } from '../music/music-kinds';
import type { CardKinds } from './wikidata-kinds';

export type Category = 'music' | 'film' | 'other';

// Ordre d'affichage de la liste « Catégorie ».
export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'music', label: 'Musique' },
  { id: 'film', label: 'Films / Série' },
  { id: 'other', label: 'Autre' },
];

// Film, court métrage, film d'animation, documentaire, saga ; série télévisée, mini-série, série d'animation, programme de télévision.
const SCREEN = new Set(['Q11424', 'Q24862', 'Q202866', 'Q93204', 'Q24856', 'Q5398426', 'Q1259759', 'Q581714', 'Q15416']);

export const isCategory = (value: unknown): value is Category => CATEGORIES.some((category) => category.id === value);

// La musique l'emporte (une bande originale reste de la musique) ; une carte pas encore classée tombe dans « Autre ».
export function categoryOf(kinds: CardKinds | undefined): Category {
  if (musicKindOf(kinds)) return 'music';
  if (kinds?.natures.some((id) => SCREEN.has(id))) return 'film';
  return 'other';
}
