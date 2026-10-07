import { createMemoryStore } from '../core/cache/store';
import type { GameDetail } from '../core/game/game-detail';
import { createGameChoiceRepo } from '../core/game/game-repo';
import { createGameService } from './game-service';

export const DEMO_GAME_SLUG = 'demo-jeu';
export const DEMO_GAME_TITLE = 'Exemple de jeu';

// Données figées d'un jeu fictif : la fiche de démonstration ne demande rien à Steam ni à IGDB.
const DETAIL: GameDetail = {
  source: 'steam',
  id: 1,
  title: DEMO_GAME_TITLE,
  year: 2024,
  summary: 'Un jeu d’aventure imaginaire, uniquement là pour montrer à quoi ressemble la section.',
  genres: ['Action', 'Aventure'],
  platforms: ['Windows', 'Mac'],
  developers: ['Studio Exemple'],
  releaseDate: '12 mars 2024',
  rating: { kind: 'positive', value: 94, count: 18_240, verdict: 'Très positives' },
  price: '19,99 €',
  playersOnline: 12_450,
  pageUrl: 'https://store.steampowered.com/',
};

export type GameServiceLike = ReturnType<typeof createGameService>;

// Le vrai service de jeux, branché sur de fausses dépendances : aucune requête réseau, des mémoires en RAM
// (le choix d'un jeu dans la démo disparaît avec elle), rien d'écrit dans la Collection ni dans le stockage.
export function createDemoGameService(): GameServiceLike {
  const choices = createGameChoiceRepo(createMemoryStore());
  const direct = { getOrLoad: <T>(_key: string, load: () => Promise<T>): Promise<T> => load() };
  return createGameService({
    collection: { list: async () => [{ slug: DEMO_GAME_SLUG, title: DEMO_GAME_TITLE }] },
    kinds: {
      resolveMissing: async () => undefined,
      load: async () => ({ cards: { [DEMO_GAME_SLUG]: { natures: ['Q7889'], occupations: [], genres: [] } }, labels: {} }),
    },
    games: { resolve: async () => ({ [DEMO_GAME_SLUG]: { steamId: DETAIL.id } }) },
    choices,
    steam: { detail: async () => DETAIL, search: async () => [] },
    igdb: null,
    steamCache: direct,
    igdbCache: direct,
  });
}
