// Les plateformes d'écoute des cartes musique ; une seule est active à la fois, leurs résultats ne se mélangent jamais.
export type Platform = 'spotify' | 'tidal';

export const PLATFORM_LABEL: Record<Platform, string> = { spotify: 'Spotify', tidal: 'Tidal' };

const KEY = 'wmt:musicPlatform';

export type PlatformSetting = {
  current(): Platform;
  set(next: Platform): void;
  subscribe(listener: () => void): () => void;
};

export function createPlatformSetting(storage: Pick<Storage, 'getItem' | 'setItem'>): PlatformSetting {
  const listeners = new Set<() => void>();
  let current: Platform = 'spotify';
  try {
    const stored = storage.getItem(KEY);
    if (stored === 'spotify' || stored === 'tidal') current = stored;
  } catch {
    // Stockage inaccessible : Spotify.
  }
  return {
    current: () => current,
    set(next) {
      if (next === current) return;
      current = next;
      try {
        storage.setItem(KEY, next);
      } catch {
        // Le choix vaut pour cette page seulement.
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
