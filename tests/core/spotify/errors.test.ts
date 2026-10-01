import { describe, expect, it } from 'vitest';
import { SpotifyError, userMessage } from '../../../src/core/spotify/errors';

describe('userMessage', () => {
  it('donne un message clair par cas', () => {
    expect(userMessage(new SpotifyError('no-device', 'x'))).toBe("Ouvre Spotify sur un de tes appareils, puis réessaie.");
    expect(userMessage(new SpotifyError('not-premium', 'x'))).toBe('Spotify Premium est nécessaire pour lancer la lecture.');
    expect(userMessage(new SpotifyError('not-linked', 'x'))).toBe('Lie ton compte Spotify pour écouter.');
    expect(userMessage(new SpotifyError('rate-limited', 'x', 3000))).toBe('Spotify demande de patienter un instant. Réessaie dans quelques secondes.');
    expect(userMessage(new SpotifyError('auth-cancelled', 'x'))).toBe('Liaison Spotify annulée.');
    expect(userMessage(new SpotifyError('http', 'x'))).toBe('Spotify est indisponible pour le moment.');
    expect(userMessage(new Error('boom'))).toBe('Spotify est indisponible pour le moment.');
  });
});
