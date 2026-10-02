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

const playlist: Listen = { kind: 'album', items: [], albumUri: 'spotify:playlist:P1', album: { name: 'BO Nos jours Heureux', artist: 'Léa Hautier' } };

async function show(listen: Listen | null, play = vi.fn(async () => null as string | null), extra: Record<string, unknown> = {}, linked = true) {
  const soundtrack = vi.fn(async () => listen);
  const service = { soundtrack, play, isLinked: async () => linked, manualSoundtrack: true, subscribe: () => () => undefined, ...extra };
  setMusicService(service as unknown as MusicService);
  await act(async () => root.render(<SoundtrackButton detail={detail} />));
  return { soundtrack, play };
}

const byLabel = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const click = (element: HTMLElement) => act(async () => element.click());
const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

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
    await click(container.querySelector<HTMLElement>('button[aria-label^="Écouter"]')!);
    expect(play).toHaveBeenCalledWith(spotify.items[0], spotify);
  });

  it('Tidal : un lien vers la page Tidal de l’album, sans lecture', async () => {
    const { play } = await show(tidal);
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://tidal.com/browse/album/123');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('button[aria-label^="Écouter"]')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('aucune BO trouvée : seul le bouton de réglage, sans ligne de lecture', async () => {
    await show(null);
    expect(container.textContent).toContain('Pas de bande originale');
    expect(container.querySelector('button[aria-label^="Écouter"]')).toBeNull();
    expect(byLabel('Régler la bande originale')).not.toBeNull();
  });

  it('rien sans compte lié', async () => {
    const { soundtrack } = await show(spotify, undefined, {}, false);
    expect(container.textContent).toBe('');
    expect(soundtrack).not.toHaveBeenCalled();
  });

  it('une playlist se lance par son contexte (sans piste)', async () => {
    const { play } = await show(playlist);
    await click(container.querySelector<HTMLElement>('button[aria-label^="Écouter"]')!);
    expect(play).toHaveBeenCalledWith(null, playlist);
  });

  it('affiche le message quand la lecture échoue', async () => {
    await show(spotify, vi.fn(async () => 'Aucun appareil Spotify actif.'));
    await click(container.querySelector<HTMLElement>('button[aria-label^="Écouter"]')!);
    expect(container.textContent).toContain('Aucun appareil Spotify actif.');
  });
});

describe('SoundtrackButton : réglage', () => {
  it('Auto : « Relancer la recherche » remplace la BO affichée', async () => {
    const refreshSoundtrack = vi.fn(async () => ({ listen: spotify }));
    await show(null, undefined, { refreshSoundtrack });
    await click(byLabel('Régler la bande originale'));
    await click(byLabel('Relancer la recherche'));
    expect(refreshSoundtrack).toHaveBeenCalledWith('movie:27205', ['Inception']);
    expect(container.textContent).toContain(album.name);
  });

  it('Auto : annonce quand rien n’est trouvé, ou l’erreur de Spotify', async () => {
    const refreshSoundtrack = vi.fn().mockResolvedValueOnce({ listen: null }).mockResolvedValueOnce({ listen: null, message: 'Trop de requêtes.' });
    await show(null, undefined, { refreshSoundtrack });
    await click(byLabel('Régler la bande originale'));
    await click(byLabel('Relancer la recherche'));
    expect(container.textContent).toContain('Aucune bande originale trouvée.');
    await click(byLabel('Relancer la recherche'));
    expect(container.textContent).toContain('Trop de requêtes.');
  });

  it('Manuel : cherche le texte saisi, puis ▶ garde le résultat et le lance', async () => {
    const choice = { kind: 'playlist', id: 'P1', name: 'BO Nos jours Heureux', by: 'Léa Hautier' };
    const searchSoundtracks = vi.fn(async () => ({ choices: [choice] }));
    const chooseSoundtrack = vi.fn(async () => ({ listen: playlist }));
    const { play } = await show(null, undefined, { searchSoundtracks, chooseSoundtrack });
    await click(byLabel('Régler la bande originale'));
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Manuel')!);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Titre à chercher"]')!;
    expect(input.value).toBe('Inception');
    await type(input, 'BO Nos jours heureux');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(searchSoundtracks).toHaveBeenCalledWith('BO Nos jours heureux');
    await click(byLabel('Lancer BO Nos jours Heureux'));
    expect(chooseSoundtrack).toHaveBeenCalledWith('movie:27205', choice);
    expect(play).toHaveBeenCalledWith(null, playlist);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain('BO Nos jours Heureux');
  });

  it('Tidal : pas d’onglet Manuel', async () => {
    await show(tidal, undefined, { manualSoundtrack: false, refreshSoundtrack: vi.fn() });
    await click(byLabel('Régler la bande originale'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Manuel')).toBe(false);
  });
});
