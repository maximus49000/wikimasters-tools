// src/core/library/furniture-models.ts
// Dessin provisoire Opus — reprise Fable prévue.
import type { StandingKind } from './library-types';
import type { Model, Piece } from './furniture-render3d';

// Modèles des meubles en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant).
// Ils reprennent les dessins de face historiques : mêmes éléments, mêmes couleurs de palette.
const box = (x: number, y: number, z: number, w: number, h: number, d: number, fill: Piece['fill']): Piece => ({ shape: 'box', x, y, z, w, h, d, fill });
const cyl = (cx: number, cz: number, y: number, r: number, h: number, fill: Piece['fill']): Piece => ({ shape: 'cyl', cx, cz, y, r, h, fill });
const ball = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, fill: Piece['fill']): Piece => ({ shape: 'ball', cx, cy, cz, rx, ry, rz, fill });
// Quatre pieds carrés aux coins d'une base w × d.
const legs = (w: number, d: number, h: number, size: number, inset: number, fill: Piece['fill']): Piece[] => [
  box(inset, 0, inset, size, h, size, fill), box(w - inset - size, 0, inset, size, h, size, fill),
  box(inset, 0, d - inset - size, size, h, size, fill), box(w - inset - size, 0, d - inset - size, size, h, size, fill),
];

export const FURNITURE_MODELS: Record<StandingKind, Model> = {
  shelf: {
    w: 80, d: 30, h: 180,
    pieces: [
      box(3, 8, 28, 74, 169, 2, 'woodDark'),
      box(0, 0, 0, 3, 180, 30, 'wood'), box(77, 0, 0, 3, 180, 30, 'wood'),
      box(3, 0, 0, 74, 8, 30, 'wood'), box(3, 58, 0, 74, 3, 28, 'wood'), box(3, 118, 0, 74, 3, 28, 'wood'), box(0, 177, 0, 80, 3, 30, 'wood'),
    ],
    face: { x: 3, y: 8, w: 74, h: 169 },
  },
  desk: {
    w: 120, d: 60, h: 75,
    pieces: [...legs(120, 60, 72, 4, 4, 'leg'), box(0, 72, 0, 120, 3, 60, 'desk')],
    face: { x: 0, y: 72, w: 120, h: 3 },
  },
  chair: {
    w: 45, d: 50, h: 90,
    pieces: [
      ...legs(45, 50, 44, 3, 3, 'leg'),
      box(2, 44, 2, 41, 4, 44, 'desk'),
      box(3, 48, 44, 3, 42, 3, 'wood'), box(39, 48, 44, 3, 42, 3, 'wood'),
      box(3, 66, 44, 39, 6, 3, 'wood'), box(3, 80, 44, 39, 8, 3, 'wood'),
    ],
    pois: [{ type: 'seat', x: 22, y: 48, z: 24 }],
  },
  sofa: {
    w: 200, d: 90, h: 85,
    pieces: [
      ...legs(200, 90, 12, 6, 8, 'leg'),
      box(0, 12, 0, 200, 30, 90, 'fabric'),
      box(0, 42, 68, 200, 43, 22, 'fabric'),
      box(0, 42, 0, 22, 25, 68, 'fabricDark'), box(178, 42, 0, 22, 25, 68, 'fabricDark'),
      box(22, 42, 4, 78, 12, 62, 'fabricLight'), box(100, 42, 4, 78, 12, 62, 'fabricLight'),
    ],
    pois: [{ type: 'seat', x: 50, y: 54, z: 35 }, { type: 'seat', x: 100, y: 54, z: 35 }, { type: 'seat', x: 150, y: 54, z: 35 }, { type: 'sleep', x: 120, y: 54, z: 35 }],
  },
  armchair: {
    w: 80, d: 80, h: 90,
    pieces: [
      ...legs(80, 80, 12, 6, 6, 'leg'),
      box(0, 12, 0, 80, 30, 80, 'warm'),
      box(0, 42, 60, 80, 48, 20, 'warm'),
      box(0, 42, 0, 14, 24, 60, 'warmDark'), box(66, 42, 0, 14, 24, 60, 'warmDark'),
      box(14, 42, 4, 52, 12, 54, 'warmLight'),
    ],
    pois: [{ type: 'seat', x: 40, y: 54, z: 30 }],
  },
  'coffee-table': { w: 100, d: 55, h: 45, pieces: [...legs(100, 55, 41, 4, 5, 'leg'), box(0, 41, 0, 100, 4, 55, 'desk')] },
  lamp: {
    w: 40, d: 40, h: 160,
    pieces: [cyl(20, 20, 0, 15, 3, 'metal'), cyl(20, 20, 3, 1.5, 125, 'metal'), cyl(20, 20, 125, 17, 35, 'shade')],
  },
  plant: {
    w: 45, d: 45, h: 110,
    pieces: [cyl(22.5, 22.5, 0, 15, 35, 'warm'), ball(22.5, 72, 22.5, 22, 38, 22, 'leaf'), ball(16, 92, 18, 10, 14, 10, 'leafDark')],
  },
  rug: { w: 200, d: 140, h: 1, pieces: [box(0, 0, 0, 200, 1, 140, 'rug')] },
  basket: {
    w: 60, d: 45, h: 25,
    pieces: [box(0, 0, 0, 60, 25, 45, 'warm'), box(6, 12, 6, 48, 8, 33, 'fabricLight')],
    pois: [{ type: 'curl', x: 30, y: 20, z: 22 }],
  },
  bowl: { w: 20, d: 20, h: 8, pieces: [cyl(10, 10, 0, 10, 8, 'metal'), cyl(10, 10, 7, 8, 1, 'warm')], pois: [{ type: 'eat', x: 10, y: 0, z: 10 }] },
  kennel: {
    w: 70, d: 90, h: 75,
    pieces: [box(0, 0, 0, 70, 50, 90, 'wood'), box(0, 50, 0, 70, 10, 90, 'door'), box(20, 60, 0, 30, 15, 90, 'door'), box(22, 0, 0, 26, 36, 0.5, 'woodDark')],
    pois: [{ type: 'enter', x: 35, y: 0, z: 2 }, { type: 'sleep', x: 35, y: 10, z: 50 }],
  },
  charger: {
    w: 40, d: 30, h: 10,
    pieces: [box(0, 0, 0, 40, 4, 30, 'metal'), box(0, 4, 24, 40, 6, 6, 'metal'), box(18, 9, 25, 4, 1, 2, 'leaf')],
    pois: [{ type: 'charge', x: 20, y: 4, z: 12 }],
  },
  globe: { w: 50, d: 50, h: 100, pieces: [cyl(25, 25, 0, 20, 4, 'wood'), cyl(25, 25, 4, 2, 52, 'wood'), ball(25, 75, 25, 25, 25, 25, 'metal')] },
  telescope: { w: 60, d: 60, h: 130, pieces: [cyl(30, 30, 0, 25, 3, 'woodDark'), cyl(30, 30, 3, 3, 87, 'wood'), box(5, 90, 23, 50, 14, 14, 'metal'), cyl(52, 30, 104, 3, 8, 'metal')] },
  automaton: {
    w: 45, d: 40, h: 110,
    pieces: [box(8, 0, 13, 10, 35, 14, 'woodDark'), box(27, 0, 13, 10, 35, 14, 'woodDark'), box(4, 35, 6, 37, 45, 28, 'metal'), box(11, 80, 10, 23, 28, 20, 'metal')],
  },
};

// Garnitures en laiton ajoutées dans une pièce Steampunk.
export const STEAMPUNK_TRIM: Partial<Record<StandingKind, Piece[]>> = {
  desk: [box(0, 70, 0, 120, 2, 1, 'metal')],
  armchair: [box(0, 66, 0, 14, 1, 60, 'metal'), box(66, 66, 0, 14, 1, 60, 'metal')],
  lamp: [cyl(20, 20, 2, 16, 1, 'metal')],
};
