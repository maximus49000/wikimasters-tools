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

const confirm = () => click('[data-action="place-confirm"]');
const cancel = () => click('[data-action="place-cancel"]');

// Un bureau en colonnes 2 à 6, lignes 11 à 14 (créé en mode Aménager).
async function withDesk() {
  await click('[data-action="edit"]');
  await click('[data-kind="desk"]');
  await click('[data-cell="2-14"]');
  await confirm();
}

// Le bureau (case bas gauche 2-14) est saisi en (95, 385), soit la case 3-13 : il garde ce décalage sous le doigt.
// Relâché en (365, 405), case 12-14, sa case bas gauche arrive en 11-15 : colonnes 11 à 15, lignes 12 à 15.
describe('appui long → interface de modification (placement)', () => {
  it('appui long, glisser, relâcher : le fantôme attend ✓, puis le bureau est déplacé', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    expect(q('[data-placement-bar]')).not.toBeNull();
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
    expect(q('[data-placement-bar]')).not.toBeNull();
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ kind: 'desk', col: 11, row: 12 });
  });

  it('un bureau déplacé emmène son ordinateur', async () => {
    await withDesk();
    await click('[data-kind="computer"]');
    await confirm();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow().find((p) => p.kind === 'computer')).toMatchObject({ deskId: layoutNow()[0]!.id });
    expect(layoutNow()[0]).toMatchObject({ col: 11 });
  });

  it('déplace un petit objet d’un bureau à un autre : le doigt vise le bureau d’arrivée', async () => {
    await withDesk();
    await click('[data-kind="desk"]');
    await click('[data-cell="12-14"]');
    await confirm();
    await click('[data-category="deco"]');
    await click('[data-subcategory="plants"]');
    await click('[data-kind="small-plant"]');
    await click('[data-id="f1"]');
    await confirm();
    const [premier, second] = layoutNow().filter((p) => p.kind === 'desk');
    expect(layoutNow().find((p) => p.kind === 'small')).toMatchObject({ hostId: premier!.id });
    await longPress('[data-furniture="small"]', 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow().find((p) => p.kind === 'small')).toMatchObject({ hostId: second!.id });
  });

  it('lâcher hors du sol : placement ouvert en rouge, rien de déplacé, ✗ le remet en place', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointermove', window, 365, 265);
    await pointer('pointerup', window, 365, 265);
    await settle();
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[role="status"]')?.textContent).toContain('sol');
    await cancel();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
    expect(q('[data-placement-bar]')).toBeNull();
  });

  it('Échap pendant le glissé abandonne tout', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointermove', window, 365, 405);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(q('[data-placement-bar]')).toBeNull();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('pointercancel arrête le glissé : le placement reste ouvert et rien n’est enregistré', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointercancel', window, 365, 405);
    await settle();
    expect(q('[data-placement-bar]')).not.toBeNull();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('pendant le placement, on fait glisser l’objet lui-même', async () => {
    await withDesk();
    await click('[data-furniture="desk"]');
    await click('[data-action="move"]');
    await pointer('pointerdown', q('[data-scroll]')!, 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ col: 11, row: 12 });
  });

  it('la poignée ✥ fait glisser le fantôme', async () => {
    await withDesk();
    await click('[data-furniture="desk"]');
    await click('[data-action="move"]');
    await pointer('pointerdown', q('[data-action="place-grip"]')!, 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ col: 11, row: 12 });
  });

  it('en mode Visiter, l’appui long ne passe pas en Aménager et n’ouvre rien', async () => {
    await withDesk();
    await click('[data-action="visit"]');
    await longPress('[data-furniture="desk"]', 95, 385);
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-placement-bar]')).toBeNull();
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('en mode Visiter, un simple toucher ne fait rien', async () => {
    await withDesk();
    await click('[data-action="visit"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-action="move"]')).toBeNull();
  });

  it('le clic qui suit un appui long ne déplace pas le fantôme', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    // Le relâchement puis le clic que le navigateur envoie juste après.
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 95, clientY: 385 }));
      q('[data-cell="3-13"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('l’ordinateur change de bureau ; un bureau déjà occupé est refusé', async () => {
    await withDesk();
    await click('[data-kind="desk"]');
    await click('[data-cell="12-14"]');
    await confirm();
    const [first, second] = layoutNow().filter((p) => p.kind === 'desk');
    await click('[data-kind="computer"]');
    await click(`[data-id="${first!.id}"]`);
    await confirm();
    const computer = layoutNow().find((p) => p.kind === 'computer')!;
    await longPress(`[data-id="${computer.id}"]`, 100, 335);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow().find((p) => p.id === computer.id)).toMatchObject({ deskId: second!.id });
    // Un 2e ordinateur sur le premier bureau, glissé vers le bureau déjà occupé : refusé.
    await click('[data-kind="computer"]');
    await click(`[data-id="${first!.id}"]`);
    await confirm();
    const other = layoutNow().find((p) => p.kind === 'computer' && p.deskId === first!.id)!;
    await longPress(`[data-id="${other.id}"]`, 100, 335);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[role="status"]')?.textContent).toContain('déjà');
    await cancel();
    expect(layoutNow().find((p) => p.id === other.id)).toMatchObject({ deskId: first!.id });
  });
});

describe('appui long : objets superposés', () => {
  it('l’appui long sur l’objet sélectionné derrière modifie celui-ci, pas celui de devant', async () => {
    await repo.update((state) => ({
      ...state,
      rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout: [{ id: 'sh', kind: 'shelf', col: 0, row: 10 }, { id: 'arm', kind: 'armchair', col: 1, row: 13 }] } : r)),
    }));
    await settle();
    await click('[data-action="edit"]');
    await click('[data-id="arm"]');
    await click('[data-id="arm"]');
    // L'étagère est sélectionnée et redessinée devant ; l'appui arrive pourtant au fauteuil.
    await longPress('[data-id="arm"]', 45, 390);
    await pointer('pointermove', window, 345, 390);
    await pointer('pointerup', window, 345, 390);
    await settle();
    await confirm();
    expect(layoutNow().find((p) => p.id === 'arm')).toMatchObject({ col: 1, row: 13 });
    expect(layoutNow().find((p) => p.id === 'sh')).not.toMatchObject({ col: 0, row: 10 });
  });
});
