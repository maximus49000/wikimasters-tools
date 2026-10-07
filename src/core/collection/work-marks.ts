import type { MediaType } from '../screen/tmdb-api';
import type { ScreenState } from '../screen/screen-repo';
import type { KnownCard } from './collection-book';

// Les films et séries dont on possède la carte, par identifiant TMDB (même principe que les identifiants de `screen-v1`).
export type ScreenOwnership = { movie: ReadonlyMap<number, KnownCard>; tv: ReadonlyMap<number, KnownCard> };

export const EMPTY_OWNERSHIP: ScreenOwnership = { movie: new Map(), tv: new Map() };

// Une carte sans exemplaire (vendue, échangée) n'est pas possédée ; un nombre inconnu compte comme possédée.
export function screenOwnership(cards: readonly KnownCard[], screen: ScreenState): ScreenOwnership {
  const movie = new Map<number, KnownCard>();
  const tv = new Map<number, KnownCard>();
  for (const card of cards) {
    if (card.copies !== undefined && card.copies <= 0) continue;
    const ids = screen[card.slug];
    if (!ids) continue;
    if (ids.movieId !== undefined && !movie.has(ids.movieId)) movie.set(ids.movieId, card);
    if (ids.tvId !== undefined && !tv.has(ids.tvId)) tv.set(ids.tvId, card);
  }
  return { movie, tv };
}

export const ownedCardOf = (ownership: ScreenOwnership, mediaType: MediaType, id: number): KnownCard | undefined =>
  (mediaType === 'movie' ? ownership.movie : ownership.tv).get(id);

// Empreinte de ce que l'affichage montre (carte, rareté, exemplaires, image) : un nouvel objet n'est publié que si elle change.
export function ownershipSignature(ownership: ScreenOwnership): string {
  const part = (kind: string, map: ReadonlyMap<number, KnownCard>) =>
    [...map].map(([id, card]) => `${kind}${id}:${card.slug}:${card.rarity ?? ''}:${card.copies ?? ''}:${card.imageUrl ?? ''}`);
  return [...part('m', ownership.movie), ...part('t', ownership.tv)].join('|');
}

const RARITY_NAMES: Record<string, string> = { L: 'Légendaire', UR: 'Ultra rare', SR: 'Super rare', R: 'Rare', PC: 'Peu commune', C: 'Commune' };

export const rarityName = (rarity: string | undefined): string | undefined => (rarity ? (RARITY_NAMES[rarity] ?? rarity) : undefined);
