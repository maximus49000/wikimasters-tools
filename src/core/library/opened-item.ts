// Logique pure de l'objet « ouvert » dans la scène (boîtier de CD, pochette, étui, livre).
import type { Placed } from './library-types';
import type { Track } from '../spotify/spotify-api';
import type { Listen } from '../music/listen';

export type Opening = 'jewel-cd' | 'vinyl-sleeve' | 'dvd-case' | 'game-case' | 'book';

// Comment s'ouvre un objet posé ; null = rien à ouvrir (poster, petit objet, ordinateur…).
export function openingOf(p: Placed): Opening | null {
  if (p.kind === 'stored') {
    switch (p.shape) {
      case 'cd': return 'jewel-cd';
      case 'dvd': return 'dvd-case';
      case 'game': return 'game-case';
      case 'book': return 'book';
    }
  }
  if (p.kind === 'wall') return p.shape === 'poster' ? null : 'vinyl-sleeve';
  return null;
}

// Une ligne du sélecteur du plateau.
export type SelectorRow =
  | { kind: 'track'; track: Track; listen: Listen }
  | { kind: 'video'; label: string; video: { kind: 'youtube'; key: string } | { kind: 'hls'; url: string; poster?: string; pageUrl: string } }
  | { kind: 'synopsis'; text: string }
  | { kind: 'link'; label: string; url: string };

// `empty` : message affiché quand `rows` est vide.
export type SelectorModel = { rows: SelectorRow[]; empty: string | null };

export function musicRows(listen: Listen | null): SelectorModel {
  if (!listen || listen.items.length === 0) return { rows: [], empty: 'Aucune piste trouvée' };
  return { rows: listen.items.map((track): SelectorRow => ({ kind: 'track', track, listen })), empty: null };
}

// Calque paysage : en écran vertical, largeur et hauteur sont échangées (le calque est tourné de 90°).
export function layerFrame(screen: { w: number; h: number }): { rotated: boolean; w: number; h: number } {
  return screen.h > screen.w ? { rotated: true, w: screen.h, h: screen.w } : { rotated: false, w: screen.w, h: screen.h };
}
