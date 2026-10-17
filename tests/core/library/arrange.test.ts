import { describe, it, expect } from 'vitest';
import { dropOnTop, moveOnTop, screenToTop, topToScreen, type ArrangeFrame } from '../../../src/core/library/arrange';
import type { Layout } from '../../../src/core/library/library-types';

const desk: Layout[number] = { id: 'desk', kind: 'desk', col: 0, row: 0 };
const alarm = (id: string, x: number, z: number): Layout[number] => ({ id, kind: 'small', item: 'alarm', hostId: 'desk', x, z });
const lamp = (id: string, x: number, z: number): Layout[number] => ({ id, kind: 'small', item: 'lamp', hostId: 'desk', x, z });

describe('glissé sur un plateau (cœur)', () => {
  const f: ArrangeFrame = { hostKind: 'desk', scale: 1.7, origin: [12, 30] };
  it('screenToTop inverse topToScreen', () => {
    const [sx, sy] = topToScreen(f, 30, 12);
    const p = screenToTop(f, sx, sy);
    expect(p.x).toBeCloseTo(30, 6);
    expect(p.z).toBeCloseTo(12, 6);
  });
  it('réveil : refusé s’il dépasse, accepté sinon', () => {
    const l: Layout = [desk, alarm('a', 0, 0)];
    expect(dropOnTop(l, 'desk', 'a', 110, 0)).toEqual({ ok: false });
    expect(dropOnTop(l, 'desk', 'a', 102, 0)).toEqual({ ok: true, x: 102, z: 0 });
  });
  it('lâché sur la lampe : refusé, plan inchangé', () => {
    const l: Layout = [desk, alarm('a', 0, 0), lamp('l', 40, 0)];
    const copy = JSON.parse(JSON.stringify(l));
    expect(dropOnTop(l, 'desk', 'a', 40, 0)).toEqual({ ok: false });
    expect(moveOnTop(l, 'a', 40, 0)).toBeNull();
    expect(l).toEqual(copy);
  });
  it('id inconnu ou objet hors de ce plateau : refusé', () => {
    const l: Layout = [desk, alarm('a', 0, 0)];
    expect(dropOnTop(l, 'desk', 'zzz', 0, 0)).toEqual({ ok: false });
    expect(dropOnTop(l, 'desk', 'desk', 0, 0)).toEqual({ ok: false });
    expect(dropOnTop(l, 'autre', 'a', 0, 0)).toEqual({ ok: false });
  });
  it('carte posée déplaçable', () => {
    const l: Layout = [desk, { id: 'p', kind: 'posed', shape: 'cd', hostId: 'desk', x: 0, z: 0, slug: 'x' }];
    expect(moveOnTop(l, 'p', 20, 5)?.find((p) => p.id === 'p')).toMatchObject({ x: 20, z: 5 });
  });
  it('bureau tourné : x reste dans le repère du meuble', () => {
    const l: Layout = [{ ...desk, angle: 2 } as Layout[number], alarm('a', 30, 0)];
    const out = moveOnTop(l, 'a', 0, 0);
    expect(out?.find((p) => p.id === 'a')).toMatchObject({ x: 0, z: 0 });
    expect(l[1]).toMatchObject({ x: 30 });
  });
});
