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
const windows = () => room().layout.filter((p) => p.kind === 'window');

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

async function placeWindow() {
  await click('[data-category="deco"]');
  await click('[data-kind="window"]');
  await click('[data-cell="3-6"]');
}

describe('fenêtre — pose et taille', () => {
  it('se pose en 6×5 : la case touchée est son coin bas-gauche', async () => {
    await placeWindow();
    expect(windows()).toEqual([{ id: 'f1', kind: 'window', col: 3, row: 2, w: 6, h: 5 }]);
  });

  it('se sélectionne et s’agrandit / se réduit avec les boutons', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    await click('[data-action="win-w+"]');
    await click('[data-action="win-h+"]');
    expect(windows()[0]).toMatchObject({ w: 7, h: 6 });
    await click('[data-action="win-w-"]');
    await click('[data-action="win-h-"]');
    expect(windows()[0]).toMatchObject({ w: 6, h: 5 });
  });

  it('refuse de rétrécir sous 3×3 et de dépasser 12×10', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    for (let i = 0; i < 6; i++) await click('[data-action="win-w-"]');
    expect(windows()[0]!.w).toBe(3);
    for (let i = 0; i < 12; i++) await click('[data-action="win-w+"]');
    expect(windows()[0]!.w).toBe(12);
  });

  it('refuse un agrandissement qui chevauche un autre objet et fait clignoter les cases', async () => {
    await placeWindow();
    await click('[data-kind="window"]');
    await click('[data-cell="12-6"]');
    expect(windows()).toHaveLength(2);
    await click('[data-furniture="window"][data-id="f1"]');
    for (let i = 0; i < 4; i++) await click('[data-action="win-w+"]');
    expect(windows().find((w) => w.id === 'f1')!.w).toBeLessThan(10);
    expect(q('[role="status"]')!.textContent).toMatch(/occupé|place/i);
  });

  it('se retire', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    await click('[data-action="remove"]');
    expect(windows()).toHaveLength(0);
  });

  it('se déplace avec « Déplacer »', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    await click('[data-action="move"]');
    await click('[data-cell="15-6"]');
    expect(windows()[0]).toMatchObject({ col: 15, row: 2 });
  });
});

describe('panneau Ciel', () => {
  it('change la scène de la pièce', async () => {
    expect(q('[role="group"][aria-label="Ciel"]')).not.toBeNull();
    await click('[data-scene="sea"]');
    expect(room().scene).toBe('sea');
  });

  it('règle l’heure globale et montre le curseur en heure manuelle', async () => {
    expect(q('[data-time-slider]')).toBeNull();
    await click('[data-time="manual"]');
    expect(repo.current()!.time.mode).toBe('manual');
    expect(q('[data-time-slider]')).not.toBeNull();
    await click('[data-time="night"]');
    expect(repo.current()!.time).toEqual({ mode: 'night' });
  });

  it('affiche le lever et le coucher du jour', () => {
    expect(q('[data-sun-times]')!.textContent).toMatch(/\d\d:\d\d.*\d\d:\d\d/s);
  });

  it('choisir « Heure réelle » demande la position (accord du joueur)', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    await click('[data-time="night"]');
    await click('[data-time="real"]');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('le panneau n’existe qu’en mode Aménager', async () => {
    await click('[data-action="visit"]');
    expect(q('[role="group"][aria-label="Ciel"]')).toBeNull();
  });
});

describe('heure réelle — position déjà accordée', () => {
  async function mountWith(state: PermissionState) {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    Object.defineProperty(navigator, 'permissions', { value: { query: vi.fn(async () => ({ state })) }, configurable: true });
    const other = document.createElement('div');
    document.body.append(other);
    const otherRoot = createRoot(other);
    await act(async () => { otherRoot.render(<LibraryPanel library={createLibraryRepo(createMemoryStore())} />); });
    await settle();
    act(() => otherRoot.unmount());
    other.remove();
    return getCurrentPosition;
  }
  afterEach(() => {
    delete (navigator as { permissions?: unknown }).permissions;
    delete (navigator as { geolocation?: unknown }).geolocation;
  });

  it('relit la position au chargement si l’accord est déjà donné', async () => {
    expect(await mountWith('granted')).toHaveBeenCalledTimes(1);
  });

  it('ne demande jamais rien au chargement sans accord', async () => {
    expect(await mountWith('prompt')).not.toHaveBeenCalled();
  });
});
