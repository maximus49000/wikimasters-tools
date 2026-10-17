import { describe, it, expect } from 'vitest';
import { canPutOnTop, firstFreeTopSpot, topSize } from '../../../src/core/library/surface';
import type { Layout } from '../../../src/core/library/library-types';

const desk = { id: 'desk', kind: 'desk', col: 0, row: 0 } as Layout[number];
const shelf = { id: 'shelf', kind: 'shelf', col: 0, row: 0 } as Layout[number];
const alarm = (id: string, x: number, z: number): Layout[number] => ({ id, kind: 'small', item: 'alarm', hostId: 'desk', x, z } as Layout[number]);

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
    const l: Layout = [desk, { id: 'pc', kind: 'computer', deskId: 'desk' } as Layout[number]];
    expect(firstFreeTopSpot(l, 'desk', { item: 'hifi' })).toEqual({ x: 0, z: 0 });
    expect(canPutOnTop(l, 'desk', { item: 'hifi' }, 0, 0)).toBe(true);
    expect(canPutOnTop(l, 'desk', { item: 'hifi' }, 0, 1)).toBe(false);
  });
});
