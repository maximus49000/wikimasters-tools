// Logique pure de l'objet « ouvert » dans la scène (boîtier de CD, pochette, étui, livre).
import type { Placed } from './library-types';
import type { Track } from '../spotify/spotify-api';
import type { Listen } from '../music/listen';
import type { Box } from './zoom-target';

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

// Rectangle du repère de la scène (ou de l'écran) dans le repère du calque. `layer` : rectangle englobant du calque dans ce même
// repère. Tourné de 90° (sens horaire, origine en haut à gauche, posé contre le bord droit), un point (X, Y) devient
// (Y − haut, droite − X) : largeur et hauteur s'échangent.
export function boxInLayer<B extends Box | null>(box: B, layer: Box, rotated: boolean): B {
  if (!box) return box;
  if (!rotated) return { x: box.x - layer.x, y: box.y - layer.y, w: box.w, h: box.h } as B;
  return { x: box.y - layer.y, y: layer.x + layer.w - (box.x + box.w), w: box.h, h: box.w } as B;
}

// Arrivée du disque qui vole au poste (repère du calque) : le poste hors du calque → son centre ramené sur le bord le plus proche ;
// poste non mesurable → milieu du bord droit, à la taille `size`.
export function flightTarget(target: Box | null, frame: { w: number; h: number }, size: number): Box {
  if (!target) return { x: frame.w - size / 2, y: frame.h / 2 - size / 2, w: size, h: size };
  const cx = Math.min(frame.w, Math.max(0, target.x + target.w / 2));
  const cy = Math.min(frame.h, Math.max(0, target.y + target.h / 2));
  return { x: cx - target.w / 2, y: cy - target.h / 2, w: target.w, h: target.h };
}
