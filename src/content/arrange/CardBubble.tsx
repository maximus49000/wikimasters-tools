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

// Coin haut-gauche de la bulle (px du calque) qui ne recouvre jamais `anchor` (le rectangle de l'objet, ou de toute la tablette) :
// dessous, sinon dessus, sinon à droite, sinon à gauche ; tout serré, en bas du calque (dernier recours, `over`). `right` : bande
// réservée au bord droit (▲ ▼ des tablettes), jamais recouverte.
export function bubbleSpot(anchor: PxRect, size: BubbleSize, layer: { w: number; h: number }, right = 0): { left: number; top: number; side: 'below' | 'above' | 'right' | 'left' | 'over' } {
  const maxX = layer.w - right - GAP;
  const clampX = (x: number) => Math.min(Math.max(GAP, x), Math.max(GAP, maxX - size.w));
  const clampY = (y: number) => Math.min(Math.max(TOP_BAND, y), Math.max(TOP_BAND, layer.h - GAP - size.h));
  const cx = clampX(anchor.x + anchor.w / 2 - size.w / 2);
  const below = anchor.y + anchor.h + GAP;
  if (below + size.h <= layer.h - GAP) return { left: cx, top: below, side: 'below' };
  const above = anchor.y - GAP - size.h;
  if (above >= TOP_BAND) return { left: cx, top: above, side: 'above' };
  const cy = clampY(anchor.y + anchor.h / 2 - size.h / 2);
  const toRight = anchor.x + anchor.w + GAP;
  if (toRight + size.w <= maxX) return { left: toRight, top: cy, side: 'right' };
  const toLeft = anchor.x - GAP - size.w;
  if (toLeft >= GAP) return { left: toLeft, top: cy, side: 'left' };
  return { left: cx, top: clampY(layer.h), side: 'over' };
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
      onPointerDown={keep} style={{ left: spot.left, top: spot.top, zIndex: 3, maxWidth: Math.min(360, layer.w - 2 * GAP) }}>
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
