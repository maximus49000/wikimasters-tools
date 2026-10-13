import { describe, expect, it } from 'vitest';
import { cameraOf, zoomRectOf, zoomTargetOf } from '../../../src/core/library/zoom-target';
import type { Layout } from '../../../src/core/library/library-types';

const shelf = { id: 's', kind: 'shelf', col: 0, row: 6 } as const;
const desk = { id: 'd', kind: 'desk', col: 8, row: 11 } as const;

describe('zoomTargetOf', () => {
  it('étagère avec une carte (même inconnue) → zoom ; vide → rien', () => {
    expect(zoomTargetOf([shelf], 's')).toBeNull();
    const l: Layout = [shelf, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Inconnue' }];
    expect(zoomTargetOf(l, 's')).toEqual({ kind: 'shelf', id: 's' });
    expect(zoomTargetOf(l, 'c')).toEqual({ kind: 'shelf', id: 's' });
  });
  it('bureau : seulement si son ordinateur affiche une carte ; l’ordinateur vise son bureau', () => {
    expect(zoomTargetOf([desk, { id: 'pc', kind: 'computer', deskId: 'd' }], 'd')).toBeNull();
    const l: Layout = [desk, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Paris' }];
    expect(zoomTargetOf(l, 'd')).toEqual({ kind: 'desk', id: 'd' });
    expect(zoomTargetOf(l, 'pc')).toEqual({ kind: 'desk', id: 'd' });
  });
  it('autres meubles, cartes au mur, id inconnu → rien', () => {
    expect(zoomTargetOf([{ id: 'a', kind: 'sofa', col: 0, row: 14 }], 'a')).toBeNull();
    expect(zoomTargetOf([{ id: 'w', kind: 'wall', shape: 'poster', col: 0, row: 2, slug: 'Paris' }], 'w')).toBeNull();
    expect(zoomTargetOf([], 'x')).toBeNull();
  });
});

describe('caméra et cadre', () => {
  // Le conteneur transformé doit toujours couvrir le visible + la marge (ni bande noire ni fond noir).
  const covers = (c: { w: number; h: number }, v: { x: number; y: number; w: number; h: number }, cam: { tx: number; ty: number; scale: number }, m = 32) => {
    expect(cam.tx).toBeLessThanOrEqual(v.x - m + 1e-9);
    expect(cam.tx + cam.scale * c.w).toBeGreaterThanOrEqual(v.x + v.w + m - 1e-9);
    expect(cam.ty).toBeLessThanOrEqual(v.y - m + 1e-9);
    expect(cam.ty + cam.scale * c.h).toBeGreaterThanOrEqual(v.y + v.h + m - 1e-9);
  };
  const C = { w: 800, h: 400 };
  const V = { x: 0, y: 0, w: 800, h: 400 };
  it('amène le centre du meuble au centre du visible quand rien ne bute', () => {
    const cam = cameraOf(C, V, { x: 350, y: 150, w: 100, h: 100 });
    expect(cam.scale).toBe(1.6);
    expect(400 * cam.scale + cam.tx).toBeCloseTo(400);
    expect(200 * cam.scale + cam.ty).toBeCloseTo(200);
    covers(C, V, cam);
  });
  it('meuble collé au bord gauche (x = 0) : la caméra bute, pas de bande noire', () => {
    const cam = cameraOf(C, V, { x: 0, y: 100, w: 100, h: 100 });
    covers(C, V, cam);
    expect(cam.tx).toBeCloseTo(-32);
  });
  it('meuble hors écran (x = −900 ou x = +3000) : le visible reste couvert', () => {
    covers(C, V, cameraOf(C, V, { x: -900, y: 100, w: 100, h: 100 }));
    covers(C, V, cameraOf(C, V, { x: 3000, y: 100, w: 100, h: 100 }));
  });
  it('sans meuble mesuré : agrandit autour du centre du visible', () => {
    const cam = cameraOf(C, V, null);
    covers(C, V, cam);
    expect(400 * cam.scale + cam.tx).toBeCloseTo(400);
  });
  it('conteneur plus étroit que la scène (480 dans 800) : agrandi assez pour couvrir la scène', () => {
    const c = { w: 480, h: 400 };
    const v = { x: -160, y: 0, w: 800, h: 400 };
    for (const target of [null, { x: 0, y: 0, w: 60, h: 60 }, { x: 420, y: 340, w: 60, h: 60 }, { x: -900, y: 0, w: 60, h: 60 }]) {
      const cam = cameraOf(c, v, target);
      expect(cam.scale).toBeGreaterThanOrEqual((800 + 64) / 480);
      covers(c, v, cam);
    }
  });
  it('cadre final : 80 % de la hauteur, largeur bornée à 90 %, centré', () => {
    expect(zoomRectOf({ w: 800, h: 400 }, 0.75)).toEqual({ x: 280, y: 40, w: 240, h: 320 });
    const wide = zoomRectOf({ w: 300, h: 400 }, 2);
    expect(wide.w).toBeCloseTo(270);
    expect(wide.x).toBeCloseTo(15);
  });
});
