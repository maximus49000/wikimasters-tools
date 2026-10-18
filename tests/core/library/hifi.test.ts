import { describe, it, expect } from 'vitest';
import { smallPlacement } from '../../../src/core/library/carried-items';
import { activeHifi, hifiState, hiddenAtHome, sleeveKindOf, sleeveRest, sleeveStand } from '../../../src/core/library/hifi';
import type { Layout } from '../../../src/core/library/library-types';

const hifi = (id: string): Layout[number] => ({ id, kind: 'small', item: 'hifi', hostId: 'desk', x: 2, z: 2.5 });
const cd = (id: string, slug: string): Layout[number] => ({ id, kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug } as Layout[number]);
const view = (slug: string | null, playing: boolean) => ({ card: slug ? { slug } : null, track: { playing } });

describe('poste hi-fi', () => {
  it('le premier poste posé sert', () => {
    const l: Layout = [hifi('h1'), hifi('h2')];
    expect(activeHifi(l)?.id).toBe('h1');
  });
  it('carte en lecture rangée : au poste, tourne selon playing', () => {
    const l: Layout = [hifi('h1'), cd('c1', 'a')];
    expect(hifiState(l, view('a', true))).toEqual({ hifiId: 'h1', atHifi: 'c1', spinning: true });
    expect(hifiState(l, view('a', false)).spinning).toBe(false);
    expect([...hiddenAtHome(hifiState(l, view('a', true)))]).toEqual(['c1']);
  });
  it('carte absente de la pièce : rien au poste', () => {
    expect(hifiState([hifi('h1')], view('zz', true))).toEqual({ hifiId: 'h1', atHifi: null, spinning: false });
  });
  it('sans poste : rien caché', () => {
    const s = hifiState([cd('c1', 'a')], view('a', true));
    expect(s).toEqual({ hifiId: null, atHifi: null, spinning: false });
    expect(hiddenAtHome(s).size).toBe(0);
  });
  it('view.card null : rien au poste', () => {
    expect(hifiState([hifi('h1'), cd('c1', 'a')], { card: null, track: null }).atHifi).toBeNull();
  });

  it('pochette couchée devant le poste, sur le bureau, sans toucher sa façade', () => {
    const station = { x: 0, y: 75, z: 17 };
    for (const kind of ['cd', 'dvd', 'game', 'book', 'vinyl'] as const) {
      const { top, bottom } = sleeveRest(station, kind);
      for (const [, , z] of [...top, ...bottom]) {
        expect(z, kind).toBeGreaterThanOrEqual(0);
        expect(z, kind).toBeLessThan(station.z);
      }
      expect(top[0]![1]).toBeGreaterThan(bottom[0]![1]);
      expect(bottom[0]![1]).toBe(75);
    }
    expect(sleeveKindOf({ id: 'w', kind: 'wall', shape: 'vinyl', col: 0, row: 0, slug: 'x' })).toBe('vinyl');
    expect(sleeveKindOf({ id: 'p', kind: 'wall', shape: 'poster', col: 0, row: 0, slug: 'x' })).toBeNull();
  });

  it('chaîne à x 62, z 2,5 : la pochette a les mêmes coins qu’à l’ancien emplacement 2', () => {
    const now = smallPlacement('h', 'hifi', 'desk', 62, 2.5);
    for (const kind of ['cd', 'vinyl'] as const) expect(sleeveRest(now, kind)).toEqual(sleeveRest({ x: 62, y: 75, z: 17 }, kind));
  });

  it('pochette debout du zoom : pleine taille, posée sur le bureau, à droite du poste et face à l’utilisateur', () => {
    const station = smallPlacement('h', 'hifi', 'desk', 10, 2.5);
    const cd = sleeveStand(station, 'cd');
    expect([cd.w, cd.h]).toEqual([14.2, 12.5]);
    const [tl, tr, br, bl] = cd.corners as [number[], number[], number[], number[]];
    expect(bl[1]).toBe(station.y);
    expect(br[1]).toBe(station.y);
    expect(tl[1]).toBeGreaterThan(station.y);
    // Face à l'utilisateur : le bas parallèle à l'axe x, couverture lisible de gauche à droite.
    expect(br[2]).toBeCloseTo(bl[2]!);
    expect(tr[0]! - tl[0]!).toBeCloseTo(14.2);
    // À droite du poste (56 cm de large), sans le toucher.
    expect(Math.min(tl[0]!, bl[0]!)).toBeGreaterThan(station.x + 56);
    // Le vinyle n'est pas réduit (pas de zone de 14,5 cm ici).
    const v = sleeveStand(station, 'vinyl');
    expect([v.w, v.h]).toEqual([31.4, 31.4]);
    expect(v.back.every((p, i) => p[2] > v.corners[i]![2])).toBe(true);
  });

  it('pochette debout : à gauche du poste si elle dépasserait du bureau', () => {
    const station = smallPlacement('h', 'hifi', 'desk', 62, 2.5);
    const s = sleeveStand(station, 'cd', 120);
    expect(Math.max(...s.corners.map((p) => p[0]))).toBeLessThan(station.x);
    expect(Math.min(...s.corners.map((p) => p[0]))).toBeGreaterThanOrEqual(0);
  });
});
