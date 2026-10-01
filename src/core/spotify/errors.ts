export type SpotifyErrorCode = 'not-linked' | 'no-device' | 'not-premium' | 'rate-limited' | 'auth-cancelled' | 'http';

export class SpotifyError extends Error {
  constructor(
    readonly code: SpotifyErrorCode,
    message: string,
    // Pour `rate-limited` : durée demandée par Spotify (Retry-After).
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

const MESSAGES: Record<SpotifyErrorCode, string> = {
  'no-device': 'Ouvre Spotify sur un de tes appareils, puis réessaie.',
  'not-premium': 'Spotify Premium est nécessaire pour lancer la lecture.',
  'not-linked': 'Lie ton compte Spotify pour écouter.',
  'rate-limited': 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.',
  'auth-cancelled': 'Liaison Spotify annulée.',
  http: 'Spotify est indisponible pour le moment.',
};

export function userMessage(error: unknown): string {
  return error instanceof SpotifyError ? MESSAGES[error.code] : MESSAGES.http;
}
