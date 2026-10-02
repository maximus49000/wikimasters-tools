export type TidalErrorCode = 'not-linked' | 'rate-limited' | 'auth-cancelled' | 'http';

export class TidalError extends Error {
  constructor(
    readonly code: TidalErrorCode,
    message: string,
    // Pour `rate-limited` : durée de la pause restante au moment de l'erreur.
    readonly retryAfterMs?: number,
    // Pour `rate-limited` : heure (ms, absolue) à laquelle les appels pourront reprendre.
    readonly retryAt?: number,
  ) {
    super(message);
    this.name = 'TidalError';
  }
}

const MESSAGES: Record<TidalErrorCode, string> = {
  'not-linked': 'Lie ton compte Tidal pour écouter.',
  'rate-limited': 'Tidal demande de patienter un instant. Réessaie dans quelques secondes.',
  'auth-cancelled': 'Liaison Tidal annulée.',
  http: 'Tidal est indisponible pour le moment.',
};

export const tidalMessage = (error: unknown): string => (error instanceof TidalError ? MESSAGES[error.code] : MESSAGES.http);
