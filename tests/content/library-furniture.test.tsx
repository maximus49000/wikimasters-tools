// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
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

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await click('[data-action="edit"]');
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('mobilier dans le panneau', () => {
  it('propose quatre catégories et leurs meubles', async () => {
    expect(q('[data-kind="shelf"]')).not.toBeNull();
    for (const [category, kind] of [['seats', 'sofa'], ['pets', 'basket'], ['deco', 'rug'], ['storage', 'desk']] as const) {
      await click(`[data-category="${category}"]`);
      expect(q(`[data-kind="${kind}"]`), kind).not.toBeNull();
    }
  });

  it('pose un tapis puis un canapé dessus', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="rug"]');
    await click('[data-cell="2-17"]');
    expect(q('[data-furniture="rug"]')).not.toBeNull();
    await click('[data-category="seats"]');
    await click('[data-kind="sofa"]');
    await click('[data-cell="2-16"]');
    expect(q('[data-furniture="sofa"]')).not.toBeNull();
  });

  it('refuse un tapis sur le mur', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="rug"]');
    await click('[data-cell="3-5"]');
    expect(q('[data-furniture]')).toBeNull();
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it('explique qu’il faut un porteur pour un petit objet', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="small-plant"]');
    expect(q('[role="status"]')?.textContent).toContain('bureau');
    expect(q('[data-furniture]')).toBeNull();
  });

  it('pose une petite plante sur un bureau', async () => {
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-plant"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-furniture="small"]')).not.toBeNull();
  });

  it('retire le bureau et sa petite plante après confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-lamp"]');
    await click('[data-furniture="desk"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="remove"]');
    expect(window.confirm).toHaveBeenCalled();
    expect(q('[data-furniture]')).toBeNull();
  });

  it('garde le bureau si on refuse la confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-lamp"]');
    await click('[data-furniture="desk"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="remove"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(q('[data-furniture="small"]')).not.toBeNull();
  });

  it('explique qu’il faut libérer le milieu du bureau pour l’ordinateur', async () => {
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    // Deux petits objets : ils prennent les emplacements 0 et 1, le milieu du bureau est donc occupé.
    for (let i = 0; i < 2; i += 1) {
      await click('[data-kind="small-plant"]');
      await click('[data-furniture="desk"]');
    }
    await click('[data-category="storage"]');
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    expect(q('[role="status"]')?.textContent).toContain('Libérez le milieu du bureau');
    expect(q('[data-furniture="computer"]')).toBeNull();
  });
});
