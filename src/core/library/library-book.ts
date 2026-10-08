import { z } from 'zod';
import { STYLE_IDS, type Layout, type LibraryState, type Orientation, type Room } from './library-types';
import { MAX_COLS, MIN_COLS, SECTION, sectionIsEmpty, shiftLayout } from './room-grid';

export const MAX_ROOMS = 12;
export const MAX_NAME = 30;

const placedSchema = z.union([
  z.object({ id: z.string(), kind: z.enum(['shelf', 'desk']), col: z.number().int(), row: z.number().int() }),
  z.object({ id: z.string(), kind: z.literal('computer'), deskId: z.string() }),
]);
const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  style: z.enum(STYLE_IDS),
  orientation: z.enum(['landscape', 'portrait']),
  cols: z.number().int().min(MIN_COLS).max(MAX_COLS).refine((cols) => cols % SECTION === 0),
  layout: z.array(placedSchema),
});
const stateSchema = z.object({
  version: z.literal(1),
  activeRoomId: z.string(),
  homeRoomId: z.string().nullable(),
  rooms: z.array(roomSchema).min(1).max(MAX_ROOMS),
});

function nextId(prefix: string, taken: string[]): string {
  let n = 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const makeRoom = (id: string, name: string, orientation: Orientation, style: Room['style'] = 'scandinave'): Room => ({
  id,
  name,
  style,
  orientation,
  cols: MIN_COLS,
  layout: [],
});

export function createInitialState(): LibraryState {
  return { version: 1, activeRoomId: 'r1', homeRoomId: null, rooms: [makeRoom('r1', 'Pièce 1', 'landscape')] };
}

export function activeRoom(state: LibraryState): Room {
  return state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0]!;
}

// Une lecture sûre : un contenu absent, d'une autre version ou abîmé redonne une pièce vide (comme `readView`).
export function parseLibraryState(raw: unknown): LibraryState {
  const parsed = stateSchema.safeParse(raw);
  if (!parsed.success) return createInitialState();
  const state = parsed.data;
  const ids = state.rooms.map((room) => room.id);
  // Un meuble à identifiant déjà vu est ignoré ; un ordinateur sans bureau (dans la même pièce) l'est aussi.
  const rooms = state.rooms.map((room) => {
    const seen = new Set<string>();
    const unique = room.layout.filter((p) => !seen.has(p.id) && Boolean(seen.add(p.id)));
    const deskIds = new Set(unique.filter((p) => p.kind === 'desk').map((p) => p.id));
    return { ...room, layout: unique.filter((p) => p.kind !== 'computer' || deskIds.has(p.deskId)) };
  });
  return {
    ...state,
    rooms,
    activeRoomId: ids.includes(state.activeRoomId) ? state.activeRoomId : ids[0]!,
    homeRoomId: state.homeRoomId !== null && ids.includes(state.homeRoomId) ? state.homeRoomId : null,
  };
}

const mapRoom = (state: LibraryState, id: string, change: (room: Room) => Room): LibraryState => ({
  ...state,
  rooms: state.rooms.map((room) => (room.id === id ? change(room) : room)),
});

export function addRoom(state: LibraryState): LibraryState {
  if (state.rooms.length >= MAX_ROOMS) return state;
  const current = activeRoom(state);
  const id = nextId('r', state.rooms.map((room) => room.id));
  const room = makeRoom(id, `Pièce ${state.rooms.length + 1}`, current.orientation, current.style);
  return { ...state, rooms: [...state.rooms, room], activeRoomId: id };
}

export function renameRoom(state: LibraryState, id: string, name: string): LibraryState {
  const clean = name.trim().slice(0, MAX_NAME);
  if (clean === '' || !state.rooms.some((room) => room.id === id)) return state;
  return mapRoom(state, id, (room) => ({ ...room, name: clean }));
}

export function deleteRoom(state: LibraryState, id: string): LibraryState {
  if (!state.rooms.some((room) => room.id === id)) return state;
  if (state.rooms.length === 1) return mapRoom(state, id, (room) => ({ ...room, cols: MIN_COLS, layout: [] }));
  const index = state.rooms.findIndex((room) => room.id === id);
  const rooms = state.rooms.filter((room) => room.id !== id);
  const activeRoomId = state.activeRoomId === id ? rooms[Math.min(index, rooms.length - 1)]!.id : state.activeRoomId;
  return { ...state, rooms, activeRoomId, homeRoomId: state.homeRoomId === id ? null : state.homeRoomId };
}

export function setActive(state: LibraryState, id: string): LibraryState {
  if (!state.rooms.some((room) => room.id === id) || state.activeRoomId === id) return state;
  return { ...state, activeRoomId: id };
}

export function setHome(state: LibraryState, id: string | null): LibraryState {
  if (id !== null && !state.rooms.some((room) => room.id === id)) return state;
  return { ...state, homeRoomId: id };
}

export function setOrientation(state: LibraryState, id: string, orientation: Orientation): LibraryState {
  return mapRoom(state, id, (room) => ({ ...room, orientation }));
}

// Une zone de 12 colonnes de plus ; à gauche, les meubles se décalent pour rester où ils sont dans la pièce.
export function extendRoom(state: LibraryState, id: string, side: 'left' | 'right'): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.cols + SECTION > MAX_COLS) return state;
  return mapRoom(state, id, (r) => ({ ...r, cols: r.cols + SECTION, layout: side === 'left' ? shiftLayout(r.layout, SECTION) : r.layout }));
}

// Retire la zone du bord si elle est entièrement vide et si la pièce reste d'au moins 24 colonnes.
export function shrinkRoom(state: LibraryState, id: string, side: 'left' | 'right'): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.cols - SECTION < MIN_COLS || !sectionIsEmpty(room.layout, room.cols, side)) return state;
  return mapRoom(state, id, (r) => ({ ...r, cols: r.cols - SECTION, layout: side === 'left' ? shiftLayout(r.layout, -SECTION) : r.layout }));
}

// Applique un changement à l'aménagement de la pièce ; `null` = changement refusé, rien ne bouge.
export function updateLayout(state: LibraryState, roomId: string, change: (layout: Layout, cols: number) => Layout | null): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return state;
  const next = change(room.layout, room.cols);
  if (next === null) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, layout: next }));
}

export function nextFurnitureId(layout: Layout): string {
  return nextId('f', layout.map((placed) => placed.id));
}
