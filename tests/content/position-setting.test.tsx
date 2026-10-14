// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionSettings } from '../../src/content/PositionSettings';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';
import { currentPosition, ensurePosition, isPositionKnown, positionFailure, requestPosition, resetPositionForTests } from '../../src/content/scene-position';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let getCurrentPosition: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  resetPositionForTests();
  resetLocationForTests();
  getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => ok({ coords: { latitude: 47.45, longitude: -0.47 } }));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
});
afterEach(() => window.localStorage.clear());

describe('réglage Position', () => {
  it('est en géolocalisation par défaut et mémorise le choix', () => {
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    locationSetting.set({ mode: 'off' });
    expect(locationSetting.get()).toEqual({ mode: 'off' });
    expect(window.localStorage.getItem('wmt:scene-location')).toBe('{"mode":"off"}');
  });

  it('actif : ensurePosition demande la position une seule fois par page', async () => {
    ensurePosition();
    ensurePosition();
    await Promise.resolve();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(isPositionKnown()).toBe(true);
  });

  it('désactivé : aucune demande, position inconnue', async () => {
    locationSetting.set({ mode: 'off' });
    ensurePosition();
    await requestPosition();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(isPositionKnown()).toBe(false);
  });

  it('désactiver oublie la position obtenue et prévient les abonnés', async () => {
    await requestPosition();
    expect(isPositionKnown()).toBe(true);
    expect(currentPosition().lat).toBeCloseTo(47.45);
    const listener = vi.fn();
    const stop = (await import('../../src/content/scene-position')).subscribePosition(listener);
    locationSetting.set({ mode: 'off' });
    expect(listener).toHaveBeenCalled();
    expect(isPositionKnown()).toBe(false);
    expect(currentPosition().lat).not.toBeCloseTo(47.45);
    stop();
  });
});

describe('raison d’échec', () => {
  it('refus, indisponible et délai sont distingués ; un succès efface la raison', async () => {
    for (const [code, reason] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const) {
      getCurrentPosition.mockImplementation((_ok: unknown, ko: (e: { code: number }) => void) => ko({ code }));
      await requestPosition();
      expect(positionFailure()).toBe(reason);
      expect(isPositionKnown()).toBe(false);
    }
    getCurrentPosition.mockImplementation((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => ok({ coords: { latitude: 1, longitude: 2 } }));
    await requestPosition();
    expect(positionFailure()).toBeNull();
  });

  it('un échec du relevé réseau déclenche un second essai en haute précision', async () => {
    getCurrentPosition.mockImplementationOnce((_ok: unknown, ko: (e: { code: number }) => void) => ko({ code: 3 }));
    await requestPosition();
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1]![2]).toMatchObject({ enableHighAccuracy: true });
    expect(isPositionKnown()).toBe(true);
  });
});

describe('position native Android', () => {
  type Win = { WmtLocation?: unknown; __wmtLocationDone?: (...a: unknown[]) => void };
  const answer = (lat: number, lon: number, error: string) =>
    vi.fn((id: string) => queueMicrotask(() => (window as unknown as Win).__wmtLocationDone?.(id, lat, lon, error)));
  afterEach(() => {
    delete (window as unknown as Win).WmtLocation;
    delete (window as unknown as Win).__wmtLocationDone;
  });

  it('passe par le pont Android et reçoit la position', async () => {
    (window as unknown as Win).WmtLocation = { request: answer(48.1, 2.2, '') };
    await requestPosition();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(isPositionKnown()).toBe(true);
    expect(currentPosition().lat).toBeCloseTo(48.1);
  });

  it('transmet la raison de l’échec (localisation du téléphone désactivée)', async () => {
    (window as unknown as Win).WmtLocation = { request: answer(0, 0, 'off') };
    await requestPosition();
    expect(positionFailure()).toBe('off');
    expect(isPositionKnown()).toBe(false);
  });
});

describe('fenêtre Position', () => {
  let container: HTMLDivElement;
  let root: Root;
  const q = (selector: string) => container.querySelector<HTMLElement>(selector);
  const click = (selector: string) => act(async () => { q(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('explique l’usage et ce qui est envoyé, et propose les trois choix', async () => {
    await act(async () => { root.render(<PositionSettings onClose={() => undefined} />); });
    const explain = q('[data-wmt-position-explain]')!.textContent!;
    for (const word of ['météo', 'Ville', 'heure']) expect(explain, word).toContain(word);
    const modes = container.querySelectorAll('[data-wmt-position-choice] [data-location-mode]');
    expect(modes).toHaveLength(3);
    expect(q('[data-location-mode="geo"]')!.getAttribute('aria-pressed')).toBe('true');
    await click('[data-location-mode="off"]');
    expect(locationSetting.get().mode).toBe('off');
    expect(q('[data-location-mode="off"]')!.getAttribute('aria-pressed')).toBe('true');
    await click('[data-location-mode="city"]');
    expect(locationSetting.get().mode).toBe('off');
    expect(q('[data-place-search]')).not.toBeNull();
    await click('[data-location-mode="geo"]');
    expect(locationSetting.get().mode).toBe('geo');
  });

  it('la recherche partagée enregistre la ville touchée', async () => {
    const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, cities: [ANGERS] }) }) as unknown as Response));
    await act(async () => { root.render(<PositionSettings onClose={() => undefined} />); });
    await click('[data-location-mode="city"]');
    const input = q('[data-place-search]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Angers');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    await click('[data-place-hit]');
    expect(locationSetting.get()).toEqual({ mode: 'city', city: ANGERS });
  });
});
