// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: KeyValueStore;
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
  store = createMemoryStore();
  repo = createLibraryRepo(store);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LibraryPanel', () => {
  it('montre la première pièce vide', () => {
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('svg[role="img"]')).not.toBeNull();
    expect(q('[data-furniture]')).toBeNull();
  });

  it('crée une pièce et la rend active', async () => {
    await click('[data-action="add-room"]');
    expect(q('[data-room="r2"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('false');
  });

  it('pose une étagère au sol puis la retire', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-10"]');
    expect(q('[data-furniture="shelf"]')).not.toBeNull();
    await click('[data-furniture="shelf"]');
    await click('[data-action="remove"]');
    expect(q('[data-furniture="shelf"]')).toBeNull();
  });

  it('refuse un meuble posé sur le mur et le dit', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-8"]');
    expect(q('[data-furniture]')).toBeNull();
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it("pose un ordinateur sur un bureau, une seule fois", async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-11"]');
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-furniture="computer"]')).not.toBeNull();
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    expect(container.querySelectorAll('[data-furniture="computer"]')).toHaveLength(1);
    expect(q('[role="status"]')?.textContent).toContain('déjà');
  });

  it("garde le même aménagement dans les deux orientations, avec une fenêtre différente", async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-11"]');
    const width = () => (q('svg[role="img"]') as unknown as SVGElement).style.width;
    expect(width()).toBe('100%');
    await click('[data-orient="portrait"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(width().startsWith('171.4')).toBe(true);
    await click('[data-orient="landscape"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(width()).toBe('100%');
  });

  it('agrandit la pièce à droite, puis la réduit', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-cell="30-10"]')).toBeNull();
    await click('[data-action="extend-right"]');
    expect(q('[data-cell="30-10"]')).not.toBeNull();
    await click('[data-action="shrink-right"]');
    expect(q('[data-cell="30-10"]')).toBeNull();
  });

  it('agrandit la pièce à gauche en décalant les meubles', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-11"]');
    await click('[data-action="extend-left"]');
    expect(repo.current()?.rooms[0]?.layout[0]).toMatchObject({ kind: 'desk', col: 14 });
  });

  it('refuse de réduire sous 24 colonnes ou une zone occupée, et le dit', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="shrink-right"]');
    expect(q('[role="status"]')?.textContent).toContain('24');
    await click('[data-action="extend-right"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="30-10"]');
    await click('[data-action="shrink-right"]');
    expect(q('[role="status"]')?.textContent).toContain('meubles');
    expect(repo.current()?.rooms[0]?.cols).toBe(36);
  });

  it("définit puis retire la pièce d'accueil", async () => {
    await click('[data-action="home"]');
    expect(repo.current()?.homeRoomId).toBe('r1');
    expect(q('[data-action="home"]')?.getAttribute('aria-pressed')).toBe('true');
    await click('[data-action="home"]');
    expect(repo.current()?.homeRoomId).toBeNull();
  });

  it('mémorise les pièces et les relit au remontage', async () => {
    await click('[data-action="add-room"]');
    const again = createLibraryRepo(store);
    await act(async () => { root.render(<LibraryPanel library={again} />); });
    await settle();
    expect(q('[data-room="r2"]')).not.toBeNull();
  });
});
