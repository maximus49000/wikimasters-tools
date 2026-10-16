import { describe, expect, it } from 'vitest';
import type { Placed, WallShape, ShelfShape } from '../../../src/core/library/library-types';
import { boxInLayer, flightTarget, layerFrame, musicRows, openingOf } from '../../../src/core/library/opened-item';

const stored = (shape: ShelfShape): Placed => ({ id: 's', kind: 'stored', shape, shelfId: 'e', level: 0, order: 0, slug: 'x' });
const wall = (shape: WallShape): Placed => ({ id: 'w', kind: 'wall', shape, col: 0, row: 0, slug: 'x' });
const track = (n: number) => ({ uri: `spotify:track:${n}`, title: `T${n}`, artist: 'A' });

describe('openingOf', () => {
  it('objets rangés', () => {
    expect(openingOf(stored('cd'))).toBe('jewel-cd');
    expect(openingOf(stored('dvd'))).toBe('dvd-case');
    expect(openingOf(stored('game'))).toBe('game-case');
    expect(openingOf(stored('book'))).toBe('book');
  });
  it('objets accrochés', () => {
    expect(openingOf(wall('vinyl'))).toBe('vinyl-sleeve');
    expect(openingOf(wall('sleeve-square'))).toBe('vinyl-sleeve');
    expect(openingOf(wall('sleeve-round'))).toBe('vinyl-sleeve');
    expect(openingOf(wall('sleeve-frame'))).toBe('vinyl-sleeve');
    expect(openingOf(wall('poster'))).toBeNull();
  });
  it('le reste', () => {
    expect(openingOf({ id: 'a', kind: 'small', item: 'lamp' as never, hostId: 'h', slot: 0 })).toBeNull();
    expect(openingOf({ id: 'c', kind: 'computer', deskId: 'd' })).toBeNull();
  });
});

describe('musicRows', () => {
  const vide = { rows: [], empty: 'Aucune piste trouvée' };
  it('vide', () => {
    expect(musicRows(null)).toEqual(vide);
    expect(musicRows({ kind: 'album', items: [] } as never)).toEqual(vide);
  });
  it('pistes dans l\'ordre', () => {
    const listen = { kind: 'album', items: [track(1), track(2)] } as never;
    const m = musicRows(listen);
    expect(m.empty).toBeNull();
    expect(m.rows).toEqual([
      { kind: 'track', track: track(1), listen },
      { kind: 'track', track: track(2), listen },
    ]);
  });
});

describe('layerFrame', () => {
  it('portrait : pivoté', () => expect(layerFrame({ w: 400, h: 800 })).toEqual({ rotated: true, w: 800, h: 400 }));
  it('paysage : droit', () => expect(layerFrame({ w: 800, h: 400 })).toEqual({ rotated: false, w: 800, h: 400 }));
});

describe('boxInLayer', () => {
  const screen = { x: 0, y: 0, w: 400, h: 800 };
  it('calque droit : simple décalage', () => {
    expect(boxInLayer({ x: 30, y: 40, w: 10, h: 20 }, { x: 10, y: 5, w: 800, h: 400 }, false)).toEqual({ x: 20, y: 35, w: 10, h: 20 });
  });
  it('calque tourné de 90° : x ← y, y ← bord droit − droite, largeur et hauteur échangées', () => {
    expect(boxInLayer({ x: 10, y: 20, w: 30, h: 40 }, screen, true)).toEqual({ x: 20, y: 360, w: 40, h: 30 });
  });
  it('null reste null', () => expect(boxInLayer(null, screen, true)).toBeNull());
});

describe('flightTarget', () => {
  const frame = { w: 800, h: 400 };
  it('cible visible : gardée telle quelle', () => {
    expect(flightTarget({ x: 600, y: 300, w: 40, h: 40 }, frame, 60)).toEqual({ x: 600, y: 300, w: 40, h: 40 });
  });
  it('hors écran : le centre ramené sur le bord le plus proche', () => {
    expect(flightTarget({ x: 1000, y: 100, w: 40, h: 40 }, frame, 60)).toEqual({ x: 780, y: 100, w: 40, h: 40 });
    expect(flightTarget({ x: 300, y: -500, w: 40, h: 40 }, frame, 60)).toEqual({ x: 300, y: -20, w: 40, h: 40 });
  });
  it('non mesurable : milieu du bord droit, à la taille donnée', () => {
    expect(flightTarget(null, frame, 60)).toEqual({ x: 770, y: 170, w: 60, h: 60 });
  });
});
