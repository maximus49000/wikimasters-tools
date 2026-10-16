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
function mount(opts: Parameters<typeof useOpenedItem>[0]) {
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
    expect(typeof history.state.wmtOpened).toBe('string');
    expect(lock).toHaveBeenCalledWith('landscape');
    act(() => { vi.advanceTimersByTime(1199); });
    expect(m.ref.api!.opened!.phase).toBe('opening');
    act(() => { vi.advanceTimersByTime(1); });
    expect(m.ref.api!.opened!.phase).toBe('open');
  });
  it('jeton propre à chaque ouverture : une clé héritée d’une entrée plus ancienne n’est pas la nôtre', () => {
    history.replaceState({ wmtOpened: true }, '');
    m = mount({ restoreOrientation: vi.fn() });
    act(() => m!.ref.api!.open('p1', box));
    const first = history.state.wmtOpened;
    expect(first).not.toBe(true);
    act(() => { vi.advanceTimersByTime(1200); });
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    // L'entrée du dessus n'est plus la nôtre (remplacée) : ✕ ne retire pas une entrée qui ne nous appartient pas.
    history.replaceState({ wmtOpened: true }, '');
    act(() => m!.ref.api!.close(null));
    expect(back).not.toHaveBeenCalled();
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
    expect(typeof history.state.wmtOpened).toBe('string');
    keep = false;
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(m.ref.api!.opened!.phase).toBe('closing');
    expect(restore).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(m.ref.api!.opened).toBeNull();
  });
  it('closeTarget : ✕ sans rectangle et retour Android volent vers la cible donnée', () => {
    let target: { x: number; y: number; w: number; h: number } | null = { x: 9, y: 8, w: 7, h: 6 };
    m = mount({ restoreOrientation: vi.fn(), closeTarget: () => target });
    act(() => m!.ref.api!.open('p1', box));
    act(() => { vi.advanceTimersByTime(1200); });
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    act(() => m!.ref.api!.close());
    expect(m.ref.api!.opened).toMatchObject({ to: { x: 9, y: 8, w: 7, h: 6 }, phase: 'closing' });
    act(() => { vi.advanceTimersByTime(1200); });
    target = { x: 1, y: 1, w: 1, h: 1 };
    act(() => m!.ref.api!.open('p2', null));
    act(() => { vi.advanceTimersByTime(1200); });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(m.ref.api!.opened).toMatchObject({ placedId: 'p2', to: target, phase: 'closing' });
  });
  it('reset : fermeture immédiate, rend l’orientation, signale son entrée sans toucher à l’historique', () => {
    const restore = vi.fn();
    m = mount({ restoreOrientation: restore });
    act(() => m!.ref.api!.open('p1', box));
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    let popped = false;
    act(() => { popped = m!.ref.api!.reset(); });
    expect(popped).toBe(true);
    expect(m.ref.api!.opened).toBeNull();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    // Le popstate qui suit (l'appelant retire l'entrée) est ignoré ; un second reset ne signale plus rien.
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(m.ref.api!.opened).toBeNull();
    act(() => { popped = m!.ref.api!.reset(); });
    expect(popped).toBe(false);
    expect(restore).toHaveBeenCalledTimes(1);
    // On peut rouvrir aussitôt (rien en cours).
    act(() => m!.ref.api!.open('p2', null));
    expect(m.ref.api!.opened!.placedId).toBe('p2');
  });
});
