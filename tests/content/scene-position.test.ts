// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPosition, requestPosition, resetPositionForTests } from '../../src/content/scene-position';

const setGeo = (value: unknown) => Object.defineProperty(navigator, 'geolocation', { value, configurable: true });

beforeEach(() => resetPositionForTests());
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
});
