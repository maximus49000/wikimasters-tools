import type { GameSource } from './game-detail';

export type GameErrorCode = 'auth' | 'not-found' | 'rate-limited' | 'http';

export class GameError extends Error {
  constructor(
    readonly source: GameSource,
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

const NAMES: Record<GameSource, string> = { steam: 'Steam', igdb: 'IGDB' };

export function gameErrorMessage(error: unknown): string {
  if (!(error instanceof GameError)) return 'Les informations du jeu sont indisponibles pour le moment.';
  const name = NAMES[error.source];
  if (error.code === 'rate-limited') return `${name} demande de patienter un instant. Réessaie dans quelques secondes.`;
  if (error.code === 'auth') return `L'accès à ${name} est refusé.`;
  if (error.code === 'not-found') return `Introuvable sur ${name}.`;
  return `${name} est indisponible pour le moment.`;
}
