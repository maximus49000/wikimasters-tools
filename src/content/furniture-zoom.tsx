// Dessin provisoire Opus — reprise Fable prévue.
import { useEffect, useState, type ReactElement } from 'react';
import { sizeOf } from '../core/library/furniture-catalog';
import type { Placed, Room } from '../core/library/library-types';
import { CELL_H, CELL_W, SURFACE_SLOTS, angleOf, computerRect, shelfSlots, surfaceSlotRect, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { zoomRectOf, type Box, type ZoomTarget } from '../core/library/zoom-target';
import { AngledFurnitureArt } from './furniture-angled';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';
import { SmallArt } from './furniture-art-home';
import { AnalyticalEngineArt, SteampunkArt } from './furniture-art-steampunk';
import { ShelfItemArt } from './library-card-art';
import { Icon, ICONS } from './library-ui';
import { reducedMotion } from './ghibli-sky';

export type ZoomPhase = 'opening' | 'open' | 'closing';
type Props = {
  target: ZoomTarget;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  phase: ZoomPhase;
  // Rectangle du meuble dans la scène au moment du toucher (départ du pivot) ; null : apparition au centre.
  from: Box | null;
  stage: { w: number; h: number };
  onCard: (slug: string) => void;
  onBack: () => void;
};

// Durées : 500 ms (moitié pour se refermer de profil, moitié pour s'ouvrir de face) ; 150 ms en mouvement réduit.
export const ZOOM_MS = 500;
export const ZOOM_REDUCED_MS = 150;

export function FurnitureZoom({ target, room, cards, imageOf, phase, from, stage, onCard, onBack }: Props): ReactElement | null {
  const item = room.layout.find((p) => p.id === target.id);
  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  const angle = item ? angleOf(item) : 0;
  // Première moitié de l'ouverture (et seconde de la fermeture) : le meuble sous son angle ; ensuite de face.
  const reduced = reducedMotion();
  const [face, setFace] = useState<'angled' | 'front'>(reduced || phase === 'open' || angle === 0 ? 'front' : phase === 'opening' ? 'angled' : 'front');
  // Le meuble n'a pas encore bougé à la première image : on le pose au départ puis on le laisse rejoindre le cadre final.
  const [arrived, setArrived] = useState(phase === 'open');
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (reduced || angle === 0 || phase === 'open') {
      setFace('front');
      return;
    }
    const half = ZOOM_MS / 2;
    const t = window.setTimeout(() => setFace(phase === 'opening' ? 'front' : 'angled'), half);
    return () => window.clearTimeout(t);
  }, [phase, angle, reduced, target.id]);
  if (!item || (item.kind !== 'shelf' && item.kind !== 'desk')) return null;

  const { w, h } = sizeOf(item.kind);
  const art: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  // Bureau : on montre aussi l'écran au-dessus du dessus, donc un cadre plus haut.
  const pad = item.kind === 'desk' ? computerRect(art).h + 8 : 0;
  const view = { x: 0, y: -pad, w: art.w, h: art.h + pad };
  const end = zoomRectOf(stage, view.w / view.h);
  const start = from ?? end;
  const ms = reduced ? ZOOM_REDUCED_MS : ZOOM_MS;
  // De face : le meuble grandit (ou rétrécit) d'un trait ; de profil : il se referme puis s'ouvre, chaque moitié sur ms/2.
  const at = reduced ? end
    : angle === 0 ? (phase === 'closing' || !arrived ? start : end)
    : phase === 'open' || (phase === 'opening' && face === 'front') ? end : start;
  const move = angle === 0 ? ms : ms / 2;
  const hidden = reduced && (phase === 'closing' || (phase === 'opening' && !arrived));

  const carried = room.layout.filter((p) => (p.kind === 'stored' && p.shelfId === item.id) || (p.kind === 'computer' && p.deskId === item.id) || (p.kind === 'small' && p.hostId === item.id));
  const cardTap = (slug: string) => () => { if (cards[slug]) onCard(slug); };

  const frontArt = (
    <g>
      {item.kind === 'shelf' ? <ShelfArt rect={art} palette={palette} showSlots occupied={new Set(carried.flatMap((p) => (p.kind === 'stored' ? [p.slot] : [])))} />
        : steampunk ? <SteampunkArt kind="desk" rect={art} palette={palette} /> : <DeskArt rect={art} palette={palette} />}
      {carried.map((p: Placed) => {
        if (p.kind === 'small' && (item.kind === 'desk' || item.kind === 'shelf')) {
          return <SmallArt key={p.id} item={p.item} rect={surfaceSlotRect(art, SURFACE_SLOTS[item.kind], p.slot)} palette={palette} lit={p.lit !== false} />;
        }
        if (p.kind === 'stored') {
          const slot = shelfSlots(art)[p.slot];
          if (!slot) return null;
          const info = cards[p.slug];
          return (
            <g key={p.id} data-zoom-card={p.slug} onClick={cardTap(p.slug)} style={{ cursor: info ? 'pointer' : 'default' }}>
              <ShelfItemArt rect={slot} shape={p.shape} slug={p.slug} title={info?.title ?? ''} imageUrl={imageOf(p.slug)} missing={!info} />
              <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill="transparent" />
            </g>
          );
        }
        if (p.kind === 'computer') {
          const screen = computerRect(art);
          const url = p.slug && cards[p.slug] ? imageOf(p.slug) : undefined;
          return (
            <g key={p.id} {...(p.slug ? { 'data-zoom-card': p.slug, onClick: cardTap(p.slug) } : {})} style={{ cursor: p.slug && cards[p.slug] ? 'pointer' : 'default' }}>
              {steampunk ? <AnalyticalEngineArt rect={screen} imageUrl={url} /> : <ComputerArt rect={screen} imageUrl={url} />}
            </g>
          );
        }
        return null;
      })}
    </g>
  );

  return (
    <div className="wmt-lib-zoom" data-furniture-zoom="" data-zoom-phase={phase} data-zoom-face={face} style={reduced ? { opacity: hidden ? 0 : 1, transition: `opacity ${ms}ms ease-out` } : undefined} role="dialog" aria-label={item.kind === 'shelf' ? 'Étagère vue de face' : 'Bureau vu de face'}>
      <div className="wmt-lib-zoom-backdrop" data-zoom-backdrop="" onClick={onBack} style={{ opacity: phase === 'closing' ? 0 : 1, transition: `opacity ${ms}ms ease-out` }} />
      <div
        className="wmt-lib-zoom-piece"
        style={{
          left: at.x, top: at.y, width: at.w, height: at.h,
          transition: `left ${move}ms ease-out, top ${move}ms ease-out, width ${move}ms ease-out, height ${move}ms ease-out`,
          animation: angle !== 0 && phase !== 'open' && !reduced ? `wmt-zoom-pivot ${ms}ms ease-in-out` : undefined,
        }}
      >
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          {face === 'front' ? frontArt : <AngledFurnitureArt kind={item.kind} angle={angle} rect={art} palette={palette} />}
        </svg>
      </div>
      <button type="button" className="wmt-lib-fab" data-action="zoom-back" aria-label="Retour à la pièce" title="Retour à la pièce" onClick={onBack} style={{ left: 8, top: 8 }}>
        <Icon paths={ICONS.back} />
      </button>
    </div>
  );
}
