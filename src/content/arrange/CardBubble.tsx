// Bulle d'un objet dans la vue Modifier (toucher un objet posé sans le glisser) : la même bulle que le mobilier de la pièce (wmt-lib-bubble,
// mêmes boutons et glyphes). ✥ Déplacer arme l'objet (seul un objet armé se glisse). Carte : présentation (tablette : face / tranche /
// dos pour un jeu ; plateau : trépied / à plat), format (CD, DVD, jeu, livre : le slug ne change pas), ⓘ fiche, 🗑 retirer. Petit objet :
// 🗑, allumer / éteindre une lampe, choisir la ville d'une horloge. ✕ ferme.
// Ancrée à côté de l'objet sans jamais le cacher (bubbleSpot), dans le calque de la vue (tourné avec lui en hauteur).
// Un changement est vérifié sur la disposition que l'on voit : refusé, le message habituel s'affiche dans la bulle et rien ne part ;
// accepté, il part tout de suite comme une intention (id + changement), appliquée par l'appelant à la disposition du moment (applyItemChange).
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { hasCitySetting } from '../../core/library/deco';
import { poseOf, type Layout, type Placed, type Pose, type Posed, type ShelfShape, type StoredDisplay } from '../../core/library/library-types';
import {
  SHELF_FULL_MESSAGE, SHELF_TOO_HIGH_MESSAGE, boardClearCm, boardHeightCm, compactShelves, displayOf, isLit, removeFurniture, setDisplayOf, setPose, setShapeOf, toggleLamp,
  unplaceCard, type PxRect, type Stored,
} from '../../core/library/room-grid';
import { Btn, DisplayButtons, Icon, ICONS } from '../library-ui';
import { TOP_FULL_MESSAGE } from './use-board-drag';

export type ItemChange = { display: StoredDisplay } | { shape: ShelfShape } | { pose: Pose } | { remove: true } | { lamp: true };
export type BubbleCard = Stored | Posed;
export type SmallItem = Extract<Placed, { kind: 'small' }>;
export type BubbleItem = BubbleCard | SmallItem;
export const isBubbleItem = (p: Placed | undefined): p is BubbleItem => p?.kind === 'stored' || p?.kind === 'posed' || p?.kind === 'small';

// Le changement appliqué à `layout` ; null s'il ne tient plus (rien ne bouge). Retirer : une carte (unplaceCard) ou un petit objet (sa
// tablette se recompacte).
export function applyItemChange(layout: Layout, id: string, change: ItemChange): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!isBubbleItem(item)) return null;
  if ('remove' in change) return item.kind === 'small' ? compactShelves(removeFurniture(layout, id)) : unplaceCard(layout, id);
  if ('lamp' in change) return item.kind === 'small' && item.item === 'lamp' ? toggleLamp(layout, id) : null;
  if ('display' in change) return setDisplayOf(layout, id, change.display);
  if ('shape' in change) return setShapeOf(layout, id, change.shape);
  return setPose(layout, id, change.pose);
}

// Message d'un changement refusé : sur un plateau, la place ; sur une tablette, trop haut (le nouveau format dépasse la hauteur libre et
// grandit) ou la place qui manque.
export function refusalOf(item: BubbleItem, change: ItemChange): string {
  if (item.kind === 'posed' || (item.kind === 'small' && 'x' in item)) return TOP_FULL_MESSAGE;
  if (item.kind === 'stored' && 'shape' in change) {
    const h = boardHeightCm({ shape: change.shape });
    if (h > boardClearCm(item.level) + 1e-9 && h > boardHeightCm(item) + 1e-9) return SHELF_TOO_HIGH_MESSAGE;
  }
  return SHELF_FULL_MESSAGE;
}

const FORMATS: { shape: ShelfShape; label: string; glyph: string }[] = [
  { shape: 'cd', label: 'CD', glyph: '💿' },
  { shape: 'dvd', label: 'DVD', glyph: '📀' },
  { shape: 'game', label: 'Jeu vidéo', glyph: '🎮' },
  { shape: 'book', label: 'Livre', glyph: '📖' },
];

const GAP = 8;
// Le bandeau du haut (✋, ✓) reste dégagé.
export const TOP_BAND = 60;
export type BubbleSize = { w: number; h: number };
// Taille supposée avant la première mesure (jsdom ne mesure rien) : deux rangées de boutons de la bulle de la pièce.
export const BUBBLE_GUESS: BubbleSize = { w: 300, h: 84 };

// Largeur sous laquelle une bulle à côté de l'objet n'a plus de sens (trois boutons) : dernier recours, `over`.
export const MIN_SIDE_PX = 120;
// Largeur maximale de la bulle (celle de la pièce).
const MAX_W = 360;
export type BubbleSpot = { left: number; top: number; side: 'below' | 'above' | 'right' | 'left' | 'over'; maxWidth: number };

// Coin haut-gauche et largeur maximale de la bulle (px du calque), sans jamais recouvrir `anchor` (le rectangle de l'objet, ou sa colonne
// sur toute la hauteur de la tablette) : dessous, sinon dessus ; sinon à côté (droite, puis gauche) à sa largeur ; sinon du côté le plus
// large, rétrécie à la place qui reste (elle passe sur plus de rangées : sa hauteur estimée croît d'autant) ; seulement si ce côté a moins
// de MIN_SIDE_PX, en bas du calque par-dessus (`over`). `size` : la taille mesurée (ou supposée) ; `right` : bande réservée au bord droit
// (▲ ▼ des tablettes), jamais recouverte. La largeur maximale rendue garde la bulle repliée d'une mesure à l'autre (pas d'oscillation).
export function bubbleSpot(anchor: PxRect, size: BubbleSize, layer: { w: number; h: number }, right = 0): BubbleSpot {
  const maxX = layer.w - right - GAP;
  const full = Math.max(0, Math.min(MAX_W, maxX - GAP));
  const w = Math.min(size.w, full);
  const clampX = (x: number, bw: number) => Math.min(Math.max(GAP, x), Math.max(GAP, maxX - bw));
  const clampY = (y: number, bh: number) => Math.min(Math.max(TOP_BAND, y), Math.max(TOP_BAND, layer.h - GAP - bh));
  const cx = clampX(anchor.x + anchor.w / 2 - w / 2, w);
  const below = anchor.y + anchor.h + GAP;
  if (below + size.h <= layer.h - GAP) return { left: cx, top: below, side: 'below', maxWidth: full };
  const above = anchor.y - GAP - size.h;
  if (above >= TOP_BAND) return { left: cx, top: above, side: 'above', maxWidth: full };
  // Place libre de chaque côté de l'objet (px), bande réservée exclue.
  const roomRight = Math.min(MAX_W, maxX - (anchor.x + anchor.w + GAP));
  const roomLeft = Math.min(MAX_W, anchor.x - 2 * GAP);
  const side = (where: 'right' | 'left', room: number): BubbleSpot => {
    const bw = Math.min(w, room);
    // Rétrécie : autant de rangées de plus que la largeur l'impose.
    const bh = bw < w ? size.h * Math.ceil(w / bw) : size.h;
    const left = where === 'right' ? anchor.x + anchor.w + GAP : anchor.x - GAP - bw;
    return { left, top: clampY(anchor.y + anchor.h / 2 - bh / 2, bh), side: where, maxWidth: room };
  };
  if (roomRight >= w) return side('right', roomRight);
  if (roomLeft >= w) return side('left', roomLeft);
  const wider = roomRight >= roomLeft ? 'right' : 'left';
  const room = Math.max(roomRight, roomLeft);
  if (room >= MIN_SIDE_PX) return side(wider, room);
  return { left: cx, top: clampY(layer.h, size.h), side: 'over', maxWidth: full };
}

type Props = {
  item: BubbleItem;
  anchor: PxRect;
  layer: { w: number; h: number };
  // Bande réservée au bord droit du calque (▲ ▼).
  reserveRight?: number;
  message: string | null;
  // Les changements (présentation, format, 🗑, lampe) ne sont proposés qu'avec une intention branchée.
  canEdit: boolean;
  onMove(): void;
  onChange(change: ItemChange): void;
  onInfo?(): void;
  onCity?(): void;
  onClose(): void;
};

export function CardBubble({ item, anchor, layer, reserveRight = 0, message, canEdit, onMove, onChange, onInfo, onCity, onClose }: Props): ReactElement {
  // Taille mesurée (offsetWidth/Height : hors rotation du calque) ; la bulle se recale quand elle change (message, autre objet).
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<BubbleSize>(BUBBLE_GUESS);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.offsetWidth || !el.offsetHeight) return;
    if (el.offsetWidth !== size.w || el.offsetHeight !== size.h) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  const spot = bubbleSpot(anchor, size, layer, reserveRight);
  // Un doigt posé dans la bulle ne la ferme pas (le calque ferme la bulle à tout toucher ailleurs) et ne saisit rien dessous.
  const keep = (e: ReactPointerEvent) => e.stopPropagation();
  const card = item.kind === 'small' ? null : item;
  const pose = item.kind === 'posed' ? poseOf(item) : null;
  return (
    <div ref={ref} className="wmt-lib-bubble" data-arrange-bubble={item.id} {...(card ? { 'data-card-bubble': item.id } : {})} data-side={spot.side} role="toolbar" aria-label="Actions sur l’objet"
      onPointerDown={keep} style={{ left: spot.left, top: spot.top, zIndex: 3, maxWidth: spot.maxWidth, boxSizing: 'border-box' }}>
      <Btn label="Déplacer" data={{ action: 'move' }} onClick={onMove}><Icon paths={ICONS.move} /></Btn>
      {canEdit && <Btn label="Retirer" data={{ action: 'remove' }} onClick={() => onChange({ remove: true })}><Icon paths={ICONS.trash} /></Btn>}
      {card && onInfo && <Btn label="Fiche de la carte" data={{ action: 'card-info' }} onClick={onInfo}>ⓘ</Btn>}
      {canEdit && item.kind === 'stored' && <DisplayButtons current={displayOf(item)} game={item.shape === 'game'} onChoose={(display) => onChange({ display })} />}
      {canEdit && pose && (
        <>
          <Btn label="Sur un trépied" pressed={pose === 'stand'} data={{ action: 'pose-stand' }} onClick={() => onChange({ pose: 'stand' })}><Icon paths={ICONS.poseStand} /></Btn>
          <Btn label="À plat" pressed={pose === 'flat'} data={{ action: 'pose-flat' }} onClick={() => onChange({ pose: 'flat' })}><Icon paths={ICONS.poseFlat} /></Btn>
        </>
      )}
      {canEdit && card && FORMATS.map((f) => (
        <Btn key={f.shape} label={f.label} pressed={card.shape === f.shape} data={{ action: `card-shape-${f.shape}` }} onClick={() => onChange({ shape: f.shape })}>{f.glyph}</Btn>
      ))}
      {canEdit && item.kind === 'small' && item.item === 'lamp' && (
        <Btn label={isLit(item) ? 'Éteindre la lampe' : 'Allumer la lampe'} pressed={isLit(item)} data={{ action: 'lamp' }} onClick={() => onChange({ lamp: true })}><Icon paths={ICONS.bulb} /></Btn>
      )}
      {onCity && hasCitySetting(item) && <Btn label="Choisir la ville" data={{ action: 'deco-city' }} onClick={onCity}><Icon paths={ICONS.globe} /></Btn>}
      <Btn label="Fermer la bulle" data={{ action: 'bubble-close' }} onClick={onClose}>✕</Btn>
      {message && (
        <div data-card-bubble-message="" role="status" style={{ flexBasis: '100%', padding: '4px 6px', borderRadius: 8, background: 'rgba(210,59,47,.12)', color: '#a3271e', font: '600 13px system-ui, sans-serif' }}>{message}</div>
      )}
    </div>
  );
}
