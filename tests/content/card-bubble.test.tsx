// @vitest-environment jsdom
// Bulles unifiées de la vue Modifier : toucher un objet posé (carte ou petit objet) ouvre SA bulle (celle de la pièce : wmt-lib-bubble) ;
// le déplacement part seulement de ✥ Déplacer (objet armé, glissé, posé au lâcher en vert ; rouge : il revient). Carte : présentation /
// pose, format, ⓘ, 🗑 ; petit objet : 🗑, lampe. Refus avec le message habituel (jugé sur ce que l'on voit, ou rendu par l'écriture) ;
// chaque changement accepté part tout de suite comme une intention (id + changement). La bulle ne cache jamais son objet.
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
import { topToScreen } from '../../src/core/library/arrange';
import type { Layout } from '../../src/core/library/library-types';
import { layerFrame } from '../../src/core/library/opened-item';
import { setDisplayOf, setPose } from '../../src/core/library/room-grid';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ArrangeShelf, boardFrameFor, boardPointPx, type ArrangeLevel } from '../../src/content/arrange/ArrangeShelf';
import { boardBoxPx, boardRect } from '../../src/content/arrange/arrange-shelf-frames';
import { ArrangeView, NAV_PX, arrangeFrameFor } from '../../src/content/arrange/ArrangeView';
import { BUBBLE_GUESS, TOP_BAND, applyItemChange, bubbleSpot } from '../../src/content/arrange/CardBubble';
import { resetCoverChoices } from '../../src/content/arrange/use-card-bubble';
import { setCoverVersions } from '../../src/content/cover-versions';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';

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
// jsdom n'a pas PointerEvent : un MouseEvent du même type, auquel on accroche le `pointerId`.
const pointer = (type: string, target: EventTarget, x: number, y: number, pointerId = 1) =>
  act(async () => {
    const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    target.dispatchEvent(ev);
  });
// Toucher sans glisser (le doigt bouge de 2 px, sous le seuil du glissé).
async function tap(selector: string, x = 300, y = 200) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await pointer('pointerdown', el, x, y);
  await pointer('pointerup', el, x + 2, y);
  await settle();
}
// Glisser du point a au point b (px de l'écran), en deux pas.
async function drag(selector: string, [x0, y0]: [number, number], [x1, y1]: [number, number]) {
  await pointer('pointerdown', q(selector)!, x0, y0);
  await pointer('pointermove', window, (x0 + x1) / 2, (y0 + y1) / 2);
  await pointer('pointermove', window, x1, y1);
  await pointer('pointerup', window, x1, y1);
  await settle();
}
// Toucher l'objet puis ✥ Déplacer dans sa bulle : l'objet est armé.
async function arm(selector: string, x = 300, y = 200) {
  await tap(selector, x, y);
  await click('[data-arrange-bubble] [data-action="move"]');
}
const bubble = () => q('[data-arrange-bubble]');
const label = (l: string) => `[data-arrange-bubble] [aria-label="${l}"]`;

// Étagère s : tablette 0 = 4 CD de face + un livre sur la tranche (63 cm sur 74) ; tablette 1 = une lampe et un jeu.
const SHELF: Layout = [
  { id: 's', kind: 'shelf', col: 0, row: 6 },
  ...[0, 1, 2, 3].map((i): Layout[number] => ({ id: `c${i}`, kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: i, slug: `A${i}` })),
  { id: 'bk', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 4, slug: 'Livre' },
  { id: 'l', kind: 'small', item: 'lamp', hostId: 's', level: 1, order: 0 },
  { id: 'g', kind: 'stored', shape: 'game', shelfId: 's', level: 1, order: 1, slug: 'Jeu' },
];
// Bureau : un CD posé sur trépied devant à gauche, une lampe juste derrière (à plat, le CD la chevaucherait), une plante à droite.
const DESK: Layout = [
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'pc', kind: 'computer', deskId: 'd' },
  { id: 'k', kind: 'posed', shape: 'cd', hostId: 'd', x: 2, z: 2, slug: 'Kiki' },
  { id: 'lp', kind: 'small', item: 'lamp', hostId: 'd', x: 2, z: 13 },
  { id: 'pl', kind: 'small', item: 'plant', hostId: 'd', x: 100, z: 2 },
];
const LAYER = { w: 800, h: 400 };
const deskFrame = arrangeFrameFor('desk', LAYER);
// Déplacement écran (px) d'un point du plateau du bureau à un autre (cm).
const deskDelta = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
  const a = topToScreen(deskFrame, x0, z0);
  const b = topToScreen(deskFrame, x1, z1);
  return [b[0] - a[0], b[1] - a[1]];
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  setCoverVersions(null);
  resetCoverChoices();
  Reflect.deleteProperty(document.documentElement, 'setPointerCapture');
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

type Spy = ReturnType<typeof vi.fn<(...args: any[]) => any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Spies = { onItemEdit: Spy; onCardInfo: Spy; onClose: Spy; onLevel: Spy; onBoard: Spy; onTop: Spy; onMove: Spy };
const spiesOf = (): Spies => ({ onItemEdit: vi.fn(), onCardInfo: vi.fn(), onClose: vi.fn(), onLevel: vi.fn(), onBoard: vi.fn(), onTop: vi.fn(), onMove: vi.fn() });
function ShelfHost({ layout, spies, initial, sheetOpen }: { layout: Layout; spies: Spies; initial: ArrangeLevel; sheetOpen?: boolean }) {
  const [level, setLevel] = useState<ArrangeLevel>(initial);
  return (
    <ArrangeShelf layout={layout} room={{ style: 'scandinave' }} shelfIds={['s']} level={level}
      onLevel={(l) => { spies.onLevel(l); setLevel(l); }} onBoard={spies.onBoard} onTop={spies.onTop} onClose={spies.onClose}
      onItemEdit={spies.onItemEdit} onCardInfo={spies.onCardInfo} sheetOpen={sheetOpen} />
  );
}
const mountShelf = (layout: Layout = SHELF, initial: ArrangeLevel = 0, sheetOpen = false): Spies => {
  const spies = spiesOf();
  act(() => root.render(<ShelfHost layout={layout} spies={spies} initial={initial} sheetOpen={sheetOpen} />));
  return spies;
};
const mountDesk = (layout: Layout = DESK, spies = spiesOf()): Spies => {
  act(() => root.render(
    <ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="move" onMove={spies.onMove} onClose={spies.onClose}
      onItemEdit={spies.onItemEdit} onCardInfo={spies.onCardInfo} />,
  ));
  return spies;
};

describe('bubbleSpot : la bulle ne recouvre jamais son objet', () => {
  const size = { w: 300, h: 84 };
  const inside = (s: { left: number; top: number }, layer: { w: number; h: number }, right = 0) =>
    s.left >= 0 && s.top >= TOP_BAND && s.left + size.w <= layer.w - right && s.top + size.h <= layer.h;
  const apart = (s: { left: number; top: number }, a: { x: number; y: number; w: number; h: number }) =>
    s.left + size.w <= a.x || s.left >= a.x + a.w || s.top + size.h <= a.y || s.top >= a.y + a.h;

  it('dessous quand il y a la place', () => {
    const a = { x: 100, y: 80, w: 40, h: 60 };
    const s = bubbleSpot(a, size, LAYER);
    expect(s.side).toBe('below');
    expect(s.top).toBe(148);
    expect(apart(s, a)).toBe(true);
  });

  it('près du bas : au-dessus', () => {
    const a = { x: 100, y: 300, w: 40, h: 80 };
    const s = bubbleSpot(a, size, LAYER);
    expect(s.side).toBe('above');
    expect(apart(s, a) && inside(s, LAYER)).toBe(true);
  });

  it('près du bord droit : décalée à gauche, hors de la bande ▲ ▼ réservée', () => {
    const a = { x: 700, y: 80, w: 40, h: 60 };
    const s = bubbleSpot(a, size, LAYER, NAV_PX);
    expect(s.side).toBe('below');
    expect(s.left + size.w).toBeLessThanOrEqual(LAYER.w - NAV_PX);
    expect(inside(s, LAYER, NAV_PX)).toBe(true);
  });

  it('ni dessous ni dessus : à côté (droite, sinon gauche)', () => {
    const tall = { x: 100, y: 70, w: 60, h: 300 };
    const r = bubbleSpot(tall, size, LAYER, NAV_PX);
    expect(r.side).toBe('right');
    expect(apart(r, tall) && inside(r, LAYER, NAV_PX)).toBe(true);
    const tallRight = { x: 400, y: 70, w: 60, h: 300 };
    const l = bubbleSpot(tallRight, size, LAYER, NAV_PX);
    expect(l.side).toBe('left');
    expect(apart(l, tallRight) && inside(l, LAYER, NAV_PX)).toBe(true);
  });

  // Téléphone étroit / calque tourné (760 × 360) : la tablette zoomée remplit la hauteur, ni dessous ni dessus ne tiennent.
  const NARROW = { w: 760, h: 360 };
  const STRIP_COL = { x: 330, y: 62, w: 100, h: 290 };
  // Rectangle rendu : largeur bornée par maxWidth, hauteur multipliée par les rangées en plus.
  const rectOf = (s: ReturnType<typeof bubbleSpot>, sz: { w: number; h: number }) => {
    const w = Math.min(sz.w, s.maxWidth);
    return { x: s.left, y: s.top, w, h: sz.h * Math.ceil(sz.w / w) };
  };
  const hits = (r: { x: number; y: number; w: number; h: number }, a: { x: number; y: number; w: number; h: number }) =>
    !(r.x + r.w <= a.x || r.x >= a.x + a.w || r.y + r.h <= a.y || r.y >= a.y + a.h);
  for (const [name, sz] of [['une rangée', { w: 420, h: 46 }], ['avec la ligne du message', { w: 420, h: 76 }], ['jeu sur deux rangées', { w: 300, h: 88 }]] as const) {
    it(`760 × 360, carte au milieu (${name}) : à côté, rétrécie, jamais sur la colonne de la carte`, () => {
      const s = bubbleSpot(STRIP_COL, sz, NARROW, NAV_PX);
      expect(s.side).not.toBe('over');
      expect(s.maxWidth).toBeGreaterThanOrEqual(120);
      const r = rectOf(s, sz);
      expect(hits(r, STRIP_COL)).toBe(false);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(NARROW.w - NAV_PX);
    });
  }

  it('calque tourné 360 × 760 → 760 × 360 : même placement à côté', () => {
    const layer = layerFrame({ w: 360, h: 760 });
    const sz = { w: 420, h: 46 };
    const s = bubbleSpot(STRIP_COL, sz, layer, NAV_PX);
    expect(s.side).not.toBe('over');
    expect(hits(rectOf(s, sz), STRIP_COL)).toBe(false);
  });

  it('moins de 120 px de chaque côté : seul cas documenté où la bulle passe par-dessus (en bas du calque)', () => {
    const wide = { x: 16, y: 62, w: 620, h: 290 };
    const s = bubbleSpot(wide, { w: 420, h: 46 }, NARROW, NAV_PX);
    expect(s.side).toBe('over');
    expect(s.top + 46).toBeLessThanOrEqual(NARROW.h);
  });

  it('calque tourné (écran en hauteur) : le calque paysage, la bulle y reste', () => {
    const layer = layerFrame({ w: 412, h: 915 });
    expect(layer.rotated).toBe(true);
    const a = { x: 820, y: 300, w: 60, h: 90 };
    const s = bubbleSpot(a, size, layer, NAV_PX);
    expect(apart(s, a) && inside(s, layer, NAV_PX)).toBe(true);
  });
});

describe('bulle d’une carte rangée (zoom d’une tablette)', () => {
  it('toucher une carte ouvre sa bulle (celle de la pièce) : ✥, présentation, quatre formats, ⓘ, 🗑', async () => {
    mountShelf();
    await tap('[data-board-card="A1"]');
    expect(bubble()?.getAttribute('data-arrange-bubble')).toBe('c1');
    expect(bubble()?.classList.contains('wmt-lib-bubble')).toBe(true);
    expect(q(label('Déplacer'))).not.toBeNull();
    expect(q(label('Retirer'))).not.toBeNull();
    expect(q(label('Présenter de face'))?.getAttribute('aria-pressed')).toBe('true');
    expect(q(label('Présenter sur la tranche'))?.getAttribute('aria-pressed')).toBe('false');
    expect(q(label('Présenter de dos'))).toBeNull();
    expect(q(label('Sur un trépied'))).toBeNull();
    for (const [name, glyph] of [['CD', '💿'], ['DVD', '📀'], ['Jeu vidéo', '🎮'], ['Livre', '📖']]) {
      const b = q(label(name!));
      expect(b?.getAttribute('title'), name).toBe(name);
      expect(b?.textContent).toBe(glyph);
    }
    expect(q(label('CD'))?.getAttribute('aria-pressed')).toBe('true');
    for (const b of all('[data-arrange-bubble] button')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(b.getAttribute('title')).toBe(b.getAttribute('aria-label'));
    }
  });

  it('la bulle ne recouvre ni la carte ni son titre (toute la hauteur de la tablette), ni la bande ▲ ▼', async () => {
    mountShelf();
    await tap('[data-board-card="A1"]');
    const f = boardFrameFor(SHELF, ['s'], 0, LAYER);
    const strip = boardRect(f);
    const card = boardBoxPx(f, 0, 'c1')!;
    const el = bubble() as HTMLElement;
    const [left, top] = [parseFloat(el.style.left), parseFloat(el.style.top)];
    const { w, h } = BUBBLE_GUESS;
    // La tablette zoomée remplit presque tout le calque : la bulle passe à côté de la colonne de la carte (carte + titre).
    const apart = left + w <= card.x || left >= card.x + card.w || top + h <= strip.y || top >= strip.y + strip.h;
    expect(apart).toBe(true);
    expect(left + w).toBeLessThanOrEqual(LAYER.w - NAV_PX);
  });

  it('un jeu se présente aussi de dos', async () => {
    mountShelf(SHELF, 1);
    await tap('[data-board-card="Jeu"]');
    expect(q(label('Présenter de dos'))).not.toBeNull();
    expect(q(label('Jeu vidéo'))?.getAttribute('aria-pressed')).toBe('true');
  });

  it('un changement accepté part tout de suite comme une intention (id + changement)', async () => {
    const spies = mountShelf();
    await tap('[data-board-card="A1"]');
    await click(label('Présenter sur la tranche'));
    expect(spies.onItemEdit).toHaveBeenCalledTimes(1);
    expect(spies.onItemEdit).toHaveBeenCalledWith('c1', { display: 'spine' });
    await click(label('DVD'));
    expect(spies.onItemEdit).toHaveBeenLastCalledWith('c1', { shape: 'dvd' });
    expect(applyItemChange(SHELF, 'c1', { shape: 'dvd' })?.find((p) => p.id === 'c1')).toMatchObject({ shape: 'dvd' });
  });

  it('un changement refusé affiche « Plus de place sur cette tablette. » et ne change rien', async () => {
    expect(setDisplayOf(SHELF, 'bk', 'cover')).toBeNull();
    const spies = mountShelf();
    await tap('[data-board-card="Livre"]');
    await click(label('Présenter de face'));
    expect(spies.onItemEdit).not.toHaveBeenCalled();
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Plus de place sur cette tablette.');
    expect(q(label('Présenter sur la tranche'))?.getAttribute('aria-pressed')).toBe('true');
  });

  it('l’écriture refuse (la disposition a changé entre-temps) : le message s’affiche dans la bulle', async () => {
    const spies = mountShelf();
    spies.onItemEdit.mockResolvedValue(false);
    await tap('[data-board-card="A1"]');
    await click(label('DVD'));
    await settle();
    expect(spies.onItemEdit).toHaveBeenCalledTimes(1);
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Plus de place sur cette tablette.');
  });

  it('ⓘ ouvre la fiche de la carte ; 🗑 la retire et ferme la bulle', async () => {
    const spies = mountShelf();
    await tap('[data-board-card="A2"]');
    await click(label('Fiche de la carte'));
    expect(spies.onCardInfo).toHaveBeenCalledWith('A2');
    await click(label('Retirer'));
    expect(spies.onItemEdit).toHaveBeenCalledWith('c2', { remove: true });
    expect(bubble()).toBeNull();
  });

  it('toucher une lampe ouvre sa bulle : ✥, 🗑, allumer ; pas de format', async () => {
    const spies = mountShelf(SHELF, 1);
    await tap('[data-board-small="l"]');
    expect(bubble()?.getAttribute('data-arrange-bubble')).toBe('l');
    expect(q(label('Déplacer'))).not.toBeNull();
    expect(q(label('CD'))).toBeNull();
    expect(q(label('Fiche de la carte'))).toBeNull();
    const lampLabel = q(label('Allumer la lampe')) ? 'Allumer la lampe' : 'Éteindre la lampe';
    await click(label(lampLabel));
    expect(spies.onItemEdit).toHaveBeenCalledWith('l', { lamp: true });
    await click(label('Retirer'));
    expect(spies.onItemEdit).toHaveBeenLastCalledWith('l', { remove: true });
  });

  it('appuyer et glisser un objet pas armé ne déplace rien (ni bulle)', async () => {
    const spies = mountShelf();
    const f = boardFrameFor(SHELF, ['s'], 0, LAYER);
    await drag('[data-board-card="A0"]', boardPointPx(f, 0, 7), boardPointPx(f, 0, 50));
    expect(spies.onBoard).not.toHaveBeenCalled();
    expect(q('[data-arrange-held]')).toBeNull();
    expect(bubble()).toBeNull();
  });

  it('✥ Déplacer arme la carte (cerclée), le glissé la pose au lâcher, une seule fois, puis elle est désarmée', async () => {
    const spies = mountShelf();
    const f = boardFrameFor(SHELF, ['s'], 0, LAYER);
    const from = boardPointPx(f, 0, 7);
    await arm('[data-board-card="A0"]', ...from);
    expect(bubble()).toBeNull();
    expect(q('[data-armed]')).not.toBeNull();
    await drag('[data-board-card="A0"]', from, boardPointPx(f, 0, 50));
    expect(spies.onBoard).toHaveBeenCalledTimes(1);
    expect(spies.onBoard.mock.calls[0]![0]).toBe('c0');
    expect(q('[data-armed]')).toBeNull();
  });

  it('✕, Échap et un toucher ailleurs ferment la bulle (la vue reste)', async () => {
    const spies = mountShelf();
    await tap('[data-board-card="A1"]');
    await click(label('Fermer la bulle'));
    expect(bubble()).toBeNull();
    await tap('[data-board-card="A1"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(bubble()).toBeNull();
    expect(spies.onLevel).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    await tap('[data-board-card="A1"]');
    await pointer('pointerdown', q('[data-arrange-shelf]')!, 20, 380);
    expect(bubble()).toBeNull();
  });

  it('un appui sur un autre objet pas armé qui devient un mouvement ferme la bulle', async () => {
    mountShelf();
    await tap('[data-board-card="A1"]');
    expect(bubble()).not.toBeNull();
    const f = boardFrameFor(SHELF, ['s'], 0, LAYER);
    const [x, y] = boardPointPx(f, 0, 40);
    await pointer('pointerdown', q('[data-board-card="A2"]')!, x, y);
    await pointer('pointermove', window, x + 30, y);
    expect(bubble()).toBeNull();
    await pointer('pointerup', window, x + 30, y);
  });

  it('un appui dans le vide désarme l’objet armé ; un appui sur l’objet armé le garde', async () => {
    mountShelf();
    const f = boardFrameFor(SHELF, ['s'], 0, LAYER);
    const at = boardPointPx(f, 0, 7);
    await arm('[data-board-card="A0"]', ...at);
    expect(q('[data-armed]')).not.toBeNull();
    await pointer('pointerdown', q('[data-board-card="A0"]')!, ...at);
    expect(q('[data-armed]')).not.toBeNull();
    await pointer('pointerup', window, ...at);
    await arm('[data-board-card="A0"]', ...at);
    await pointer('pointerdown', q('[data-arrange-shelf]')!, 20, 380);
    expect(q('[data-armed]')).toBeNull();
  });

  it('Échap avec une fiche ouverte par-dessus : seule la fiche est concernée (la bulle reste, pas de dézoom)', async () => {
    const spies = mountShelf(SHELF, 0, true);
    await tap('[data-board-card="A1"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(bubble()).not.toBeNull();
    expect(spies.onLevel).not.toHaveBeenCalled();
  });

  it('au meuble entier, toucher une carte zoome sur sa tablette (pas de bulle)', async () => {
    const spies = mountShelf(SHELF, 'whole');
    const card = q('[data-zoom-card="A1"]')!;
    await pointer('pointerdown', card, 300, 200);
    await pointer('pointerup', card, 300, 200);
    await act(async () => { card.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    expect(spies.onLevel).toHaveBeenCalledWith(0);
    expect(bubble()).toBeNull();
  });
});

describe('bulle d’un objet posé (bureau, dessus)', () => {
  it('carte : trépied / à plat, la pose actuelle pressée ; pas de face / tranche ; la bulle ne recouvre pas la carte', async () => {
    const spies = mountDesk();
    await tap('[data-arrange-item="k"]');
    expect(bubble()?.getAttribute('data-arrange-bubble')).toBe('k');
    expect(bubble()?.getAttribute('data-side')).not.toBe('over');
    expect(q(label('Sur un trépied'))?.getAttribute('aria-pressed')).toBe('true');
    expect(q(label('À plat'))?.getAttribute('aria-pressed')).toBe('false');
    expect(q(label('Présenter de face'))).toBeNull();
    await click(label('DVD'));
    expect(spies.onItemEdit).toHaveBeenCalledWith('k', { shape: 'dvd' });
  });

  it('à plat refusé (la lampe derrière) : « Pas de place ici sur le dessus. », rien ne change', async () => {
    expect(setPose(DESK, 'k', 'flat')).toBeNull();
    const spies = mountDesk();
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(spies.onItemEdit).not.toHaveBeenCalled();
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Pas de place ici sur le dessus.');
  });

  it('à plat accepté sans la lampe : intention { pose: "flat" }', async () => {
    const spies = mountDesk(DESK.filter((p) => p.id !== 'lp'));
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(spies.onItemEdit).toHaveBeenCalledWith('k', { pose: 'flat' });
  });

  it('le refus se juge sur ce que l’on voit : une lampe lâchée derrière la carte (écriture en cours) bloque « à plat »', async () => {
    const layout: Layout = [...DESK.filter((p) => p.id !== 'lp'), { id: 'lp', kind: 'small', item: 'lamp', hostId: 'd', x: 2, z: 40 }];
    expect(setPose(layout, 'k', 'flat')).not.toBeNull();
    const spies = spiesOf();
    spies.onMove.mockReturnValue(new Promise(() => undefined));
    mountDesk(layout, spies);
    await arm('[data-arrange-item="lp"]');
    const [dx, dy] = deskDelta(2, 40, 2, 13);
    await drag('[data-arrange-item="lp"]', [300, 200], [300 + dx, 200 + dy]);
    expect(spies.onMove).toHaveBeenCalledWith('lp', 2, 13);
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(spies.onItemEdit).not.toHaveBeenCalled();
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Pas de place ici sur le dessus.');
  });

  it('petit objet : la plante a ✥ et 🗑, l’ordinateur n’ouvre rien', async () => {
    mountDesk();
    await tap('[data-arrange-item="pc"]');
    expect(bubble()).toBeNull();
    await tap('[data-arrange-item="pl"]');
    expect(bubble()?.getAttribute('data-arrange-bubble')).toBe('pl');
    expect(q(label('Déplacer'))).not.toBeNull();
    expect(q(label('Retirer'))).not.toBeNull();
    expect(q(label('Allumer la lampe'))).toBeNull();
  });

  it('glisser un objet pas armé ne déplace rien ; armé, le glissé vert le pose une fois ; rouge, il revient', async () => {
    const spies = spiesOf();
    // Écriture terminée sans changer la disposition : la plante revient, on peut la réarmer.
    spies.onMove.mockResolvedValue(undefined);
    mountDesk(DESK, spies);
    const [dx, dy] = deskDelta(100, 2, 60, 2);
    await drag('[data-arrange-item="pl"]', [300, 200], [300 + dx, 200 + dy]);
    expect(spies.onMove).not.toHaveBeenCalled();
    await arm('[data-arrange-item="pl"]');
    expect(q('[data-armed="pl"]')).not.toBeNull();
    await drag('[data-arrange-item="pl"]', [300, 200], [300 + dx, 200 + dy]);
    expect(spies.onMove).toHaveBeenCalledTimes(1);
    expect(spies.onMove).toHaveBeenCalledWith('pl', 60, 2);
    expect(q('[data-armed]')).toBeNull();
    // Rouge : la plante amenée sur la carte k ; rien n'est demandé.
    await arm('[data-arrange-item="pl"]');
    const [rx, ry] = deskDelta(100, 2, 3, 2);
    await drag('[data-arrange-item="pl"]', [300, 200], [300 + rx, 200 + ry]);
    expect(spies.onMove).toHaveBeenCalledTimes(1);
  });

  it('la carte en attente du mode ＋ n’ouvre pas de bulle (elle se glisse directement)', async () => {
    const spies = spiesOf();
    act(() => root.render(
      <ArrangeView layout={DESK} room={{ style: 'scandinave' }} hostId="d" mode="add" onMove={spies.onMove} onClose={spies.onClose}
        add={{ cards: [{ slug: 'Paris', title: 'Paris' }], categoryOf: () => 'music', initial: { slug: 'Paris', shape: 'cd' }, onAdd: () => undefined }}
        onItemEdit={spies.onItemEdit} onCardInfo={spies.onCardInfo} />,
    ));
    const at = q('[data-pending]')?.getAttribute('data-at');
    await tap('[data-pending]');
    expect(bubble()).toBeNull();
    const [x, z] = at!.split(',').map(Number);
    const [dx, dy] = deskDelta(x!, z!, 60, 30);
    await drag('[data-pending]', [300, 200], [300 + dx, 200 + dy]);
    expect(q('[data-pending]')?.getAttribute('data-at')).toBe('60,30');
  });

  it('sur le dessus d’une étagère : la bulle s’ouvre aussi', async () => {
    const layout: Layout = [...SHELF, { id: 'pz', kind: 'posed', shape: 'cd', hostId: 's', x: 30, z: 5, slug: 'Haut' }];
    mountShelf(layout, 'top');
    await tap('[data-arrange-item="pz"]');
    expect(bubble()?.getAttribute('data-arrange-bubble')).toBe('pz');
    expect(q(label('Sur un trépied'))).not.toBeNull();
  });
});

describe('bulles branchées dans LibraryPanel', () => {
  let repo: LibraryRepo;
  const seed = async (layout: Layout) => {
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };
  const stored = () => repo.current()!.rooms[0]!.layout;
  const openDesk = async () => {
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="arrange"]');
  };

  it('à plat, lampe, ✥ puis glissé, 🗑 : écrits dans le dépôt ; le retour ferme la bulle d’abord, puis la vue', async () => {
    await seed([...DESK.filter((p) => p.id !== 'lp'), { id: 'lp', kind: 'small', item: 'lamp', hostId: 'd', x: 60, z: 20 }]);
    await openDesk();
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(stored().find((p) => p.id === 'k')).toMatchObject({ pose: 'flat' });
    expect(q(label('À plat'))?.getAttribute('aria-pressed')).toBe('true');
    await tap('[data-arrange-item="lp"]');
    const litBefore = q(label('Éteindre la lampe')) !== null;
    await click(label(litBefore ? 'Éteindre la lampe' : 'Allumer la lampe'));
    expect(q(label(litBefore ? 'Allumer la lampe' : 'Éteindre la lampe'))).not.toBeNull();
    await click(label('Déplacer'));
    const [dx, dy] = deskDelta(60, 20, 70, 20);
    await drag('[data-arrange-item="lp"]', [300, 200], [300 + dx, 200 + dy]);
    await settle();
    expect(stored().find((p) => p.id === 'lp')).toMatchObject({ x: 70, z: 20 });
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await tap('[data-arrange-item="k"]');
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(bubble()).toBeNull();
    expect(q('[data-arrange-view]')).not.toBeNull();
    await tap('[data-arrange-item="k"]');
    await click(label('Retirer'));
    expect(stored().some((p) => p.id === 'k')).toBe(false);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(q('[data-arrange-view]')).toBeNull();
  });
});

describe('bulle d’une carte : choisir la pochette, changer de carte', () => {
  const V1 = 'https://img.example/v1.jpg';
  const V2 = 'https://img.example/v2.jpg';
  const COLLECTION = [{ slug: 'A0', title: 'A0' }, { slug: 'Zappa', title: 'Zappa' }, { slug: 'Matrix', title: 'Matrix' }, { slug: 'Dune', title: 'Dune' }];
  const SWAP = { cards: COLLECTION, categoryOf: (slug: string) => (slug === 'Matrix' ? 'film' as const : slug === 'Dune' ? 'books' as const : 'music' as const) };
  // Versions renvoyées à la demande (resolve) : la recherche reste « en cours » jusque-là.
  const deferredVersions = () => {
    let resolve: (urls: string[]) => void = () => undefined;
    const fn = vi.fn((_card: { slug: string; title: string }, _shape: string) => new Promise<string[]>((r) => { resolve = r; }));
    setCoverVersions(fn);
    return { fn, resolve: (urls: string[]) => act(async () => { resolve(urls); await Promise.resolve(); }) };
  };
  const mountSwap = (layout: Layout, level: ArrangeLevel = 0) => {
    const spies = spiesOf();
    act(() => root.render(
      <ArrangeShelf layout={layout} room={{ style: 'scandinave' }} shelfIds={['s']} level={level} onLevel={spies.onLevel} onBoard={spies.onBoard} onTop={spies.onTop}
        onClose={spies.onClose} onItemEdit={spies.onItemEdit} onCardInfo={spies.onCardInfo} swap={SWAP} />,
    ));
    return spies;
  };

  it('pendant la recherche : bouton actif et indicateur ; puis la réglette des versions ; une vignette enregistre { cover }', async () => {
    const v = deferredVersions();
    const spies = mountSwap(SHELF);
    await tap('[data-board-card="A1"]');
    expect(v.fn).toHaveBeenCalledWith({ slug: 'A1', title: 'A1' }, 'cd');
    const choose = q(label('Choisir la pochette')) as HTMLButtonElement;
    expect(choose.disabled).toBe(false);
    await click(label('Choisir la pochette'));
    expect(q('[data-arrange-bubble] [data-cover-loading]')).not.toBeNull();
    expect(all('[data-arrange-bubble] [data-cover-choice]')).toHaveLength(0);
    await v.resolve([V1, V2]);
    await settle();
    expect(q('[data-arrange-bubble] [data-cover-loading]')).toBeNull();
    expect(all('[data-arrange-bubble] [data-cover-choice]').map((b) => b.getAttribute('data-cover-choice'))).toEqual([V1, V2]);
    expect(q('[data-arrange-bubble] [data-cover-choice] img')?.getAttribute('src')).toBe(V1);
    // Sans pochette choisie : « Pochette d'origine » est la pochette actuelle (enfoncée, rien à effacer).
    expect(q(label('Pochette d’origine'))?.getAttribute('aria-pressed')).toBe('true');
    await click(`[data-arrange-bubble] [data-cover-choice="${V2}"]`);
    expect(spies.onItemEdit).toHaveBeenCalledWith('c1', { cover: V2 });
    for (const b of all('[data-arrange-bubble] button')) expect(b.getAttribute('title'), b.outerHTML).toBe(b.getAttribute('aria-label'));
  });

  it('pochette déjà choisie : sa vignette enfoncée ; « ↺ Pochette d’origine » l’efface ({ cover: null })', async () => {
    setCoverVersions(async () => [V1, V2]);
    const layout = SHELF.map((p) => (p.id === 'c1' && p.kind === 'stored' ? { ...p, cover: V2 } : p));
    const spies = mountSwap(layout);
    await tap('[data-board-card="A1"]');
    await click(label('Choisir la pochette'));
    expect(q(`[data-arrange-bubble] [data-cover-choice="${V2}"]`)?.getAttribute('aria-pressed')).toBe('true');
    expect(q(label('Pochette d’origine'))?.getAttribute('aria-pressed')).toBe('false');
    expect(q(label('Pochette d’origine'))?.textContent).toContain('↺');
    await click(label('Pochette d’origine'));
    expect(spies.onItemEdit).toHaveBeenCalledWith('c1', { cover: null });
  });

  it('aucune version trouvée : « Choisir la pochette » grisé', async () => {
    const v = deferredVersions();
    mountSwap(SHELF);
    await tap('[data-board-card="A2"]');
    await v.resolve([]);
    await settle();
    expect((q(label('Choisir la pochette')) as HTMLButtonElement).disabled).toBe(true);
  });

  it('🔄 Changer de carte : la réglette des cartes pas encore dans la pièce ; une carte remplace l’objet ({ swap, shape })', async () => {
    const spies = mountSwap(SHELF);
    await tap('[data-board-card="A1"]');
    expect(q(label('Changer de carte'))?.textContent).toBe('🔄');
    await click(label('Changer de carte'));
    expect(all('[data-arrange-bubble] [data-strip-card]').map((b) => b.getAttribute('data-strip-card'))).toEqual(['Dune', 'Matrix', 'Zappa']);
    await click('[data-arrange-bubble] [data-strip-card="Zappa"]');
    expect(spies.onItemEdit).toHaveBeenCalledWith('c1', { swap: 'Zappa', shape: 'cd' });
  });

  it('la nouvelle carte ne tient pas (livre parmi 30 DVD sur la tranche) : message dans la bulle, rien ne part', async () => {
    const full: Layout = [{ id: 's', kind: 'shelf', col: 0, row: 6 }, ...Array.from({ length: 30 }, (_, i): Layout[number] => ({ id: `d${i}`, kind: 'stored', shape: 'dvd', shelfId: 's', level: 1, order: i, display: 'spine', slug: `F${i}` }))];
    const spies = mountSwap(full, 1);
    await tap('[data-board-card="F29"]');
    await click(label('Changer de carte'));
    await click('[data-arrange-bubble] [data-strip-card="Dune"]');
    expect(spies.onItemEdit).not.toHaveBeenCalled();
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Plus de place sur cette tablette.');
  });

  it('sans Collection branchée (bulle sans `swap`) : pas de 🔄 ; un petit objet n’a ni pochette ni 🔄', async () => {
    mountShelf(SHELF, 1);
    await tap('[data-board-card="Jeu"]');
    expect(q(label('Changer de carte'))).toBeNull();
    expect(q(label('Choisir la pochette'))).not.toBeNull();
    mountSwap(SHELF, 1);
    await tap('[data-board-small="l"]');
    expect(q(label('Changer de carte'))).toBeNull();
    expect(q(label('Choisir la pochette'))).toBeNull();
  });

  describe('branchées dans LibraryPanel', () => {
    const KNOWN = [{ slug: 'Kiki', title: 'Kiki', imageUrl: 'https://img.example/kiki.jpg' }, { slug: 'Paris', title: 'Paris' }];
    const collection = { list: async () => KNOWN, subscribe: () => () => undefined } as unknown as CollectionRepo;
    let repo: LibraryRepo;
    const stored = () => repo.current()!.rooms[0]!.layout;

    it('la pochette choisie est écrite sur l’objet seul et dessinée ; la fiche de la carte garde son image ; changer de carte garde la place', async () => {
      setCoverVersions(async () => [V1]);
      repo = createLibraryRepo(createMemoryStore());
      await act(async () => { root.render(<LibraryPanel library={repo} collection={collection} />); });
      await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => DESK.filter((p) => p.id !== 'lp'))); });
      await settle();
      await click('[data-action="edit"]');
      await click('[data-furniture="desk"]');
      await click('[data-action="arrange"]');
      await tap('[data-arrange-item="k"]');
      await click(label('Choisir la pochette'));
      await click(`[data-arrange-bubble] [data-cover-choice="${V1}"]`);
      expect(stored().find((p) => p.id === 'k')).toMatchObject({ slug: 'Kiki', cover: V1 });
      expect(q('[data-arrange-item="k"] image')?.getAttribute('href')).toBe(V1);
      expect(q('[data-furniture="posed"][data-id="k"] image')?.getAttribute('href')).toBe(V1);
      await click(label('Fiche de la carte'));
      expect(q('[data-room-card="Kiki"] img')?.getAttribute('src')).toBe('https://img.example/kiki.jpg');
    });

    it('🔄 Changer de carte écrit la nouvelle carte à la même place (pochette effacée)', async () => {
      setCoverVersions(async () => []);
      repo = createLibraryRepo(createMemoryStore());
      await act(async () => { root.render(<LibraryPanel library={repo} collection={collection} />); });
      await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => DESK.filter((p) => p.id !== 'lp').map((p) => (p.id === 'k' ? { ...p, cover: V1 } : p)))); });
      await settle();
      await click('[data-action="edit"]');
      await click('[data-furniture="desk"]');
      await click('[data-action="arrange"]');
      await tap('[data-arrange-item="k"]');
      await click(label('Changer de carte'));
      await click('[data-arrange-bubble] [data-strip-card="Paris"]');
      const k = stored().find((p) => p.id === 'k');
      expect(k).toMatchObject({ id: 'k', kind: 'posed', hostId: 'd', x: 2, z: 2, slug: 'Paris' });
      expect(k && 'cover' in k).toBe(false);
    });
  });
});
