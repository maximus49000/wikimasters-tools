import { describe, expect, it } from 'vitest';
import type { Placed, WallShape, ShelfShape } from '../../../src/core/library/library-types';
import { layerFrame, musicRows, openingOf } from '../../../src/core/library/opened-item';

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
