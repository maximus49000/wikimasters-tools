import type { Layout, Room, StyleId } from '../../src/core/library/library-types';

// Pièce meublée du banc (48 colonnes, paysage) : un exemplaire de chaque grande famille pour juger un style d'un coup d'œil.
// Cases (col, row) = coin haut gauche du rectangle de dessin ; aucune donnée enregistrée : tout est posé à la main.
export function benchLayout(): Layout {
  return [
    // Mur : fenêtres et décors.
    { id: 'w1', kind: 'window', col: 17, row: 2, w: 8, h: 6 },
    { id: 'w2', kind: 'window', col: 34, row: 2, w: 8, h: 6 },
    { id: 'p1', kind: 'wall', shape: 'poster', col: 8, row: 3, slug: 'Dune' },
    { id: 'p2', kind: 'wall', shape: 'vinyl', col: 28, row: 4, slug: 'Daft_Punk', color: 'red' },
    { id: 'c1', kind: 'deco', deco: 'wall-clock', col: 44, row: 3 },
    // Sol.
    { id: 'rug', kind: 'rug', col: 8, row: 15 },
    { id: 'sh', kind: 'shelf', col: 1, row: 8 },
    { id: 'b1', kind: 'stored', shape: 'book', shelfId: 'sh', level: 0, order: 0, slug: 'Dune' },
    { id: 'b2', kind: 'stored', shape: 'book', shelfId: 'sh', level: 0, order: 1, slug: 'Foundation' },
    { id: 'b3', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 0, slug: 'Daft_Punk' },
    { id: 'b4', kind: 'stored', shape: 'dvd', shelfId: 'sh', level: 2, order: 0, slug: 'Alien' },
    { id: 'so', kind: 'sofa', col: 6, row: 12 },
    { id: 'ar', kind: 'arc-lamp', col: 14, row: 7 },
    { id: 'rc', kind: 'rocking-chair', col: 24, row: 11 },
    { id: 'pf', kind: 'pouf', col: 17, row: 15 },
    { id: 'pl', kind: 'paper-lantern', col: 29, row: 14 },
    { id: 'ds', kind: 'desk', col: 32, row: 13 },
    { id: 'cp', kind: 'computer', deskId: 'ds', slug: 'Dune' },
    { id: 'sl', kind: 'small', item: 'lamp', hostId: 'ds', x: 2, z: 10 },
    { id: 'mo', kind: 'monstera', col: 39, row: 10 },
    { id: 'pa', kind: 'palm', col: 43, row: 7 },
    { id: 'ct', kind: 'cat-tree', col: 28, row: 9 },
  ];
}

export const PETS = {
  chat: { species: 'cat', name: 'Miso', coat: 'orange' },
  chien: { species: 'dog', name: 'Rex', coat: 'brown' },
  robot: { species: 'robot', name: 'Bip', coat: 'white' },
} as const;

export function benchRoom(style: StyleId, pet: keyof typeof PETS | null = null): Room {
  return {
    id: `banc-${style}`,
    name: 'Banc',
    style,
    scene: 'city',
    orientation: 'landscape',
    cols: 48,
    pets: pet ? [{ id: 'pet1', ...PETS[pet] }] : [],
    layout: benchLayout(),
  };
}
