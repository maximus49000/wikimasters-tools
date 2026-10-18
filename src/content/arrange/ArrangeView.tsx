// Vue Modifier d'un plateau (✋) : couche plein écran, paysage (tournée de 90° en CSS si l'écran reste en hauteur, comme l'objet ouvert),
// mur et sol de la pièce en fond, le meuble et ses objets dessinés avec les mêmes modèles 3D que la pièce, sous la caméra plongeante.
// On y glisse les objets posés au cm (use-top-drag) ; l'ordinateur reste fixé à son bureau. En mode ＋ (ajout), la réglette 🃏 met une
// carte en attente (halo doré) qu'on glisse à l'endroit exact avant ✓ (use-pending-card).
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { moveOnTop, type ArrangeFrame } from '../../core/library/arrange';
import { carriedPlacementOf, hostNativePx, hostPointPx, placementBounds } from '../../core/library/carried-items';
import { drawSize } from '../../core/library/footprint';
import { CELL_H, CELL_W, PLUNGE_CAMERA } from '../../core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import type { ItemPlacement } from '../../core/library/item-models';
import type { Layout, Placed, StyleId } from '../../core/library/library-types';
import { layerFrame } from '../../core/library/opened-item';
import { isLit, type HostKind, type PxRect } from '../../core/library/room-grid';
import { paletteOf } from '../../core/library/styles';
import { computerTopRect, topSize, topThingOf, type TopRect } from '../../core/library/surface';
import { isTableClock, tableFaceContent, useDecoScene } from '../deco-live';
import { CarriedItem3D, Model3DArt, type ItemContent } from '../model3d-art';
import { placedBoxContent } from '../placed-image';
import type { SceneView } from '../RoomView';
import { axesOf, topPx, useTopDrag, type TopAxes } from './use-top-drag';
import { HALO, HaloFilter, KO_HALO, PendingChrome } from './arrange-chrome';
import { PENDING_ID, pendingAtOf, usePendingCard, type AddProps } from './use-pending-card';
import { CardBubble } from './CardBubble';
import { useCardBubble, type CardBubbleProps, type CardBubbleState } from './use-card-bubble';

// Vue du dessus d'une étagère (ArrangeShelf) : la vue ne fait que dessiner ; la saisie passe par le glissé de l'étagère (use-board-drag,
// qui peut changer de niveau), l'objet tenu est estompé, la carte en attente et le bandeau du haut sont ceux de l'étagère.
export type ArrangeExternal = { grab(id: string, e: ReactPointerEvent): void; held: string | null; pending: string | null; blocked?: boolean };

type Props = CardBubbleProps & {
  layout: Layout;
  room: { style: StyleId };
  hostId: string;
  // Deux bibliothèques liées : leurs dessus côte à côte (de gauche à droite), même caméra ; absent : le seul `hostId`.
  hostIds?: string[];
  // 'move' : déplacer ce qui est posé ; 'add' : en plus, la réglette 🃏 et la carte en attente (`add`).
  mode: 'move' | 'add';
  add?: AddProps;
  // Intention de déplacement (appliquée par l'appelant à la disposition du moment) ; rend la promesse de l'écriture (ou rien) :
  // l'objet lâché reste à sa place jusqu'à ce qu'elle aboutisse. Absente avec `external`.
  onMove?(id: string, x: number, z: number): Promise<unknown> | void;
  external?: ArrangeExternal;
  onClose(): void;
  // Échap ; absent : ferme (onClose).
  onEscape?(): void;
  sceneView?: SceneView;
  // Image de la carte affichée par un écran.
  imageOf?(slug: string): string | undefined;
  // Bulle d'une carte tenue par l'appelant (dessus d'une étagère : ArrangeShelf reçoit les touchers) ; absente : la vue tient la sienne.
  cardBubble?: CardBubbleState;
};

const PAD = 16;
const NO_IMAGE = (): undefined => undefined;
// Bande du bord droit réservée aux boutons ▲ ▼ (vue du dessus d'une étagère) : la bulle ne s'y pose pas.
export const NAV_PX = 60;
// L'objet tenu est soulevé de quelques px : son empreinte (sous lui) reste lisible.
const LIFT_PX = 12;
// Bandeau du haut : pastille du mode, réglette 🃏, ✕ et ✓ (arrange-chrome).
const TOP = 60;
const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });
const r1 = (v: number): number => Math.round(v * 10) / 10;

// Cadre de la vue : le plateau (et ce qui se dresse dessus, jusqu'à 50 cm) au plus grand qui tient dans le calque, centré ; `rect` est le
// rectangle du dessin du meuble entier (Model3DArt), qui peut dépasser du calque (une étagère : ses tablettes sortent par le bas).
// `origin` de l'ArrangeFrame = coin du rectangle : topToScreen et le dessin partagent la même mise à l'échelle.
// `count` meubles côte à côte (bibliothèques liées) : le cadre couvre leurs plateaux à la suite ; `shift` est le décalage (px du calque)
// d'un meuble au suivant (image de l'axe x sur la largeur du meuble) ; frameAt donne le cadre de chacun.
export type ArrangeFit = ArrangeFrame & { rect: PxRect; floorY: number; shift: [number, number] };
export function arrangeFrameFor(hostKind: HostKind, frame: { w: number; h: number }, count = 1): ArrangeFit {
  const m = FURNITURE_MODELS[hostKind];
  const { w: cols, h: rows } = drawSize(hostKind, 0, PLUNGE_CAMERA);
  const [nw, nh] = [cols * CELL_W, rows * CELL_H];
  // Boîte englobante (px natifs) de la zone à montrer : le plateau, un peu de son épaisseur, et 50 cm au-dessus (lampe, écran) ;
  // les pieds du bureau et les tablettes de l'étagère filent hors du calque, par le bas.
  const yLow = hostKind === 'desk' ? m.h - 30 : m.h - 10;
  const pts = [0, m.w * count].flatMap((x) => [yLow, m.h + 50].flatMap((y) => [0, m.d].map((z) => hostNativePx(hostKind, 0, [x, y, z], PLUNGE_CAMERA))));
  const [bx0, bx1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const [availW, availH] = [frame.w - 2 * PAD, frame.h - TOP - PAD];
  const scale = Math.min(availW / (bx1 - bx0), availH / (by1 - by0));
  const x = PAD + (availW - (bx1 - bx0) * scale) / 2 - bx0 * scale;
  const y = TOP + (availH - (by1 - by0) * scale) / 2 - by0 * scale;
  // Ligne du sol : le pied arrière du meuble (le mur commence là).
  const floorY = y + hostNativePx(hostKind, 0, [0, 0, m.d], PLUNGE_CAMERA)[1] * scale;
  const o = hostNativePx(hostKind, 0, [0, 0, 0], PLUNGE_CAMERA);
  const e = hostNativePx(hostKind, 0, [m.w, 0, 0], PLUNGE_CAMERA);
  return { hostKind, scale, origin: [x, y], rect: { x, y, w: nw * scale, h: nh * scale }, floorY, shift: [(e[0] - o[0]) * scale, (e[1] - o[1]) * scale] };
}
// Cadre (origine et rectangle) du i-ième meuble d'un cadre à plusieurs.
export function frameAt(fit: ArrangeFit, i: number): ArrangeFit {
  if (i === 0) return fit;
  const [dx, dy] = [fit.shift[0] * i, fit.shift[1] * i];
  return { ...fit, origin: [fit.origin[0] + dx, fit.origin[1] + dy], rect: { ...fit.rect, x: fit.rect.x + dx, y: fit.rect.y + dy } };
}

// Objets des plateaux : empreinte (cm), pose 3D et rang du meuble (`host`) ; l'ordinateur est fixé.
type TopItem = { placed: Placed; rect: TopRect; placement: ItemPlacement; fixed: boolean; host: number };
function topItemsOf(layout: Layout, hostIds: string[]): TopItem[] {
  const out: TopItem[] = [];
  for (const p of layout) {
    const hostId = p.kind === 'computer' ? p.deskId : (p.kind === 'small' || p.kind === 'posed') && 'x' in p ? p.hostId : null;
    const host = hostId === null ? -1 : hostIds.indexOf(hostId);
    if (host < 0) continue;
    const at = carriedPlacementOf(layout, p);
    if (!at) continue;
    const rect: TopRect = (p.kind === 'small' || p.kind === 'posed') && 'x' in p ? { x: p.x, z: p.z, ...topSize(topThingOf(p)) } : computerTopRect();
    out.push({ placed: p, rect, placement: at.placement, fixed: p.kind === 'computer', host });
  }
  // Le plus loin d'abord (z grand), le plus proche passe devant.
  return out.sort((a, b) => b.rect.z - a.rect.z);
}

// Coins écran (px du calque) d'un rectangle du plateau (projection affine mémorisée du cadre), et son quadrilatère SVG.
const cornersPx = (a: TopAxes, r: TopRect): [number, number][] =>
  [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]].map(([x, z]) => topPx(a, x!, z!));
const quad = (a: TopAxes, r: TopRect): string => cornersPx(a, r).map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
// Rectangle englobant de points écran.
const boxOf = (pts: [number, number][]): PxRect => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
// Ombre nette (cellulo) d'un objet posé : son assise (empreinte rentrée de 12 %), décalée d'un demi-centimètre vers la droite et le fond ;
// elle dépasse à peine sous l'objet.
const SHADOW_INSET = 0.12;
const SHADOW_SHIFT_CM = 0.5;
const shadowRect = (r: TopRect): TopRect => ({ x: r.x + r.w * SHADOW_INSET + SHADOW_SHIFT_CM, z: r.z + r.d * SHADOW_INSET + SHADOW_SHIFT_CM, w: r.w * (1 - 2 * SHADOW_INSET), d: r.d * (1 - 2 * SHADOW_INSET) });

export function ArrangeView({ layout, room, hostId, hostIds, mode, add, onMove, external, onClose, onEscape, sceneView, imageOf, cardBubble, ...bubbleProps }: Props): ReactElement | null {
  const [screen, setScreen] = useState(screenSize);
  useEffect(() => {
    const onResize = () => setScreen(screenSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const ids = useMemo(() => hostIds ?? [hostId], [hostIds, hostId]);
  const host = layout.find((p) => p.id === ids[0]);
  const hostKind: HostKind | null = host && (host.kind === 'desk' || host.kind === 'shelf') ? host.kind : null;
  const layer = layerFrame(screen);
  const fit = useMemo(() => (hostKind ? arrangeFrameFor(hostKind, layer, ids.length) : null), [hostKind, layer.w, layer.h, ids.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame: ArrangeFrame = useMemo(() => (fit ? { hostKind: fit.hostKind, scale: fit.scale, origin: fit.origin } : { hostKind: 'desk', scale: 1, origin: [0, 0] }), [fit]);
  // Mode ＋ : la disposition dessinée et glissée porte la carte en attente ; ses glissés la déplacent sans rien écrire.
  const pend = usePendingCard({ layout, ids, add, enabled: mode === 'add' && !external });
  const shownLayout = pend.view;
  const moves = pend.wrap({ onMove });
  // Bulle d'un objet (relue par le glissé, qui vient avant elle) : un toucher l'ouvre, seul l'objet armé par ✥ (ou la carte en attente) se
  // glisse, le lâcher le désarme.
  const bubbleRef = useRef<CardBubbleState | null>(null);
  const { drag, pending, axes, grab: ownGrab } = useTopDrag({
    layout: shownLayout, hostIds: ids, frame, rotated: layer.rotated, onMove: moves.onMove,
    onTap: (id) => bubbleRef.current?.open(id),
    canDrag: (id) => id === PENDING_ID || bubbleRef.current?.armed === id,
    onRelease: () => bubbleRef.current?.disarm(),
  });
  // Ce que l'on voit (déplacements en attente appliqués, carte en attente) : les refus de la bulle s'y jugent.
  const seen = useMemo(() => pending.reduce((l, w) => moveOnTop(l, w.id, w.x, w.z) ?? l, shownLayout), [pending, shownLayout]);
  const ownBubble = useCardBubble(seen, bubbleProps);
  const bubble = cardBubble ?? ownBubble;
  bubbleRef.current = bubble;
  // Échap : une fiche ouverte par-dessus se ferme seule ; sinon la bulle d'abord, puis l'objet armé, puis la vue.
  const escape = onEscape ?? onClose;
  const busy = bubble.item !== null || bubble.armed !== null;
  const { close: closeBubble, disarm, sheetOpen } = bubble;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sheetOpen) return;
      if (busy) { closeBubble(); disarm(); } else escape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escape, busy, closeBubble, disarm, sheetOpen]);
  const grab = external ? external.grab : ownGrab;
  const pendingId = external ? external.pending : pend.shown ? PENDING_ID : null;
  // Carte en attente dont la place ne tient plus (disposition reçue) : cerclée de rouge, ✓ refusé.
  const pendingBlocked = external ? external.blocked === true : pend.blocked;
  const haloId = `wm-halo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const items = useMemo(() => topItemsOf(shownLayout, ids), [shownLayout, ids]);
  // Axes de chaque plateau : mêmes images des axes, origine décalée d'un meuble au suivant.
  const axesAt = useMemo(() => ids.map((_, i) => (fit && i > 0 ? axesOf(frameAt(fit, i)) : axes)), [ids, fit, axes]);
  // Ombres calculées une fois par (objets, cadre) : la pièce se redessine à chaque mouvement du doigt.
  const shadows = useMemo(() => items.map((i) => ({ id: i.placed.id, points: quad(axesAt[i.host] ?? axes, shadowRect(i.rect)) })), [items, axes, axesAt]);
  const decoScene = useDecoScene(sceneView, false, items.some((i) => i.placed.kind === 'small' && isTableClock(i.placed.item)));
  if (!hostKind || !fit) return null;

  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  const contentOf = (p: Placed): ItemContent | undefined => {
    if (p.kind === 'computer') return { url: p.slug ? imageOf?.(p.slug) : undefined };
    // Carte posée : l'image de sa pochette (et le dos d'une boîte de jeu), comme dans la pièce.
    if (p.kind === 'posed') {
      return placedBoxContent(p, imageOf ?? NO_IMAGE);
    }
    if (p.kind !== 'small') return undefined;
    if (isTableClock(p.item) && decoScene) return tableFaceContent(p.item, p.city, room.style, decoScene);
    if (p.item === 'lamp') return { lit: isLit(p) };
    return undefined;
  };
  const dragged = drag ? items.find((i) => i.placed.id === drag.id) : undefined;
  const pendingItem = pendingId ? items.find((i) => i.placed.id === pendingId) : undefined;
  const armedItem = bubble.armed ? items.find((i) => i.placed.id === bubble.armed) : undefined;
  // Objet déplacé à l'écran : tenu, ou lâché en vert et en attente de la disposition écrite.
  const liftedOf = (id: string): { tx: number; ty: number } | null => (drag?.id === id ? drag : pending.find((w) => w.id === id) ?? null);
  // Les objets soulevés se dessinent en dernier : un objet du fond amené devant n'est pas caché par ceux de devant.
  const ordered = [...items.filter((i) => !liftedOf(i.placed.id)), ...items.filter((i) => liftedOf(i.placed.id))];
  const geometry: CSSProperties = layer.rotated
    ? { top: 0, left: screen.w, width: layer.w, height: layer.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };
  const floorY = Math.min(layer.h, Math.max(0, fit.floorY));
  // Bulle à côté de l'objet, jamais dessus : son rectangle écran couvre l'empreinte et tout l'objet dressé (ses 8 coins projetés).
  const bubbleItem = bubble.item ? items.find((i) => i.placed.id === bubble.item!.id) : undefined;
  const bubbleAnchor = bubbleItem ? (() => {
    const [x0, x1, y0, y1, z0, z1] = placementBounds(bubbleItem.placement, steampunk);
    const rect = frameAt(fit, bubbleItem.host).rect;
    const body = [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => hostPointPx(hostKind, 0, rect, [x, y, z], PLUNGE_CAMERA))));
    return boxOf([...cornersPx(axesAt[bubbleItem.host] ?? axes, bubbleItem.rect), ...body]);
  })() : null;

  return (
    <div data-arrange-view={ids.join('+')} data-arrange-mode={mode} onPointerDown={bubble.layerDown} style={{ position: 'absolute', zIndex: 40, overflow: 'hidden', background: palette.wall, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', ...geometry }}>
      <svg width={layer.w} height={layer.h} viewBox={`0 0 ${layer.w} ${layer.h}`} style={{ display: 'block', touchAction: 'none' }} aria-hidden="true">
        {pendingItem && <HaloFilter id={haloId} />}
        {/* Mur, plinthe et sol de la pièce, en aplats. */}
        <rect data-backdrop="wall" width={layer.w} height={floorY} fill={palette.wall} />
        <rect data-backdrop="floor" y={floorY} width={layer.w} height={Math.max(0, layer.h - floorY)} fill={palette.floor} />
        <rect data-backdrop="skirt" y={floorY - 4} width={layer.w} height={5} fill={palette.skirt} opacity={0.6} />
        {ids.map((id, i) => <Model3DArt key={id} kind={hostKind} angle={0} rect={frameAt(fit, i).rect} palette={palette} steampunk={steampunk} camera={PLUNGE_CAMERA} />)}
        {/* Ombres nettes des objets sur le plateau (cellulo), puis l'empreinte de l'objet tenu. */}
        {shadows.filter((s) => !liftedOf(s.id)).map((s) => <polygon key={`s${s.id}`} data-shadow={s.id} points={s.points} fill="#10080E" opacity={0.22} pointerEvents="none" />)}
        {drag && dragged && (
          <polygon data-footprint={drag.id} data-ok={drag.ok ? 'true' : 'false'} points={quad(axesAt[dragged.host] ?? axes, { ...dragged.rect, x: drag.x, z: drag.z })}
            fill={drag.ok ? 'rgba(62,155,90,.28)' : 'rgba(200,68,58,.3)'} stroke={drag.ok ? '#3E9B5A' : '#C8443A'} strokeWidth={2.5} strokeDasharray="7 5" pointerEvents="none" />
        )}
        {/* Objet armé par ✥ Déplacer : son empreinte cerclée de bleu (prêt à glisser). */}
        {armedItem && !liftedOf(armedItem.placed.id) && (
          <polygon data-armed={armedItem.placed.id} points={quad(axesAt[armedItem.host] ?? axes, armedItem.rect)} fill="rgba(47,127,214,.16)" stroke="#2f7fd6" strokeWidth={2.5} strokeDasharray="7 5" pointerEvents="none" />
        )}
        {/* Carte en attente : son empreinte cerclée d'or (là où ✓ la posera). */}
        {pendingItem && !liftedOf(pendingItem.placed.id) && (
          <polygon data-pending-halo="" data-ok={pendingBlocked ? 'false' : 'true'} points={quad(axesAt[pendingItem.host] ?? axes, pendingItem.rect)}
            fill={pendingBlocked ? 'rgba(200,68,58,.3)' : 'rgba(245,197,66,.22)'} stroke={pendingBlocked ? KO_HALO : HALO} strokeWidth={2.5} pointerEvents="none" />
        )}
        {ordered.map((i) => {
          const held = drag?.id === i.placed.id || external?.held === i.placed.id;
          const moved = liftedOf(i.placed.id);
          const isPending = i.placed.id === pendingId && i.placed.kind === 'posed';
          const draggable = isPending || bubble.armed === i.placed.id;
          return (
            <g key={i.placed.id} data-arrange-item={i.placed.id} {...(i.fixed ? { 'data-fixed': '' } : {})}
              {...(isPending && i.placed.kind === 'posed' ? { 'data-pending': i.placed.slug, 'data-at': pendingAtOf(shownLayout) ?? '', 'data-ok': pendingBlocked ? 'false' : 'true', filter: `url(#${haloId})` } : {})}
              style={{ cursor: i.fixed ? 'default' : held ? 'grabbing' : draggable ? 'grab' : 'pointer', ...(moved ? { transform: `translate(${r1(moved.tx)}px, ${r1(moved.ty - (held ? LIFT_PX : 0))}px)` } : {}), ...(held ? { opacity: external ? 0.6 : 0.9 } : {}) }}
              onPointerDown={i.fixed ? undefined : (e) => grab(i.placed.id, e)}>
              <CarriedItem3D host={hostKind} angle={0} rect={frameAt(fit, i.host).rect} placement={i.placement} palette={palette} steampunk={steampunk} content={contentOf(i.placed)} camera={PLUNGE_CAMERA} />
            </g>
          );
        })}
      </svg>
      {bubble.item && bubbleAnchor && (
        <CardBubble item={bubble.item} anchor={bubbleAnchor} layer={layer} reserveRight={external ? NAV_PX : 0} message={bubble.message} canEdit={bubble.canEdit}
          covers={bubble.covers} swap={bubble.swap} taken={bubble.taken}
          onMove={bubble.arm} onChange={bubble.change} onInfo={bubble.canInfo ? bubble.info : undefined} onCity={bubble.canCity ? bubble.city : undefined} onClose={bubble.close} />
      )}
      {!external && (
        <PendingChrome mode={mode} add={add} layout={layout} pend={pend} onClose={onClose} />
      )}
    </div>
  );
}
