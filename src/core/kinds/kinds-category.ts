import { isBookCard } from '../book/book-kinds';
import { musicKindOf } from '../music/music-kinds';
import type { CardKinds } from './wikidata-kinds';

export type Category = 'music' | 'film' | 'games' | 'books' | 'other';

// Ordre d'affichage de la liste « Catégorie ».
export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'music', label: 'Musique' },
  { id: 'film', label: 'Films / Série' },
  { id: 'games', label: 'Jeux' },
  { id: 'books', label: 'Livres' },
  { id: 'other', label: 'Autre' },
];

// Film, court métrage, film d'animation, documentaire, saga ; série télévisée, mini-série, série d'animation, programme de télévision.
const SCREEN = new Set(['Q11424', 'Q24862', 'Q202866', 'Q93204', 'Q24856', 'Q5398426', 'Q1259759', 'Q581714', 'Q15416']);

// Jeu vidéo ; jeu de société, de plateau (tabletop), de stratégie abstrait, traditionnel, de fête ; jeu de cartes, de cartes à collectionner ;
// jeu de dés ; jeu de rôle sur table ; jeu de figurines, wargame.
const GAMES = new Set(['Q7889', 'Q131436', 'Q3244175', 'Q573573', 'Q676977', 'Q839864', 'Q142714', 'Q734698', 'Q1515156', 'Q1643932', 'Q532716', 'Q1501543']);

export const isCategory = (value: unknown): value is Category => CATEGORIES.some((category) => category.id === value);

// La musique l'emporte (une bande originale reste de la musique), puis le cinéma, puis les jeux, puis les livres ; une carte pas encore classée tombe dans « Autre ».
export function categoryOf(kinds: CardKinds | undefined): Category {
  if (musicKindOf(kinds)) return 'music';
  if (kinds?.natures.some((id) => SCREEN.has(id))) return 'film';
  if (kinds?.natures.some((id) => GAMES.has(id))) return 'games';
  if (isBookCard(kinds)) return 'books';
  return 'other';
}
