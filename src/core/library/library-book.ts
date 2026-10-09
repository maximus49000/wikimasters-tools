import { z } from 'zod';
import { ALL_COATS, PAIR_SCENES, coatsOf, PET_ACTIONS, SCENE_IDS, SMALL_ITEMS, STANDING_KINDS, STYLE_IDS, type Coat, type Layout, type LibraryState, type Orientation, type Pet, type PetPlan, type Placed, type Room, type SceneId, type Species, type StyleId, type TimeSetting, WEATHER_STATES, type WeatherSetting } from './library-types';
import { STEAMPUNK_ONLY, WINDOW_MAX, WINDOW_MIN } from './furniture-catalog';
import { MAX_COLS, MIN_COLS, SECTION, SURFACE_SLOTS, isLamp, sectionIsEmpty, shiftLayout } from './room-grid';

export const MAX_ROOMS = 12;
export const MAX_NAME = 30;
export const MAX_PET_NAME = 20;
export const MAX_PETS = 3;
const DEFAULT_PET_NAME = 'Minou';
const DEFAULT_DOG_NAME = 'Rex';
const DEFAULT_ROBOT_NAME = 'Robi';

const windowSchema = z.object({
  id: z.string(),
  kind: z.literal('window'),
  col: z.number().int(),
  row: z.number().int(),
  w: z.number().int().min(WINDOW_MIN.w).max(WINDOW_MAX.w),
  h: z.number().int().min(WINDOW_MIN.h).max(WINDOW_MAX.h),
});
const placedSchema = z.union([
  z.object({ id: z.string(), kind: z.enum(STANDING_KINDS), col: z.number().int(), row: z.number().int(), lit: z.boolean().optional() }),
  z.object({ id: z.string(), kind: z.literal('computer'), deskId: z.string(), slug: z.string().optional() }),
  z.object({ id: z.string(), kind: z.literal('small'), item: z.enum(SMALL_ITEMS), hostId: z.string(), slot: z.number().int().min(0).max(3), lit: z.boolean().optional() }),
  z.object({
    id: z.string(),
    kind: z.literal('wall'),
    shape: z.enum(['poster', 'vinyl', 'sleeve-square', 'sleeve-round', 'sleeve-frame']),
    col: z.number().int(),
    row: z.number().int(),
    slug: z.string(),
    color: z.enum(['black', 'red', 'blue', 'green', 'gold']).optional(),
  }),
  windowSchema,
  z.object({
    id: z.string(),
    kind: z.literal('stored'),
    shape: z.enum(['cd', 'dvd', 'game', 'book']),
    shelfId: z.string(),
    slot: z.number().int().min(0).max(14),
    slug: z.string(),
  }),
]);
const ptSchema = z.object({ x: z.number(), y: z.number() });
const segmentSchema = z.object({
  kind: z.enum(['walk', 'jump']),
  from: ptSchema,
  to: ptSchema,
  ms: z.number().min(0).max(60000),
  fromOn: z.string().nullable(),
  on: z.string().nullable(),
});
const planSchema = z.object({
  action: z.enum(PET_ACTIONS),
  hostId: z.string().nullable(),
  at: ptSchema,
  on: z.string().nullable(),
  route: z.array(segmentSchema).max(60),
  startedAt: z.number(),
  actMs: z.number().min(0).max(600000),
  facing: z.enum(['l', 'r']),
  sig: z.string(),
  lag: z.number().min(0).max(600000).optional(),
  key: z.string().max(80).optional(),
  with: z.object({ petId: z.string(), role: z.enum(['lead', 'follow']), scene: z.enum(PAIR_SCENES) }).optional(),
});
// Un plan abîmé est simplement oublié : le chat en choisira un autre.
const petSchema = z
  .object({
    id: z.string(),
    species: z.enum(['cat', 'dog', 'robot']),
    name: z.string().min(1).max(MAX_PET_NAME),
    coat: z.enum(ALL_COATS),
    plan: planSchema.optional().catch(undefined),
  })
  .refine((pet) => coatsOf(pet.species).includes(pet.coat));
const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  style: z.enum(STYLE_IDS),
  scene: z.enum(SCENE_IDS),
  orientation: z.enum(['landscape', 'portrait']),
  cols: z.number().int().min(MIN_COLS).max(MAX_COLS).refine((cols) => cols % SECTION === 0),
  layout: z.array(placedSchema),
  pets: z.array(petSchema).max(MAX_PETS),
  cityEpoch: z.number().int().optional(),
});
const stateSchema = z.object({
  version: z.literal(5),
  activeRoomId: z.string(),
  homeRoomId: z.string().nullable(),
  time: z.union([
    z.object({ mode: z.literal('real') }),
    z.object({ mode: z.literal('day') }),
    z.object({ mode: z.literal('night') }),
    z.object({ mode: z.literal('manual'), minutes: z.number().int().min(0).max(1439) }),
  ]),
  // Réglage inconnu (version plus récente, corruption) : retour à l'aléatoire plutôt qu'à une bibliothèque vide.
  weather: z
    .union([
      z.object({ mode: z.literal('random') }),
      z.object({ mode: z.literal('forced'), state: z.enum(WEATHER_STATES) }),
      z.object({ mode: z.literal('real') }),
    ])
    .catch({ mode: 'random' }),
  rooms: z.array(roomSchema).min(1).max(MAX_ROOMS),
});

function nextId(prefix: string, taken: string[]): string {
  let n = 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const makeRoom = (id: string, name: string, orientation: Orientation, style: Room['style'] = 'scandinave', scene: SceneId = 'city'): Room => ({
  id,
  name,
  style,
  scene,
  orientation,
  cols: MIN_COLS,
  layout: [],
  pets: [],
});

export function createInitialState(): LibraryState {
  return { version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' }, rooms: [makeRoom('r1', 'Pièce 1', 'landscape')] };
}

export function activeRoom(state: LibraryState): Room {
  return state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0]!;
}

// Le champ `lit` n'a de sens que sur une lampe : ailleurs il est écarté.
function stripLit(p: Placed): Placed {
  if ((p as { lit?: boolean }).lit === undefined || isLamp(p)) return p;
  const { lit: _lit, ...rest } = p as Placed & { lit?: boolean };
  return rest as Placed;
}

// Nettoie un aménagement lu : un meuble à identifiant déjà vu est ignoré ; un ordinateur sans bureau, un objet rangé sans étagère
// ou un petit objet sans porteur, hors emplacements ou sur un emplacement déjà pris, et une carte dont le slug a déjà été vu (ordre du tableau, écran compris) le sont aussi.
function cleanLayout(layout: Layout): Layout {
  const ids = new Set<string>();
  const unique = layout.filter((p) => !ids.has(p.id) && Boolean(ids.add(p.id)));
  const deskIds = new Set(unique.filter((p) => p.kind === 'desk').map((p) => p.id));
  const shelfIds = new Set(unique.filter((p) => p.kind === 'shelf').map((p) => p.id));
  const slots = new Set<string>();
  const slugs = new Set<string>();
  return unique.map(stripLit).filter((p) => {
    if (p.kind === 'computer' && !deskIds.has(p.deskId)) return false;
    if (p.kind === 'stored') {
      if (!shelfIds.has(p.shelfId)) return false;
      const key = `${p.shelfId}:${p.slot}`;
      if (slots.has(key)) return false;
      slots.add(key);
    }
    if (p.kind === 'small') {
      const host = unique.find((q) => q.id === p.hostId);
      if (!host || (host.kind !== 'desk' && host.kind !== 'shelf') || p.slot >= SURFACE_SLOTS[host.kind]) return false;
      const key = `${p.hostId}:small:${p.slot}`;
      if (slots.has(key)) return false;
      if (host.kind === 'desk' && (p.slot === 1 || p.slot === 2) && unique.some((q) => q.kind === 'computer' && q.deskId === host.id)) return false;
      slots.add(key);
    }
    if ((p.kind === 'wall' || p.kind === 'stored' || p.kind === 'computer') && p.slug !== undefined) {
      if (slugs.has(p.slug)) return false;
      slugs.add(p.slug);
    }
    return true;
  });
}

// Une pièce v1 avait 12 lignes (9 de mur, 3 de sol) ; la v2 en a 18 (12 + 6). Tout descend de 3 lignes : le sol d'origine reste contre le mur.
const V1_ROW_SHIFT = 3;
function migrateV1(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return raw;
  const state = raw as { rooms?: unknown };
  if (!Array.isArray(state.rooms)) return raw;
  const rooms = state.rooms.map((room: unknown) => {
    const layout = typeof room === 'object' && room !== null ? (room as { layout?: unknown }).layout : undefined;
    if (!Array.isArray(layout)) return room;
    const shifted = layout.map((p: unknown) =>
      typeof p === 'object' && p !== null && typeof (p as { row?: unknown }).row === 'number' ? { ...p, row: (p as { row: number }).row + V1_ROW_SHIFT } : p,
    );
    return { ...(room as object), layout: shifted };
  });
  return { ...state, version: 2, rooms };
}

// La v3 ajoute la scène de chaque pièce (ville) et l'heure globale (réelle).
function migrateV2(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 2) return raw;
  const state = raw as { rooms?: unknown };
  const rooms = Array.isArray(state.rooms) ? state.rooms.map((room: unknown) => (typeof room === 'object' && room !== null ? { ...room, scene: 'city' } : room)) : state.rooms;
  return { ...state, version: 3, time: { mode: 'real' }, rooms };
}

// La v4 ajoute les animaux de chaque pièce (aucun).
function migrateV3(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 3) return raw;
  const state = raw as { rooms?: unknown };
  const rooms = Array.isArray(state.rooms) ? state.rooms.map((room: unknown) => (typeof room === 'object' && room !== null ? { ...room, pets: [] } : room)) : state.rooms;
  return { ...state, version: 4, rooms };
}

// La v5 ajoute la météo globale (aléatoire).
function migrateV4(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 4) return raw;
  return { ...(raw as object), version: 5, weather: { mode: 'random' } };
}

const migrate = (raw: unknown): unknown => migrateV4(migrateV3(migrateV2(migrateV1(raw))));

// Un animal impossible (espèce ou pelage inconnus…) est ignoré sans faire perdre la pièce ; trois au plus.
function cleanPets(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rooms?: unknown }).rooms)) return raw;
  const rooms = (raw as { rooms: unknown[] }).rooms.map((room) => {
    if (typeof room !== 'object' || room === null) return room;
    const pets = (room as { pets?: unknown }).pets;
    return { ...room, pets: Array.isArray(pets) ? pets.filter((p) => petSchema.safeParse(p).success).slice(0, MAX_PETS) : [] };
  });
  return { ...(raw as object), rooms };
}

// Une fenêtre impossible (dimensions hors bornes, valeurs non entières…) est ignorée sans faire perdre la pièce.
function dropBadWindows(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rooms?: unknown }).rooms)) return raw;
  const ok = (p: unknown): boolean => (p as { kind?: unknown } | null)?.kind !== 'window' || windowSchema.safeParse(p).success;
  const rooms = (raw as { rooms: unknown[] }).rooms.map((room) =>
    typeof room === 'object' && room !== null && Array.isArray((room as { layout?: unknown }).layout) ? { ...room, layout: (room as { layout: unknown[] }).layout.filter(ok) } : room,
  );
  return { ...(raw as object), rooms };
}

// Une lecture sûre : un contenu absent, d'une autre version ou abîmé redonne une pièce vide (comme `readView`).
export function parseLibraryState(raw: unknown): LibraryState {
  const parsed = stateSchema.safeParse(cleanPets(dropBadWindows(migrate(raw))));
  if (!parsed.success) return createInitialState();
  const state = parsed.data;
  const ids = state.rooms.map((room) => room.id);
  const rooms = state.rooms.map((room) => ({ ...room, layout: cleanLayout(room.style === 'steampunk' ? room.layout : room.layout.filter((p) => !isExclusive(p))) }));
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

export function setRoomStyle(state: LibraryState, id: string, style: StyleId): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.style === style) return state;
  // Les meubles exclusifs n'ont de sens qu'en Steampunk : ils partent avec le style.
  const layout = style === 'steampunk' ? room.layout : room.layout.filter((p) => !isExclusive(p));
  return mapRoom(state, id, (r) => ({ ...r, style, layout }));
}

const isExclusive = (placed: Placed): boolean => (STEAMPUNK_ONLY as readonly string[]).includes(placed.kind);
// Nombre de meubles exclusifs posés (pour la confirmation avant de quitter Steampunk).
export const countExclusive = (room: Room): number => room.layout.filter(isExclusive).length;

export function addRoom(state: LibraryState): LibraryState {
  if (state.rooms.length >= MAX_ROOMS) return state;
  const current = activeRoom(state);
  const id = nextId('r', state.rooms.map((room) => room.id));
  const room = makeRoom(id, `Pièce ${state.rooms.length + 1}`, current.orientation, current.style, current.scene);
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

// Pose le jour de départ de la rue commerçante sur les pièces listées qui n'en ont pas encore (jamais d'écrasement).
export function setCityEpoch(state: LibraryState, roomIds: string[], day: number): LibraryState {
  if (!state.rooms.some((r) => roomIds.includes(r.id) && r.cityEpoch === undefined)) return state;
  return { ...state, rooms: state.rooms.map((r) => (roomIds.includes(r.id) && r.cityEpoch === undefined ? { ...r, cityEpoch: day } : r)) };
}

export function setRoomScene(state: LibraryState, id: string, scene: SceneId): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.scene === scene) return state;
  return mapRoom(state, id, (r) => ({ ...r, scene }));
}

export function setTimeSetting(state: LibraryState, time: TimeSetting): LibraryState {
  if (time.mode !== 'manual') return { ...state, time };
  return { ...state, time: { mode: 'manual', minutes: Math.min(1439, Math.max(0, Math.round(time.minutes))) } };
}

export function setWeatherSetting(state: LibraryState, weather: WeatherSetting): LibraryState {
  return { ...state, weather };
}

export function adoptPet(state: LibraryState, roomId: string, name: string, coat: Coat, species: Species = 'cat'): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room || room.pets.length >= MAX_PETS) return state;
  const kept: Coat = coatsOf(species).includes(coat) ? coat : coatsOf(species)[0]!;
  const fallback = species === 'dog' ? DEFAULT_DOG_NAME : species === 'robot' ? DEFAULT_ROBOT_NAME : DEFAULT_PET_NAME;
  const pet: Pet = { id: nextId('p', room.pets.map((p) => p.id)), species, name: name.trim().slice(0, MAX_PET_NAME) || fallback, coat: kept };
  return mapRoom(state, roomId, (r) => ({ ...r, pets: [...r.pets, pet] }));
}

export function renamePet(state: LibraryState, roomId: string, petId: string, name: string): LibraryState {
  const clean = name.trim().slice(0, MAX_PET_NAME);
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (clean === '' || !room?.pets.some((p) => p.id === petId)) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, pets: r.pets.map((p) => (p.id === petId ? { ...p, name: clean } : p)) }));
}

export function removePet(state: LibraryState, roomId: string, petId: string): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room?.pets.some((p) => p.id === petId)) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, pets: r.pets.filter((p) => p.id !== petId) }));
}

export function setPetPlan(state: LibraryState, roomId: string, petId: string, plan: PetPlan): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room?.pets.some((p) => p.id === petId)) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, pets: r.pets.map((p) => (p.id === petId ? { ...p, plan } : p)) }));
}
