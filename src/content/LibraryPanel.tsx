import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
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
  nextFurnitureId,
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
import { categoriesFor, STEAMPUNK_ONLY, SMALL_ITEM_OF, isSmallKind, isStandingKind, labelOf, sizeOf, wallSizeOf, WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, type Category } from '../core/library/furniture-catalog';
import { STYLE_IDS, type Coat, type Pet, type Species, type TimeSetting, type WeatherSetting, type FurnitureKind, type Layout, type LibraryState, type Orientation, type PetPlan, type StandingKind, type StyleId } from '../core/library/library-types';
import type { LibraryRepo } from '../core/library/library-repo';
import {
  MAX_COLS,
  MIN_COLS,
  CELL_W,
  CELL_H,
  HEIGHT,
  WALL_ROWS,
  pxRect,
  rectOf,
  SECTION,
  VISIBLE_COLS,
  canHang,
  canHangRect,
  moveWindow,
  placeWindow,
  resizeWindow,
  stretchWindow,
  windowFit,
  canPlace,
  canShiftDepth,
  shiftDepth,
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
  fitsWithin,
  screenCols,
  type Cell,
} from '../core/library/room-grid';
import { STYLE_LABELS, paletteOf } from '../core/library/styles';
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
import { Btn, Icon, ICONS } from './library-ui';
import { LibraryTopBar } from './library-topbar';
import { NEXT_ZONE, SkyMenu } from './library-sky-menu';
import { PetsMenu, SPECIES_TEXT } from './library-pets-menu';
import { RoomMenu } from './library-room-menu';
import { useOutsideCamera, type OutsidePhase } from './outside/use-outside-camera';
import type { Rect } from '../core/library/outside-camera';

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
.wmt-lib-pop-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
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

  // Pièce horizontale en plein écran sur un écran en paysage : la pièce couvre tout l'écran, sans bandes noires.
  const [outsidePhase, setOutsidePhase] = useState<OutsidePhase>('inside');
  const outsideFrom = useRef<{ rect: Rect | null; left: number; top: number } | null>(null);
  const outside = outsidePhase !== 'inside';
  const screenSize = useScreenSize(stage.active);
  const fill = stage.active && orientationNow === 'landscape' && screenSize.width > screenSize.height;
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
  useLayoutEffect(() => { outsideFrom.current = null; setOutsidePhase('inside'); }, [roomIdNow]);
  const editingNow = mode === 'edit';
  useLayoutEffect(() => { if (editingNow) setOutsidePhase('inside'); }, [editingNow]);

  // Sortir : la zone visible de la pièce (en pixels du monde) est mémorisée pour que la caméra parte de là, et le défilement pour le retour.
  const goOutside = (): void => {
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
    // L'objet de derrière sélectionné est redessiné devant, mais l'appui arrive au meuble de devant : on déplace celui qu'on voit.
    pressedId.current = selectedId && selectedId !== id && stackAt(layout, id).includes(selectedId) ? selectedId : id;
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
    setSelectedId(nextInStack(layout, selectedId, id, lastTapped.current));
    lastTapped.current = id;
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
    setSelectedId(nextInStack(layout, selectedId, id, lastTapped.current));
    lastTapped.current = id;
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
      <LibraryTopBar
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
      />

      {editing && (
        <div className="wmt-lib-row">
          <Btn label="Pièce horizontale" pressed={room.orientation === 'landscape'} data={{ orient: 'landscape' }} onClick={() => chooseOrientation('landscape')}>
            <Icon paths={ICONS.landscape} />
          </Btn>
          <Btn label="Pièce verticale" pressed={portrait} data={{ orient: 'portrait' }} onClick={() => chooseOrientation('portrait')}>
            <Icon paths={ICONS.portrait} />
          </Btn>
        </div>
      )}

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
              {selectedStanding && (
                <>
                  <Btn label="Avancer" data={{ action: 'depth-front' }} disabled={!canShiftDepth(layout, selectedStanding.id, 1)} onClick={() => void editLayout((l) => shiftDepth(l, selectedStanding.id, 1))}><Icon paths={ICONS.depthFront} /></Btn>
                  <Btn label="Reculer" data={{ action: 'depth-back' }} disabled={!canShiftDepth(layout, selectedStanding.id, -1)} onClick={() => void editLayout((l) => shiftDepth(l, selectedStanding.id, -1))}><Icon paths={ICONS.depthBack} /></Btn>
                </>
              )}
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
            maxWidth: fill ? 'none' : stage.active ? `min(100vw, calc(100vh * ${visibleWidth} / ${HEIGHT}))` : portrait ? 480 : 960,
            ...(fill ? { width: '100vw', height: '100vh', overflowY: 'auto' } : {}),
            ...(dragging ? { overflowX: 'hidden', touchAction: 'none' } : {}),
            // Dehors : la caméra règle le viewBox, le conteneur ne défile plus et prend le cadre de la fenêtre visible.
            ...(outside ? { ...(stage.active ? { width: '100vw', height: '100vh', maxWidth: 'none' } : { width: '100%', aspectRatio: `${visibleWidth} / ${HEIGHT}` }), overflow: 'hidden', touchAction: 'none', position: 'relative', userSelect: 'none', WebkitUserSelect: 'none' } : {}),
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
            outside={outside}
            roomLayers={outsidePhase === 'leaving' || outsidePhase === 'outside' ? 'hidden' : 'shown'}
            fill={fill && !outside}
            drag={drag ? ({ id: drag.id, x: drag.x, y: drag.y, ok: drag.target.ok, ghost: drag.target.ghost, ghostPx: drag.target.ghostPx } satisfies DragView) : null}
          />
        </div>
        {picking && <CardPickerDialog cards={roomCards.list} taken={placedSlugs(layout)} categoryOf={roomCards.categoryOf} kinds={roomCards.kinds} allowed={['wall', 'shelf', 'screen']} onChoose={chooseCard} onClose={() => setPicking(false)} />}
        {viewing && roomCards.cards[viewing] && (
          <RoomCardDialog
            slug={viewing}
            card={roomCards.cards[viewing]}
            onOpenMarket={(slug) => onOpenMarket?.(slug)}
            onOpenCard={(slug) => onOpenCard?.(slug)}
            onClose={() => setViewing(null)}
          />
        )}
        {!editing && (
          <button type="button" data-action={outside ? 'inside' : 'outside'} aria-label={outside ? 'Rentrer' : 'Sortir'} title={outside ? 'Rentrer' : 'Sortir'} onClick={outside ? goInside : goOutside} disabled={outsidePhase === 'leaving' || outsidePhase === 'returning'} style={DOOR_BUTTON}>
            <Icon paths={outside ? ICONS.house : ICONS.door} />
          </button>
        )}
        {stage.active && <FullscreenButton active onClick={stage.toggle} right={8} />}
        {fill && !outside && room.cols > fitCols && (
          <button type="button" data-action="fit-screen" onClick={fitToScreen} style={FIT_BUTTON}>
            Adapter à l’écran
          </button>
        )}
        {stage.active && message && <div aria-live="polite" style={STAGE_MESSAGE}>{message}</div>}
      </div>
    </div>
  );
}

// Bouton Sortir/Rentrer, posé en haut à gauche de la scène.
const DOOR_BUTTON = { position: 'absolute', top: 8, left: 8, width: 36, height: 36, padding: 0, border: 0, borderRadius: 18, cursor: 'pointer', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'grid', placeItems: 'center', zIndex: 2 } as const;

// Bouton et message posés sur la pièce en plein écran, à gauche du bouton de sortie.
const FIT_BUTTON = { position: 'absolute', top: 4, right: 48, height: 32, padding: '0 12px', border: 0, borderRadius: 16, cursor: 'pointer', background: 'rgba(0,0,0,0.65)', color: '#fff', font: '13px/20px system-ui,sans-serif' } as const;
const STAGE_MESSAGE = { position: 'absolute', top: 44, right: 8, maxWidth: '60vw', padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', font: '13px/18px system-ui,sans-serif' } as const;

type ScreenSize = { width: number; height: number };

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
