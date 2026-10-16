// Logique pure de l'objet « ouvert » dans la scène (boîtier de CD, pochette, étui, livre).
import type { Placed } from './library-types';
import type { Track } from '../spotify/spotify-api';
import type { Listen } from '../music/listen';
import type { Box } from './zoom-target';
import type { ScreenDetail } from '../screen/tmdb-api';
import type { GameDetail } from '../game/game-detail';

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

// Ce que les services film/série et jeu répondent (forme minimale : les vues complètes des services y sont assignables).
export type ScreenViewLike = { status: 'detail'; detail: ScreenDetail } | { status: 'error'; message: string } | { status: 'none' | 'filmography' };
export type GameViewLike = { status: 'detail'; detail: GameDetail } | { status: 'error'; message: string } | { status: 'none' | 'empty' };

const NO_VIDEO_NOR_BO = 'Pas de bande-annonce ni de BO';
const boRows = (bo: Listen | null): SelectorRow[] => (bo ? bo.items.map((track): SelectorRow => ({ kind: 'track', track, listen: bo })) : []);
function mediaRows(video: SelectorRow | null, bo: Listen | null, failure: string | null): SelectorModel {
  const rows = [...(video ? [video] : []), ...boRows(bo)];
  // Une panne du service est dite, mais ne cache pas une BO trouvée par ailleurs.
  return { rows, empty: rows.length === 0 ? failure ?? NO_VIDEO_NOR_BO : null };
}

// Film ou série : la bande-annonce d'abord, puis les pistes de la BO.
export function screenRows(view: ScreenViewLike, bo: Listen | null): SelectorModel {
  const detail = view.status === 'detail' ? view.detail : null;
  const video: SelectorRow | null = detail?.trailerKey ? { kind: 'video', label: 'Bande-annonce', video: { kind: 'youtube', key: detail.trailerKey } } : null;
  return mediaRows(video, bo, view.status === 'error' ? view.message : null);
}

// Jeu vidéo : la bande-annonce (YouTube ou flux HLS Steam, avec la page du jeu en repli), puis les pistes de la BO.
export function gameRows(view: GameViewLike, bo: Listen | null): SelectorModel {
  const detail = view.status === 'detail' ? view.detail : null;
  const trailer = detail?.trailer;
  const video: SelectorRow | null = !detail || !trailer ? null
    : trailer.kind === 'youtube' ? { kind: 'video', label: 'Bande-annonce', video: { kind: 'youtube', key: trailer.key } }
    : { kind: 'video', label: 'Bande-annonce', video: { kind: 'hls', url: trailer.url, pageUrl: detail.pageUrl, ...(trailer.poster ? { poster: trailer.poster } : {}) } };
  return mediaRows(video, bo, view.status === 'error' ? view.message : null);
}

// Ce que le service livre répond (forme minimale : BookView y est assignable) et les sources de lecture libre.
export type BookViewLike = { status: 'detail'; detail: { synopsis?: { text: string } } } | { status: 'error'; message: string } | { status: 'none' | 'empty' };
export type BookReadingLike = { links: { label: string; url: string }[] };

// Livre : le synopsis, puis un lien par source de lecture libre. Rien de lisible : message (ou la panne du service).
export function bookRows(view: BookViewLike, reading: BookReadingLike | null): SelectorModel {
  const synopsis = view.status === 'detail' ? view.detail.synopsis?.text : undefined;
  const rows: SelectorRow[] = [
    ...(synopsis ? [{ kind: 'synopsis' as const, text: synopsis }] : []),
    ...(reading?.links ?? []).map((l): SelectorRow => ({ kind: 'link', label: l.label, url: l.url })),
  ];
  return { rows, empty: rows.length === 0 ? (view.status === 'error' ? view.message : 'Rien à lire pour ce livre') : null };
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
