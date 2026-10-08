import { afterEach, describe, expect, it } from 'vitest';
import { getSpotifyKey, setSpotifyKey, type SpotifyKeyControl } from '../../src/content/music-registry';

afterEach(() => setSpotifyKey(null));

describe('contrôle de la clé Spotify', () => {
  it('est absent par défaut, puis lu là où il est enregistré', () => {
    expect(getSpotifyKey()).toBeNull();
    const control = {} as SpotifyKeyControl;
    setSpotifyKey(control);
    expect(getSpotifyKey()).toBe(control);
  });
});
