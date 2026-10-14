// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepo } from '../../src/core/collection/collection-repo';
import { createKindsRepo } from '../../src/core/kinds/kinds-repo';
import { createMemoryStore } from '../../src/core/cache/store';
import { updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo } from '../../src/core/library/library-repo';
import { createLibraryWindow, LIBRARY_WINDOW_ATTRIBUTE } from '../../src/content/library-window';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
let win: ReturnType<typeof createLibraryWindow>;

beforeEach(async () => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const library = createLibraryRepo(createMemoryStore());
  win = createLibraryWindow({ library, collection: createCollectionRepo(createMemoryStore()), kinds: createKindsRepo(createMemoryStore(), async () => ({ kinds: {}, labels: {} })), onOpenCard: () => undefined, onOpenMarket: () => undefined });
  await settle();
  await library.update((s) => updateLayout(s, s.rooms[0]!.id, (l) => [...l, { id: 'p1', kind: 'deco', deco: 'panel-neon', col: 6, row: 1, w: 5, h: 2 }]));
  await act(async () => { win.open(); });
  await settle();
});
afterEach(() => { act(() => win.close()); vi.unstubAllGlobals(); });

describe('Échap dans la fenêtre « Ma Pièce »', () => {
  it('ferme la fenêtre de texte seule, la bibliothèque reste ouverte', async () => {
    const shadow = document.querySelector(`[${LIBRARY_WINDOW_ATTRIBUTE}]`)!.shadowRoot!;
    const click = async (sel: string) => { await act(async () => { shadow.querySelector(sel)!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); }); await settle(); };
    await click('[data-action="edit"]');
    await click('[data-id="p1"]');
    await click('[data-action="deco-write"]');
    const dialog = shadow.querySelector('[data-wmt-deco-dialog]')!;
    expect(dialog).not.toBeNull();
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })); });
    expect(shadow.querySelector('[data-wmt-deco-dialog]')).toBeNull();
    expect(document.querySelector(`[${LIBRARY_WINDOW_ATTRIBUTE}]`)).not.toBeNull();
  });
});
