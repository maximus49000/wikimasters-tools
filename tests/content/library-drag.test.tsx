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
const layoutNow = () => repo.current()?.rooms[0]?.layout ?? [];

// Un pixel d'écran = une unité du dessin (24 colonnes de 30, hauteur 510).
function stubSvgRect() {
  const svg = q('svg[role="img"]') as unknown as SVGElement;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 720, bottom: 510, width: 720, height: 510, x: 0, y: 0, toJSON: () => ({}) });
}
const pointer = (type: string, target: EventTarget, x: number, y: number) =>
  act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); });
async function longPress(selector: string, x: number, y: number) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await pointer('pointerdown', q(selector)!, x, y);
  await act(async () => { vi.advanceTimersByTime(500); });
  vi.useRealTimers();
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  stubSvgRect();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

// Un bureau en colonnes 2 à 6, lignes 11 à 14 (créé en mode Aménager).
async function withDesk() {
  await click('[data-action="edit"]');
  await click('[data-kind="desk"]');
  await click('[data-cell="2-14"]');
}

describe('déplacement par appui long', () => {
  it('déplace un bureau : appui long, glisser, relâcher sur une case valide', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ kind: 'desk', col: 12, row: 11 });
  });

  it('un bureau déplacé emmène son ordinateur', async () => {
    await withDesk();
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow().find((p) => p.kind === 'computer')).toMatchObject({ deskId: layoutNow()[0]!.id });
    expect(layoutNow()[0]).toMatchObject({ col: 12 });
  });

  it('déplace un petit objet d’un bureau à un autre : appui long, glisser, relâcher sur le bureau', async () => {
    await withDesk();
    await click('[data-kind="desk"]');
    await click('[data-cell="12-14"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-plant"]');
    await click('[data-furniture="desk"]');
    const [premier, second] = layoutNow().filter((p) => p.kind === 'desk');
    expect(layoutNow().find((p) => p.kind === 'small')).toMatchObject({ hostId: premier!.id });
    await longPress('[data-furniture="small"]', 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow().find((p) => p.kind === 'small')).toMatchObject({ hostId: second!.id });
  });

  it('un lâcher invalide laisse le meuble en place et le dit', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointermove', window, 365, 265);
    await pointer('pointerup', window, 365, 265);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ kind: 'desk', col: 2, row: 11 });
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it('Échap annule le déplacement', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointermove', window, 365, 405);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('pointercancel annule le déplacement', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointercancel', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('en mode Visiter, l’appui long passe en Aménager et commence le déplacement', async () => {
    await withDesk();
    await click('[data-action="visit"]');
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    await longPress('[data-furniture="desk"]', 95, 385);
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('true');
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ col: 12, row: 11 });
  });

  it('en mode Visiter, un simple toucher ne fait rien', async () => {
    await withDesk();
    await click('[data-action="visit"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-action="move"]')).toBeNull();
  });

  it('un toucher après un appui long n’est pas pris pour un clic', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    // Le relâchement puis le clic que le navigateur envoie juste après.
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 95, clientY: 385 }));
      q('[data-furniture="desk"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(q('[data-action="move"]')).toBeNull();
    await click('[data-furniture="desk"]');
    expect(q('[data-action="move"]')).not.toBeNull();
  });

  it('l’ordinateur change de bureau ; un bureau déjà occupé est refusé', async () => {
    await withDesk();
    await click('[data-kind="desk"]');
    await click('[data-cell="12-14"]');
    const [first, second] = layoutNow().filter((p) => p.kind === 'desk');
    await click('[data-kind="computer"]');
    await click(`[data-id="${first!.id}"]`);
    const computer = layoutNow().find((p) => p.kind === 'computer')!;
    await longPress(`[data-id="${computer.id}"]`, 100, 335);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow().find((p) => p.id === computer.id)).toMatchObject({ deskId: second!.id });
    // Un 2e ordinateur sur le premier bureau, glissé vers le bureau déjà occupé : refusé.
    await click('[data-kind="computer"]');
    await click(`[data-id="${first!.id}"]`);
    const other = layoutNow().find((p) => p.kind === 'computer' && p.deskId === first!.id)!;
    await longPress(`[data-id="${other.id}"]`, 100, 335);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow().find((p) => p.id === other.id)).toMatchObject({ deskId: first!.id });
    expect(q('[role="status"]')?.textContent).toContain('déjà');
  });
});
