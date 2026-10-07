import type { KnownCard } from '../core/collection/collection-book';
import type { CardKind } from '../core/whats-new/types';
import type { TourOrigin } from './tour-session';

// Ce que la visite guidée emprunte à la surcouche : les cartes de la Collection, l'ouverture d'une fiche, sa fermeture.
export type TourEnv = {
  cards(): Promise<KnownCard[]>;
  pick(kind: CardKind, cards: KnownCard[]): Promise<KnownCard | null>;
  openCard(slug: string): void;
  closeCard(): void;
  // Rouvre l'interface qui a lancé la visite (WikiHow ou la liste « Quoi de neuf »).
  reopen(from: TourOrigin): void;
};

// Créé une fois par la surcouche ; le contrôleur de visite le lit ici.
let env: TourEnv | null = null;

export const setTourEnv = (next: TourEnv | null): void => {
  env = next;
};
export const getTourEnv = (): TourEnv | null => env;
