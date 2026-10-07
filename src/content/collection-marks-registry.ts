import type { CollectionMarks } from './collection-marks';

// Créé une fois par la surcouche ; les listes d'œuvres des fiches le lisent ici.
let marks: CollectionMarks | null = null;

export const setCollectionMarks = (next: CollectionMarks | null): void => {
  marks = next;
};
export const getCollectionMarks = (): CollectionMarks | null => marks;
