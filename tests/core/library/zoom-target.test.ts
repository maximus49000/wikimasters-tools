import { describe, expect, it } from 'vitest';
import { cameraOf, zoomRectOf, zoomTargetOf } from '../../../src/core/library/zoom-target';
import type { Layout } from '../../../src/core/library/library-types';

const shelf = { id: 's', kind: 'shelf', col: 0, row: 6 } as const;
const desk = { id: 'd', kind: 'desk', col: 8, row: 11 } as const;

describe('zoomTargetOf', () => {
  it('étagère avec une carte (même inconnue) → zoom ; vide → rien', () => {
    expect(zoomTargetOf([shelf], 's')).toBeNull();
    const l: Layout = [shelf, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Inconnue' }];
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
  it('amène le centre du meuble au centre de la scène', () => {
    const cam = cameraOf({ w: 800, h: 400 }, { x: 100, y: 100, w: 100, h: 100 });
    expect(cam.scale).toBe(1.6);
    expect(150 * cam.scale + cam.tx).toBeCloseTo(400);
    expect(150 * cam.scale + cam.ty).toBeCloseTo(200);
  });
  it('cadre final : 80 % de la hauteur, largeur bornée à 90 %, centré', () => {
    expect(zoomRectOf({ w: 800, h: 400 }, 0.75)).toEqual({ x: 280, y: 40, w: 240, h: 320 });
    const wide = zoomRectOf({ w: 300, h: 400 }, 2);
    expect(wide.w).toBeCloseTo(270);
    expect(wide.x).toBeCloseTo(15);
  });
});
