// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/content/ghibli-sky', async (orig) => ({ ...(await orig<typeof import('../../src/content/ghibli-sky')>()), reducedMotion: () => reduced.value }));

import { DISC_FLIGHT_MS, DiscFlight } from '../../src/content/opened-item/disc-flight';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { setGameService } from '../../src/content/game-registry';
import { setMusicService, setPlatformChoice, setPlayerSource } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import type { PlayerCard, PlayerSource, PlayerView } from '../../src/content/player-source';
import { createMemoryStore } from '../../src/core/cache/store';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { Layout } from '../../src/core/library/library-types';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const q = (s: string) => container.querySelector<HTMLElement | SVGElement>(s);
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
async function click(s: string) {
  const el = q(s);
  if (!el) throw new Error(`introuvable : ${s}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  reduced.value = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DiscFlight', () => {
  const from = { x: 500, y: 100, w: 200, h: 200 };
  const to = { x: 40, y: 300, w: 40, h: 40 };
  it('part du plateau, rejoint le poste en rapetissant, se pose après 900 ms', () => {
    const onLanded = vi.fn();
    act(() => root.render(<DiscFlight from={from} to={to} cover={null} color="#c33" reduced={false} onLanded={onLanded} />));
    const el = q('[data-disc-flight]') as HTMLElement;
    expect(el.style.left).toBe('500px');
    expect(el.style.width).toBe('200px');
    expect(Number(el.style.zIndex)).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(40); });
    // Deux calques : l'un glisse en largeur, l'autre en hauteur et rapetisse (trajectoire courbe).
    expect(el.style.transform).toBe('translateX(-540px)');
    const y = el.querySelector<HTMLElement>('[data-disc-flight-y]')!;
    expect(y.style.transform).toBe('translateY(120px) scale(0.2)');
    expect(onLanded).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(DISC_FLIGHT_MS - 40); });
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(DISC_FLIGHT_MS).toBe(900);
  });
  it('mouvement réduit : pas de vol, posé aussitôt', () => {
    const onLanded = vi.fn();
    act(() => root.render(<DiscFlight from={from} to={to} cover={null} color="#c33" reduced onLanded={onLanded} />));
    expect(q('[data-disc-flight]')).toBeNull();
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});

// ---------- Dans la pièce : choisir une piste avec un poste ----------
const known = [{ slug: 'Daft_Punk', title: 'Daft Punk' }, { slug: 'Abbey_Road', title: 'Abbey Road' }];
const fakeCollection = { list: async () => known, subscribe: () => () => undefined } as unknown as CollectionRepo;
const LAYOUT: Layout = [
  { id: 's', kind: 'shelf', col: 0, row: 6 },
  { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
  { id: 'c2', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 1, slug: 'Abbey_Road' },
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 },
];

describe('le disque vole jusqu’au poste', () => {
  let repo: LibraryRepo;
  let view: PlayerView;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  let setCard: ReturnType<typeof vi.fn>;
  let play: ReturnType<typeof vi.fn>;
  // Lecture réussie : le lecteur pose la carte et la piste (comme overlay.ts), puis répond null.
  const playing = (slug: string, title: string) => {
    view = { ...view, card: { slug, title }, track: { uri: `spotify:track:${slug}-1`, title: `${slug} 1`, artist: 'X', imageUrl: null, playing: true } };
    notify();
  };

  beforeEach(async () => {
    view = { linked: true, hidden: false, enabled: true, card: null, track: null };
    setCard = vi.fn((card: PlayerCard | null) => { view = { ...view, card }; notify(); });
    setPlayerSource({ current: () => view, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); }, toggle: async () => undefined, setCard } as unknown as PlayerSource);
    play = vi.fn(async (_t: unknown, _l: unknown, card: { slug: string; title: string }) => { playing(card.slug, card.title); return null; });
    setMusicService({
      view: vi.fn(async (slug: string) => ({ status: 'ready', listen: { kind: 'album', items: [{ uri: `spotify:track:${slug}-1`, title: `${slug} 1`, artist: 'X' }], albumUri: 'spotify:album:Z' } })),
      play, subscribe: () => () => undefined,
    } as unknown as MusicService);
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
    await settle();
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => LAYOUT)); });
    await settle();
  });
  afterEach(() => { setPlayerSource(null); setMusicService(null); setPlatformChoice(null); listeners.clear(); history.replaceState(null, ''); });

  // État de l'entrée d'historique du zoom : celle que le retour depuis la couche retrouve.
  let zoomState: unknown = null;
  const openFromShelf = async (slug: string) => {
    if (!q('[data-furniture-zoom]')) {
      await click('[data-furniture="shelf"]');
      await click(`[data-zoom-card="${slug}"]`);
    }
    zoomState = history.state;
    await click(`[data-board-card="${slug}"]`);
    await advance(1200);
  };
  const caseOf = () => q('[data-opened-item] [data-item-case]');
  const discOf = () => q('[data-opened-item] [data-case-disc]')?.getAttribute('data-disc') ?? null;
  const hifiDisc = () => q('[data-hifi] [data-hifi-disc-at]');

  it('choisir une piste : le boîtier reste ouvert, le disque vole au poste puis le plateau est vide', async () => {
    await openFromShelf('Daft_Punk');
    expect(discOf()).toBe('in');
    await click('[data-opened-item] button[aria-label="Lire Daft_Punk 1"]');
    expect(play).toHaveBeenCalled();
    expect(q('[data-opened-item] [data-disc-flight]')).not.toBeNull();
    expect(caseOf()?.getAttribute('data-phase')).toBe('open');
    expect(discOf()).toBe('flying');
    expect(q('[data-case-tray-empty]')).toBeNull();
    // Pendant le vol, la scène ne montre pas encore le disque sur le poste.
    expect(hifiDisc()).toBeNull();
    await advance(900);
    expect(q('[data-disc-flight]')).toBeNull();
    expect(q('[data-case-tray-empty]')).not.toBeNull();
    expect(caseOf()?.getAttribute('data-phase')).toBe('open');
    expect(hifiDisc()).not.toBeNull();
    // Une autre piste du même album : rien ne bouge.
    await click('[data-opened-item] button[aria-label="Mettre en pause Daft_Punk 1"]');
    expect(q('[data-disc-flight]')).toBeNull();
  });

  it('✕ : le boîtier vole se poser devant le poste ; toucher la pochette le rouvre, plateau vide, piste marquée', async () => {
    await openFromShelf('Daft_Punk');
    await click('[data-opened-item] button[aria-label="Lire Daft_Punk 1"]');
    await advance(900);
    // Pendant que la couche est ouverte, la pochette couchée est masquée (mais mesurable).
    const sleeve = q('[data-hifi-sleeve="Daft_Punk"]')!;
    expect(sleeve.getAttribute('opacity')).toBe('0');
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.matches('[data-hifi-sleeve]') ? new DOMRect(300, 200, 60, 30) : new DOMRect(0, 0, 0, 0);
    });
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await click('[data-opened-item] [data-action="close"]');
    expect(caseOf()?.getAttribute('data-phase')).toBe('closing');
    // Vers le rectangle de la pochette (le boîtier s'y inscrit, centré).
    expect((caseOf() as HTMLElement).style.transform).toMatch(/translate\(3\d\d(\.\d+)?px, 200px\)/);
    await advance(1200);
    expect(q('[data-opened-item]')).toBeNull();
    expect(q('[data-hifi-sleeve="Daft_Punk"]')?.getAttribute('opacity')).not.toBe('0');
    // Place d'origine vide tant que l'objet est au poste.
    expect(q('[data-card="Daft_Punk"]')).toBeNull();
    // Retour à la pièce (le zoom couvrait la scène), puis la pochette couchée devant le poste.
    await click('[data-action="zoom-back"]');
    await click('[data-action="zoom-back"]');
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
    history.replaceState(null, '');
    await click('[data-hifi-sleeve="Daft_Punk"]');
    expect(q('[data-opened-item="c"]')).not.toBeNull();
    await advance(1200);
    expect(q('[data-case-tray-empty]')).not.toBeNull();
    expect(q('[data-disc-flight]')).toBeNull();
    expect(q('[data-opened-item] [data-track="spotify:track:Daft_Punk-1"]')?.getAttribute('data-playing')).toBe('1');
  });

  it('Échap et retour : même cible que ✕ (devant le poste)', async () => {
    await openFromShelf('Daft_Punk');
    await click('[data-opened-item] button[aria-label="Lire Daft_Punk 1"]');
    await advance(900);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.matches('[data-hifi-sleeve]') ? new DOMRect(300, 200, 60, 30) : new DOMRect(0, 0, 0, 0);
    });
    await act(async () => { history.replaceState(zoomState, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: zoomState })); });
    expect(caseOf()?.getAttribute('data-phase')).toBe('closing');
    expect((caseOf() as HTMLElement).style.transform).toMatch(/translate\(3\d\d(\.\d+)?px, 200px\)/);
  });

  it('changer d’album : l’ancien objet revient à sa place avant que le nouveau disque ne se pose', async () => {
    await openFromShelf('Daft_Punk');
    await click('[data-opened-item] button[aria-label="Lire Daft_Punk 1"]');
    await advance(900);
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await click('[data-opened-item] [data-action="close"]');
    await advance(1200);
    history.replaceState(null, '');
    expect(q('[data-card="Daft_Punk"]')).toBeNull();
    await openFromShelf('Abbey_Road');
    await click('[data-opened-item] button[aria-label="Lire Abbey_Road 1"]');
    // L'ancien disque quitte le poste, son boîtier est de nouveau à sa place ; le nouveau disque attend dans son plateau.
    expect(q('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(hifiDisc()).toBeNull();
    expect(q('[data-disc-flight]')).toBeNull();
    expect(discOf()).toBe('in');
    await advance(450);
    expect(q('[data-disc-flight]')).not.toBeNull();
    expect(q('[data-card="Daft_Punk"]')).not.toBeNull();
    await advance(900);
    expect(q('[data-disc-flight]')).toBeNull();
    expect(q('[data-case-tray-empty]')).not.toBeNull();
    expect(hifiDisc()).not.toBeNull();
  });

  it('mouvement réduit : pas de vol, le disque est au poste aussitôt', async () => {
    reduced.value = true;
    await openFromShelf('Daft_Punk');
    await click('[data-opened-item] button[aria-label="Lire Daft_Punk 1"]');
    expect(q('[data-disc-flight]')).toBeNull();
    expect(q('[data-case-tray-empty]')).not.toBeNull();
    expect(hifiDisc()).not.toBeNull();
  });

  it('une lecture qui aboutit après la fermeture ne lance pas de vol', async () => {
    let resolve: (v: null) => void = () => undefined;
    play.mockImplementation((_t: unknown, _l: unknown, card: { slug: string; title: string }) => new Promise<null>((r) => { resolve = (v) => { playing(card.slug, card.title); r(v); }; }));
    await openFromShelf('Daft_Punk');
    await click('[data-opened-item] button[aria-label="Lire Daft_Punk 1"]');
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await click('[data-opened-item] [data-action="close"]');
    await act(async () => { resolve(null); });
    await settle();
    expect(q('[data-disc-flight]')).toBeNull();
    // Le disque n'est pas masqué au poste : aucun vol en attente.
    expect(hifiDisc()).not.toBeNull();
  });

  it('Tidal (lien externe) : la carte est posée au lecteur, le disque va au poste', async () => {
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting({ getItem: () => 'tidal', setItem: () => undefined }) });
    await openFromShelf('Daft_Punk');
    const link = q('[data-opened-item] a[aria-label="Ouvrir Daft_Punk 1 dans Tidal"]')!;
    link.addEventListener('click', (e) => e.preventDefault());
    await act(async () => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await settle();
    expect(setCard).toHaveBeenCalledWith({ slug: 'Daft_Punk', title: 'Daft Punk' });
    expect(q('[data-disc-flight]')).not.toBeNull();
    await advance(900);
    expect(q('[data-case-tray-empty]')).not.toBeNull();
  });

  it('sortie du plein écran pendant que la couche est ouverte : fermeture immédiate, entrées du zoom et de la couche retirées d’un coup', async () => {
    let current: Element | null = null;
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: function (this: HTMLElement) { current = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); } });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: () => { current = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); } });
    await click('[data-action="fullscreen"]');
    await openFromShelf('Daft_Punk');
    const go = vi.spyOn(history, 'go').mockImplementation(() => undefined);
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await act(async () => { await document.exitFullscreen(); });
    await settle();
    expect(q('[data-opened-item]')).toBeNull();
    expect(q('[data-furniture-zoom]')).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-2);
    expect(back).not.toHaveBeenCalled();
  });
});

// ---------- BO d'un jeu à cartouche ----------
describe('BO d’un jeu Switch : la cartouche va au poste', () => {
  const zelda = [{ slug: 'Zelda', title: 'Zelda' }];
  const collection = { list: async () => zelda, subscribe: () => () => undefined } as unknown as CollectionRepo;
  const GAME_LAYOUT: Layout = [
    { id: 's', kind: 'shelf', col: 0, row: 6 },
    { id: 'g', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, box: 'switch', caseColor: '#E60012', slug: 'Zelda' },
    { id: 'd', kind: 'desk', col: 12, row: 10 },
    { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 },
  ];
  let view: PlayerView;
  const listeners = new Set<() => void>();

  beforeEach(async () => {
    view = { linked: true, hidden: false, enabled: true, card: null, track: null };
    const notify = () => listeners.forEach((l) => l());
    setPlayerSource({ current: () => view, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); }, toggle: async () => undefined, setCard: vi.fn() } as unknown as PlayerSource);
    const bo = { kind: 'album', items: [{ uri: 'spotify:track:BO-1', title: 'BO 1', artist: 'X' }], albumUri: 'spotify:album:BO' };
    setMusicService({
      soundtrack: vi.fn(async () => bo),
      play: vi.fn(async (_t: unknown, _l: unknown, card: { slug: string; title: string }) => {
        view = { ...view, card, track: { uri: 'spotify:track:BO-1', title: 'BO 1', artist: 'X', imageUrl: null, playing: true } };
        notify();
        return null;
      }),
      subscribe: () => () => undefined,
    } as unknown as MusicService);
    setGameService({ view: vi.fn(async () => ({ status: 'detail', detail: { source: 'igdb', id: 1, title: 'Zelda', genres: [], platforms: ['Nintendo Switch'], developers: [], pageUrl: 'https://x' } })) } as never);
    const repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} collection={collection} />); });
    await settle();
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => GAME_LAYOUT)); });
    await settle();
  });
  afterEach(() => { setPlayerSource(null); setMusicService(null); setGameService(null); listeners.clear(); history.replaceState(null, ''); });

  it('la cartouche vole (kind « cart ») et se pose couchée sur le poste, sans tourner', async () => {
    await click('[data-furniture="shelf"]');
    await click('[data-zoom-card="Zelda"]');
    await click('[data-board-card="Zelda"]');
    await advance(1200);
    expect(q('[data-opened-item] [data-case-disc][data-support="cart"]')).not.toBeNull();
    await click('[data-opened-item] button[aria-label="Lire BO 1"]');
    expect(q('[data-disc-flight]')?.getAttribute('data-kind')).toBe('cart');
    await advance(900);
    const at = q('[data-hifi] [data-hifi-disc-at]')!;
    expect(at.querySelector('[data-hifi-cart]')).not.toBeNull();
    expect(at.outerHTML).not.toContain('rotate');
    expect(at.querySelector('[data-hifi-disc-spin]')).toBeNull();
  });
});
