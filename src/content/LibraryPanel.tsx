import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  activeRoom,
  adoptPet,
  MAX_PET_NAME,
  MAX_PETS,
  removePet,
  renamePet,
  createInitialState,
  addRoom,
  countExclusive,
  setRoomStyle,
  deleteRoom,
  extendRoom,
  nextFurnitureId,
  renameRoom,
  setActive,
  setHome,
  setOrientation,
  setPetPlan,
  setRoomScene,
  setTimeSetting,
  setWeatherSetting,
  shrinkRoom,
  updateLayout,
} from '../core/library/library-book';
import { categoriesFor, STEAMPUNK_ONLY, SMALL_ITEM_OF, isSmallKind, isStandingKind, labelOf, sizeOf, wallSizeOf, WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, type Category } from '../core/library/furniture-catalog';
import { SCENE_IDS, STYLE_IDS, coatsOf, type Coat, type Pet, type SceneId, type Species, type TimeSetting, type WeatherSetting, type WeatherState, WEATHER_STATES, type FurnitureKind, type Layout, type LibraryState, type Orientation, type PetPlan, type StandingKind, type StyleId } from '../core/library/library-types';
import type { LibraryRepo } from '../core/library/library-repo';
import { COAT_LABELS, paletteOf as coatPaletteOf } from './pet-sprite';
import { DOG_COAT_LABELS } from './dog-sprite';
import { ROBOT_COAT_LABELS } from './robot-sprite';
import {
  MAX_COLS,
  MIN_COLS,
  CELL_W,
  HEIGHT,
  SECTION,
  VISIBLE_COLS,
  canHang,
  canHangRect,
  moveWindow,
  placeWindow,
  resizeWindow,
  windowFit,
  canPlace,
  canPlaceComputer,
  firstFreeSlot,
  firstFreeSurfaceSlot,
  hasFreeHost,
  moveSmall,
  placeSmall,
  hang,
  moveHung,
  moveStored,
  placedSlugs,
  setScreenCard,
  storeCard,
  unplaceCard,
  isLamp,
  isLit,
  isStanding,
  toggleLamp,
  moveComputer,
  moveStanding,
  placeComputer,
  placeStanding,
  removeFurniture,
  sectionIsEmpty,
  type Cell,
} from '../core/library/room-grid';
import { STYLE_LABELS, paletteOf } from '../core/library/styles';
import { formatMinutes } from '../core/library/time-setting';
import { useSceneTime } from './use-scene-time';
import { useWeather } from './use-weather';
import { useLightEnabled } from './light-setting';
import { WEATHER_SCENES } from './scene-weather';
import { WEATHER_LABEL } from '../core/library/weather/weather-types';
import { usePetContext } from './pet-context';
import { usePetSim } from './pet-sim';
import { ensurePosition, positionFailure, requestPosition, subscribePosition } from './scene-position';
import { positionSetting } from './position-setting';
import { dropTargetFor, pointerToCell, type DropTarget } from './furniture-drag';
import { CATEGORY_ICON, KIND_ICON } from './furniture-icons';
import { createLongPress } from './long-press';
import { FullscreenButton, useFullscreen } from './fullscreen';
import { lockOrientation, unlockOrientation } from './orientation-lock';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { CardPickerDialog, type CardChoice } from './CardPickerDialog';
import { useRoomCards } from './library-cards-data';
import { RoomCardDialog } from './RoomCardDialog';
import { RoomView, type DragView, type Tool } from './RoomView';

// Près du bord de la pièce visible, le glissé la fait défiler : zone sensible et vitesse (pixels par image).
const EDGE_ZONE = 48;
const EDGE_SPEED = 8;

type Drag = { id: string; x: number; y: number; target: DropTarget };
// Ce que les écouteurs de la fenêtre doivent connaître de l'état courant (relu à chaque événement).
type DragLive = { layout: Layout; cols: number; drop: (id: string, target: DropTarget) => void };

const FAILURE_LABEL = { denied: 'position refusée', unavailable: 'position indisponible', timeout: 'position trop longue à obtenir', absent: 'position non gérée', off: 'localisation du téléphone désactivée' } as const;

export const LIBRARY_CSS = `
.wmt-lib{display:flex;flex-direction:column;gap:10px;padding:12px;margin:12px 0;border:1px solid var(--color-border,rgba(148,163,184,.35));border-radius:12px;background:var(--color-surface,#0d1117);color:var(--color-foreground,#e6edf3);font:14px/20px system-ui,sans-serif}
.wmt-lib-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wmt-lib-btn{min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;border-radius:999px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit;cursor:pointer}
.wmt-lib-btn[aria-pressed="true"],.wmt-lib-btn[aria-selected="true"]{border-color:var(--color-accent,#34d399);color:var(--color-accent,#34d399)}
.wmt-lib-swatch{display:inline-block;box-sizing:border-box;width:16px;height:16px;border-radius:50%;border:4px solid transparent}
.wmt-lib-pet{display:inline-flex;gap:4px;align-items:center}
.wmt-lib-name{min-height:40px;box-sizing:border-box;padding:0 10px;border-radius:8px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit}
.wmt-lib-scroll{display:flex;overflow-x:auto;width:100%;margin:0 auto;border-radius:12px;-webkit-overflow-scrolling:touch}
.wmt-lib-stage{position:relative;width:100%;display:flex;justify-content:center}
.wmt-lib-stage:fullscreen{background:#000;width:100vw;height:100vh;align-items:center}
.wmt-lib-stage:fullscreen .wmt-lib-scroll{border-radius:0}
.wmt-lib-msg{min-height:20px;font-size:13px;opacity:.85}
.wmt-lib-sep{flex:1}
.wmt-lib-dialog{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}
.wmt-lib-dialog-panel{box-sizing:border-box;width:100%;max-width:min(92vw,480px);max-height:80vh;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:12px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:var(--color-surface,#0d1117);color:var(--color-foreground,#e6edf3);font:14px/20px system-ui,sans-serif}
.wmt-lib-picklist{display:flex;flex-direction:column;gap:6px}
.wmt-lib-pick{justify-content:flex-start;border-radius:10px;text-align:left}
.wmt-lib-pick:disabled{opacity:.4;cursor:not-allowed}
.wmt-lib-btn:disabled{opacity:.4;cursor:not-allowed}
.wmt-lib-btn[data-suggested="true"]{border-color:var(--color-accent,#34d399);color:var(--color-accent,#34d399)}
`;

function Icon({ paths }: { paths: readonly string[] }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const COAT_LABELS_OF: Record<Species, Record<string, string>> = { cat: COAT_LABELS, dog: DOG_COAT_LABELS, robot: ROBOT_COAT_LABELS };
const coatLabel = (species: Species, coat: Coat): string => COAT_LABELS_OF[species][coat] ?? coat;

// Textes propres à chaque espèce.
const SPECIES_TEXT: Record<Species, { name: string; adoptName: string; confirm: string; adoptLabel: string; defaultName: string; defaultCoat: Coat }> = {
  cat: { name: 'Nom du chat', adoptName: 'Nom du chat à adopter', confirm: 'Adopter ce chat', adoptLabel: 'Adopter un chat', defaultName: 'Minou', defaultCoat: 'orange' },
  dog: { name: 'Nom du chien', adoptName: 'Nom du chien à adopter', confirm: 'Adopter ce chien', adoptLabel: 'Adopter un chien', defaultName: 'Rex', defaultCoat: 'brown' },
  robot: { name: 'Nom du robot', adoptName: 'Nom du robot à adopter', confirm: 'Adopter ce robot', adoptLabel: 'Adopter un robot', defaultName: 'Robi', defaultCoat: 'white' },
};

const ICONS = {
  cat: ['M5 9L4 3l5 3', 'M19 9l1-6-5 3', 'M5 9c0 6 2 11 7 11s7-5 7-11c-2-2-5-3-7-3S7 7 5 9z', 'M9 12h.01', 'M15 12h.01', 'M11 15l1 1 1-1'],
  robot: ['M12 3v3', 'M12 3h.01', 'M5 8h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M9 13h.01', 'M15 13h.01', 'M9.5 16.5h5', 'M2 12v3', 'M22 12v3'],
  dog: ['M4 8l2-4 4 3', 'M20 8l-2-4-4 3', 'M5 8c0 7 2 12 7 12s7-5 7-12c-2-2-4-3-7-3S7 6 5 8z', 'M9 11h.01', 'M15 11h.01', 'M10 15h4l-2 2z'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.4.4.5.8.5 1.1V16h6v-1c0-.3.1-.7.5-1.1A6 6 0 0 0 12 3z'],
  check: ['M5 12l5 5L20 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M5 12h14', 'M12 5v14'],
  card: ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M12 9v6', 'M9 12h6'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  landscape: ['M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z'],
  portrait: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  move: ['M5 9l-3 3 3 3', 'M9 5l3-3 3 3', 'M15 19l-3 3-3-3', 'M19 9l3 3-3 3', 'M2 12h20', 'M12 2v20'],
  extendLeft: ['M4 4v16', 'M9 12h10', 'M14 7v10'],
  extendRight: ['M20 4v16', 'M5 12h10', 'M10 7v10'],
  shrinkLeft: ['M4 4v16', 'M9 12h10'],
  shrinkRight: ['M20 4v16', 'M5 12h10'],
  fullscreen: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  sun: ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  sliders: ['M4 6h10', 'M18 6h2', 'M4 12h2', 'M10 12h10', 'M4 18h12', 'M20 18h0', 'M14 4v4', 'M6 10v4', 'M16 16v4'],
  widthMinus: ['M3 12h6', 'M21 12h-6', 'M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
  widthPlus: ['M9 12H3', 'M15 12h6', 'M5 8l4 4-4 4', 'M19 8l-4 4 4 4'],
  heightMinus: ['M12 3v6', 'M12 21v-6', 'M8 9l4-4 4 4', 'M8 15l4 4 4-4'],
  dice: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8.5 8.5h.01', 'M15.5 8.5h.01', 'M12 12h.01', 'M8.5 15.5h.01', 'M15.5 15.5h.01'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3.5 3.2 3.5 14.8 0 18', 'M12 3c-3.5 3.2-3.5 14.8 0 18'],
  wxCloudy: ['M7 18a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z'],
  wxDrizzle: ['M7 14a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M9 18l-.7 1.6', 'M14 18l-.7 1.6'],
  wxRain: ['M7 14a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M8 17l-1 3', 'M12 17l-1 3', 'M16 17l-1 3'],
  wxStorm: ['M7 13a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M12.5 12l-3 5h4l-2 4'],
  wxSnow: ['M12 3v18', 'M4.2 7.5l15.6 9', 'M19.8 7.5l-15.6 9', 'M9.5 4.5L12 7l2.5-2.5', 'M9.5 19.5L12 17l2.5 2.5'],
  wxFog: ['M4 9h16', 'M6 13h12', 'M4 17h16'],
  heightPlus: ['M12 9V3', 'M12 15v6', 'M8 5l4 4 4-4', 'M8 19l4-4 4 4'],
} as const;

const WEATHER_ICON: Record<WeatherState, readonly string[]> = { sun: ICONS.sun, cloudy: ICONS.wxCloudy, drizzle: ICONS.wxDrizzle, rain: ICONS.wxRain, storm: ICONS.wxStorm, snow: ICONS.wxSnow, fog: ICONS.wxFog };

const SCENE_ICON: Record<SceneId, readonly string[]> = {
  city: ['M4 21V9h6v12', 'M10 21V4h6v17', 'M16 21v-8h4v8', 'M3 21h18'],
  countryside: ['M2 18c4-6 8-6 10-2 2-4 6-4 10 2', 'M3 21h18', 'M12 6v4', 'M10 8h4'],
  mountain: ['M2 20l7-12 4 6 3-4 6 10z', 'M9 8l2 3'],
  sea: ['M2 14c3-3 5 3 8 0s5 3 8 0 3-1 4 0', 'M2 19c3-3 5 3 8 0s5 3 8 0 3-1 4 0', 'M16 5a3 3 0 1 0 0 0.1'],
  space: ['M12 3l2 5 5 .5-4 3.5 1.5 5L12 14l-4.5 3 1.5-5L5 8.5 10 8z'],
  earth: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
};
const SCENE_LABEL: Record<SceneId, string> = { city: 'Ville', countryside: 'Campagne', mountain: 'Montagne', sea: 'Mer', space: 'Espace', earth: 'Terre vue d’en haut' };

function Btn({ label, pressed, disabled, onClick, data, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; data?: Record<string, string>; children: ReactNode }) {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]));
  return (
    <button type="button" className="wmt-lib-btn" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} {...attrs}>
      {children}
    </button>
  );
}

const REFUSALS = {
  bounds: 'Ça ne rentre pas dans la pièce.',
  floor: 'Un meuble se pose au sol : touchez une case du sol.',
  taken: 'Cet emplacement est déjà occupé.',
  wall: 'Un objet mural s’accroche au mur.',
} as const;

type Props = { library: LibraryRepo; collection?: CollectionRepo; kinds?: KindsRepo; onOpenCard?: (slug: string) => void; onOpenMarket?: (slug: string) => void };

export function LibraryPanel({ library, collection, kinds, onOpenCard, onOpenMarket }: Props) {
  const roomCards = useRoomCards(collection, kinds, library);
  const [lightOn, setLightOn] = useLightEnabled();
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [pending, setPending] = useState<CardChoice | null>(null);
  const [lib, setLib] = useState<LibraryState | null>(library.current());
  const [mode, setMode] = useState<'visit' | 'edit'>('visit');
  const [category, setCategory] = useState<Category>('storage');
  const [tool, setTool] = useState<Tool>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blink, setBlink] = useState<Cell[]>([]);
  const [message, setMessage] = useState('');
  const [adopting, setAdopting] = useState<Species | null>(null);
  const [adoptName, setAdoptName] = useState('Minou');
  const [adoptCoat, setAdoptCoat] = useState<Coat>('orange');
  const blinkTimer = useRef<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stage = useFullscreen<HTMLDivElement>();
  const pendingScroll = useRef(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = drag !== null;
  const dragId = drag?.id ?? null;
  const live = useRef<DragLive | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const pressedId = useRef<string | null>(null);
  const startDragRef = useRef<(id: string) => void>(() => undefined);
  const press = useMemo(() => createLongPress(() => { if (pressedId.current) startDragRef.current(pressedId.current); }), []);
  useEffect(() => press.cancel, [press]);
  const sceneTime = useSceneTime(lib?.time ?? { mode: 'real' });
  const weather = useWeather(lib?.weather ?? { mode: 'random' });
  // Vue des fenêtres mémoïsée : ciel et heure changent à la minute, les drapeaux de la météo rarement ; l'horloge est stable.
  const sceneView = useMemo(
    () => ({ sky: sceneTime.sky, minutes: sceneTime.minutes, weather: { clock: weather.clock, flags: weather.flags } }),
    [sceneTime.sky, sceneTime.minutes, weather.clock, weather.flags],
  );

  // Position du doigt → case, cible de dépôt et position dans le dessin (null si la pièce n'est pas affichée).
  const locate = (id: string, clientX: number, clientY: number): Drag | null => {
    const state = live.current;
    const svg = scrollRef.current?.querySelector('svg');
    if (!state || !svg) return null;
    const { col, row, x, y } = pointerToCell(svg.getBoundingClientRect(), state.cols * CELL_W, HEIGHT, clientX, clientY);
    return { id, x, y, target: dropTargetFor(state.layout, state.cols, id, col, row, x, y) };
  };

  // Pendant un glissé : le doigt ne fait pas défiler la page, Échap annule, les bords font défiler la pièce.
  useEffect(() => {
    if (dragId === null) return;
    const id = dragId;
    const follow = (clientX: number, clientY: number): void => {
      lastPointer.current = { x: clientX, y: clientY };
      const next = locate(id, clientX, clientY);
      if (next) setDrag(next);
    };
    const onMove = (event: PointerEvent): void => follow(event.clientX, event.clientY);
    const onUp = (event: PointerEvent): void => {
      const final = locate(id, event.clientX, event.clientY);
      end();
      if (final) live.current?.drop(id, final.target);
    };
    // Le clic qui suit le relâchement est ignoré ; s'il n'arrive pas, l'oubli évite d'avaler le prochain vrai toucher.
    const end = (): void => {
      setDrag(null);
      window.setTimeout(press.consumeClick, 0);
    };
    const cancel = end;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel();
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (event.cancelable) event.preventDefault();
    };
    let frame = 0;
    const tick = (): void => {
      const el = scrollRef.current;
      if (el) {
        const box = el.getBoundingClientRect();
        const { x } = lastPointer.current;
        const step = x < box.left + EDGE_ZONE ? -EDGE_SPEED : x > box.right - EDGE_ZONE ? EDGE_SPEED : 0;
        if (step !== 0) {
          const before = el.scrollLeft;
          el.scrollLeft = before + step;
          if (el.scrollLeft !== before) follow(lastPointer.current.x, lastPointer.current.y);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchmove', onTouchMove);
    };
    // locate ne lit que des refs : la version du premier rendu du glissé suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  useEffect(() => {
    let alive = true;
    const off = library.subscribe(() => {
      const current = library.current();
      if (alive && current) setLib(current);
    });
    void library
      .load()
      .then((state) => {
        if (alive) setLib(state);
      })
      .catch(() => {
        // Stockage illisible : pièce vide affichée, rien n'est écrit.
        if (alive) setLib((previous) => previous ?? createInitialState());
      });
    return () => {
      alive = false;
      off();
      window.clearTimeout(blinkTimer.current);
    };
  }, [library]);

  // Le défilement demandé par un agrandissement/réduction à gauche ne s'applique qu'une fois la nouvelle largeur rendue.
  const colsNow = lib ? activeRoom(lib).cols : 0;
  useLayoutEffect(() => {
    const delta = pendingScroll.current;
    pendingScroll.current = 0;
    const el = scrollRef.current;
    if (delta !== 0 && el) el.scrollLeft = Math.max(0, el.scrollLeft + delta);
  }, [colsNow]);

  // Plein écran : l'écran prend l'orientation de la pièce ; le verrou est levé à la sortie et au démontage.
  const orientationNow = lib ? activeRoom(lib).orientation : 'landscape';
  useEffect(() => {
    if (!stage.active) return;
    lockOrientation(orientationNow);
    return () => unlockOrientation();
  }, [stage.active, orientationNow]);

  // Réglage « Position » (actif par défaut) : la position est demandée une fois par chargement de page, à l'ouverture de la Bibliothèque.
  // Elle n'est gardée qu'en mémoire : sans cette relecture, la vraie météo resterait « simulée » après chaque rechargement.
  const positionOn = useSyncExternalStore(positionSetting.subscribe, positionSetting.enabled, positionSetting.enabled);
  const failure = useSyncExternalStore(subscribePosition, positionFailure, positionFailure);
  useEffect(() => {
    if (positionOn) ensurePosition();
  }, [positionOn]);

  // Le chat : son plan est mémorisé sans prévenir les abonnés (il change toutes les quelques secondes, rien à redessiner).
  const savePlan = useCallback((roomId: string, petId: string, plan: PetPlan) => { void library.updateQuiet((state) => setPetPlan(state, roomId, petId, plan)); }, [library]);
  // Contexte des animaux (nuit, lune, météo, taches de soleil), relu à chaque image de la simulation.
  const petRoom = lib ? activeRoom(lib) : null;
  const getPetContext = usePetContext({ room: petRoom, sceneView, lightOn });
  const sim = usePetSim(petRoom, savePlan, getPetContext);

  if (!lib) return <div className="wmt-lib" data-wmt-library />;

  const room = activeRoom(lib);
  const layout = room.layout;
  const editing = mode === 'edit';
  const portrait = room.orientation === 'portrait';
  const visibleWidth = VISIBLE_COLS[room.orientation] * CELL_W;
  const editLayout = (change: Parameters<typeof updateLayout>[2]) => library.update((state) => updateLayout(state, room.id, change));

  const cats = categoriesFor(room.style);
  const shownCategory: Category = cats.some((c) => c.id === category) ? category : 'storage';
  const chooseStyle = (id: StyleId): void => {
    if (id === room.style) return;
    if (room.style === 'steampunk' && id !== 'steampunk' && countExclusive(room) > 0
      && !window.confirm('Retirer les meubles Steampunk (globe, télescope, automate) de cette pièce ?')) return;
    reset();
    if (category === 'steampunk' && id !== 'steampunk') setCategory('storage');
    void library.update((state) => setRoomStyle(state, room.id, id));
  };
  const reset = (): void => {
    setTool(null);
    setSelectedId(null);
    setBlink([]);
    setMessage('');
    setPicking(false);
    setPending(null);
    setAdopting(null);
    setAdoptName('Minou');
    setAdoptCoat('orange');
  };
  const refuse = (text: string, cells: Cell[] = []): void => {
    setMessage(text);
    setBlink(cells);
    window.clearTimeout(blinkTimer.current);
    blinkTimer.current = window.setTimeout(() => setBlink([]), 700);
  };

  // Refus d'un ordinateur : soit le bureau en porte déjà un, soit des petits objets occupent son milieu.
  const computerRefusal = (deskId: string, ignoreId?: string): string =>
    layout.some((p) => p.kind === 'computer' && p.deskId === deskId && p.id !== ignoreId) ? 'Ce bureau a déjà un ordinateur.' : 'Libérez le milieu du bureau pour y poser l’ordinateur.';

  const REASONS = { ...REFUSALS, 'not-desk': 'Un ordinateur se pose sur un bureau.', 'desk-busy': 'Ce bureau a déjà un ordinateur.', 'desk-middle': 'Libérez le milieu du bureau pour y poser l’ordinateur.', 'slot-busy': 'Cet emplacement est déjà pris.', 'not-slot': 'Déposez l’objet dans un emplacement de l’étagère.', 'host-busy': 'Plus de place sur ce meuble.', 'not-host': 'Déposez l’objet sur un bureau ou une étagère.' } as const;
  // Lâcher d'un meuble soulevé : valide → déplacé par les mêmes fonctions que « Déplacer » ; sinon il reste en place.
  const dropLifted = (id: string, target: DropTarget): void => {
    if (target.ok) {
      const item = layout.find((p) => p.id === id);
      if (item?.kind === 'computer' && target.deskId) {
        const deskId = target.deskId;
        void editLayout((l) => moveComputer(l, id, deskId));
      } else if (item?.kind === 'small' && target.hostId) {
        const { hostId } = target;
        void editLayout((l) => moveSmall(l, id, hostId));
      } else if (item?.kind === 'stored' && target.shelfId !== undefined && target.slot !== undefined) {
        const { shelfId, slot } = target;
        void editLayout((l) => moveStored(l, id, shelfId, slot));
      } else if (item?.kind === 'window' && target.col !== undefined && target.top !== undefined) {
        const { col, top } = target;
        void editLayout((l, cols) => moveWindow(l, cols, id, col, top));
      } else if (item?.kind === 'wall' && target.col !== undefined && target.top !== undefined) {
        const { col, top } = target;
        void editLayout((l, cols) => moveHung(l, cols, id, col, top));
      } else if (target.col !== undefined && target.top !== undefined) {
        const { col, top } = target;
        void editLayout((l, cols) => moveStanding(l, cols, id, col, top));
      }
      return reset();
    }
    setTool(null);
    setSelectedId(null);
    refuse(target.reason ? REASONS[target.reason] : '', target.cells);
  };
  live.current = { layout, cols: room.cols, drop: dropLifted };
  startDragRef.current = (id: string): void => {
    const first = locate(id, lastPointer.current.x, lastPointer.current.y);
    reset();
    setMode('edit');
    if (first) setDrag(first);
  };
  const onFurnitureDown = (id: string, event: ReactPointerEvent): void => {
    // En mode Visiter, l'appui long ne fait rien (seul le bouton « Aménager » ouvre l'aménagement), mais il est suivi pour
    // que le clic qui le termine n'allume pas ou n'éteigne pas une lampe.
    if (!editing) {
      pressedId.current = null;
      press.start(event.clientX, event.clientY);
      return;
    }
    pressedId.current = id;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    press.start(event.clientX, event.clientY);
  };
  const onFurnitureMove = (event: ReactPointerEvent): void => {
    lastPointer.current = { x: event.clientX, y: event.clientY };
    press.move(event.clientX, event.clientY);
  };

  const movingItem = tool?.type === 'move' ? layout.find((p) => p.id === tool.id) : undefined;
  // Un ordinateur ou un petit objet vise un porteur (bureau, étagère) : les cases ne captent pas le toucher.
  const targetsHost = (tool?.type === 'new' && (tool.kind === 'computer' || isSmallKind(tool.kind))) || movingItem?.kind === 'computer' || movingItem?.kind === 'small';
  const placing = tool?.type === 'card' ? pending : null;
  // Les cases captent les touchers pour un meuble ou un objet mural ; poser une carte sur une étagère ou un écran vise les meubles.
  const cellsActive = tool !== null && !targetsHost && (tool.type !== 'card' || placing?.target === 'wall');

  // Objet mural, posé (carte choisie) ou déplacé (« Déplacer ») : la case touchée est son coin bas-gauche.
  // Fenêtre posée (outil « new ») ou déplacée : la case touchée est son coin bas-gauche.
  async function placeWindowAt(col: number, row: number): Promise<void> {
    if (!tool) return;
    const moving = tool.type === 'move' && movingItem?.kind === 'window' ? movingItem : null;
    const { w, h } = moving ?? WINDOW_DEFAULT;
    const top = row - h + 1;
    const check = canHangRect(layout, room.cols, w, h, col, top, moving?.id);
    if (!check.ok) return refuse(REASONS[check.reason], check.cells);
    if (moving) await editLayout((l, cols) => moveWindow(l, cols, moving.id, col, top));
    else await editLayout((l, cols) => placeWindow(l, cols, col, top, nextFurnitureId(l)));
    reset();
  }

  async function placeWall(col: number, row: number): Promise<void> {
    if (!tool) return;
    const shape = tool.type === 'card' ? (pending?.target === 'wall' ? pending.shape : null) : movingItem?.kind === 'wall' ? movingItem.shape : null;
    if (!shape) return;
    const top = row - wallSizeOf(shape).h + 1;
    const check = canHang(layout, room.cols, shape, col, top, tool.type === 'move' ? tool.id : undefined);
    if (!check.ok) return refuse(REASONS[check.reason], check.cells);
    if (tool.type === 'card' && pending?.target === 'wall') {
      const { slug, color } = pending;
      await editLayout((l, cols) => hang(l, cols, shape, col, top, slug, nextFurnitureId(l), color));
    } else if (tool.type === 'move') {
      await editLayout((l, cols) => moveHung(l, cols, tool.id, col, top));
    }
    reset();
  }

  // Carte choisie pour un écran ou une étagère : posée sur le meuble touché.
  async function placeOnFurniture(choice: CardChoice, item: Layout[number]): Promise<void> {
    if (choice.target === 'screen') {
      if (item.kind !== 'computer') return refuse('Choisissez un ordinateur.');
      await editLayout((l) => setScreenCard(l, item.id, choice.slug));
    } else if (choice.target === 'shelf') {
      if (item.kind !== 'shelf') return refuse('Touchez une étagère.');
      const slot = firstFreeSlot(layout, item.id);
      if (slot === null) return refuse('Cette étagère est pleine.');
      await editLayout((l) => storeCard(l, item.id, slot, choice.shape, choice.slug, nextFurnitureId(l)));
    } else {
      return;
    }
    reset();
  }

  // Toucher un objet (accroché, rangé ou écran) : l'ouvre en mode Visiter, le sélectionne en mode Aménager.
  function onCardTap(id: string): void {
    if (press.consumeClick()) return;
    const item = layout.find((p) => p.id === id);
    if (!item) return;
    // Pendant la pose sur une étagère, toucher une carte rangée revient à toucher son étagère.
    if (editing && placing?.target === 'shelf' && item.kind === 'stored') return void onPick(item.shelfId);
    if (!editing) {
      const slug = item.kind === 'wall' || item.kind === 'stored' || item.kind === 'computer' ? item.slug : undefined;
      if (slug && roomCards.cards[slug]) setViewing(slug);
      return;
    }
    // L'écran d'un ordinateur se manie comme l'ordinateur.
    if (item.kind === 'computer') return void onPick(id);
    if (tool) return;
    setSelectedId(id === selectedId ? null : id);
    setMessage('');
  }

  async function onCell(col: number, row: number): Promise<void> {
    if (!tool) return;
    if ((tool.type === 'new' && tool.kind === 'window') || movingItem?.kind === 'window') return placeWindowAt(col, row);
    if (tool.type === 'card' || movingItem?.kind === 'wall') return placeWall(col, row);
    const kind: StandingKind | null = tool.type === 'new' ? (isStandingKind(tool.kind) ? tool.kind : null) : movingItem && isStanding(movingItem) ? movingItem.kind : null;
    if (!kind) return;
    if (tool.type === 'new' && (STEAMPUNK_ONLY as readonly string[]).includes(kind) && room.style !== 'steampunk') return reset();
    // La case touchée est la case en bas à gauche du meuble.
    const top = row - sizeOf(kind).h + 1;
    const check = canPlace(layout, room.cols, kind, col, top, tool.type === 'move' ? tool.id : undefined);
    if (!check.ok) return refuse(REFUSALS[check.reason], check.cells);
    await editLayout((l, cols) => (tool.type === 'new' ? placeStanding(l, cols, kind, col, top, nextFurnitureId(l)) : moveStanding(l, cols, tool.id, col, top)));
    reset();
  }

  async function onPick(id: string): Promise<void> {
    // Le clic qui suit un appui long n'est pas un vrai clic ; en mode Visiter, toucher un meuble ne fait rien, sauf une lampe : elle s'allume ou s'éteint.
    if (!editing) {
      if (!press.consumeClick() && layout.some((p) => p.id === id && isLamp(p))) void editLayout((l) => toggleLamp(l, id));
      return;
    }
    if (press.consumeClick()) return;
    const item = layout.find((p) => p.id === id);
    if (!item) return;
    if (placing) return placeOnFurniture(placing, item);
    if (tool?.type === 'new' && tool.kind === 'computer') {
      if (item.kind !== 'desk') return refuse('Un ordinateur se pose sur un bureau.');
      if (!canPlaceComputer(layout, id)) return refuse(computerRefusal(id));
      await editLayout((l) => placeComputer(l, id, nextFurnitureId(l)));
      return reset();
    }
    if (tool?.type === 'move' && movingItem?.kind === 'computer') {
      if (item.kind !== 'desk') return refuse('Un ordinateur se pose sur un bureau.');
      if (!canPlaceComputer(layout, id, movingItem.id)) return refuse(computerRefusal(id, movingItem.id));
      await editLayout((l) => moveComputer(l, movingItem.id, id));
      return reset();
    }
    if (tool?.type === 'new' && isSmallKind(tool.kind)) {
      if (item.kind !== 'desk' && item.kind !== 'shelf') return refuse('Un petit objet se pose sur un bureau ou une étagère.');
      if (firstFreeSurfaceSlot(layout, id) === null) return refuse('Plus de place sur ce meuble.');
      const small = SMALL_ITEM_OF[tool.kind];
      await editLayout((l) => placeSmall(l, id, small, nextFurnitureId(l)));
      return reset();
    }
    if (tool?.type === 'move' && movingItem?.kind === 'small') {
      if (item.kind !== 'desk' && item.kind !== 'shelf') return refuse('Un petit objet se pose sur un bureau ou une étagère.');
      if (item.id !== movingItem.hostId && firstFreeSurfaceSlot(layout, id, movingItem.id) === null) return refuse('Plus de place sur ce meuble.');
      await editLayout((l) => moveSmall(l, movingItem.id, id));
      return reset();
    }
    setTool(null);
    setSelectedId(id === selectedId ? null : id);
    setMessage('');
  }

  const startNew = (kind: FurnitureKind): void => {
    setSelectedId(null);
    setBlink([]);
    if (isSmallKind(kind) && !hasFreeHost(layout)) {
      setTool(null);
      return refuse('Il faut d’abord un bureau ou une étagère avec de la place.');
    }
    setTool({ type: 'new', kind });
    setMessage(
      kind === 'computer'
        ? 'Touchez un bureau pour y poser l’ordinateur.'
        : isSmallKind(kind)
          ? `Touchez un bureau ou une étagère pour y poser : ${labelOf(kind).toLowerCase()}.`
          : kind === 'window'
            ? 'Touchez la case du mur où poser la fenêtre (son coin bas gauche).'
            : `Touchez une case du sol pour poser : ${labelOf(kind).toLowerCase()}.`,
    );
  };
  const startMove = (): void => {
    if (!selectedId) return;
    const item = layout.find((p) => p.id === selectedId);
    if (item?.kind === 'stored') return refuse('Appui long pour la déplacer.');
    setTool({ type: 'move', id: selectedId });
    setMessage(item?.kind === 'small' ? 'Touchez le bureau ou l’étagère où le poser.' : item?.kind === 'computer' ? 'Touchez le bureau où le poser.' : item?.kind === 'wall' || item?.kind === 'window' ? 'Touchez la case du mur où l’accrocher.' : 'Touchez la case du sol où le poser.');
  };
  const removeSelected = async (): Promise<void> => {
    if (!selectedId) return;
    const item = layout.find((p) => p.id === selectedId);
    // Un meuble qui porte quelque chose (cartes rangées, carte à l'écran, petits objets) demande confirmation : tout part avec lui.
    const holdsMore =
      (item?.kind === 'shelf' && layout.some((p) => (p.kind === 'stored' && p.shelfId === item.id) || (p.kind === 'small' && p.hostId === item.id))) ||
      (item?.kind === 'desk' && layout.some((p) => (p.kind === 'computer' && p.deskId === item.id && p.slug) || (p.kind === 'small' && p.hostId === item.id)));
    if (holdsMore && !window.confirm('Retirer aussi ce qui est posé dessus ?')) return;
    // Un objet de carte se range ; un ordinateur qui affiche une carte ne vide d'abord que son écran.
    if (item?.kind === 'wall' || item?.kind === 'stored' || (item?.kind === 'computer' && item.slug)) await editLayout((l) => unplaceCard(l, selectedId));
    else await editLayout((l) => removeFurniture(l, selectedId));
    reset();
  };
  const selectedItem = editing ? layout.find((p) => p.id === selectedId) : undefined;
  const selectedLamp = selectedItem && isLamp(selectedItem) ? { id: selectedItem.id, on: isLit(selectedItem) } : null;
  const selectedWindow = editing ? layout.find((p) => p.id === selectedId && p.kind === 'window') : undefined;
  const resizeSelected = (dw: number, dh: number): void => {
    if (!selectedWindow || selectedWindow.kind !== 'window') return;
    const w = selectedWindow.w + dw;
    const h = selectedWindow.h + dh;
    const check = windowFit(layout, room.cols, selectedWindow.id, w, h);
    if (!check.ok) {
      const limit = w < WINDOW_MIN.w || h < WINDOW_MIN.h ? 'La fenêtre ne peut pas être plus petite.' : w > WINDOW_MAX.w || h > WINDOW_MAX.h ? 'La fenêtre ne peut pas être plus grande.' : REASONS[check.reason];
      return refuse(limit, check.cells);
    }
    setMessage('');
    void editLayout((l, cols) => resizeWindow(l, cols, selectedWindow.id, w, h));
  };
  // « + Carte » : rappuyer annule ; sinon le sélecteur s'ouvre et le choix devient l'outil de pose.
  const startCard = (): void => {
    if (tool?.type === 'card') return reset();
    reset();
    setPicking(true);
  };
  const chooseCard = (choice: CardChoice): void => {
    setPicking(false);
    setPending(choice);
    setTool({ type: 'card' });
    setMessage(choice.target === 'screen' ? 'Touchez un ordinateur.' : choice.target === 'shelf' ? 'Touchez une étagère.' : 'Touchez la case du mur où l’accrocher.');
  };

  // Agrandir à gauche décale les meubles : le défilement suit pour garder la même vue.
  async function extend(side: 'left' | 'right'): Promise<void> {
    if (room.cols + SECTION > MAX_COLS) return refuse('La pièce ne peut pas être plus large.');
    setMessage('');
    const el = scrollRef.current;
    if (side === 'left' && el) pendingScroll.current = (el.clientWidth * SECTION) / VISIBLE_COLS[room.orientation];
    await library.update((state) => extendRoom(state, room.id, side));
  }
  async function shrink(side: 'left' | 'right'): Promise<void> {
    if (room.cols - SECTION < MIN_COLS) return refuse(`La pièce ne peut pas être plus étroite que ${MIN_COLS} colonnes.`);
    if (!sectionIsEmpty(layout, room.cols, side)) return refuse('Retirez d’abord les meubles de cette zone.');
    setMessage('');
    const el = scrollRef.current;
    if (side === 'left' && el) pendingScroll.current = -(el.clientWidth * SECTION) / VISIBLE_COLS[room.orientation];
    await library.update((state) => shrinkRoom(state, room.id, side));
  }

  const setMode2 = (next: 'visit' | 'edit'): void => {
    reset();
    setMode(next);
  };
  // Changer de pièce ramène la vue à gauche et annule tout défilement en attente.
  const resetScroll = (): void => {
    pendingScroll.current = 0;
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  };
  const chooseRoom = (id: string): void => {
    reset();
    resetScroll();
    void library.update((state) => setActive(state, id));
  };
  const chooseOrientation = (orientation: Orientation): void => {
    reset();
    void library.update((state) => setOrientation(state, room.id, orientation));
  };
  const chooseTime = (mode: TimeSetting['mode']): void => {
    reset();
    const next: TimeSetting = mode === 'manual' ? { mode, minutes: sceneTime.minutes } : { mode };
    // « Heure réelle » : le navigateur demande alors l'accord de position (sans accord, le fuseau horaire suffit).
    if (mode === 'real') void requestPosition();
    void library.update((state) => setTimeSetting(state, next));
  };
  const chooseWeather = (next: WeatherSetting): void => {
    reset();
    // « Météo réelle » : le navigateur demande l'accord de position (sans accord, la météo reste simulée).
    if (next.mode === 'real') void requestPosition();
    void library.update((state) => setWeatherSetting(state, next));
  };
  const onDeleteRoom = (): void => {
    const question = lib.rooms.length > 1 ? `Supprimer « ${room.name} » ?` : 'Vider cette pièce ?';
    if (!window.confirm(question)) return;
    reset();
    void library.update((state) => deleteRoom(state, room.id));
  };
  const startAdopt = (species: Species): void => {
    setAdoptName(SPECIES_TEXT[species].defaultName);
    setAdoptCoat(SPECIES_TEXT[species].defaultCoat);
    setAdopting(species);
  };
  const confirmAdopt = (): void => {
    const species = adopting;
    setAdopting(null);
    if (species) void library.update((state) => adoptPet(state, room.id, adoptName, adoptCoat, species));
  };
  const onRemovePet = (pet: Pet): void => {
    if (!window.confirm(`Retirer ${pet.name} de cette pièce ?`)) return;
    void library.update((state) => removePet(state, room.id, pet.id));
  };

  return (
    <div className="wmt-lib" data-wmt-library>
      <div className="wmt-lib-row" role="tablist" aria-label="Pièces">
        {lib.rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            className="wmt-lib-btn"
            aria-selected={r.id === lib.activeRoomId}
            data-room={r.id}
            onClick={() => chooseRoom(r.id)}
          >
            {r.id === lib.homeRoomId && <Icon paths={ICONS.star} />}
            {r.name}
          </button>
        ))}
        <Btn label="Ajouter une pièce" data={{ action: 'add-room' }} onClick={() => { reset(); resetScroll(); void library.update(addRoom); }}>
          <Icon paths={ICONS.plus} />
        </Btn>
      </div>

      <div className="wmt-lib-row">
        <Btn label="Visiter" pressed={!editing} data={{ action: 'visit' }} onClick={() => setMode2('visit')}>
          <Icon paths={ICONS.eye} />
        </Btn>
        <Btn label="Aménager" pressed={editing} data={{ action: 'edit' }} onClick={() => setMode2('edit')}>
          <Icon paths={ICONS.pencil} />
        </Btn>
        <Btn label="Pièce horizontale" pressed={room.orientation === 'landscape'} data={{ orient: 'landscape' }} onClick={() => chooseOrientation('landscape')}>
          <Icon paths={ICONS.landscape} />
        </Btn>
        <Btn label="Pièce verticale" pressed={portrait} data={{ orient: 'portrait' }} onClick={() => chooseOrientation('portrait')}>
          <Icon paths={ICONS.portrait} />
        </Btn>
        <Btn
          label="Pièce d’accueil : s’ouvre au lancement"
          pressed={lib.homeRoomId === room.id}
          data={{ action: 'home' }}
          onClick={() => void library.update((state) => setHome(state, state.homeRoomId === room.id ? null : room.id))}
        >
          <Icon paths={ICONS.star} />
        </Btn>
        <Btn label={stage.active ? 'Quitter le plein écran' : 'Plein écran'} data={{ action: 'fullscreen' }} onClick={stage.toggle}>
          <Icon paths={ICONS.fullscreen} />
        </Btn>
        <span className="wmt-lib-sep" />
        {editing && (
          <input
            key={room.id}
            className="wmt-lib-name"
            aria-label="Nom de la pièce"
            defaultValue={room.name}
            maxLength={30}
            onBlur={(event) => {
              // La valeur est lue tout de suite : currentTarget n'existe plus quand l'écriture s'exécute.
              const name = event.currentTarget.value;
              void library.update((state) => renameRoom(state, room.id, name));
            }}
          />
        )}
        {editing && (
          <Btn label={lib.rooms.length > 1 ? 'Supprimer la pièce' : 'Vider la pièce'} data={{ action: 'delete-room' }} onClick={onDeleteRoom}>
            <Icon paths={ICONS.trash} />
          </Btn>
        )}
      </div>

      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Style de la pièce">
          {STYLE_IDS.map((id) => (
            <Btn key={id} label={STYLE_LABELS[id]} pressed={room.style === id} data={{ style: id }} onClick={() => chooseStyle(id)}>
              <span className="wmt-lib-swatch" style={{ background: paletteOf(id).wall, borderColor: paletteOf(id).floor }} />
            </Btn>
          ))}
        </div>
      )}

      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Ciel">
          {SCENE_IDS.map((id) => (
            <Btn key={id} label={SCENE_LABEL[id]} pressed={room.scene === id} data={{ scene: id }} onClick={() => void library.update((state) => setRoomScene(state, room.id, id))}>
              <Icon paths={SCENE_ICON[id]} />
            </Btn>
          ))}
          <span className="wmt-lib-sep" />
          {(
            [
              ['real', 'Heure réelle', ICONS.clock],
              ['day', 'Toujours le jour', ICONS.sun],
              ['night', 'Toujours la nuit', ICONS.moon],
              ['manual', 'Choisir l’heure', ICONS.sliders],
            ] as const
          ).map(([mode, label, icon]) => (
            <Btn key={mode} label={label} pressed={lib.time.mode === mode} data={{ time: mode }} onClick={() => chooseTime(mode)}>
              <Icon paths={icon} />
            </Btn>
          ))}
          {WEATHER_SCENES.includes(room.scene) && (
            <Btn label="Lumière" pressed={lightOn} data={{ 'light-toggle': '' }} onClick={() => setLightOn(!lightOn)}>
              <Icon paths={ICONS.bulb} />
            </Btn>
          )}
          {lib.time.mode === 'manual' && (
            <input
              type="range"
              data-time-slider=""
              aria-label="Heure"
              min={0}
              max={1439}
              step={5}
              value={lib.time.minutes}
              onChange={(event) => { const minutes = Number(event.currentTarget.value); void library.update((state) => setTimeSetting(state, { mode: 'manual', minutes })); }}
            />
          )}
          <span className="wmt-lib-msg" data-sun-times="">
            {sceneTime.times.kind === 'normal' ? `☀ ${formatMinutes(sceneTime.times.sunrise)} → ${formatMinutes(sceneTime.times.sunset)}` : sceneTime.times.polar === 'day' ? '☀ jour permanent' : '☾ nuit permanente'}
            {` · ${formatMinutes(sceneTime.minutes)}`}
          </span>
        </div>
      )}

      {editing && WEATHER_SCENES.includes(room.scene) && (
        <div className="wmt-lib-row" role="group" aria-label="Météo">
          <Btn label="Météo aléatoire" pressed={lib.weather.mode === 'random'} data={{ 'weather-mode': 'random' }} onClick={() => chooseWeather({ mode: 'random' })}>
            <Icon paths={ICONS.dice} />
          </Btn>
          <Btn label={positionOn ? 'Météo réelle' : 'Météo réelle (position désactivée dans Paramètre d’extension)'} pressed={lib.weather.mode === 'real'} disabled={!positionOn} data={{ 'weather-mode': 'real' }} onClick={() => chooseWeather({ mode: 'real' })}>
            <Icon paths={ICONS.globe} />
          </Btn>
          <span className="wmt-lib-sep" />
          {WEATHER_STATES.map((state) => (
            <Btn key={state} label={WEATHER_LABEL[state]} pressed={lib.weather.mode === 'forced' && lib.weather.state === state} data={{ 'weather-state': state }} onClick={() => chooseWeather({ mode: 'forced', state })}>
              <Icon paths={WEATHER_ICON[state]} />
            </Btn>
          ))}
          <span className="wmt-lib-msg" data-weather-label="">
            {weather.label}
            {weather.tempC !== null ? ` · ${Math.round(weather.tempC)} °C` : ''}
          </span>
          {weather.real === 'fallback' && (
            <span className="wmt-lib-msg" data-weather-note="" title={positionOn ? 'Position inconnue ou réseau indisponible : la météo reste simulée.' : 'Position désactivée dans Paramètre d’extension : la météo reste simulée.'}>
              (simulée{positionOn && failure ? ` : ${FAILURE_LABEL[failure]}` : ''})
            </span>
          )}
        </div>
      )}

      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Animaux">
          {room.pets.map((pet) => (
            <span key={`${room.id}:${pet.id}`} className="wmt-lib-pet" data-pet-edit={pet.id}>
              <input
                className="wmt-lib-name"
                aria-label={SPECIES_TEXT[pet.species].name}
                defaultValue={pet.name}
                maxLength={MAX_PET_NAME}
                onBlur={(event) => {
                  const name = event.currentTarget.value;
                  if (!name.trim()) {
                    event.currentTarget.value = pet.name;
                    return;
                  }
                  if (name === pet.name) return;
                  void library.update((state) => renamePet(state, room.id, pet.id, name));
                }}
              />
              <Btn label={`Retirer ${pet.name}`} data={{ action: 'remove-pet', pet: pet.id }} onClick={() => onRemovePet(pet)}>
                <Icon paths={ICONS.trash} />
              </Btn>
            </span>
          ))}
          {adopting !== null ? (
            <>
              <input className="wmt-lib-name" aria-label={SPECIES_TEXT[adopting].adoptName} value={adoptName} maxLength={MAX_PET_NAME} onChange={(event) => setAdoptName(event.currentTarget.value)} />
              {coatsOf(adopting).map((coat) => (
                <Btn key={coat} label={coatLabel(adopting, coat)} pressed={adoptCoat === coat} data={{ coat }} onClick={() => setAdoptCoat(coat)}>
                  <span className="wmt-lib-swatch" style={{ background: coatPaletteOf(adopting, coat).body, borderColor: coatPaletteOf(adopting, coat).belly }} />
                </Btn>
              ))}
              <Btn label={SPECIES_TEXT[adopting].confirm} data={{ action: 'adopt-confirm' }} onClick={confirmAdopt}>
                <Icon paths={ICONS.check} />
              </Btn>
              <Btn label="Annuler" data={{ action: 'adopt-cancel' }} onClick={() => setAdopting(null)}>
                <Icon paths={ICONS.close} />
              </Btn>
            </>
          ) : (
            room.pets.length < MAX_PETS && (
              <>
                <Btn label="Adopter un chat" data={{ action: 'adopt' }} onClick={() => startAdopt('cat')}>
                  <Icon paths={ICONS.cat} />
                </Btn>
                <Btn label="Adopter un chien" data={{ action: 'adopt-dog' }} onClick={() => startAdopt('dog')}>
                  <Icon paths={ICONS.dog} />
                </Btn>
                <Btn label="Adopter un robot" data={{ action: 'adopt-robot' }} onClick={() => startAdopt('robot')}>
                  <Icon paths={ICONS.robot} />
                </Btn>
              </>
            )
          )}
        </div>
      )}

      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Catégories de meubles">
          {cats.map((c) => (
            <Btn key={c.id} label={c.label} pressed={shownCategory === c.id} data={{ category: c.id }} onClick={() => { reset(); setCategory(c.id); }}>
              <Icon paths={CATEGORY_ICON[c.id]} />
            </Btn>
          ))}
        </div>
      )}

      {editing && (
        <div className="wmt-lib-row">
          {(cats.find((c) => c.id === shownCategory)?.kinds ?? []).map((kind) => (
            <Btn
              key={kind}
              label={`Poser : ${labelOf(kind)}`}
              pressed={tool?.type === 'new' && tool.kind === kind}
              data={{ kind }}
              onClick={() => startNew(kind)}
            >
              <Icon paths={KIND_ICON[kind]} />
            </Btn>
          ))}
          {selectedId && (
            <>
              <Btn label="Déplacer" pressed={tool?.type === 'move'} data={{ action: 'move' }} onClick={startMove}>
                <Icon paths={ICONS.move} />
              </Btn>
              <Btn label="Retirer" data={{ action: 'remove' }} onClick={() => void removeSelected()}>
                <Icon paths={ICONS.trash} />
              </Btn>
              {selectedLamp && (
                <Btn label={selectedLamp.on ? 'Éteindre la lampe' : 'Allumer la lampe'} pressed={selectedLamp.on} data={{ action: 'lamp' }} onClick={() => void editLayout((l) => toggleLamp(l, selectedLamp.id))}>
                  <Icon paths={ICONS.bulb} />
                </Btn>
              )}
              {selectedWindow && (
                <>
                  <Btn label="Fenêtre plus étroite" data={{ action: 'win-w-' }} onClick={() => resizeSelected(-1, 0)}><Icon paths={ICONS.widthMinus} /></Btn>
                  <Btn label="Fenêtre plus large" data={{ action: 'win-w+' }} onClick={() => resizeSelected(1, 0)}><Icon paths={ICONS.widthPlus} /></Btn>
                  <Btn label="Fenêtre moins haute" data={{ action: 'win-h-' }} onClick={() => resizeSelected(0, -1)}><Icon paths={ICONS.heightMinus} /></Btn>
                  <Btn label="Fenêtre plus haute" data={{ action: 'win-h+' }} onClick={() => resizeSelected(0, 1)}><Icon paths={ICONS.heightPlus} /></Btn>
                </>
              )}
            </>
          )}
          {collection && (
            <Btn label="Ajouter une carte" pressed={tool?.type === 'card'} data={{ action: 'add-card' }} onClick={startCard}>
              <Icon paths={ICONS.card} />
            </Btn>
          )}
          <span className="wmt-lib-sep" />
          <Btn label="Agrandir la pièce à gauche" data={{ action: 'extend-left' }} onClick={() => void extend('left')}>
            <Icon paths={ICONS.extendLeft} />
          </Btn>
          <Btn label="Réduire la pièce à gauche" data={{ action: 'shrink-left' }} onClick={() => void shrink('left')}>
            <Icon paths={ICONS.shrinkLeft} />
          </Btn>
          <Btn label="Réduire la pièce à droite" data={{ action: 'shrink-right' }} onClick={() => void shrink('right')}>
            <Icon paths={ICONS.shrinkRight} />
          </Btn>
          <Btn label="Agrandir la pièce à droite" data={{ action: 'extend-right' }} onClick={() => void extend('right')}>
            <Icon paths={ICONS.extendRight} />
          </Btn>
        </div>
      )}

      <div className="wmt-lib-msg" role="status">
        {message}
      </div>

      <div className="wmt-lib-stage" ref={stage.ref} data-stage>
        <div
          className="wmt-lib-scroll"
          data-scroll
          ref={scrollRef}
          style={{
            // En plein écran : la fenêtre visible (24 ou 16 colonnes sur 510 de haut) prend la plus grande taille qui tient dans l'écran.
            maxWidth: stage.active ? `min(100vw, calc(100vh * ${visibleWidth} / ${HEIGHT}))` : portrait ? 480 : 960,
            ...(dragging ? { overflowX: 'hidden', touchAction: 'none' } : {}),
          }}
        >
          <RoomView
            room={room}
            editing={editing}
            cellsActive={cellsActive}
            selectedId={selectedId}
            blink={blink}
            sceneView={sceneView}
            light={lightOn}
            onCell={(col, row) => void onCell(col, row)}
            onPick={(id) => void onPick(id)}
            cards={roomCards.cards}
            onCardTap={onCardTap}
            pets={sim.views}
            petFrames={sim.frames}
            petAttach={sim.attach}
            onPetTap={(id) => sim.touch(id)}
            onFurnitureDown={onFurnitureDown}
            onFurnitureMove={onFurnitureMove}
            onFurnitureUp={press.cancel}
            drag={drag ? ({ id: drag.id, x: drag.x, y: drag.y, ok: drag.target.ok, ghost: drag.target.ghost, ghostPx: drag.target.ghostPx } satisfies DragView) : null}
          />
        </div>
        {picking && <CardPickerDialog cards={roomCards.list} taken={placedSlugs(layout)} categoryOf={roomCards.categoryOf} allowed={['wall', 'shelf', 'screen']} onChoose={chooseCard} onClose={() => setPicking(false)} />}
        {viewing && roomCards.cards[viewing] && (
          <RoomCardDialog
            slug={viewing}
            card={roomCards.cards[viewing]}
            onOpenMarket={(slug) => onOpenMarket?.(slug)}
            onOpenCard={(slug) => onOpenCard?.(slug)}
            onClose={() => setViewing(null)}
          />
        )}
        {stage.active && <FullscreenButton active onClick={stage.toggle} right={8} />}
      </div>
    </div>
  );
}
