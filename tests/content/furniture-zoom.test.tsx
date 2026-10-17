// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FurnitureZoom } from '../../src/content/furniture-zoom';
import type { Room } from '../../src/core/library/library-types';
import type { ZoomTarget } from '../../src/core/library/zoom-target';
import { drawSize, faceFrame, frontFaceRect } from '../../src/core/library/footprint';
import { CELL_H, CELL_W, shelfLayoutIn } from '../../src/core/library/room-grid';
import { computerPlacement, screenQuad, storedFrontQuad, storedPlacementsOf } from '../../src/core/library/carried-items';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 's', kind: 'shelf', col: 0, row: 6, angle: 2 },
    { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
    { id: 'c2', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 4, slug: 'Inconnue' },
  ],
};

function mount(phase: 'opening' | 'open' | 'closing', onCard = vi.fn(), onBack = vi.fn(), r: Room = room, onLevel = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <FurnitureZoom target={{ kind: 'shelf', ids: ['s'] }} room={r} cards={{ Daft_Punk: { title: 'Daft Punk' } }} imageOf={() => undefined}
        phase={phase} from={{ x: 10, y: 20, w: 60, h: 160 }} stage={{ w: 800, h: 400 }} level={null} onLevel={onLevel} onCard={onCard} onBack={onBack} />,
    );
  });
  return { container, onCard, onBack, onLevel };
}

describe('calque du zoom', () => {
  it('ouvert : vue de face avec l’espace libre des tablettes et les cartes, même si l’étagère est de profil', () => {
    const { container } = mount('open');
    const zoom = container.querySelector('[data-furniture-zoom]')!;
    expect(zoom.getAttribute('data-zoom-face')).toBe('front');
    expect(container.querySelector('[data-zoom-card="Daft_Punk"]')).not.toBeNull();
    expect(container.querySelector('[data-zoom-card="Inconnue"]')).not.toBeNull();
    // Carte inconnue : dessinée sans image, touchable sans effet (pas d'opacité sur le groupe).
    expect(container.querySelector('[data-zoom-card="Inconnue"]')!.hasAttribute('opacity')).toBe(false);
    // L'espace libre de chacune des 3 tablettes en pointillés.
    expect(container.querySelectorAll('rect[stroke-dasharray]')).toHaveLength(3);
  });
  it('vue de face : le modèle 3D, les cartes dans sa face avant projetée, aux mêmes places que dans la pièce', () => {
    const { container } = mount('open');
    expect(container.querySelector('.wmt-lib-zoom-piece [data-model3d]')).not.toBeNull();
    const { w, h } = drawSize('shelf', 0);
    const face = frontFaceRect(0, { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H }, 'shelf')!;
    const hits = [...container.querySelectorAll('[data-zoom-card] rect[fill="transparent"]')];
    expect(hits).toHaveLength(2);
    for (const r of hits) {
      const [x, y, rw, rh] = ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)));
      expect(x).toBeGreaterThanOrEqual(face.x - 1e-6);
      expect(y).toBeGreaterThanOrEqual(face.y - 1e-6);
      expect(x! + rw!).toBeLessThanOrEqual(face.x + face.w + 1e-6);
      expect(y! + rh!).toBeLessThanOrEqual(face.y + face.h + 1e-6);
    }
    // Même géométrie que dans la pièce : le rangement par largeur sur la face du modèle (2e objet de la tablette du haut).
    const want = shelfLayoutIn(faceFrame('shelf', 0, { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H })!, room.layout, 's').find((b) => b.id === 'c2')!;
    const hit = container.querySelector('[data-zoom-card="Inconnue"] rect[fill="transparent"]')!;
    expect(Number(hit.getAttribute('x'))).toBeCloseTo(want.x, 1);
    // (sa hauteur : la face avant de l'objet en 3D, voir « zoom : objets en 3D ».)
    expect(Number(hit.getAttribute('width'))).toBeCloseTo(want.w, 1);
  });
  it('pivot : le meuble tourné tient entier dans le cadre (pas rogné)', () => {
    const { container } = mount('opening');
    const vb = container.querySelector('.wmt-lib-zoom-piece svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    const g = container.querySelector('.wmt-lib-zoom-piece [data-model3d]')!;
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.e]+) ([-\d.e]+)\)/.exec(g.getAttribute('transform')!)!.slice(1).map(Number);
    const { w, h } = drawSize('shelf', 2);
    expect(m[0]).toBeGreaterThanOrEqual(vb[0]! - 1e-6);
    expect(m[0]! + w * CELL_W * m[2]!).toBeLessThanOrEqual(vb[0]! + vb[2]! + 1e-6);
    expect(m[1]).toBeGreaterThanOrEqual(vb[1]! - 1e-6);
    expect(m[1]! + h * CELL_H * m[3]!).toBeLessThanOrEqual(vb[1]! + vb[3]! + 1e-6);
  });
  it('première moitié d’un meuble tourné : le modèle 3D sous son angle', () => {
    const { container } = mount('opening');
    expect(container.querySelector('.wmt-lib-zoom-piece [data-model3d]')).not.toBeNull();
  });
  it('bureau : l’écran se tient sur le plateau, dans le cadre', () => {
    const desk: Room = { ...room, layout: [{ id: 'd', kind: 'desk', col: 0, row: 10 }, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Daft_Punk' }] };
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={{ kind: 'desk', id: 'd' }} room={desk} cards={{ Daft_Punk: { title: 'Daft Punk' } }} imageOf={() => undefined}
          phase="open" from={null} stage={{ w: 800, h: 400 }} level={null} onLevel={vi.fn()} onCard={vi.fn()} onBack={vi.fn()} />,
      );
    });
    const vb = container.querySelector('.wmt-lib-zoom-piece svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    const screen = container.querySelector('[data-zoom-card="Daft_Punk"] rect')!;
    const top = Number(screen.getAttribute('y'));
    // L'écran est entièrement dans le cadre, et son haut au-dessus du bureau (il dépasse du plateau).
    expect(top).toBeGreaterThanOrEqual(vb[1]!);
    expect(top).toBeLessThan(0);
  });
  it('vue de face d’une étagère : toucher une carte (connue ou non) ou la tablette mène au second zoom de son niveau', () => {
    const { container, onCard, onLevel } = mount('open');
    act(() => { container.querySelector('[data-zoom-card="Daft_Punk"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { container.querySelector('[data-zoom-card="Inconnue"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { container.querySelector('[data-zoom-board="2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onLevel.mock.calls).toEqual([[0], [0], [2]]);
    expect(onCard).not.toHaveBeenCalled();
  });
  it('deux bibliothèques liées : deux meubles côte à côte, cadre deux fois plus large', () => {
    const pair: Room = { ...room, layout: [{ id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 't', kind: 'shelf', col: 4, row: 6 }, room.layout[1]!] };
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={{ kind: 'shelf', ids: ['s', 't'] }} room={pair} cards={{}} imageOf={() => undefined} phase="open" from={null} stage={{ w: 800, h: 400 }} level={null} onCard={vi.fn()} onLevel={vi.fn()} onBack={vi.fn()} />,
      );
    });
    expect(container.querySelectorAll('[data-zoom-piece]')).toHaveLength(2);
    const vb = container.querySelector('.wmt-lib-zoom-piece svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(vb[2]).toBeCloseTo(2 * drawSize('shelf', 0).w * CELL_W);
    expect(container.querySelector('[data-furniture-zoom]')!.getAttribute('aria-label')).toBe('Bibliothèques vues de face');
  });
  it('niveau choisi : la vue de la tablette remplace la vue de face', () => {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={{ kind: 'shelf', ids: ['s'] }} room={room} cards={{}} imageOf={() => undefined} phase="open" from={null} stage={{ w: 800, h: 400 }} level={1} onCard={vi.fn()} onLevel={vi.fn()} onBack={vi.fn()} />,
      );
    });
    expect(container.querySelector('[data-shelf-board="1"]')).not.toBeNull();
    expect(container.querySelector('.wmt-lib-zoom-piece')).toBeNull();
    expect(container.querySelector('[data-action="zoom-back"]')!.getAttribute('aria-label')).toBe('Retour à la vue de face');
  });
  it('← et le fond flouté appellent onBack', () => {
    const { container, onBack } = mount('open');
    act(() => { container.querySelector<HTMLButtonElement>('[data-action="zoom-back"]')!.click(); });
    act(() => { container.querySelector('[data-zoom-backdrop]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
  it('à l’ouverture d’un meuble tourné, la première moitié montre le meuble sous son angle', () => {
    const { container } = mount('opening');
    expect(container.querySelector('[data-furniture-zoom]')!.getAttribute('data-zoom-face')).toBe('angled');
  });

  describe('animation', () => {
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    const face = (c: HTMLElement) => c.querySelector('[data-furniture-zoom]')!.getAttribute('data-zoom-face');
    const flat: Room = { ...room, layout: room.layout.map((p) => (p.id === 's' ? { ...p, angle: 0 } : p)) } as Room;

    it('meuble tourné : de face après 250 ms à l’ouverture, de profil après 250 ms à la fermeture', () => {
      vi.useFakeTimers();
      const o = mount('opening');
      expect(face(o.container)).toBe('angled');
      act(() => { vi.advanceTimersByTime(260); });
      expect(face(o.container)).toBe('front');
      const c = mount('closing');
      expect(face(c.container)).toBe('front');
      act(() => { vi.advanceTimersByTime(260); });
      expect(face(c.container)).toBe('angled');
    });
    it('meuble de face : part du rectangle du toucher puis rejoint le cadre final', () => {
      vi.useFakeTimers();
      const { container } = mount('opening', vi.fn(), vi.fn(), flat);
      const piece = container.querySelector<HTMLElement>('.wmt-lib-zoom-piece')!;
      expect(piece.style.left).toBe('10px');
      expect(piece.style.width).toBe('60px');
      act(() => { vi.advanceTimersByTime(50); });
      expect(piece.style.left).not.toBe('10px');
      expect(piece.style.width).not.toBe('60px');
      expect(piece.style.transition).toContain('500ms');
    });
    it('mouvement réduit : de face tout de suite, au cadre final, fondu', () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} }));
      vi.useFakeTimers();
      const { container } = mount('opening');
      expect(face(container)).toBe('front');
      expect(container.querySelector<HTMLElement>('.wmt-lib-zoom-piece')!.style.left).not.toBe('10px');
      const root = container.querySelector<HTMLElement>('[data-furniture-zoom]')!;
      expect(root.style.opacity).toBe('0');
      act(() => { vi.advanceTimersByTime(50); });
      expect(root.style.opacity).toBe('1');
    });
  });
});

describe('zoom : objets en 3D', () => {
  const IMG = 'data:image/png;base64,AAAA';
  function zoomOf(r: Room, target: ZoomTarget, phase: 'open' | 'opening' = 'open', onCard = vi.fn()) {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={target} room={r} cards={{ Daft_Punk: { title: 'Daft Punk', imageUrl: IMG }, Paris: { title: 'Paris', imageUrl: IMG } }} imageOf={(slug) => (slug === 'Inconnue' ? undefined : IMG)}
          phase={phase} from={null} stage={{ w: 800, h: 400 }} level={null} onLevel={vi.fn()} onCard={onCard} onBack={vi.fn()} />,
      );
    });
    return { container, onCard };
  }
  it('les objets rangés sont dessinés en 3D sur l’étagère, découpés à son ouverture : image sur la couverture, titre sur la tranche', () => {
    const r: Room = { ...room, layout: [...room.layout, { id: 'c3', kind: 'stored', shape: 'book', shelfId: 's', level: 1, order: 0, slug: 'Paris' }] };
    const { container } = zoomOf(r, { kind: 'shelf', ids: ['s'] });
    const model = container.querySelector('.wmt-lib-zoom-piece')!;
    expect(model.querySelector('image')!.getAttribute('href')).toBe(IMG);
    expect([...model.querySelectorAll('text')].map((t) => t.textContent)).toContain('Paris');
    for (const el of model.querySelectorAll('[data-item3d]')) expect(el.closest('g[clip-path]')).not.toBeNull();
    // L'étagère passe avant ses objets.
    expect(model.querySelector('[data-model3d]')!.compareDocumentPosition(model.querySelector('[data-item3d]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('zone touchable d’un objet : sa face avant, près du bord de la tablette', () => {
    const { container } = zoomOf(room, { kind: 'shelf', ids: ['s'] });
    const { w, h } = drawSize('shelf', 0);
    const art = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
    const pl = storedPlacementsOf(room.layout, 's').get('c1')!;
    const q = storedFrontQuad(0, art, pl);
    const hit = container.querySelector('[data-zoom-card="Daft_Punk"] rect[fill="transparent"]')!;
    expect(Number(hit.getAttribute('x'))).toBeCloseTo(q[0]![0], 1);
    expect(Number(hit.getAttribute('y'))).toBeCloseTo(q[0]![1], 1);
    expect(Number(hit.getAttribute('height'))).toBeCloseTo(q[3]![1] - q[0]![1], 1);
  });
  it('bureau : écran et petits objets en 3D, dessinés après le plateau ; la carte de l’écran se touche sur la vitre ; le pivot montre aussi les objets', () => {
    const desk: Room = { ...room, layout: [{ id: 'd', kind: 'desk', col: 0, row: 10, angle: 1 }, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Daft_Punk' }, { id: 'l', kind: 'small', item: 'lamp', hostId: 'd', x: 7.5, z: 22.5 }] };
    const { container, onCard } = zoomOf(desk, { kind: 'desk', id: 'd' });
    const model = container.querySelector('.wmt-lib-zoom-piece')!;
    expect(model.querySelector('image')!.getAttribute('href')).toBe(IMG);
    expect(model.querySelector('[data-lamp-halo]')).not.toBeNull();
    expect(model.querySelector('[data-model3d]')!.compareDocumentPosition(model.querySelector('[data-item3d="monitor"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const { w, h } = drawSize('desk', 0);
    const glass = screenQuad(0, { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H }, computerPlacement('pc'));
    const hit = container.querySelector('[data-zoom-card="Daft_Punk"] rect[fill="transparent"]')!;
    expect(Number(hit.getAttribute('x'))).toBeCloseTo(glass[0]![0], 1);
    expect(Number(hit.getAttribute('y'))).toBeCloseTo(glass[0]![1], 1);
    act(() => { hit.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCard).toHaveBeenCalledWith('Daft_Punk');
    const turned = zoomOf(desk, { kind: 'desk', id: 'd' }, 'opening').container;
    expect(turned.querySelector('[data-zoom-face="angled"] .wmt-lib-zoom-piece [data-item3d] [data-lamp-halo]')).not.toBeNull();
  });
});

describe('objets de table au zoom', () => {
  it('le réveil, la pendulette et la station montrent leur face (pas un rectangle sombre)', () => {
    const desk: Room = { ...room, layout: [
      { id: 'd', kind: 'desk', col: 0, row: 12 },
      { id: 'a', kind: 'small', item: 'alarm', hostId: 'd', x: 6, z: 26.5 },
      { id: 'k', kind: 'small', item: 'clock', hostId: 'd', x: 38, z: 27 },
      { id: 'w', kind: 'small', item: 'station', hostId: 'd', x: 67.5, z: 27 },
    ] };
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={{ kind: 'desk', id: 'd' }} room={desk} cards={{}} imageOf={() => undefined}
          phase="open" from={null} stage={{ w: 800, h: 400 }} level={null} onLevel={vi.fn()} onCard={vi.fn()} onBack={vi.fn()} />,
      );
    });
    for (const item of ['alarm', 'clock', 'station']) expect(container.querySelector(`[data-table-face="${item}"]`)).not.toBeNull();
  });
});
