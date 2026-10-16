// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenedItemLayer } from '../../src/content/opened-item/OpenedItemLayer';
import { useState } from 'react';
import { BookSelector, GameSelector, MusicSelector, ScreenSelector, VideoPlayer, type Video } from '../../src/content/opened-item/selectors';
import { setBookService } from '../../src/content/book-registry';
import { setGameService } from '../../src/content/game-registry';
import { setGameBoxService } from '../../src/content/game-box-registry';
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
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={onPlayed} video={null} onVideo={onVideo} />));
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
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={onPlayed} video={{ kind: 'youtube', key: 'abc' }} onVideo={onVideo} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire B"]')!.click());
    expect(music.play).toHaveBeenCalledWith(items[1], bo, { slug: 'Film', title: 'Film' });
    expect(onVideo).toHaveBeenLastCalledWith(null);
    expect(onPlayed).toHaveBeenCalledWith(items[1]);
  });
  it('film : service muet ou en panne → message, rien d’autre', async () => {
    services({ status: 'error', message: 'TMDB indisponible' }, null, null);
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={vi.fn()} video={null} onVideo={vi.fn()} />));
    expect(container.textContent).toContain('TMDB indisponible');
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
  it('jeu : flux HLS avec la page du jeu', async () => {
    const music = services(null, gameView);
    const onVideo = vi.fn();
    await act(async () => root.render(<GameSelector slug="Jeu" title="Jeu" onPlayed={vi.fn()} video={null} onVideo={onVideo} />));
    expect(music.soundtrack).toHaveBeenCalledWith('game:steam:9', ['Jeu']);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Voir la bande-annonce"]')!.click());
    expect(onVideo).toHaveBeenCalledWith({ kind: 'hls', url: 'https://x/m.m3u8', pageUrl: 'https://store.steampowered.com/app/9' });
  });
  describe('jeu : fiche courte et description en tête de page', () => {
    const LONG = 'Amérique, 1899. Arthur Morgan et la bande de Van der Linde sont en fuite. Traqués par les agents fédéraux et les meilleurs chasseurs de primes du pays, ils doivent voler, se battre et piller pour survivre.';
    const detail = { ...gameView.detail, title: 'Red Dead Redemption 2', year: 2018, developers: ['Rockstar Games'], platforms: ['PlayStation 4'], genres: [], summary: LONG, rating: { kind: 'positive', value: 91, count: 1000 } };
    const box = { format: 'bluray', style: { plastic: '#1F4C9E', band: null }, platformName: 'Sony Playstation 4', shots: [], title: 'Red Dead Redemption 2', studio: 'Rockstar Games', summary: 'English overview from TheGamesDB.' };
    const render = (view: unknown, gameBox: unknown = box) => {
      services(null, view);
      setGameBoxService({ box: vi.fn().mockResolvedValue(gameBox), peek: () => undefined, subscribe: () => () => undefined } as never);
      return act(async () => root.render(<GameSelector slug="RDR2" title="RDR2" onPlayed={vi.fn()} video={null} onVideo={vi.fn()} />));
    };
    afterEach(() => setGameBoxService(null));

    it('titre, « PS4 · 2018 · Rockstar Games », note, description sur 3 lignes, puis vidéo et BO', async () => {
      await render({ status: 'detail', detail });
      const head = container.querySelector<HTMLElement>('[data-game-head]')!;
      expect(head.textContent).toContain('Red Dead Redemption 2');
      expect(head.querySelector('[data-game-meta]')!.textContent).toBe('PS4 · 2018 · Rockstar Games');
      expect(head.querySelector('[data-game-rating]')!.textContent).toContain('91 %');
      const text = head.querySelector<HTMLElement>('[data-game-summary]')!;
      expect(text.textContent).toBe(LONG);
      expect(text.style.webkitLineClamp).toBe('3');
      // Puis les lignes d'avant : vidéo, BO.
      const rows = [...container.querySelectorAll('li')];
      expect(rows[0]!.hasAttribute('data-video')).toBe(true);
      expect(rows.filter((r) => r.hasAttribute('data-track'))).toHaveLength(3);
      expect(head.compareDocumentPosition(rows[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // La page défile si elle déborde.
      expect(container.querySelector<HTMLElement>('[data-selector="game"]')!.style.overflowY).toBe('auto');
    });

    it('« Lire la suite » déplie la description', async () => {
      await render({ status: 'detail', detail });
      await act(async () => container.querySelector<HTMLButtonElement>('button[data-action="read-more"]')!.click());
      expect(container.querySelector<HTMLElement>('[data-game-summary]')!.style.webkitLineClamp).toBe('');
      expect(container.querySelector('button[data-action="read-more"]')).toBeNull();
    });

    it('sans description Steam/IGDB : celle de TheGamesDB', async () => {
      const { summary: _s, ...bare } = detail;
      await render({ status: 'detail', detail: bare });
      expect(container.querySelector('[data-game-summary]')!.textContent).toBe('English overview from TheGamesDB.');
    });

    it('description Steam vide : celle de TheGamesDB', async () => {
      await render({ status: 'detail', detail: { ...detail, summary: '' } });
      expect(container.querySelector('[data-game-summary]')!.textContent).toBe('English overview from TheGamesDB.');
    });

    it('la page n’attend pas la boîte : vidéo et BO tout de suite, l’en-tête se complète à son arrivée', async () => {
      let resolve: (b: unknown) => void = () => undefined;
      services(null, { status: 'detail', detail });
      setGameBoxService({ box: () => new Promise((r) => { resolve = r; }), peek: () => undefined, subscribe: () => () => undefined } as never);
      await act(async () => root.render(<GameSelector slug="RDR2" title="RDR2" onPlayed={vi.fn()} video={null} onVideo={vi.fn()} />));
      expect(container.querySelector('li[data-video]')).not.toBeNull();
      expect(container.querySelector('[data-game-meta]')!.textContent).toContain('Rockstar Games');
      await act(async () => resolve({ ...box, studio: 'Studio de la boîte' }));
      expect(container.querySelector('[data-game-meta]')!.textContent).toContain('Studio de la boîte');
    });

    it('sans boîte : la console de la fiche ; note IGDB sur 100', async () => {
      await render({ status: 'detail', detail: { ...detail, platforms: ['Nintendo Switch'], rating: { kind: 'score', value: 84, count: 10 } } }, null);
      expect(container.querySelector('[data-game-meta]')!.textContent).toBe('Switch · 2018 · Rockstar Games');
      expect(container.querySelector('[data-game-rating]')!.textContent).toContain('84/100');
    });
  });

  it('rien de connu : « Pas de bande-annonce ni de BO »', async () => {
    services({ status: 'none' }, null, null);
    await act(async () => root.render(<ScreenSelector slug="Film" title="Film" onPlayed={vi.fn()} video={null} onVideo={vi.fn()} />));
    expect(container.textContent).toContain('Pas de bande-annonce ni de BO');
  });
  it('VideoPlayer : YouTube → miniature ▶ du lecteur de bande-annonce', async () => {
    await act(async () => root.render(<VideoPlayer video={{ kind: 'youtube', key: 'abc' }} />));
    expect(container.querySelector('img, button')).not.toBeNull();
  });
});

describe('vidéo à la place du disque (couche ouverte)', () => {
  const placed = { id: 'd1', kind: 'stored', shape: 'dvd', shelfId: 's', level: 0, order: 0, slug: 'Film' } as const;
  const filmView = { status: 'detail', detail: { mediaType: 'movie', id: 7, title: 'Film', trailerKey: 'abc' } };
  function Harness({ id = 'd1' }: { id?: string }) {
    const [video, setVideo] = useState<Video | null>(null);
    return (
      <OpenedItemLayer placed={{ ...placed, id }} card={{ title: 'Film' }} cover={null} color="#c33" state={{ placedId: id, from: null, to: null, phase: 'open' }}
        disc="in" hasHifi onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()}
        selector={<ScreenSelector slug="Film" title="Film" onPlayed={vi.fn()} video={video} onVideo={setVideo} />}
        {...(video ? { right: <VideoPlayer video={video} onEnded={() => setVideo(null)} /> } : {})} />
    );
  }
  const toggle = () => act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Voir la bande-annonce"]')!.click());
  const disc = () => container.querySelector('[data-case-disc]');
  const mount = async () => {
    setMusicService({ soundtrack: vi.fn().mockResolvedValue(null), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
    setScreenService({ view: vi.fn().mockResolvedValue(filmView) } as never);
    Object.assign(window, { innerWidth: 800, innerHeight: 400 });
    await act(async () => root.render(<Harness />));
  };
  afterEach(() => { setScreenService(null); });

  it('choisir la vidéo met le lecteur à la place du disque ; la rechoisir rend le disque', async () => {
    await mount();
    expect(disc()).not.toBeNull();
    await toggle();
    expect(container.querySelector('[data-case-video]')).not.toBeNull();
    expect(disc()).toBeNull();
    await toggle();
    expect(container.querySelector('[data-case-video]')).toBeNull();
    expect(disc()).not.toBeNull();
  });
  it('fin de la vidéo : le disque revient', async () => {
    await mount();
    await toggle();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire la bande-annonce"]')!.click());
    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toContain('enablejsapi=1');
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'onStateChange', info: 0 }), source: iframe.contentWindow })); });
    expect(container.querySelector('[data-case-video]')).toBeNull();
    expect(disc()).not.toBeNull();
  });
  it('un message d’un autre cadre ou un autre état est ignoré', async () => {
    await mount();
    await toggle();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire la bande-annonce"]')!.click());
    const iframe = container.querySelector('iframe')!;
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'onStateChange', info: 1 }), source: iframe.contentWindow })); });
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'onStateChange', info: 0 }), source: window })); });
    expect(container.querySelector('[data-case-video]')).not.toBeNull();
  });
});

describe('BookSelector', () => {
  const detail = { id: 'OL1W', title: 'Livre', synopsis: { text: 'Un résumé', url: 'u', source: 'wikipedia' } };
  const reading = { links: [{ source: 'wikisource', label: 'Wikisource', url: 'https://fr.wikisource.org/wiki/L' }, { source: 'archive', label: 'Internet Archive', url: 'https://archive.org/details/l' }], complete: true };
  afterEach(() => setBookService(null));
  const mount = (view: unknown, read: unknown = reading) => {
    const service = { view: vi.fn().mockResolvedValue(view), reading: vi.fn().mockResolvedValue(read) };
    setBookService(service as never);
    return service;
  };
  const render = () => act(async () => root.render(<BookSelector slug="Livre" title="Livre" onPlayed={vi.fn()} />));

  it('synopsis et deux liens ; les liens s’ouvrent dans un nouvel onglet', async () => {
    const service = mount({ status: 'detail', detail });
    await render();
    expect(service.reading).toHaveBeenCalledWith('Livre', { id: 'OL1W', title: 'Livre' });
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.textContent).toContain('Un résumé');
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://fr.wikisource.org/wiki/L', 'https://archive.org/details/l']);
    expect(links[0]!.getAttribute('target')).toBe('_blank');
    expect(links[0]!.getAttribute('rel')).toContain('noopener');
  });
  it('rien à lire : « Rien à lire pour ce livre »', async () => {
    mount({ status: 'none' });
    await render();
    expect(container.textContent).toContain('Rien à lire pour ce livre');
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
  it('service en panne : pas de plantage', async () => {
    setBookService({ view: vi.fn().mockRejectedValue(new Error('x')), reading: vi.fn() } as never);
    await render();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelector('[data-selector]')).not.toBeNull();
  });
  it('couche ouverte d’un livre : couverture à droite, aucun disque', async () => {
    mount({ status: 'detail', detail });
    Object.assign(window, { innerWidth: 800, innerHeight: 400 });
    const placed = { id: 'b1', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 0, slug: 'Livre' } as const;
    await act(async () => root.render(
      <OpenedItemLayer placed={placed} card={{ title: 'Livre' }} cover="https://x/c.jpg" color="#c33" state={{ placedId: 'b1', from: null, to: null, phase: 'open' }}
        disc="in" hasHifi={false} onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()}
        selector={<BookSelector slug="Livre" title="Livre" onPlayed={vi.fn()} />} />));
    expect(container.querySelector('[data-case-cover]')).not.toBeNull();
    expect(container.querySelector('[data-case-disc]')).toBeNull();
    expect(container.querySelectorAll('a[href]')).toHaveLength(2);
  });
});
