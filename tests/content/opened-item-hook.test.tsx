// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lock = vi.hoisted(() => vi.fn());
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/content/orientation-lock', () => ({ lockOrientation: lock, unlockOrientation: vi.fn() }));
vi.mock('../../src/content/ghibli-sky', () => ({ reducedMotion: () => reduced.value }));

import { useOpenedItem } from '../../src/content/opened-item/use-opened-item';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Api = ReturnType<typeof useOpenedItem>;
function mount(opts: { onBeforeClose?: () => boolean; restoreOrientation: () => void }) {
  const ref: { api: Api | null } = { api: null };
  function Probe() { ref.api = useOpenedItem(opts); return null; }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  return { ref, unmount: () => act(() => root.unmount()) };
}
const box = { x: 1, y: 2, w: 3, h: 4 };

describe('useOpenedItem', () => {
  let m: ReturnType<typeof mount> | null = null;
  beforeEach(() => { vi.useFakeTimers(); lock.mockClear(); reduced.value = false; history.replaceState(null, ''); });
  afterEach(() => { m?.unmount(); m = null; vi.useRealTimers(); });

  it('open : opening puis open après 1200 ms, historique et paysage', () => {
    m = mount({ restoreOrientation: vi.fn() });
    act(() => m!.ref.api!.open('p1', box));
    expect(m.ref.api!.opened).toMatchObject({ placedId: 'p1', from: box, to: null, phase: 'opening' });
    expect(history.state.wmtOpened).toBe(true);
    expect(lock).toHaveBeenCalledWith('landscape');
    act(() => { vi.advanceTimersByTime(1199); });
    expect(m.ref.api!.opened!.phase).toBe('opening');
    act(() => { vi.advanceTimersByTime(1); });
    expect(m.ref.api!.opened!.phase).toBe('open');
  });
  it('mouvement réduit : 150 ms', () => {
    reduced.value = true;
    m = mount({ restoreOrientation: vi.fn() });
    act(() => m!.ref.api!.open('p1', null));
    act(() => { vi.advanceTimersByTime(150); });
    expect(m.ref.api!.opened!.phase).toBe('open');
  });
  it('close : closing puis null, orientation restaurée', () => {
    const restore = vi.fn();
    m = mount({ restoreOrientation: restore });
    act(() => m!.ref.api!.open('p1', box));
    act(() => { vi.advanceTimersByTime(1200); });
    act(() => m!.ref.api!.close(box));
    expect(m.ref.api!.opened).toMatchObject({ phase: 'closing', to: box });
    expect(restore).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(m.ref.api!.opened).toBeNull();
  });
  it('open ignoré pendant opening et closing', () => {
    m = mount({ restoreOrientation: vi.fn() });
    act(() => m!.ref.api!.open('p1', box));
    act(() => m!.ref.api!.open('p2', null));
    expect(m.ref.api!.opened!.placedId).toBe('p1');
    act(() => { vi.advanceTimersByTime(1200); });
    act(() => m!.ref.api!.close(null));
    act(() => m!.ref.api!.open('p3', null));
    expect(m.ref.api!.opened!.placedId).toBe('p1');
    expect(m.ref.api!.opened!.phase).toBe('closing');
  });
  it('popstate ferme ; onBeforeClose vrai garde ouvert', () => {
    const restore = vi.fn();
    let keep = true;
    m = mount({ restoreOrientation: restore, onBeforeClose: () => keep });
    act(() => m!.ref.api!.open('p1', box));
    act(() => { vi.advanceTimersByTime(1200); });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(m.ref.api!.opened!.phase).toBe('open');
    expect(history.state.wmtOpened).toBe(true);
    keep = false;
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(m.ref.api!.opened!.phase).toBe('closing');
    expect(restore).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(m.ref.api!.opened).toBeNull();
  });
});
