import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottledLoader } from '../../src/content/throttle';

describe('createThrottledLoader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ne lance qu’un chargement, après le délai, pour de nombreux appels rapprochés', () => {
    const load = vi.fn();
    const loader = createThrottledLoader(load, 1000);
    for (let i = 0; i < 20; i++) loader.call();
    vi.advanceTimersByTime(999);
    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ne laisse pas un flux continu d’appels repousser indéfiniment le chargement', () => {
    const load = vi.fn();
    const loader = createThrottledLoader(load, 1000);
    for (let t = 0; t < 3500; t += 150) {
      loader.call();
      vi.advanceTimersByTime(150);
    }
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('cancel empêche le chargement en attente', () => {
    const load = vi.fn();
    const loader = createThrottledLoader(load, 1000);
    loader.call();
    loader.cancel();
    vi.advanceTimersByTime(5000);
    expect(load).not.toHaveBeenCalled();
  });

  it('après un chargement, un nouvel appel en programme un autre', () => {
    const load = vi.fn();
    const loader = createThrottledLoader(load, 1000);
    loader.call();
    vi.advanceTimersByTime(1000);
    expect(load).toHaveBeenCalledTimes(1);
    loader.call();
    vi.advanceTimersByTime(1000);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
