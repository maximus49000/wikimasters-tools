// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSelector, MusicSelector, ScreenSelector, VideoPlayer } from '../../src/content/opened-item/selectors';
import { setGameService } from '../../src/content/game-registry';
import { setScreenService } from '../../src/content/screen-registry';
import { setMusicService, setPlatformChoice } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = ['A', 'B', 'C'].map((t) => ({ uri: `spotify:track:${t}`, title: t, artist: 'X' }));
const ready = { status: 'ready', listen: { kind: 'album', items, albumUri: 'spotify:album:Z' } };

let container: HTMLDivElement;
let root: Root;

function setup(view: unknown, play: unknown = vi.fn().mockResolvedValue(null)) {
  const service = { view: vi.fn().mockResolvedValue(view), play, subscribe: () => () => undefined } as unknown as MusicService;
  setMusicService(service);
  return service;
}
async function render(onPlayed = vi.fn()) {
  await act(async () => root.render(<MusicSelector slug="Abbey_Road" title="Abbey Road" onPlayed={onPlayed} />));
  return onPlayed;
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
  setPlatformChoice(null);
});

describe('MusicSelector', () => {
  it('une ligne par piste ; toucher joue avec la carte puis prévient', async () => {
    const service = setup(ready);
    const onPlayed = await render();
    expect(container.querySelectorAll('[data-track]')).toHaveLength(3);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire B"]')!.click());
    expect(service.play).toHaveBeenCalledWith(items[1], ready.listen, { slug: 'Abbey_Road', title: 'Abbey Road' });
    expect(onPlayed).toHaveBeenCalledWith(items[1]);
  });
  it('lecture refusée : message affiché, pas d’onPlayed', async () => {
    setup(ready, vi.fn().mockResolvedValue('Spotify indisponible'));
    const onPlayed = await render();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire A"]')!.click());
    expect(container.textContent).toContain('Spotify indisponible');
    expect(onPlayed).not.toHaveBeenCalled();
  });
  it('vue vide ou en erreur : « Aucune piste trouvée »', async () => {
    setup({ status: 'notfound' });
    await render();
    expect(container.textContent).toContain('Aucune piste trouvée');
    await act(async () => root.unmount());
    root = createRoot(container);
    setMusicService({ view: vi.fn().mockRejectedValue(new Error('x')), subscribe: () => () => undefined } as unknown as MusicService);
    await render();
    expect(container.textContent).toContain('Aucune piste trouvée');
  });
  it('Tidal : lien externe, et onPlayed au clic', async () => {
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting({ getItem: () => 'tidal', setItem: () => undefined }) });
    setup(ready);
    const onPlayed = await render();
    const link = container.querySelector<HTMLAnchorElement>('a[href]')!;
    expect(link.getAttribute('href')).toBeTruthy();
    link.addEventListener('click', (e) => e.preventDefault());
    await act(async () => link.click());
    expect(onPlayed).toHaveBeenCalledWith(items[0]);
  });
});

describe('ScreenSelector / GameSelector', () => {
  const bo = { kind: 'album', items, albumUri: 'spotify:album:Z' };
  const filmView = { status: 'detail', detail: { mediaType: 'movie', id: 7, title: 'Film', trailerKey: 'abc' } };
  const gameView = { status: 'detail', detail: { source: 'steam', id: 9, title: 'Jeu', pageUrl: 'https://store.steampowered.com/app/9', trailer: { kind: 'hls', url: 'https://x/m.m3u8' } } };
  function services(screen: unknown, game: unknown, listen: unknown = bo) {
    const play = vi.fn().mockResolvedValue(null);
    const music = { soundtrack: vi.fn().mockResolvedValue(listen), play, subscribe: () => () => undefined } as unknown as MusicService;
    setMusicService(music);
    setScreenService({ view: vi.fn().mockResolvedValue(screen) } as never);
    setGameService({ view: vi.fn().mockResolvedValue(game) } as never);
    return music;
  }
  afterEach(() => { setScreenService(null); setGameService(null); });

  it('film : vidéo d’abord ; la choisir la donne au plateau (pas de lecture)', async () => {
    const music = services(filmView, null);
    const onVideo = vi.fn();
    const onPlayed = vi.fn();
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={onPlayed} onVideo={onVideo} />));
    expect(music.soundtrack).toHaveBeenCalledWith('movie:7', ['Film']);
    const rows = [...container.querySelectorAll('li')];
    expect(rows).toHaveLength(4);
    expect(rows[0]!.hasAttribute('data-video')).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Voir la bande-annonce"]')!.click());
    expect(onVideo).toHaveBeenCalledWith({ kind: 'youtube', key: 'abc' });
    expect(onPlayed).not.toHaveBeenCalled();
  });
  it('film : une piste de BO joue avec la carte et rend le disque', async () => {
    const music = services(filmView, null);
    const onVideo = vi.fn();
    const onPlayed = vi.fn();
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={onPlayed} onVideo={onVideo} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Voir la bande-annonce"]')!.click());
    expect(onVideo).toHaveBeenLastCalledWith({ kind: 'youtube', key: 'abc' });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire B"]')!.click());
    expect(music.play).toHaveBeenCalledWith(items[1], bo, { slug: 'Film', title: 'Film' });
    expect(onVideo).toHaveBeenLastCalledWith(null);
    expect(onPlayed).toHaveBeenCalledWith(items[1]);
  });
  it('film : service muet ou en panne → message, rien d’autre', async () => {
    services({ status: 'error', message: 'TMDB indisponible' }, null, null);
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={vi.fn()} onVideo={vi.fn()} />));
    expect(container.textContent).toContain('TMDB indisponible');
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
  it('jeu : flux HLS avec la page du jeu', async () => {
    const music = services(null, gameView);
    const onVideo = vi.fn();
    await act(async () => root.render(<GameSelector slug="Jeu" title="Jeu" onPlayed={vi.fn()} onVideo={onVideo} />));
    expect(music.soundtrack).toHaveBeenCalledWith('game:steam:9', ['Jeu']);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Voir la bande-annonce"]')!.click());
    expect(onVideo).toHaveBeenCalledWith({ kind: 'hls', url: 'https://x/m.m3u8', pageUrl: 'https://store.steampowered.com/app/9' });
  });
  it('rien de connu : « Pas de bande-annonce ni de BO »', async () => {
    services({ status: 'none' }, null, null);
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={vi.fn()} onVideo={vi.fn()} />));
    expect(container.textContent).toContain('Pas de bande-annonce ni de BO');
  });
  it('VideoPlayer : YouTube → miniature ▶ du lecteur de bande-annonce', async () => {
    await act(async () => root.render(<VideoPlayer video={{ kind: 'youtube', key: 'abc' }} />));
    expect(container.querySelector('img, button')).not.toBeNull();
  });
});
