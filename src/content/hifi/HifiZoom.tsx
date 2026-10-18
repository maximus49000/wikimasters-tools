// Zoom de la chaîne hi-fi : couche plein écran, paysage (tournée de 90° si l'écran reste en hauteur, comme la vue Modifier), le bureau et
// le poste dessinés avec les mêmes modèles 3D que la pièce sous la caméra plongeante, cadrés serré sur le poste. La pochette de l'album
// au poste se dresse à côté, pleine taille ; le disque tourne dans le puits (ou sur la platine) tant que le lecteur joue, s'arrête en pause ;
// l'afficheur fait défiler la piste. Remplace l'ancienne bulle du lecteur : ⏸/▶, ⏏ (le disque rentre, l'objet revient à sa place), ⓘ, ✕.
// Fable n'est pas passé sur la pochette debout : à reprendre lors d'un rattrapage Fable.
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { carriedPlacementOf, hostNativePx, hostPointPx, placementBounds } from '../../core/library/carried-items';
import { drawSize } from '../../core/library/footprint';
import { CELL_H, CELL_W, PLUNGE_CAMERA } from '../../core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import { activeHifi, hifiState, sleeveKindOf, sleeveStand } from '../../core/library/hifi';
import { bookColor, type ItemPlacement } from '../../core/library/item-models';
import type { Layout, StyleId } from '../../core/library/library-types';
import { layerFrame } from '../../core/library/opened-item';
import type { HostKind, PxRect } from '../../core/library/room-grid';
import { paletteOf } from '../../core/library/styles';
import { BUTTON } from '../arrange/arrange-chrome';
import { useCoverCache } from '../cover-cache';
import { useImageProbe } from '../image-probe';
import { CarriedItem3D, Model3DArt } from '../model3d-art';
import { getPlayerSource } from '../music-registry';
import { imageOfPlaced } from '../placed-image';
import type { PlayerView } from '../player-source';
import { SleeveArt, hifiContent, hifiDiscKindOf, type HifiDiscShow } from './hifi-art';

type Props = {
  layout: Layout;
  room: { style: StyleId };
  view: PlayerView;
  albumTitle: string | null;
  // Image d'une carte (la pochette choisie pour l'objet au poste passe devant, imageOfPlaced).
  imageOf(slug: string): string | undefined;
  onClose(): void;
  onEject(): void;
  // Fiche de la carte en lecture ; absente : pas de ⓘ.
  onInfo?(slug: string): void;
  // Une fiche est ouverte par-dessus : Échap la ferme seule.
  sheetOpen?: boolean;
};

type V3 = [number, number, number];
const PAD = 16;
// Bande du bas : piste et commandes.
const BAR = 72;
// Marge autour du poste et de sa pochette (fraction de leur taille à l'écran).
const MARGIN = 0.12;
const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });

// Cadre : le poste et sa pochette debout au plus grand qui tient au-dessus de la bande du bas ; `rect` est le rectangle du dessin du
// meuble entier (bien plus grand que la couche, il en déborde).
function zoomFrame(hostKind: HostKind, pts: V3[], frame: { w: number; h: number }): PxRect {
  const { w: cols, h: rows } = drawSize(hostKind, 0, PLUNGE_CAMERA);
  const px = pts.map((p) => hostNativePx(hostKind, 0, p, PLUNGE_CAMERA));
  const [bx0, bx1] = [Math.min(...px.map((p) => p[0])), Math.max(...px.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...px.map((p) => p[1])), Math.max(...px.map((p) => p[1]))];
  const [availW, availH] = [frame.w - 2 * PAD, frame.h - BAR - 2 * PAD];
  const scale = Math.min(availW / ((bx1 - bx0) * (1 + 2 * MARGIN)), availH / ((by1 - by0) * (1 + 2 * MARGIN)));
  const x = PAD + (availW - (bx1 - bx0) * scale) / 2 - bx0 * scale;
  const y = PAD + (availH - (by1 - by0) * scale) / 2 - by0 * scale;
  return { x, y, w: cols * CELL_W * scale, h: rows * CELL_H * scale };
}

const TEXT: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export function HifiZoom({ layout, room, view, albumTitle, imageOf, onClose, onEject, onInfo, sheetOpen = false }: Props): ReactElement | null {
  const [screen, setScreen] = useState(screenSize);
  useEffect(() => {
    const onResize = () => setScreen(screenSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !sheetOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sheetOpen]);
  // Une pochette choisie qui échoue (→ image de la carte) ou arrive sur l'appareil redessine le zoom.
  useImageProbe();
  useCoverCache();

  const station = activeHifi(layout);
  const at = station ? carriedPlacementOf(layout, station) : null;
  const state = hifiState(layout, view);
  const atHifi = state.atHifi !== null ? layout.find((p) => p.id === state.atHifi) ?? null : null;
  const slug = atHifi && 'slug' in atHifi ? atHifi.slug : null;
  const sleeveKind = atHifi ? sleeveKindOf(atHifi) : null;
  const pl: ItemPlacement | null = at?.placement ?? null;
  const hostKind = at?.hostKind ?? 'desk';
  const stand = pl && sleeveKind ? sleeveStand(pl, sleeveKind, FURNITURE_MODELS[hostKind].w) : null;
  const layer = layerFrame(screen);
  const steampunk = room.style === 'steampunk';
  // Calcul léger (projection affine mémorisée) : refait à chaque rendu, le zoom ne se redessine qu'avec le lecteur.
  const rect = pl ? (() => {
    const [x0, x1, y0, y1, z0, z1] = placementBounds(pl, steampunk);
    const body: V3[] = [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z): V3 => [x, y, z])));
    return zoomFrame(hostKind, [...body, ...(stand ? [...stand.corners, ...stand.back] : [])], layer);
  })() : null;
  if (!pl || !rect) return null;

  const palette = paletteOf(room.style);
  const track = view.track;
  const cover = slug ? imageOfPlaced({ slug, ...(atHifi && 'cover' in atHifi && atHifi.cover ? { cover: atHifi.cover } : {}) }, imageOf) ?? null : null;
  const disc: HifiDiscShow | null = slug && sleeveKind && atHifi ? { kind: hifiDiscKindOf(atHifi, sleeveKind), cover, color: bookColor(slug) } : null;
  const title = track ? (track.artist ? `${track.title} — ${track.artist}` : track.title) : null;
  const content = hifiContent({ disc, spinning: state.spinning, title, playing: track?.playing === true });
  const px = (p: V3) => hostPointPx(hostKind, 0, rect, p, PLUNGE_CAMERA);
  // Ligne du sol : le pied arrière du meuble (le mur commence là).
  const floorY = Math.min(layer.h, Math.max(0, px([0, 0, FURNITURE_MODELS[hostKind].d])[1]));

  // Un disque est au poste dès qu'une carte est mémorisée, même sans piste (Tidal, Spotify à l'arrêt ou sans appareil) :
  // ⏏ reste alors disponible pour le rendre, sinon il resterait coincé sur le poste.
  const loaded = view.card !== null || track !== null;
  const eject = (): void => {
    const source = getPlayerSource();
    if (track?.playing) void source?.toggle();
    source?.setCard(null);
    onEject();
  };
  const infoSlug = view.card?.slug ?? null;
  const geometry: CSSProperties = layer.rotated
    ? { top: 0, left: screen.w, width: layer.w, height: layer.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };

  return (
    <div data-hifi-zoom={station!.id} role="dialog" aria-label="Chaîne hi-fi" style={{ position: 'absolute', zIndex: 40, overflow: 'hidden', background: palette.wall, userSelect: 'none', WebkitUserSelect: 'none', ...geometry }}>
      <svg width={layer.w} height={layer.h} viewBox={`0 0 ${layer.w} ${layer.h}`} style={{ display: 'block' }} aria-hidden="true">
        <rect data-backdrop="wall" width={layer.w} height={floorY} fill={palette.wall} />
        <rect data-backdrop="floor" y={floorY} width={layer.w} height={Math.max(0, layer.h - floorY)} fill={palette.floor} />
        <Model3DArt kind={hostKind} angle={0} rect={rect} palette={palette} steampunk={steampunk} camera={PLUNGE_CAMERA} />
        <CarriedItem3D host={hostKind} angle={0} rect={rect} placement={pl} palette={palette} steampunk={steampunk} content={content} camera={PLUNGE_CAMERA} />
        {stand && slug && sleeveKind && (
          <g data-hifi-sleeve-stand={slug}>
            <SleeveArt top={stand.corners.map(px)} bottom={stand.back.map(px)} w={stand.w} d={stand.h} kind={sleeveKind} cover={cover} color={bookColor(slug)} title={albumTitle ?? view.card?.title ?? ''} />
          </g>
        )}
      </svg>
      <div data-hifi-zoom-bar="" style={{ position: 'absolute', left: PAD, right: PAD, bottom: PAD / 2, height: BAR - PAD / 2, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 14, background: 'rgba(43,29,22,.72)', color: '#FBF6EA', font: '14px system-ui, sans-serif' }}>
        <div data-hifi-zoom-text="" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, lineHeight: 1.25 }}>
          {track ? (
            <>
              <strong data-field="title" style={TEXT}>{track.title}</strong>
              <span data-field="artist" style={TEXT}>{track.artist}{albumTitle ? <span data-field="album" style={{ opacity: 0.75 }}> · {albumTitle}</span> : null}</span>
            </>
          ) : view.card ? (
            <>
              <strong data-field="album" style={TEXT}>{albumTitle ?? view.card.title}</strong>
              <span data-field="empty" style={{ opacity: 0.75 }}>Rien en lecture</span>
            </>
          ) : (
            <span data-field="empty">Rien en lecture</span>
          )}
        </div>
        {track && (
          <button type="button" data-action="toggle" aria-label="Lecture / pause" title="Lecture / pause" onClick={() => void getPlayerSource()?.toggle()} style={BUTTON}>
            {track.playing ? '⏸' : '▶'}
          </button>
        )}
        {loaded && <button type="button" data-action="eject" aria-label="Éjecter le disque" title="Éjecter le disque" onClick={eject} style={BUTTON}>⏏</button>}
        {onInfo && infoSlug && <button type="button" data-action="info" aria-label="Fiche de la carte" title="Fiche de la carte" onClick={() => onInfo(infoSlug)} style={BUTTON}>ⓘ</button>}
        <button type="button" data-action="close" aria-label="Fermer" title="Fermer" onClick={onClose} style={BUTTON}>✕</button>
      </div>
    </div>
  );
}
