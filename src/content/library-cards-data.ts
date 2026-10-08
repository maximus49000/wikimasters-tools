import { useEffect, useMemo, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_KINDS, type KindsState } from '../core/kinds/kinds-book';
import { categoryOf, type Category } from '../core/kinds/kinds-category';
import type { KindsRepo } from '../core/kinds/kinds-repo';

export type RoomCards = { list: KnownCard[]; cards: Record<string, { title: string; imageUrl?: string }>; categoryOf: (slug: string) => Category };

// Cartes de la Collection (tenues à jour) et catégorie de chacune, pour dessiner les objets et proposer le sélecteur.
export function useRoomCards(collection?: CollectionRepo, kinds?: KindsRepo): RoomCards {
  const [list, setList] = useState<KnownCard[]>([]);
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

  const cards = useMemo(() => Object.fromEntries(list.map((card) => [card.slug, { title: card.title, ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}) }])), [list]);
  const category = useMemo(() => (slug: string): Category => categoryOf(kindsState.cards[slug]), [kindsState]);
  return { list, cards, categoryOf: category };
}
