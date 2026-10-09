// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { LIGHT_KEY } from '../../src/content/light-setting';
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

beforeEach(async () => {
  try { localStorage.removeItem(LIGHT_KEY); } catch { /* */ }
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
  try { localStorage.removeItem(LIGHT_KEY); } catch { /* */ }
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('bouton Lumière', () => {
  it('est pressé par défaut en scène terrestre, et un clic l’éteint et l’enregistre', async () => {
    expect(q('[data-light-toggle]')?.getAttribute('aria-pressed')).toBe('true');
    await click('[data-light-toggle]');
    expect(q('[data-light-toggle]')?.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem(LIGHT_KEY)).toBe('off');
  });
  it('allume et éteint réellement la couche de lumière de la pièce', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="window"]');
    await click('[data-cell="6-4"]');
    expect(repo.current()!.rooms[0]!.layout.some((f) => f.kind === 'window')).toBe(true);
    expect(q('[data-light-toggle]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('image[data-light]')).not.toBeNull();
    await click('[data-light-toggle]');
    expect(container.querySelector('image[data-light]')).toBeNull();
    await click('[data-light-toggle]');
    expect(container.querySelector('image[data-light]')).not.toBeNull();
  });
  it('n’existe pas en scène Espace', async () => {
    await click('[data-scene="space"]');
    expect(q('[data-light-toggle]')).toBeNull();
  });
});
