// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
import type { Placed } from '../../src/core/library/library-types';
import { fitText } from '../../src/core/library/text-fit';
import { RoomBackdrop } from '../../src/content/room-backdrop';
import { TableFace } from '../../src/content/deco-art';

// Espions : mesure du texte des panneaux, fond de la pièce (un re-rendu de toute la pièce le redessine) et faces des objets de table.
vi.mock('../../src/core/library/text-fit', async (orig) => {
  const m = await orig<typeof import('../../src/core/library/text-fit')>();
  return { ...m, fitText: vi.fn(m.fitText) };
});
vi.mock('../../src/content/room-backdrop', async (orig) => {
  const m = await orig<typeof import('../../src/content/room-backdrop')>();
  return { ...m, RoomBackdrop: vi.fn(m.RoomBackdrop) };
});
vi.mock('../../src/content/deco-art', async (orig) => {
  const m = await orig<typeof import('../../src/content/deco-art')>();
  return { ...m, TableFace: vi.fn(m.TableFace) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom n'a pas de canevas : sans ce relais il le signale sur la console ; la mesure retombe alors sur la chasse moyenne.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
let hidden = false;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const setLayout = async (items: Placed[]) => {
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, () => items));
  await settle();
};
const secondTimers = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([, ms]) => ms === 1000).length;
const label = (id: string) => container.querySelector(`[data-id="${id}"] [data-time]`)!.getAttribute('data-time');
const tick = (ms = 1000) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(async () => {
  hidden = false;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 10, 50));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe('seconde des horloges', () => {
  it('aucun minuteur d une seconde quand la pièce n a ni horloge ni météomètre', async () => {
    const spy = vi.spyOn(window, 'setInterval');
    await setLayout([{ id: 'p1', kind: 'deco', deco: 'panel-chalk', col: 6, row: 1, w: 4, h: 3, text: 'Bonjour' }]);
    await tick(3000);
    expect(secondTimers(spy)).toBe(0);
  });

  it('un seul minuteur pour plusieurs horloges, arrêté quand la page est cachée', async () => {
    const start = vi.spyOn(window, 'setInterval');
    const stop = vi.spyOn(window, 'clearInterval');
    await setLayout([
      { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
      { id: 'c2', kind: 'deco', deco: 'wall-clock', col: 6, row: 1 },
      { id: 'd1', kind: 'desk', col: 4, row: 13 },
      { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', slot: 0 },
    ]);
    expect(secondTimers(start)).toBe(1);
    const id = start.mock.results[start.mock.calls.findIndex(([, ms]) => ms === 1000)]!.value;
    hidden = true;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(stop).toHaveBeenCalledWith(id);
    // Page cachée : plus rien ne tourne, la seconde reste figée.
    const sec = container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds');
    await tick(3000);
    expect(container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds')).toBe(sec);
    expect(secondTimers(start)).toBe(1);
    // Page de nouveau visible : l'heure est relue aussitôt, un seul minuteur repart.
    hidden = false;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(secondTimers(start)).toBe(2);
    expect(container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds')).not.toBe(sec);
  });

  it('la seconde ne redessine ni la pièce ni le texte des panneaux ni la station de table', async () => {
    await setLayout([
      { id: 'c1', kind: 'deco', deco: 'wall-clock', col: 2, row: 1 },
      { id: 'p1', kind: 'deco', deco: 'panel-chalk', col: 6, row: 1, w: 4, h: 3, text: 'Bonjour à tous' },
      { id: 'd1', kind: 'desk', col: 4, row: 13 },
      { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', slot: 0 },
      { id: 's2', kind: 'small', item: 'station', hostId: 'd1', slot: 2 },
    ]);
    await tick();
    // Travaux asynchrones de l'ouverture du panneau (lecture du dépôt, polices…) terminés avant de compter.
    for (let i = 0; i < 5; i++) await settle();
    const fits = vi.mocked(fitText).mock.calls.length;
    const backdrops = vi.mocked(RoomBackdrop).mock.calls.length;
    const faces = (item: string) => vi.mocked(TableFace).mock.calls.filter(([p]) => p.item === item).length;
    const alarms = faces('alarm');
    const stations = faces('station');
    expect(alarms).toBeGreaterThan(0);
    expect(stations).toBeGreaterThan(0);
    const sec = container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds');
    await tick();
    expect(container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds')).not.toBe(sec);
    expect(faces('alarm')).toBeGreaterThan(alarms);
    expect(vi.mocked(fitText).mock.calls.length).toBe(fits);
    expect(vi.mocked(RoomBackdrop).mock.calls.length).toBe(backdrops);
    expect(faces('station')).toBe(stations);
  });
});

describe('heure des horloges', () => {
  it('en heure réelle, la minute change avec la seconde de l appareil (pas 30 s plus tard)', async () => {
    await setLayout([
      { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
      { id: 'c2', kind: 'deco', deco: 'digital-clock', col: 6, row: 1, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } },
    ]);
    expect(label('c1')).toBe('10:10');
    const tokyo = label('c2')!;
    await tick(15000);
    expect(label('c1')).toBe('10:11');
    expect(label('c2')!.slice(3)).toBe('11');
    expect(label('c2')!.slice(0, 2)).toBe(tokyo.slice(0, 2));
  });

  it('en heure figée, l heure reste celle de la scène et les secondes continuent', async () => {
    await repo.update((s) => ({ ...s, time: { mode: 'manual', minutes: 8 * 60 } }));
    await setLayout([{ id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 }]);
    expect(label('c1')).toBe('08:00');
    const sec = () => container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds');
    const before = sec();
    await tick(61000);
    expect(label('c1')).toBe('08:00');
    expect(sec()).not.toBe(before);
  });
});
