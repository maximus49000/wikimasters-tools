// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inDecoDialog } from '../../src/content/deco-dialog-guard';
import { LocationDialog } from '../../src/content/LocationDialog';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris', population: 152960 };
const TOKYO = { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn<() => void>>;
const q = (selector: string) => container.querySelector<HTMLElement>(selector);
const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function type(value: string) {
  const el = q('[data-place-search]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function open() {
  await act(async () => { root.render(<LocationDialog onClose={onClose} />); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  window.localStorage.clear();
  resetLocationForTests();
  onClose = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('fenêtre Lieu de la scène', () => {
  it('propose trois choix larges ; celui du réglage est pressé', async () => {
    await open();
    const modes = container.querySelectorAll<HTMLButtonElement>('[data-location-mode]');
    expect([...modes].map((b) => b.getAttribute('data-location-mode'))).toEqual(['geo', 'city', 'off']);
    expect(q('[data-location-mode="geo"]')!.getAttribute('aria-pressed')).toBe('true');
    for (const b of modes) {
      expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('Désactivé et Géolocalisation s’enregistrent au toucher', async () => {
    await open();
    await click('[data-location-mode="off"]');
    expect(locationSetting.get()).toEqual({ mode: 'off' });
    await click('[data-location-mode="geo"]');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
  });

  it('Ville sans ville choisie n’enregistre rien et ouvre la recherche', async () => {
    await open();
    await click('[data-location-mode="city"]');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    expect(q('[data-place-search]')!.getAttribute('aria-label')).toBeTruthy();
  });

  it('attend 350 ms après la dernière frappe et annule la requête précédente', async () => {
    const signals: AbortSignal[] = [];
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchFn);
    await open();
    await click('[data-location-mode="city"]');
    await type('an');
    await wait(200);
    await type('ang');
    await wait(349);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(q('[data-place-status="loading"]')).not.toBeNull();
    await wait(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/geocode?q=ang');
    await type('ange');
    expect(signals[0]!.aborted).toBe(true);
    await wait(350);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('toucher une ville l’enregistre aussitôt (sans la population) et l’affiche', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: true, cities: [ANGERS] })));
    await open();
    await click('[data-location-mode="city"]');
    await type('Angers');
    await wait(350);
    const hit = q('[data-place-hit]')!;
    expect(hit.textContent).toContain('Angers');
    expect(hit.textContent).toContain('Pays de la Loire, France');
    expect(parseInt(hit.style.minHeight, 10)).toBeGreaterThanOrEqual(48);
    await click('[data-place-hit]');
    const { population: _p, ...stored } = ANGERS;
    expect(locationSetting.get()).toEqual({ mode: 'city', city: stored });
    expect(q('[data-place-chosen]')!.textContent).toMatch(/Choisie : Angers \(France\) · il y est \d\d:\d\d/);
  });

  it('aucun résultat : « Aucune ville trouvée »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: true, cities: [] })));
    await open();
    await click('[data-location-mode="city"]');
    await type('Zzzzqx');
    await wait(350);
    expect(q('[data-place-status="empty"]')!.textContent).toContain('Aucune ville trouvée');
  });

  it('hors ligne : message, et la ville déjà choisie reste', async () => {
    locationSetting.set({ mode: 'city', city: TOKYO });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await open();
    expect(q('[data-location-mode="city"]')!.getAttribute('aria-pressed')).toBe('true');
    await type('Osaka');
    await wait(350);
    expect(q('[data-place-status="offline"]')!.textContent).toContain('Recherche impossible sans internet');
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
    expect(q('[data-place-chosen]')!.textContent).toContain('Tokyo');
  });

  it('Échap ferme la fenêtre, ne remonte pas, et les écouteurs globaux la reconnaissent', async () => {
    const bubbled = vi.fn();
    const guarded: boolean[] = [];
    const capture = (e: Event) => guarded.push(inDecoDialog(e));
    window.addEventListener('keydown', bubbled);
    window.addEventListener('keydown', capture, true);
    await open();
    expect(document.activeElement).toBe(q('[data-location-dialog]'));
    await click('[data-location-mode="city"]');
    await act(async () => { q('[data-place-search]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    window.removeEventListener('keydown', bubbled);
    window.removeEventListener('keydown', capture, true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
    expect(guarded).toEqual([true]);
  });

  it('toucher le fond ferme (le choix est déjà enregistré) ; toucher le panneau ne ferme pas', async () => {
    await open();
    await click('[role="dialog"]');
    expect(onClose).not.toHaveBeenCalled();
    await click('[data-location-dialog]');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('explique d’où viennent les villes, ce qui est envoyé et les limites', async () => {
    await open();
    const text = q('[data-location-explain]')!.textContent!;
    for (const word of ['Open-Meteo', 'relais', 'texte tapé', 'vacances', 'hors ligne']) expect(text, word).toContain(word);
  });
});
