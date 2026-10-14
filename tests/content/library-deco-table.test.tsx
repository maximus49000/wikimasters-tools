// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
const confirm = async () => { if (container.querySelector('[data-action="place-confirm"]')) await click('[data-action="place-confirm"]'); };
const layoutNow = () => repo.current()?.rooms[0]?.layout ?? [];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 10, 0));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe('objets de table (réveil, pendulette, station)', () => {
  it('le réveil se pose sur un bureau et affiche l heure sur sa face', async () => {
    await repo.update((s) => updateLayout(s, s.rooms[0]!.id, () => [
      { id: 'd1', kind: 'desk', col: 4, row: 13 },
      { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', slot: 0 },
    ]));
    await settle();
    expect(container.querySelector('[data-id="s1"] [data-table-face="alarm"]')).not.toBeNull();
    expect(container.querySelector('[data-id="s1"] [data-time]')!.getAttribute('data-time')).toBe('10:10');
  });

  it('le réveil garde sa ville après relecture', async () => {
    await repo.update((s) => updateLayout(s, s.rooms[0]!.id, () => [
      { id: 'd1', kind: 'desk', col: 4, row: 13 },
      { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', slot: 0, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } },
    ]));
    await settle();
    expect(container.querySelector('[data-id="s1"]')!.textContent).toContain('TOKYO');
    expect(layoutNow().find((p) => p.id === 's1')).toMatchObject({ city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
  });

  it('se pose depuis le tiroir sur un bureau', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await confirm();
    await click('[data-category="deco"]');
    await click('[data-subcategory="clocks"]');
    await click('[data-kind="small-alarm"]');
    await click('[data-furniture="desk"]');
    await confirm();
    expect(layoutNow().find((p) => p.kind === 'small')).toMatchObject({ item: 'alarm' });
  });
});
