import { describe, expect, it } from 'vitest';
import type { Placed, WallShape, ShelfShape } from '../../../src/core/library/library-types';
import { boxInLayer, bookRows, flightTarget, gameRows, layerFrame, musicRows, openingOf, screenRows } from '../../../src/core/library/opened-item';

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

describe('screenRows / gameRows', () => {
  const bo = { kind: 'album' as const, items: [track(1), track(2)], albumUri: 'spotify:album:Z' };
  const film = (extra: object) => ({ status: 'detail' as const, detail: { mediaType: 'movie', id: 7, title: 'Film', ...extra } as never });
  it('film : vidéo d’abord, puis les pistes de la BO', () => {
    const model = screenRows(film({ trailerKey: 'abc' }), bo);
    expect(model.empty).toBeNull();
    expect(model.rows.map((r) => r.kind)).toEqual(['video', 'track', 'track']);
    expect(model.rows[0]).toMatchObject({ label: 'Bande-annonce', video: { kind: 'youtube', key: 'abc' } });
  });
  it('film sans bande-annonce ni BO, ou service muet : message', () => {
    expect(screenRows(film({}), null)).toEqual({ rows: [], empty: 'Pas de bande-annonce ni de BO' });
    expect(screenRows({ status: 'none' }, null).empty).toBe('Pas de bande-annonce ni de BO');
    expect(screenRows({ status: 'error', message: 'TMDB indisponible' }, null).empty).toBe('TMDB indisponible');
  });
  it('une panne ne cache pas une BO trouvée', () => {
    const model = screenRows({ status: 'error', message: 'x' }, bo);
    expect(model.rows).toHaveLength(2);
    expect(model.empty).toBeNull();
  });
  const jeu = (trailer?: object) => ({ status: 'detail' as const, detail: { source: 'steam', id: 1, title: 'J', pageUrl: 'https://store.steampowered.com/app/1', ...(trailer ? { trailer } : {}) } as never });
  it('jeu : flux HLS avec la page du jeu, ou YouTube', () => {
    expect(gameRows(jeu({ kind: 'hls', url: 'https://x/m.m3u8', poster: 'p.jpg' }), bo).rows[0]).toMatchObject({
      kind: 'video', video: { kind: 'hls', url: 'https://x/m.m3u8', poster: 'p.jpg', pageUrl: 'https://store.steampowered.com/app/1' },
    });
    expect(gameRows(jeu({ kind: 'youtube', key: 'k' }), null).rows).toEqual([{ kind: 'video', label: 'Bande-annonce', video: { kind: 'youtube', key: 'k' } }]);
  });
  it('jeu sans rien : message ; vue vide', () => {
    expect(gameRows(jeu(), null).empty).toBe('Pas de bande-annonce ni de BO');
    expect(gameRows({ status: 'empty' }, null).empty).toBe('Pas de bande-annonce ni de BO');
  });
});

describe('bookRows', () => {
  const detail = (extra: object) => ({ status: 'detail' as const, detail: { id: 'OL1W', title: 'Livre', ...extra } as never });
  const reading = { links: [{ label: 'Wikisource', url: 'https://fr.wikisource.org/wiki/L' }, { label: 'Internet Archive', url: 'https://archive.org/details/l' }] };
  it('synopsis puis un lien par source de lecture', () => {
    const model = bookRows(detail({ synopsis: { text: 'Résumé', url: 'u', source: 'wikipedia' } }), reading);
    expect(model.empty).toBeNull();
    expect(model.rows).toEqual([
      { kind: 'synopsis', text: 'Résumé' },
      { kind: 'link', label: 'Wikisource', url: 'https://fr.wikisource.org/wiki/L' },
      { kind: 'link', label: 'Internet Archive', url: 'https://archive.org/details/l' },
    ]);
  });
  it('sans synopsis : les liens seuls', () => {
    expect(bookRows(detail({}), reading).rows.map((r) => r.kind)).toEqual(['link', 'link']);
  });
  it('rien à lire : message', () => {
    expect(bookRows(detail({}), { links: [] })).toEqual({ rows: [], empty: 'Rien à lire pour ce livre' });
    expect(bookRows({ status: 'none' }, null).empty).toBe('Rien à lire pour ce livre');
    expect(bookRows({ status: 'error', message: 'Open Library indisponible' }, null).empty).toBe('Open Library indisponible');
  });
});
