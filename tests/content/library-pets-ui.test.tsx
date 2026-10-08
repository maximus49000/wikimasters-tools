// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
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
async function type(selector: string, value: string, blur = false) {
  const input = q(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { input.focus(); });
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (blur) input.blur();
  });
  await settle();
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('adoption du chat', () => {
  it('la rangée Animaux n apparaît qu en mode Aménager', async () => {
    expect(q('[aria-label="Animaux"]')).toBeNull();
    await click('[data-action="edit"]');
    expect(q('[aria-label="Animaux"]')).not.toBeNull();
    expect(q('[data-action="adopt"]')).not.toBeNull();
  });

  it('adopte un chat avec un nom et un pelage', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await type('input[aria-label="Nom du chat à adopter"]', 'Moustache');
    await click('[data-coat="black"]');
    await click('[data-action="adopt-confirm"]');
    expect(repo.current()!.rooms[0]!.pets[0]).toMatchObject({ name: 'Moustache', coat: 'black' });
    expect(q('[data-pet="p1"]')).not.toBeNull();
    expect(q('[data-action="adopt"]')).toBeNull();
  });

  it('annuler l adoption ne crée rien', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await click('[data-action="adopt-cancel"]');
    expect(repo.current()!.rooms[0]!.pets).toEqual([]);
    expect(q('[data-action="adopt"]')).not.toBeNull();
  });

  it('renomme puis retire le chat après confirmation', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await click('[data-action="adopt-confirm"]');
    expect(repo.current()!.rooms[0]!.pets[0]!.name).toBe('Minou');
    await type('input[aria-label="Nom du chat"]', 'Pilou', true);
    expect(repo.current()!.rooms[0]!.pets[0]!.name).toBe('Pilou');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-action="remove-pet"]');
    expect(repo.current()!.rooms[0]!.pets).toHaveLength(1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-action="remove-pet"]');
    expect(repo.current()!.rooms[0]!.pets).toEqual([]);
    expect(q('[data-pet]')).toBeNull();
  });
});

describe('caresser le chat', () => {
  it('toucher le chat en mode Visiter le fait ronronner et montre son nom', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await type('input[aria-label="Nom du chat à adopter"]', 'Pilou');
    await click('[data-action="adopt-confirm"]');
    await click('[data-action="visit"]');
    await click('[data-pet="p1"]');
    expect(q('[data-pet-pose="purr"]')).not.toBeNull();
    expect(q('[data-pet-name]')!.textContent).toBe('Pilou');
  });
});
