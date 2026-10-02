import { useEffect, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { getScreenService } from './screen-registry';

const NONE: ReadonlySet<string> = new Set();

// Les cartes (parmi `cards`) liées au cinéma : elles portent la bobine de cinéma.
export function useScreenSlugs(cards: Pick<KnownCard, 'slug'>[]): ReadonlySet<string> {
  const [slugs, setSlugs] = useState<ReadonlySet<string>>(NONE);
  const key = cards.map((card) => card.slug).join(',');

  useEffect(() => {
    const service = getScreenService();
    if (!service || cards.length === 0) {
      setSlugs(NONE);
      return;
    }
    let cancelled = false;
    void service
      .screenSlugs(cards)
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
