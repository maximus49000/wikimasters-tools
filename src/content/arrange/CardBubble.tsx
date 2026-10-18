// Bulle d'un objet dans la vue Modifier (toucher un objet posé sans le glisser) : la même bulle que le mobilier de la pièce (wmt-lib-bubble,
// mêmes boutons et glyphes). ✥ Déplacer arme l'objet (seul un objet armé se glisse). Carte : présentation (tablette : face / tranche /
// dos pour un jeu ; plateau : trépied / à plat), format (CD, DVD, jeu, livre : le slug ne change pas), 🖼️ version de la pochette (réglette de
// vignettes, ↺ pochette d'origine ; grisé quand la recherche n'a rien trouvé), 🔄 changer de carte (réglette 🃏 de la Collection, la nouvelle
// carte prend la même place), ⓘ fiche, 🗑 retirer. Petit objet :
// 🗑, allumer / éteindre une lampe, choisir la ville d'une horloge. ✕ ferme.
// Ancrée à côté de l'objet sans jamais le cacher (bubbleSpot), dans le calque de la vue (tourné avec lui en hauteur).
// Un changement est vérifié sur la disposition que l'on voit : refusé, le message habituel s'affiche dans la bulle et rien ne part ;
// accepté, il part tout de suite comme une intention (id + changement), appliquée par l'appelant à la disposition du moment (applyItemChange).
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { KnownCard } from '../../core/collection/collection-book';
import type { Category } from '../../core/kinds/kinds-category';
import { suggestShape } from '../../core/library/shape-suggest';
import { hasCitySetting } from '../../core/library/deco';
import { poseOf, type Layout, type Placed, type Pose, type Posed, type ShelfShape, type StoredDisplay } from '../../core/library/library-types';
import {
  SHELF_FULL_MESSAGE, SHELF_TOO_HIGH_MESSAGE, boardClearCm, boardHeightCm, compactShelves, displayOf, isLit, placedSlugs, removeFurniture, replaceCard, setCoverOf, setDisplayOf,
  setPose, setShapeOf, toggleLamp, unplaceCard, type PxRect, type Stored,
} from '../../core/library/room-grid';
import { Btn, DisplayButtons, Icon, ICONS } from '../library-ui';
import { CardStrip } from './CardStrip';
import { TOP_FULL_MESSAGE } from './use-board-drag';

// `cover` : pochette choisie pour cet objet (null : celle de la carte) ; `swap` : une autre carte à la même place, au format `shape`.
export type ItemChange = { display: StoredDisplay } | { shape: ShelfShape } | { pose: Pose } | { remove: true } | { lamp: true } | { cover: string | null }
  | { swap: string; shape?: ShelfShape };
// Versions de la pochette d'une carte (cover-versions) : en cours de recherche, puis les adresses trouvées (vide : bouton grisé).
export type CoverChoices = { loading: boolean; urls: string[] };
// Cartes de la Collection pour 🔄 Changer de carte, et leur catégorie (format conseillé, comme la réglette ＋).
export type SwapProps = { cards: KnownCard[]; categoryOf(slug: string): Category };
export const ALREADY_IN_ROOM_MESSAGE = 'Cette carte est déjà dans la pièce.';
export const COVER_REFUSED_MESSAGE = 'Cette pochette ne peut pas être choisie.';
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
  if ('cover' in change) return item.kind === 'small' ? null : setCoverOf(layout, id, change.cover);
  if ('swap' in change) return item.kind === 'small' ? null : replaceCard(layout, id, change.swap, change.shape);
  if ('display' in change) return setDisplayOf(layout, id, change.display);
  if ('shape' in change) return setShapeOf(layout, id, change.shape);
  return setPose(layout, id, change.pose);
}

// Message d'un changement refusé : sur un plateau, la place ; sur une tablette, trop haut (le nouveau format dépasse la hauteur libre et
// grandit) ou la place qui manque. Changer de carte : d'abord la carte déjà dans la pièce (`layout` : la disposition vue).
export function refusalOf(item: BubbleItem, change: ItemChange, layout?: Layout): string {
  if ('cover' in change) return COVER_REFUSED_MESSAGE;
  if ('swap' in change && layout && placedSlugs(layout).has(change.swap)) return ALREADY_IN_ROOM_MESSAGE;
  if (item.kind === 'posed' || (item.kind === 'small' && 'x' in item)) return TOP_FULL_MESSAGE;
  if (item.kind === 'stored' && 'shape' in change) {
    const h = boardHeightCm({ shape: change.shape ?? item.shape });
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
  // Versions de la pochette (carte, avec une intention branchée) ; absent : pas de 🖼️.
  covers?: CoverChoices | null;
  // Collection pour 🔄 (absente : pas de 🔄) et cartes déjà dans la pièce (absentes de la réglette).
  swap?: SwapProps;
  taken?: Set<string>;
  onMove(): void;
  onChange(change: ItemChange): void;
  onInfo?(): void;
  onCity?(): void;
  onClose(): void;
};

const NOTHING_TAKEN: Set<string> = new Set();
const ROW = { flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', overflowY: 'hidden', touchAction: 'pan-x', padding: '2px 0' } as const;

export function CardBubble({ item, anchor, layer, reserveRight = 0, message, canEdit, covers, swap, taken = NOTHING_TAKEN, onMove, onChange, onInfo, onCity, onClose }: Props): ReactElement {
  // Réglette ouverte sous les boutons (versions de la pochette ou cartes de 🔄), pour cet objet seulement.
  const [panel, setPanel] = useState<{ id: string; kind: 'covers' | 'swap' } | null>(null);
  const open = panel && panel.id === item.id ? panel.kind : null;
  const toggle = (kind: 'covers' | 'swap') => setPanel(open === kind ? null : { id: item.id, kind });
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
      {canEdit && card && covers && (
        <Btn label="Choisir la pochette" pressed={open === 'covers'} disabled={!covers.loading && covers.urls.length === 0} data={{ action: 'cover-choose' }} onClick={() => toggle('covers')}>🖼️</Btn>
      )}
      {canEdit && card && swap && <Btn label="Changer de carte" pressed={open === 'swap'} data={{ action: 'card-swap' }} onClick={() => toggle('swap')}>🔄</Btn>}
      {canEdit && item.kind === 'small' && item.item === 'lamp' && (
        <Btn label={isLit(item) ? 'Éteindre la lampe' : 'Allumer la lampe'} pressed={isLit(item)} data={{ action: 'lamp' }} onClick={() => onChange({ lamp: true })}><Icon paths={ICONS.bulb} /></Btn>
      )}
      {onCity && hasCitySetting(item) && <Btn label="Choisir la ville" data={{ action: 'deco-city' }} onClick={onCity}><Icon paths={ICONS.globe} /></Btn>}
      <Btn label="Fermer la bulle" data={{ action: 'bubble-close' }} onClick={onClose}>✕</Btn>
      {canEdit && card && covers && open === 'covers' && (
        <div data-cover-strip="" role="group" aria-label="Versions de la pochette" style={ROW}>
          <Btn label="Pochette d’origine" pressed={!card.cover} data={{ action: 'cover-origin' }} onClick={() => onChange({ cover: null })}>↺</Btn>
          {covers.loading && <span data-cover-loading="" role="status" aria-label="Recherche des pochettes…" title="Recherche des pochettes…" style={{ flex: 'none', font: '600 18px system-ui' }}>⏳</span>}
          {covers.urls.map((url, i) => (
            <button key={url} type="button" className="wmt-lib-btn" data-cover-choice={url} aria-label={`Pochette ${i + 1}`} title={`Pochette ${i + 1}`} aria-pressed={card.cover === url}
              onClick={() => onChange({ cover: url })} style={{ flex: 'none', padding: 1, width: 40, height: 40, outline: card.cover === url ? '3px solid #F5C542' : 'none', outlineOffset: 1 }}>
              <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" width={36} height={36} style={{ display: 'block', objectFit: 'cover', borderRadius: 4 }} />
            </button>
          ))}
        </div>
      )}
      {canEdit && card && swap && open === 'swap' && (
        <CardStrip inline cards={swap.cards} taken={taken} pending={null} label="Cartes pour remplacer celle-ci"
          onPick={(slug) => { setPanel(null); onChange({ swap: slug, shape: suggestShape(swap.categoryOf(slug)).shelf }); }} />
      )}
      {message && (
        <div data-card-bubble-message="" role="status" style={{ flexBasis: '100%', padding: '4px 6px', borderRadius: 8, background: 'rgba(210,59,47,.12)', color: '#a3271e', font: '600 13px system-ui, sans-serif' }}>{message}</div>
      )}
    </div>
  );
}
