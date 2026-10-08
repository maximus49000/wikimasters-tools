// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { activeRoom } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
const room = () => activeRoom(repo.current()!);

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

async function placeGlobe() {
  await click('[data-style="steampunk"]');
  await click('[data-category="steampunk"]');
  await click('[data-kind="globe"]');
  await click('[data-cell="2-17"]');
  expect(room().layout.some((item) => item.kind === 'globe')).toBe(true);
}

describe('sélecteur de style', () => {
  it('propose les 8 styles en mode Aménager seulement', async () => {
    expect(container.querySelectorAll('button[data-style]').length).toBe(0);
    await click('[data-action="edit"]');
    expect(container.querySelectorAll('button[data-style]').length).toBe(8);
  });

  it('choisit un style : bouton pressé, état enregistré, svg étiqueté', async () => {
    await click('[data-action="edit"]');
    await click('[data-style="neon"]');
    expect(q('button[data-style="neon"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(room().style).toBe('neon');
    expect(q('svg[data-style="neon"]')).not.toBeNull();
  });

  it('montre la catégorie Steampunk seulement en Steampunk', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-category="steampunk"]')).toBeNull();
    await click('[data-style="steampunk"]');
    await click('[data-category="steampunk"]');
    for (const kind of ['globe', 'telescope', 'automaton']) expect(q(`[data-kind="${kind}"]`), kind).not.toBeNull();
  });

  it('garde style et globe si on refuse la confirmation', async () => {
    await click('[data-action="edit"]');
    await placeGlobe();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-style="moderne"]');
    expect(room().style).toBe('steampunk');
    expect(room().layout.some((item) => item.kind === 'globe')).toBe(true);
  });

  it('change de style et retire le globe si on confirme', async () => {
    await click('[data-action="edit"]');
    await placeGlobe();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-style="moderne"]');
    expect(room().style).toBe('moderne');
    expect(room().layout.some((item) => item.kind === 'globe')).toBe(false);
    expect(q('[data-category="steampunk"]')).toBeNull();
  });

  it('quitte Steampunk sans meuble exclusif sans confirmation', async () => {
    await click('[data-action="edit"]');
    await click('[data-style="steampunk"]');
    const confirm = vi.spyOn(window, 'confirm');
    await click('[data-style="moderne"]');
    expect(confirm).not.toHaveBeenCalled();
    expect(room().style).toBe('moderne');
  });
});
