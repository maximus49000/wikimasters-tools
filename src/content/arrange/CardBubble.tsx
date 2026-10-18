// Bulle d'une carte dans la vue Modifier (toucher une carte sans la glisser) : présentation (tablette : face / tranche / dos pour un jeu ;
// plateau : trépied / à plat), format de l'objet (CD, DVD, jeu, livre : le slug ne change pas), ⓘ fiche, 🗑 retirer, ✕ fermer.
// Petite, ancrée sous la carte (au-dessus s'il n'y a pas la place), dans le calque de la vue (tourné avec lui en hauteur).
// Un changement est vérifié sur la disposition reçue : refusé, le message habituel s'affiche dans la bulle et rien ne part ; accepté, il
// part tout de suite comme une intention (id + changement), appliquée par l'appelant à la disposition du moment (applyCardChange).
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { poseOf, type Layout, type Pose, type Posed, type ShelfShape, type StoredDisplay } from '../../core/library/library-types';
import {
  SHELF_FULL_MESSAGE, SHELF_TOO_HIGH_MESSAGE, boardClearCm, boardHeightCm, displayOf, setDisplayOf, setPose, setShapeOf, unplaceCard, type PxRect, type Stored,
} from '../../core/library/room-grid';
import { Btn, DisplayButtons, Icon, ICONS } from '../library-ui';
import { TOP_FULL_MESSAGE } from './use-board-drag';

export type CardChange = { display: StoredDisplay } | { shape: ShelfShape } | { pose: Pose } | { remove: true };
export type BubbleCard = Stored | Posed;

// Le changement appliqué à `layout` ; null s'il ne tient plus (rien ne bouge).
export function applyCardChange(layout: Layout, id: string, change: CardChange): Layout | null {
  if ('remove' in change) return unplaceCard(layout, id);
  if ('display' in change) return setDisplayOf(layout, id, change.display);
  if ('shape' in change) return setShapeOf(layout, id, change.shape);
  return setPose(layout, id, change.pose);
}

// Message d'un changement refusé : sur un plateau, la place ; sur une tablette, trop haut (le nouveau format dépasse la hauteur libre et
// grandit) ou la place qui manque.
export function refusalOf(card: BubbleCard, change: CardChange): string {
  if (card.kind === 'posed') return TOP_FULL_MESSAGE;
  if ('shape' in change) {
    const h = boardHeightCm({ shape: change.shape });
    if (h > boardClearCm(card.level) + 1e-9 && h > boardHeightCm(card) + 1e-9) return SHELF_TOO_HIGH_MESSAGE;
  }
  return SHELF_FULL_MESSAGE;
}

const FORMATS: { shape: ShelfShape; label: string; glyph: string }[] = [
  { shape: 'cd', label: 'CD', glyph: '💿' },
  { shape: 'dvd', label: 'DVD', glyph: '📀' },
  { shape: 'game', label: 'Jeu vidéo', glyph: '🎮' },
  { shape: 'book', label: 'Livre', glyph: '📖' },
];

// Taille réservée pour placer la bulle (deux rangées de boutons de 40 px et la ligne du message) ; marge au bord du calque.
export const BUBBLE_W = 292;
export const BUBBLE_H = 128;
const MARGIN = 8;
// Le bandeau du haut (✋, ✓) reste dégagé.
const TOP_BAND = 60;

// Coin haut-gauche de la bulle (px du calque) : centrée sous la carte, au-dessus si elle sortirait par le bas, toujours dans le calque.
export function bubbleSpot(anchor: PxRect, layer: { w: number; h: number }): { left: number; top: number } {
  const left = Math.min(Math.max(MARGIN, anchor.x + anchor.w / 2 - BUBBLE_W / 2), Math.max(MARGIN, layer.w - BUBBLE_W - MARGIN));
  const below = anchor.y + anchor.h + MARGIN;
  const above = anchor.y - BUBBLE_H - MARGIN;
  const top = below + BUBBLE_H <= layer.h - MARGIN ? below : above >= TOP_BAND ? above : Math.max(TOP_BAND, layer.h - BUBBLE_H - MARGIN);
  return { left, top };
}

const BOX: CSSProperties = {
  position: 'absolute', width: BUBBLE_W, boxSizing: 'border-box', padding: 6, borderRadius: 14, zIndex: 3, pointerEvents: 'auto',
  background: 'rgba(251,246,234,.97)', color: '#2B1D16', boxShadow: '0 6px 18px rgba(0,0,0,.35)', font: '600 14px system-ui, sans-serif',
  display: 'flex', flexDirection: 'column', gap: 4,
};
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' };
// Boutons ronds de 40 px (la classe wmt-lib-btn du panneau, rendue ici compacte et lisible sur le fond clair).
const CSS = `.wmt-card-bubble .wmt-lib-btn{min-width:40px;width:40px;height:40px;min-height:40px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(43,29,22,.25);background:transparent;color:#2B1D16;font:20px/1 system-ui,sans-serif;cursor:pointer}
.wmt-card-bubble .wmt-lib-btn[aria-pressed="true"]{border:2px solid #3E9B5A;background:rgba(62,155,90,.16);color:#2B1D16}`;

type Props = {
  card: BubbleCard;
  anchor: PxRect;
  layer: { w: number; h: number };
  message: string | null;
  onChange(change: CardChange): void;
  onInfo(): void;
  onClose(): void;
};

export function CardBubble({ card, anchor, layer, message, onChange, onInfo, onClose }: Props): ReactElement {
  const spot = bubbleSpot(anchor, layer);
  // Un doigt posé dans la bulle ne la ferme pas (le calque ferme la bulle à tout toucher ailleurs) et ne saisit rien dessous.
  const keep = (e: ReactPointerEvent) => e.stopPropagation();
  const pose = card.kind === 'posed' ? poseOf(card) : null;
  return (
    <div data-card-bubble={card.id} role="group" aria-label="Carte" className="wmt-card-bubble" onPointerDown={keep} style={{ ...BOX, left: spot.left, top: spot.top }}>
      <style>{CSS}</style>
      <div style={ROW}>
        {card.kind === 'stored'
          ? <DisplayButtons current={displayOf(card)} game={card.shape === 'game'} onChoose={(display) => onChange({ display })} />
          : (
            <>
              <Btn label="Sur un trépied" pressed={pose === 'stand'} data={{ action: 'pose-stand' }} onClick={() => onChange({ pose: 'stand' })}><Icon paths={ICONS.poseStand} /></Btn>
              <Btn label="À plat" pressed={pose === 'flat'} data={{ action: 'pose-flat' }} onClick={() => onChange({ pose: 'flat' })}><Icon paths={ICONS.poseFlat} /></Btn>
            </>
          )}
        <span style={{ flex: 1 }} />
        <Btn label="Fiche de la carte" data={{ action: 'card-info' }} onClick={onInfo}>ⓘ</Btn>
        <Btn label="Retirer la carte" data={{ action: 'card-remove' }} onClick={() => onChange({ remove: true })}>🗑</Btn>
        <Btn label="Fermer la bulle" data={{ action: 'card-bubble-close' }} onClick={onClose}>✕</Btn>
      </div>
      <div style={ROW}>
        {FORMATS.map((f) => (
          <Btn key={f.shape} label={f.label} pressed={card.shape === f.shape} data={{ action: `card-shape-${f.shape}` }} onClick={() => onChange({ shape: f.shape })}>{f.glyph}</Btn>
        ))}
      </div>
      {message && (
        <div data-card-bubble-message="" role="status" style={{ padding: '4px 6px', borderRadius: 8, background: 'rgba(200,68,58,.14)', color: '#8A2A22', font: '600 13px system-ui, sans-serif' }}>{message}</div>
      )}
    </div>
  );
}
