// @vitest-environment jsdom
// Vue Modifier d'un plateau (✋) : bouton dans la bulle, objets du plateau, glissé au cm avec empreinte verte/rouge, retour à la place.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
import { topToScreen } from '../../src/core/library/arrange';
import type { Layout } from '../../src/core/library/library-types';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ArrangeView, arrangeFrameFor } from '../../src/content/arrange/ArrangeView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
const pointer = (type: string, target: EventTarget, x: number, y: number) =>
  act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); });

// Bureau avec écran, lampe (15 × 15) devant à gauche, plante (15 × 15) devant à droite, réveil (18 × 7) devant au milieu.
const DESK: Layout = [
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'pc', kind: 'computer', deskId: 'd' },
  { id: 'l', kind: 'small', item: 'lamp', hostId: 'd', x: 2, z: 2 },
  { id: 'p', kind: 'small', item: 'plant', hostId: 'd', x: 100, z: 2 },
  { id: 'a', kind: 'small', item: 'alarm', hostId: 'd', x: 40, z: 2 },
];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('bulle d’un meuble porteur', () => {
  let repo: LibraryRepo;
  const seed = async (layout: Layout) => {
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };

  it('✋ « Modifier la disposition » pour un bureau en Aménager, pas pour une chaise', async () => {
    await seed([...DESK, { id: 'ch', kind: 'chair', col: 2, row: 14 }]);
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    const btn = q('[data-action-bubble] [data-action="arrange"]');
    expect(btn?.getAttribute('aria-label')).toBe('Modifier la disposition');
    expect(btn?.textContent).toContain('✋');
    await click('[data-furniture="chair"]');
    expect(q('[data-action-bubble]')).not.toBeNull();
    expect(q('[data-action-bubble] [data-action="arrange"]')).toBeNull();
  });

  it('✋ ouvre la vue Modifier avec un élément par objet du plateau, l’ordinateur fixé ; ✓ la ferme', async () => {
    await seed(DESK);
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="arrange"]');
    expect(q('[data-arrange-view]')).not.toBeNull();
    for (const id of ['pc', 'l', 'p', 'a']) expect(q(`[data-arrange-item="${id}"]`), id).not.toBeNull();
    expect(q('[data-arrange-item="pc"]')?.hasAttribute('data-fixed')).toBe(true);
    expect(q('[data-arrange-item="a"]')?.hasAttribute('data-fixed')).toBe(false);
    await click('[data-arrange-view] [aria-label="Terminer"]');
    expect(q('[data-arrange-view]')).toBeNull();
  });
});

describe('ArrangeView : glissé sur le plateau', () => {
  const frame = arrangeFrameFor('desk', { w: 800, h: 400 });
  // Déplacement écran (px) qui fait passer un coin avant gauche de (x0, z0) à (x1, z1) cm.
  const delta = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
    const a = topToScreen(frame, x0, z0);
    const b = topToScreen(frame, x1, z1);
    return [b[0] - a[0], b[1] - a[1]];
  };
  const mount = (layout: Layout = DESK) => {
    const h = { onCommit: vi.fn(), onClose: vi.fn() };
    act(() => root.render(<ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="move" {...h} />));
    return h;
  };
  const item = (id: string) => q(`[data-arrange-item="${id}"]`) as SVGGElement;
  const drag = async (id: string, [dx, dy]: [number, number], release = true) => {
    await pointer('pointerdown', item(id), 300, 200);
    await pointer('pointermove', window, 300 + dx / 2, 200 + dy / 2);
    await pointer('pointermove', window, 300 + dx, 200 + dy);
    if (release) await pointer('pointerup', window, 300 + dx, 200 + dy);
  };

  it('glisser le réveil vers une place libre puis lâcher : onCommit une fois, réveil à la nouvelle place', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 60, 20), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('true');
    expect(item('a').style.transform).toContain('translate');
    await pointer('pointerup', window, 0, 0);
    expect(h.onCommit).toHaveBeenCalledTimes(1);
    const next = h.onCommit.mock.calls[0]![0] as Layout;
    expect(next.find((p) => p.id === 'a')).toMatchObject({ x: 60, z: 20 });
    expect(q('[data-footprint]')).toBeNull();
  });

  it('au-dessus de la lampe : empreinte rouge ; lâcher : rien n’est enregistré, l’objet revient', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 2, 2), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('false');
    await pointer('pointerup', window, 0, 0);
    expect(h.onCommit).not.toHaveBeenCalled();
    expect(item('a').style.transform).toBe('');
    expect(q('[data-footprint]')).toBeNull();
  });

  it('hors du plateau : empreinte rouge', async () => {
    mount();
    await drag('a', delta(40, 2, 110, 2), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('false');
  });

  it('toucher sans glisser (moins de 4 px) ne fait rien', async () => {
    const h = mount();
    await pointer('pointerdown', item('a'), 300, 200);
    await pointer('pointermove', window, 302, 201);
    expect(q('[data-footprint]')).toBeNull();
    expect(item('a').style.transform).toBe('');
    await pointer('pointerup', window, 302, 201);
    expect(h.onCommit).not.toHaveBeenCalled();
  });

  it('l’ordinateur ne se saisit pas', async () => {
    const h = mount();
    await drag('pc', [80, 0], false);
    expect(q('[data-footprint]')).toBeNull();
    expect(item('pc').style.transform).toBe('');
    await pointer('pointerup', window, 0, 0);
    expect(h.onCommit).not.toHaveBeenCalled();
  });

  it('✓ ferme la vue', () => {
    const h = mount();
    act(() => (q('[aria-label="Terminer"]') as HTMLButtonElement).click());
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
