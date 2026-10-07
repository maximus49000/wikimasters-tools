import type { KnownCard } from './collection-book';

// Filtres que l'on sait appliquer sans requête, à partir des cartes déjà scannées.
const LOCAL_PARAMS = ['rarity', 'tag_id'];

// Les cartes qui passent `filter` (« rarity=UR&tag_id=… »), ou `null` si on ne peut pas le savoir sans
// interroger le site : filtre inconnu (recherche, « sans étiquette »…), étiquette jamais vue, ou cartes
// scannées avant que les étiquettes soient lues.
export function filterLocally(cards: KnownCard[], filter: string): Set<string> | null {
  const params = new URLSearchParams(filter);
  const keys = [...params.keys()];
  if (keys.length === 0 || !keys.every((key) => LOCAL_PARAMS.includes(key))) return null;
  if (cards.some((card) => card.tags === undefined)) return null;
  const rarities = params.getAll('rarity');
  const tagId = params.get('tag_id');
  if (tagId && !cards.some((card) => card.tags?.some((tag) => tag.id === tagId))) return null;
  return new Set(
    cards
      .filter((card) => (rarities.length === 0 || rarities.includes(card.rarity)) && (!tagId || card.tags?.some((tag) => tag.id === tagId)))
      .map((card) => card.slug),
  );
}
