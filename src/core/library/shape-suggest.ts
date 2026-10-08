import type { Category } from '../kinds/kinds-category';
import type { ShelfShape, WallShape } from './library-types';

// Forme conseillée selon la catégorie de la carte (musique → CD ou vinyle, film → DVD, jeu → jeu vidéo, livre → livre).
export function suggestShape(category: Category): { shelf: ShelfShape; wall: WallShape } {
  switch (category) {
    case 'music':
      return { shelf: 'cd', wall: 'vinyl' };
    case 'film':
      return { shelf: 'dvd', wall: 'poster' };
    case 'games':
      return { shelf: 'game', wall: 'poster' };
    case 'books':
      return { shelf: 'book', wall: 'sleeve-frame' };
    default:
      return { shelf: 'book', wall: 'poster' };
  }
}
