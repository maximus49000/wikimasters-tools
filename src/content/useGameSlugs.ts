import { useEffect, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { getGameService } from './game-registry';

const NONE: ReadonlySet<string> = new Set();

// Les cartes (parmi `cards`) qui sont des jeux vidéo : elles portent la manette.
export function useGameSlugs(cards: Pick<KnownCard, 'slug'>[]): ReadonlySet<string> {
  const [slugs, setSlugs] = useState<ReadonlySet<string>>(NONE);
  const key = cards.map((card) => card.slug).join(',');

  useEffect(() => {
    const service = getGameService();
    if (!service || cards.length === 0) {
      setSlugs(NONE);
      return;
    }
    let cancelled = false;
    void service
      .gameSlugs(cards)
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
