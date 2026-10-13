// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
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

function stubFullscreen() {
  let current: Element | null = null;
  const request = vi.fn(function (this: HTMLElement) {
    current = this;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: () => {
      current = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    },
  });
}

beforeEach(async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true })); // mouvement réduit : bascules immédiates
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('LibraryPanel : aller dehors', () => {
  it('montre un bouton Sortir sur la scène, qui devient Rentrer', async () => {
    const btn = q('.wmt-lib-stage [data-action="outside"]');
    expect(btn?.getAttribute('aria-label')).toBe('Sortir');
    await click('[data-action="outside"]');
    expect(q('[data-action="inside"]')?.getAttribute('aria-label')).toBe('Rentrer');
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(true);
    expect(q('[data-room-layers]')).toBeNull();
    await click('[data-action="inside"]');
    expect(q('[data-action="outside"]')).not.toBeNull();
    expect(q('[data-room-layers]')).not.toBeNull();
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(false);
  });

  it('le bouton est aussi présent en plein écran', async () => {
    stubFullscreen();
    await click('[data-action="fullscreen"]');
    expect(q('.wmt-lib-stage [data-action="outside"]')).not.toBeNull();
  });

  it('pas de bouton en Aménager ; passer en Aménager depuis dehors ramène à l’intérieur', async () => {
    await click('[data-action="outside"]');
    await click('[data-action="edit"]');
    expect(q('[data-action="outside"]')).toBeNull();
    expect(q('[data-action="inside"]')).toBeNull();
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(false);
  });

  it('changer de pièce ramène à l’intérieur', async () => {
    await click('[data-action="add-room"]');
    await click('[data-room="r1"]');
    await click('[data-action="outside"]');
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(true);
    await click('[data-room="r2"]');
    expect(q('[data-room="r2"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('[data-action="outside"]')).not.toBeNull();
    expect(q('svg[role="img"]')?.hasAttribute('data-outside')).toBe(false);
  });

  it('changer de pièce dehors ne restitue pas le défilement de l’ancienne pièce', async () => {
    await click('[data-action="add-room"]');
    await click('[data-room="r1"]');
    const sc = q('svg[role="img"]')!.parentElement as HTMLElement;
    let left = 0;
    Object.defineProperty(sc, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v; } });
    left = 120;
    await click('[data-action="outside"]');
    await click('[data-room="r2"]');
    expect(left).toBe(0);
  });

  it('pas de bouton Adapter à l’écran dehors', async () => {
    await click('[data-action="outside"]');
    expect(q('[data-action="fit-screen"]')).toBeNull();
  });

  it('à la réouverture, on est à l’intérieur', async () => {
    await click('[data-action="outside"]');
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await settle();
    expect(q('[data-action="outside"]')).not.toBeNull();
  });

  it('pas de zoom sur un meuble tant que la caméra extérieure rentre', async () => {
    // Mouvement normal, images d'animation tenues à la main : la phase « returning » dure tant qu'on ne les joue pas.
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) } as DOMRect);
    const play = () => act(async () => { for (const f of frames.splice(0)) f(performance.now() + 1e6); await Promise.resolve(); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => [
      { id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Inconnue' },
    ])); });
    await settle();
    await click('[data-action="outside"]');
    await play();
    await settle();
    await click('[data-action="inside"]');
    expect(q('[data-action="inside"]')?.hasAttribute('disabled')).toBe(true);
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')).toBeNull();
    await play();
    await settle();
  });
});
