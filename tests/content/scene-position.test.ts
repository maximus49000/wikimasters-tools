// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPosition, ensurePosition, isPositionKnown, requestPosition, resetPositionForTests, sceneTimeZone, subscribePosition } from '../../src/content/scene-position';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';

const setGeo = (value: unknown) => Object.defineProperty(navigator, 'geolocation', { value, configurable: true });

beforeEach(() => {
  window.localStorage.clear();
  resetLocationForTests();
  resetPositionForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('position de l’appareil', () => {
  it('sans accord, déduit la position du fuseau horaire', () => {
    const tz = -new Date().getTimezoneOffset();
    expect(currentPosition()).toEqual({ lat: 45, lon: tz / 4 });
  });

  it('retient la position donnée par le navigateur', async () => {
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) });
    await expect(requestPosition()).resolves.toEqual({ lat: 48.85, lon: 2.35 });
    expect(currentPosition()).toEqual({ lat: 48.85, lon: 2.35 });
  });

  it('un refus garde le repli fuseau sans erreur', async () => {
    setGeo({ getCurrentPosition: (_ok: unknown, ko: (e: unknown) => void) => ko({ code: 1 }) });
    const tz = -new Date().getTimezoneOffset();
    await expect(requestPosition()).resolves.toEqual({ lat: 45, lon: tz / 4 });
  });

  it('sans API de géolocalisation, garde le repli', async () => {
    setGeo(undefined);
    const tz = -new Date().getTimezoneOffset();
    await expect(requestPosition()).resolves.toEqual({ lat: 45, lon: tz / 4 });
  });

  it('isPositionKnown est faux au départ et vrai après une géolocalisation accordée', async () => {
    expect(isPositionKnown()).toBe(false);
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) });
    await requestPosition();
    expect(isPositionKnown()).toBe(true);
  });
});

const TOKYO = { name: 'Tokyo', admin: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };

describe('lieu de la scène', () => {
  it('ville : coordonnées et fuseau de la ville, position connue, aucune demande à l’appareil', async () => {
    const getCurrentPosition = vi.fn();
    setGeo({ getCurrentPosition });
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(currentPosition()).toEqual({ lat: 35.69, lon: 139.69 });
    expect(currentPosition()).toBe(currentPosition());
    expect(isPositionKnown()).toBe(true);
    expect(sceneTimeZone()).toBe('Asia/Tokyo');
    ensurePosition();
    await requestPosition();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('ville : le pont Android WmtLocation n’est jamais sollicité', async () => {
    const request = vi.fn();
    (window as unknown as { WmtLocation?: unknown }).WmtLocation = { request };
    try {
      locationSetting.set({ mode: 'city', city: TOKYO });
      ensurePosition();
      await requestPosition();
      expect(request).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as { WmtLocation?: unknown }).WmtLocation;
    }
  });

  it('géolocalisation : position obtenue sinon repli, fuseau de l’appareil', async () => {
    const tz = -new Date().getTimezoneOffset();
    expect(currentPosition()).toEqual({ lat: 45, lon: tz / 4 });
    expect(sceneTimeZone()).toBeNull();
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) });
    await requestPosition();
    expect(currentPosition()).toEqual({ lat: 48.85, lon: 2.35 });
    expect(isPositionKnown()).toBe(true);
  });

  it('désactivé : repli par fuseau, position inconnue, fuseau de l’appareil, aucune demande', async () => {
    const getCurrentPosition = vi.fn();
    setGeo({ getCurrentPosition });
    locationSetting.set({ mode: 'off' });
    const tz = -new Date().getTimezoneOffset();
    expect(currentPosition()).toEqual({ lat: 45, lon: tz / 4 });
    expect(isPositionKnown()).toBe(false);
    expect(sceneTimeZone()).toBeNull();
    await requestPosition();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('une position arrivée en mode Ville est gardée mais ignorée jusqu’au retour en géolocalisation', async () => {
    let answer: ((p: unknown) => void) | null = null;
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => { answer = ok; } });
    const pending = requestPosition();
    locationSetting.set({ mode: 'city', city: TOKYO });
    answer!({ coords: { latitude: 48.85, longitude: 2.35 } });
    await pending;
    expect(currentPosition()).toEqual({ lat: 35.69, lon: 139.69 });
    locationSetting.set({ mode: 'geo' });
    expect(currentPosition()).toEqual({ lat: 48.85, lon: 2.35 });
    expect(isPositionKnown()).toBe(true);
  });

  it('changer de lieu prévient les abonnés (heure, météo, commerces, bus, département)', () => {
    const listener = vi.fn();
    const stop = subscribePosition(listener);
    locationSetting.set({ mode: 'city', city: TOKYO });
    locationSetting.set({ mode: 'city', city: { ...TOKYO, name: 'Osaka', lat: 34.69, lon: 135.5 } });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(currentPosition()).toEqual({ lat: 34.69, lon: 135.5 });
    stop();
  });
});
