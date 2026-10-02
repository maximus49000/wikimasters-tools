// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMusicService } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import { SoundtrackButton } from '../../src/content/SoundtrackButton';
import type { Listen } from '../../src/core/music/listen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const detail = { mediaType: 'movie', id: 27205, title: 'Inception' } as const;
const album = { name: 'Inception (Original Motion Picture Soundtrack)', artist: 'Hans Zimmer' };
const spotify: Listen = { kind: 'album', items: [{ uri: 'spotify:track:1', title: 'Dream', artist: 'Hans Zimmer' }], albumUri: 'spotify:album:OST', album };
const tidal: Listen = { kind: 'album', items: [], albumUri: 'tidal:album:123', album };

async function show(listen: Listen | null, play = vi.fn(async () => null as string | null)) {
  const soundtrack = vi.fn(async () => listen);
  setMusicService({ soundtrack, play, subscribe: () => () => undefined } as unknown as MusicService);
  await act(async () => root.render(<SoundtrackButton detail={detail} />));
  return { soundtrack, play };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
});

describe('SoundtrackButton', () => {
  it("Spotify : un bouton avec l'album et l'artiste, qui lance l'album au clic", async () => {
    const { soundtrack, play } = await show(spotify);
    expect(soundtrack).toHaveBeenCalledWith('movie:27205', ['Inception']);
    expect(container.textContent).toContain(album.name);
    expect(container.textContent).toContain('Hans Zimmer');
    await act(async () => container.querySelector('button')!.click());
    expect(play).toHaveBeenCalledWith(spotify.items[0], spotify);
  });

  it('Tidal : un lien vers la page Tidal de l’album, sans lecture', async () => {
    const { play } = await show(tidal);
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://tidal.com/browse/album/123');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('button')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('rien quand aucune BO n’est trouvée', async () => {
    await show(null);
    expect(container.textContent).toBe('');
  });

  it('affiche le message quand la lecture échoue', async () => {
    await show(spotify, vi.fn(async () => 'Aucun appareil Spotify actif.'));
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('Aucun appareil Spotify actif.');
  });
});
