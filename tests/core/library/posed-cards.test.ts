import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { carriedPlacementOf, placementBounds, posedPlacement } from '../../../src/core/library/carried-items';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { ITEM_MODELS, itemPieces, storedModel } from '../../../src/core/library/item-models';
import { poseOf, type Layout, type Posed } from '../../../src/core/library/library-types';
import { moveToBoard, moveToTop, poseCard, setPose } from '../../../src/core/library/room-grid';
import { POSED_DEPTH_CM, topSize, topThingOf } from '../../../src/core/library/surface';

const desk = { id: 'd', kind: 'desk', col: 0, row: 10 } as const;
const shelf = { id: 'sh', kind: 'shelf', col: 8, row: 6 } as const;
const state = (layout: unknown[]) => ({ version: 10, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });
const layoutOf = (raw: unknown[]): Layout => parseLibraryState(state(raw)).rooms[0]!.layout;

describe('cartes posées : trépied ou à plat', () => {
  it('poseOf : pose absente = trépied', () => {
    const p: Posed = { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, slug: 'S' };
    expect(poseOf(p)).toBe('stand');
    expect(poseOf({ ...p, pose: 'flat' })).toBe('flat');
  });

  it('topSize : trépied = largeur × profondeur du trépied ; à plat = couverture couchée', () => {
    expect(topSize({ shape: 'cd', pose: 'flat' })).toEqual({ w: 14, d: 12.5 });
    expect(topSize({ shape: 'cd' })).toEqual({ w: 14, d: POSED_DEPTH_CM });
    expect(topSize({ shape: 'cd', pose: 'stand' })).toEqual({ w: 14, d: POSED_DEPTH_CM });
    const gc = storedModel('game', 'gamecube');
    expect(topSize({ shape: 'game', box: 'gamecube', pose: 'flat' })).toEqual({ w: gc.w, d: gc.h });
  });

  it('poseCard : pose une carte (trépied par défaut) ; slug déjà posé ou place prise → null', () => {
    const base: Layout = [desk];
    const one = poseCard(base, 'd', 'cd', 'Disque', 'p1', 0, 0)!;
    expect(one[1]).toEqual({ id: 'p1', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, slug: 'Disque' });
    const flat = poseCard(base, 'd', 'dvd', 'Film', 'p1', 0, 0, 'flat')!;
    expect(flat[1]).toEqual({ id: 'p1', kind: 'posed', shape: 'dvd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'Film' });
    expect(poseCard(one, 'd', 'cd', 'Disque', 'p2', 40, 0)).toBeNull();
    expect(poseCard(one, 'd', 'cd', 'Autre', 'p2', 5, 0)).toBeNull();
    expect(poseCard(one, 'nope', 'cd', 'Autre', 'p2', 40, 0)).toBeNull();
    expect(poseCard(one, 'd', 'cd', 'Autre', 'p2', 40, 0)).not.toBeNull();
  });

  it('setPose : à plat contre un voisin → null, plan inchangé ; sinon la carte ne bouge pas', () => {
    const layout: Layout = [desk,
      { id: 'p', kind: 'posed', shape: 'dvd', hostId: 'd', x: 0, z: 0, slug: 'Film' },
      { id: 'q', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 10, slug: 'Disque' }];
    const copy = structuredClone(layout);
    expect(setPose(layout, 'p', 'flat')).toBeNull();
    expect(layout).toEqual(copy);
    const free = setPose(layout, 'q', 'flat')!;
    expect(free[2]).toEqual({ id: 'q', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 10, pose: 'flat', slug: 'Disque' });
    // Retour au trépied : la pose redevient absente.
    expect(setPose(free, 'q', 'stand')![2]).toEqual(layout[2]);
    expect(setPose(layout, 'nope', 'flat')).toBeNull();
    expect(setPose(layout, 'd', 'flat')).toBeNull();
  });

  it('moveToTop d’un CD rangé → carte posée sur trépied, même slug ; sa tablette se recompacte', () => {
    const layout: Layout = [desk, shelf,
      { id: 's1', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 0, display: 'spine', slug: 'Disque', cover: 'https://img.example/a.jpg' },
      { id: 's2', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 1, slug: 'Autre' }];
    const next = moveToTop(layout, 's1', 'd', 10, 0)!;
    expect(next.find((p) => p.id === 's1')).toEqual({ id: 's1', kind: 'posed', shape: 'cd', hostId: 'd', x: 10, z: 0, slug: 'Disque', cover: 'https://img.example/a.jpg' });
    expect(next.find((p) => p.id === 's2')).toMatchObject({ order: 0 });
    // Un jeu garde sa boîte et sa couleur ; une place prise refuse.
    const game: Layout = [desk, shelf, { id: 'g', kind: 'stored', shape: 'game', shelfId: 'sh', level: 0, order: 0, box: 'gamecube', caseColor: '#112233', slug: 'Jeu' },
      { id: 'q', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, slug: 'Disque' }];
    expect(moveToTop(game, 'g', 'd', 40, 0)!.find((p) => p.id === 'g')).toEqual({ id: 'g', kind: 'posed', shape: 'game', hostId: 'd', x: 40, z: 0, box: 'gamecube', caseColor: '#112233', slug: 'Jeu' });
    expect(moveToTop(game, 'g', 'd', 2, 0)).toBeNull();
  });

  it('moveToTop d’une carte posée : change de place, garde sa pose', () => {
    const layout: Layout = [desk, { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'Disque' }];
    expect(moveToTop(layout, 'p', 'd', 30, 5)![1]).toEqual({ id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 30, z: 5, pose: 'flat', slug: 'Disque' });
  });

  it('moveToBoard d’une carte posée → rangée (pose oubliée, couverture gardée)', () => {
    const layout: Layout = [desk, shelf, { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'Disque', cover: 'https://img.example/a.jpg' }];
    expect(moveToBoard(layout, 'p', 'sh', 1, 0)!.find((p) => p.id === 'p')).toEqual({ id: 'p', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 0, slug: 'Disque', cover: 'https://img.example/a.jpg' });
  });

  it('cover : une adresse https non vide est relue ; une valeur invalide est écartée sans perdre l’objet', () => {
    const ok = 'https://img.example/c.jpg';
    const read = layoutOf([desk, shelf,
      { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, slug: 'A', cover: ok },
      { id: 's', kind: 'stored', shape: 'dvd', shelfId: 'sh', level: 1, order: 0, slug: 'B', cover: ok },
      { id: 'p2', kind: 'posed', shape: 'cd', hostId: 'd', x: 30, z: 0, slug: 'C', cover: 'http://img.example/c.jpg' },
      { id: 's2', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 1, slug: 'D', cover: '' },
      { id: 's3', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 2, order: 0, slug: 'E', cover: 'javascript:alert(1)' },
      { id: 'p3', kind: 'posed', shape: 'cd', hostId: 'd', x: 60, z: 0, slug: 'F', cover: 42 },
    ]);
    expect(read.map((p) => p.id)).toEqual(['d', 'sh', 'p', 's', 'p2', 's2', 's3', 'p3']);
    expect(read.find((p) => p.id === 'p')).toMatchObject({ cover: ok });
    expect(read.find((p) => p.id === 's')).toMatchObject({ cover: ok });
    for (const id of ['p2', 's2', 's3', 'p3']) expect(read.find((p) => p.id === id)).not.toHaveProperty('cover');
  });

  it('pose relue : « flat » gardée, « stand » ou inconnue → absente (trépied), sans perdre l’objet', () => {
    const read = layoutOf([desk,
      { id: 'a', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'A' },
      { id: 'b', kind: 'posed', shape: 'cd', hostId: 'd', x: 30, z: 0, pose: 'stand', slug: 'B' },
      { id: 'c', kind: 'posed', shape: 'cd', hostId: 'd', x: 60, z: 0, pose: 'upside', slug: 'C' },
    ]);
    expect(read.find((p) => p.id === 'a')).toMatchObject({ pose: 'flat' });
    expect(read.find((p) => p.id === 'b')).not.toHaveProperty('pose');
    expect(read.find((p) => p.id === 'c')).not.toHaveProperty('pose');
  });

  it('à la relecture, une carte à plat qui chevauche est replacée selon son empreinte couchée', () => {
    // Le CD à plat (14 × 12,5) en z 0 recouvre le CD sur trépied posé en z 10 : celui-ci prend la première place libre.
    const read = layoutOf([desk,
      { id: 'a', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'A' },
      { id: 'b', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 10, slug: 'B' },
    ]);
    expect(read.find((p) => p.id === 'b')).toMatchObject({ x: 14, z: 0 });
  });

  it('dessin : à plat = boîtier couché, couverture sur le dessus, sans trépied', () => {
    const p: Posed = { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 10, z: 4, pose: 'flat', slug: 'S' };
    const pl = posedPlacement(p, 'desk');
    const m = ITEM_MODELS.cd;
    const y = FURNITURE_MODELS.desk.h;
    expect(placementBounds(pl)).toEqual([10, 10 + m.w, y, y + m.d, 4, 4 + m.h]);
    const pieces = itemPieces(pl);
    expect(pieces).toHaveLength(1);
    const [box] = pieces;
    expect(box!.shape === 'box' && box!.decals).toEqual([{ face: 'top', key: 'p|cover:cd' }]);
    expect(box!.shape === 'box' && box!.lean).toBeFalsy();
    // Sur trépied : le présentoir (socle, rebord, béquille + boîtier penché), comme avant.
    const { pose: _flat, ...upright } = p;
    const stand = itemPieces(posedPlacement(upright, 'desk'));
    expect(stand).toHaveLength(4);
    expect(carriedPlacementOf([desk, p], p)!.placement).toEqual(pl);
  });

  it('dessin à plat : l’emprise du boîtier couché = l’empreinte du plateau (livre, jeu au format de boîte)', () => {
    const y = FURNITURE_MODELS.desk.h;
    const book: Posed = { id: 'b', kind: 'posed', shape: 'book', hostId: 'd', x: 3, z: 2, pose: 'flat', slug: 'Dune' };
    const game: Posed = { id: 'g', kind: 'posed', shape: 'game', hostId: 'd', x: 40, z: 5, pose: 'flat', box: 'gamecube', slug: 'Zelda' };
    for (const p of [book, game]) {
      const [x0, x1, y0, y1, z0, z1] = placementBounds(posedPlacement(p, 'desk'));
      const size = topSize(topThingOf(p));
      expect(x1 - x0, p.shape).toBeCloseTo(size.w);
      expect(z1 - z0, p.shape).toBeCloseTo(size.d);
      expect(x0).toBe(p.x);
      expect(z0).toBe(p.z);
      expect(y0).toBeCloseTo(y);
      expect(y1).toBeGreaterThan(y0);
    }
  });
});
