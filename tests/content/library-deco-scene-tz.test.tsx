// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';
import { resetPositionForTests } from '../../src/content/scene-position';
import { createMemoryStore } from '../../src/core/cache/store';
import { setTimeSetting, updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const label = (id: string) => container.querySelector(`[data-id="${id}"] [data-time]`)!.getAttribute('data-time');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  // 08:10 UTC : 10:10 à Paris, 17:10 à Tokyo, quel que soit le fuseau de la machine de test.
  vi.setSystemTime(new Date('2026-10-14T08:10:00Z'));
  // Ville connue : commerces, bus, département et calendrier interrogeraient le relais ; on répond « indisponible ».
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 503 })));
  window.localStorage.clear();
  resetLocationForTests();
  resetPositionForTests();
  locationSetting.set({ mode: 'city', city: { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, (l) => [...l,
    { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
    { id: 'c2', kind: 'deco', deco: 'digital-clock', col: 6, row: 1, city: { name: 'Paris', tz: 'Europe/Paris' } },
  ]));
  await settle();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('horloges quand la scène est à Tokyo', () => {
  it('« heure de la scène » = heure de Tokyo ; l’horloge réglée sur Paris = heure de Paris', () => {
    expect(label('c1')).toBe('17:10');
    expect(label('c2')).toBe('10:10');
  });

  it('heure choisie 14:00 : la scène affiche 14:00 et Paris 07:00', async () => {
    await repo.update((s) => setTimeSetting(s, { mode: 'manual', minutes: 14 * 60 }));
    await settle();
    expect(label('c1')).toBe('14:00');
    expect(label('c2')).toBe('07:00');
  });
});
