import type { Category } from '../core/library/furniture-catalog';
import type { FurnitureKind } from '../core/library/library-types';

// Glyphes (viewBox 24) de chaque type de meuble et de chaque catégorie.
export const KIND_ICON: Record<FurnitureKind, readonly string[]> = {
  shelf: ['M5 3v18', 'M19 3v18', 'M5 8h14', 'M5 14h14'],
  desk: ['M3 8h18', 'M5 8v12', 'M19 8v12'],
  computer: ['M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 20h8', 'M12 16v4'],
  chair: ['M7 3v18', 'M7 4h9', 'M6 13h12', 'M17 13v8'],
  sofa: ['M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6H4z', 'M2 12v5h2', 'M22 12v5h-2', 'M6 17v3', 'M18 17v3'],
  armchair: ['M6 10a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v8H6z', 'M3 12v6h3', 'M21 12v6h-3', 'M7 18v3', 'M17 18v3'],
  basket: ['M3 11h18', 'M5 11l1.5 9h11L19 11'],
  bowl: ['M3 12h18', 'M5 12a7 7 0 0 0 14 0'],
  kennel: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5a2 2 0 0 1 4 0v5'],
  'coffee-table': ['M4 9h16', 'M6 9l-2 10', 'M18 9l2 10'],
  plant: ['M12 21v-8', 'M12 13c-4 0-6-3-6-7 4 0 6 3 6 7z', 'M12 15c4 0 6-3 6-7-4 0-6 3-6 7z', 'M8 21h8'],
  lamp: ['M12 21V9', 'M8 21h8', 'M8 9l1.5-6h5L16 9z'],
  'small-plant': ['M12 18v-5', 'M12 13c-3 0-4.5-2.5-4.5-5 3 0 4.5 2.5 4.5 5z', 'M12 14c3 0 4.5-2.5 4.5-5-3 0-4.5 2.5-4.5 5z', 'M9 18h6', 'M5 21h14'],
  'small-lamp': ['M12 17v-6', 'M9 17h6', 'M9 11l1-4h4l1 4z', 'M5 21h14'],
  rug: ['M3 8h18v8H3z', 'M6 11h12'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  telescope: ['M4 14l12-6 2 4-12 6z', 'M12 15l-3 6', 'M12 15l3 6'],
  automaton: ['M8 5h8v6H8z', 'M10 8h.01', 'M14 8h.01', 'M7 11h10v7H7z', 'M9 18v3', 'M15 18v3'],
};

export const CATEGORY_ICON: Record<Category, readonly string[]> = {
  storage: KIND_ICON.shelf,
  seats: KIND_ICON.sofa,
  pets: KIND_ICON.kennel,
  deco: KIND_ICON.plant,
  steampunk: ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M5 5l2 2', 'M17 17l2 2', 'M19 5l-2 2', 'M7 17l-2 2'],
};
