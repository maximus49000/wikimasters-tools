import { describe, expect, it } from 'vitest';
import { boxesOf, lampsOf, layoutSignature } from '../../../src/core/library/light/occluders';
import type { Layout } from '../../../src/core/library/library-types';

const geom = { wallH: 340, floorH: 170 };
const deskH = (510 / 18) * 4;

describe('boxesOf', () => {
  it('un bureau donne 5 boîtes dont un plateau', () => {
    const boxes = boxesOf([{ id: 'd', kind: 'desk', col: 2, row: 11 }], geom);
    expect(boxes).toHaveLength(5);
    const top = boxes[0]!;
    expect(top.z1).toBeCloseTo(deskH, 1);
    expect(top.x0).toBe(60);
    expect(top.x1).toBe(210);
  });
  it('un tapis ne donne rien', () => {
    expect(boxesOf([{ id: 'r', kind: 'rug', col: 2, row: 12 }], geom)).toEqual([]);
  });
  it('une lampe donne 3 boîtes et une source, éteinte 3 boîtes sans source', () => {
    const on: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8 }];
    const boxes = boxesOf(on, geom);
    expect(boxes).toHaveLength(3);
    const src = lampsOf(on, geom);
    expect(src).toHaveLength(1);
    expect(src[0]!.z).toBeCloseTo(0.92 * boxes[2]!.z1, 5);
    expect(src[0]!.box).toBe('l');
    const off: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8, lit: false }];
    expect(boxesOf(off, geom)).toHaveLength(3);
    expect(lampsOf(off, geom)).toEqual([]);
  });
  it('une petite lampe repose sur le haut du bureau', () => {
    const l: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11 }, { id: 's', kind: 'small', item: 'lamp', hostId: 'd', slot: 0 }];
    const b = boxesOf(l, geom).filter((x) => x.owner === 's');
    expect(b).toHaveLength(1);
    expect(b[0]!.z0).toBeCloseTo(deskH, 5);
    expect(lampsOf(l, geom)).toHaveLength(1);
  });
  it('un ordinateur pose sa boîte sur le plateau', () => {
    const b = boxesOf([{ id: 'd', kind: 'desk', col: 2, row: 11 }, { id: 'c', kind: 'computer', deskId: 'd' }], geom).filter((x) => x.owner === 'c');
    expect(b).toHaveLength(1);
    expect(b[0]!.z0).toBeCloseTo(deskH, 5);
    expect(b[0]!.z1).toBeCloseTo(deskH + 56, 5);
  });
});

describe('layoutSignature', () => {
  const base: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8 }];
  it('change quand la lampe s’éteint ou qu’un meuble bouge, pas sinon', () => {
    const s = layoutSignature(base, geom);
    expect(layoutSignature([...base], geom)).toBe(s);
    expect(layoutSignature([{ id: 'l', kind: 'lamp', col: 2, row: 8, lit: false }], geom)).not.toBe(s);
    expect(layoutSignature([{ id: 'l', kind: 'lamp', col: 5, row: 8 }], geom)).not.toBe(s);
  });
});
