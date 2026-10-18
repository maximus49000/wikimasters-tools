// Zoom de la chaîne hi-fi : couche plein écran, paysage (tournée de 90° si l'écran reste en hauteur, comme la vue Modifier), le bureau et
// le poste dessinés avec les mêmes modèles 3D que la pièce sous la caméra plongeante, cadrés serré (hifi-zoom). La pochette de l'album
// au poste se dresse devant le côté droit du poste (un vinyle à côté), pleine taille ; le disque tourne dans le puits (ou sur la platine) tant que le lecteur joue, s'arrête en pause ;
// l'afficheur fait défiler la piste. Remplace l'ancienne bulle du lecteur : ⏸/▶, ⏏ (le disque rentre, l'objet revient à sa place), ⓘ, ✕.
// Fable n'est pas passé sur la pochette debout : à reprendre lors d'un rattrapage Fable.
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { carriedPlacementOf, hostPointPx } from '../../core/library/carried-items';
import { PLUNGE_CAMERA } from '../../core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import { activeHifi, hifiState, sleeveKindOf } from '../../core/library/hifi';
import { ZOOM_COLUMN, ZOOM_PAD, hifiZoomFrame } from '../../core/library/hifi-zoom';
import { bookColor, type ItemPlacement } from '../../core/library/item-models';
import type { Layout, StyleId } from '../../core/library/library-types';
import { layerFrame } from '../../core/library/opened-item';
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
const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });

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
  const layer = layerFrame(screen);
  const steampunk = room.style === 'steampunk';
  // Calcul léger (projection affine mémorisée) : refait à chaque rendu, le zoom ne se redessine qu'avec le lecteur.
  const frame = pl ? hifiZoomFrame(hostKind, pl, sleeveKind, layer, steampunk) : null;
  const rect = frame?.rect ?? null;
  const stand = frame?.stand ?? null;
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
      {/* Piste en haut à gauche, par-dessus la scène (le cadrage la laisse au mur ou aux bords du poste). */}
      <div data-hifi-zoom-text="" style={{ position: 'absolute', left: ZOOM_PAD / 2, top: ZOOM_PAD / 2, maxWidth: `calc(55% - ${ZOOM_PAD}px)`, display: 'flex', flexDirection: 'column', padding: '6px 12px', borderRadius: 12, background: 'rgba(43,29,22,.72)', color: '#FBF6EA', font: '14px system-ui, sans-serif', lineHeight: 1.25, pointerEvents: 'none' }}>
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
      {/* Commandes en colonne contre le bord droit : toute la hauteur reste au poste et à sa pochette. */}
      <div data-hifi-zoom-bar="" style={{ position: 'absolute', top: ZOOM_PAD / 2, bottom: ZOOM_PAD / 2, right: (ZOOM_COLUMN - 52) / 2, width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 26, background: 'rgba(43,29,22,.45)' }}>
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
