import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import type { Listen } from '../../../src/core/music/listen';
import { createListenRepo } from '../../../src/core/music/listen-repo';

const DAY = 24 * 3_600_000;
const album: Listen = { kind: 'album', items: [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }], albumUri: 'spotify:album:AAA' };
const artist: Listen = { kind: 'artist', items: [{ uri: 'spotify:track:2', title: 'Yesterday', artist: 'The Beatles' }] };

describe('createListenRepo', () => {
  it("garde une liste trouvée d'une session à l'autre, sans date limite", async () => {
    const store = createMemoryStore();
    await createListenRepo(store, () => 0).save('Abbey_Road', album);
    const later = createListenRepo(store, () => 10 * 365 * DAY);
    expect((await later.load()).get('Abbey_Road')).toEqual(album);
  });

  it('garde « rien trouvé » 30 jours, puis le fait oublier pour redemander à Spotify', async () => {
    const store = createMemoryStore();
    await createListenRepo(store, () => 1_000).save('Inconnu', null);
    const before = await createListenRepo(store, () => 1_000 + 30 * DAY - 1).load();
    expect(before.has('Inconnu')).toBe(true);
    expect(before.get('Inconnu')).toBeNull();
    expect((await createListenRepo(store, () => 1_000 + 30 * DAY).load()).has('Inconnu')).toBe(false);
  });

  it("une nouvelle réponse remplace la précédente (bouton d'actualisation)", async () => {
    const repo = createListenRepo(createMemoryStore());
    await repo.save('The_Beatles', artist);
    const fresher: Listen = { kind: 'artist', items: [{ uri: 'spotify:track:3', title: 'Help!', artist: 'The Beatles' }] };
    await repo.save('The_Beatles', fresher);
    expect((await repo.load()).get('The_Beatles')).toEqual(fresher);
  });

  it('ne perd aucune liste quand plusieurs cartes enregistrent en même temps', async () => {
    const repo = createListenRepo(createMemoryStore());
    await Promise.all([repo.save('A', album), repo.save('B', artist), repo.save('C', null)]);
    const state = await repo.load();
    expect([...state.keys()].sort()).toEqual(['A', 'B', 'C']);
  });

  it('deux dépôts de clés différentes ne se mélangent pas et se conservent côte à côte', async () => {
    const store = createMemoryStore();
    const spotify = createListenRepo(store);
    const tidal = createListenRepo(store, () => Date.now(), 'listens-tidal-v1');
    await spotify.save('Abbey_Road', album);
    expect((await tidal.load()).has('Abbey_Road')).toBe(false);
    await tidal.save('Abbey_Road', artist);
    expect((await spotify.load()).get('Abbey_Road')).toEqual(album);
    expect((await tidal.load()).get('Abbey_Road')).toEqual(artist);
    expect(await store.get('listens-v1')).toBeTruthy();
    expect(await store.get('listens-tidal-v1')).toBeTruthy();
  });

  it("ne confond pas un nom d'article avec une propriété d'objet", async () => {
    const repo = createListenRepo(createMemoryStore());
    expect((await repo.load()).has('constructor')).toBe(false);
    await repo.save('constructor', album);
    expect((await repo.load()).get('constructor')).toEqual(album);
  });
});
