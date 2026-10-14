// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { activeRoom } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { DecoPlaced } from '../../src/core/library/library-types';
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
const confirm = async () => { if (container.querySelector('[data-action="place-confirm"]')) await click('[data-action="place-confirm"]'); };
const layout = () => activeRoom(repo.current()!).layout;
const panel = () => layout().find((p): p is DecoPlaced => p.kind === 'deco');
const panelId = () => panel()!.id;
// Cases refusées : rectangles rouges (fill #E24B4A) de la grille d'édition.
const blinking = () => container.querySelectorAll('[data-cell][fill="#E24B4A"]').length;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await click('[data-action="edit"]');
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root.unmount());
  container.remove();
});

async function addPanelAt(col: number, row: number) {
  await click('[data-category="deco"]');
  await click('[data-subcategory="walls"]');
  await click('[data-kind="panel-chalk"]');
  await click(`[data-cell="${col}-${row}"]`);
  await confirm();
}
async function addWindowAt(col: number, row: number) {
  await click('[data-category="deco"]');
  await click('[data-subcategory="walls"]');
  await click('[data-kind="window"]');
  await click(`[data-cell="${col}-${row}"]`);
  await confirm();
}

describe('panneaux et horloges — tiroir, pose, taille', () => {
  it('pose un panneau ardoise depuis le tiroir, case touchée = coin bas-gauche', async () => {
    await addPanelAt(3, 6);
    expect(panel()).toMatchObject({ deco: 'panel-chalk', col: 3, row: 4, w: 4, h: 3 });
  });

  it('agrandit et rétrécit un panneau avec la bulle, dans ses bornes', async () => {
    await addPanelAt(3, 6);
    await click(`[data-id="${panelId()}"]`);
    await click('[data-action="deco-w+"]');
    expect(panel()).toMatchObject({ w: 5, h: 3 });
    for (let i = 0; i < 5; i++) await click('[data-action="deco-h-"]');
    expect(panel()).toMatchObject({ h: 2 });
    expect(container.textContent).toContain('Le panneau ne peut pas être plus petit.');
  });

  it('refuse d agrandir un panneau contre une fenêtre (cases qui clignotent)', async () => {
    await addWindowAt(8, 6);
    await addPanelAt(3, 6);
    await click(`[data-id="${panelId()}"]`);
    await click('[data-action="deco-w+"]');
    expect(panel()!.w).toBe(5);
    expect(blinking()).toBe(0);
    await click('[data-action="deco-w+"]');
    const p = panel()!;
    const win = layout().find((x) => x.kind === 'window')!;
    expect(p.w).toBe(5);
    // Aucun chevauchement de colonnes avec la fenêtre.
    expect(p.col + p.w! <= win.col!).toBe(true);
    expect(q('[role="status"]')!.textContent).toMatch(/occupé|place/i);
    expect(blinking()).toBeGreaterThan(0);
  });

  it('refuse d agrandir un panneau collé au mur de droite : taille inchangée, message affiché', async () => {
    await addPanelAt(20, 6); // colonnes 20 à 23 : dernière colonne de la pièce
    expect(panel()).toMatchObject({ col: 20, w: 4 });
    await click(`[data-id="${panelId()}"]`);
    await click('[data-action="deco-w+"]');
    expect(panel()).toMatchObject({ col: 20, w: 4, h: 3 });

    // Refus « hors du mur » : cases listées par canHangRect, donc elles clignotent (compté ici pour mémoire).
    expect(q("[role=status]")!.textContent).toBe("Ça ne rentre pas dans la pièce.");
    expect(blinking()).toBe(12);
  });

  it('une horloge n a pas de boutons de taille', async () => {
    await click('[data-category="deco"]');
    await click('[data-subcategory="clocks"]');
    await click('[data-kind="wall-clock"]');
    await click('[data-cell="3-6"]');
    await confirm();
    await click(`[data-id="${panelId()}"]`);
    expect(container.querySelector('[data-action="deco-w+"]')).toBeNull();
  });
});
