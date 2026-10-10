// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ART_KEY } from '../../src/content/art-setting';
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
  try { localStorage.removeItem(ART_KEY); } catch { /* */ }
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  resetPositionForTests();
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
  try { localStorage.removeItem(ART_KEY); } catch { /* */ }
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('bouton Graphisme Ghibli', () => {
  it('bascule, s’enregistre et change d’étiquette', async () => {
    await click('[data-scene="city"]');
    const btn = () => q('[data-art-toggle]');
    expect(btn()?.getAttribute('aria-pressed')).toBe('false');
    expect(btn()?.getAttribute('aria-label')).toBe('Graphisme Ghibli : désactivé');
    await click('[data-art-toggle]');
    expect(btn()?.getAttribute('aria-pressed')).toBe('true');
    expect(btn()?.getAttribute('aria-label')).toBe('Graphisme Ghibli : activé');
    expect(localStorage.getItem(ART_KEY)).toBe('ghibli');
    await click('[data-art-toggle]');
    expect(localStorage.getItem(ART_KEY)).toBe('classic');
  });
  it('absent hors de la scène Ville', async () => {
    await click('[data-scene="sea"]');
    expect(q('[data-art-toggle]')).toBeNull();
  });
});
