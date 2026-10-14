// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_CSS, LibraryPanel } from '../../src/content/LibraryPanel';
import { placeBanner } from '../../src/content/library-sky-menu';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';
import { resetPositionForTests } from '../../src/content/scene-position';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
const row = () => q('[role="group"][aria-label="Météo"]');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  resetPositionForTests();
  window.localStorage.removeItem('wmt:scene-location');
  resetLocationForTests();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 503 })));
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number; message: string }) => void) => fail({ code: 1, message: 'refusé' }) },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await click('[data-action="edit"]');
});
afterEach(() => {
  window.localStorage.removeItem('wmt:positionEnabled');
  window.localStorage.removeItem('wmt:scene-location');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  act(() => root.unmount());
  container.remove();
});

describe('rangée Météo', () => {
  it('apparaît en mode Aménager pour une scène terrestre, avec 2 modes et 7 états', () => {
    expect(row()).not.toBeNull();
    expect(row()!.querySelectorAll('[data-weather-mode]')).toHaveLength(2);
    expect(row()!.querySelectorAll('[data-weather-state]')).toHaveLength(7);
    expect(row()!.querySelector('[data-weather-mode="random"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('forcer un état l’enregistre et le marque pressé', async () => {
    await click('[data-weather-state="storm"]');
    expect(repo.current()!.weather).toEqual({ mode: 'forced', state: 'storm' });
    expect(q('[data-weather-state="storm"]')?.getAttribute('aria-pressed')).toBe('true');
    // Le libellé suit l'horloge, qui fond d'une météo à l'autre en 30 s : on avance le temps simulé au-delà du fondu.
    await act(async () => { vi.advanceTimersByTime(40_000); });
    expect(q('[data-weather-label]')?.textContent).toContain('Orage');
  });

  it('🎲 revient à l’aléatoire', async () => {
    await click('[data-weather-state="snow"]');
    await click('[data-weather-mode="random"]');
    expect(repo.current()!.weather).toEqual({ mode: 'random' });
    expect(q('[data-weather-mode="random"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('🌍 enregistre « réelle », demande la position et signale le repli sans position', async () => {
    const spy = vi.spyOn(navigator.geolocation, 'getCurrentPosition');
    await click('[data-weather-mode="real"]');
    expect(repo.current()!.weather).toEqual({ mode: 'real' });
    expect(spy).toHaveBeenCalled();
    expect(q('[data-weather-note]')?.textContent).toContain('simulée');
  });

  it('🌍 est grisé quand le réglage Position est désactivé, et le choix « réelle » est conservé', async () => {
    await click('[data-weather-mode="real"]');
    await act(async () => { locationSetting.set({ mode: 'off' }); });
    const globe = q('[data-weather-mode="real"]') as HTMLButtonElement;
    expect(globe.disabled).toBe(true);
    expect(repo.current()!.weather).toEqual({ mode: 'real' });
    expect(q('[data-weather-note]')?.getAttribute('title')).toContain('Lieu désactivé');
    await act(async () => { locationSetting.set({ mode: 'geo' }); });
    expect((q('[data-weather-mode="real"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('est masquée en scène Espace et Terre, et reste dans le menu Ciel en mode Visiter', async () => {
    await click('[data-scene="space"]');
    expect(row()).toBeNull();
    await click('[data-scene="earth"]');
    expect(row()).toBeNull();
    await click('[data-scene="sea"]');
    expect(row()).not.toBeNull();
    await click('[data-action="visit"]');
    expect(row()).not.toBeNull();
  });
});

describe('bouton de zone des vacances', () => {
  it('fait défiler Auto → A → B → C → Corse → Auto (📍 pour Auto)', async () => {
    const btn = () => q('[data-zone-toggle]')!;
    expect(btn().textContent).toContain('📍');
    expect(btn().getAttribute('aria-label')).toContain('automatique');
    for (const [glyph, label] of [['A', 'zone A'], ['B', 'zone B'], ['C', 'zone C'], ['Co', 'zone Corse'], ['📍', 'automatique']]) {
      await click('[data-zone-toggle]');
      expect(btn().textContent).toContain(glyph);
      expect(btn().getAttribute('aria-label')).toContain(label);
    }
  });
});

const TOKYO = { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };

describe('bandeau du lieu (menu ☁️)', () => {
  const banner = () => q('[data-location-banner]')!;

  it('géolocalisation : « Ma position » et la raison de l’échec', () => {
    expect(banner().getAttribute('data-location-banner')).toBe('geo');
    expect(banner().textContent).toContain('📍');
    expect(banner().textContent).toContain('Ma position');
    expect(banner().textContent).toContain('géolocalisation · position refusée');
  });

  it('ville : nom, pays et heure de la ville', async () => {
    vi.setSystemTime(new Date('2026-10-14T13:14:00Z'));
    await act(async () => { locationSetting.set({ mode: 'city', city: TOKYO }); });
    expect(banner().getAttribute('data-location-banner')).toBe('city');
    expect(banner().textContent).toContain('🏙');
    expect(banner().textContent).toContain('Tokyo');
    expect(banner().textContent).toContain('Japon · 22:14 · heure de la ville');
    expect(banner().getAttribute('aria-label')).toBe('Lieu de la scène : Tokyo, Japon · 22:14 · heure de la ville. Changer le lieu');
  });

  it('ville : l’ancien échec de position (refusée) n’apparaît pas dans le bandeau', async () => {
    expect(banner().textContent).toContain('position refusée');
    await act(async () => { locationSetting.set({ mode: 'city', city: TOKYO }); });
    expect(banner().textContent).not.toContain('refusée');
    await act(async () => { locationSetting.set({ mode: 'off' }); });
    expect(banner().textContent).not.toContain('refusée');
  });

  it('désactivé : « Lieu désactivé » et fuseau de l’appareil', async () => {
    await act(async () => { locationSetting.set({ mode: 'off' }); });
    expect(banner().textContent).toContain('⊘');
    expect(banner().textContent).toContain('Lieu désactivé');
    expect(banner().textContent).toContain('fuseau de l’appareil');
  });

  it('toucher le bandeau ouvre la fenêtre Lieu de la scène', async () => {
    await click('[data-location-banner]');
    expect(q('[data-location-dialog]')).not.toBeNull();
    await click('[data-action="location-close"]');
    expect(q('[data-location-dialog]')).toBeNull();
  });

  it('Échap dans la fenêtre ne ferme qu’elle : le menu ☁️ reste ouvert, le mode Aménager aussi', async () => {
    await click('[data-menu-button="sky"]');
    expect(q('[data-menu="sky"]')!.hidden).toBe(false);
    await click('[data-location-banner]');
    const dialog = q('[data-location-dialog]')!;
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-location-dialog]')).toBeNull();
    expect(q('[data-menu="sky"]')!.hidden).toBe(false);
    expect(q('[data-action="visit"]')).not.toBeNull();
  });

  it('toucher dans la fenêtre ne ferme pas le menu ☁️', async () => {
    await click('[data-menu-button="sky"]');
    await click('[data-location-banner]');
    const dialog = q('[data-location-dialog]')!;
    await act(async () => { dialog.querySelector('[role="dialog"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(q('[data-location-dialog]')).not.toBeNull();
    expect(q('[data-menu="sky"]')!.hidden).toBe(false);
  });

  it('pays vide : pas de « · » en tête', () => {
    const b = placeBanner({ mode: 'city', city: { ...TOKYO, country: '' } }, null, new Date('2026-10-14T13:14:00Z'));
    expect(b.sub).toBe('22:14 · heure de la ville');
  });

  it('le bandeau est une cible tactile pleine largeur', () => {
    expect(LIBRARY_CSS).toMatch(/\.wmt-lib-place\{[^}]*width:100%[^}]*min-height:52px/);
  });
});
