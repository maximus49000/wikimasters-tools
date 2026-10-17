// Vue Modifier d'un plateau (✋) : couche plein écran, paysage (tournée de 90° en CSS si l'écran reste en hauteur, comme l'objet ouvert),
// mur et sol de la pièce en fond, le meuble et ses objets dessinés avec les mêmes modèles 3D que la pièce, sous la caméra plongeante.
// On y glisse les objets posés au cm (use-top-drag) ; l'ordinateur reste fixé à son bureau.
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import type { ArrangeFrame } from '../../core/library/arrange';
import { topToScreen } from '../../core/library/arrange';
import { carriedPlacementOf, hostNativePx } from '../../core/library/carried-items';
import { drawSize } from '../../core/library/footprint';
import { CELL_H, CELL_W, PLUNGE_CAMERA } from '../../core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import type { ItemPlacement } from '../../core/library/item-models';
import type { Layout, Placed, StyleId } from '../../core/library/library-types';
import { layerFrame } from '../../core/library/opened-item';
import { isLit, type HostKind, type PxRect } from '../../core/library/room-grid';
import { paletteOf } from '../../core/library/styles';
import { computerTopRect, topSize, type TopRect, type TopThing } from '../../core/library/surface';
import { isTableClock, tableFaceContent, useDecoScene } from '../deco-live';
import { CarriedItem3D, Model3DArt, type ItemContent } from '../model3d-art';
import type { SceneView } from '../RoomView';
import { useTopDrag } from './use-top-drag';

type Props = {
  layout: Layout;
  room: { style: StyleId };
  hostId: string;
  // Partie 4 : 'add' (carte en attente). Ici, seulement le déplacement.
  mode: 'move';
  onCommit(next: Layout): void;
  onClose(): void;
  sceneView?: SceneView;
  // Image de la carte affichée par un écran.
  imageOf?(slug: string): string | undefined;
};

const PAD = 16;
// L'objet tenu est soulevé de quelques px : son empreinte (sous lui) reste lisible.
const LIFT_PX = 12;
// Bandeau du haut : pastille du mode et ✓.
const TOP = 60;
const BUTTON: CSSProperties = {
  width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  font: '600 20px system-ui, sans-serif', color: '#FBF6EA', background: 'rgba(43,29,22,.72)', border: '1px solid rgba(251,246,234,.5)', borderRadius: '50%', padding: 0,
};
const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });
const r1 = (v: number): number => Math.round(v * 10) / 10;

// Cadre de la vue : le plateau (et ce qui se dresse dessus, jusqu'à 50 cm) au plus grand qui tient dans le calque, centré ; `rect` est le
// rectangle du dessin du meuble entier (Model3DArt), qui peut dépasser du calque (une étagère : ses tablettes sortent par le bas).
// `origin` de l'ArrangeFrame = coin du rectangle : topToScreen et le dessin partagent la même mise à l'échelle.
export function arrangeFrameFor(hostKind: HostKind, frame: { w: number; h: number }): ArrangeFrame & { rect: PxRect; floorY: number } {
  const m = FURNITURE_MODELS[hostKind];
  const { w: cols, h: rows } = drawSize(hostKind, 0, PLUNGE_CAMERA);
  const [nw, nh] = [cols * CELL_W, rows * CELL_H];
  // Boîte englobante (px natifs) de la zone à montrer : le plateau, un peu de son épaisseur, et 50 cm au-dessus (lampe, écran) ;
  // les pieds du bureau et les tablettes de l'étagère filent hors du calque, par le bas.
  const yLow = hostKind === 'desk' ? m.h - 30 : m.h - 10;
  const pts = [0, m.w].flatMap((x) => [yLow, m.h + 50].flatMap((y) => [0, m.d].map((z) => hostNativePx(hostKind, 0, [x, y, z], PLUNGE_CAMERA))));
  const [bx0, bx1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const [availW, availH] = [frame.w - 2 * PAD, frame.h - TOP - PAD];
  const scale = Math.min(availW / (bx1 - bx0), availH / (by1 - by0));
  const x = PAD + (availW - (bx1 - bx0) * scale) / 2 - bx0 * scale;
  const y = TOP + (availH - (by1 - by0) * scale) / 2 - by0 * scale;
  // Ligne du sol : le pied arrière du meuble (le mur commence là).
  const floorY = y + hostNativePx(hostKind, 0, [0, 0, m.d], PLUNGE_CAMERA)[1] * scale;
  return { hostKind, scale, origin: [x, y], rect: { x, y, w: nw * scale, h: nh * scale }, floorY };
}

// Objets du plateau : empreinte (cm) et pose 3D ; l'ordinateur est fixé.
type TopItem = { placed: Placed; rect: TopRect; placement: ItemPlacement; fixed: boolean };
function topItemsOf(layout: Layout, hostId: string): TopItem[] {
  const out: TopItem[] = [];
  for (const p of layout) {
    const fixed = p.kind === 'computer' && p.deskId === hostId;
    const movable = (p.kind === 'small' || p.kind === 'posed') && p.hostId === hostId && 'x' in p;
    if (!fixed && !movable) continue;
    const at = carriedPlacementOf(layout, p);
    if (!at) continue;
    const thing: TopThing | null = p.kind === 'small' ? { item: p.item } : p.kind === 'posed' ? { shape: p.shape, box: p.box } : null;
    const rect: TopRect = thing && 'x' in p ? { x: p.x, z: p.z, ...topSize(thing) } : computerTopRect();
    out.push({ placed: p, rect, placement: at.placement, fixed });
  }
  // Le plus loin d'abord (z grand), le plus proche passe devant.
  return out.sort((a, b) => b.rect.z - a.rect.z);
}

const quad = (f: ArrangeFrame, r: TopRect, dx = 0, dz = 0): string =>
  [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]]
    .map(([x, z]) => topToScreen(f, x! + dx, z! + dz)).map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');

export function ArrangeView({ layout, room, hostId, onCommit, onClose, sceneView, imageOf }: Props): ReactElement | null {
  const [screen, setScreen] = useState(screenSize);
  useEffect(() => {
    const onResize = () => setScreen(screenSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const host = layout.find((p) => p.id === hostId);
  const hostKind: HostKind | null = host && (host.kind === 'desk' || host.kind === 'shelf') ? host.kind : null;
  const layer = layerFrame(screen);
  const fit = useMemo(() => (hostKind ? arrangeFrameFor(hostKind, layer) : null), [hostKind, layer.w, layer.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame: ArrangeFrame = useMemo(() => (fit ? { hostKind: fit.hostKind, scale: fit.scale, origin: fit.origin } : { hostKind: 'desk', scale: 1, origin: [0, 0] }), [fit]);
  const { drag, pending, grab } = useTopDrag({ layout, hostId, frame, rotated: layer.rotated, onCommit });
  const items = useMemo(() => topItemsOf(layout, hostId), [layout, hostId]);
  const decoScene = useDecoScene(sceneView, false, items.some((i) => i.placed.kind === 'small' && isTableClock(i.placed.item)));
  if (!hostKind || !fit) return null;

  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  const contentOf = (p: Placed): ItemContent | undefined => {
    if (p.kind === 'computer') return { url: p.slug ? imageOf?.(p.slug) : undefined };
    if (p.kind !== 'small') return undefined;
    if (isTableClock(p.item) && decoScene) return tableFaceContent(p.item, p.city, room.style, decoScene);
    if (p.item === 'lamp') return { lit: isLit(p) };
    return undefined;
  };
  const dragged = drag ? items.find((i) => i.placed.id === drag.id) : undefined;
  // Objet déplacé à l'écran : tenu, ou lâché en vert et en attente de la disposition écrite.
  const lifted = drag ?? pending;
  const geometry: CSSProperties = layer.rotated
    ? { top: 0, left: screen.w, width: layer.w, height: layer.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };
  const floorY = Math.min(layer.h, Math.max(0, fit.floorY));

  return (
    <div data-arrange-view={hostId} data-arrange-mode="move" style={{ position: 'absolute', zIndex: 40, overflow: 'hidden', background: palette.wall, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', ...geometry }}>
      <svg width={layer.w} height={layer.h} viewBox={`0 0 ${layer.w} ${layer.h}`} style={{ display: 'block', touchAction: 'none' }} aria-hidden="true">
        {/* Mur, plinthe et sol de la pièce, en aplats. */}
        <rect data-backdrop="wall" width={layer.w} height={floorY} fill={palette.wall} />
        <rect data-backdrop="floor" y={floorY} width={layer.w} height={Math.max(0, layer.h - floorY)} fill={palette.floor} />
        <rect data-backdrop="skirt" y={floorY - 4} width={layer.w} height={5} fill={palette.skirt} opacity={0.6} />
        <Model3DArt kind={hostKind} angle={0} rect={fit.rect} palette={palette} steampunk={steampunk} camera={PLUNGE_CAMERA} />
        {/* Ombres nettes des objets sur le plateau (cellulo), puis l'empreinte de l'objet tenu. */}
        {items.filter((i) => i.placed.id !== lifted?.id).map((i) => <polygon key={`s${i.placed.id}`} data-shadow={i.placed.id} points={quad(frame, i.rect, 1.5, 2)} fill="#10080E" opacity={0.18} pointerEvents="none" />)}
        {drag && dragged && (
          <polygon data-footprint={drag.id} data-ok={drag.ok ? 'true' : 'false'} points={quad(frame, { ...dragged.rect, x: drag.x, z: drag.z })}
            fill={drag.ok ? 'rgba(62,155,90,.28)' : 'rgba(200,68,58,.3)'} stroke={drag.ok ? '#3E9B5A' : '#C8443A'} strokeWidth={2.5} strokeDasharray="7 5" pointerEvents="none" />
        )}
        {items.map((i) => {
          const held = drag?.id === i.placed.id;
          const moved = lifted?.id === i.placed.id ? lifted : null;
          return (
            <g key={i.placed.id} data-arrange-item={i.placed.id} {...(i.fixed ? { 'data-fixed': '' } : {})}
              style={{ cursor: i.fixed ? 'default' : held ? 'grabbing' : 'grab', ...(moved ? { transform: `translate(${r1(moved.tx)}px, ${r1(moved.ty - (held ? LIFT_PX : 0))}px)` } : {}), ...(held ? { opacity: 0.9 } : {}) }}
              onPointerDown={i.fixed ? undefined : (e) => grab(i.placed.id, e)}>
              <CarriedItem3D host={hostKind} angle={0} rect={fit.rect} placement={i.placement} palette={palette} steampunk={steampunk} content={contentOf(i.placed)} camera={PLUNGE_CAMERA} />
            </g>
          );
        })}
      </svg>
      <div aria-hidden="true" title="Modifier la disposition" style={{ ...BUTTON, position: 'absolute', top: 8, left: 8, cursor: 'default', background: '#22191A' }}>✋</div>
      <button type="button" data-action="arrange-done" aria-label="Terminer" title="Terminer" onClick={onClose} style={{ ...BUTTON, position: 'absolute', top: 8, right: 8, background: '#3E9B5A' }}>✓</button>
    </div>
  );
}
