import { describe, expect, it } from 'vitest';
import { TIDAL_ANDROID_REDIRECT_URI, TIDAL_CLIENT_ID, TIDAL_SCOPES, countryOf } from '../../../src/core/tidal/config';
import { TidalError, tidalMessage } from '../../../src/core/tidal/errors';

describe('config Tidal', () => {
  it("n'expose que l'identifiant public et le scope de recherche", () => {
    expect(TIDAL_CLIENT_ID).toBe('Js7eZgbN3qENNo9e');
    expect(TIDAL_SCOPES).toEqual(['search.read']);
    expect(TIDAL_ANDROID_REDIRECT_URI).toBe('wikimasterstools://tidal');
  });

  it("prend le pays de la langue de l'appareil, FR à défaut", () => {
    expect(countryOf('fr-FR')).toBe('FR');
    expect(countryOf('en-GB')).toBe('GB');
    expect(countryOf('pt_br')).toBe('BR');
    expect(countryOf('en')).toBe('FR');
    expect(countryOf(undefined)).toBe('FR');
  });
});

describe('tidalMessage', () => {
  it('parle de Tidal, jamais de Spotify', () => {
    expect(tidalMessage(new TidalError('not-linked', 'x'))).toBe('Lie ton compte Tidal pour écouter.');
    expect(tidalMessage(new TidalError('rate-limited', 'x', 3_000))).toContain('Tidal demande de patienter');
    expect(tidalMessage(new TidalError('auth-cancelled', 'x'))).toBe('Liaison Tidal annulée.');
    expect(tidalMessage(new TidalError('http', 'x'))).toBe('Tidal est indisponible pour le moment.');
    expect(tidalMessage(new Error('inconnue'))).toBe('Tidal est indisponible pour le moment.');
  });
});
