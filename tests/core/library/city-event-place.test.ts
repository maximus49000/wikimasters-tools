// tests/core/library/city-event-place.test.ts
import { describe, expect, it } from 'vitest';
import { AMB_DY, BIKE_TRACK_DY, apartmentLamp, fixedFade, nearFacades, placeEvent, pullOver, type EventFrame } from '../../../src/core/library/city/event-place';
import { eventX, type CityEvent } from '../../../src/core/library/city/events';
import { cityFacades } from '../../../src/core/library/city/facades';
import { FAR_SHRINK, STREET_SCALE, cityMetrics } from '../../../src/core/library/city/metrics';

const frame: EventFrame = { width: 720, height: 340, metrics: cityMetrics(340), facades: cityFacades(720, 340, 7) };
const ev = (over: Partial<CityEvent>): CityEvent => ({
  key: 'ev-1-0', id: 'plane', layer: 'sky', start: 1000, end: 1012, dir: 1, track: null, speed: 70, x0: 300, y: 0.1, pick: 0.5, variant: 0.3, yields: [], ...over,
});

describe('placeEvent', () => {
  it('ciel : position de traversée, hauteur tirée, retourné selon le sens', () => {
    const e = ev({ dir: -1 });
    const p = placeEvent(e, 1005, frame);
    expect(p.x).toBeCloseTo(eventX(e, 720, 1005), 6);
    expect(p.y).toBeCloseTo(34, 6);
    expect(p.sx).toBeLessThan(0);
    expect(p.sy).toBeGreaterThan(0);
  });
  it('rue : sur sa file, l’ambulance près du marquage central, le livreur sur la piste', () => {
    const m = frame.metrics;
    expect(placeEvent(ev({ id: 'bus', layer: 'street', track: 'near' }), 1001, frame).y).toBeCloseTo(m.laneY.near, 6);
    expect(placeEvent(ev({ id: 'ambulance', layer: 'street', track: 'near' }), 1001, frame).y).toBeCloseTo(m.laneY.near - AMB_DY * m.unit, 6);
    expect(placeEvent(ev({ id: 'ambulance', layer: 'street', track: 'far', dir: -1 }), 1001, frame).y).toBeCloseTo(m.laneY.far + AMB_DY * m.unit, 6);
    expect(placeEvent(ev({ id: 'delivery-bike', layer: 'street', track: 'bike' }), 1001, frame).y).toBeCloseTo(m.laneY.near + BIKE_TRACK_DY * m.unit, 6);
    const far = placeEvent(ev({ id: 'tram', layer: 'street', track: 'far', dir: -1 }), 1001, frame);
    expect(far.sx).toBeCloseTo(-m.unit * STREET_SCALE.vehicle * FAR_SHRINK, 6);
  });
  it('trottoir : à hauteur des passants, à leur échelle', () => {
    const p = placeEvent(ev({ id: 'dog-walker', layer: 'sidewalk' }), 1001, frame);
    expect(p.y).toBeCloseTo(frame.metrics.walkY, 6);
    expect(p.sy).toBeCloseTo(frame.metrics.unit * STREET_SCALE.person, 6);
  });
  it('fixes : la grue part du sol, le feu d’artifice du haut de la scène, l’appartement sur une vraie fenêtre', () => {
    const crane = placeEvent(ev({ id: 'crane', layer: 'fixed', speed: 0 }), 1001, frame);
    expect(crane.x).toBe(300);
    expect(crane.y).toBeCloseTo(frame.metrics.ground, 6);
    const fw = placeEvent(ev({ id: 'fireworks', layer: 'fixed', speed: 0 }), 1001, frame);
    expect(fw.y).toBe(0);
    const apt = ev({ id: 'apartment', layer: 'fixed', speed: 0 });
    const lamp = apartmentLamp(apt, frame);
    expect(nearFacades(frame).some((b) => b.lamps.some((l) => l.x === lamp.x && l.y === lamp.y))).toBe(true);
    expect(placeEvent(apt, 1001, frame)).toEqual({ x: lamp.x, y: lamp.y, sx: 1, sy: 1 });
  });
});

describe('pullOver', () => {
  const amb = ev({ id: 'ambulance', layer: 'street', track: 'near', speed: 130, start: 0, end: 10 });
  it('rien quand l’ambulance est loin derrière ou déjà loin devant, rangé quand elle passe', () => {
    const xa = eventX(amb, 720, 2);
    expect(pullOver(amb, xa + 400, 720, 2)).toBe(0);
    expect(pullOver(amb, xa + 30, 720, 2)).toBe(1);
    expect(pullOver(amb, xa - 10, 720, 2)).toBe(1);
    expect(pullOver(amb, xa - 200, 720, 2)).toBe(0);
    const mid = pullOver(amb, xa + 110, 720, 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('tient compte du sens de la file du fond', () => {
    const back = { ...amb, track: 'far' as const, dir: -1 as const };
    const xa = eventX(back, 720, 2);
    expect(pullOver(back, xa - 30, 720, 2)).toBe(1);
    expect(pullOver(back, xa + 200, 720, 2)).toBe(0);
  });
});

describe('pullOver au départ de l’ambulance', () => {
  const amb = ev({ id: 'ambulance', layer: 'street', track: 'near', speed: 130, start: 0, end: 10 });
  it('les voitures déjà devant le point d’entrée ne sont pas rangées dès la première image', () => {
    const x0 = eventX(amb, 720, 0);
    expect(pullOver(amb, x0 + 100, 720, 0)).toBe(0);
    expect(pullOver(amb, x0 + 30, 720, 0)).toBe(0);
  });
  it('elles se rangent peu à peu pendant les premiers 90 px de l’ambulance', () => {
    const at = (t: number): number => pullOver(amb, eventX(amb, 720, t) + 30, 720, t);
    expect(at(0.2)).toBeGreaterThan(0);
    expect(at(0.2)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeLessThan(1);
    expect(at(90 / 130)).toBe(1);
  });
});

describe('fixedFade', () => {
  const crane = ev({ id: 'crane', layer: 'fixed', speed: 0, start: 1000, end: 1360 });
  it('apparaît et disparaît en 2 s', () => {
    expect(fixedFade(crane, 1000)).toBe(0);
    expect(fixedFade(crane, 1001)).toBeCloseTo(0.5, 6);
    expect(fixedFade(crane, 1002)).toBe(1);
    expect(fixedFade(crane, 1200)).toBe(1);
    expect(fixedFade(crane, 1359)).toBeCloseTo(0.5, 6);
    expect(fixedFade(crane, 1360)).toBe(0);
  });
  it('le feu d’artifice et les traversées ne passent pas par ce fondu', () => {
    expect(fixedFade(ev({ id: 'fireworks', layer: 'fixed', speed: 0, start: 1000, end: 1030 }), 1000)).toBe(1);
    expect(fixedFade(ev({ start: 1000, end: 1012 }), 1000)).toBe(1);
  });
});
