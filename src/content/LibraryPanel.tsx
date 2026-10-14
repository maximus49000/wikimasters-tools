import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import {
  activeRoom,
  adoptPet,
  removePet,
  renamePet,
  createInitialState,
  addRoom,
  countExclusive,
  setRoomStyle,
  deleteRoom,
  extendRoom,
  renameRoom,
  setActive,
  setCityEpoch,
  setHome,
  setOrientation,
  setPetPlan,
  setRoomScene,
  setTimeSetting,
  setWeatherSetting,
  shrinkRoom,
  fitRoomWidth,
  updateLayout,
} from '../core/library/library-book';
import { STEAMPUNK_ONLY, isSmallKind, WINDOW_MAX, WINDOW_MIN } from '../core/library/furniture-catalog';
import { type Coat, type Pet, type Species, type TimeSetting, type WeatherSetting, type FurnitureKind, type LibraryState, type Orientation, type PetPlan, type StyleId, type StoredDisplay } from '../core/library/library-types';
import type { LibraryRepo } from '../core/library/library-repo';
import {
  MAX_COLS,
  MIN_COLS,
  CELL_W,
  CELL_H,
  HEIGHT,
  ROWS,
  WALL_ROWS,
  pxRect,
  rectOf,
  SECTION,
  VISIBLE_COLS,
  resizeWindow,
  stretchWindow,
  windowFit,
  canShiftRow,
  shiftRow,
  placedSlugs,
  unplaceCard,
  isLamp,
  isLit,
  isStanding,
  toggleLamp,
  removeFurniture,
  sectionIsEmpty,
  fitsWithin,
  screenCols,
  SHELF_FULL_MESSAGE,
  displayOf,
  type Cell,
} from '../core/library/room-grid';
import { formatMinutes } from '../core/library/time-setting';
import { useSceneTime } from './use-scene-time';
import { useCityDay } from './use-city-calendar';
import { useShopNames } from './use-shop-names';
import { useBusLines } from './use-bus-lines';
import { dayNumber } from '../core/library/city/shops/hours';
import { useWeather } from './use-weather';
import { useLightEnabled } from './light-setting';
import { useZoneChoice } from './zone-setting';
import { usePetContext } from './pet-context';
import { usePetSim } from './pet-sim';
import { ensurePosition, positionFailure, requestPosition, subscribePosition } from './scene-position';
import { positionSetting } from './position-setting';
import { nextInStack, stackAt } from '../core/library/depth-order';
import { canToggleShelfLink, shelfGroupOf, toggleShelfLink } from '../core/library/shelf-link';
import { canRotate, commitPlacement, displayOfPlacement, displayPlacement, editPlacement, movePlacement, moveToItem, nudgePlacement, placingView, rotatePlacement, spotAt, startPlacement, type Edit, type Placement, type Spot, type Subject } from './placement';
import { PlacementBar, PlacementGrip } from './placement-bar';
import { pointerToCell } from './furniture-drag';
import { followPointer } from './pointer-follow';
import { createLongPress } from './long-press';
import { useFullscreen } from './fullscreen';
import { lockOrientation, unlockOrientation } from './orientation-lock';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { CardPickerDialog, type CardChoice } from './CardPickerDialog';
import { useRoomCards } from './library-cards-data';
import { RoomCardDialog } from './RoomCardDialog';
import { RoomView } from './RoomView';
import { Btn, Icon, ICONS } from './library-ui';
import { LibraryTopBar } from './library-topbar';
import { NEXT_ZONE, SkyMenu } from './library-sky-menu';
import { PetsMenu, SPECIES_TEXT } from './library-pets-menu';
import { RoomMenu } from './library-room-menu';
import { BuildDrawer, INITIAL_DRAWER, type DrawerState } from './build-drawer';
import { ActionBubble } from './action-bubble';
import { useOutsideCamera, type OutsidePhase } from './outside/use-outside-camera';
import type { Rect } from '../core/library/outside-camera';
import { cameraOf, zoomTargetOf, type Box } from '../core/library/zoom-target';
import { FurnitureZoom, ZOOM_MS, ZOOM_REDUCED_MS } from './furniture-zoom';
import { useFurnitureZoom } from './use-furniture-zoom';
import { reducedMotion } from './ghibli-sky';
import { getImageService } from './image-registry';

// Aide affichée pendant un placement valide.
const PLACE_HINT = 'Glissez ✥ ou touchez l’endroit voulu.';

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
.wmt-lib-zone-glyph{font-size:11px;font-weight:600}
.wmt-lib-dialog{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}
.wmt-lib-dialog-panel{box-sizing:border-box;width:100%;max-width:min(92vw,480px);max-height:80vh;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:12px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:var(--color-surface,#0d1117);color:var(--color-foreground,#e6edf3);font:14px/20px system-ui,sans-serif}
.wmt-lib-picklist{display:flex;flex-direction:column;gap:6px}
.wmt-lib-pick{justify-content:flex-start;border-radius:10px;text-align:left}
.wmt-lib-pick:disabled{opacity:.4;cursor:not-allowed}
.wmt-lib-btn:disabled{opacity:.4;cursor:not-allowed}
.wmt-lib-btn[data-suggested="true"]{border-color:var(--color-accent,#34d399);color:var(--color-accent,#34d399)}
.wmt-lib-rooms{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center}
.wmt-lib-pop{position:relative;display:inline-flex}
.wmt-lib-pop-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:20;display:flex;flex-direction:column;gap:8px;min-width:240px;max-width:min(92vw,420px);max-height:70vh;overflow:auto;padding:10px;border-radius:12px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:var(--color-surface,#0d1117);box-shadow:0 8px 24px rgba(0,0,0,.4)}
.wmt-lib-pop-panel[hidden]{display:none}
.wmt-lib-pop-panel[data-align="start"]{right:auto;left:0}
.wmt-lib-pop-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wmt-lib-drawer{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;flex-direction:column;gap:6px;padding:6px 8px 8px;background:var(--color-surface,#0d1117);border-top:1px solid var(--color-border,rgba(148,163,184,.35));box-shadow:0 -6px 18px rgba(0,0,0,.35)}
.wmt-lib-drawer[hidden]{display:none}
.wmt-lib-drawer-reduced{left:50%;right:auto;transform:translateX(-50%);padding:0;background:transparent;border:0;box-shadow:none}
.wmt-lib-drawer-reduced .wmt-lib-btn{min-height:32px;background:rgba(0,0,0,.65);color:#fff;border:0;border-radius:16px 16px 0 0}
.wmt-lib-drawer-tabs{display:flex;gap:6px;align-items:center}
.wmt-lib-drawer-panel{display:flex;flex-direction:column;gap:6px}
.wmt-lib-drawer-panel[hidden]{display:none}
.wmt-lib-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.wmt-lib-chip{padding:0 10px;white-space:nowrap;font-size:13px;flex:0 0 auto}
.wmt-lib-subchips .wmt-lib-chip{min-height:32px;font-size:12px}
.wmt-lib-thumbs{display:flex;flex-direction:row;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.wmt-lib-thumb{flex:0 0 auto;flex-direction:column;width:64px;height:72px;padding:4px;border-radius:10px;gap:2px}
.wmt-lib-thumb-name{font-size:10px;line-height:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wmt-lib-stage[data-editing="true"]{padding-bottom:var(--wmt-drawer-h,0px)}
.wmt-lib-stage:fullscreen{box-sizing:border-box}
.wmt-lib-bubble{position:absolute;z-index:6;display:flex;flex-wrap:wrap;gap:4px;max-width:min(92%,360px);padding:4px;border-radius:22px;background:var(--color-surface,#0d1117);border:1px solid var(--color-accent,#34d399);box-shadow:0 4px 14px rgba(0,0,0,.45)}
.wmt-lib-stage{--sims-panel:rgba(250,252,255,.94);--sims-line:#a9c6e8;--sims-blue:#2f7fd6;--sims-blue-dark:#1d5aa3;--sims-tile-top:#fff;--sims-tile-bot:#dce8f6;--sims-green:#4cc23a;--sims-red:#d23b2f;--sims-text:#2b3f5c;--sims-font:ui-rounded,'Nunito','Varela Round',system-ui,sans-serif}
.wmt-lib-drawer{left:6px;right:6px;bottom:6px;gap:6px;padding:0;background:transparent;border:0;box-shadow:none;font-family:var(--sims-font);font-weight:700;color:var(--sims-text)}
.wmt-lib-drawer-tabs{display:flex;align-items:center;gap:6px}
.wmt-lib-tabs-pill{display:flex;gap:2px;padding:3px;border-radius:18px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.wmt-lib-tabs-pill [role="tab"]{min-height:30px;border:0;border-radius:14px;padding:0 10px;gap:5px;color:#5d7594;font-weight:800;font-size:12px}
.wmt-lib-tabs-pill [role="tab"][aria-selected="true"]{background:linear-gradient(#4a97e8,var(--sims-blue));color:#fff}
.wmt-lib-drawer-tabs [data-action="drawer-reduce"]{width:36px;min-width:36px;height:36px;min-height:36px;padding:0;border-radius:50%;background:var(--sims-panel);border:2px solid var(--sims-line);color:var(--sims-blue);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.wmt-lib-drawer-panel{padding:6px;border-radius:14px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 4px 14px rgba(0,0,0,.35)}
.wmt-lib-drawer-body{display:flex;gap:6px}
.wmt-lib-cats{display:flex;flex-direction:column;gap:4px;padding-right:6px;border-right:2px solid #e1ebf7}
.wmt-lib-cat{width:40px;height:40px;min-width:40px;min-height:40px;padding:0;border-radius:10px;color:#6c86a8;background:linear-gradient(var(--sims-tile-top),#edf3fb);border:1.5px solid #d4e2f3}
.wmt-lib-cat[aria-pressed="true"]{color:#fff;background:linear-gradient(#4a97e8,var(--sims-blue));border-color:var(--sims-blue-dark)}
.wmt-lib-drawer-right{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.wmt-lib-cat-title{font-weight:800;font-size:13px;line-height:24px;color:var(--sims-blue-dark)}
.wmt-lib-subchips .wmt-lib-chip{min-height:24px;padding:0 9px;font-size:11px;font-weight:700;color:#5d7594;background:#eef4fb;border:1.5px solid #d4e2f3}
.wmt-lib-subchips .wmt-lib-chip[aria-pressed="true"]{background:#fff;color:var(--sims-blue);border-color:var(--sims-blue)}
.wmt-lib-thumbs{display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,64px);grid-auto-columns:60px;gap:6px;overflow-x:auto}
.wmt-lib-thumb{width:auto;height:auto;border-radius:9px;color:#4e6687;background:linear-gradient(var(--sims-tile-top),var(--sims-tile-bot));border:1.5px solid #c9dbf0;box-shadow:0 1px 2px rgba(40,70,110,.25)}
.wmt-lib-thumb-name{font-size:9.5px;font-weight:800}
.wmt-lib-drawer-panel[data-drawer-panel="room"] .wmt-lib-btn{color:var(--sims-blue);border-color:var(--sims-line);background:#fff}
.wmt-lib-drawer-panel[data-drawer-panel="room"] .wmt-lib-btn[aria-pressed="true"]{border-color:var(--sims-blue);box-shadow:0 0 0 2px rgba(47,127,214,.25)}
.wmt-lib-drawer-reduced{bottom:0;left:50%;right:auto}
.wmt-lib-drawer-reduced .wmt-lib-btn{width:96px;min-height:30px;background:var(--sims-panel);color:var(--sims-blue);border:2px solid var(--sims-line);border-bottom:0;border-radius:16px 16px 0 0;box-shadow:0 -2px 8px rgba(0,0,0,.3)}
.wmt-lib-bubble{gap:2px;padding:4px;border-radius:12px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 4px 10px rgba(0,0,0,.35);color:var(--sims-blue)}
.wmt-lib-bubble .wmt-lib-btn{min-width:34px;min-height:34px;padding:0;border:0;border-radius:9px;color:var(--sims-blue)}
.wmt-lib-bubble .wmt-lib-btn[aria-pressed="true"]{background:#e4effb}
.wmt-lib-bubble [data-action="remove"]{color:var(--sims-red)}
.wmt-lib-placebar{align-items:center;flex-wrap:nowrap}
.wmt-lib-placebar-sep{width:2px;height:26px;margin:0 3px;background:#dbe6f3}
.wmt-lib-bubble .wmt-lib-cancel{border-radius:50%;color:#fff;background:linear-gradient(#ef6a5f,var(--sims-red))}
.wmt-lib-bubble .wmt-lib-confirm{min-width:40px;min-height:40px;border-radius:50%;color:#fff;background:linear-gradient(#6fdc5c,#3ea92f);box-shadow:inset 0 -2px 0 rgba(0,0,0,.18)}
.wmt-lib-bubble .wmt-lib-confirm:disabled{opacity:1;background:#c9d3de;color:#eef2f6}
.wmt-lib-grip-box{position:absolute;z-index:6}
.wmt-lib-grip{width:32px;height:32px;padding:0;border-radius:50%;display:grid;place-items:center;cursor:grab;background:var(--sims-panel);border:2px solid var(--sims-line);color:var(--sims-blue);box-shadow:0 2px 5px rgba(0,0,0,.3)}
.wmt-lib-zoom{position:absolute;inset:0;z-index:30}
.wmt-lib-zoom-backdrop{position:absolute;inset:0;background:transparent}
.wmt-lib-zoom-piece{position:absolute;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
@keyframes wmt-zoom-pivot{0%{transform:scaleX(1)}50%{transform:scaleX(0)}100%{transform:scaleX(1)}}
.wmt-lib-fab{position:absolute;top:8px;z-index:7;width:38px;height:38px;padding:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;background:var(--sims-panel);border:2px solid var(--sims-line);color:var(--sims-blue);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.wmt-lib-fab:disabled{opacity:.6}
.wmt-lib-switch{position:absolute;top:8px;right:54px;z-index:7;display:flex;gap:2px;padding:3px;border-radius:19px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.wmt-lib-switch button{width:34px;height:28px;padding:0;border:0;border-radius:14px;display:grid;place-items:center;cursor:pointer;background:transparent;color:#7d93b0}
.wmt-lib-switch button[aria-pressed="true"]{background:linear-gradient(#4a97e8,var(--sims-blue));color:#fff}
.wmt-lib-stage-msg{position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:7;max-width:80%;padding:6px 12px;border-radius:14px;font:800 12px/16px var(--sims-font);color:var(--sims-text);background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 2px 6px rgba(0,0,0,.3);text-align:center}
@media (orientation:landscape){.wmt-lib-stage:fullscreen{padding-bottom:0}.wmt-lib-stage:fullscreen .wmt-lib-drawer-panel{background:rgba(250,252,255,.62)}.wmt-lib-stage:fullscreen .wmt-lib-cat:not([aria-pressed="true"]),.wmt-lib-stage:fullscreen .wmt-lib-thumb{background:rgba(255,255,255,.6)}.wmt-lib-stage:fullscreen .wmt-lib-thumbs{grid-template-rows:58px;grid-auto-columns:56px}.wmt-lib-stage:fullscreen .wmt-lib-cats{display:grid;grid-template-columns:repeat(2,30px);align-content:start;gap:3px}.wmt-lib-stage:fullscreen .wmt-lib-cat{width:30px;height:30px;min-width:30px;min-height:30px}}
`;

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
  const [zoneChoice, setZoneChoice] = useZoneChoice();
  const zoneLabel = zoneChoice === 'auto' ? 'automatique' : `zone ${zoneChoice}`;
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  // Zoom de face sur une étagère ou un bureau (Visiter) ; zoomRef : zoom courant relu par les gestionnaires.
  // Le retour Android/navigateur ferme d'abord la fiche ouverte par-dessus le zoom.
  const { zoom, open: openZoom, close: closeZoom, reset: resetZoom } = useFurnitureZoom(() => {
    if (!viewingRef.current) return false;
    setViewing(null);
    return true;
  });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [lib, setLib] = useState<LibraryState | null>(library.current());
  const [mode, setMode] = useState<'visit' | 'edit'>('visit');
  const [drawer, setDrawer] = useState<DrawerState>(INITIAL_DRAWER);
  // Placement en cours (objet neuf, carte choisie ou objet déplacé) : rien n'est enregistré avant ✓.
  const [placement, setPlacement] = useState<Placement | null>(null);
  // Glissé du fantôme : placement courant relu par les écouteurs, arrêt du suivi, clic à avaler après le relâcher.
  const placementRef = useRef<Placement | null>(null);
  const stopFollow = useRef<(() => void) | null>(null);
  const swallowClick = useRef(false);
  const [following, setFollowing] = useState(false);
  useEffect(() => () => stopFollow.current?.(), []);
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
  const lastPointer = useRef({ x: 0, y: 0 });
  const pressedId = useRef<string | null>(null);
  // Dernier objet touché : seul un nouveau toucher du même objet passe à celui de derrière.
  const lastTapped = useRef<string | null>(null);
  const startDragRef = useRef<(id: string) => void>(() => undefined);
  const press = useMemo(() => createLongPress(() => { if (pressedId.current) startDragRef.current(pressedId.current); }), []);
  useEffect(() => press.cancel, [press]);
  const sceneTime = useSceneTime(lib?.time ?? { mode: 'real' });
  const weather = useWeather(lib?.weather ?? { mode: 'random' });
  // Jour de la ville (week-end, férié, école…) : stable tant que la date ne change pas.
  const hasCity = lib?.rooms.some((r) => r.scene === 'city') ?? false;
  const cityDay = useCityDay(sceneTime.date, hasCity);
  const shopNames = useShopNames(hasCity);
  const busLines = useBusLines(hasCity);
  // Rue commerçante : chaque pièce Ville reçoit une fois son jour de départ (tous les locaux occupés ce jour-là) ; écriture notifiée, pour que la pièce affichée le porte aussitôt.
  const today = dayNumber(sceneTime.date);
  useEffect(() => {
    const ids = lib?.rooms.filter((r) => r.scene === 'city' && r.cityEpoch === undefined).map((r) => r.id) ?? [];
    if (ids.length > 0) void library.update((state) => setCityEpoch(state, ids, today));
  }, [lib, library, today]);
  // Vue des fenêtres mémoïsée : ciel et heure changent à la minute, les drapeaux de la météo rarement ; l'horloge est stable.
  const sceneView = useMemo(
    () => ({
      sky: sceneTime.sky,
      minutes: sceneTime.minutes,
      weather: { clock: weather.clock, flags: weather.flags },
      city: { day: cityDay, forcedNight: lib?.time.mode === 'night', shopNames, busLines },
    }),
    [sceneTime.sky, sceneTime.minutes, weather.clock, weather.flags, cityDay, shopNames, busLines, lib?.time.mode],
  );


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

  // Pièce horizontale en plein écran sur un écran en paysage : la pièce couvre tout l'écran, sans bandes noires.
  const [outsidePhase, setOutsidePhase] = useState<OutsidePhase>('inside');
  const outsideFrom = useRef<{ rect: Rect | null; left: number; top: number } | null>(null);
  const outside = outsidePhase !== 'inside';
  const screenSize = useScreenSize(stage.active);
  const fill = stage.active && orientationNow === 'landscape' && screenSize.width > screenSize.height;
  // Plein écran sur un écran en hauteur : la pièce prend toute la hauteur laissée par le tiroir et défile en largeur.
  const tall = stage.active && !fill && screenSize.height > screenSize.width;
  const fitCols = screenCols(screenSize.width, screenSize.height);
  // Pièce plus étroite que l'écran : elle s'élargit d'elle-même à la largeur exacte de l'écran (mur vide ajouté à droite),
  // pour garder le ciel et le sol entiers sans bandes noires. Une pièce plus large n'est réduite que par le bouton.
  const roomIdNow = lib ? activeRoom(lib).id : null;
  // Dehors, on n'élargit pas la pièce : la vue de la rue ne montre pas les murs.
  useEffect(() => {
    if (!fill || outside || roomIdNow === null || colsNow >= fitCols) return;
    void library.update((state) => fitRoomWidth(state, roomIdNow, fitCols));
  }, [fill, outside, roomIdNow, colsNow, fitCols, library]);

  // Retour à l'intérieur au changement de pièce et en Aménager (le bouton Aménager reste cliquable).
  // useLayoutEffect : aucune image peinte avec la nouvelle pièce encore dehors ; le défilement de l'ancienne pièce ne s'applique pas à la nouvelle.
  useLayoutEffect(() => { outsideFrom.current = null; setOutsidePhase('inside'); resetZoom(); }, [roomIdNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const editingNow = mode === 'edit';
  useLayoutEffect(() => { if (editingNow) { setOutsidePhase('inside'); resetZoom(); } }, [editingNow]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sortie du plein écran : le zoom se ferme aussitôt (pas à l'entrée).
  const wasActive = useRef(stage.active);
  useEffect(() => {
    if (wasActive.current && !stage.active) resetZoom();
    wasActive.current = stage.active;
  }, [stage.active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Échap ferme le zoom ; la fiche ouverte par-dessus se ferme seule d'abord.
  const zoomOpen = zoom !== null;
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !viewingRef.current) closeZoom(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sortir : la zone visible de la pièce (en pixels du monde) est mémorisée pour que la caméra parte de là, et le défilement pour le retour.
  const goOutside = (): void => {
    // Pas de passage d'un meuble zoomé à l'extérieur.
    if (zoomRef.current) return;
    const sc = scrollRef.current;
    const svg = sc?.querySelector('svg[role="img"]');
    const s = svg?.getBoundingClientRect();
    const roomNow = lib ? activeRoom(lib) : null;
    const rect = sc && s && roomNow && s.width > 0 && s.height > 0
      ? { x: (sc.scrollLeft / s.width) * roomNow.cols * CELL_W, y: (sc.scrollTop / s.height) * HEIGHT, w: (sc.clientWidth / s.width) * roomNow.cols * CELL_W, h: (sc.clientHeight / s.height) * HEIGHT }
      : null;
    outsideFrom.current = { rect, left: sc?.scrollLeft ?? 0, top: sc?.scrollTop ?? 0 };
    setOutsidePhase('leaving');
  };
  const goInside = (): void => setOutsidePhase('returning');

  const camRoom = lib ? activeRoom(lib) : null;
  useOutsideCamera({
    svg: () => scrollRef.current?.querySelector<SVGSVGElement>('svg[role="img"]') ?? null,
    box: () => scrollRef.current,
    world: camRoom ? { w: camRoom.cols * CELL_W, h: WALL_ROWS * CELL_H } : { w: 0, h: 0 },
    phase: outsidePhase,
    from: outsideFrom.current?.rect ?? null,
    windows: camRoom ? camRoom.layout.filter((p) => p.kind === 'window').flatMap((p) => { const r = rectOf(p); return r ? [pxRect(r)] : []; }) : [],
    onSettled: (p) => setOutsidePhase(p),
  });

  // Retour fini : le défilement d'avant la sortie est rétabli.
  useLayoutEffect(() => {
    if (outsidePhase === 'inside' && outsideFrom.current) {
      const sc = scrollRef.current;
      if (sc) {
        sc.scrollLeft = outsideFrom.current.left;
        sc.scrollTop = outsideFrom.current.top;
      }
      outsideFrom.current = null;
    }
  }, [outsidePhase]);

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

  // La largeur de la pièce change (ajustement automatique à l'écran) : le placement en cours est abandonné.
  useEffect(() => {
    if (placementRef.current) cancelRef.current();
  }, [colsNow]);
  // Échap abandonne le placement en cours.
  const cancelRef = useRef<() => void>(() => undefined);
  const placingNow = placement !== null;
  useEffect(() => {
    if (!placingNow) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placingNow]);

  if (!lib) return <div className="wmt-lib" data-wmt-library />;

  const room = activeRoom(lib);
  const layout = room.layout;
  const editing = mode === 'edit';
  const portrait = room.orientation === 'portrait';
  const visibleWidth = VISIBLE_COLS[room.orientation] * CELL_W;
  // Hauteur d'écran laissée à la pièce en plein écran : en Aménager, le tiroir (--wmt-drawer-h) en prend le bas. Sur un écran
  // en paysage, le tiroir (toute la largeur, translucide) flotte par-dessus la pièce, qui garde tout l'écran ; il se cache
  // pendant la pose et se réduit pour dégager le sol.
  const drawerFloats = stage.active && screenSize.width > screenSize.height;
  const screenH = editing && !drawerFloats ? 'calc(100vh - var(--wmt-drawer-h, 0px))' : '100vh';
  const editLayout = (change: Parameters<typeof updateLayout>[2]) => library.update((state) => updateLayout(state, room.id, change));

  const chooseStyle = (id: StyleId): void => {
    if (id === room.style) return;
    if (room.style === 'steampunk' && id !== 'steampunk' && countExclusive(room) > 0
      && !window.confirm('Retirer les meubles Steampunk (globe, télescope, automate) de cette pièce ?')) return;
    reset();
    if (drawer.category === 'steampunk' && id !== 'steampunk') setDrawer((d) => ({ ...d, category: 'storage', sub: null }));
    void library.update((state) => setRoomStyle(state, room.id, id));
  };
  const reset = (): void => {
    setPlacement(null);
    placementRef.current = null;
    stopFollow.current?.();
    stopFollow.current = null;
    setFollowing(false);
    setSelectedId(null);
    setBlink([]);
    setMessage('');
    setPicking(false);
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
  cancelRef.current = reset;

  const REASONS = { ...REFUSALS, 'not-desk': 'Un ordinateur se pose sur un bureau.', 'desk-busy': 'Ce bureau a déjà un ordinateur.', 'desk-middle': 'Libérez le milieu du bureau pour y poser l’ordinateur.', 'not-slot': 'Déposez l’objet sur une tablette de l’étagère.', 'shelf-full': SHELF_FULL_MESSAGE, 'host-busy': 'Plus de place sur ce meuble.', 'not-host': 'Déposez l’objet sur un bureau ou une étagère.', 'not-screen': 'Touchez un ordinateur.' } as const;
  // Case au centre de la partie visible de la pièce (au milieu de la pièce si elle n'est pas mesurable, par exemple dans les tests).
  const centerSpot = (): Spot => {
    const sc = scrollRef.current;
    const svg = sc?.querySelector('svg[role="img"]');
    const box = svg?.getBoundingClientRect();
    if (!sc || !box || box.width === 0 || box.height === 0) return spotAt(Math.floor(room.cols / 2), ROWS - 3);
    const x = ((sc.scrollLeft + sc.clientWidth / 2) / box.width) * room.cols * CELL_W;
    const y = ((sc.scrollTop + sc.clientHeight / 2) / box.height) * HEIGHT;
    return spotAt(Math.floor(x / CELL_W), Math.min(ROWS - 1, Math.floor(y / CELL_H)));
  };
  // Le fantôme bouge : l'aide ou la raison du refus s'affiche, et les cases fautives sont marquées.
  const showPlacement = (next: Placement): void => {
    setPlacement(next);
    placementRef.current = next;
    setMessage(next.target.ok ? PLACE_HINT : next.target.reason ? REASONS[next.target.reason] : '');
    setBlink(next.target.ok ? [] : next.target.cells);
  };
  const startPlacementFor = (subject: Subject): void => {
    reset();
    showPlacement(startPlacement(layout, room.cols, subject, centerSpot()));
  };
  // ⟲ / ⟳ pendant le placement : tourne le fantôme d'un cran (refusé en rouge s'il ne tient pas).
  const rotatePlacing = (dir: 1 | -1): void => {
    if (!placement) return;
    const next = rotatePlacement(placement, room.cols, dir);
    if (next) showPlacement(next);
  };
  // ⟲ / ⟳ dans la bulle : ouvre le placement du meuble sélectionné, déjà tourné.
  const rotateSelected = (dir: 1 | -1): void => {
    if (!selectedId) return;
    const start = startPlacement(layout, room.cols, { type: 'move', id: selectedId }, centerSpot());
    reset();
    showPlacement(rotatePlacement(start, room.cols, dir) ?? start);
  };
  // Couverture ↔ tranche d'un objet rangé : pendant le placement, le fantôme change ; depuis la bulle, le placement s'ouvre déjà basculé.
  // Rien n'est enregistré avant ✓ ; refusé en rouge (« Plus de place sur cette tablette. ») si l'objet ne tient plus.
  const displayPlacing = (display: StoredDisplay): void => {
    if (placement) showPlacement(displayPlacement(placement, room.cols, display));
  };
  const displaySelected = (display: StoredDisplay): void => {
    if (!selectedId) return;
    const start = startPlacement(layout, room.cols, { type: 'move', id: selectedId }, centerSpot());
    reset();
    showPlacement(displayPlacement(start, room.cols, display));
  };
  // ✓ : une seule écriture, puis retour au tiroir ; après un déplacement, l'objet reste sélectionné.
  const confirmPlacement = async (): Promise<void> => {
    if (!placement) return;
    const done = commitPlacement(placement);
    if (!done) return;
    const keep = placement.subject.type === 'move' ? placement.id : null;
    // La pièce a changé pendant le placement (autre onglet, ajustement à l'écran) : on n'écrase rien, on recommence.
    const before = JSON.stringify(placement.base);
    if (JSON.stringify(layout) !== before) {
      reset();
      return refuse('La pièce a changé : recommencez.');
    }
    await editLayout((l) => (JSON.stringify(l) === before ? done : null));
    reset();
    if (keep) setSelectedId(keep);
  };
  const editPlacing = (edit: Edit): void => {
    if (!placement) return;
    const next = editPlacement(placement, room.cols, edit);
    if (next) showPlacement(next);
    else refuse('Impossible ici.');
  };
  const nudgePlacing = (delta: 1 | -1): void => {
    if (!placement) return;
    const next = nudgePlacement(placement, room.cols, delta);
    if (next) showPlacement(next);
    else refuse('Impossible ici.');
  };
  // Position du doigt → case et position dans le dessin (null si la pièce n'est pas affichée).
  const spotOfPointer = (clientX: number, clientY: number): Spot | null => {
    const svg = scrollRef.current?.querySelector('svg[role="img"]');
    if (!svg) return null;
    const { col, row, x, y } = pointerToCell(svg.getBoundingClientRect(), room.cols * CELL_W, HEIGHT, clientX, clientY);
    return { col, row, x, y };
  };
  // Glissé du fantôme (appui long, poignée ✥ ou objet lui-même) : un objet à case garde sous le doigt le décalage de la saisie,
  // un objet à porteur vise ce qui est sous le doigt. Au relâcher, le placement reste ouvert en attendant ✓.
  const followPlacement = (from: { x: number; y: number }): void => {
    stopFollow.current?.();
    const first = placementRef.current;
    const grab = spotOfPointer(from.x, from.y);
    if (!first || !grab) return;
    const keepOffset = first.target.col !== undefined && first.target.top !== undefined;
    const off = keepOffset ? { col: first.spot.col - grab.col, row: first.spot.row - grab.row } : { col: 0, row: 0 };
    const track = (clientX: number, clientY: number): void => {
      const current = placementRef.current;
      const at = spotOfPointer(clientX, clientY);
      if (!current || !at) return;
      const spot = keepOffset ? spotAt(at.col + off.col, at.row + off.row) : at;
      if (keepOffset && spot.col === current.spot.col && spot.row === current.spot.row) return;
      showPlacement(movePlacement(current, room.cols, spot));
    };
    setFollowing(true);
    stopFollow.current = followPointer({
      scroll: () => scrollRef.current,
      start: from,
      onMove: track,
      onEnd: (x, y) => {
        track(x, y);
        stopFollow.current = null;
        setFollowing(false);
        // Le clic que le navigateur envoie juste après le relâcher ne doit pas déplacer le fantôme.
        swallowClick.current = true;
        window.setTimeout(() => { swallowClick.current = false; }, 0);
      },
    });
  };
  // Pendant un placement, appuyer sur l'objet (son empreinte) le fait glisser.
  const onScrollPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = placementRef.current;
    if (!current || stopFollow.current) return;
    const at = spotOfPointer(event.clientX, event.clientY);
    const g = current.target.ghost;
    if (!at || !g || at.col < g.col || at.col >= g.col + g.w || at.row < g.row || at.row >= g.row + g.h) return;
    event.preventDefault();
    followPlacement({ x: event.clientX, y: event.clientY });
  };
  // Appui long sur un objet : l'interface de modification s'ouvre (placement), et l'objet suit aussitôt le doigt.
  startDragRef.current = (id: string): void => {
    setMode('edit');
    startPlacementFor({ type: 'move', id });
    followPlacement(lastPointer.current);
  };
  const onFurnitureDown = (id: string, event: ReactPointerEvent): void => {
    // En mode Visiter, l'appui long ne fait rien (seul le bouton « Aménager » ouvre l'aménagement), mais il est suivi pour
    // que le clic qui le termine n'allume pas ou n'éteigne pas une lampe.
    if (!editing) {
      pressedId.current = null;
      press.start(event.clientX, event.clientY);
      return;
    }
    // Pendant un placement, l'objet se glisse directement (onScrollPointerDown) : un appui long ne doit pas relancer le placement.
    if (placementRef.current) return;
    // L'objet de derrière sélectionné est redessiné devant, mais l'appui arrive au meuble de devant : on déplace celui qu'on voit.
    pressedId.current = selectedId && selectedId !== id && stackAt(layout, id).includes(selectedId) ? selectedId : id;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    press.start(event.clientX, event.clientY);
  };
  const onFurnitureMove = (event: ReactPointerEvent): void => {
    lastPointer.current = { x: event.clientX, y: event.clientY };
    press.move(event.clientX, event.clientY);
  };

  // Pendant un placement, les cases captent le toucher, sauf pour un objet qui vise un porteur (bureau, étagère, ordinateur).
  const placingKind = placement?.subject.type === 'move' ? placement.base.find((p) => p.id === placement.id)?.kind : undefined;
  const hostKind = placement !== null && (
    (placement.subject.type === 'new' && (placement.subject.kind === 'computer' || isSmallKind(placement.subject.kind)))
    || (placement.subject.type === 'card' && placement.subject.choice.target !== 'wall')
    || placingKind === 'computer' || placingKind === 'small' || placingKind === 'stored');
  const cellsActive = placement !== null && !hostKind;

  // Toucher un objet (accroché, rangé ou écran) : l'ouvre en mode Visiter, le sélectionne en mode Aménager.
  function onCardTap(id: string): void {
    if (press.consumeClick()) return;
    const item = layout.find((p) => p.id === id);
    if (!item) return;
    // Pendant un placement, toucher une carte rangée revient à toucher son étagère, et un écran son ordinateur.
    if (editing && placement) return void onPick(item.kind === 'stored' ? item.shelfId : item.id);
    if (!editing) {
      if (zoomRef.current) return;
      // Une carte rangée ou affichée sur un écran ouvre le zoom de son meuble ; la fiche s'ouvre ensuite depuis le zoom.
      if ((item.kind === 'stored' || item.kind === 'computer') && tryZoom(item.id)) return;
      const slug = item.kind === 'wall' || item.kind === 'stored' || item.kind === 'computer' ? item.slug : undefined;
      if (slug && roomCards.cards[slug]) setViewing(slug);
      return;
    }
    // L'écran d'un ordinateur se manie comme l'ordinateur.
    if (item.kind === 'computer') return void onPick(id);
    setSelectedId(nextInStack(layout, selectedId, id, lastTapped.current));
    lastTapped.current = id;
    setMessage('');
  }

  function onCell(col: number, row: number): void {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (placement) showPlacement(movePlacement(placement, room.cols, spotAt(col, row)));
  }

  // Rectangle d'un meuble dans la scène (départ du pivot) ; null si non mesurable (tests).
  const boxInStage = (id: string): Box | null => {
    const stageEl = stage.ref.current;
    const el = scrollRef.current?.querySelector(`[data-id="${id}"]`);
    if (!stageEl || !el) return null;
    const s = stageEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.width === 0 ? null : { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  };
  // Ouvre le zoom si l'objet touché mène à une étagère garnie ou à un bureau dont l'écran affiche une carte.
  const tryZoom = (id: string): boolean => {
    // Pas de zoom tant que la caméra extérieure n'est pas entièrement rentrée.
    if (outsidePhase !== 'inside') return false;
    const target = zoomTargetOf(layout, id);
    if (!target) return false;
    openZoom(target, boxInStage(target.id));
    return true;
  };

  async function onPick(id: string): Promise<void> {
    // Le clic qui suit un appui long n'est pas un vrai clic ; en mode Visiter, toucher une étagère garnie ou un bureau à écran ouvre le zoom,
    // toucher une lampe l'allume ou l'éteint, les autres meubles ne font rien.
    if (!editing) {
      if (press.consumeClick()) return;
      if (zoomRef.current) return;
      if (tryZoom(id)) return;
      if (layout.some((p) => p.id === id && isLamp(p))) void editLayout((l) => toggleLamp(l, id));
      return;
    }
    if (press.consumeClick()) return;
    const item = layout.find((p) => p.id === id);
    if (!item) return;
    if (placement) {
      if (swallowClick.current) {
        swallowClick.current = false;
        return;
      }
      if (id !== placingView(placement).id) showPlacement(moveToItem(placement, room.cols, id));
      return;
    }
    setSelectedId(nextInStack(layout, selectedId, id, lastTapped.current));
    lastTapped.current = id;
    setMessage('');
  }

  const startNew = (kind: FurnitureKind): void => {
    if ((STEAMPUNK_ONLY as readonly string[]).includes(kind) && room.style !== 'steampunk') return reset();
    startPlacementFor({ type: 'new', kind });
  };
  const startMove = (): void => {
    if (!selectedId) return;
    startPlacementFor({ type: 'move', id: selectedId });
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
  const placingItem = placement?.draft.find((p) => p.id === placement.id);
  const placingStanding = placingItem && isStanding(placingItem) && placingItem.kind !== 'rug' ? placingItem : undefined;
  const placingLamp = placingItem && isLamp(placingItem) ? { on: isLit(placingItem) } : null;
  const placingWindow = placingItem?.kind === 'window' ? placingItem : undefined;
  const selectedLamp = selectedItem && isLamp(selectedItem) ? { id: selectedItem.id, on: isLit(selectedItem) } : null;
  const selectedDisplay = selectedItem?.kind === 'stored' ? displayOf(selectedItem) : null;
  const placingDisplay = placement ? displayOfPlacement(placement) : null;
  // Bibliothèque sélectionnée : sa partenaire liée (contour) et le bouton ⛓ quand l'appui change quelque chose.
  const selectedShelf = selectedItem?.kind === 'shelf' ? selectedItem : undefined;
  const linkedToSelected = selectedShelf ? (shelfGroupOf(layout, selectedShelf.id).find((id) => id !== selectedShelf.id) ?? null) : null;
  const selectedStanding = editing && selectedItem && isStanding(selectedItem) && selectedItem.kind !== 'rug' ? selectedItem : undefined;
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
  // Fenêtre étirée d'un coup sur toute la largeur ou toute la hauteur du mur.
  const stretchSelected = (axis: 'width' | 'height'): void => {
    if (!selectedWindow) return;
    const check = stretchWindow(layout, room.cols, selectedWindow.id, axis);
    if (!check.ok) return refuse(REASONS[check.reason], check.cells);
    setMessage('');
    void editLayout((l, cols) => {
      const again = stretchWindow(l, cols, selectedWindow.id, axis);
      return again.ok ? again.layout : null;
    });
  };
  // « Ajouter une carte » : le sélecteur s'ouvre, et la carte choisie passe en placement.
  const startCard = (): void => {
    reset();
    setPicking(true);
  };
  const chooseCard = (choice: CardChoice): void => {
    setPicking(false);
    startPlacementFor({ type: 'card', choice });
  };

  // Agrandir à gauche décale les meubles : le défilement suit pour garder la même vue.
  async function extend(side: 'left' | 'right'): Promise<void> {
    if (room.cols + SECTION > MAX_COLS) return refuse('La pièce ne peut pas être plus large.');
    setMessage('');
    const el = scrollRef.current;
    if (side === 'left' && el) pendingScroll.current = (el.scrollWidth * SECTION) / room.cols;
    await library.update((state) => extendRoom(state, room.id, side));
  }
  async function shrink(side: 'left' | 'right'): Promise<void> {
    if (room.cols - SECTION < MIN_COLS) return refuse(`La pièce ne peut pas être plus étroite que ${MIN_COLS} colonnes.`);
    if (!sectionIsEmpty(layout, room.cols, side)) return refuse('Retirez d’abord les meubles de cette zone.');
    setMessage('');
    const el = scrollRef.current;
    if (side === 'left' && el) pendingScroll.current = -(el.scrollWidth * SECTION) / room.cols;
    await library.update((state) => shrinkRoom(state, room.id, side));
  }

  // Plein écran paysage : une pièce plus large que l'écran est réduite par la droite à sa largeur exacte.
  const fitToScreen = (): void => {
    if (!fitsWithin(layout, fitCols)) return refuse('Retirez d’abord les meubles qui dépassent à droite.');
    setMessage('');
    void library.update((state) => fitRoomWidth(state, room.id, fitCols));
  };

  // Changer d'onglet, de catégorie ou de sous-catégorie abandonne l'outil en cours, comme le faisaient les anciens boutons de catégorie.
  const onDrawer = (next: DrawerState): void => {
    if (next.tab !== drawer.tab || next.category !== drawer.category || next.sub !== drawer.sub) reset();
    setDrawer(next);
  };
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

  // Caméra du zoom : la pièce s'agrandit autour du meuble (mesuré une fois à l'ouverture), floutée et assombrie derrière la vue de face.
  const zoomMs = reducedMotion() ? ZOOM_REDUCED_MS : ZOOM_MS;
  const stageSize = { w: stage.ref.current?.clientWidth ?? 0, h: stage.ref.current?.clientHeight ?? 0 };
  const zoomStyle = ((): Record<string, string | number> => {
    if (!zoom) return {};
    const sc = scrollRef.current;
    // La transformation part du coin du conteneur, décalé dans la scène (centrage) : la caméra se calcule dans son repère,
    // où la scène visible commence en (−ox, −oy). Bornée pour que le conteneur agrandi couvre toujours toute la scène.
    const ox = sc?.offsetLeft ?? 0;
    const oy = sc?.offsetTop ?? 0;
    const box = { w: sc?.clientWidth ?? 0, h: sc?.clientHeight ?? 0 };
    const from = zoom.from;
    const cam = box.w > 0 && box.h > 0 && stageSize.w > 0 && stageSize.h > 0
      ? cameraOf(box, { x: -ox, y: -oy, w: stageSize.w, h: stageSize.h }, from ? { ...from, x: from.x - ox, y: from.y - oy } : null)
      : null;
    const on = zoom.phase !== 'closing';
    return {
      overflowX: 'hidden',
      overflowY: 'hidden',
      touchAction: 'none',
      transformOrigin: '0 0',
      transform: on && cam ? `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})` : 'none',
      filter: on ? 'blur(6px) brightness(0.55)' : 'none',
      transition: `transform ${zoomMs}ms ease-out, filter ${zoomMs}ms ease-out`,
    };
  })();
  const imageOfCard = (slug: string): string | undefined => {
    const url = roomCards.cards[slug]?.imageUrl;
    return getImageService()?.displayUrl(slug, url) ?? url;
  };

  return (
    <div className="wmt-lib" data-wmt-library>
      {!zoom && <LibraryTopBar
        rooms={lib.rooms}
        activeId={lib.activeRoomId}
        homeId={lib.homeRoomId}
        onRoom={chooseRoom}
        onAddRoom={() => { reset(); resetScroll(); void library.update(addRoom); }}
        editing={editing}
        onMode={setMode2}
        fullscreenActive={stage.active}
        onFullscreen={stage.toggle}
        sky={
          <SkyMenu
            scene={room.scene}
            onScene={(id) => void library.update((state) => setRoomScene(state, room.id, id))}
            time={lib.time}
            onTime={chooseTime}
            onMinutes={(minutes) => void library.update((state) => setTimeSetting(state, { mode: 'manual', minutes }))}
            sunLabel={`${sceneTime.times.kind === 'normal' ? `☀ ${formatMinutes(sceneTime.times.sunrise)} → ${formatMinutes(sceneTime.times.sunset)}` : sceneTime.times.polar === 'day' ? '☀ jour permanent' : '☾ nuit permanente'} · ${formatMinutes(sceneTime.minutes)}`}
            lightOn={lightOn}
            onLight={setLightOn}
            zoneChoice={zoneChoice}
            zoneLabel={zoneLabel}
            onZone={() => setZoneChoice(NEXT_ZONE[zoneChoice])}
            weather={lib.weather}
            onWeather={chooseWeather}
            positionOn={positionOn}
            weatherLabel={`${weather.label}${weather.tempC !== null ? ` · ${Math.round(weather.tempC)} °C` : ''}`}
            weatherNote={weather.real === 'fallback' ? `(simulée${positionOn && failure ? ` : ${FAILURE_LABEL[failure]}` : ''})` : null}
          />
        }
        pets={
          <PetsMenu
            roomId={room.id}
            pets={room.pets}
            adopting={adopting}
            adoptName={adoptName}
            adoptCoat={adoptCoat}
            onRename={(pet, name) => void library.update((state) => renamePet(state, room.id, pet.id, name))}
            onRemove={onRemovePet}
            onStartAdopt={startAdopt}
            onAdoptName={setAdoptName}
            onAdoptCoat={setAdoptCoat}
            onConfirm={confirmAdopt}
            onCancel={() => setAdopting(null)}
          />
        }
        roomMenu={
          <RoomMenu
            roomId={room.id}
            name={room.name}
            isHome={lib.homeRoomId === room.id}
            canDelete={lib.rooms.length > 1}
            onRename={(name) => void library.update((state) => renameRoom(state, room.id, name))}
            onToggleHome={() => void library.update((state) => setHome(state, state.homeRoomId === room.id ? null : room.id))}
            onDelete={onDeleteRoom}
          />
        }
      />}


      <div className="wmt-lib-msg" role="status">
        {message}
      </div>

      <div className="wmt-lib-stage" ref={stage.ref} data-stage data-editing={editing} data-zoom-open={zoom ? '' : undefined}>
        <div
          className="wmt-lib-scroll"
          data-scroll
          ref={scrollRef}
          onPointerDown={onScrollPointerDown}
          style={{
            // En plein écran : la fenêtre visible (24 ou 16 colonnes sur 510 de haut) prend la plus grande taille qui tient dans l'écran.
            maxWidth: fill ? 'none' : stage.active ? `min(100vw, calc(${screenH} * ${visibleWidth} / ${HEIGHT}))` : portrait ? 480 : 960,
            ...(fill ? { width: '100vw', height: screenH, overflowY: 'auto' } : {}),
            ...(tall ? { width: '100vw', maxWidth: 'none', height: screenH, overflowY: 'hidden' } : {}),
            ...(following ? { overflowX: 'hidden', touchAction: 'none' } : {}),
            // Dehors : la caméra règle le viewBox, le conteneur ne défile plus et prend le cadre de la fenêtre visible.
            ...(outside ? { ...(stage.active ? { width: '100vw', height: '100vh', maxWidth: 'none' } : { width: '100%', aspectRatio: `${visibleWidth} / ${HEIGHT}` }), overflow: 'hidden', touchAction: 'none', position: 'relative', userSelect: 'none', WebkitUserSelect: 'none' } : {}),
            // Zoom sur un meuble : défilement figé, caméra et flou.
            ...zoomStyle,
          }}
        >
          <RoomView
            room={placement ? { ...room, layout: placement.draft } : room}
            editing={editing}
            cellsActive={cellsActive}
            selectedId={selectedId}
            linkedId={editing ? linkedToSelected : null}
            blink={blink}
            sceneView={sceneView}
            light={lightOn}
            onCell={onCell}
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
            outside={outside}
            roomLayers={outsidePhase === 'leaving' || outsidePhase === 'outside' ? 'hidden' : 'shown'}
            fill={fill && !outside}
            fitScreen={room.cols === fitCols}
            fillHeight={tall && !outside ? screenH : undefined}
            placing={placement ? placingView(placement) : null}
          />
        </div>
        {editing && !outside && (
          <BuildDrawer
            state={drawer}
            onState={onDrawer}
            style={room.style}
            orientation={room.orientation}
            hasCollection={collection !== undefined}
            hidden={placement !== null}
            onKind={startNew}
            onCard={startCard}
            onStyle={chooseStyle}
            onOrientation={chooseOrientation}
            onExtend={(side) => void extend(side)}
            onShrink={(side) => void shrink(side)}
          />
        )}
        {editing && !outside && selectedId && !placement && (
          <ActionBubble stage={stage.ref.current} scroll={scrollRef.current} targetId={selectedId}>
            <Btn label="Déplacer" data={{ action: 'move' }} onClick={startMove}>
              <Icon paths={ICONS.move} />
            </Btn>
            <Btn label="Retirer" data={{ action: 'remove' }} onClick={() => void removeSelected()}>
              <Icon paths={ICONS.trash} />
            </Btn>
            {selectedItem && isStanding(selectedItem) && (
              <>
                <Btn label="Tourner à gauche" data={{ action: 'rotate-left' }} onClick={() => rotateSelected(1)}><Icon paths={ICONS.rotateLeft} /></Btn>
                <Btn label="Tourner à droite" data={{ action: 'rotate-right' }} onClick={() => rotateSelected(-1)}><Icon paths={ICONS.rotateRight} /></Btn>
              </>
            )}
            {selectedShelf && canToggleShelfLink(layout, selectedShelf.id) && (
              <Btn label={linkedToSelected ? 'Délier les bibliothèques' : 'Relier les bibliothèques'} pressed={linkedToSelected !== null} data={{ action: 'shelf-link' }} onClick={() => void editLayout((l) => toggleShelfLink(l, selectedShelf.id))}>
                <Icon paths={linkedToSelected ? ICONS.link : ICONS.unlink} />
              </Btn>
            )}
            {selectedStanding && (
              <>
                <Btn label="Avancer" data={{ action: 'depth-front' }} disabled={!canShiftRow(layout, room.cols, selectedStanding.id, 1)} onClick={() => void editLayout((l) => shiftRow(l, room.cols, selectedStanding.id, 1))}><Icon paths={ICONS.depthFront} /></Btn>
                <Btn label="Reculer" data={{ action: 'depth-back' }} disabled={!canShiftRow(layout, room.cols, selectedStanding.id, -1)} onClick={() => void editLayout((l) => shiftRow(l, room.cols, selectedStanding.id, -1))}><Icon paths={ICONS.depthBack} /></Btn>
              </>
            )}
            {selectedDisplay && <DisplayButtons current={selectedDisplay} onChoose={displaySelected} />}
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
                <Btn label="Fenêtre sur toute la largeur du mur" data={{ action: 'win-w-full' }} onClick={() => stretchSelected('width')}><Icon paths={ICONS.widthFull} /></Btn>
                <Btn label="Fenêtre sur toute la hauteur du mur" data={{ action: 'win-h-full' }} onClick={() => stretchSelected('height')}><Icon paths={ICONS.heightFull} /></Btn>
              </>
            )}
          </ActionBubble>
        )}
        {editing && !outside && placement && (
          <PlacementBar stage={stage.ref.current} scroll={scrollRef.current} targetId={placingView(placement).id} ok={placement.target.ok} onCancel={reset} onConfirm={() => void confirmPlacement()}>
            {canRotate(placement) && (
              <>
                <Btn label="Tourner à gauche" data={{ action: 'rotate-left' }} onClick={() => rotatePlacing(1)}><Icon paths={ICONS.rotateLeft} /></Btn>
                <Btn label="Tourner à droite" data={{ action: 'rotate-right' }} onClick={() => rotatePlacing(-1)}><Icon paths={ICONS.rotateRight} /></Btn>
              </>
            )}
            {placingStanding && (
              <>
                <Btn label="Avancer" data={{ action: 'depth-front' }} disabled={!nudgePlacement(placement, room.cols, 1)} onClick={() => nudgePlacing(1)}><Icon paths={ICONS.depthFront} /></Btn>
                <Btn label="Reculer" data={{ action: 'depth-back' }} disabled={!nudgePlacement(placement, room.cols, -1)} onClick={() => nudgePlacing(-1)}><Icon paths={ICONS.depthBack} /></Btn>
              </>
            )}
            {placingDisplay && <DisplayButtons current={placingDisplay} onChoose={displayPlacing} />}
            {placingLamp && (
              <Btn label={placingLamp.on ? 'Éteindre la lampe' : 'Allumer la lampe'} pressed={placingLamp.on} data={{ action: 'lamp' }} onClick={() => editPlacing({ type: 'lamp' })}>
                <Icon paths={ICONS.bulb} />
              </Btn>
            )}
            {placingWindow && (
              <>
                <Btn label="Fenêtre plus étroite" data={{ action: 'win-w-' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w - 1, h: placingWindow.h })}><Icon paths={ICONS.widthMinus} /></Btn>
                <Btn label="Fenêtre plus large" data={{ action: 'win-w+' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w + 1, h: placingWindow.h })}><Icon paths={ICONS.widthPlus} /></Btn>
                <Btn label="Fenêtre moins haute" data={{ action: 'win-h-' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w, h: placingWindow.h - 1 })}><Icon paths={ICONS.heightMinus} /></Btn>
                <Btn label="Fenêtre plus haute" data={{ action: 'win-h+' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w, h: placingWindow.h + 1 })}><Icon paths={ICONS.heightPlus} /></Btn>
                <Btn label="Fenêtre sur toute la largeur du mur" data={{ action: 'win-w-full' }} onClick={() => editPlacing({ type: 'stretch', axis: 'width' })}><Icon paths={ICONS.widthFull} /></Btn>
                <Btn label="Fenêtre sur toute la hauteur du mur" data={{ action: 'win-h-full' }} onClick={() => editPlacing({ type: 'stretch', axis: 'height' })}><Icon paths={ICONS.heightFull} /></Btn>
              </>
            )}
          </PlacementBar>
        )}
        {editing && !outside && placement && placingItem && (
          <PlacementGrip stage={stage.ref.current} scroll={scrollRef.current} targetId={placingView(placement).id} onGrab={(event) => { event.preventDefault(); followPlacement({ x: event.clientX, y: event.clientY }); }} />
        )}
        {picking && <CardPickerDialog cards={roomCards.list} taken={placedSlugs(layout)} categoryOf={roomCards.categoryOf} kinds={roomCards.kinds} allowed={['wall', 'shelf', 'screen']} onChoose={chooseCard} onClose={() => setPicking(false)} />}
        {/* Vue de face : sœur du conteneur de défilement, elle n'hérite ni du flou ni de la caméra ; la fiche passe par-dessus. */}
        {zoom && !editing && (
          <FurnitureZoom
            key={zoom.target.id}
            target={zoom.target}
            room={room}
            cards={roomCards.cards}
            imageOf={imageOfCard}
            phase={zoom.phase}
            from={zoom.from}
            stage={stageSize}
            onCard={(slug) => setViewing(slug)}
            onBack={closeZoom}
          />
        )}
        {viewing && roomCards.cards[viewing] && (
          <RoomCardDialog
            slug={viewing}
            card={roomCards.cards[viewing]}
            onOpenMarket={(slug) => onOpenMarket?.(slug)}
            onOpenCard={(slug) => onOpenCard?.(slug)}
            onClose={() => setViewing(null)}
          />
        )}
        {!editing && !zoom && (
          <button type="button" data-action={outside ? 'inside' : 'outside'} aria-label={outside ? 'Rentrer' : 'Sortir'} title={outside ? 'Rentrer' : 'Sortir'} onClick={outside ? goInside : goOutside} disabled={outsidePhase === 'leaving' || outsidePhase === 'returning'} className="wmt-lib-fab" style={{ left: 8 }}>
            <Icon paths={outside ? ICONS.house : ICONS.door} />
          </button>
        )}
        {stage.active && !zoom && (
          <button type="button" className="wmt-lib-fab" style={{ right: 8 }} aria-label="Quitter le plein écran" title="Quitter le plein écran" onClick={stage.toggle}>
            <Icon paths={ICONS.fullscreen} />
          </button>
        )}
        {stage.active && !zoom && (
          <div className="wmt-lib-switch" data-mode-switch role="group" aria-label="Mode">
            <button type="button" data-action="visit" aria-pressed={!editing} aria-label="Visiter" title="Visiter" onClick={() => setMode2('visit')}><Icon paths={ICONS.eye} /></button>
            <button type="button" data-action="edit" aria-pressed={editing} aria-label="Aménager" title="Aménager" onClick={() => setMode2('edit')}><Icon paths={ICONS.pencil} /></button>
          </div>
        )}
        {fill && !outside && !placement && !zoom && room.cols > fitCols && (
          <button type="button" data-action="fit-screen" onClick={fitToScreen} style={FIT_BUTTON}>
            Adapter à l’écran
          </button>
        )}
        {stage.active && message && <div aria-live="polite" className="wmt-lib-stage-msg">{message}</div>}
      </div>
    </div>
  );
}

// Bouton et message posés sur la pièce en plein écran, à gauche du bouton de sortie.
const FIT_BUTTON = { position: 'absolute', top: 4, right: 148, height: 32, padding: '0 12px', border: 0, borderRadius: 16, cursor: 'pointer', background: 'rgba(0,0,0,0.65)', color: '#fff', font: '13px/20px system-ui,sans-serif' } as const;

type ScreenSize = { width: number; height: number };

// Sélecteur de présentation d'un objet rangé : de face (couverture vers l'avant) ou sur la tranche (titre lisible).
function DisplayButtons({ current, onChoose }: { current: StoredDisplay; onChoose: (display: StoredDisplay) => void }): ReactElement {
  return (
    <>
      <Btn label="Présenter de face" pressed={current === 'cover'} data={{ action: 'display-cover' }} onClick={() => onChoose('cover')}><Icon paths={ICONS.cover} /></Btn>
      <Btn label="Présenter sur la tranche" pressed={current === 'spine'} data={{ action: 'display-spine' }} onClick={() => onChoose('spine')}><Icon paths={ICONS.spine} /></Btn>
    </>
  );
}

// Taille de l'écran, suivie seulement pendant le plein écran (rotation du téléphone, fenêtre redimensionnée).
function useScreenSize(watch: boolean): ScreenSize {
  const read = (): ScreenSize => (typeof window === 'undefined' ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (!watch) return;
    const sync = (): void => setSize((before) => {
      const next = read();
      return next.width === before.width && next.height === before.height ? before : next;
    });
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [watch]);
  return size;
}
