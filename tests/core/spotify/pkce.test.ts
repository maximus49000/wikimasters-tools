import { describe, expect, it } from 'vitest';
import { SpotifyError } from '../../../src/core/spotify/errors';
import { buildAuthUrl, challengeOf, parseRedirect, randomString } from '../../../src/core/spotify/pkce';

describe('pkce', () => {
  it('calcule le défi S256 du vecteur de la RFC 7636', async () => {
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('génère une chaîne aléatoire de la longueur demandée, sans caractère interdit', () => {
    const value = randomString(64);
    expect(value).toHaveLength(64);
    expect(value).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(randomString(64)).not.toBe(value);
  });

  it("construit l'URL d'autorisation PKCE", () => {
    const url = new URL(
      buildAuthUrl({ clientId: 'abc', redirectUri: 'wikimasterstools://spotify', state: 's1', challenge: 'ch', scopes: ['a', 'b'] }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'abc',
      response_type: 'code',
      redirect_uri: 'wikimasterstools://spotify',
      state: 's1',
      scope: 'a b',
      code_challenge_method: 'S256',
      code_challenge: 'ch',
    });
  });

  it("lit le code de l'URL de retour", () => {
    expect(parseRedirect('wikimasterstools://spotify?code=XYZ&state=s1', 's1')).toBe('XYZ');
    expect(parseRedirect('https://abc.chromiumapp.org/?state=s1&code=Q', 's1')).toBe('Q');
  });

  it('refuse un refus, un état différent ou une URL sans code', () => {
    for (const url of [
      'wikimasterstools://spotify?error=access_denied&state=s1',
      'wikimasterstools://spotify?code=XYZ&state=autre',
      'wikimasterstools://spotify?state=s1',
      'pas une url',
    ]) {
      expect(() => parseRedirect(url, 's1')).toThrowError(SpotifyError);
    }
  });
});
