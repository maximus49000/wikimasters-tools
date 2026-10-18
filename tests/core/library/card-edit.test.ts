import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { boardWidthCm, replaceCard, setCoverOf, setDisplayOf, setShapeOf } from '../../../src/core/library/room-grid';

const shelf = { id: 'sh', kind: 'shelf', col: 8, row: 6 } as const;
const desk = { id: 'd', kind: 'desk', col: 0, row: 10 } as const;
const stored = (id: string, shape: 'cd' | 'dvd' | 'game' | 'book', order: number, extra: object = {}): Layout[number] =>
  ({ id, kind: 'stored', shape, shelfId: 'sh', level: 1, order, slug: id, ...extra }) as Layout[number];
// Tablette pleine de CD de face (5 × 14 + 4 = 74 cm), le dernier est « c4 ».
const fullOfCds = (): Layout => [shelf, ...[0, 1, 2, 3, 4].map((i) => stored(`c${i}`, 'cd', i))];

describe('changements d’une carte (présentation, format)', () => {
  it('format plus épais sur une tablette pleine → null, plan inchangé (30 DVD sur la tranche = 74 cm ; livre sur la tranche = 3 cm)', () => {
    const layout: Layout = [shelf, ...Array.from({ length: 30 }, (_, i) => stored(`d${i}`, 'dvd', i, { display: 'spine' }))];
    const copy = structuredClone(layout);
    expect(setShapeOf(layout, 'd29', 'book')).toBeNull();
    expect(layout).toEqual(copy);
    // Un format plus mince passe toujours (CD sur la tranche : 1 cm).
    expect(setShapeOf(layout, 'd29', 'cd')![30]).toMatchObject({ shape: 'cd', display: 'spine' });
  });

  it('CD → livre sur une tablette qui a la place → livre, présentation par défaut (tranche)', () => {
    const layout: Layout = [shelf, stored('c', 'cd', 0, { cover: 'https://img.example/a.jpg' })];
    const next = setShapeOf(layout, 'c', 'book')!;
    expect(next[1]).toEqual({ id: 'c', kind: 'stored', shape: 'book', shelfId: 'sh', level: 1, order: 0, slug: 'c' });
  });

  it('jeu en présentation dos → CD : face (défaut) ; boîte et couleur effacées', () => {
    const layout: Layout = [shelf, stored('g', 'game', 0, { display: 'back', box: 'gamecube', caseColor: '#123456' })];
    const next = setShapeOf(layout, 'g', 'cd')!;
    expect(next[1]).toEqual({ id: 'g', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 0, slug: 'g' });
  });

  it('une carte avec pochette changée de format perd sa pochette', () => {
    const layout: Layout = [shelf, stored('c', 'cd', 0, { cover: 'https://img.example/a.jpg' })];
    expect((setShapeOf(layout, 'c', 'dvd')![1] as { cover?: string }).cover).toBeUndefined();
  });

  it('carte posée changée de format : null si elle chevauche un voisin, sinon elle garde sa place', () => {
    const layout: Layout = [desk,
      { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'p' },
      { id: 'q', kind: 'posed', shape: 'cd', hostId: 'd', x: 14.5, z: 0, slug: 'q' }];
    const copy = structuredClone(layout);
    expect(setShapeOf(layout, 'p', 'book')).toBeNull();
    expect(layout).toEqual(copy);
    expect(setShapeOf(layout, 'q', 'dvd')![2]).toMatchObject({ shape: 'dvd', x: 14.5, z: 0 });
  });

  it('setDisplayOf : tranche d’un CD (plus étroit) passe, retour à la face = champ absent ; dos refusé hors jeu', () => {
    const layout = fullOfCds();
    const slim = setDisplayOf(layout, 'c4', 'spine')!;
    expect(slim[5]).toMatchObject({ id: 'c4', display: 'spine' });
    expect(setDisplayOf(layout, 'c4', 'back')).toBeNull();
    expect((setDisplayOf(slim, 'c4', 'cover')![5] as { display?: string }).display).toBeUndefined();
  });

  it('setDisplayOf : un livre qui passe de la tranche à la face sur une tablette pleine → null', () => {
    // 4 livres de face (4 × 15 + 3 = 63 cm) + un livre sur la tranche : le dernier ne peut plus passer de face (79 cm).
    const layout: Layout = [shelf, ...[0, 1, 2, 3].map((i) => stored(`b${i}`, 'book', i, { display: 'cover' })), stored('b4', 'book', 4)];
    const copy = structuredClone(layout);
    expect(setDisplayOf(layout, 'b4', 'cover')).toBeNull();
    expect(layout).toEqual(copy);
    // Une face qui repasse sur la tranche (plus étroit) passe toujours.
    expect(setDisplayOf(layout, 'b3', 'spine')![4]).toEqual(stored('b3', 'book', 3));
  });

  it('un jeu accepte le dos', () => {
    const layout: Layout = [shelf, stored('g', 'game', 0)];
    expect(setDisplayOf(layout, 'g', 'back')![1]).toMatchObject({ display: 'back' });
  });
});

describe('pochette choisie d’un objet (setCoverOf) et changer de carte (replaceCard)', () => {
  const URL_A = 'https://img.example/a.jpg';

  it('setCoverOf : enregistre la pochette (https seulement) sur une carte rangée ou posée ; null l’efface ; rien d’autre ne change', () => {
    const layout: Layout = [shelf, stored('c', 'cd', 0, { display: 'spine' }), desk, { id: 'p', kind: 'posed', shape: 'dvd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'p' }];
    const withCover = setCoverOf(layout, 'c', URL_A)!;
    expect(withCover[1]).toEqual({ ...layout[1], cover: URL_A });
    expect(setCoverOf(layout, 'p', URL_A)![3]).toEqual({ ...layout[3], cover: URL_A });
    expect(setCoverOf(withCover, 'c', null)![1]).toEqual(layout[1]);
    // Même pochette, ou aucune à effacer : la disposition elle-même.
    expect(setCoverOf(withCover, 'c', URL_A)).toBe(withCover);
    expect(setCoverOf(layout, 'c', null)).toBe(layout);
    // Pas https, pas une carte rangée / posée, objet absent : null.
    expect(setCoverOf(layout, 'c', 'http://img.example/a.jpg')).toBeNull();
    expect(setCoverOf(layout, 'c', 'javascript:alert(1)')).toBeNull();
    expect(setCoverOf(layout, 'sh', URL_A)).toBeNull();
    expect(setCoverOf(layout, 'zz', URL_A)).toBeNull();
  });

  it('replaceCard : la nouvelle carte prend la même place (id, tablette, rang, présentation) ; pochette, boîte, couleur effacées', () => {
    const layout: Layout = [shelf, stored('c0', 'cd', 0), stored('g', 'game', 1, { display: 'back', box: 'gamecube', caseColor: '#123456', cover: URL_A }), stored('c2', 'cd', 2)];
    const next = replaceCard(layout, 'g', 'Zelda')!;
    expect(next[2]).toEqual({ id: 'g', kind: 'stored', shape: 'game', shelfId: 'sh', level: 1, order: 1, display: 'back', slug: 'Zelda' });
    expect(next.filter((p) => p.id !== 'g')).toEqual(layout.filter((p) => p.id !== 'g'));
    // Autre format : le dos d'un jeu retombe sur le défaut du format.
    expect(replaceCard(layout, 'g', 'Dune', 'book')![2]).toEqual({ id: 'g', kind: 'stored', shape: 'book', shelfId: 'sh', level: 1, order: 1, slug: 'Dune' });
  });

  it('replaceCard : carte posée, même place et même pose', () => {
    const layout: Layout = [desk, { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 10, z: 3, pose: 'flat', slug: 'p', cover: URL_A }];
    expect(replaceCard(layout, 'p', 'Kiki')![1]).toEqual({ id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 10, z: 3, pose: 'flat', slug: 'Kiki' });
  });

  it('replaceCard refusé (null, plan inchangé) : carte déjà dans la pièce, nouvelle carte qui ne tient pas, objet qui n’est pas une carte rangée / posée', () => {
    const layout = fullOfCds();
    const copy = structuredClone(layout);
    expect(replaceCard(layout, 'c4', 'c1')).toBeNull();
    expect(replaceCard(layout, 'c4', 'c4')).toBeNull();
    expect(replaceCard([...layout, { id: 'w', kind: 'wall', shape: 'poster', col: 0, row: 0, slug: 'Affiche' }], 'c4', 'Affiche')).toBeNull();
    // Tablette pleine de CD de face : un livre (sur la tranche par défaut, plus mince) y tient.
    expect(replaceCard(layout, 'c4', 'Dune', 'book')).not.toBeNull();
    // 30 DVD sur la tranche (74 cm) : un livre sur la tranche (3 cm, plus épais) n'y tient pas.
    const dvds: Layout = [shelf, ...Array.from({ length: 30 }, (_, i) => stored(`d${i}`, 'dvd', i, { display: 'spine' }))];
    expect(boardWidthCm({ shape: 'book', display: 'spine' })).toBeGreaterThan(boardWidthCm({ shape: 'dvd', display: 'spine' }));
    expect(replaceCard(dvds, 'd29', 'Dune', 'book')).toBeNull();
    expect(replaceCard(layout, 'sh', 'Film')).toBeNull();
    expect(layout).toEqual(copy);
    const posed: Layout = [desk,
      { id: 'p', kind: 'posed', shape: 'cd', hostId: 'd', x: 0, z: 0, pose: 'flat', slug: 'p' },
      { id: 'q', kind: 'posed', shape: 'cd', hostId: 'd', x: 14.5, z: 0, slug: 'q' }];
    expect(replaceCard(posed, 'p', 'Livre', 'book')).toBeNull();
  });
});
