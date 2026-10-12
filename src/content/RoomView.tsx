import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { FurnitureKind, Placed, Room } from '../core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, ROWS, VISIBLE_COLS, WALL_ROWS, SURFACE_SLOTS, computerRect, depthOf, isLamp, isLit, isStanding, pxRect, rectOf, shelfSlots, surfaceSlotRect, type Cell, type PxRect, type Rect } from '../core/library/room-grid';
import { drawOrder } from '../core/library/depth-order';
import { boxesOf, lampsOf, layoutSignature } from '../core/library/light/occluders';
import { decorOf, paletteOf } from '../core/library/styles';
import { NeonDefs, RoomBackdrop, neonOutline } from './room-backdrop';
import { boundingRect, gapRects } from './window-gaps';
import { SteampunkDecor } from './room-steampunk-decor';
import { ShelfItemArt, WallArt } from './library-card-art';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';
import { HomeArt, SmallArt } from './furniture-art-home';
import { AnalyticalEngineArt, SteampunkArt } from './furniture-art-steampunk';
import { getImageService } from './image-registry';
import { FIGURE_SPRITES_MAX, FigureContext, FigureRegistry } from './figure/figure-host';
import { ShopContext, ShopRegistry } from './shop/shop-host';
import { CarContext, CarRegistry } from './vehicle/car-host';
import { PropContext, PropRegistry } from './prop/prop-host';
import { SceneActors, ScenePanoramaStatic } from './scene-panorama';
import { reducedMotion } from './ghibli-sky';
import { WindowArt, GlassDrops, glassRect } from './window-art';
import { WEATHER_SCENES, WeatherLayer } from './scene-weather';
import { LightLayer } from './light-layer';
import { petBoxesOf } from '../core/library/light/pet-boxes';
import type { PetFrame } from '../core/library/pets/runner';
import type { Weather } from '../core/library/weather/weather-types';
import { hashString } from '../core/library/scene-world';
import type { DayContext } from '../core/library/city/calendar';
import type { CityContext } from '../core/library/city/intensity';
import { dayNumber } from '../core/library/city/shops/hours';
import type { BusNetwork } from '../core/library/city/traffic/bus-lines';
import type { NamePool } from '../core/library/city/shops/lifecycle';
import { skyAt, type Sky } from '../core/library/sky';
import { PetBubble, PetSprite } from './pet-sprite';
import { BUBBLE, type PetView } from './pet-sim';

// Horloge immobile (ciel dégagé) pour le calque de lumière d'une pièce sans météo : les lampes y restent efficaces.
const NO_GLASS: readonly never[] = [];
const STILL_CLOCK = { read: (): Weather => ({ cloud: 0, precip: 0 } as Weather) };

// Ciel d'après-midi quand aucune heure n'est fournie (test, premier rendu) ; calculé une fois : le décor est mémoïsé.
// Noms locaux absents : identité stable pour ne pas invalider le contexte de la ville.
const EMPTY_NAMES: NamePool = {};
const DEFAULT_VIEW: SceneView = { sky: skyAt(15 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 }), minutes: 15 * 60 };

// Météo vue par les fenêtres : l'horloge est relue à chaque image par le calque ; les drapeaux (ciel sombre, pluie) touchent le décor fixe.
// `city` : jour de la ville et mode « Toujours la nuit » ; sans lui, la scène Ville reste sans population.
export type SceneView = {
  sky: Sky;
  minutes: number;
  weather?: { clock: { read(nowMs: number): Weather }; flags: { gloom: boolean; rainy: boolean } };
  city?: { day: DayContext; forcedNight: boolean; shopNames?: NamePool; busLines?: BusNetwork | null };
};

export type Tool = { type: 'new'; kind: FurnitureKind } | { type: 'move'; id: string } | { type: 'card' } | null;

type Props = {
  room: Room;
  editing: boolean;
  // Les cases captent les touchers (une pose ou un déplacement est en cours) ; sinon ce sont les meubles.
  cellsActive: boolean;
  selectedId: string | null;
  blink: Cell[];
  onCell: (col: number, row: number) => void;
  onPick: (id: string) => void;
  // Appui long (puis glissé) sur un meuble : le panneau décide de ce que ça déclenche.
  onFurnitureDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
  onFurnitureMove?: (event: PointerEvent<SVGGElement>) => void;
  onFurnitureUp?: () => void;
  // Meuble soulevé : position du doigt dans le repère du dessin, et contour d'arrivée (vert si valide, rouge sinon).
  drag?: DragView | null;
  // Titre et image des cartes posées dans la pièce, par slug ; un slug absent = carte inconnue (objet grisé).
  cards?: Record<string, { title: string; imageUrl?: string }>;
  // Toucher sur un objet accroché, rangé ou sur l'écran de l'ordinateur.
  onCardTap?: (id: string) => void;
  // Ciel et heure vus à travers les fenêtres ; sans eux, un ciel d'après-midi.
  sceneView?: SceneView;
  // Chats de la pièce : `behind` = nombre de meubles debout dessinés avant lui. Leur position est posée par la boucle d'animation (attribut transform).
  pets?: PetView[];
  petAttach?: (id: string, el: SVGGElement | null) => void;
  onPetTap?: (id: string) => void;
  // Images courantes des animaux (position à l'image), pour leurs ombres ; relues à chaque repeinture du calque.
  petFrames?: () => readonly PetFrame[];
  // Calque de lumière (ombre et rayons de soleil) par-dessus la pièce ; seulement avec une météo et une fenêtre.
  light?: boolean;
  // Plein écran d'une pièce horizontale sur un écran en paysage : le dessin couvre tout l'écran (plus de colonnes visibles,
  // ou zoom sur la largeur le temps que la pièce trop étroite s'élargisse à celle de l'écran).
  fill?: boolean;
  // Vue « dehors » : le monde (largeur de la pièce × hauteur du mur) couvre tout le dessin, même sans fenêtre. Le viewBox passé à React
  // reste constant ; le hook de caméra l'écrit ensuite directement dans le DOM. Un repère de suivi (invisible) est rendu en dernier dans le monde.
  outside?: boolean;
  // Couches de la pièce (mur, vitres, meubles, animaux, lumière…) : 'hidden' les estompe (400 ms) puis les retire ; le nœud du monde, lui, reste.
  roomLayers?: 'shown' | 'hidden';
};

export type DragView = { id: string; x: number; y: number; ok: boolean; ghost: Rect | null; ghostPx?: PxRect };

function ghostBox(rect: Rect): { x: number; y: number; width: number; height: number } {
  const px = pxRect(rect);
  return { x: px.x, y: px.y, width: px.w, height: px.h };
}

export function RoomView({ room, editing, cellsActive, selectedId, blink, onCell, onPick, onFurnitureDown, onFurnitureMove, onFurnitureUp, drag = null, cards = {}, onCardTap, sceneView, pets = [], petAttach, onPetTap, petFrames, light = false, fill = false, outside = false, roomLayers = 'shown' }: Props) {
  const palette = paletteOf(room.style);
  const decor = decorOf(room.style);
  const steampunk = room.style === 'steampunk';
  // Se réabonne aux images qui arrivent après le premier dessin : un compteur change à chaque notification du service.
  const images = getImageService();
  const imageVersion = useRef(0);
  const subscribeImages = useCallback(
    (notify: () => void) => images?.subscribe(() => { imageVersion.current++; notify(); }) ?? (() => undefined),
    [images],
  );
  useSyncExternalStore(subscribeImages, () => imageVersion.current);
  const width = room.cols * CELL_W;
  const wallH = WALL_ROWS * CELL_H;
  const worldId = `${useId()}-world`.replace(/:/g, '');
  // Cache des sprites du pantin (Ghibli) : un par pièce ; les figures sont des <image>, rien n'est hébergé dans le DOM.
  // Plafond : la rue Ghibli des commerces (gestes des employés et des clients, G4b) dépasse 1 500 poses en vue à midi ; au-delà
  // le cache tournerait et repeindrait sans cesse. Budget de peinture par image : le défaut (spec G4b §7).
  const figures = useMemo(() => new FigureRegistry(`${worldId}-fig`, { max: FIGURE_SPRITES_MAX }), [worldId]);
  // Sprites peints des voitures Ghibli : même cycle de vie.
  const cars = useMemo(() => new CarRegistry(`${worldId}-car`), [worldId]);
  const shops = useMemo(() => new ShopRegistry(`${worldId}-shop`), [worldId]);
  // Accessoires de rue Ghibli (G5) : une instance partagée par le décor fixe et les acteurs.
  const propSprites = useMemo(() => new PropRegistry(`${worldId}-prop`), [worldId]);
  // Fondu de la pièce : après 400 ms à 'hidden' (0 ms en mouvement réduit) les couches sont retirées du DOM (`gone`).
  const still = reducedMotion();
  const [gone, setGone] = useState(false);
  const removedRef = useRef(false);
  const wallRef = useRef<SVGGElement>(null);
  const layersRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (roomLayers !== 'hidden') return undefined;
    if (still) { removedRef.current = true; setGone(true); return undefined; }
    const timer = setTimeout(() => { removedRef.current = true; setGone(true); }, 400);
    return () => clearTimeout(timer);
  }, [roomLayers, still]);
  // Retour de la pièce après démontage : fondu d'entrée (absent sous jsdom : appel optionnel).
  useLayoutEffect(() => {
    if (roomLayers !== 'shown' || !removedRef.current) return;
    removedRef.current = false;
    setGone(false);
    if (!still) for (const el of [wallRef.current, layersRef.current]) el?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease' });
  }, [roomLayers, still]);
  const showRoom = roomLayers === 'shown' || (!still && !gone);
  const fadeStyle = { opacity: roomLayers === 'shown' ? 1 : 0, transition: still ? 'none' : 'opacity 400ms ease', ...(roomLayers === 'hidden' ? { pointerEvents: 'none' as const } : {}) };
  const windows = room.layout.filter((p): p is Extract<Placed, { kind: 'window' }> => p.kind === 'window');
  const view = useMemo(() => sceneView ?? DEFAULT_VIEW, [sceneView]);
  // Météo : seulement dans les scènes terrestres (ni dans l'espace ni en orbite), et seulement si le panneau la fournit.
  const weatherOn = view.weather !== undefined && WEATHER_SCENES.includes(room.scene);
  const gloom = weatherOn && (view.weather?.flags.gloom ?? false);
  const rainy = weatherOn && (view.weather?.flags.rainy ?? false);
  // Ciel couvert sans pluie : précipitation 0,1, sous le seuil des parapluies (0,2) : ils ne sortent que sous la pluie.
  // Contexte de la ville (mémoïsé : SceneActors compare ses props par identité). La météo n'expose que pluie et ciel sombre :
  // neige et orage restent faux (limite connue de la vague 1a).
  const city = useMemo<CityContext | undefined>(
    () =>
      view.city && room.scene === 'city'
        ? { minutes: view.minutes, day: view.city.day, precip: rainy ? 0.7 : gloom ? 0.1 : 0, snow: false, storm: false, daylight: view.sky.daylight, shops: { epochDay: room.cityEpoch ?? dayNumber(view.city.day.date), names: view.city.shopNames ?? EMPTY_NAMES }, buses: view.city.busLines ?? null }
        : undefined,
    [view.city, room.scene, room.cityEpoch, view.minutes, view.sky.daylight, rainy, gloom],
  );
  const forcedNight = view.city?.forcedNight ?? false;
  // Gouttes sur la vitre (et leur animation SMIL) seulement quand il pleut assez : signalé par la boucle de météo, rarement.
  const [wet, setWet] = useState(false);
  const drops = weatherOn && wet;
  const glasses = useMemo(() => windows.map((w) => glassRect(pxRect({ col: w.col, row: w.row, w: w.w, h: w.h }))), [room.layout]); // eslint-disable-line react-hooks/exhaustive-deps
  // Occulteurs et lampes allumées du calque de lumière ; la signature change quand l'un d'eux bouge ou s'allume.
  // HEIGHT est une constante : seuls le layout et wallH font varier la géométrie.
  const lightGeom = { wallH, floorH: HEIGHT - wallH };
  const lightBoxes = useMemo(() => boxesOf(room.layout, lightGeom), [room.layout, wallH]); // eslint-disable-line react-hooks/exhaustive-deps
  const lightLamps = useMemo(() => lampsOf(room.layout, lightGeom), [room.layout, wallH]); // eslint-disable-line react-hooks/exhaustive-deps
  const lightSignature = useMemo(() => layoutSignature(room.layout, lightGeom), [room.layout, wallH]); // eslint-disable-line react-hooks/exhaustive-deps
  // Identité stable (sinon le calque serait relancé à chaque rendu) : la disposition est lue par référence.
  const layoutRef = useRef(room.layout);
  layoutRef.current = room.layout;
  const getPetBoxes = useMemo(
    () => (petFrames ? () => petBoxesOf(petFrames(), layoutRef.current, lightGeom) : undefined),
    [petFrames, wallH], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const blinking = new Set(blink.map((c) => `${c.col}-${c.row}`));

  const deskRects = new Map<string, PxRect>();
  // Bureaux et étagères : ils portent les petits objets.
  const hostRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (!rect) continue;
    if (placed.kind === 'desk') deskRects.set(placed.id, pxRect(rect));
    if (placed.kind === 'desk' || placed.kind === 'shelf') hostRects.set(placed.id, pxRect(rect));
  }
  const imageOf = (slug: string): string | undefined => {
    const url = cards[slug]?.imageUrl;
    return images?.displayUrl(slug, url) ?? url;
  };
  // Emplacements d'étagère déjà pris : leurs pointillés ne se dessinent pas.
  const occupiedSlots = new Map<string, Set<number>>();
  for (const placed of room.layout) {
    if (placed.kind !== 'stored') continue;
    const set = occupiedSlots.get(placed.shelfId) ?? new Set<number>();
    set.add(placed.slot);
    occupiedSlots.set(placed.shelfId, set);
  }
  const outline = (rect: PxRect) => (
    <rect x={rect.x - 3} y={rect.y - 3} width={rect.w + 6} height={rect.h + 6} rx={6} fill="none" stroke="#378ADD" strokeWidth={2.5} strokeDasharray="6 4" />
  );

  // Copie soulevée d'un dessin (un peu plus grande, en transparence) qui suit le doigt ; `anchor` : le rectangle que le doigt tient.
  function liftedCopyOf(rect: PxRect, art: ReactElement, anchor: PxRect): ReactElement | null {
    if (!drag) return null;
    const dx = drag.x - (anchor.x + anchor.w / 2);
    const dy = drag.y - (anchor.y + anchor.h / 2);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return (
      <g data-lifted-copy="" transform={`translate(${cx + dx} ${cy + dy}) scale(1.08) translate(${-cx} ${-cy})`} opacity={0.65} style={{ pointerEvents: 'none' }}>
        {art}
      </g>
    );
  }

  // Dessin d'un meuble, d'une fenêtre, d'un ordinateur ou d'un petit objet, et son rectangle ; `null` si rien à dessiner.
  // `liftedArt` : dessin de la copie soulevée quand il diffère (la fenêtre emporte sa vue).
  function artOf(placed: Placed): { rect: PxRect; art: ReactElement; liftedArt?: ReactElement } | null {
    if (placed.kind === 'computer') {
      const desk = deskRects.get(placed.deskId);
      if (!desk) return null;
      const rect = computerRect(desk);
      const screenUrl = placed.slug && cards[placed.slug] ? imageOf(placed.slug) : undefined;
      return { rect, art: steampunk ? <AnalyticalEngineArt rect={rect} imageUrl={screenUrl} /> : <ComputerArt rect={rect} imageUrl={screenUrl} /> };
    }
    if (placed.kind === 'small') {
      const hostRect = hostRects.get(placed.hostId);
      const host = room.layout.find((p) => p.id === placed.hostId);
      if (!hostRect || (host?.kind !== 'desk' && host?.kind !== 'shelf')) return null;
      const rect = surfaceSlotRect(hostRect, SURFACE_SLOTS[host.kind], placed.slot);
      return { rect, art: <SmallArt item={placed.item} rect={rect} palette={palette} lit={isLit(placed)} /> };
    }
    if (placed.kind === 'window') {
      const rect = pxRect({ col: placed.col, row: placed.row, w: placed.w, h: placed.h });
      // Le cadre seul : le décor est déjà derrière (calque des vues). La copie soulevée, elle, recopie le décor par `<use>`.
      return {
        rect,
        art: <WindowArt rect={rect} palette={palette} steampunk={steampunk} />,
        liftedArt: <WindowArt rect={rect} palette={palette} steampunk={steampunk} view worldHref={`#${worldId}`} actorsHref={`#${worldId}-actors`} weatherHref={weatherOn ? `#${worldId}-weather` : undefined} weatherGroundHref={weatherOn ? `#${worldId}-weather-ground` : undefined} drops={drops} clipId={`${worldId}-clip-${placed.id}`} />,
      };
    }
    const cells = rectOf(placed);
    if (!cells || !isStanding(placed)) return null;
    const rect = pxRect(cells);
    if (placed.kind === 'globe' || placed.kind === 'telescope' || placed.kind === 'automaton') {
      // Meubles exclusifs Steampunk : une donnée abîmée dans une autre pièce n'est pas dessinée.
      if (!steampunk) return null;
      return { rect, art: <SteampunkArt kind={placed.kind} rect={rect} palette={palette} /> };
    }
    if (placed.kind === 'shelf') return { rect, art: <ShelfArt rect={rect} palette={palette} showSlots={editing} occupied={occupiedSlots.get(placed.id)} /> };
    if (steampunk && (placed.kind === 'desk' || placed.kind === 'armchair' || placed.kind === 'lamp')) {
      return { rect, art: <SteampunkArt kind={placed.kind} rect={rect} palette={palette} lit={isLit(placed)} /> };
    }
    if (placed.kind === 'desk') return { rect, art: <DeskArt rect={rect} palette={palette} /> };
    return { rect, art: <HomeArt kind={placed.kind} rect={rect} palette={palette} lit={isLit(placed)} /> };
  }

  function renderPlaced(placed: Placed): ReactElement | null {
    const drawn = artOf(placed);
    if (!drawn) return null;
    const { rect, art, liftedArt } = drawn;
    // Le meuble soulevé reste en filigrane à sa place ; sa copie, un peu plus grande, suit le doigt.
    // Un ordinateur suit aussi son bureau soulevé.
    const lifted = drag !== null && (drag.id === placed.id || (placed.kind === 'computer' && drag.id === placed.deskId) || (placed.kind === 'small' && drag.id === placed.hostId));
    const liftedCopy = lifted ? liftedCopyOf(rect, liftedArt ?? art, drag.id === placed.id ? rect : (hostRects.get(drag.id) ?? rect)) : null;
    return (
      <g key={placed.id}>
        <g
          data-furniture={placed.kind}
          data-id={placed.id}
          {...(isLamp(placed) && !editing ? {
            role: 'button', tabIndex: 0, 'aria-pressed': isLit(placed), 'aria-label': isLit(placed) ? 'Lampe allumée' : 'Lampe éteinte',
            // Au clavier : Entrée ou Espace bascule la lampe, comme un clic.
            onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onPick(placed.id);
            },
          } : {})}
          onClick={() => onPick(placed.id)}
          onPointerDown={onFurnitureDown ? (event) => onFurnitureDown(placed.id, event) : undefined}
          onPointerMove={onFurnitureMove}
          onPointerUp={onFurnitureUp}
          onPointerLeave={onFurnitureUp}
          onPointerCancel={onFurnitureUp}
          onContextMenu={(event) => event.preventDefault()}
          opacity={lifted ? 0.3 : 1}
          style={{ cursor: editing || isLamp(placed) ? 'pointer' : 'default', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          {art}
          {decor.glow && placed.kind !== 'rug' && neonOutline(rect, decor.glow)}
          {editing && selectedId === placed.id && outline(rect)}
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
        </g>
        {liftedCopy}
      </g>
    );
  }

  // Objet touchable (accroché, rangé ou écran) : mêmes gestes que les meubles, pour pouvoir le déplacer.
  function cardGroup(placed: Placed, slug: string, rect: PxRect, art: ReactElement, extra: Record<string, string> = {}): ReactElement {
    const missing = !cards[slug];
    // L'objet soulevé reste en filigrane à sa place ; sa copie suit le doigt. (L'écran d'un ordinateur suit l'ordinateur, déjà soulevé.)
    // Un objet rangé suit son étagère soulevée.
    const withShelf = drag !== null && placed.kind === 'stored' && drag.id === placed.shelfId;
    const lifted = drag !== null && ((drag.id === placed.id && placed.kind !== 'computer') || withShelf);
    const anchor = withShelf ? (shelfRects.get(drag.id) ?? rect) : rect;
    return (
      <g key={`card-${placed.id}`}>
      <g
        data-card={slug}
        data-id={placed.id}
        data-missing={missing ? 'true' : undefined}
        {...extra}
        onClick={() => onCardTap?.(placed.id)}
        onPointerDown={onFurnitureDown ? (event) => onFurnitureDown(placed.id, event) : undefined}
        onPointerMove={onFurnitureMove}
        onPointerUp={onFurnitureUp}
        onPointerLeave={onFurnitureUp}
        onPointerCancel={onFurnitureUp}
        onContextMenu={(event) => event.preventDefault()}
        opacity={lifted ? 0.3 : missing ? 0.35 : 1}
        style={{ cursor: 'pointer', userSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        {art}
        {editing && selectedId === placed.id && outline(rect)}
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
      </g>
      {lifted && liftedCopyOf(rect, art, anchor)}
      </g>
    );
  }

  const shelfRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (rect && placed.kind === 'shelf') shelfRects.set(placed.id, pxRect(rect));
  }
  // Dessin d'un objet accroché au mur et son rectangle ; `clipKey` nomme ses clipPath (la copie de sélection a les siens).
  function wallArtOf(placed: Extract<Placed, { kind: 'wall' }>, clipKey = placed.id): { rect: PxRect; art: ReactElement } | null {
    const cells = rectOf(placed);
    if (!cells) return null;
    const rect = pxRect(cells);
    const info = cards[placed.slug];
    return { rect, art: <WallArt rect={rect} shape={placed.shape} color={placed.color} title={info?.title ?? ''} imageUrl={imageOf(placed.slug)} missing={!info} id={clipKey} /> };
  }

  // Objet touchable d'un placement : objet accroché, objet rangé, ou écran d'ordinateur (touchable seulement quand une carte y est affichée).
  function cardArtOf(placed: Placed): { slug: string; rect: PxRect; art: ReactElement; extra?: Record<string, string> } | null {
    if (placed.kind === 'wall') {
      const drawn = wallArtOf(placed);
      return drawn && { slug: placed.slug, ...drawn };
    }
    if (placed.kind === 'stored') {
      const shelf = shelfRects.get(placed.shelfId);
      const rect = shelf ? shelfSlots(shelf)[placed.slot] : undefined;
      if (!rect) return null;
      const info = cards[placed.slug];
      return { slug: placed.slug, rect, art: <ShelfItemArt rect={rect} shape={placed.shape} slug={placed.slug} title={info?.title ?? ''} imageUrl={imageOf(placed.slug)} missing={!info} /> };
    }
    if (placed.kind === 'computer' && placed.slug) {
      const desk = deskRects.get(placed.deskId);
      if (!desk) return null;
      const full = computerRect(desk);
      const rect = { x: full.x + 5, y: full.y + 5, w: full.w - 10, h: full.h - 12 - 10 };
      const missing = !cards[placed.slug];
      return { slug: placed.slug, rect, art: missing ? <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="#1D1D22" /> : <g />, extra: { 'data-screen': placed.id } };
    }
    return null;
  }
  function cardOf(placed: Placed): ReactElement | null {
    const drawn = cardArtOf(placed);
    return drawn && cardGroup(placed, drawn.slug, drawn.rect, drawn.art, drawn.extra);
  }

  // Objets portés par chaque meuble, dans l'ordre où ils se dessinent juste après lui :
  // ordinateur, petits objets, objets rangés, puis l'écran de l'ordinateur (zone touchable par-dessus). Un seul passage sur le plan.
  const carried = new Map<string, { computers: Placed[]; smalls: Placed[]; stored: Placed[] }>();
  for (const placed of room.layout) {
    const hostId = placed.kind === 'computer' ? placed.deskId : placed.kind === 'small' ? placed.hostId : placed.kind === 'stored' ? placed.shelfId : null;
    if (hostId === null) continue;
    const entry = carried.get(hostId) ?? { computers: [], smalls: [], stored: [] };
    (placed.kind === 'computer' ? entry.computers : placed.kind === 'small' ? entry.smalls : entry.stored).push(placed);
    carried.set(hostId, entry);
  }
  const carriedOf = (hostId: string): (ReactElement | null)[] => {
    const entry = carried.get(hostId);
    if (!entry) return [];
    return [...entry.computers.map(renderPlaced), ...entry.smalls.map(renderPlaced), ...entry.stored.map(cardOf), ...entry.computers.map(cardOf)];
  };
  // Dessins seuls des objets portés (même ordre), pour la copie de sélection : ni `data-id` ni gestes.
  const carriedArtOf = (hostId: string): ReactElement[] => {
    const entry = carried.get(hostId);
    if (!entry) return [];
    const copy = (placed: Placed, art: ReactElement | undefined, faded = false, tag = ''): ReactElement[] =>
      art ? [<g key={`copy-${tag}${placed.id}`} data-copy-of={placed.id} opacity={faded ? 0.35 : undefined}>{art}</g>] : [];
    const card = (placed: Placed, tag = ''): ReactElement[] => {
      const drawn = cardArtOf(placed);
      return drawn ? copy(placed, drawn.art, !cards[drawn.slug], tag) : [];
    };
    return [
      ...entry.computers.flatMap((p) => copy(p, artOf(p)?.art)),
      ...entry.smalls.flatMap((p) => copy(p, artOf(p)?.art)),
      ...entry.stored.flatMap((p) => card(p)),
      ...entry.computers.flatMap((p) => card(p, 'screen-')),
    ];
  };

  // Ordre de dessin : les tapis en dessous, puis le niveau 0 (fenêtres, objets accrochés), puis les meubles par niveau
  // (1 à 3) et, dans un niveau, du plus loin au plus proche (bas le plus haut d'abord). Chaque meuble est suivi de ses objets portés.
  const rugs = room.layout.filter((p) => isStanding(p) && p.kind === 'rug').map((p) => (
    <g key={`depth-${p.id}`} data-depth={depthOf(room.layout, p)}>{renderPlaced(p)}</g>
  ));
  const wallLevel = (
    <g key="depth-wall" data-depth={0}>
      {windows.map(renderPlaced)}
      {room.layout.map((p) => (p.kind === 'wall' ? cardOf(p) : null))}
    </g>
  );
  // Un groupe par meuble debout (même s'il n'est pas dessiné) : `behind` compte des meubles de `drawOrder`.
  // Ombre de contact : juste avant un meuble, une ombre nette décalée de 5 px, découpée aux seuls objets de niveau inférieur
  // qu'elle touche (fenêtres, objets accrochés, meubles plus au fond). Sans objet derrière, pas d'ombre. Aucun flou (coûteux sur Android).
  const order = drawOrder(room.layout);
  const contactShadow = (p: Placed): ReactElement | null => {
    const cells = rectOf(p);
    if (!cells) return null;
    const r = pxRect(cells);
    const sx = r.x + 5;
    const sy = r.y + 5;
    const mine = depthOf(room.layout, p);
    const behindRects: PxRect[] = [];
    for (const o of room.layout) {
      if (o.id === p.id || !(o.kind === 'window' || o.kind === 'wall' || (isStanding(o) && o.kind !== 'rug' && order.includes(o)))) continue;
      if (depthOf(room.layout, o) >= mine) continue;
      const oc = rectOf(o);
      if (!oc) continue;
      const b = pxRect(oc);
      if (b.x < sx + r.w && b.x + b.w > sx && b.y < sy + r.h && b.y + b.h > sy) behindRects.push(b);
    }
    if (behindRects.length === 0) return null;
    const id = `${worldId}-cs-${p.id}`;
    return (
      <g key={`cs-${p.id}`}>
        <clipPath id={id}>{behindRects.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} />)}</clipPath>
        <rect data-contact-shadow={p.id} x={sx} y={sy} width={r.w} height={r.h} rx={3} fill={palette.text} fillOpacity={0.18} clipPath={`url(#${id})`} style={{ pointerEvents: 'none' }} />
      </g>
    );
  };
  const middle: ReactElement[] = order.map((p) => (
    <g key={`depth-${p.id}`} data-depth={depthOf(room.layout, p)}>
      {contactShadow(p)}
      {renderPlaced(p)}
      {carriedOf(p.id)}
    </g>
  ));
  // À rang égal, l'animal le plus loin (pieds les plus hauts) est inséré en dernier au même indice, donc dessiné en premier.
  // Les chats s'insèrent au rang `behind` parmi les meubles (avec leurs objets portés) dans l'ordre de dessin.
  // Un chat perché sur un bureau ou une étagère (`top`) se dessine après tous les meubles et leurs objets.
  const petNode = (v: PetView): ReactElement => (
    <g key={`pet-${v.id}`} data-pet={v.id} ref={(el) => petAttach?.(v.id, el)} onClick={() => onPetTap?.(v.id)} style={{ cursor: 'pointer', pointerEvents: editing ? 'none' : 'auto' }}>
      <PetSprite species={v.species} coat={v.coat} pose={v.pose} facing={v.facing} name={v.name} still={v.still} />
    </g>
  );
  for (const v of [...pets].filter((p) => !p.top).sort((a, b) => b.behind - a.behind || (b.depthY ?? 0) - (a.depthY ?? 0))) middle.splice(Math.min(v.behind, middle.length), 0, petNode(v));
  const topPets = pets.filter((p) => p.top).map(petNode);
  // Le nom et les cœurs : tout en haut, au-dessus de tout le reste de la pièce.
  const bubbles = pets.filter((p) => p.pose === 'purr' || p.pose === 'beep').map((v) => (
    <g key={`bubble-${v.id}`} data-pet-bubble={v.id} ref={(el) => petAttach?.(`${v.id}${BUBBLE}`, el)}>
      <PetBubble name={v.name} still={v.still} />
    </g>
  ));

  // Objet sélectionné (meuble debout ou objet du mur) : redessiné par-dessus les meubles, avec son contour, pour rester visible
  // même caché par un meuble de devant. Sans `data-id` ni gestes : le toucher passe à travers jusqu'à l'objet lui-même.
  const selected = editing && selectedId ? room.layout.find((p) => p.id === selectedId) : undefined;
  const selectedDrawn = !selected ? null
    : selected.kind === 'wall' ? wallArtOf(selected, `${selected.id}-selected`)
    : selected.kind === 'window' || (isStanding(selected) && selected.kind !== 'rug') ? artOf(selected)
    : null;
  // Un porteur sélectionné (étagère, bureau) emporte ses objets dans la copie : sinon son dessin opaque les cacherait.
  const selectedCopy = selectedDrawn && selected && (
    <g key="selected-copy" data-selected-copy="" pointer-events="none">
      {selectedDrawn.art}
      {carriedArtOf(selected.id)}
      {outline(selectedDrawn.rect)}
    </g>
  );

  const cells: ReactElement[] = [];
  if (editing) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < room.cols; col++) {
        const key = `${col}-${row}`;
        cells.push(
          <rect
            key={key}
            data-cell={key}
            x={col * CELL_W}
            y={row * CELL_H}
            width={CELL_W}
            height={CELL_H}
            fill={blinking.has(key) ? '#E24B4A' : 'transparent'}
            fillOpacity={blinking.has(key) ? 0.45 : 1}
            stroke={palette.text}
            strokeOpacity={0.25}
            strokeWidth={0.5}
            style={{ pointerEvents: cellsActive ? 'all' : 'none' }}
            onClick={cellsActive ? () => onCell(col, row) : undefined}
          />,
        );
      }
    }
  }

  // Élément STABLE (passé à la couche météo mémoïsée) : un re-rendu de la pièce (glissé, clignotement, animaux…) ne refait pas la météo.
  const weatherClock = weatherOn ? view.weather?.clock : undefined;
  const actors = useMemo(
    () => (
      <g id={`${worldId}-actors`} data-window-actors="">
        <FigureContext.Provider value={figures}>
          <ShopContext.Provider value={shops}>
          <CarContext.Provider value={cars}>
          <PropContext.Provider value={propSprites}>
            <SceneActors scene={room.scene} width={width} height={wallH} sky={view.sky} minutes={view.minutes} seed={hashString(room.id)} gloom={gloom} rainy={rainy} city={city} forcedNight={forcedNight} weather={weatherClock} />
          </PropContext.Provider>
          </CarContext.Provider>
          </ShopContext.Provider>
        </FigureContext.Provider>
      </g>
    ),
    [worldId, figures, cars, propSprites, room.scene, room.id, width, wallH, view.sky, view.minutes, gloom, rainy, city, forcedNight, weatherClock],
  );
  // La fenêtre soulevée n'a plus de vue à sa place (sa copie porte la sienne) : seul son cadre estompé reste sur le mur.
  const shownGlasses = glasses.filter((_, i) => windows[i]!.id !== drag?.id);
  const worldRect = outside ? { x: 0, y: 0, w: width, h: wallH } : boundingRect(shownGlasses);
  const gaps = outside ? [] : gapRects(shownGlasses);

  return (
    <svg
      viewBox={outside ? `0 0 ${width} ${wallH}` : `0 0 ${width} ${HEIGHT}`}
      preserveAspectRatio={outside ? 'xMidYMid slice' : undefined}
      data-outside={outside ? '' : undefined}
      role="img"
      aria-label={room.name}
      data-style={room.style}
      style={outside ? { width: '100%', height: '100%', display: 'block' } : { aspectRatio: `${width} / ${HEIGHT}`, width: fill ? `max(100vw, calc(100vh * ${width} / ${HEIGHT}))` : `${(room.cols / VISIBLE_COLS[room.orientation]) * 100}%`, flexShrink: 0, display: 'block', ...(fill ? { alignSelf: 'flex-start' } : {}) }}
    >
      {decor.glow && <NeonDefs />}
      {/* Mur statique (fond + décor steampunk), réutilisé par <use> pour combler les trous entre les vitres. */}
      {showRoom && (
        <g id={`${worldId}-wall`} data-window-wall="" ref={wallRef} style={fadeStyle}>
          <RoomBackdrop style={room.style} width={width} height={HEIGHT} wallH={wallH} />
          {room.style === 'steampunk' && <g data-steampunk-decor=""><SteampunkDecor cols={room.cols} wallH={wallH} /></g>}
        </g>
      )}
      {worldRect && (
        // Le décor vu par les fenêtres, rendu UNE fois en vrais nœuds (plus de copies `<use>` à reconstruire à chaque image),
        // juste après le mur : un meuble du mur ne chevauche jamais une fenêtre. Les cadres sont dessinés par-dessus.
        <>
        {/* Fond de vitre (angles droits, comme avant), sous la vue qui le recouvre. */}
        {showRoom && (
          <g data-window-glass="" style={{ pointerEvents: 'none', ...fadeStyle }}>
            {shownGlasses.map((g, i) => (
              <rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} fill="#9CC4E8" />
            ))}
          </g>
        )}
        {/* Découpé par UN SEUL rectangle (le englobant des vitres) : un masque à plusieurs rectangles ralentit Blink (55 ms contre 8,5 ms
        // mesurés). Les angles arrondis du steampunk sont couverts par le cadre ; les trous entre vitres redessinent le mur ensuite. */}
        <svg data-window-views="" x={worldRect.x} y={worldRect.y} width={worldRect.w} height={worldRect.h} viewBox={`${worldRect.x} ${worldRect.y} ${worldRect.w} ${worldRect.h}`} overflow="hidden" style={{ pointerEvents: 'none' }}>
          {/* Deux groupes dans le même repère : le décor fixe et les acteurs animés. La boucle d'animation ne touche que le second. */}
          <g id={worldId} data-window-view="">
            <ShopContext.Provider value={shops}>
            <PropContext.Provider value={propSprites}>
              <ScenePanoramaStatic scene={room.scene} width={width} height={wallH} sky={view.sky} minutes={view.minutes} seed={hashString(room.id)} gloom={gloom} rainy={rainy} city={city} forcedNight={forcedNight} />
            </PropContext.Provider>
            </ShopContext.Provider>
          </g>
          {/* Météo : deux groupes (sol sous les acteurs, ciel par-dessus) ; seule sa boucle les modifie à chaque image. Sans météo, les acteurs seuls. */}
          {weatherOn && view.weather ? (
            <WeatherLayer scene={room.scene} width={width} height={wallH} seed={hashString(room.id)} sky={view.sky} clock={view.weather.clock} id={`${worldId}-weather`} groundId={`${worldId}-weather-ground`} onWet={setWet} gloom={gloom} between={actors} />
          ) : (
            actors
          )}
          {drops && !outside && shownGlasses.map((g, i) => <GlassDrops key={i} glass={g} />)}
          {outside && <g data-follow-marker="" opacity="0"><path d="M-7 -10 L7 -10 L0 0 Z" fill="#fff" stroke="#222" strokeWidth={2} strokeLinejoin="round" /></g>}
        </svg>
        </>
      )}
      {showRoom && (
      <g data-room-layers="" ref={layersRef} style={fadeStyle}>
      {gaps.map((r, i) => (
        <svg key={i} data-window-gap="" x={r.x} y={r.y} width={r.w} height={r.h} viewBox={`${r.x} ${r.y} ${r.w} ${r.h}`} overflow="hidden" style={{ pointerEvents: 'none' }}>
          <use href={`#${worldId}-wall`} />
        </svg>
      ))}
      {rugs}
      {wallLevel}
      {middle}
      {selectedCopy}
      {topPets}
      {/* Sans fenêtre à ciel (calque « sans ciel ») il n'y a rien à montrer tant qu'aucune lampe n'est allumée : pas de calque à 4 Hz. */}
      {light && ((weatherOn && windows.length > 0) || lightLamps.length > 0) && (
        <LightLayer windows={weatherOn ? glasses : NO_GLASS} width={width} height={HEIGHT} wallH={wallH} sky={view.sky} clock={view.weather?.clock ?? STILL_CLOCK} boxes={lightBoxes} lamps={lightLamps} signature={lightSignature} getPetBoxes={getPetBoxes} />
      )}
      {bubbles}
      {cells}
      {drag?.ghostPx && (
        <rect
          data-drag-ghost={drag.ok ? 'ok' : 'refused'}
          x={drag.ghostPx.x}
          y={drag.ghostPx.y}
          width={drag.ghostPx.w}
          height={drag.ghostPx.h}
          rx={4}
          fill={drag.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={0.25}
          stroke={drag.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {drag?.ghost && (
        <rect
          data-drag-ghost={drag.ok ? 'ok' : 'refused'}
          {...ghostBox(drag.ghost)}
          rx={6}
          fill={drag.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={0.25}
          stroke={drag.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
      </g>
      )}
    </svg>
  );
}
