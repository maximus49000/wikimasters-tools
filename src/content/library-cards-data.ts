import { useEffect, useMemo, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_KINDS, type KindsState } from '../core/kinds/kinds-book';
import { categoryOf, type Category } from '../core/kinds/kinds-category';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { LibraryRepo, RoomCardData, RoomCardsData } from '../core/library/library-repo';
import { placedSlugs } from '../core/library/room-grid';

export type RoomCards = { list: KnownCard[]; cards: RoomCardsData; categoryOf: (slug: string) => Category };

// Ce que la fiche de « Ma Pièce » affiche d'une carte : copié pour ne plus dépendre de la Collection.
function dataOf(card: KnownCard): RoomCardData {
  return {
    title: card.title,
    ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
    ...(card.rarity ? { rarity: card.rarity } : {}),
    ...(card.extract ? { extract: card.extract } : {}),
    ...(card.attack !== undefined ? { attack: card.attack } : {}),
    ...(card.defense !== undefined ? { defense: card.defense } : {}),
    ...(card.tags && card.tags.length > 0 ? { tags: card.tags } : {}),
  };
}

// Cartes de la Collection (tenues à jour) et catégorie de chacune, pour dessiner les objets et proposer le sélecteur.
export function useRoomCards(collection?: CollectionRepo, kinds?: KindsRepo, library?: LibraryRepo): RoomCards {
  const [list, setList] = useState<KnownCard[]>([]);
  const [saved, setSaved] = useState<RoomCardsData>({});
  const [kindsState, setKindsState] = useState<KindsState>(EMPTY_KINDS);

  useEffect(() => {
    if (!collection) return;
    let alive = true;
    const load = () => void collection.list().then((cards) => alive && setList(cards));
    load();
    const off = collection.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [collection]);

  // Copie des cartes posées : la pièce reste dessinée même si la Collection n'a pas (ou plus) ces cartes.
  useEffect(() => {
    if (!library) return;
    let alive = true;
    void library.loadCards().then((cards) => alive && setSaved(cards));
    return () => {
      alive = false;
    };
  }, [library]);

  useEffect(() => {
    if (!library || list.length === 0) return;
    const sync = (): void => {
      const state = library.current();
      if (!state) return;
      const placed = new Set<string>();
      for (const room of state.rooms) for (const slug of placedSlugs(room.layout)) placed.add(slug);
      const fresh: RoomCardsData = {};
      for (const card of list) if (placed.has(card.slug)) fresh[card.slug] = dataOf(card);
      if (Object.keys(fresh).length === 0) return;
      void library.saveCards(fresh).then((changed) => (changed ? library.loadCards().then(setSaved) : undefined));
    };
    sync();
    return library.subscribe(sync);
  }, [library, list]);

  useEffect(() => {
    if (!kinds) return;
    let alive = true;
    const load = () => void kinds.load().then((state) => alive && setKindsState(state));
    load();
    const off = kinds.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [kinds]);

  const cards = useMemo(() => ({ ...saved, ...Object.fromEntries(list.map((card) => [card.slug, { ...saved[card.slug], ...dataOf(card) }])) }), [list, saved]);
  const category = useMemo(() => (slug: string): Category => categoryOf(kindsState.cards[slug]), [kindsState]);
  return { list, cards, categoryOf: category };
}
