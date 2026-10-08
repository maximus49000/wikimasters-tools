import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { CLIENT_ID_KEY, LEGACY_SPOTIFY_CLIENT_ID, SESSION_KEY } from '../../../src/core/spotify/config';
import { migrateClientId, normalizeClientId } from '../../../src/core/spotify/client-id';
import { SpotifyError, userMessage } from '../../../src/core/spotify/errors';

const tokens = { accessToken: 'A', refreshToken: 'R', expiresAt: 1 };

describe('normalizeClientId', () => {
  it('accepte 32 caractères hexadécimaux, en ignorant espaces et majuscules', () => {
    expect(normalizeClientId('  30D88341188741668651E8AB170849CB \n')).toBe('30d88341188741668651e8ab170849cb');
  });
  it('refuse tout le reste', () => {
    for (const bad of ['', 'abc', '30d88341188741668651e8ab170849c', '30d88341188741668651e8ab170849cbb', 'g0d88341188741668651e8ab170849cb']) {
      expect(normalizeClientId(bad), bad).toBeNull();
    }
  });
});

describe('migrateClientId', () => {
  it('compte lié sans clé : garde l’ancien identifiant', async () => {
    const store = createMemoryStore();
    await store.set(SESSION_KEY, tokens);
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBe(LEGACY_SPOTIFY_CLIENT_ID);
  });
  it('nouvelle installation ou compte délié : aucune clé', async () => {
    const store = createMemoryStore();
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBeUndefined();
    await store.set(SESSION_KEY, null);
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBeUndefined();
  });
  it('ne remplace jamais une clé déjà enregistrée, et se répète sans effet', async () => {
    const store = createMemoryStore();
    await store.set(SESSION_KEY, tokens);
    await store.set(CLIENT_ID_KEY, 'a'.repeat(32));
    await migrateClientId(store);
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBe('a'.repeat(32));
  });
});

describe('no-client-id', () => {
  it('a un message qui invite à ajouter sa clé', () => {
    expect(userMessage(new SpotifyError('no-client-id', 'x'))).toBe('Ajoute ta clé Spotify pour lier ton compte.');
  });
});
