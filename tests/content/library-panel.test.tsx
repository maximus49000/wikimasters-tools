// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { extendRoom, updateLayout } from '../../src/core/library/library-book';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { setGameBoxService } from '../../src/content/game-box-registry';
import type { GameBox, GameBoxService } from '../../src/content/game-box-service';
import { setPlayerSource } from '../../src/content/music-registry';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import type { Layout } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: KeyValueStore;
let repo: LibraryRepo;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
const confirm = async () => { if (container.querySelector('[data-action="place-confirm"]')) await click('[data-action="place-confirm"]'); };

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store = createMemoryStore();
  repo = createLibraryRepo(store);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('LibraryPanel', () => {
  it('montre la première pièce vide', () => {
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('svg[role="img"]')).not.toBeNull();
    expect(q('[data-furniture]')).toBeNull();
  });

  it('crée une pièce et la rend active', async () => {
    await click('[data-action="add-room"]');
    expect(q('[data-room="r2"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('false');
  });

  it('pose une étagère au sol puis la retire', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await confirm();
    expect(q('[data-furniture="shelf"]')).not.toBeNull();
    await click('[data-furniture="shelf"]');
    await confirm();
    await click('[data-action="remove"]');
    expect(q('[data-furniture="shelf"]')).toBeNull();
  });

  it('refuse un meuble posé sur le mur et le dit', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-11"]');
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    await confirm();
    expect(repo.current()?.rooms[0]?.layout ?? []).toHaveLength(0);
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it("pose un ordinateur sur un bureau, une seule fois", async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    await confirm();
    expect(q('[data-furniture="computer"]')).not.toBeNull();
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    await confirm();
    expect(container.querySelectorAll('[data-furniture="computer"]')).toHaveLength(1);
    expect(q('[role="status"]')?.textContent).toContain('déjà');
  });

  it("garde le même aménagement dans les deux orientations, avec une fenêtre différente", async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    const width = () => (q('svg[role="img"]') as unknown as SVGElement).style.width;
    expect(width()).toBe('100%');
    await click('[data-orient="portrait"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(width().startsWith('150')).toBe(true);
    await click('[data-orient="landscape"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(width()).toBe('100%');
  });

  it('agrandit la pièce à droite, puis la réduit', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-cell="30-13"]')).toBeNull();
    await click('[data-action="extend-right"]');
    expect(q('[data-cell="30-13"]')).not.toBeNull();
    await click('[data-action="shrink-right"]');
    expect(q('[data-cell="30-13"]')).toBeNull();
  });

  it('agrandit la pièce à gauche en décalant les meubles', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-action="extend-left"]');
    expect(repo.current()?.rooms[0]?.layout[0]).toMatchObject({ kind: 'desk', col: 14 });
  });

  it('agrandit puis réduit à gauche : colonnes et meuble reviennent à leur valeur', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-action="extend-left"]');
    expect(repo.current()?.rooms[0]?.cols).toBe(36);
    await click('[data-action="shrink-left"]');
    expect(repo.current()?.rooms[0]?.cols).toBe(24);
    expect(repo.current()?.rooms[0]?.layout[0]).toMatchObject({ kind: 'desk', col: 2 });
  });

  it('renomme une pièce en mode Aménager', async () => {
    await click('[data-action="edit"]');
    const input = q('input[aria-label="Nom de la pièce"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { input.focus(); });
    await act(async () => {
      setter.call(input, 'Salon');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    await settle();
    expect(q('[data-room="r1"]')?.textContent).toContain('Salon');
  });

  it('supprime une pièce après confirmation et active sa voisine', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-action="add-room"]');
    await click('[data-action="edit"]');
    await click('[data-action="delete-room"]');
    expect(q('[data-room="r2"]')).toBeNull();
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('true');
  });

  it('ne supprime rien quand la confirmation est refusée', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-action="add-room"]');
    await click('[data-action="edit"]');
    await click('[data-action="delete-room"]');
    expect(repo.current()?.rooms).toHaveLength(2);
  });

  it('vide la dernière pièce : meubles retirés, 24 colonnes, une seule pièce', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-action="edit"]');
    await click('[data-action="extend-right"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-action="delete-room"]');
    const room = repo.current()?.rooms[0];
    expect(repo.current()?.rooms).toHaveLength(1);
    expect(room?.layout).toHaveLength(0);
    expect(room?.cols).toBe(24);
  });

  it('refuse de réduire à gauche une zone occupée', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="extend-right"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-action="shrink-left"]');
    expect(q('[role="status"]')?.textContent).toContain('meubles');
    expect(repo.current()?.rooms[0]?.cols).toBe(36);
  });

  it('refuse de réduire sous 24 colonnes ou une zone occupée, et le dit', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="shrink-right"]');
    expect(q('[role="status"]')?.textContent).toContain('24');
    await click('[data-action="extend-right"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="30-13"]');
    await confirm();
    await click('[data-action="shrink-right"]');
    expect(q('[role="status"]')?.textContent).toContain('meubles');
    expect(repo.current()?.rooms[0]?.cols).toBe(36);
  });

  it("définit puis retire la pièce d'accueil", async () => {
    await click('[data-action="home"]');
    expect(repo.current()?.homeRoomId).toBe('r1');
    expect(q('[data-action="home"]')?.getAttribute('aria-pressed')).toBe('true');
    await click('[data-action="home"]');
    expect(repo.current()?.homeRoomId).toBeNull();
  });

  it('mémorise les pièces et les relit au remontage', async () => {
    await click('[data-action="add-room"]');
    const again = createLibraryRepo(store);
    await act(async () => { root.render(<LibraryPanel library={again} />); });
    await settle();
    expect(q('[data-room="r2"]')).not.toBeNull();
  });
});

describe('LibraryPanel : plein écran', () => {
  function stub() {
    let current: Element | null = null;
    const request = vi.fn(function (this: HTMLElement) {
      current = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => {
        current = null;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      },
    });
    return request;
  }

  it('a un bouton Plein écran qui met la scène de la pièce en plein écran', async () => {
    const request = stub();
    expect(q('[data-action="fullscreen"]')?.getAttribute('aria-label')).toBe('Plein écran');
    await click('[data-action="fullscreen"]');
    expect(request).toHaveBeenCalledTimes(1);
    const stage = request.mock.contexts[0] as HTMLElement;
    expect(stage.querySelector('svg[role="img"]')).not.toBeNull();
    expect(q('[data-action="fullscreen"]')?.getAttribute('aria-label')).toBe('Quitter le plein écran');
    // Le bouton de sortie est posé sur la scène.
    expect(stage.querySelector('button[aria-label="Quitter le plein écran"]')).not.toBeNull();
    await click('[data-action="fullscreen"]');
    expect(q('[data-action="fullscreen"]')?.getAttribute('aria-label')).toBe('Plein écran');
  });

  it('verrouille l’orientation de la pièce en plein écran puis la libère', async () => {
    stub();
    const lock = vi.fn(() => Promise.resolve());
    const unlock = vi.fn();
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock, unlock } });
    await click('[data-action="fullscreen"]');
    expect(lock).toHaveBeenCalledWith('landscape');
    await click('[data-action="fullscreen"]');
    expect(unlock).toHaveBeenCalled();
  });

  it('remplit un écran en paysage : une pièce étroite s’élargit d’elle-même à la largeur exacte de l’écran', async () => {
    stub();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    await click('[data-action="fullscreen"]');
    await settle();
    const scroll = q('[data-scroll]') as HTMLElement;
    expect(scroll.style.height).toBe('100vh');
    expect(repo.current()?.rooms[0]?.cols).toBe(38);
    expect(q('[data-action="fit-screen"]')).toBeNull();
    await click('[data-action="fullscreen"]');
    expect((q('[data-scroll]') as HTMLElement).style.height).toBe('');
  });

  it('une pièce ajustée à l’écran le couvre exactement, sans le léger défilement dû à l’arrondi des colonnes', async () => {
    stub();
    // 2400 × 1080 : 37,8 colonnes arrondies à 38, soit 2414 px de pièce pour 2400 px d'écran.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    await click('[data-action="fullscreen"]');
    await settle();
    expect(repo.current()?.rooms[0]?.cols).toBe(38);
    const svg = q('[data-scroll] svg[role="img"]') as SVGElement;
    expect(svg.style.width).toBe('100vw');
    expect(svg.style.height).toBe('100vh');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    await click('[data-action="fullscreen"]');
    expect((q('[data-scroll] svg[role="img"]') as SVGElement).getAttribute('preserveAspectRatio')).toBeNull();
  });

  it('propose de réduire à la largeur de l’écran une pièce plus large', async () => {
    stub();
    await act(async () => { await repo.update((state) => extendRoom(extendRoom(state, 'r1', 'right'), 'r1', 'right')); });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    await click('[data-action="fullscreen"]');
    await settle();
    expect(repo.current()?.rooms[0]?.cols).toBe(48);
    await click('[data-action="fit-screen"]');
    await settle();
    expect(repo.current()?.rooms[0]?.cols).toBe(38);
    expect(q('[data-action="fit-screen"]')).toBeNull();
    await click('[data-action="fullscreen"]');
  });

  it('le bouton « Adapter à l’écran » disparaît pendant le zoom sur un meuble', async () => {
    stub();
    await act(async () => { await repo.update((state) => updateLayout(extendRoom(extendRoom(state, 'r1', 'right'), 'r1', 'right'), 'r1', () => [
      { id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Inconnue' },
    ])); });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    await click('[data-action="fullscreen"]');
    await settle();
    expect(q('[data-action="fit-screen"]')).not.toBeNull();
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')).not.toBeNull();
    expect(q('[data-action="fit-screen"]')).toBeNull();
    await click('[data-action="zoom-back"]');
  });

  it('prend toute la hauteur d’un écran en portrait (pas de bandes noires), la pièce défile en largeur', async () => {
    stub();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1080 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 2400 });
    await click('[data-action="fullscreen"]');
    expect((q('[data-scroll]') as HTMLElement).style.height).toBe('100vh');
    expect((q('[data-scroll]') as HTMLElement).style.width).toBe('100vw');
    await click('[data-action="edit"]');
    // En Aménager, le tiroir prend le bas de l'écran.
    expect((q('[data-scroll]') as HTMLElement).style.height).toBe('calc(100vh - var(--wmt-drawer-h, 0px))');
    expect(q('[data-action="fit-screen"]')).toBeNull();
  });

  it('en paysage, Aménager garde la pièce sur tout l’écran (tiroir translucide par-dessus, pas de bande noire)', async () => {
    stub();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    await click('[data-action="fullscreen"]');
    await settle();
    await click('[data-action="edit"]');
    expect((q('[data-scroll]') as HTMLElement).style.height).toBe('100vh');
    await click('[data-action="fullscreen"]');
  });
});

describe('LibraryPanel : niveaux', () => {
  const seed = async () => {
    await repo.update((state) => ({
      ...state,
      rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout: [{ id: 'sh', kind: 'shelf', col: 0, row: 7 }, { id: 'arm', kind: 'armchair', col: 1, row: 10 }] } : r)),
    }));
    await settle();
    await click('[data-action="edit"]');
  };
  const outlineX = () => Number([...container.querySelectorAll('[data-selected-copy] rect[stroke="#378ADD"]')].at(-1)?.getAttribute('x'));

  it('avancer descend le meuble sélectionné d’une ligne, reculer le remonte, jamais sur le pied d’un autre meuble', async () => {
    await seed();
    await click('[data-id="arm"]');
    const arm = () => repo.current()?.rooms[0]?.layout.find((p) => p.id === 'arm');
    // Une ligne plus bas, le fauteuil poserait un pied sur celui de l'étagère : refusé.
    expect((q('[data-action="depth-front"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-action="depth-back"]') as HTMLButtonElement).disabled).toBe(false);
    await click('[data-action="depth-back"]');
    expect(arm()).toMatchObject({ row: 9 });
    await click('[data-action="depth-front"]');
    expect(arm()).toMatchObject({ row: 10 });
  });

  it('un second toucher sélectionne l’objet derrière', async () => {
    await seed();
    await click('[data-id="arm"]');
    const armX = outlineX();
    await click('[data-id="arm"]');
    expect(outlineX()).not.toBe(armX);
    // Le contour est celui de l'étagère (colonne 0 : cadre décalé de 3 px vers la gauche).
    expect(outlineX()).toBe(-3);
  });

  it('toucher un autre objet de la pile le sélectionne lui, pas celui d’après', async () => {
    await seed();
    await repo.update((state) => ({ ...state, rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout: [...r.layout, { id: 'tab', kind: 'coffee-table', col: 0, row: 14 }] } : r)) }));
    await settle();
    await click('[data-id="arm"]');
    await click('[data-id="tab"]');
    // Le contour est celui de la table basse (5 colonnes, cadre élargi de 2 × 3 px), pas celui de l'étagère ni du fauteuil (4 colonnes).
    const outlineW = Number([...container.querySelectorAll('[data-selected-copy] rect[stroke="#378ADD"]')].at(-1)?.getAttribute('width'));
    expect(outlineW).toBe(5 * 30 + 6);
  });

  it('les boutons n’apparaissent pas pour un tapis', async () => {
    await seed();
    await repo.update((state) => ({ ...state, rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout: [{ id: 'rg', kind: 'rug', col: 2, row: 15 }] } : r)) }));
    await settle();
    await click('[data-id="rg"]');
    expect(q('[data-action="depth-front"]')).toBeNull();
    expect(q('[data-action="remove"]')).not.toBeNull();
  });
});

describe('LibraryPanel : objet ouvert dans la pièce', () => {
  const known = [{ slug: 'Paris', title: 'Paris', imageUrl: 'p.png' }, { slug: 'Daft_Punk', title: 'Daft Punk' }, { slug: 'Abbey_Road', title: 'Abbey Road' }];
  const fakeCollection = { list: async () => known, subscribe: () => () => undefined } as unknown as CollectionRepo;
  const doc = (s: string) => document.querySelector<HTMLElement>(s);
  const seed = async (layout: Layout) => {
    await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };
  // Retour Android réel : l'entrée de la couche est retirée, l'état redevient celui de l'entrée d'en dessous.
  const back = (state: unknown) => act(async () => { history.replaceState(state, ''); window.dispatchEvent(new PopStateEvent('popstate', { state })); });
  const SHELF: Layout = [{ id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' }];
  // Rend l'état de l'entrée d'historique du zoom (celle que le retour depuis la couche retrouve).
  const openShelfCd = async (): Promise<unknown> => {
    await seed(SHELF);
    await click('[data-furniture="shelf"]');
    const zoomState: unknown = history.state;
    await click('[data-zoom-card="Daft_Punk"]');
    await click('[data-board-card="Daft_Punk"]');
    return zoomState;
  };
  afterEach(() => { setPlayerSource(null); history.replaceState(null, ''); });

  it('sans poste : le bouton 📻 ferme la couche, ouvre Aménager et propose la chaîne hi-fi', async () => {
    await seed([...SHELF, { id: 'd', kind: 'desk', col: 12, row: 10 }]);
    await click('[data-furniture="shelf"]');
    await click('[data-zoom-card="Daft_Punk"]');
    await click('[data-board-card="Daft_Punk"]');
    const go = vi.spyOn(history, 'go').mockImplementation(() => undefined);
    const backSpy = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await click('[data-opened-item] [data-action="add-hifi"]');
    await settle();
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-opened-item]')).toBeNull();
    // Couche et zoom retirés en un seul saut d'historique (pas de back() en plus : aucune entrée orpheline).
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-2);
    expect(backSpy).not.toHaveBeenCalled();
    // La pose proposée est bien celle de la chaîne hi-fi : elle se pose sur le bureau.
    await click('[data-furniture="desk"]');
    await confirm();
    expect(repo.current()?.rooms[0]?.layout.some((p) => p.kind === 'small' && p.item === 'hifi')).toBe(true);
  });

  it('objet ouvert retiré de la pièce : la couche se ferme d’un coup avec ses entrées d’historique', async () => {
    await openShelfCd();
    expect(q('[data-opened-item="c"]')).not.toBeNull();
    const go = vi.spyOn(history, 'go').mockImplementation(() => undefined);
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => [SHELF[0]!])); });
    await settle();
    expect(q('[data-opened-item]')).toBeNull();
    expect(go).toHaveBeenCalledWith(-2);
  });

  it('sans couche ni bulle, la pièce ne s’abonne pas au lecteur (pas de rendu à chaque relevé)', async () => {
    const view: PlayerView = { linked: true, hidden: false, enabled: true, card: null, track: null };
    const subscribe = vi.fn(() => () => undefined);
    setPlayerSource({ current: () => view, subscribe, toggle: async () => undefined, setCard: () => undefined } as unknown as PlayerSource);
    await seed(SHELF);
    expect(subscribe).not.toHaveBeenCalled();
    await click('[data-furniture="shelf"]');
    await click('[data-zoom-card="Daft_Punk"]');
    await click('[data-board-card="Daft_Punk"]');
    expect(subscribe).toHaveBeenCalled();
  });

  it('ouvrir un objet ferme la bulle du poste', async () => {
    const view: PlayerView = { linked: true, hidden: false, enabled: true, card: null, track: null };
    setPlayerSource({ current: () => view, subscribe: () => () => undefined, toggle: async () => undefined, setCard: () => undefined } as unknown as PlayerSource);
    await seed([{ id: 'd', kind: 'desk', col: 12, row: 10 }, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 }, { id: 'w2', kind: 'wall', shape: 'vinyl', col: 4, row: 4, slug: 'Abbey_Road' }]);
    await click('[data-id="h"]');
    expect(q('[data-hifi-bubble]')).not.toBeNull();
    await click('[data-card="Abbey_Road"]');
    expect(q('[data-opened-item="w2"]')).not.toBeNull();
    expect(q('[data-hifi-bubble]')).toBeNull();
  });

  it('toucher le poste en mode Visiter ouvre la bulle En lecture, ✕ la ferme', async () => {
    const view: PlayerView = { linked: true, hidden: false, enabled: true, card: { slug: 'Daft_Punk', title: 'Daft Punk' }, track: { uri: 'u', title: 'Aerodynamic', artist: 'Daft Punk', imageUrl: null, playing: true } };
    setPlayerSource({ current: () => view, subscribe: () => () => undefined, toggle: async () => undefined, setCard: () => undefined } as unknown as PlayerSource);
    await seed([{ id: 'd', kind: 'desk', col: 12, row: 10 }, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 }]);
    await click('[data-id="h"]');
    expect(q('[data-hifi-bubble]')?.textContent).toContain('Aerodynamic');
    await click('[data-hifi-bubble] [data-action="close"]');
    expect(q('[data-hifi-bubble]')).toBeNull();
  });

  it('second zoom : toucher un CD ouvre son boîtier, pas la fiche', async () => {
    await openShelfCd();
    expect(q('[data-opened-item="c"]')).not.toBeNull();
    expect(q('[data-opening="jewel-cd"]')).not.toBeNull();
    expect(doc('[data-room-card]')).toBeNull();
  });

  it('mur : un poster ouvre la fiche comme avant, un vinyle ouvre sa pochette', async () => {
    await seed([
      { id: 'w1', kind: 'wall', shape: 'poster', col: 4, row: 4, slug: 'Paris' },
      { id: 'w2', kind: 'wall', shape: 'vinyl', col: 12, row: 4, slug: 'Abbey_Road' },
    ]);
    await click('[data-card="Paris"]');
    expect(doc('[data-room-card="Paris"]')).not.toBeNull();
    expect(q('[data-opened-item]')).toBeNull();
    await click('[data-room-card="Paris"] [data-action="close"]');
    await click('[data-card="Abbey_Road"]');
    expect(q('[data-opened-item="w2"]')).not.toBeNull();
    expect(q('[data-opening="vinyl-sleeve"]')).not.toBeNull();
    expect(doc('[data-room-card]')).toBeNull();
  });

  it('ⓘ ouvre la fiche par-dessus ; le retour ferme d’abord la fiche, puis la couche (le zoom reste)', async () => {
    const zoomState = await openShelfCd();
    await click('[data-opened-item] [data-action="info"]');
    expect(doc('[data-room-card="Daft_Punk"]')).not.toBeNull();
    expect(q('[data-opened-item]')).not.toBeNull();
    await back(zoomState);
    expect(doc('[data-room-card]')).toBeNull();
    expect(q('[data-opened-item]')).not.toBeNull();
    expect(typeof history.state?.wmtOpened).toBe('string');
    await back(zoomState);
    expect(q('[data-opened-item] [data-item-case]')?.getAttribute('data-phase')).toBe('closing');
    expect(q('[data-shelf-board="0"]')).not.toBeNull();
  });

  it('Échap ferme la fiche d’abord, puis la couche, sans fermer le zoom', async () => {
    await openShelfCd();
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await click('[data-opened-item] [data-action="info"]');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(doc('[data-room-card]')).toBeNull();
    expect(q('[data-opened-item] [data-item-case]')?.getAttribute('data-phase')).not.toBe('closing');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q('[data-opened-item] [data-item-case]')?.getAttribute('data-phase')).toBe('closing');
    expect(q('[data-shelf-board="0"]')).not.toBeNull();
  });

  it('✕ ferme la couche ; le retour d’historique qui suit ne ferme pas le zoom', async () => {
    await openShelfCd();
    await click('[data-opened-item] [data-action="close"]');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(q('[data-opened-item] [data-item-case]')?.getAttribute('data-phase')).toBe('closing');
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).not.toBe('closing');
    expect(q('[data-shelf-board="0"]')).not.toBeNull();
  });

  it('sans poste : le disque tourne quand le lecteur joue une piste de cette carte', async () => {
    let view: PlayerView = { linked: true, hidden: false, enabled: true, card: { slug: 'Daft_Punk', title: 'Daft Punk' }, track: { uri: 'spotify:track:1', title: 'One More Time', artist: 'Daft Punk', imageUrl: null, playing: true } };
    const listeners = new Set<() => void>();
    setPlayerSource({ current: () => view, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); }, toggle: async () => undefined } as unknown as PlayerSource);
    await openShelfCd();
    expect(q('[data-case-disc]')?.getAttribute('data-disc')).toBe('spinning');
    view = { ...view, track: { ...view.track!, playing: false } };
    await act(async () => { listeners.forEach((l) => l()); });
    expect(q('[data-case-disc]')?.getAttribute('data-disc')).toBe('in');
  });
});

describe('LibraryPanel : boîtes de jeux', () => {
  const known = [{ slug: 'Zelda', title: 'Zelda' }, { slug: 'Daft_Punk', title: 'Daft Punk' }];
  const fakeCollection = { list: async () => known, subscribe: () => () => undefined } as unknown as CollectionRepo;
  const LAYOUT: Layout = [
    { id: 's', kind: 'shelf', col: 0, row: 6 },
    { id: 'g', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, slug: 'Zelda' },
    { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 1, slug: 'Daft_Punk' },
  ];
  const SWITCH: GameBox = { format: 'switch', style: { plastic: '#E60012', band: { color: '#E60012', label: 'NINTENDO SWITCH' } }, platformName: 'Nintendo Switch', shots: [], title: 'Zelda' };
  let listeners: Set<() => void>;
  let boxes: Record<string, GameBox | null>;
  let request: ReturnType<typeof vi.fn>;
  const seed = async () => {
    await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => LAYOUT)); });
    await settle();
  };
  const notify = () => act(async () => { listeners.forEach((l) => l()); await new Promise((resolve) => setTimeout(resolve, 0)); });
  beforeEach(() => {
    listeners = new Set();
    boxes = {};
    request = vi.fn();
    setGameBoxService({ peek: (slug: string) => boxes[slug], request, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); } } as unknown as GameBoxService);
  });
  afterEach(() => setGameBoxService(null));
  const game = () => repo.current()!.rooms[0]!.layout.find((p) => p.id === 'g');

  it('demande la boîte des jeux dessinés (pas des autres objets)', async () => {
    await seed();
    expect(request).toHaveBeenCalledWith('Zelda', 'Zelda');
    expect(request.mock.calls.every(([slug]) => slug === 'Zelda')).toBe(true);
  });

  it('un jeu dont la boîte est Switch est réécrit une seule fois (format + couleur), jamais en boucle', async () => {
    await seed();
    const update = vi.spyOn(repo, 'update');
    boxes.Zelda = SWITCH;
    await notify();
    expect(game()).toMatchObject({ box: 'switch', caseColor: '#E60012' });
    expect(update).toHaveBeenCalledTimes(1);
    await notify();
    await notify();
    expect(update).toHaveBeenCalledTimes(1);
    // Version changée (PS4) : une écriture de plus.
    boxes.Zelda = { ...SWITCH, format: 'bluray', style: { plastic: '#1F4C9E', band: { color: '#1F4C9E', label: 'PS4' } } };
    await notify();
    expect(game()).toMatchObject({ box: 'bluray', caseColor: '#1F4C9E' });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('« Présenter de dos » pour un jeu, pas pour un CD', async () => {
    await seed();
    await click('[data-action="edit"]');
    await click('[data-card="Zelda"]');
    const back = q('[data-action="display-back"]')!;
    expect(back.getAttribute('aria-label')).toBe('Présenter de dos');
    await click('[data-action="display-back"]');
    expect(q('[data-placement-bar] [data-action="display-back"]')!.getAttribute('aria-pressed')).toBe('true');
    await click('[data-action="place-confirm"]');
    expect(game()).toMatchObject({ display: 'back' });
    await click('[data-card="Daft_Punk"]');
    expect(q('[data-action="display-cover"]')).not.toBeNull();
    expect(q('[data-action="display-back"]')).toBeNull();
  });
});
