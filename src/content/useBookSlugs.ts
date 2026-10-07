import { useEffect, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { getBookService } from './book-registry';

const NONE: ReadonlySet<string> = new Set();

// Les cartes (parmi `cards`) qui sont des livres : elles portent le glyphe livre.
export function useBookSlugs(cards: Pick<KnownCard, 'slug'>[]): ReadonlySet<string> {
  const [slugs, setSlugs] = useState<ReadonlySet<string>>(NONE);
  const key = cards.map((card) => card.slug).join(',');

  useEffect(() => {
    const service = getBookService();
    if (!service || cards.length === 0) {
      setSlugs(NONE);
      return;
    }
    let cancelled = false;
    void service
      .bookSlugs(cards)
      .then((found) => !cancelled && setSlugs(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `key` résume `cards`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return slugs;
}
