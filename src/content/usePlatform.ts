import { useSyncExternalStore } from 'react';
import type { Platform } from '../core/music/platform';
import { getPlatformChoice } from './music-registry';

const noSubscribe = () => () => undefined;
const spotifyOnly = (): Platform => 'spotify';

// La plateforme d'écoute choisie ; une plateforme indisponible (Tidal a échoué au démarrage) retombe sur Spotify.
export function usePlatform(): Platform {
  const choice = getPlatformChoice();
  const snapshot = choice
    ? (): Platform => {
        const current = choice.setting.current();
        return choice.available.includes(current) ? current : 'spotify';
      }
    : spotifyOnly;
  return useSyncExternalStore(choice?.setting.subscribe ?? noSubscribe, snapshot);
}
