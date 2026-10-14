import { describe, expect, it } from 'vitest';
import type { Angle } from '../../../src/core/library/footprint';
import { parseLibraryState, createInitialState } from '../../../src/core/library/library-book';
import type { Layout, Placed } from '../../../src/core/library/library-types';
import { canToggleShelfLink, forgetUnlinkOnMove, linkCandidateOf, shelfGroupOf, toggleShelfLink, touchesRight } from '../../../src/core/library/shelf-link';
import type { Standing } from '../../../src/core/library/room-grid';

const RIGHT: Record<Angle, [number, number]> = { 0: [4, 0], 1: [3, 1], 2: [0, 2], 3: [-3, 1], 4: [-4, 0], 5: [-3, -1], 6: [0, -2], 7: [3, -1] };
const shelf = (id: string, col: number, row: number, angle: Angle = 0, extra: Partial<Standing> = {}): Standing =>
  ({ id, kind: 'shelf', col, row, ...(angle ? { angle } : {}), ...extra }) as Standing;

describe('touchesRight', () => {
  for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as Angle[]) {
    it(`angle ${a} : collée à droite → liée ; une case plus loin → non`, () => {
      const [dc, dr] = RIGHT[a];
      const A = shelf('a', 20, 10, a);
      expect(touchesRight(A, shelf('b', 20 + dc, 10 + dr, a))).toBe(true);
      expect(touchesRight(shelf('b', 20 + dc, 10 + dr, a), A)).toBe(false);
      const far = dc === 0 ? [0, dr + Math.sign(dr)] : [dc + Math.sign(dc), dr];
      expect(touchesRight(A, shelf('b', 20 + far[0]!, 10 + far[1]!, a))).toBe(false);
    });
  }
  it('angles différents → non ; décalée en profondeur → non', () => {
    expect(touchesRight(shelf('a', 0, 6), shelf('b', 4, 6, 1))).toBe(false);
    expect(touchesRight(shelf('a', 0, 6), shelf('b', 4, 7))).toBe(false);
  });
});

describe('shelfGroupOf', () => {
  it('deux collées : groupe gauche → droite, depuis l’une ou l’autre', () => {
    const l: Layout = [shelf('b', 4, 6), shelf('a', 0, 6)];
    expect(shelfGroupOf(l, 'a')).toEqual(['a', 'b']);
    expect(shelfGroupOf(l, 'b')).toEqual(['a', 'b']);
  });
  it('rangée de 3 : A–B liées, C seule ; de 4 : A–B et C–D', () => {
    const l3: Layout = [shelf('a', 0, 6), shelf('b', 4, 6), shelf('c', 8, 6)];
    expect(shelfGroupOf(l3, 'c')).toEqual(['c']);
    expect(shelfGroupOf(l3, 'b')).toEqual(['a', 'b']);
    const l4: Layout = [...l3, shelf('d', 12, 6)];
    expect(shelfGroupOf(l4, 'c')).toEqual(['c', 'd']);
  });
  it('déliée → seule ; pas une étagère → []', () => {
    expect(shelfGroupOf([shelf('a', 0, 6, 0, { unlinked: true }), shelf('b', 4, 6)], 'b')).toEqual(['b']);
    expect(shelfGroupOf([{ id: 'x', kind: 'sofa', col: 0, row: 14 }], 'x')).toEqual([]);
  });
});

describe('délier / relier', () => {
  it('délier pose le drapeau ; relier le retire des deux', () => {
    const l: Layout = [shelf('a', 0, 6), shelf('b', 4, 6)];
    const off = toggleShelfLink(l, 'b');
    expect(off.find((p) => p.id === 'b')).toMatchObject({ unlinked: true });
    expect(shelfGroupOf(off, 'a')).toEqual(['a']);
    const on = toggleShelfLink(off, 'a');
    expect(on.some((p) => 'unlinked' in p)).toBe(false);
    expect(shelfGroupOf(on, 'a')).toEqual(['a', 'b']);
  });
  it('bouton seulement si l’appui change quelque chose', () => {
    expect(canToggleShelfLink([shelf('a', 0, 6)], 'a')).toBe(false);
    expect(canToggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6)], 'a')).toBe(true);
    // C dans A–B–C : relier C ne ferait rien (A–B gardent leur paire).
    expect(canToggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6), shelf('c', 8, 6)], 'c')).toBe(false);
    expect(linkCandidateOf([shelf('a', 0, 6), shelf('b', 4, 6)], 'b')).toBe('a');
  });
  it('écarter un meuble défait le lien sans rien nettoyer', () => {
    expect(shelfGroupOf([shelf('a', 0, 6), shelf('b', 5, 6)], 'a')).toEqual(['a']);
  });
});

describe('rangée de 3, celle du milieu déliée', () => {
  it('A et C restent seules ; relier B donne A–B', () => {
    const l: Layout = [shelf('a', 0, 6), shelf('b', 4, 6, 0, { unlinked: true }), shelf('c', 8, 6)];
    expect(shelfGroupOf(l, 'a')).toEqual(['a']);
    expect(shelfGroupOf(l, 'c')).toEqual(['c']);
    const on = toggleShelfLink(l, 'b');
    expect(shelfGroupOf(on, 'a')).toEqual(['a', 'b']);
    expect(shelfGroupOf(on, 'c')).toEqual(['c']);
  });
});

describe('refus oublié au déplacement', () => {
  const moveTo = (l: Layout, id: string, col: number, row: number, angle?: Angle): Layout =>
    l.map((p) => (p.id === id ? ({ ...p, col, row, ...(angle !== undefined ? { angle } : {}) } as Placed) : p));
  it('délier A–B puis coller A à C : A et C se lient', () => {
    const l: Layout = toggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6), shelf('c', 12, 10)], 'a');
    expect(shelfGroupOf(l, 'a')).toEqual(['a']);
    const moved = forgetUnlinkOnMove(l, moveTo(l, 'a', 8, 10), 'a');
    expect(shelfGroupOf(moved, 'a')).toEqual(['a', 'c']);
  });
  it('délié depuis B, A s’en va : B oublie son refus (il visait A)', () => {
    const l: Layout = toggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6)], 'b');
    const moved = forgetUnlinkOnMove(l, moveTo(l, 'a', 0, 12), 'a');
    expect(moved.find((p) => p.id === 'b')).not.toHaveProperty('unlinked');
  });
  it('même place et même angle : le refus reste ; tournée : oublié', () => {
    const l: Layout = toggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6)], 'a');
    expect(forgetUnlinkOnMove(l, l, 'a')).toBe(l);
    expect(forgetUnlinkOnMove(l, moveTo(l, 'a', 0, 6, 1), 'a').find((p) => p.id === 'a')).not.toHaveProperty('unlinked');
  });
});

describe('stockage', () => {
  it('le drapeau unlinked survit à la relecture', () => {
    const state = createInitialState();
    const layout: Placed[] = [shelf('a', 0, 6, 0, { unlinked: true })];
    const raw = JSON.parse(JSON.stringify({ ...state, rooms: state.rooms.map((r) => ({ ...r, layout })) }));
    expect(parseLibraryState(raw).rooms[0]!.layout[0]).toMatchObject({ unlinked: true });
  });
});
