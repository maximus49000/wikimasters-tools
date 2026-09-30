import { toPurchaseModel, type PurchaseModel } from '../pricing/badge';
import type { PriceBookEntry } from '../pricing/price-book';
import type { CardTag, KnownCard } from './collection-book';

export type CardPreview = {
  title: string;
  rarity: string | null;
  imageUrl: string | null;
  extract: string | null;
  attack: number | null;
  defense: number | null;
  tags: CardTag[];
  purchase: PurchaseModel | null;
};

// Ce qu'affiche l'aperçu d'une carte : la carte du jeu, avec notre pastille de prix quand un achat est connu.
export function toCardPreview(
  card: KnownCard,
  entry: Pick<PriceBookEntry, 'rarity' | 'purchase'> | null,
): CardPreview {
  return {
    title: card.title,
    rarity: card.rarity ?? entry?.rarity ?? null,
    imageUrl: card.imageUrl ?? null,
    extract: card.extract ?? null,
    attack: card.attack ?? null,
    defense: card.defense ?? null,
    tags: card.tags ?? [],
    purchase: toPurchaseModel(entry?.purchase ?? null),
  };
}
