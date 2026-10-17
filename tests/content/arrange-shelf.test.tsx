// @vitest-environment jsdom
// Vue Modifier d'une étagère entière (✋) : meuble de face, zoom par tablette, glissé d'une tablette à l'autre (place verte / rouge,
// bord d'écran), retour Android, petits objets de tablette dessinés dans le zoom connu et dans la pièce.
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
import type { Layout, Room } from '../../src/core/library/library-types';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ArrangeShelf, boardFrameFor, boardPointPx, wholeBoardPx, wholeFrameFor, type ArrangeLevel } from '../../src/content/arrange/ArrangeShelf';
import { EDGE_MS, EDGE_PX } from '../../src/content/arrange/use-board-drag';
import { arrangeFrameFor, frameAt } from '../../src/content/arrange/ArrangeView';
import { topToScreen } from '../../src/core/library/arrange';
import { ShelfBoardZoom, SWIPE_PX } from '../../src/content/shelf-board-zoom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
const all = (selector: string) => Array.from(container.querySelectorAll(selector));
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
// jsdom n'a pas PointerEvent : un MouseEvent du même type, auquel on accroche le `pointerId` (1 = le doigt qui tient).
const pointer = (type: string, target: EventTarget, x: number, y: number, pointerId = 1) =>
  act(async () => {
    const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    target.dispatchEvent(ev);
  });

// Deux bibliothèques liées (s, t) : s porte 3 CD en haut, une lampe et un CD au milieu ; t un CD en haut.
const SHELVES: Layout = [
  { id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 't', kind: 'shelf', col: 4, row: 6 },
  { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'A' },
  { id: 'c2', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 1, slug: 'B' },
  { id: 'c3', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 2, slug: 'C' },
  { id: 'l', kind: 'small', item: 'lamp', hostId: 's', level: 1, order: 0 },
  { id: 'c4', kind: 'stored', shape: 'cd', shelfId: 's', level: 1, order: 1, slug: 'D' },
  { id: 'c5', kind: 'stored', shape: 'cd', shelfId: 't', level: 0, order: 0, slug: 'E' },
];
// La tablette du haut de t est pleine : 5 CD de face = 74 cm.
const FULL: Layout = [
  ...SHELVES,
  ...[1, 2, 3, 4].map((i): Layout[number] => ({ id: `t${i}`, kind: 'stored', shape: 'cd', shelfId: 't', level: 0, order: i, slug: `T${i}` })),
];
const CARDS = { A: { title: 'Album A' }, B: { title: 'Album B' }, C: { title: 'Album C' }, D: { title: 'Album D' }, E: { title: 'Album E' } };
const LAYER = { w: 800, h: 400 };
const IDS = ['s', 't'];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

type Spy = ReturnType<typeof vi.fn<(...args: any[]) => void>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Spies = { onBoard: Spy; onTop: Spy; onLevel: Spy; onClose: Spy };
function Host({ layout, spies, initial }: { layout: Layout; spies: Spies; initial: ArrangeLevel }) {
  const [level, setLevel] = useState<ArrangeLevel>(initial);
  return (
    <ArrangeShelf layout={layout} room={{ style: 'scandinave' }} shelfIds={IDS} level={level} cards={CARDS}
      onLevel={(l) => { spies.onLevel(l); setLevel(l); }} onBoard={spies.onBoard} onTop={spies.onTop} onClose={spies.onClose} />
  );
}
const mount = (layout: Layout = SHELVES, initial: ArrangeLevel = 'whole'): Spies => {
  const spies: Spies = { onBoard: vi.fn(), onTop: vi.fn(), onLevel: vi.fn(), onClose: vi.fn() };
  act(() => root.render(<Host layout={layout} spies={spies} initial={initial} />));
  return spies;
};
const level = () => q('[data-arrange-shelf]')?.getAttribute('data-arrange-level');

describe('✋ sur une étagère (LibraryPanel)', () => {
  let repo: LibraryRepo;
  let store: ReturnType<typeof createMemoryStore>;
  const seed = async (layout: Layout) => {
    store = createMemoryStore();
    repo = createLibraryRepo(store);
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };
  const openArrange = async () => {
    await click('[data-action="edit"]');
    await click('[data-furniture="shelf"][data-id="s"]');
    await click('[data-action="arrange"]');
  };

  it('ouvre le meuble entier de face, deux bibliothèques liées côte à côte', async () => {
    await seed(SHELVES);
    await openArrange();
    expect(q('[data-arrange-shelf]')).not.toBeNull();
    expect(level()).toBe('whole');
    expect(all('[data-arrange-shelf] [data-arrange-piece]').map((e) => e.getAttribute('data-arrange-piece'))).toEqual(['s', 't']);
    expect(q('[data-arrange-view]')).toBeNull();
  });

  it('la lampe d’une tablette est dessinée dans la pièce, dans l’étagère', async () => {
    await seed(SHELVES);
    expect(q('[data-shelf-items="s"] [data-furniture="small"][data-id="l"]')).not.toBeNull();
  });

  it('retour Android : en zoom → meuble entier (vue ouverte) ; au niveau entier → fermeture', async () => {
    await seed(SHELVES);
    await openArrange();
    await click('[data-arrange-shelf] [data-zoom-board="1"]');
    expect(level()).toBe('1');
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(level()).toBe('whole');
    expect(typeof history.state?.wmtArrange).toBe('string');
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(q('[data-arrange-shelf]')).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });

  it('un glissé en zoom passe par moveToBoard : la carte change de tablette dans le dépôt', async () => {
    await seed(SHELVES);
    await openArrange();
    await click('[data-arrange-shelf] [data-zoom-board="0"]');
    const f = boardFrameFor(SHELVES, IDS, 0, LAYER);
    const [x0, y0] = boardPointPx(f, 0, 7);
    const [x1, y1] = boardPointPx(f, 1, 40);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x1, y1);
    await pointer('pointerup', window, x1, y1);
    await settle();
    await settle();
    expect(repo.current()!.rooms[0]!.layout.find((p) => p.id === 'c1')).toMatchObject({ shelfId: 't', level: 0, order: 1 });
    // Elle survit à un rechargement : un nouveau dépôt sur le même stockage relit la carte sur l'autre tablette.
    const reloaded = await createLibraryRepo(store).load();
    expect(reloaded.rooms[0]!.layout.find((p) => p.id === 'c1')).toMatchObject({ shelfId: 't', level: 0, order: 1 });
  });
});

describe('niveaux : meuble entier, tablettes, dessus', () => {
  it('toucher une tablette ou une carte au niveau entier zoome dessus', async () => {
    const s = mount();
    await click('[data-zoom-board="2"]');
    expect(s.onLevel).toHaveBeenLastCalledWith(2);
    expect(level()).toBe('2');
    expect(q('[data-shelf-board="2"]')).not.toBeNull();
    await click('[data-action="board-up"]');
    expect(level()).toBe('1');
    await click('[data-action="board-up"]');
    expect(level()).toBe('0');
    // ▲ depuis la tablette 0 : le dessus (vue plongeante) ; ▼ depuis le dessus : la tablette 0.
    await click('[data-action="board-up"]');
    expect(s.onLevel).toHaveBeenLastCalledWith('top');
    expect(q('[data-arrange-view]')).not.toBeNull();
    await click('[data-action="board-down"]');
    expect(level()).toBe('0');
    expect(q('[data-arrange-view]')).toBeNull();
  });

  it('au niveau entier, toucher une carte zoome sur sa tablette', async () => {
    const s = mount();
    await click('[data-zoom-card="D"]');
    expect(s.onLevel).toHaveBeenLastCalledWith(1);
  });

  it('balayer verticalement dans le vide change de tablette ; balayer sur une carte la saisit', async () => {
    const s = mount(SHELVES, 0);
    const board = q('[data-shelf-board]')!;
    await pointer('pointerdown', board, 300, 300);
    await pointer('pointerup', board, 300, 300 - SWIPE_PX);
    expect(s.onLevel).toHaveBeenLastCalledWith(1);
    expect(level()).toBe('1');
    s.onLevel.mockClear();
    const card = q('[data-board-card="D"]')!;
    await pointer('pointerdown', card, 300, 300);
    await pointer('pointermove', window, 300, 300 - SWIPE_PX);
    expect(q('[data-arrange-held]')).not.toBeNull();
    await pointer('pointerup', window, 300, 300 - SWIPE_PX);
    expect(s.onLevel).not.toHaveBeenCalled();
  });

  it('calque tourné (écran en hauteur) : balayer le long de la verticale du calque (axe X) change de tablette, pas le long de l’axe Y', async () => {
    Object.assign(window, { innerWidth: 400, innerHeight: 800 });
    const s = mount(SHELVES, 0);
    const board = q('[data-shelf-board]')!;
    // Axe Y de l'écran = horizontale du calque : ignoré.
    await pointer('pointerdown', board, 200, 500);
    await pointer('pointerup', board, 200, 500 - SWIPE_PX - 20);
    expect(s.onLevel).not.toHaveBeenCalled();
    // ly = innerWidth − clientX : X qui croît = ly qui décroît = vers le haut du calque = tablette suivante.
    await pointer('pointerdown', board, 200, 500);
    await pointer('pointerup', board, 200 + SWIPE_PX + 20, 500);
    expect(s.onLevel).toHaveBeenLastCalledWith(1);
    expect(level()).toBe('1');
    // X qui décroît = vers le bas du calque = tablette précédente.
    const next = q('[data-shelf-board]')!;
    await pointer('pointerdown', next, 200, 500);
    await pointer('pointerup', next, 200 - SWIPE_PX - 20, 500);
    expect(s.onLevel).toHaveBeenLastCalledWith(0);
    expect(level()).toBe('0');
  });

  it('toucher une carte sans glisser en zoom ne fait rien pour l’instant', async () => {
    const s = mount(SHELVES, 0);
    const card = q('[data-board-card="A"]')!;
    await pointer('pointerdown', card, 300, 300);
    await pointer('pointerup', window, 301, 300);
    await click('[data-board-card="A"]');
    expect(s.onLevel).not.toHaveBeenCalled();
    expect(s.onBoard).not.toHaveBeenCalled();
    expect(q('[data-arrange-held]')).toBeNull();
  });
});

describe('glissé en zoom', () => {
  const f = boardFrameFor(SHELVES, IDS, 0, LAYER);

  it('glisser un CD entre deux objets : place verte ; lâcher : onBoard une fois avec le rang visé', async () => {
    const s = mount(SHELVES, 0);
    const [x0, y0] = boardPointPx(f, 0, 7);
    const [x1, y1] = boardPointPx(f, 0, 30);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-arrange-held]')).not.toBeNull();
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).toHaveBeenCalledTimes(1);
    expect(s.onBoard).toHaveBeenCalledWith('c1', 's', 0, 1);
    expect(q('[data-insert]')).toBeNull();
    // En attendant la disposition écrite, la carte est dessinée à sa nouvelle place (après B).
    expect(all('[data-board-shelf="s"] [data-board-card]').map((e) => e.getAttribute('data-board-card'))).toEqual(['B', 'A', 'C']);
  });

  it('tablette pleine : place rouge et message ; lâcher : rien, la carte revient', async () => {
    const s = mount(FULL, 0);
    const ff = boardFrameFor(FULL, IDS, 0, LAYER);
    const [x0, y0] = boardPointPx(ff, 0, 7);
    const [x1, y1] = boardPointPx(ff, 1, 40);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('false');
    expect(q('[data-arrange-message]')?.textContent).toBe('Plus de place sur cette tablette.');
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).not.toHaveBeenCalled();
    expect(q('[data-arrange-held]')).toBeNull();
    expect(all('[data-board-shelf="s"] [data-board-card]').map((e) => e.getAttribute('data-board-card'))).toEqual(['A', 'B', 'C']);
  });

  it('tenir une carte au bord bas pendant EDGE_MS : tablette suivante, carte toujours tenue ; lâcher : onBoard sur cette tablette', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = mount(SHELVES, 0);
    const [x0, y0] = boardPointPx(f, 0, 7);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x0, LAYER.h - EDGE_PX + 4);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS - 50); });
    expect(s.onLevel).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(60); });
    expect(s.onLevel).toHaveBeenLastCalledWith(1);
    expect(level()).toBe('1');
    expect(q('[data-arrange-held]')).not.toBeNull();
    // Sur la tablette 1 de s : après la lampe et le CD D.
    const f1 = boardFrameFor(SHELVES, IDS, 1, LAYER);
    const [x1, y1] = boardPointPx(f1, 0, 60);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).toHaveBeenCalledWith('c1', 's', 1, 2);
  });

  it('quitter le bord avant EDGE_MS : pas de changement de tablette', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = mount(SHELVES, 0);
    const [x0, y0] = boardPointPx(f, 0, 7);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x0, LAYER.h - 10);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS / 2); });
    await pointer('pointermove', window, x0, y0);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS * 2); });
    expect(s.onLevel).not.toHaveBeenCalled();
    await pointer('pointerup', window, x0, y0);
  });

  it('bord haut depuis la tablette 0 : le dessus ; une carte lâchée sur le dessus y est posée (onTop), dessinée là en vert', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = mount(SHELVES, 0);
    const [x0, y0] = boardPointPx(f, 0, 7);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x0, EDGE_PX - 4);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS + 10); });
    expect(s.onLevel).toHaveBeenLastCalledWith('top');
    expect(q('[data-arrange-view]')).not.toBeNull();
    const [x1, y1] = topToScreen(frameAt(arrangeFrameFor('shelf', LAYER, 2), 0), 40, 15);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    // En vert, la carte est dessinée sur le dessus (sur son trépied), à la place visée.
    expect(q('[data-arrange-view] [data-arrange-item="c1"]')).not.toBeNull();
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).not.toHaveBeenCalled();
    expect(s.onTop).toHaveBeenCalledTimes(1);
    expect(s.onTop).toHaveBeenCalledWith('c1', 's', expect.any(Number), expect.any(Number));
  });

  it('hors du dessus : rouge, avec le message du dessus, rien n’est appelé', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = mount(SHELVES, 0);
    const [x0, y0] = boardPointPx(f, 0, 7);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x0, EDGE_PX - 4);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS + 10); });
    await pointer('pointermove', window, 4, LAYER.h / 2);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('false');
    expect(q('[data-arrange-message]')?.textContent).toBe('Pas de place ici sur le dessus.');
    await pointer('pointerup', window, 4, LAYER.h / 2);
    expect(s.onTop).not.toHaveBeenCalled();
  });

  it('pointercancel ne demande rien', async () => {
    const s = mount(SHELVES, 0);
    const [x0, y0] = boardPointPx(f, 0, 7);
    const [x1, y1] = boardPointPx(f, 0, 30);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x1, y1);
    await pointer('pointercancel', window, x1, y1);
    expect(s.onBoard).not.toHaveBeenCalled();
    expect(q('[data-arrange-held]')).toBeNull();
  });
});

describe('rien ne bouge tant que la place n’est pas verte', () => {
  const f = boardFrameFor(SHELVES, IDS, 0, LAYER);
  const xOf = (slug: string) => q(`[data-board-card="${slug}"] rect`)?.getAttribute('x');

  it('visée rouge (tablette pleine) ou dans le vide : les autres objets gardent leur place, l’objet tenu reste estompé à la sienne', async () => {
    mount(FULL, 0);
    const ff = boardFrameFor(FULL, IDS, 0, LAYER);
    const before = { B: xOf('B'), C: xOf('C'), T1: xOf('T1') };
    const [x0, y0] = boardPointPx(ff, 0, 7);
    await pointer('pointerdown', q('[data-board-card="A"]')!, x0, y0);
    await pointer('pointermove', window, ...boardPointPx(ff, 1, 40));
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('false');
    expect({ B: xOf('B'), C: xOf('C'), T1: xOf('T1') }).toEqual(before);
    expect(q('[data-board-card="A"]')).not.toBeNull();
    // Dans le vide (hors des deux bibliothèques) : pas de visée, rien ne bouge non plus.
    await pointer('pointermove', window, 2, y0);
    expect(q('[data-insert]')).toBeNull();
    expect({ B: xOf('B'), C: xOf('C'), T1: xOf('T1') }).toEqual(before);
    await pointer('pointerup', window, 2, y0);
  });

  it('visée verte : la place s’ouvre, les voisins se resserrent', async () => {
    mount(SHELVES, 0);
    const bBefore = xOf('B');
    await pointer('pointerdown', q('[data-board-card="A"]')!, ...boardPointPx(f, 0, 7));
    await pointer('pointermove', window, ...boardPointPx(f, 0, 30));
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    expect(xOf('B')).not.toBe(bBefore);
    await pointer('pointerup', window, ...boardPointPx(f, 0, 30));
  });

  it('deux lâchers en attente sur la même tablette : le premier ne retombe pas quand le second réordonne', async () => {
    mount(SHELVES, 0);
    await pointer('pointerdown', q('[data-board-card="A"]')!, ...boardPointPx(f, 0, 7));
    await pointer('pointermove', window, ...boardPointPx(f, 0, 30));
    await pointer('pointerup', window, ...boardPointPx(f, 0, 30));
    // B A C. Puis C en tête : C B A, A toujours à sa place d'attente.
    await pointer('pointerdown', q('[data-board-card="C"]')!, ...boardPointPx(f, 0, 37));
    await pointer('pointermove', window, ...boardPointPx(f, 0, 1));
    await pointer('pointerup', window, ...boardPointPx(f, 0, 1));
    expect(all('[data-board-shelf="s"] [data-board-card]').map((e) => e.getAttribute('data-board-card'))).toEqual(['C', 'B', 'A']);
  });

  it('le fond de la pièce (sol) n’est dessiné qu’au niveau entier', async () => {
    mount(SHELVES, 0);
    expect(q('[data-backdrop="floor"]')).toBeNull();
    await click('[data-action="board-up"]');
    await click('[data-action="board-down"]');
    expect(level()).toBe('0');
  });
});

describe('deux dessus liés côte à côte', () => {
  const TOPS: Layout = [...SHELVES, { id: 'l2', kind: 'small', item: 'lamp', hostId: 't', level: 0, order: 1 }];
  const fit = arrangeFrameFor('shelf', LAYER, 2);
  const topPx = (i: number, x: number, z: number) => topToScreen(frameAt(fit, i), x, z);
  const liftToTop = async (s: Spies) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const f = boardFrameFor(TOPS, IDS, 0, LAYER);
    const [x0, y0] = boardPointPx(f, 1, 22);
    await pointer('pointerdown', q('[data-board-small="l2"]')!, x0, y0);
    await pointer('pointermove', window, x0, EDGE_PX - 4);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS + 10); });
    expect(s.onLevel).toHaveBeenLastCalledWith('top');
    expect(q('[data-arrange-view="s+t"]')).not.toBeNull();
  };

  it('la lampe montée depuis une tablette de la seconde bibliothèque se pose sur le second dessus', async () => {
    const s = mount(TOPS, 0);
    await liftToTop(s);
    const [x1, y1] = topPx(1, 40, 15);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    expect(q('[data-insert]')?.getAttribute('data-top')).toBe('t');
    await pointer('pointerup', window, x1, y1);
    expect(s.onTop).toHaveBeenCalledTimes(1);
    const [id, hostId, x, z] = s.onTop.mock.calls[0]!;
    expect([id, hostId]).toEqual(['l2', 't']);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(80);
    expect(z).toBeGreaterThanOrEqual(0);
    expect(z).toBeLessThan(30);
  });

  it('lâchée sur le premier dessus : le premier', async () => {
    const s = mount(TOPS, 0);
    await liftToTop(s);
    const [x1, y1] = topPx(0, 40, 15);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-top')).toBe('s');
    await pointer('pointerup', window, x1, y1);
    expect(s.onTop).toHaveBeenCalledWith('l2', 's', expect.any(Number), expect.any(Number));
  });
});

describe('objets d’un dessus : vers une tablette ou l’autre dessus', () => {
  // Une lampe et un CD posé (trépied) sur le dessus de s.
  const ON_TOP: Layout = [
    ...SHELVES,
    { id: 'lt', kind: 'small', item: 'lamp', hostId: 's', x: 40, z: 8 },
    { id: 'pz', kind: 'posed', shape: 'cd', hostId: 's', x: 4, z: 4, slug: 'Z' },
  ];
  const fit = arrangeFrameFor('shelf', LAYER, 2);
  const topPx = (i: number, x: number, z: number) => topToScreen(frameAt(fit, i), x, z);
  // Tenir l'objet `id` du dessus au bord bas pendant EDGE_MS : la vue passe à la tablette 0, l'objet reste tenu.
  const downToBoard = async (s: Spies, id: string, at: [number, number]) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await pointer('pointerdown', q(`[data-arrange-view] [data-arrange-item="${id}"]`)!, ...at);
    await pointer('pointermove', window, at[0], LAYER.h - EDGE_PX + 4);
    await act(async () => { vi.advanceTimersByTime(EDGE_MS + 10); });
    expect(s.onLevel).toHaveBeenLastCalledWith(0);
    expect(level()).toBe('0');
    // L'élément saisi (dans la vue du dessus) a disparu avec le changement de niveau : le glissé continue quand même.
    expect(q('[data-arrange-view]')).toBeNull();
    expect(q('[data-arrange-held]')).not.toBeNull();
  };

  it('la lampe du dessus tenue au bord bas descend à la tablette 0 ; lâchée là : onBoard (le glissé survit au changement de niveau)', async () => {
    const capture = vi.fn();
    Object.defineProperty(document.documentElement, 'setPointerCapture', { value: capture, configurable: true });
    const s = mount(ON_TOP, 'top');
    await downToBoard(s, 'lt', topPx(0, 47, 12));
    // Le doigt est capturé par la page dès le glissé : il n'est pas perdu quand l'élément saisi disparaît.
    expect(capture).toHaveBeenCalledWith(1);
    const f0 = boardFrameFor(ON_TOP, IDS, 0, LAYER);
    const [x1, y1] = boardPointPx(f0, 0, 60);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).toHaveBeenCalledTimes(1);
    expect(s.onBoard).toHaveBeenCalledWith('lt', 's', 0, 3);
    expect(s.onTop).not.toHaveBeenCalled();
    Reflect.deleteProperty(document.documentElement, 'setPointerCapture');
  });

  it('une carte posée sur le dessus descend sur une tablette : onBoard (elle y sera rangée)', async () => {
    const s = mount(ON_TOP, 'top');
    await downToBoard(s, 'pz', topPx(0, 11, 8));
    const f0 = boardFrameFor(ON_TOP, IDS, 0, LAYER);
    const [x1, y1] = boardPointPx(f0, 1, 30);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).toHaveBeenCalledWith('pz', 't', 0, 1);
  });

  it('un objet d’un dessus lâché sur l’autre dessus lié : onTop avec cet autre dessus', async () => {
    const s = mount(ON_TOP, 'top');
    await pointer('pointerdown', q('[data-arrange-view] [data-arrange-item="lt"]')!, ...topPx(0, 47, 12));
    const [x1, y1] = topPx(1, 40, 15);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    expect(q('[data-insert]')?.getAttribute('data-top')).toBe('t');
    await pointer('pointerup', window, x1, y1);
    expect(s.onTop).toHaveBeenCalledTimes(1);
    const [id, hostId] = s.onTop.mock.calls[0]!;
    expect([id, hostId]).toEqual(['lt', 't']);
  });

  it('sur son propre dessus : onTop sur le même dessus (déplacement au cm)', async () => {
    const s = mount(ON_TOP, 'top');
    await pointer('pointerdown', q('[data-arrange-view] [data-arrange-item="lt"]')!, ...topPx(0, 47, 12));
    const [x1, y1] = topPx(0, 67, 15);
    await pointer('pointermove', window, x1, y1);
    await pointer('pointerup', window, x1, y1);
    expect(s.onTop).toHaveBeenCalledWith('lt', 's', expect.any(Number), expect.any(Number));
  });
});

describe('gestes du meuble entier et Échap', () => {
  it('toucher un petit objet au niveau entier zoome sur sa tablette', async () => {
    const s = mount();
    await click('[data-zoom-small="l"]');
    expect(s.onLevel).toHaveBeenLastCalledWith(1);
  });

  it('Échap : en zoom, retour au meuble entier ; au meuble entier, fermeture', async () => {
    const s = mount(SHELVES, 1);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(level()).toBe('whole');
    expect(s.onClose).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it('Échap au niveau du dessus : retour au meuble entier', async () => {
    const s = mount(SHELVES, 'top');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(level()).toBe('whole');
    expect(s.onClose).not.toHaveBeenCalled();
  });
});

describe('glissé au niveau entier', () => {
  it('lâcher une carte sur une autre tablette : onBoard avec cette tablette', async () => {
    const s = mount();
    const f = wholeFrameFor(IDS, SHELVES, LAYER);
    const [x0, y0] = wholeBoardPx(f, 0, 0, 7);
    const [x1, y1] = wholeBoardPx(f, 1, 2, 10);
    await pointer('pointerdown', q('[data-zoom-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x1, y1);
    expect(q('[data-insert]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, x1, y1);
    expect(s.onBoard).toHaveBeenCalledWith('c1', 't', 2, 0);
    // Le glissé n'a pas zoomé (le clic qui suit non plus).
    await click('[data-zoom-card="A"]');
    expect(s.onLevel).not.toHaveBeenCalled();
  });

  it('au-dessus des tablettes (le dessus, de face) : refusé, rien n’est appelé', async () => {
    const s = mount();
    const f = wholeFrameFor(IDS, SHELVES, LAYER);
    const [x0, y0] = wholeBoardPx(f, 0, 0, 7);
    await pointer('pointerdown', q('[data-zoom-card="A"]')!, x0, y0);
    await pointer('pointermove', window, x0, f.oy - 4);
    expect(q('[data-arrange-held]')?.getAttribute('data-ok')).toBe('false');
    await pointer('pointerup', window, x0, f.oy - 4);
    expect(s.onBoard).not.toHaveBeenCalled();
    expect(s.onTop).not.toHaveBeenCalled();
  });
});

describe('petits objets de tablette hors Aménager', () => {
  it('ShelfBoardZoom dessine la lampe de la tablette', () => {
    const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout: SHELVES };
    act(() => root.render(<ShelfBoardZoom shelfIds={IDS} level={1} room={room} cards={CARDS} imageOf={() => undefined} onCard={() => undefined} onLevel={() => undefined} />));
    expect(q('[data-board-small="l"]')).not.toBeNull();
    expect(all('[data-board-shelf="s"] [data-board-card], [data-board-shelf="s"] [data-board-small]').map((e) => e.getAttribute('data-board-card') ?? e.getAttribute('data-board-small'))).toEqual(['l', 'D']);
  });
});
