// Dessin provisoire Opus — reprise Fable prévue.
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { drawSize, faceFrame, type Angle } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import { openingOf } from '../core/library/furniture-render3d';
import type { Placed, Room } from '../core/library/library-types';
import { carriedPlacementOf, placementDepth, placementRectPx, screenQuad, storedDrawOrder, storedFrontQuad, storedPlacementsOf } from '../core/library/carried-items';
import type { ItemPlacement } from '../core/library/item-models';
import { CELL_H, CELL_W, angleOf, isLit, shelfFreeIn, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { zoomRectOf, type Box, type ZoomTarget } from '../core/library/zoom-target';
import { CarriedItem3D, Model3DArt, type ItemContent } from './model3d-art';
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
  // Objets portés posés en 3D dans le repère du meuble (cartes rangées, écran, petits objets) et leur contenu, comme dans la pièce :
  // le meuble d'abord, puis ses objets rangés (découpés à l'ouverture de l'étagère), puis ceux du dessus du plus loin au plus proche.
  const garnish = useMemo(() => {
    const out: { p: Placed; pl: ItemPlacement; content: ItemContent }[] = [];
    if (!item) return out;
    const shelved = item.kind === 'shelf' ? storedPlacementsOf(room.layout, item.id) : new Map<string, ItemPlacement>();
    for (const p of room.layout) {
      const pl = p.kind === 'stored' ? (p.shelfId === item.id ? shelved.get(p.id) : undefined) : (() => { const at = carriedPlacementOf(room.layout, p); return at?.hostId === item.id ? at.placement : undefined; })();
      if (!pl) continue;
      const slug = p.kind === 'stored' || p.kind === 'computer' ? p.slug : undefined;
      const info = slug ? cards[slug] : undefined;
      out.push({ p, pl, content: p.kind === 'small' ? { lit: isLit(p) } : info && slug ? { url: imageOf(slug), title: info.title } : {} });
    }
    return out;
  }, [room.layout, item, cards, imageOf]);
  const clipId = `wm-zoom-open-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!item || (item.kind !== 'shelf' && item.kind !== 'desk')) return null;

  const host = item.kind;
  const { w, h } = drawSize(host, 0);
  const art: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  // Écran et petits objets dépassent du dessus du meuble : le cadre monte jusqu'au plus haut d'entre eux.
  const tops = garnish.filter(({ p }) => p.kind !== 'stored').map(({ pl }) => placementRectPx(host, 0, art, pl, steampunk).y);
  const pad = tops.length > 0 ? Math.max(0, art.y - Math.min(...tops)) + 8 : 0;
  const view = { x: 0, y: -pad, w: art.w, h: art.h + pad };
  // L'espace libre de chaque tablette en pointillés, sur la face avant du modèle (mêmes positions en cm que dans la pièce).
  const frame = host === 'shelf' ? faceFrame('shelf', 0, art) : null;
  const free = frame ? shelfFreeIn(frame, room.layout, item.id) : [];
  // Première moitié du pivot : le meuble sous son angle, à sa taille dessinée (réduite s'il le faut pour tenir dans le cadre :
  // en ¾ le bureau est plus large que de face), posé au bas du cadre et centré.
  const turned = drawSize(host, angle);
  const fit = Math.min(1, view.w / (turned.w * CELL_W), view.h / (turned.h * CELL_H));
  const tw = turned.w * CELL_W * fit;
  const th = turned.h * CELL_H * fit;
  const turnedRect: PxRect = { x: (art.w - tw) / 2, y: art.h - th, w: tw, h: th };
  const end = zoomRectOf(stage, view.w / view.h);
  const start = from ?? end;
  const ms = reduced ? ZOOM_REDUCED_MS : ZOOM_MS;
  // De face : le meuble grandit (ou rétrécit) d'un trait ; de profil : il se referme puis s'ouvre, chaque moitié sur ms/2.
  const at = reduced ? end
    : angle === 0 ? (phase === 'closing' || !arrived ? start : end)
    : phase === 'open' || (phase === 'opening' && face === 'front') ? end : start;
  const move = angle === 0 ? ms : ms / 2;
  const hidden = reduced && (phase === 'closing' || (phase === 'opening' && !arrived));

  const cardTap = (slug: string) => () => { if (cards[slug]) onCard(slug); };
  // Zone touchable d'une carte : la face avant d'un objet rangé (là où on le voit), la vitre de l'écran ; rien pour un petit objet.
  const hitOf = (p: Placed, pl: ItemPlacement): PxRect | null => {
    const quad = p.kind === 'stored' ? storedFrontQuad(0, art, pl) : p.kind === 'computer' && p.slug ? screenQuad(0, art, pl, steampunk) : null;
    if (!quad || quad.length === 0) return null;
    const xs = quad.map((q) => q[0]);
    const ys = quad.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  // Le meuble sous l'angle `a` dans `rect`, garni de ses objets.
  const garnished = (a: Angle, rect: PxRect): ReactElement => {
    const opening = host === 'shelf' ? openingOf(FURNITURE_MODELS.shelf, a) : null;
    const { w: cw, h: ch } = drawSize(host, a);
    const draw = ({ p, pl, content }: (typeof garnish)[number]) => <CarriedItem3D key={p.id} host={host} angle={a} rect={rect} placement={pl} palette={palette} steampunk={steampunk} content={content} />;
    const shelved = storedDrawOrder(garnish.filter((g): g is (typeof garnish)[number] & { p: Extract<Placed, { kind: 'stored' }> } => g.p.kind === 'stored').map((g) => ({ ...g, level: g.p.level, order: g.p.order })), a);
    const depth = new Map(garnish.map((g) => [g.p.id, placementDepth(host, a, g.pl, steampunk)]));
    const onTop = garnish.filter((g) => g.p.kind !== 'stored').sort((x, y) => depth.get(y.p.id)! - depth.get(x.p.id)!);
    return (
      <g>
        <Model3DArt kind={host} angle={a} rect={rect} palette={palette} steampunk={steampunk} />
        {opening && shelved.length > 0 && (
          <>
            <clipPath id={`${clipId}-${a}`}><polygon points={opening.map(([x, y]) => `${rect.x + (x * rect.w) / (cw * CELL_W)},${rect.y + (y * rect.h) / (ch * CELL_H)}`).join(' ')} /></clipPath>
            <g clipPath={`url(#${clipId}-${a})`}>{shelved.map(draw)}</g>
          </>
        )}
        {onTop.map(draw)}
      </g>
    );
  };

  const frontArt = (
    <g>
      {garnished(0, art)}
      {frame && free.map(({ level, local }) => (
        <g key={`free-${level}`} transform={`matrix(${frame.m.join(' ')})`}>
          <rect data-shelf-free={level} x={local.x} y={local.y} width={local.w} height={local.h} rx={2} fill="none" stroke={palette.text} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {garnish.map(({ p, pl }) => {
        const slug = p.kind === 'stored' || p.kind === 'computer' ? p.slug : undefined;
        const hit = slug ? hitOf(p, pl) : null;
        if (!slug || !hit) return null;
        // Carte inconnue : touchable sans effet (curseur ordinaire).
        return (
          <g key={p.id} data-zoom-card={slug} onClick={cardTap(slug)} style={{ cursor: cards[slug] ? 'pointer' : 'default' }}>
            <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />
          </g>
        );
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
          {face === 'front' ? frontArt : garnished(angle, turnedRect)}
        </svg>
      </div>
      <button type="button" className="wmt-lib-fab" data-action="zoom-back" aria-label="Retour à la pièce" title="Retour à la pièce" onClick={onBack} style={{ left: 8, top: 8 }}>
        <Icon paths={ICONS.back} />
      </button>
    </div>
  );
}
