import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../relay/src/limiter';

describe('createLimiter', () => {
  it('laisse passer jusqu’à la limite puis refuse avec le délai restant', () => {
    let now = 1_000;
    const limiter = createLimiter(() => now);
    expect(limiter.check('a', 2, 60_000)).toEqual({ ok: true, retryAfterSec: 0 });
    expect(limiter.check('a', 2, 60_000).ok).toBe(true);
    now = 11_000;
    expect(limiter.check('a', 2, 60_000)).toEqual({ ok: false, retryAfterSec: 50 });
  });
  it('rouvre à la fenêtre suivante', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    limiter.check('a', 1, 1_000);
    expect(limiter.check('a', 1, 1_000).ok).toBe(false);
    now = 1_000;
    expect(limiter.check('a', 1, 1_000).ok).toBe(true);
  });
  it('compte chaque clé à part', () => {
    const limiter = createLimiter(() => 0);
    limiter.check('a', 1, 1_000);
    expect(limiter.check('b', 1, 1_000).ok).toBe(true);
  });
  it('purge les fenêtres expirées quand la table grossit', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    for (let i = 0; i < 6_000; i += 1) limiter.check(`k${i}`, 1, 1_000);
    expect(limiter.size()).toBe(6_000);
    now = 5_000;
    expect(limiter.check('nouvelle', 1, 1_000).ok).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});
