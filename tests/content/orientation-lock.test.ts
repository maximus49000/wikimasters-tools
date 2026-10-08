import { describe, expect, it, vi } from 'vitest';
import { lockOrientation, unlockOrientation } from '../../src/content/orientation-lock';

describe('verrou d’orientation', () => {
  it('verrouille en paysage ou en portrait selon la pièce', () => {
    const lock = vi.fn(() => Promise.resolve());
    lockOrientation('landscape', { orientation: { lock } });
    lockOrientation('portrait', { orientation: { lock } });
    expect(lock.mock.calls).toEqual([['landscape'], ['portrait']]);
  });

  it('déverrouille', () => {
    const unlock = vi.fn();
    unlockOrientation({ orientation: { unlock } });
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('ignore une API absente', () => {
    expect(() => lockOrientation('landscape', {})).not.toThrow();
    expect(() => lockOrientation('landscape', { orientation: {} })).not.toThrow();
    expect(() => unlockOrientation({})).not.toThrow();
    expect(() => unlockOrientation({ orientation: {} })).not.toThrow();
  });

  it('avale un refus, asynchrone ou immédiat', async () => {
    const rejected = vi.fn(() => Promise.reject(new Error('refusé')));
    expect(() => lockOrientation('portrait', { orientation: { lock: rejected } })).not.toThrow();
    const thrower = vi.fn(() => { throw new Error('NotSupported'); });
    expect(() => lockOrientation('portrait', { orientation: { lock: thrower } })).not.toThrow();
    expect(() => unlockOrientation({ orientation: { unlock: thrower } })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
