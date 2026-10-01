import { useEffect, useState, useSyncExternalStore } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { getMusicService, getPlayerSource } from './music-registry';
import type { PlayerView } from './player-source';

const NO_PLAYER: PlayerView = { linked: false, track: null, hidden: false, enabled: true };
const NONE: ReadonlySet<string> = new Set();
const noSubscribe = () => () => undefined;
const noPlayer = () => NO_PLAYER;

// Les cartes (parmi `cards`) dont un titre joue en ce moment sur Spotify ; rien en pause ou sans Spotify lié.
export function useNowPlayingSlugs(cards: Pick<KnownCard, 'slug' | 'title'>[]): ReadonlySet<string> {
  const source = getPlayerSource();
  const player = useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.current ?? noPlayer);
  const [slugs, setSlugs] = useState<ReadonlySet<string>>(NONE);
  const track = player.linked && player.track?.playing ? player.track : null;
  // L'état du lecteur est relu toutes les 5 s : seuls un autre titre ou d'autres cartes relancent la recherche.
  const key = `${track?.uri ?? ''}|${cards.map((card) => card.slug).join(',')}`;

  useEffect(() => {
    const service = getMusicService();
    if (!service || !track) {
      setSlugs(NONE);
      return;
    }
    let cancelled = false;
    void service
      .playingSlugs(cards, track)
      .then((found) => !cancelled && setSlugs(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `key` résume `track` et `cards`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return slugs;
}
