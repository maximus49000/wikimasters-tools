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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 10, 0));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, (l) => [...l,
    { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
    { id: 'c2', kind: 'deco', deco: 'digital-clock', col: 6, row: 1, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } },
    { id: 'm1', kind: 'deco', deco: 'weather-station', col: 10, row: 1 },
  ]));
  await settle();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe('objets décoratifs dans la pièce', () => {
  it('sont dessinés au niveau du mur', () => {
    const wall = container.querySelector('[data-depth="0"]')!;
    expect(wall.querySelectorAll('[data-deco]')).toHaveLength(3);
    expect(container.querySelector('[data-id="c1"] [data-deco="digital-clock"]')).not.toBeNull();
  });
  it('l horloge de la scène et celle de Tokyo n affichent pas la même heure', () => {
    const label = (id: string) => container.querySelector(`[data-id="${id}"] [data-time]`)!.getAttribute('data-time');
    expect(label('c1')).toBe('10:10');
    expect(label('c2')).not.toBe('10:10');
    expect(container.querySelector('[data-id="c2"]')!.textContent).toContain('TOKYO');
  });
  it('les secondes avancent avec le minuteur', async () => {
    const sec = () => container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds');
    const before = sec();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(sec()).not.toBe(before);
  });
});
