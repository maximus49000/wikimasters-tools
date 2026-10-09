import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { Placed, Room } from '../core/library/library-types';
import { createContextTracker, isNight, sunCellsOf, type PetContext } from '../core/library/pets/context';
import { CELL_H, CELL_W, HEIGHT, WALL_ROWS, pxRect } from '../core/library/room-grid';
import { celestialPlace } from './scene-panorama';
import { WEATHER_SCENES } from './scene-weather';
import { glassRect } from './window-art';
import type { SceneView } from './RoomView';

export type PetContextInput = { room: Room | null; sceneView: SceneView | undefined; lightOn: boolean };
type Tracker = ReturnType<typeof createContextTracker>;
// Cases de soleil mémorisées une seconde ; la clé (pièce, disposition, lumière) invalide le cache dès qu'elle change.
export type SunCache = { at: number; room: string | null; layout: unknown; lightOn: boolean; cells: PetContext['sunCells'] };

const SUN_TTL = 1000;
const WALL_H = WALL_ROWS * CELL_H;
const NONE: PetContext['sunCells'] = [];

export const newSunCache = (): SunCache => ({ at: -Infinity, room: null, layout: null, lightOn: false, cells: NONE });

const isWindow = (p: Placed): p is Extract<Placed, { kind: 'window' }> => p.kind === 'window';

function computeSun(room: Room, sceneView: SceneView, hasSky: boolean, lightOn: boolean, blockedByWeather: boolean): PetContext['sunCells'] {
  if (!lightOn || !hasSky || blockedByWeather || sceneView.sky.sunFrac === null) return NONE;
  const windows = room.layout.filter(isWindow);
  return sunCellsOf({
    glasses: windows.map((w) => glassRect(pxRect({ col: w.col, row: w.row, w: w.w, h: w.h }))),
    wallH: WALL_H, floorH: HEIGHT - WALL_H, cols: room.cols,
    sunFrac: sceneView.sky.sunFrac,
    sunX: celestialPlace(sceneView.sky.sunFrac, room.cols * CELL_W, WALL_H).x,
    blocked: false,
  });
}

// Contexte des animaux à l'instant `now` (appelé à chaque image : tout est léger sauf le soleil, mis en cache).
export function buildPetContext(tracker: Tracker, now: number, { room, sceneView, lightOn }: PetContextInput, cache?: SunCache): PetContext {
  if (!room || !sceneView) return tracker.update(now, { night: false, moon: false, weather: null, sunCells: NONE });
  // Ciel visible : une fenêtre dans une scène terrestre (ni espace ni orbite).
  const hasSky = WEATHER_SCENES.includes(room.scene) && room.layout.some(isWindow);
  const weather = hasSky && sceneView.weather ? sceneView.weather.clock.read(now) : null;
  const night = isNight(sceneView.sky.daylight, sceneView.minutes, hasSky);
  const moon = hasSky && night && sceneView.sky.moonFrac !== null;
  const blockedByWeather = weather !== null && (weather.precip > 0.3 || weather.cloud > 0.85);
  let sunCells: PetContext['sunCells'];
  if (!cache) sunCells = computeSun(room, sceneView, hasSky, lightOn, blockedByWeather);
  else {
    const fresh = now - cache.at < SUN_TTL && cache.room === room.id && cache.layout === room.layout && cache.lightOn === lightOn;
    if (!fresh) {
      cache.cells = computeSun(room, sceneView, hasSky, lightOn, blockedByWeather);
      cache.at = now;
      cache.room = room.id;
      cache.layout = room.layout;
      cache.lightOn = lightOn;
    }
    sunCells = cache.cells;
  }
  return tracker.update(now, { night, moon, weather, sunCells });
}

// Fonction d'identité stable qui relit la dernière entrée (pièce, vue de la scène, lumière) à chaque appel.
export function usePetContext(input: PetContextInput): () => PetContext {
  // Un suivi par pièce : l'horloge météo est commune, mais le ciel visible dépend de la pièce.
  const trackers = useMemo(() => new Map<string, Tracker>(), []);
  const cache = useRef<SunCache>(newSunCache());
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });
  return useCallback(() => {
    const id = latest.current.room?.id ?? '';
    let tracker = trackers.get(id);
    if (!tracker) trackers.set(id, (tracker = createContextTracker()));
    return buildPetContext(tracker, Date.now(), latest.current, cache.current);
  }, [trackers]);
}
