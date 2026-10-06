export type GameSource = 'steam' | 'igdb';
export type GameRef = { source: GameSource; id: number };
// Choix de l'utilisateur pour une carte : un jeu précis, ou « aucun jeu ».
export type GameChoice = GameRef | { none: true };

export type GameTrailer = { kind: 'hls'; url: string; poster?: string } | { kind: 'youtube'; key: string };
// `positive` : pourcentage d'avis positifs (Steam) ; `score` : note sur 100 (IGDB).
export type GameRating = { kind: 'positive' | 'score'; value: number; count: number; verdict?: string };

export type GameDetail = {
  source: GameSource;
  id: number;
  title: string;
  originalTitle?: string;
  year?: number;
  summary?: string;
  genres: string[];
  platforms: string[];
  developers: string[];
  releaseDate?: string;
  rating?: GameRating;
  metascore?: { score: number; url?: string };
  price?: string;
  playersOnline?: number;
  trailer?: GameTrailer;
  coverUrl?: string;
  pageUrl: string;
};

// Un résultat de recherche (propositions de la fenêtre « Changer de jeu » et résolution par titre).
export type GameCandidate = { source: GameSource; id: number; title: string; year?: number; platforms: string[]; imageUrl?: string; popularity: number };

export type GameRequestInit = { method?: string; headers?: Record<string, string>; body?: string };
export type GameFetch = (url: string, init?: GameRequestInit) => Promise<Response>;
