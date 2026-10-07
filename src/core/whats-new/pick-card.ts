import type { KnownCard } from '../collection/collection-book';
import type { CardKind } from './types';

export const PICK_LIMIT = 300;

// La première carte de la Collection (dans son ordre) qui convient à la nature demandée ; `any` prend la première carte.
export async function pickCard(
  kind: CardKind,
  cards: KnownCard[],
  slugsOf: (kind: Exclude<CardKind, 'any'>, cards: KnownCard[]) => Promise<Set<string>>,
): Promise<KnownCard | null> {
  const candidates = cards.slice(0, PICK_LIMIT);
  if (kind === 'any') return candidates[0] ?? null;
  if (candidates.length === 0) return null;
  const slugs = await slugsOf(kind, candidates);
  return candidates.find((card) => slugs.has(card.slug)) ?? null;
}
