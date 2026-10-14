// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { createMemoryStore } from '../../src/core/cache/store';
import { activeRoom, updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (selector: string) => container.querySelector<HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
async function type(selector: string, value: string) {
  const el = q(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`introuvable : ${selector}`);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const item = (id: string) => activeRoom(repo.current()!).layout.find((p) => p.id === id)!;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, (l) => [...l,
    { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
    { id: 'p1', kind: 'deco', deco: 'panel-neon', col: 6, row: 1, w: 5, h: 2 },
  ]));
  await settle();
});
afterEach(() => { vi.unstubAllGlobals(); act(() => root.unmount()); container.remove(); });

describe('fenêtres ville et écrire', () => {
  it('🌐 en Aménager choisit puis retire une ville', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="c1"]');
    await click('[data-action="deco-city"]');
    await type('[data-city-search]', 'tok');
    await click('[data-city-tz="Asia/Tokyo"]');
    expect(item('c1')).toMatchObject({ city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
    // L'horloge reste sélectionnée : la bulle est toujours là (un nouveau toucher la désélectionnerait).
    await click('[data-action="deco-city"]');
    await click('[data-city-tz=""]');
    expect(item('c1')).not.toHaveProperty('city');
  });
  it('toucher une horloge en Visiter ouvre directement le choix de ville', async () => {
    await click('[data-id="c1"]');
    expect(container.querySelector('[data-city-search]')).not.toBeNull();
  });
  it('toucher un panneau en Visiter ouvre directement la fenêtre de texte', async () => {
    await click('[data-id="p1"]');
    expect(container.querySelector('[data-deco-text]')).not.toBeNull();
  });
  it('✏️ enregistre le texte et la couleur du néon', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="p1"]');
    await click('[data-action="deco-write"]');
    await type('[data-deco-text]', 'Bonne nuit');
    await click('[data-neon="green"]');
    await click('[data-action="deco-text-ok"]');
    expect(item('p1')).toMatchObject({ text: 'Bonne nuit', neon: 'green' });
  });
  it('Échap ferme la fenêtre de texte sans enregistrer ni quitter le mode placement', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="p1"]');
    await click('[data-action="deco-write"]');
    await type('[data-deco-text]', 'Brouillon');
    await act(async () => { container.querySelector('[data-deco-text]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(container.querySelector('[data-deco-text]')).toBeNull();
    expect(item('p1')).not.toMatchObject({ text: 'Brouillon' });
    expect(container.querySelector('[data-action="deco-write"]')).not.toBeNull();
  });
  it('la zone de texte limite à 140 caractères', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="p1"]');
    await click('[data-action="deco-write"]');
    expect(container.querySelector('[data-deco-text]')!.getAttribute('maxlength')).toBe('140');
  });
  it('la fenêtre prend le focus à l ouverture, Échap la ferme sans rien retirer', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="p1"]');
    await click('[data-action="deco-write"]');
    const dialog = q('[data-wmt-deco-dialog]')!;
    expect(document.activeElement).toBe(dialog);
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-wmt-deco-dialog]')).toBeNull();
    expect(q('[data-action="deco-write"]')).not.toBeNull();
    expect(activeRoom(repo.current()!).layout.map((p) => p.id)).toEqual(expect.arrayContaining(['c1', 'p1']));
  });
  it('Échap sur window pendant la fenêtre est ignoré par les écouteurs de la pièce', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="p1"]');
    await click('[data-action="deco-write"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-deco-text]')).not.toBeNull();
    expect(q('[data-action="deco-write"]')).not.toBeNull();
    expect(item('p1')).toBeDefined();
  });
  it('le champ de recherche de la fenêtre ville a le focus à l ouverture, Échap y ferme la fenêtre', async () => {
    await click('[data-action="edit"]');
    await click('[data-id="c1"]');
    await click('[data-action="deco-city"]');
    const input = q('[data-city-search]')!;
    expect(document.activeElement).toBe(input);
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-city-search]')).toBeNull();
  });
});
