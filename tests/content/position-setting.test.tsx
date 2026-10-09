// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionSettings } from '../../src/content/PositionSettings';
import { positionSetting } from '../../src/content/position-setting';
import { currentPosition, ensurePosition, isPositionKnown, positionFailure, requestPosition, resetPositionForTests } from '../../src/content/scene-position';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let getCurrentPosition: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  resetPositionForTests();
  getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => ok({ coords: { latitude: 47.45, longitude: -0.47 } }));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
});
afterEach(() => window.localStorage.clear());

describe('réglage Position', () => {
  it('est actif par défaut et mémorise le choix', () => {
    expect(positionSetting.enabled()).toBe(true);
    positionSetting.setEnabled(false);
    expect(positionSetting.enabled()).toBe(false);
    expect(window.localStorage.getItem('wmt:positionEnabled')).toBe('off');
  });

  it('actif : ensurePosition demande la position une seule fois par page', async () => {
    ensurePosition();
    ensurePosition();
    await Promise.resolve();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(isPositionKnown()).toBe(true);
  });

  it('désactivé : aucune demande, position inconnue', async () => {
    positionSetting.setEnabled(false);
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
    positionSetting.setEnabled(false);
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

describe('fenêtre Position', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('explique l’usage et bascule Activé / Désactivé', async () => {
    await act(async () => { root.render(<PositionSettings onClose={() => undefined} />); });
    expect(container.querySelector('[data-wmt-position-explain]')?.textContent).toContain('météo');
    const [on, off] = container.querySelectorAll<HTMLButtonElement>('[data-wmt-position-choice] button');
    expect(on!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { off!.click(); });
    expect(positionSetting.enabled()).toBe(false);
    expect(off!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { on!.click(); });
    expect(positionSetting.enabled()).toBe(true);
  });
});
