// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { LIGHT_KEY } from '../../src/content/light-setting';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';

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
const lampNow = () => layoutNow().find((p) => p.kind === 'lamp') as { lit?: boolean } | undefined;
const pointer = (type: string, target: EventTarget, x: number, y: number) =>
  act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); });

beforeEach(async () => {
  try { localStorage.removeItem(LIGHT_KEY); } catch { /* */ }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  const svg = q('svg[role="img"]') as unknown as SVGElement;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 720, bottom: 510, width: 720, height: 510, x: 0, y: 0, toJSON: () => ({}) });
});
afterEach(() => {
  try { localStorage.removeItem(LIGHT_KEY); } catch { /* */ }
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

async function withLamp(mode: 'visit' | 'edit') {
  await click('[data-action="edit"]');
  await click('[data-category="deco"]');
  await click('[data-kind="lamp"]');
  await click('[data-cell="4-14"]');
  expect(layoutNow().some((p) => p.kind === 'lamp')).toBe(true);
  if (mode === 'visit') await click('[data-action="visit"]');
}

describe('lampes cliquables', () => {
  it('en Visiter, un clic éteint puis rallume la lampe, avec aria-pressed et son nom', async () => {
    await withLamp('visit');
    const lamp = () => q('[data-furniture="lamp"]')!;
    expect(lamp().getAttribute('aria-pressed')).toBe('true');
    expect(lamp().getAttribute('aria-label')).toBe('Lampe allumée');
    await click('[data-furniture="lamp"]');
    expect(lampNow()?.lit).toBe(false);
    expect(lamp().getAttribute('aria-pressed')).toBe('false');
    expect(lamp().getAttribute('aria-label')).toBe('Lampe éteinte');
    await click('[data-furniture="lamp"]');
    expect(lampNow()?.lit).toBe(true);
  });

  it('en Visiter, une petite lampe se bascule aussi', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-lamp"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="visit"]');
    await click('[data-furniture="small"]');
    expect(layoutNow().find((p) => p.kind === 'small')).toMatchObject({ lit: false });
  });

  it('en Aménager, un clic sélectionne sans basculer ; le bouton ampoule bascule', async () => {
    await withLamp('edit');
    await click('[data-furniture="lamp"]');
    expect(lampNow()?.lit).toBeUndefined();
    const btn = () => q('[data-action="lamp"]')!;
    expect(btn().getAttribute('aria-label')).toBe('Éteindre la lampe');
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    await click('[data-action="lamp"]');
    expect(lampNow()?.lit).toBe(false);
    expect(btn().getAttribute('aria-label')).toBe('Allumer la lampe');
    expect(btn().getAttribute('aria-pressed')).toBe('false');
  });

  it('un meuble qui n’est pas une lampe ignore le clic en Visiter et n’a pas de bouton ampoule', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-action="lamp"]')).toBeNull();
    await click('[data-action="visit"]');
    await click('[data-furniture="desk"]');
    expect(layoutNow()[0]).not.toHaveProperty('lit');
    expect(q('[data-furniture="desk"]')?.hasAttribute('aria-pressed')).toBe(false);
  });

  it('en Visiter, l’appui long ne passe pas en Aménager et ne bascule pas la lampe', async () => {
    await withLamp('visit');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await pointer('pointerdown', q('[data-furniture="lamp"]')!, 135, 400);
    await act(async () => { vi.advanceTimersByTime(500); });
    vi.useRealTimers();
    await pointer('pointerup', q('[data-furniture="lamp"]')!, 135, 400);
    // Le clic que le navigateur envoie en relâchant l'appui long ne bascule rien ; le toucher suivant, si.
    await click('[data-furniture="lamp"]');
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(lampNow()?.lit).toBeUndefined();
    await click('[data-furniture="lamp"]');
    expect(lampNow()?.lit).toBe(false);
  });
});

const key = (selector: string, k: string) =>
  act(async () => { q(selector)!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

describe('lampes au clavier (Visiter)', () => {
  it('la lampe est atteignable (tabIndex 0), a un curseur main, et Entrée puis Espace la basculent', async () => {
    await withLamp('visit');
    const lamp = q('[data-furniture="lamp"]')!;
    expect(lamp.getAttribute('tabindex')).toBe('0');
    expect((lamp as unknown as SVGElement).style.cursor).toBe('pointer');
    await key('[data-furniture="lamp"]', 'Enter');
    expect(lampNow()?.lit).toBe(false);
    await key('[data-furniture="lamp"]', ' ');
    expect(lampNow()?.lit).toBe(true);
    await key('[data-furniture="lamp"]', 'a');
    expect(lampNow()?.lit).toBe(true);
  });
  it('en Aménager, la lampe n’est pas un bouton au clavier', async () => {
    await withLamp('edit');
    expect(q('[data-furniture="lamp"]')!.hasAttribute('tabindex')).toBe(false);
  });
  it('un meuble qui n’est pas une lampe n’a pas de curseur main en Visiter', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await click('[data-action="visit"]');
    expect((q('[data-furniture="desk"]') as unknown as SVGElement).style.cursor).toBe('default');
  });
});

describe('calque de lumière et dessin des lampes', () => {
  it('le calque existe pour une pièce avec lampe sans fenêtre, et disparaît avec la lumière inactive', async () => {
    await withLamp('edit');
    expect(q('image[data-light]')).not.toBeNull();
    await click('[data-light-toggle]');
    expect(q('image[data-light]')).toBeNull();
  });

  it('sans meuble ni fenêtre, pas de calque', async () => {
    expect(q('image[data-light]')).toBeNull();
  });

  it('la lampe allumée a un halo, l’éteinte non', async () => {
    await withLamp('visit');
    expect(q('[data-furniture="lamp"] [data-lamp-halo]')).not.toBeNull();
    await click('[data-furniture="lamp"]');
    expect(q('[data-furniture="lamp"] [data-lamp-halo]')).toBeNull();
  });

  it('les halos des lampes ne captent jamais le pointeur (zone de clic = le meuble)', async () => {
    await withLamp('visit');
    expect(q('[data-furniture="lamp"] [data-lamp-halo]')!.getAttribute('pointer-events')).toBe('none');
    await click('[data-action="edit"]');
    await click('[data-style="steampunk"]');
    await click('[data-action="visit"]');
    expect(q('[data-steampunk-art="lamp"] [data-lamp-halo]')!.getAttribute('pointer-events')).toBe('none');
  });

  it('la lampe Steampunk suit aussi son état', async () => {
    await click('[data-action="edit"]');
    await click('[data-style="steampunk"]');
    await click('[data-category="deco"]');
    await click('[data-kind="lamp"]');
    await click('[data-cell="4-14"]');
    await click('[data-action="visit"]');
    expect(q('[data-steampunk-art="lamp"] [data-lamp-halo]')).not.toBeNull();
    await click('[data-furniture="lamp"]');
    expect(q('[data-steampunk-art="lamp"] [data-lamp-halo]')).toBeNull();
  });
});

describe('lampe sans ciel terrestre', () => {
  it('une pièce meublée dans l’espace sans lampe allumée ne monte pas le calque', async () => {
    await click('[data-action="edit"]');
    await click('[data-scene="space"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(q('image[data-light]')).toBeNull();
    // Une lampe éteinte ne le monte pas non plus.
    await click('[data-category="deco"]');
    await click('[data-kind="lamp"]');
    await click('[data-cell="10-14"]');
    expect(q('image[data-light]')).not.toBeNull();
    await click('[data-furniture="lamp"]');
    await click('[data-action="lamp"]');
    expect(lampNow()?.lit).toBe(false);
    expect(q('image[data-light]')).toBeNull();
  });

  for (const scene of ['space', 'earth']) {
    it(`le calque existe en scène ${scene} avec une lampe`, async () => {
      await click('[data-action="edit"]');
      await click(`[data-scene="${scene}"]`);
      await click('[data-category="deco"]');
      await click('[data-kind="lamp"]');
      await click('[data-cell="4-14"]');
      expect(layoutNow().some((p) => p.kind === 'lamp')).toBe(true);
      expect(q('image[data-light]')).not.toBeNull();
    });
  }
});
