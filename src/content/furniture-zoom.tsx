// Dessin provisoire Opus — reprise Fable prévue.
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { drawSize, faceFrame, type Angle } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import { openingOf } from '../core/library/furniture-render3d';
import type { Placed, Room, ShelfLevel } from '../core/library/library-types';
import { boxOfQuad, cardQuad, carriedPlacementOf, placementDepth, placementRectPx, storedDrawOrder, storedPlacementsOf } from '../core/library/carried-items';
import type { ItemPlacement } from '../core/library/item-models';
import { CELL_H, CELL_W, angleOf, isLit, shelfBoardsIn, shelfFreeIn, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { zoomIdsOf, zoomRectOf, type Box, type ZoomTarget } from '../core/library/zoom-target';
import { CarriedItem3D, Model3DArt, type ItemContent } from './model3d-art';
import { Icon, ICONS } from './library-ui';
import { reducedMotion } from './ghibli-sky';
import { ShelfBoardZoom } from './shelf-board-zoom';
import { gameBoxContent } from './game-box-content';
import { isTableClock, tableFaceContent, useDecoScene, type DecoScene } from './deco-live';
import type { SceneView } from './RoomView';

export type ZoomPhase = 'opening' | 'open' | 'closing';
type Cards = Record<string, { title: string; imageUrl?: string }>;
type Props = {
  target: ZoomTarget;
  room: Room;
  cards: Cards;
  imageOf: (slug: string) => string | undefined;
  // Heure et météo de la scène, pour la face du réveil, de la pendulette et de la station ; absente : heure réelle.
  sceneView?: SceneView;
  phase: ZoomPhase;
  // Rectangle du meuble (ou des deux bibliothèques liées) dans la scène au moment du toucher (départ du pivot) ; null : apparition au centre.
  from: Box | null;
  stage: { w: number; h: number };
  // Tablette zoomée (second zoom) ; null : vue de face.
  level: ShelfLevel | null;
  onCard: (slug: string) => void;
  // Toucher une tablette ou une carte rangée (vue de face), ↑ ↓ ou glisser (second zoom) : afficher cette tablette.
  onLevel: (level: ShelfLevel) => void;
  onBack: () => void;
};
type Garnish = { p: Placed; pl: ItemPlacement; content: ItemContent };

// Durées : 500 ms (moitié pour se refermer de profil, moitié pour s'ouvrir de face) ; 150 ms en mouvement réduit.
export const ZOOM_MS = 500;
export const ZOOM_REDUCED_MS = 150;

// Objets portés posés en 3D dans le repère du meuble (cartes rangées, écran, petits objets) et leur contenu, comme dans la pièce.
// Réveil, pendulette, station : la même face que dans la pièce (vivante, à la seconde partagée).
function garnishOf(layout: Placed[], item: Placed, cards: Cards, imageOf: (slug: string) => string | undefined, style: Room['style'], scene: DecoScene | undefined): Garnish[] {
  const out: Garnish[] = [];
  const shelved = item.kind === 'shelf' ? storedPlacementsOf(layout, item.id) : new Map<string, ItemPlacement>();
  for (const p of layout) {
    const pl = p.kind === 'stored' ? (p.shelfId === item.id ? shelved.get(p.id) : undefined) : (() => { const at = carriedPlacementOf(layout, p); return at?.hostId === item.id ? at.placement : undefined; })();
    if (!pl) continue;
    const slug = p.kind === 'stored' || p.kind === 'computer' ? p.slug : undefined;
    const info = slug ? cards[slug] : undefined;
    const small = p.kind === 'small' ? (isTableClock(p.item) && scene ? tableFaceContent(p.item, p.city, style, scene) : { lit: isLit(p) }) : undefined;
    const url = info && slug ? imageOf(slug) : undefined;
    const box = p.kind === 'stored' ? gameBoxContent(p.shape, p.slug, url) : {};
    out.push({ p, pl, content: small ?? (info && slug ? { url, title: info.title, ...box } : {}) });
  }
  return out;
}

export function FurnitureZoom({ target, room, cards, imageOf, sceneView, phase, from, stage, level, onCard, onLevel, onBack }: Props): ReactElement | null {
  const ids = zoomIdsOf(target);
  const key = ids.join('+');
  const items = ids.map((id) => room.layout.find((p) => p.id === id)).filter((p): p is Placed => p !== undefined);
  const item = items[0];
  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  // Deux bibliothèques liées ont toujours le même angle.
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
  }, [phase, angle, reduced, key]);
  // Objets de chaque bibliothèque (ou du bureau) ; indexé sur `key` : les mêmes ids donnent les mêmes meubles dans `room.layout`.
  const hasFace = room.layout.some((p) => p.kind === 'small' && isTableClock(p.item));
  const decoScene = useDecoScene(sceneView, false, hasFace);
  const garnishes = useMemo(() => items.map((it) => garnishOf(room.layout, it, cards, imageOf, room.style, decoScene)), [room.layout, key, cards, imageOf, room.style, decoScene]); // eslint-disable-line react-hooks/exhaustive-deps
  const clipId = `wm-zoom-open-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!item || (item.kind !== 'shelf' && item.kind !== 'desk')) return null;

  const host = item.kind;
  const n = items.length;
  const { w, h } = drawSize(host, 0);
  const art: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  // Écran et petits objets dépassent du dessus du meuble : le cadre monte jusqu'au plus haut d'entre eux.
  const tops = garnishes.flat().filter(({ p }) => p.kind !== 'stored').map(({ pl }) => placementRectPx(host, 0, art, pl, steampunk).y);
  const pad = tops.length > 0 ? Math.max(0, art.y - Math.min(...tops)) + 8 : 0;
  // Bibliothèques liées : côte à côte, chacune dans sa largeur.
  const view = { x: 0, y: -pad, w: art.w * n, h: art.h + pad };
  // Face avant du modèle : l'espace libre de chaque tablette en pointillés et les tablettes touchables (mêmes positions en cm que dans la pièce).
  const frame = host === 'shelf' ? faceFrame('shelf', 0, art) : null;
  // Première moitié du pivot : chaque meuble sous son angle, à sa taille dessinée (réduite s'il le faut pour tenir dans sa largeur
  // et dans le cadre : en ¾ le bureau est plus large que de face), posé au bas du cadre et centré dans sa part.
  const turned = drawSize(host, angle);
  const fit = Math.min(1, art.w / (turned.w * CELL_W), view.h / (turned.h * CELL_H));
  const tw = turned.w * CELL_W * fit;
  const th = turned.h * CELL_H * fit;
  const turnedRectAt = (i: number): PxRect => ({ x: i * art.w + (art.w - tw) / 2, y: art.h - th, w: tw, h: th });
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
    const quad = cardQuad(p, 0, art, pl, steampunk);
    return quad && quad.length > 0 ? boxOfQuad(quad) : null;
  };

  // Le meuble sous l'angle `a` dans `rect`, garni de ses objets.
  const garnished = (a: Angle, rect: PxRect, garnish: Garnish[], tag: string): ReactElement => {
    const opening = host === 'shelf' ? openingOf(FURNITURE_MODELS.shelf, a) : null;
    const { w: cw, h: ch } = drawSize(host, a);
    const draw = ({ p, pl, content }: Garnish) => <CarriedItem3D key={p.id} host={host} angle={a} rect={rect} placement={pl} palette={palette} steampunk={steampunk} content={content} />;
    const shelved = storedDrawOrder(garnish.filter((g): g is Garnish & { p: Extract<Placed, { kind: 'stored' }> } => g.p.kind === 'stored').map((g) => ({ ...g, level: g.p.level, order: g.p.order })), a);
    const depth = new Map(garnish.map((g) => [g.p.id, placementDepth(host, a, g.pl, steampunk)]));
    const onTop = garnish.filter((g) => g.p.kind !== 'stored').sort((x, y) => depth.get(y.p.id)! - depth.get(x.p.id)!);
    return (
      <g>
        <Model3DArt kind={host} angle={a} rect={rect} palette={palette} steampunk={steampunk} />
        {opening && shelved.length > 0 && (
          <>
            <clipPath id={`${clipId}-${tag}-${a}`}><polygon points={opening.map(([x, y]) => `${rect.x + (x * rect.w) / (cw * CELL_W)},${rect.y + (y * rect.h) / (ch * CELL_H)}`).join(' ')} /></clipPath>
            <g clipPath={`url(#${clipId}-${tag}-${a})`}>{shelved.map(draw)}</g>
          </>
        )}
        {onTop.map(draw)}
      </g>
    );
  };

  const frontArt = (
    <g>
      {items.map((it, i) => {
        const garnish = garnishes[i] ?? [];
        const free = frame ? shelfFreeIn(frame, room.layout, it.id) : [];
        return (
          <g key={it.id} data-zoom-piece={it.id} transform={i > 0 ? `translate(${i * art.w} 0)` : undefined}>
            {garnished(0, art, garnish, it.id)}
            {frame && free.map(({ level: lv, local }) => (
              <g key={`free-${lv}`} transform={`matrix(${frame.m.join(' ')})`}>
                <rect data-shelf-free={lv} x={local.x} y={local.y} width={local.w} height={local.h} rx={2} fill="none" stroke={palette.text} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {/* Toute la tablette est touchable : elle mène au second zoom (sous les cartes, qui y mènent aussi). */}
            {frame && shelfBoardsIn(frame).map((b) => (
              <g key={`board-${b.level}`} data-zoom-board={b.level} transform={`matrix(${frame.m.join(' ')})`} onClick={() => onLevel(b.level)} style={{ cursor: 'pointer' }}>
                <rect x={b.local.x} y={b.local.y} width={b.local.w} height={b.local.h} fill="transparent" />
              </g>
            ))}
            {garnish.map(({ p, pl }) => {
              const slug = p.kind === 'stored' || p.kind === 'computer' ? p.slug : undefined;
              const hit = slug ? hitOf(p, pl) : null;
              if (!slug || !hit) return null;
              // Carte rangée : second zoom sur sa tablette ; écran du bureau : la fiche (carte inconnue : sans effet).
              const tap = p.kind === 'stored' ? () => onLevel(p.level) : cardTap(slug);
              return (
                <g key={p.id} data-zoom-card={slug} onClick={tap} style={{ cursor: p.kind === 'stored' || cards[slug] ? 'pointer' : 'default' }}>
                  <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
  const angledArt = <g>{items.map((it, i) => <g key={it.id}>{garnished(angle, turnedRectAt(i), garnishes[i] ?? [], it.id)}</g>)}</g>;
  const label = host === 'desk' ? 'Bureau vu de face' : n > 1 ? 'Bibliothèques vues de face' : 'Étagère vue de face';
  const onBoard = host === 'shelf' && level !== null && phase !== 'closing';
  // Portrait : deux tablettes côte à côte feraient une bande trop basse pour lire les titres ; on les empile.
  const stacked = stage.h > stage.w && ids.length === 2;
  return (
    <div className="wmt-lib-zoom" data-furniture-zoom="" data-zoom-phase={phase} data-zoom-face={face} data-zoom-level={level ?? undefined} style={reduced ? { opacity: hidden ? 0 : 1, transition: `opacity ${ms}ms ease-out` } : undefined} role="dialog" aria-label={label}>
      <div className="wmt-lib-zoom-backdrop" data-zoom-backdrop="" onClick={onBack} style={{ opacity: phase === 'closing' ? 0 : 1, transition: `opacity ${ms}ms ease-out` }} />
      {!onBoard && (
        <div
          className="wmt-lib-zoom-piece"
          style={{
            left: at.x, top: at.y, width: at.w, height: at.h,
            transition: `left ${move}ms ease-out, top ${move}ms ease-out, width ${move}ms ease-out, height ${move}ms ease-out`,
            animation: angle !== 0 && phase !== 'open' && !reduced ? `wmt-zoom-pivot ${ms}ms ease-in-out` : undefined,
          }}
        >
          <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            {face === 'front' ? frontArt : angledArt}
          </svg>
        </div>
      )}
      {onBoard && level !== null && <ShelfBoardZoom shelfIds={ids} level={level} room={room} cards={cards} imageOf={imageOf} onCard={onCard} onLevel={onLevel} stacked={stacked} />}
      <button type="button" className="wmt-lib-fab" data-action="zoom-back" aria-label={level !== null ? 'Retour à la vue de face' : 'Retour à la pièce'} title={level !== null ? 'Retour à la vue de face' : 'Retour à la pièce'} onClick={onBack} style={{ left: 8, top: 8 }}>
        <Icon paths={ICONS.back} />
      </button>
    </div>
  );
}
