// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { updateLayout } from '../../src/core/library/library-book';

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


const confirm = () => click('[data-action="place-confirm"]');
const pointer = (type: string, target: EventTarget, x: number, y: number) =>
  act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); });

describe('mode placement', () => {
  it('une vignette ouvre le placement : tiroir caché, barre visible, rien d’enregistré', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    expect((q('[data-drawer]') as HTMLElement).hidden).toBe(true);
    expect(q('[data-placement-bar]')).not.toBeNull();
    expect(layoutNow()).toHaveLength(0);
  });

  it('✓ enregistre l’objet et rouvre le tiroir', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await confirm();
    expect(layoutNow()).toEqual([expect.objectContaining({ kind: 'shelf' })]);
    expect((q('[data-drawer]') as HTMLElement).hidden).toBe(false);
    expect(q('[data-placement-bar]')).toBeNull();
  });

  it('✗ et Échap n’enregistrent rien', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-action="place-cancel"]');
    expect(layoutNow()).toHaveLength(0);
    await click('[data-kind="shelf"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await settle();
    expect(q('[data-placement-bar]')).toBeNull();
    expect(layoutNow()).toHaveLength(0);
  });

  it('✓ grisé et raison affichée sur un emplacement refusé', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-8"]');
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it('« Déplacer » puis ✗ laisse l’objet en place', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-furniture="desk"]');
    await click('[data-action="move"]');
    await click('[data-cell="12-14"]');
    expect(layoutNow()[0]).toMatchObject({ col: 2 });
    await click('[data-action="place-cancel"]');
    expect(layoutNow()[0]).toMatchObject({ col: 2 });
  });

  it('« Déplacer » puis ✓ déplace l’objet et le garde sélectionné', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-furniture="desk"]');
    await click('[data-action="move"]');
    await click('[data-cell="12-14"]');
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ col: 12 });
    expect(q('[data-action-bubble]')).not.toBeNull();
  });

  it('passer en Visiter ou changer de pièce abandonne le placement', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-action="visit"]');
    expect(q('[data-placement-bar]')).toBeNull();
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-action="add-room"]');
    expect(q('[data-placement-bar]')).toBeNull();
    expect(repo.current()!.rooms[0]!.layout).toHaveLength(0);
  });

  it('la barre propose 💡 pour une lampe, et la bascule est gardée au ✓', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="lights"]');
    await click('[data-kind="lamp"]');
    await click('[data-placement-bar] [data-action="lamp"]');
    await confirm();
    expect(layoutNow().find((p) => p.kind === 'lamp')).toMatchObject({ lit: false });
  });

  it('un appui long sur l’objet en cours de placement ne relance pas le placement', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await pointer('pointerdown', q('[data-id="__draft__"]')!, 200, 400);
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();
    await pointer('pointerup', window, 200, 400);
    await settle();
    expect(q('[data-id="__draft__"]')).not.toBeNull();
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('✓ n’écrase pas une pièce modifiée pendant le placement', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    const roomId = repo.current()!.rooms[0]!.id;
    await act(async () => { await repo.update((state) => updateLayout(state, roomId, (l) => [...l, { id: 'x9', kind: 'chair', col: 20, row: 15 }])); });
    await settle();
    await click('[data-action="place-confirm"]');
    expect(layoutNow().some((p) => p.id === 'x9')).toBe(true);
  });
});
