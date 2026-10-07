export type BookErrorCode = 'not-found' | 'rate-limited' | 'http';

export class BookError extends Error {
  constructor(
    readonly code: BookErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BookError';
  }
}

export function bookErrorMessage(error: unknown): string {
  if (!(error instanceof BookError)) return 'Les informations du livre sont indisponibles pour le moment.';
  if (error.code === 'rate-limited') return 'Open Library demande de patienter un instant. Réessaie dans quelques secondes.';
  if (error.code === 'not-found') return 'Introuvable sur Open Library.';
  return 'Open Library est indisponible pour le moment.';
}
