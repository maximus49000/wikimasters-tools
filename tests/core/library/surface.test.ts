import { describe, it, expect } from 'vitest';
import { canPutOnTop, computerTopRect, firstFreeTopSpot, topRectsOf, topSize } from '../../../src/core/library/surface';
import type { Layout } from '../../../src/core/library/library-types';

const desk: Layout[number] = { id: 'desk', kind: 'desk', col: 0, row: 0 };
const shelf: Layout[number] = { id: 'shelf', kind: 'shelf', col: 0, row: 0 };
const alarm = (id: string, x: number, z: number): Layout[number] => ({ id, kind: 'small', item: 'alarm', hostId: 'desk', x, z });

describe('plateau en cm', () => {
  it('mesures des objets', () => {
    expect(topSize({ item: 'hifi' })).toEqual({ w: 56, d: 40.5 });
    expect(topSize({ item: 'alarm' })).toEqual({ w: 18, d: 7 });
    expect(topSize({ shape: 'cd' })).toEqual({ w: 14, d: 8 });
  });
  it('bureau vide : premier réveil en 0,0', () => {
    expect(firstFreeTopSpot([desk], 'desk', { item: 'alarm' })).toEqual({ x: 0, z: 0 });
  });
  it('second réveil juste à côté (contact toléré)', () => {
    expect(firstFreeTopSpot([desk, alarm('a', 0, 0)], 'desk', { item: 'alarm' })).toEqual({ x: 18, z: 0 });
  });
  it('bords du plateau', () => {
    expect(canPutOnTop([desk], 'desk', { item: 'alarm' }, 120 - 17, 0)).toBe(false);
    expect(canPutOnTop([desk], 'desk', { item: 'alarm' }, 102, 0)).toBe(true);
  });
  it('la chaîne hi-fi refusée sur étagère', () => {
    expect(firstFreeTopSpot([shelf], 'shelf', { item: 'hifi' })).toBeNull();
  });
  it('ordinateur : la chaîne tient devant, pas décalée vers le fond', () => {
    const l: Layout = [desk, { id: 'pc', kind: 'computer', deskId: 'desk' }];
    expect(firstFreeTopSpot(l, 'desk', { item: 'hifi' })).toEqual({ x: 0, z: 0 });
    expect(canPutOnTop(l, 'desk', { item: 'hifi' }, 0, 0)).toBe(true);
    expect(canPutOnTop(l, 'desk', { item: 'hifi' }, 0, 1)).toBe(false);
  });
  it('ignoreId : l’objet qu’on déplace ne se gêne pas lui-même', () => {
    const l: Layout = [desk, alarm('a', 0, 0)];
    expect(canPutOnTop(l, 'desk', { item: 'alarm' }, 4, 0)).toBe(false);
    expect(canPutOnTop(l, 'desk', { item: 'alarm' }, 4, 0, 'a')).toBe(true);
    expect(firstFreeTopSpot(l, 'desk', { item: 'alarm' }, 'a')).toEqual({ x: 0, z: 0 });
    expect(topRectsOf(l, 'desk', 'a')).toEqual([]);
  });
  it('une carte posée compte (largeur du boîtier × chevalet) ; un objet de tablette et l’écran d’un autre bureau non', () => {
    const l: Layout = [
      desk, shelf,
      { id: 'c', kind: 'posed', shape: 'cd', hostId: 'desk', x: 30, z: 5, slug: 'Paris' },
      { id: 't', kind: 'small', item: 'lamp', hostId: 'shelf', level: 0, order: 0 },
      { id: 'pc', kind: 'computer', deskId: 'autre' },
    ];
    expect(topRectsOf(l, 'desk')).toEqual([{ x: 30, z: 5, w: 14, d: 8 }]);
    expect(topRectsOf(l, 'shelf')).toEqual([]);
    expect(canPutOnTop(l, 'desk', { item: 'alarm' }, 25, 0)).toBe(false);
    expect(topRectsOf([desk, { id: 'pc', kind: 'computer', deskId: 'desk' }], 'desk')).toEqual([computerTopRect()]);
  });
  it('dernier essai collé au bord droit et au fond, hors de la grille de 2 cm', () => {
    // Dessus d'étagère (80 × 30) : une rangée de plantes (z 0..15) puis une rangée de CD posés (z 15..23) ; seule reste la bande du
    // fond, z 23..30, exactement la profondeur d'un réveil (7 cm). La grille (z = 22, 24…) la manque : le dernier essai la trouve.
    const l: Layout = [
      shelf,
      ...[0, 15, 30, 45, 60].map((x, i): Layout[number] => ({ id: `p${i}`, kind: 'small', item: 'plant', hostId: 'shelf', x, z: 0 })),
      ...[0, 14, 28, 42, 56].map((x, i): Layout[number] => ({ id: `c${i}`, kind: 'posed', shape: 'cd', hostId: 'shelf', x, z: 15, slug: `S${i}` })),
    ];
    expect(firstFreeTopSpot(l, 'shelf', { item: 'alarm' })).toEqual({ x: 62, z: 23 });
  });
});
