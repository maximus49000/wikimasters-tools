// @vitest-environment jsdom
// tests/content/music-street-memo.test.tsx — garde de performance : quand la foule en place change (un spectateur arrive),
// les spectateurs déjà en place ne sont pas rendus de nouveau (≈ 200 pantins mémoïsés).
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Outfit } from '../../src/core/library/city/people';

// Compteur de rendus des pantins, par tenue (le module réel garde tout le reste).
const renders = new Map<string, number>();
vi.mock('../../src/content/figure/ghibli-figure', async (orig) => {
  const real = await orig<typeof import('../../src/content/figure/ghibli-figure')>();
  return {
    ...real,
    GhibliFigure: (props: Parameters<typeof real.GhibliFigure>[0]) => {
      const k = JSON.stringify(props.outfit);
      renders.set(k, (renders.get(k) ?? 0) + 1);
      return real.GhibliFigure(props);
    },
  };
});

const { MusicStreet } = await import('../../src/content/music-street');
const { doorsFor } = await import('../../src/core/library/city/doors');
const { beerStandsFor, stageXs, absMinute } = await import('../../src/core/library/city/install');
const { DOOR_WIDTH, cityMetrics } = await import('../../src/core/library/city/metrics');
const { musicCrowdAt, musicCrowdFor } = await import('../../src/core/library/city/music-crowd');
const { dayNumber } = await import('../../src/core/library/city/shops/hours');
const { skyAt, sunTimes } = await import('../../src/core/library/sky');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

const W = 1080;
const H = 340;
const SEED = 1;
const M = cityMetrics(H);
const MUSIC = { y: 2026, m: 6, d: 21 };
const DAY = dayNumber(MUSIC);
const D0 = Math.floor(1_790_000_000 / 60) * 60;
const CROWD = musicCrowdFor({ seed: SEED, width: W, day: DAY, stages: stageXs(W, SEED), stands: beerStandsFor(W, H, SEED), doors: doorsFor(W, H, SEED).map((d) => d.x + DOOR_WIDTH / 2), unit: M.unit });
const standingAt = (t: number): Set<string> => new Set(CROWD.filter((s) => musicCrowdAt(s, absMinute(DAY, 0) + (t - D0) / 60).mode === 'standing').map((s) => JSON.stringify(s.outfit as Outfit)));

describe('rue de la musique : mémo des spectateurs en place', () => {
  it('un spectateur arrive : les autres pantins en place ne sont pas rendus de nouveau', () => {
    // Deux instants de la même minute entre lesquels au moins un spectateur prend sa place.
    let t1 = 0;
    let t2 = 0;
    for (let t = D0 + 18 * 3600; t < D0 + 19 * 3600 && t2 === 0; t += 60) {
      for (let s = 2; s < 58; s++) if (standingAt(t + s).size > standingAt(t + 1).size) [t1, t2] = [t + 1, t + s];
    }
    expect(t2).toBeGreaterThan(0);
    const minutes = Math.floor((t1 - D0) / 60);
    const sky = skyAt(minutes, sunTimes(MUSIC, { lat: 48.85, lon: 2.35 }, 120));
    const host = document.createElement('div');
    const root = createRoot(host);
    const el = (): ReactElement => (
      <svg>
        <MusicStreet width={W} height={H} seed={SEED} sky={sky} still={false} rainy={false} date={MUSIC} minutes={minutes} metrics={M} extra={[]} ghibli />
      </svg>
    );
    vi.spyOn(Date, 'now').mockReturnValue(t1 * 1000);
    act(() => root.render(el()));
    const before = standingAt(t1);
    expect(before.size).toBeGreaterThan(50);
    renders.clear();
    vi.spyOn(Date, 'now').mockReturnValue(t2 * 1000);
    act(() => root.render(el()));
    const again = [...before].reduce((n, k) => n + (renders.get(k) ?? 0), 0);
    expect(again).toBe(0);
    expect(host.querySelectorAll('[data-music-spectator][data-mode="standing"]').length).toBeGreaterThan(before.size);
    act(() => root.unmount());
  });
});
