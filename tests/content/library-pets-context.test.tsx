import { describe, expect, it } from 'vitest';
import { buildPetContext, newSunCache } from '../../src/content/pet-context';
import { createContextTracker } from '../../src/core/library/pets/context';
import { skyAt } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

const times = { kind: 'normal' as const, sunrise: 360, sunset: 1200 };
const room = (windows: boolean, scene = 'city') => ({ id: 'r', cols: 24, scene, layout: windows ? [{ id: 'w', kind: 'window', col: 4, row: 2, w: 4, h: 5 }] : [] }) as never;
const view = (minutes: number, w = targetOf('sun')) => ({ sky: skyAt(minutes, times), minutes, weather: { clock: { read: () => w }, flags: { gloom: false, rainy: false } } });

describe('buildPetContext', () => {
  it('de jour avec une fenêtre : cases de soleil, pas de nuit', () => {
    const ctx = buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(12 * 60), lightOn: true });
    expect(ctx.night).toBe(false);
    expect(ctx.sunCells.length).toBeGreaterThan(0);
  });
  it('de nuit avec une fenêtre : lune visible', () => {
    const ctx = buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(2 * 60), lightOn: true });
    expect(ctx.night).toBe(true);
    expect(ctx.moon).toBe(true);
  });
  it('sans fenêtre : pas de soleil, pas de lune, nuit d’après l’horloge', () => {
    const ctx = buildPetContext(createContextTracker(), 0, { room: room(false), sceneView: view(23 * 60), lightOn: true });
    expect(ctx).toMatchObject({ night: true, moon: false, weather: 'clear', sunCells: [] });
  });
  it('scène spatiale : pas de météo ; calque de lumière coupé : pas de tache de soleil', () => {
    expect(buildPetContext(createContextTracker(), 0, { room: room(true, 'space'), sceneView: view(12 * 60, targetOf('storm')), lightOn: true }).weather).toBe('clear');
    expect(buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(12 * 60), lightOn: false }).sunCells).toEqual([]);
  });
  it('soleil masqué par l’orage : pas de tache', () => {
    expect(buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(12 * 60, targetOf('storm')), lightOn: true }).sunCells).toEqual([]);
  });
  it('cache d’une seconde : réutilisé, puis invalidé par un changement de lumière ou de pièce', () => {
    const tracker = createContextTracker();
    const cache = newSunCache();
    const lit = { room: room(true), sceneView: view(12 * 60), lightOn: true };
    const first = buildPetContext(tracker, 0, lit, cache).sunCells;
    expect(first.length).toBeGreaterThan(0);
    expect(buildPetContext(tracker, 500, lit, cache).sunCells).toBe(first);
    expect(buildPetContext(tracker, 600, { ...lit, lightOn: false }, cache).sunCells).toEqual([]);
    expect(buildPetContext(tracker, 700, { ...lit, room: room(false) }, cache).sunCells).toEqual([]);
  });
});
