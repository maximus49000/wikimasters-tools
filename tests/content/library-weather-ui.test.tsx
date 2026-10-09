// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
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
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
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
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it('est masquée en scène Espace et Terre, et hors mode Aménager', async () => {
    await click('[data-scene="space"]');
    expect(row()).toBeNull();
    await click('[data-scene="earth"]');
    expect(row()).toBeNull();
    await click('[data-scene="sea"]');
    expect(row()).not.toBeNull();
    await click('[data-action="visit"]');
    expect(row()).toBeNull();
  });
});
