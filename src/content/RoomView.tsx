import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement } from 'react';
import { isOnBoard, type FurnitureKind, type Placed, type Room, type TimeSetting, type WeatherState } from '../core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, ROWS, VISIBLE_COLS, WALL_ROWS, angleOf, depthOf, floorTopRow, hitRectOf, isLamp, overhangRow, isLit, isStanding, pxRect, rectOf, shelfFreeIn, type BoardItem, type Cell, type PxRect, type Rect, type Standing } from '../core/library/room-grid';
import { drawOrder } from '../core/library/depth-order';
import { drawSize, faceFrame, frontFaceRect, groundTrace, type Angle } from '../core/library/footprint';
import { boxesOf, lampsOf, signatureOf } from '../core/library/light/occluders';
import { decorOf, paletteOf } from '../core/library/styles';
import { boxOfQuad, cardQuad, computerPlacement, hostPointPx, placementDepth, placementRectPx, smallPlacement, storedDrawOrder, storedPlacementsOf } from '../core/library/carried-items';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import { localPointOf, openingOf } from '../core/library/furniture-render3d';
import { bookColor, type ItemPlacement } from '../core/library/item-models';
import { hiddenAtHome, sleeveKindOf, sleeveRest, type SleeveKind } from '../core/library/hifi';
import { SleeveArt, gameDiscKind, hifiContent, type DiscKind, type HifiDiscShow } from './hifi/hifi-art';
import { useHifiPlayer } from './hifi/use-hifi';
import { useTrackTempo } from './hifi/use-track-tempo';
import { MusicNotes, NOTE_INK } from './hifi/music-notes';
import { NeonDefs, RoomBackdrop, neonOutline } from './room-backdrop';
import { boundingRect, gapRects } from './window-gaps';
import { SteampunkDecor } from './room-steampunk-decor';
import { WallArt } from './library-card-art';
import { CarriedItem3D, Model3DArt, type ItemContent, type ModelPart } from './model3d-art';
import { gameBoxContent, gameCoverUrl } from './game-box-content';
import { STEAMPUNK_ONLY } from '../core/library/furniture-catalog';
import { localImage, useCoverCache } from './cover-cache';
import { usableImage, useImageProbe } from './image-probe';
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
import type { PlacingView } from './placement';
import { LiveDecoArt, isTableClock, tableFaceContent, useDecoScene } from './deco-live';

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
  // Réglage d'heure : en heure réelle les horloges lisent la seconde de l'appareil ; sinon l'heure figée de la scène.
  mode?: TimeSetting['mode'];
  // Fuseau de la scène (ville du lieu de la scène) ; absent ou null = appareil. Les horloges décalent depuis lui.
  tz?: string | null;
  weather?: { clock: { read(nowMs: number): Weather }; flags: { gloom: boolean; rainy: boolean } };
  city?: { day: DayContext; forcedNight: boolean; shopNames?: NamePool; busLines?: BusNetwork | null };
  // Ce que montrent les météomètres (état, libellé, température réelle).
  deco?: { state: WeatherState; label: string; tempC: number | null };
};

export type Tool = { type: 'new'; kind: FurnitureKind } | { type: 'move'; id: string } | { type: 'card' } | null;

type Props = {
  room: Room;
  editing: boolean;
  // Les cases captent les touchers (une pose ou un déplacement est en cours) ; sinon ce sont les meubles.
  cellsActive: boolean;
  selectedId: string | null;
  // Bibliothèque liée à celle sélectionnée (Aménager) : même contour, pour voir le lien.
  linkedId?: string | null;
  blink: Cell[];
  onCell: (col: number, row: number) => void;
  onPick: (id: string) => void;
  // Appui long (puis glissé) sur un meuble : le panneau décide de ce que ça déclenche.
  onFurnitureDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
  onFurnitureMove?: (event: PointerEvent<SVGGElement>) => void;
  onFurnitureUp?: () => void;
  // Meuble soulevé : position du doigt dans le repère du dessin, et contour d'arrivée (vert si valide, rouge sinon).
  drag?: DragView | null;
  // Mode placement : l'objet en cours de placement (estompé) et son empreinte (verte si valide, rouge sinon).
  placing?: PlacingView | null;
  // Titre et image des cartes posées dans la pièce, par slug ; un slug absent = carte inconnue (objet grisé).
  cards?: Record<string, { title: string; imageUrl?: string }>;
  // Toucher sur un objet accroché, rangé ou sur l'écran de l'ordinateur.
  onCardTap?: (id: string) => void;
  // Pochette couchée devant la chaîne hi-fi touchée (en visite seulement) : `placedId` est l'objet au poste, `el` le dessin touché.
  onSleeveTap?: (placedId: string, el: Element) => void;
  // Vol du disque vers le poste en cours : le poste ne montre pas encore le disque (le lecteur a déjà basculé) jusqu'à l'atterrissage.
  hideHifiDisc?: boolean;
  // Boîtier au poste ouvert dans la couche : sa pochette couchée est masquée (gardée mesurable : le boîtier y revient en se fermant).
  hideSleeve?: boolean;
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
  // Avec `fill`, pièce ajustée à l'écran : ses colonnes entières ne tombent jamais pile sur le rapport de l'écran (quelques pixels
  // de trop, qui défilaient) ; le dessin est étiré à l'écran exact, soit moins d'une demi-colonne d'écart (≈ 1 %, invisible).
  fitScreen?: boolean;
  // Plein écran sur un écran en hauteur : le dessin prend toute cette hauteur (CSS) et défile en largeur, sans bandes noires.
  fillHeight?: string;
  // Vue « dehors » : le monde (largeur de la pièce × hauteur du mur) couvre tout le dessin, même sans fenêtre. Le viewBox passé à React
  // reste constant ; le hook de caméra l'écrit ensuite directement dans le DOM. Un repère de suivi (invisible) est rendu en dernier dans le monde.
  outside?: boolean;
  // Couches de la pièce (mur, vitres, meubles, animaux, lumière…) : 'hidden' les estompe (400 ms) puis les retire ; le nœud du monde, lui, reste.
  roomLayers?: 'shown' | 'hidden';
};

// Ce qui est posé sur le poste : un vinyle, une cartouche (jeu à cartouche, couchée), un disque de jeu ou un CD.
function hifiDiscKindOf(placed: Placed, sleeve: SleeveKind): DiscKind {
  if (sleeve === 'vinyl') return 'vinyl';
  if (sleeve !== 'game') return 'cd';
  return gameDiscKind(placed.kind === 'stored' ? placed.box : undefined);
}

// Matrice du repère d'une face (footprint.faceFrame) en attribut SVG.
const matrixOf = (m: readonly number[]): string => `matrix(${m.join(' ')})`;
// Points d'un polygone (px au dixième).
const pointsOf = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ');

// Porteur (bureau ou étagère) d'objets : son type, son angle et son rectangle.
type Host = { kind: 'desk' | 'shelf'; angle: Angle; rect: PxRect };
// Pose 3D d'un écran ou d'un petit objet sur le dessus de son porteur.
function topPlacementIn(hosts: ReadonlyMap<string, Host>, placed: Placed): { host: Host; pl: ItemPlacement } | null {
  if (placed.kind === 'computer') {
    const host = hosts.get(placed.deskId);
    return host?.kind === 'desk' ? { host, pl: computerPlacement(placed.id) } : null;
  }
  if (placed.kind !== 'small' || isOnBoard(placed)) return null;
  const host = hosts.get(placed.hostId);
  return host ? { host, pl: smallPlacement(placed.id, placed.item, host.kind, placed.x, placed.z) } : null;
}
// `stored` : objets des tablettes (cartes rangées et petits objets de tablette), dessinés dans l'ouverture de l'étagère.
type Carried = { tops: Placed[]; stored: BoardItem[]; computers: Placed[] };

export type DragView = { id: string; x: number; y: number; ok: boolean; ghost: Rect | null; ghostPx?: PxRect & { quad?: [number, number][] }; floor?: Cell[] };

function ghostBox(rect: Rect): { x: number; y: number; width: number; height: number } {
  const px = pxRect(rect);
  return { x: px.x, y: px.y, width: px.w, height: px.h };
}

export function RoomView({ room, editing, cellsActive, selectedId, linkedId = null, blink, onCell, onPick, onFurnitureDown, onFurnitureMove, onFurnitureUp, drag = null, placing = null, cards = {}, onCardTap, onSleeveTap, hideHifiDisc = false, hideSleeve = false, sceneView, pets = [], petAttach, onPetTap, petFrames, light = false, fill = false, fitScreen = false, fillHeight, outside = false, roomLayers = 'shown' }: Props) {
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
  // Une image qui ne se charge pas : la pièce se redessine sans elle.
  useImageProbe();
  // Une pochette arrivée sur l'appareil : la pièce la dessine depuis là.
  useCoverCache();
  const width = room.cols * CELL_W;
  const wallH = WALL_ROWS * CELL_H;
  const worldId = `${useId()}-world`.replace(/:/g, '');
  // Cache des sprites du pantin (Ghibli) : un par pièce ; les figures sont des <image>, rien n'est hébergé dans le DOM.
  // Plafond : la rue Ghibli des commerces (gestes des employés et des clients, G4b) dépasse 1 500 poses en vue à midi ; au-delà
  // le cache tournerait et repeindrait sans cesse. Budget de peinture par image : le défaut (spec G4b §7).
  // Habitants 3D : vue zoomable, donc rendu 3D à 6 px par unité (net de près) et visages animés (émotion du geste, clignement).
  const figures = useMemo(() => new FigureRegistry(`${worldId}-fig`, { max: FIGURE_SPRITES_MAX, pxPerUnit: 6, faces: true }), [worldId]);
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
  // Objets décoratifs (`deco`, réveil, pendulette, station) : une scène stable, calculée seulement si la pièce en contient. La seconde
  // n'est pas lue ici : chaque horloge s'abonne elle-même à la seconde partagée, la pièce n'est pas redessinée à chaque seconde.
  const hasDeco = room.layout.some((p) => p.kind === 'deco' || (p.kind === 'small' && isTableClock(p.item)));
  const decoScene = useDecoScene(view, editing, hasDeco);
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
  // Chaîne hi-fi : l'objet dont le disque est au poste (déduit du lecteur) quitte sa place d'origine ; son disque tourne sur le poste
  // et sa pochette est couchée devant.
  const { state: hifi, player } = useHifiPlayer(room.layout);
  const awayFromHome = useMemo(() => hiddenAtHome(hifi), [hifi]);
  // L'objet parti au poste n'arrête plus la lumière à sa place d'origine.
  const lightLayout = useMemo(
    () => (awayFromHome.size === 0 ? room.layout : room.layout.filter((p) => !awayFromHome.has(p.id))),
    [room.layout, awayFromHome],
  );
  const lightBoxes = useMemo(() => boxesOf(lightLayout, lightGeom), [lightLayout, wallH]); // eslint-disable-line react-hooks/exhaustive-deps
  const lightLamps = useMemo(() => lampsOf(room.layout, lightGeom), [room.layout, wallH]); // eslint-disable-line react-hooks/exhaustive-deps
  const lightSignature = useMemo(() => signatureOf(lightBoxes, lightLamps), [lightBoxes, lightLamps]);
  // Identité stable (sinon le calque serait relancé à chaque rendu) : la disposition est lue par référence.
  const layoutRef = useRef(room.layout);
  layoutRef.current = room.layout;
  const getPetBoxes = useMemo(
    () => (petFrames ? () => petBoxesOf(petFrames(), layoutRef.current, lightGeom) : undefined),
    [petFrames, wallH], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const blinking = new Set(blink.map((c) => `${c.col}-${c.row}`));

  // Bureaux et étagères : ils portent les objets (calculés une fois par disposition).
  const hosts = useMemo(() => {
    const out = new Map<string, Host>();
    for (const placed of room.layout) {
      const rect = rectOf(placed);
      if (rect && (placed.kind === 'desk' || placed.kind === 'shelf')) out.set(placed.id, { kind: placed.kind, angle: angleOf(placed), rect: pxRect(rect) });
    }
    return out;
  }, [room.layout]);
  // Image d'une carte : celles qui ne se chargent pas sont sautées (couverture titrée à défaut) ; un jeu à boîte connue montre
  // sa jaquette, la même que sur la boîte ouverte.
  const imageOf = (slug: string): string | undefined => {
    const url = cards[slug]?.imageUrl;
    const own = images ? images.displayUrl(slug, url, usableImage) : url && usableImage(url) ? url : undefined;
    return localImage(gameCoverUrl('game', slug, own));
  };
  const atHifi = hifi.atHifi !== null ? (room.layout.find((p) => p.id === hifi.atHifi) ?? null) : null;
  const atHifiSlug = atHifi && 'slug' in atHifi ? atHifi.slug : null;
  const sleeveKind = atHifi ? sleeveKindOf(atHifi) : null;
  const hifiDisc: HifiDiscShow | null = atHifiSlug && sleeveKind
    ? { kind: hifiDiscKindOf(atHifi!, sleeveKind), cover: imageOf(atHifiSlug) ?? null, color: bookColor(atHifiSlug) }
    : null;
  const trackTitle = player.track ? (player.track.artist ? `${player.track.title} — ${player.track.artist}` : player.track.title) : null;
  // Pose 3D de chaque objet rangé dans le repère de son étagère (rangement par largeur réelle), calculée une fois par disposition.
  const storedPlaces = useMemo(() => {
    const out = new Map<string, ItemPlacement>();
    for (const placed of room.layout) if (placed.kind === 'shelf') for (const [id, pl] of storedPlacementsOf(room.layout, placed.id)) out.set(id, pl);
    return out;
  }, [room.layout]);
  const hostOf = (hostId: string): Host | null => hosts.get(hostId) ?? null;
  const topPlacement = (placed: Placed) => topPlacementIn(hosts, placed);
  // Notes de musique : au-dessus du haut du poste qui sert, tant que son disque tourne. Pas en Aménager (le poste y est un meuble à
  // déplacer), ni pendant le vol du disque, ni quand la pièce s'efface ou que le bureau est soulevé.
  const station = hifi.hifiId !== null ? (room.layout.find((p) => p.id === hifi.hifiId) ?? null) : null;
  const stationAt = station ? topPlacement(station) : null;
  const stationRect = stationAt ? placementRectPx(stationAt.host.kind, stationAt.host.angle, stationAt.host.rect, stationAt.pl, steampunk) : null;
  const notesOn = hifi.spinning && !editing && !hideHifiDisc && roomLayers === 'shown' && drag === null && placing === null;
  // Tempo de la piste en cours : lu et mesuré seulement tant que les notes sont visibles.
  const trackBpm = useTrackTempo(notesOn);
  const outline = (rect: PxRect, kind: 'selected' | 'linked' = 'selected') => (
    <rect data-outline={kind} x={rect.x - 3} y={rect.y - 3} width={rect.w + 6} height={rect.h + 6} rx={6} fill="none" stroke="#378ADD" strokeWidth={2.5} strokeDasharray="6 4" />
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
  // `part` : pour un meuble à socle (lampadaire arc), seulement le socle et la tige ('base') ou seulement l'arc et le dôme ('overhang').
  function artOf(placed: Placed, part?: ModelPart): { rect: PxRect; art: ReactElement; liftedArt?: ReactElement } | null {
    if (placed.kind === 'computer' || placed.kind === 'small') {
      // Écran (machine analytique dans une pièce Steampunk) ou petit objet : modèle 3D posé sur le dessus du porteur tourné, avec lui
      // (de dos, l'écran montre son dos, sans image). Son rectangle (zone touchable, contour) est celui de son dessin : l'écran dépasse du bureau.
      // Petit objet de tablette : posé sur sa planche d'après ses voisins (même rangement que les cartes) ; étagère de profil ou de dos : caché.
      const at = placed.kind === 'small' && isOnBoard(placed)
        ? (() => {
          const host = hostOf(placed.hostId);
          const pl = storedPlaces.get(placed.id);
          return host && pl && openingOf(FURNITURE_MODELS.shelf, host.angle) ? { host, pl } : null;
        })()
        : topPlacement(placed);
      if (!at) return null;
      const { host, pl } = at;
      const rect = placementRectPx(host.kind, host.angle, host.rect, pl, steampunk);
      let content: ItemContent;
      if (placed.kind === 'computer') content = { url: placed.slug && cards[placed.slug] ? imageOf(placed.slug) : undefined };
      // Face décorée (heure, météo) : elle relit elle-même la seconde, le modèle 3D n'est pas redessiné à chaque seconde.
      else if (isTableClock(placed.item) && decoScene) content = tableFaceContent(placed.item, placed.city, room.style, decoScene);
      // Seul le poste qui sert (le premier posé) montre la lecture.
      else if (placed.item === 'hifi') {
        const active = placed.id === hifi.hifiId;
        content = hifiContent({ disc: active && !hideHifiDisc ? hifiDisc : null, spinning: active && hifi.spinning, title: active ? trackTitle : null, playing: active && player.track?.playing === true });
      } else content = { lit: isLit(placed) };
      return { rect, art: <CarriedItem3D host={host.kind} angle={host.angle} rect={host.rect} placement={pl} palette={palette} steampunk={steampunk} content={content} /> };
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
    if (placed.kind === 'deco') {
      if (!decoScene) return null;
      const rect = pxRect(rectOf(placed)!);
      return { rect, art: <LiveDecoArt placed={placed} rect={rect} style={room.style} palette={palette} scene={decoScene} /> };
    }
    const cells = rectOf(placed);
    if (!cells || !isStanding(placed)) return null;
    const rect = pxRect(cells);
    // Meubles exclusifs Steampunk : une donnée abîmée dans une autre pièce n'est pas dessinée.
    if (!steampunk && STEAMPUNK_ONLY.includes(placed.kind)) return null;
    // Tous les meubles debout, à tous les angles : leur modèle 3D (garnitures laiton et rivets dans une pièce Steampunk).
    const model = <Model3DArt kind={placed.kind} angle={angleOf(placed)} rect={rect} palette={palette} lit={isLit(placed)} steampunk={steampunk} part={part} />;
    if (placed.kind !== 'shelf' || !editing) return { rect, art: model };
    // Étagère en Aménager : l'espace libre de chaque tablette en pointillés, sur la face projetée (de profil ou de dos : aucun).
    const frame = faceFrame('shelf', angleOf(placed), rect);
    return {
      rect,
      art: (
        <g>
          {model}
          {frame && shelfFreeIn(frame, room.layout, placed.id).map(({ level, local }) => (
            <g key={level} transform={matrixOf(frame.m)}>
              <rect data-shelf-free={level} x={local.x} y={local.y} width={local.w} height={local.h} rx={2} fill="none" stroke={palette.text} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      ),
    };
  }

  // `after` : reçoit la copie soulevée et le contour de sélection au lieu de les garder dans le groupe (petit objet de tablette : son groupe
  // est découpé à l'ouverture de l'étagère, la copie qui suit le doigt et le contour ne doivent pas l'être).
  function renderPlaced(placed: Placed, part?: ModelPart, after?: ReactElement[]): ReactElement | null {
    const drawn = artOf(placed, part);
    if (!drawn) return null;
    const { rect, art, liftedArt } = drawn;
    // Le meuble soulevé reste en filigrane à sa place ; sa copie, un peu plus grande, suit le doigt.
    // Un ordinateur suit aussi son bureau soulevé.
    const lifted = drag !== null && (drag.id === placed.id || (placed.kind === 'computer' && drag.id === placed.deskId) || (placed.kind === 'small' && drag.id === placed.hostId));
    const liftedCopy = lifted ? liftedCopyOf(rect, liftedArt ?? art, drag.id === placed.id ? rect : (hosts.get(drag.id)?.rect ?? rect)) : null;
    const selection = editing && selectedId === placed.id ? outline(rect) : null;
    if (after) {
      if (selection) after.push(<g key={`sel-${placed.id}`} pointerEvents="none">{selection}</g>);
      if (liftedCopy) after.push(<g key={`lift-${placed.id}`}>{liftedCopy}</g>);
    }
    return (
      <g key={placed.id}>
        <g
          data-furniture={placed.kind}
          data-id={placed.id}
          data-angle={isStanding(placed) && angleOf(placed) !== 0 ? angleOf(placed) : undefined}
          data-hifi={placed.id === hifi.hifiId ? (hifi.spinning ? 'spinning' : hifi.atHifi !== null ? 'paused' : 'empty') : undefined}
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
          data-placing={placing?.id === placed.id ? (placing.ok ? 'ok' : 'refused') : undefined}
          opacity={lifted ? 0.3 : placing?.id === placed.id ? 0.8 : 1}
          style={{ cursor: editing || isLamp(placed) ? 'pointer' : 'default', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          {art}
          {decor.glow && placed.kind !== 'rug' && neonOutline(rect, decor.glow)}
          {!after && selection}
          {editing && linkedId === placed.id && outline(rect, 'linked')}
          {(() => {
            const hit = isStanding(placed) ? hitRectOf(placed) : rect;
            return <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />;
          })()}
        </g>
        {!after && liftedCopy}
      </g>
    );
  }

  // Objet touchable (accroché, rangé ou écran) : mêmes gestes que les meubles, pour pouvoir le déplacer.
  // `quad` : zone touchable exacte (objet rangé : sa face avant, en parallélogramme de ¾ ; écran : sa vitre) au lieu du rectangle.
  // `after` : reçoit la copie soulevée et le contour de sélection au lieu de les garder dans le groupe (objets rangés : leur groupe est
  // découpé à l'ouverture de l'étagère, la copie qui suit le doigt et le contour ne doivent pas l'être).
  function cardGroup(placed: Placed, slug: string, rect: PxRect, art: ReactElement, extra: Record<string, string> = {}, quad?: [number, number][], after?: ReactElement[]): ReactElement {
    const missing = !cards[slug];
    // L'objet soulevé reste en filigrane à sa place ; sa copie suit le doigt. (L'écran d'un ordinateur suit l'ordinateur, déjà soulevé.)
    // Un objet rangé suit son étagère soulevée.
    const withShelf = drag !== null && placed.kind === 'stored' && drag.id === placed.shelfId;
    const lifted = drag !== null && ((drag.id === placed.id && placed.kind !== 'computer') || withShelf);
    const anchor = withShelf ? (shelfRects.get(drag.id) ?? rect) : rect;
    const selection = editing && selectedId === placed.id ? outline(rect) : null;
    const copy = lifted ? liftedCopyOf(rect, art, anchor) : null;
    if (after) {
      if (selection) after.push(<g key={`sel-${placed.id}`} pointerEvents="none">{selection}</g>);
      if (copy) after.push(<g key={`lift-${placed.id}`}>{copy}</g>);
    }
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
        data-placing={placing?.id === placed.id ? (placing.ok ? 'ok' : 'refused') : undefined}
        opacity={lifted ? 0.3 : placing?.id === placed.id ? 0.8 : missing ? 0.35 : 1}
        style={{ cursor: 'pointer', userSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        {art}
        {!after && selection}
        {quad ? <polygon points={pointsOf(quad)} fill="transparent" /> : <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />}
      </g>
      {!after && copy}
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
  function cardArtOf(placed: Placed): { slug: string; rect: PxRect; art: ReactElement; extra?: Record<string, string>; quad?: [number, number][] } | null {
    // Objet dont le disque est au poste : sa place d'origine reste vide.
    if (awayFromHome.has(placed.id)) return null;
    if (placed.kind === 'wall') {
      const drawn = wallArtOf(placed);
      return drawn && { slug: placed.slug, ...drawn };
    }
    if (placed.kind === 'stored') {
      // Étagère de profil ou de dos : ouverture cachée, objets non dessinés.
      const host = hostOf(placed.shelfId);
      const pl = storedPlaces.get(placed.id);
      if (!host || !pl || !openingOf(FURNITURE_MODELS.shelf, host.angle)) return null;
      const info = cards[placed.slug];
      // Vraie boîte posée sur sa tablette, tournée avec l'étagère : image de la carte sur la couverture, titre sur la tranche.
      const url = info ? imageOf(placed.slug) : undefined;
      const art = <CarriedItem3D host="shelf" angle={host.angle} rect={host.rect} placement={pl} palette={palette} content={info ? { url, title: info.title, ...gameBoxContent(placed.shape, placed.slug, url) } : undefined} />;
      const quad = cardQuad(placed, host.angle, host.rect, pl)!;
      return { slug: placed.slug, rect: boxOfQuad(quad), art, quad };
    }
    if (placed.kind === 'computer' && placed.slug) {
      // Écran de dos ou de profil : sa carte n'est ni visible ni touchable.
      const at = topPlacement(placed);
      if (!at || !frontFaceRect(at.host.angle, at.host.rect, 'desk')) return null;
      const quad = cardQuad(placed, at.host.angle, at.host.rect, at.pl, steampunk)!;
      const missing = !cards[placed.slug];
      return { slug: placed.slug, rect: boxOfQuad(quad), art: missing ? <polygon points={pointsOf(quad)} fill="#1D1D22" /> : <g />, extra: { 'data-screen': placed.id }, quad };
    }
    return null;
  }
  function cardOf(placed: Placed, after?: ReactElement[]): ReactElement | null {
    const drawn = cardArtOf(placed);
    return drawn && cardGroup(placed, drawn.slug, drawn.rect, drawn.art, drawn.extra, drawn.quad, after);
  }

  // Objets portés par chaque meuble, dans l'ordre où ils se dessinent juste après lui : objets rangés (dans l'étagère), puis écran et
  // petits objets du dessus du plus loin au plus proche, puis la carte de l'écran (zone touchable par-dessus). Un seul passage sur le plan.
  // Calculés une fois par disposition (tri par profondeur compris) : un re-rendu de la pièce ne les refait pas.
  const carried = useMemo(() => {
    const out = new Map<string, Carried>();
    for (const placed of room.layout) {
      const hostId = placed.kind === 'computer' ? placed.deskId : placed.kind === 'small' ? placed.hostId : placed.kind === 'stored' ? placed.shelfId : null;
      if (hostId === null) continue;
      const entry = out.get(hostId) ?? { tops: [], stored: [], computers: [] };
      if (placed.kind === 'stored' || (placed.kind === 'small' && isOnBoard(placed))) entry.stored.push(placed);
      else entry.tops.push(placed);
      if (placed.kind === 'computer') entry.computers.push(placed);
      out.set(hostId, entry);
    }
    for (const [hostId, entry] of out) {
      const host = hosts.get(hostId);
      if (!host) continue;
      // Sur le dessus : du plus loin au plus proche (de dos, l'écran passe devant) ; à égalité, l'ordre du plan.
      if (entry.tops.length > 1) {
        const depthOfTop = (p: Placed): number => {
          const at = topPlacementIn(hosts, p);
          return at ? placementDepth(host.kind, host.angle, at.pl, steampunk) : 0;
        };
        const depth = new Map(entry.tops.map((p) => [p.id, depthOfTop(p)]));
        entry.tops.sort((x, y) => depth.get(y.id)! - depth.get(x.id)!);
      }
      entry.stored = storedDrawOrder(entry.stored, host.angle);
    }
    return out;
  }, [room.layout, hosts, steampunk]);
  // Groupe des objets rangés d'une étagère, découpé à son ouverture avant projetée (px de la pièce) : une seule découpe par étagère.
  // `tag` distingue la copie de sélection (ses identifiants de découpe).
  const storedClip = (hostId: string, tag: string, nodes: (ReactElement | null)[]): ReactElement | null => {
    const host = hostOf(hostId);
    const opening = host ? openingOf(FURNITURE_MODELS.shelf, host.angle) : null;
    if (!host || !opening || nodes.every((n) => n === null)) return null;
    const { w, h } = drawSize('shelf', host.angle);
    const points = pointsOf(opening.map(([x, y]) => [host.rect.x + (x * host.rect.w) / (w * CELL_W), host.rect.y + (y * host.rect.h) / (h * CELL_H)]));
    const id = `${worldId}-open-${tag}${hostId}`;
    return (
      <g key={`stored-${tag}${hostId}`}>
        <clipPath id={id}><polygon points={points} /></clipPath>
        <g data-shelf-items={hostId} clipPath={`url(#${id})`}>{nodes}</g>
      </g>
    );
  };
  // Pochette de l'album au poste, couchée devant lui sur le bureau, et sa profondeur (pour la ranger parmi les objets du dessus).
  // La toucher rouvre l'album, comme à sa place d'origine.
  const sleeveOn = (hostId: string): { depth: number; node: ReactElement } | null => {
    const station = hifi.hifiId !== null ? room.layout.find((p) => p.id === hifi.hifiId) : undefined;
    if (!station || station.kind !== 'small' || station.hostId !== hostId || !atHifi || !atHifiSlug || !sleeveKind) return null;
    const at = topPlacement(station);
    if (!at || at.host.kind !== 'desk') return null;
    const { host } = at;
    const rest = sleeveRest(at.pl, sleeveKind);
    const px = (p: [number, number, number]) => hostPointPx('desk', host.angle, host.rect, p);
    const mid = rest.bottom.reduce<[number, number, number]>((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
    const node = (
      <g key={`sleeve-${atHifi.id}`} data-hifi-sleeve={atHifiSlug} data-sleeve-of={atHifi.id}
        // En Aménager, la pochette laisse passer les gestes vers le bureau (le soulever, l'appui long).
        {...(editing || hideSleeve ? { pointerEvents: 'none' } : { onClick: (event: MouseEvent<SVGGElement>) => onSleeveTap?.(atHifi.id, event.currentTarget) })}
        opacity={hideSleeve ? 0 : drag?.id === hostId ? 0.3 : undefined} style={{ cursor: editing ? 'default' : 'pointer', userSelect: 'none', WebkitTouchCallout: 'none' }}>
        <SleeveArt top={rest.top.map(px)} bottom={rest.bottom.map(px)} w={rest.w} d={rest.d} kind={sleeveKind} cover={imageOf(atHifiSlug) ?? null} color={bookColor(atHifiSlug)} title={cards[atHifiSlug]?.title ?? ''} />
      </g>
    );
    return { depth: localPointOf(FURNITURE_MODELS.desk, host.angle, mid).z, node };
  };
  const carriedOf = (hostId: string): (ReactElement | null)[] => {
    const entry = carried.get(hostId);
    if (!entry) return [];
    const after: ReactElement[] = [];
    const stored = storedClip(hostId, '', entry.stored.map((p) => (p.kind === 'stored' ? cardOf(p, after) : renderPlaced(p, undefined, after))));
    const tops: (ReactElement | null)[] = entry.tops.map((p) => renderPlaced(p));
    const sleeve = sleeveOn(hostId);
    if (sleeve) {
      // Objets du dessus triés du plus loin au plus proche : la pochette passe avant le premier plus proche qu'elle.
      const host = hosts.get(hostId)!;
      const i = entry.tops.findIndex((p) => {
        const at = topPlacement(p);
        return at !== null && placementDepth(host.kind, host.angle, at.pl, steampunk) < sleeve.depth;
      });
      tops.splice(i < 0 ? tops.length : i, 0, sleeve.node);
    }
    return [stored, ...after, ...tops, ...entry.computers.map((p) => cardOf(p))];
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
    const stored = storedClip(hostId, 'copy-', entry.stored.flatMap((p) => (p.kind === 'stored' ? card(p) : copy(p, artOf(p)?.art))));
    return [
      ...(stored ? [stored] : []),
      ...entry.tops.flatMap((p) => copy(p, artOf(p)?.art)),
      ...entry.computers.flatMap((p) => card(p, 'screen-')),
    ];
  };

  // Ordre de dessin : les tapis en dessous, puis le niveau 0 (fenêtres, objets accrochés), puis les meubles du plus loin au plus
  // proche (bas le plus haut d'abord, le niveau ne départageant que des pieds sur la même ligne). Chaque meuble est suivi de ses objets portés.
  const rugs = room.layout.filter((p) => isStanding(p) && p.kind === 'rug').map((p) => (
    <g key={`depth-${p.id}`} data-depth={depthOf(room.layout, p)}>{renderPlaced(p)}</g>
  ));
  const wallLevel = (
    <g key="depth-wall" data-depth={0}>
      {windows.map((p) => renderPlaced(p))}
      {room.layout.map((p) => (p.kind === 'deco' ? renderPlaced(p) : null))}
      {room.layout.map((p) => (p.kind === 'wall' ? cardOf(p) : null))}
    </g>
  );
  // Un groupe par meuble debout (même s'il n'est pas dessiné) : `behind` compte des meubles de `drawOrder`.
  // Ombre au sol : juste avant un meuble, la trace de sa base tournée (modèle 3D) posée sur le sol, un peu décalée vers la droite
  // et le bas, en aplat translucide sans trait. Aucun flou (coûteux sur Android) ; le tapis, au sol, n'en a pas.
  const order = drawOrder(room.layout);
  const groundShadow = (p: Standing): ReactElement | null => {
    const cells = rectOf(p);
    if (!cells || (!steampunk && STEAMPUNK_ONLY.includes(p.kind))) return null;
    const pts = groundTrace(p.kind, angleOf(p), pxRect(cells)).map(([x, y]) => `${Math.round((x + 4) * 10) / 10},${Math.round((y + 3) * 10) / 10}`).join(' ');
    return <polygon key={`gs-${p.id}`} data-ground-shadow={p.id} points={pts} fill="#1B1B24" fillOpacity={0.16} style={{ pointerEvents: 'none' }} />;
  };
  const middle: ReactElement[] = order.map((p) => (
    <g key={`depth-${p.id}`} data-depth={depthOf(room.layout, p)}>
      {groundShadow(p)}
      {renderPlaced(p, overhangRow(p) !== null ? 'base' : undefined)}
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
  // Surplomb d'un meuble à socle (arc et dôme du lampadaire arc) : rangé à part, juste après le dernier meuble dont l'emprise au sol
  // commence sur la rangée sous le dôme ou derrière elle (le dôme le surplombe ou est devant lui) ; un meuble entièrement devant le dôme
  // reste dessiné après lui. Touchable comme le meuble.
  for (const p of order) {
    const row = overhangRow(p);
    if (row === null) continue;
    const drawn = artOf(p, 'overhang');
    if (!drawn) continue;
    const node = (
      <g key={`over-${p.id}`} data-overhang={p.id} onClick={() => onPick(p.id)} opacity={drag?.id === p.id ? 0.3 : placing?.id === p.id ? 0.8 : 1} style={{ cursor: editing || isLamp(p) ? 'pointer' : 'default' }}>
        {drawn.art}
      </g>
    );
    let at = -1;
    middle.forEach((el, i) => {
      const q = order.find((o) => `depth-${o.id}` === el.key);
      if (q && floorTopRow(q) <= row) at = i;
    });
    middle.splice(at + 1, 0, node);
  }
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
    : selected.kind === 'window' || selected.kind === 'deco' || (isStanding(selected) && selected.kind !== 'rug') ? artOf(selected)
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

  // Empreinte d'arrivée : celle du glissé, sinon celle du placement en cours.
  const ghostView = drag ?? placing;
  return (
    <svg
      viewBox={outside ? `0 0 ${width} ${wallH}` : `0 0 ${width} ${HEIGHT}`}
      preserveAspectRatio={outside ? 'xMidYMid slice' : fill && fitScreen ? 'none' : undefined}
      data-outside={outside ? '' : undefined}
      role="img"
      aria-label={room.name}
      data-style={room.style}
      style={outside ? { width: '100%', height: '100%', display: 'block' } : fill && fitScreen ? { width: '100vw', height: '100vh', flexShrink: 0, display: 'block', alignSelf: 'flex-start' } : { aspectRatio: `${width} / ${HEIGHT}`, width: fill ? `max(100vw, calc(100vh * ${width} / ${HEIGHT}))` : fillHeight ? `calc(${fillHeight} * ${width} / ${HEIGHT})` : `${(room.cols / VISIBLE_COLS[room.orientation]) * 100}%`, flexShrink: 0, display: 'block', ...(fill ? { alignSelf: 'flex-start' } : {}) }}
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
      {/* Monté tant que le poste existe : à l'éjection ou à la pause, les notes en vol finissent leur course. */}
      {stationRect && (
        <MusicNotes anchor={{ x: stationRect.x, y: stationRect.y, w: stationRect.w }} active={notesOn} accent={hifiDisc?.color ?? NOTE_INK} reduced={still} bpm={trackBpm} />
      )}
      {/* Sans fenêtre à ciel (calque « sans ciel ») il n'y a rien à montrer tant qu'aucune lampe n'est allumée : pas de calque à 4 Hz. */}
      {light && ((weatherOn && windows.length > 0) || lightLamps.length > 0) && (
        <LightLayer windows={weatherOn ? glasses : NO_GLASS} width={width} height={HEIGHT} wallH={wallH} sky={view.sky} clock={view.weather?.clock ?? STILL_CLOCK} boxes={lightBoxes} lamps={lightLamps} signature={lightSignature} getPetBoxes={getPetBoxes} />
      )}
      {bubbles}
      {cells}
      {/* Emplacement d'étagère visé : son parallélogramme (face inclinée en ¾) ; sinon le rectangle. */}
      {ghostView?.ghostPx?.quad ? (
        <polygon
          data-drag-ghost={ghostView.ok ? 'ok' : 'refused'}
          points={ghostView.ghostPx.quad.map(([x, y]) => `${x},${y}`).join(' ')}
          fill={ghostView.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={0.25}
          stroke={ghostView.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      ) : ghostView?.ghostPx && (
        <rect
          data-drag-ghost={ghostView.ok ? 'ok' : 'refused'}
          x={ghostView.ghostPx.x}
          y={ghostView.ghostPx.y}
          width={ghostView.ghostPx.w}
          height={ghostView.ghostPx.h}
          rx={4}
          fill={ghostView.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={0.25}
          stroke={ghostView.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* Cases au sol réellement occupées par le meuble (tourné) : elles portent la couleur, le contour s'efface. */}
      {ghostView?.floor?.map((c) => (
        <rect key={`floor-${c.col}-${c.row}`} data-floor-cell={ghostView.ok ? 'ok' : 'refused'} x={c.col * CELL_W + 1} y={c.row * CELL_H + 1} width={CELL_W - 2} height={CELL_H - 2} rx={3}
          fill={ghostView.ok ? '#3BB273' : '#E24B4A'} fillOpacity={0.35} style={{ pointerEvents: 'none' }} />
      ))}
      {ghostView?.ghost && (
        <rect
          data-drag-ghost={ghostView.ok ? 'ok' : 'refused'}
          {...ghostBox(ghostView.ghost)}
          rx={6}
          fill={ghostView.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={ghostView.floor ? 0.08 : 0.25}
          stroke={ghostView.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
      </g>
      )}
    </svg>
  );
}
