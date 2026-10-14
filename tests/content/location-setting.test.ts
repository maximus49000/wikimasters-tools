// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';

const TOKYO = { name: 'Tokyo', admin: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };

beforeEach(() => {
  window.localStorage.clear();
  resetLocationForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('réglage du lieu de la scène', () => {
  it('migre depuis wmt:positionEnabled tant que la nouvelle clé manque', () => {
    window.localStorage.setItem('wmt:positionEnabled', 'off');
    expect(locationSetting.get()).toEqual({ mode: 'off' });
    window.localStorage.setItem('wmt:positionEnabled', 'on');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    window.localStorage.removeItem('wmt:positionEnabled');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
  });

  it('enregistre en JSON sous wmt:scene-location et n’écrit plus l’ancienne clé', () => {
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(JSON.parse(window.localStorage.getItem('wmt:scene-location')!)).toEqual({ mode: 'city', city: TOKYO });
    expect(window.localStorage.getItem('wmt:positionEnabled')).toBeNull();
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
  });

  it('rend le même objet tant que rien ne change (snapshot stable)', () => {
    expect(locationSetting.get()).toBe(locationSetting.get());
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(locationSetting.get()).toBe(locationSetting.get());
  });

  it('prévient les abonnés à chaque changement, pas pour la même valeur', () => {
    const listener = vi.fn();
    const stop = locationSetting.subscribe(listener);
    locationSetting.set({ mode: 'off' });
    locationSetting.set({ mode: 'off' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    locationSetting.set({ mode: 'geo' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('valeur illisible → géolocalisation', () => {
    window.localStorage.setItem('wmt:scene-location', '{"mode":"city","city":{"name":"X","country":"","lat":1,"lon":1,"tz":"Nulle/Part"}}');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
  });

  it('stockage refusé : le choix vaut pour la session, sans erreur', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refusé'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('refusé'); });
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
  });

  it('écriture seule refusée (lecture possible, renvoie null) : la ville choisie tient pour la session', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
    locationSetting.set({ mode: 'off' });
    expect(locationSetting.get()).toEqual({ mode: 'off' });
  });
});
