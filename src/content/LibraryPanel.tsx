import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  activeRoom,
  createInitialState,
  addRoom,
  deleteRoom,
  extendRoom,
  nextFurnitureId,
  renameRoom,
  setActive,
  setHome,
  setOrientation,
  shrinkRoom,
  updateLayout,
} from '../core/library/library-book';
import { FURNITURE_KINDS, labelOf, sizeOf } from '../core/library/furniture-catalog';
import type { FurnitureKind, Layout, LibraryState, Orientation, StandingKind } from '../core/library/library-types';
import type { LibraryRepo } from '../core/library/library-repo';
import {
  MAX_COLS,
  MIN_COLS,
  CELL_W,
  HEIGHT,
  SECTION,
  VISIBLE_COLS,
  canPlace,
  canPlaceComputer,
  isStanding,
  moveComputer,
  moveStanding,
  placeComputer,
  placeStanding,
  removeFurniture,
  sectionIsEmpty,
  type Cell,
} from '../core/library/room-grid';
import { dropTargetFor, pointerToCell, type DropTarget } from './furniture-drag';
import { createLongPress } from './long-press';
import { FullscreenButton, useFullscreen } from './fullscreen';
import { lockOrientation, unlockOrientation } from './orientation-lock';
import { RoomView, type DragView, type Tool } from './RoomView';

// Près du bord de la pièce visible, le glissé la fait défiler : zone sensible et vitesse (pixels par image).
const EDGE_ZONE = 48;
const EDGE_SPEED = 8;

type Drag = { id: string; x: number; y: number; target: DropTarget };
// Ce que les écouteurs de la fenêtre doivent connaître de l'état courant (relu à chaque événement).
type DragLive = { layout: Layout; cols: number; drop: (id: string, target: DropTarget) => void };

export const LIBRARY_CSS = `
.wmt-lib{display:flex;flex-direction:column;gap:10px;padding:12px;margin:12px 0;border:1px solid var(--color-border,rgba(148,163,184,.35));border-radius:12px;background:var(--color-surface,#0d1117);color:var(--color-foreground,#e6edf3);font:14px/20px system-ui,sans-serif}
.wmt-lib-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wmt-lib-btn{min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;border-radius:999px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit;cursor:pointer}
.wmt-lib-btn[aria-pressed="true"],.wmt-lib-btn[aria-selected="true"]{border-color:var(--color-accent,#34d399);color:var(--color-accent,#34d399)}
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

const ICONS = {
  plus: ['M5 12h14', 'M12 5v14'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  landscape: ['M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z'],
  portrait: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  move: ['M5 9l-3 3 3 3', 'M9 5l3-3 3 3', 'M15 19l-3 3-3-3', 'M19 9l3 3-3 3', 'M2 12h20', 'M12 2v20'],
  shelf: ['M5 3v18', 'M19 3v18', 'M5 8h14', 'M5 14h14'],
  desk: ['M3 8h18', 'M5 8v12', 'M19 8v12'],
  computer: ['M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 20h8', 'M12 16v4'],
  extendLeft: ['M4 4v16', 'M9 12h10', 'M14 7v10'],
  extendRight: ['M20 4v16', 'M5 12h10', 'M10 7v10'],
  shrinkLeft: ['M4 4v16', 'M9 12h10'],
  shrinkRight: ['M20 4v16', 'M5 12h10'],
  fullscreen: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
} as const;

const KIND_ICON: Record<FurnitureKind, readonly string[]> = { shelf: ICONS.shelf, desk: ICONS.desk, computer: ICONS.computer };

function Btn({ label, pressed, onClick, data, children }: { label: string; pressed?: boolean; onClick: () => void; data?: Record<string, string>; children: ReactNode }) {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]));
  return (
    <button type="button" className="wmt-lib-btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} {...attrs}>
      {children}
    </button>
  );
}

const REFUSALS = {
  bounds: 'Ça ne rentre pas dans la pièce.',
  floor: 'Un meuble se pose au sol : touchez une case du sol.',
  taken: 'Cet emplacement est déjà occupé.',
  wall: 'Un objet accroché doit tenir sur le mur.',
} as const;

export function LibraryPanel({ library }: { library: LibraryRepo }) {
  const [lib, setLib] = useState<LibraryState | null>(library.current());
  const [mode, setMode] = useState<'visit' | 'edit'>('visit');
  const [tool, setTool] = useState<Tool>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blink, setBlink] = useState<Cell[]>([]);
  const [message, setMessage] = useState('');
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

  // Position du doigt → case, cible de dépôt et position dans le dessin (null si la pièce n'est pas affichée).
  const locate = (id: string, clientX: number, clientY: number): Drag | null => {
    const state = live.current;
    const svg = scrollRef.current?.querySelector('svg');
    if (!state || !svg) return null;
    const { col, row, x, y } = pointerToCell(svg.getBoundingClientRect(), state.cols * CELL_W, HEIGHT, clientX, clientY);
    return { id, x, y, target: dropTargetFor(state.layout, state.cols, id, col, row) };
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

  if (!lib) return <div className="wmt-lib" data-wmt-library />;

  const room = activeRoom(lib);
  const layout = room.layout;
  const editing = mode === 'edit';
  const portrait = room.orientation === 'portrait';
  const visibleWidth = VISIBLE_COLS[room.orientation] * CELL_W;
  const editLayout = (change: Parameters<typeof updateLayout>[2]) => library.update((state) => updateLayout(state, room.id, change));

  const reset = (): void => {
    setTool(null);
    setSelectedId(null);
    setBlink([]);
    setMessage('');
  };
  const refuse = (text: string, cells: Cell[] = []): void => {
    setMessage(text);
    setBlink(cells);
    window.clearTimeout(blinkTimer.current);
    blinkTimer.current = window.setTimeout(() => setBlink([]), 700);
  };

  const REASONS = { ...REFUSALS, 'not-desk': 'Un ordinateur se pose sur un bureau.', 'desk-busy': 'Ce bureau a déjà un ordinateur.' } as const;
  // Lâcher d'un meuble soulevé : valide → déplacé par les mêmes fonctions que « Déplacer » ; sinon il reste en place.
  const dropLifted = (id: string, target: DropTarget): void => {
    if (target.ok) {
      const item = layout.find((p) => p.id === id);
      if (item?.kind === 'computer' && target.deskId) {
        const deskId = target.deskId;
        void editLayout((l) => moveComputer(l, id, deskId));
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
    pressedId.current = id;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    press.start(event.clientX, event.clientY);
  };
  const onFurnitureMove = (event: ReactPointerEvent): void => {
    lastPointer.current = { x: event.clientX, y: event.clientY };
    press.move(event.clientX, event.clientY);
  };

  const movingItem = tool?.type === 'move' ? layout.find((p) => p.id === tool.id) : undefined;
  const targetsDesk = (tool?.type === 'new' && tool.kind === 'computer') || movingItem?.kind === 'computer';
  const cellsActive = tool !== null && !targetsDesk;

  async function onCell(col: number, row: number): Promise<void> {
    if (!tool) return;
    const kind: StandingKind | null = tool.type === 'new' ? (tool.kind === 'computer' ? null : tool.kind) : movingItem && isStanding(movingItem) ? movingItem.kind : null;
    if (!kind) return;
    // La case touchée est la case en bas à gauche du meuble.
    const top = row - sizeOf(kind).h + 1;
    const check = canPlace(layout, room.cols, kind, col, top, tool.type === 'move' ? tool.id : undefined);
    if (!check.ok) return refuse(REFUSALS[check.reason], check.cells);
    await editLayout((l, cols) => (tool.type === 'new' ? placeStanding(l, cols, kind, col, top, nextFurnitureId(l)) : moveStanding(l, cols, tool.id, col, top)));
    reset();
  }

  async function onPick(id: string): Promise<void> {
    // Le clic qui suit un appui long n'est pas un vrai clic ; en mode Visiter, toucher un meuble ne fait rien.
    if (press.consumeClick() || !editing) return;
    const item = layout.find((p) => p.id === id);
    if (!item) return;
    if (tool?.type === 'new' && tool.kind === 'computer') {
      if (item.kind !== 'desk') return refuse('Un ordinateur se pose sur un bureau.');
      if (!canPlaceComputer(layout, id)) return refuse('Ce bureau a déjà un ordinateur.');
      await editLayout((l) => placeComputer(l, id, nextFurnitureId(l)));
      return reset();
    }
    if (tool?.type === 'move' && movingItem?.kind === 'computer') {
      if (item.kind !== 'desk') return refuse('Un ordinateur se pose sur un bureau.');
      if (!canPlaceComputer(layout, id, movingItem.id)) return refuse('Ce bureau a déjà un ordinateur.');
      await editLayout((l) => moveComputer(l, movingItem.id, id));
      return reset();
    }
    setTool(null);
    setSelectedId(id === selectedId ? null : id);
    setMessage('');
  }

  const startNew = (kind: FurnitureKind): void => {
    setSelectedId(null);
    setBlink([]);
    setTool({ type: 'new', kind });
    setMessage(kind === 'computer' ? 'Touchez un bureau pour y poser l’ordinateur.' : `Touchez une case du sol pour poser : ${labelOf(kind).toLowerCase()}.`);
  };
  const startMove = (): void => {
    if (!selectedId) return;
    const item = layout.find((p) => p.id === selectedId);
    setTool({ type: 'move', id: selectedId });
    setMessage(item?.kind === 'computer' ? 'Touchez le bureau où le poser.' : 'Touchez la case du sol où le poser.');
  };
  const removeSelected = async (): Promise<void> => {
    if (!selectedId) return;
    await editLayout((l) => removeFurniture(l, selectedId));
    reset();
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
  const onDeleteRoom = (): void => {
    const question = lib.rooms.length > 1 ? `Supprimer « ${room.name} » ?` : 'Vider cette pièce ?';
    if (!window.confirm(question)) return;
    reset();
    void library.update((state) => deleteRoom(state, room.id));
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
        <div className="wmt-lib-row">
          {FURNITURE_KINDS.map((kind) => (
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
            </>
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
            // En plein écran : la fenêtre visible (24 ou 14 colonnes sur 340 de haut) prend la plus grande taille qui tient dans l'écran.
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
            onCell={(col, row) => void onCell(col, row)}
            onPick={(id) => void onPick(id)}
            onFurnitureDown={onFurnitureDown}
            onFurnitureMove={onFurnitureMove}
            onFurnitureUp={press.cancel}
            drag={drag ? ({ id: drag.id, x: drag.x, y: drag.y, ok: drag.target.ok, ghost: drag.target.ghost } satisfies DragView) : null}
          />
        </div>
        {stage.active && <FullscreenButton active onClick={stage.toggle} right={8} />}
      </div>
    </div>
  );
}
