import { describe, it, expect } from 'vitest';
import { hostPointPx, placementBounds, smallPlacement } from '../../../src/core/library/carried-items';
import { PLUNGE_CAMERA } from '../../../src/core/library/furniture-render3d';
import { HIFI_DISPLAY_CM, HIFI_WELL_CM, hifiZoomArea, hifiZoomFrame } from '../../../src/core/library/hifi-zoom';
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

  it('pochette debout du zoom : pleine taille, posée sur le bureau devant le côté droit du poste, face à l’utilisateur', () => {
    const station = smallPlacement('h', 'hifi', 'desk', 10, 2.5);
    const cd = sleeveStand(station, 'cd');
    expect([cd.w, cd.h]).toEqual([14.2, 12.5]);
    const [tl, tr, br, bl] = cd.corners.map((p) => [...p]) as [number[], number[], number[], number[]];
    expect(bl[1]).toBe(station.y);
    expect(br[1]).toBe(station.y);
    expect(tl[1]).toBeGreaterThan(station.y);
    // Face à l'utilisateur : le bas parallèle à l'axe x, couverture lisible de gauche à droite.
    expect(br[2]).toBeCloseTo(bl[2]!);
    expect(tr[0]! - tl[0]!).toBeCloseTo(14.2);
    // Devant le côté droit du poste (56 cm de large), entre le bord du bureau et la façade.
    expect(br[0]).toBeCloseTo(station.x + 56);
    for (const p of [...cd.corners, ...cd.back]) {
      expect(p[2]).toBeGreaterThanOrEqual(0);
      expect(p[2]).toBeLessThan(station.z);
    }
    // Le vinyle n'est pas réduit, il se dresse à côté du poste.
    const v = sleeveStand(station, 'vinyl');
    expect([v.w, v.h]).toEqual([31.4, 31.4]);
    expect(Math.min(...v.corners.map((p) => p[0]))).toBeGreaterThan(station.x + 56);
    expect(v.back.every((p, i) => p[2] > v.corners[i]![2])).toBe(true);
  });

  it('vinyle debout : à gauche du poste s’il dépasserait du bureau à droite', () => {
    const station = smallPlacement('h', 'hifi', 'desk', 62, 2.5);
    const s = sleeveStand(station, 'vinyl', 120);
    expect(Math.max(...s.corners.map((p) => p[0]))).toBeLessThan(station.x);
    expect(Math.min(...s.corners.map((p) => p[0]))).toBeGreaterThanOrEqual(0);
  });

  it('vinyle debout sans place d’aucun côté : le côté le plus large, quitte à dépasser du bureau, jamais sur le poste', () => {
    // Poste à x 20 : 17 cm à gauche, 41 cm à droite ; il en faut 34,4.
    const crowded = smallPlacement('h', 'hifi', 'desk', 20, 2.5);
    const r = sleeveStand(crowded, 'vinyl', 100);
    expect(Math.min(...r.corners.map((p) => p[0]))).toBeGreaterThan(crowded.x + 56);
    expect(Math.max(...r.corners.map((p) => p[0]))).toBeGreaterThan(100);
    // Poste à x 40 : 37 cm à gauche, 1 cm à droite.
    const right = smallPlacement('h', 'hifi', 'desk', 40, 2.5);
    const l = sleeveStand(right, 'vinyl', 100);
    expect(Math.max(...l.corners.map((p) => p[0]))).toBeLessThan(right.x);
  });

  it('cadrage du zoom : pour un CD, la pochette fait plus d’un tiers de la hauteur, afficheur et puits dans le cadre', () => {
    const layer = { w: 800, h: 400 };
    for (const x of [2, 30, 62]) {
      const pl = smallPlacement('h', 'hifi', 'desk', x, 2.5);
      const { rect, stand } = hifiZoomFrame('desk', pl, 'cd', layer);
      const px = (p: [number, number, number]) => hostPointPx('desk', 0, rect, p, PLUNGE_CAMERA);
      const ys = stand!.corners.map((p) => px(p)[1]);
      expect(Math.max(...ys) - Math.min(...ys), `x ${x}`).toBeGreaterThanOrEqual(0.35 * layer.h);
      const area = hifiZoomArea(layer);
      for (const box of [HIFI_DISPLAY_CM, HIFI_WELL_CM]) {
        const [x0, x1, y0, y1, z0, z1] = box;
        for (const p of [[x0, y0, z0], [x1, y1, z1], [x0, y1, z1], [x1, y0, z0]] as [number, number, number][]) {
          const [sx, sy] = px([pl.x + p[0], pl.y + p[1], pl.z + p[2]]);
          expect(sx).toBeGreaterThanOrEqual(area.x);
          expect(sx).toBeLessThanOrEqual(area.x + area.w);
          expect(sy).toBeGreaterThanOrEqual(area.y);
          expect(sy).toBeLessThanOrEqual(area.y + area.h);
        }
      }
    }
  });

  it('cadrage du zoom : un vinyle garde le poste entier dans le cadre', () => {
    const layer = { w: 800, h: 400 };
    const pl = smallPlacement('h', 'hifi', 'desk', 2, 2.5);
    const { rect } = hifiZoomFrame('desk', pl, 'vinyl', layer);
    const [x0, x1, y0, y1, z0, z1] = placementBounds(pl);
    const area = hifiZoomArea(layer);
    for (const p of [[x0, y0, z0], [x1, y1, z1]] as [number, number, number][]) {
      const [sx] = hostPointPx('desk', 0, rect, p, PLUNGE_CAMERA);
      expect(sx).toBeGreaterThanOrEqual(area.x);
      expect(sx).toBeLessThanOrEqual(area.x + area.w);
    }
  });
});
