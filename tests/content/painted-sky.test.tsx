// @vitest-environment jsdom
// tests/content/painted-sky.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { cloudJobs, fogJob, skyJobs, snowJobs, usePaintedClouds, usePaintedSky } from '../../src/content/painted-sky';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { tileCount } from '../../src/core/library/paint/city-painter';
import { cloudStep, type CloudStep } from '../../src/core/library/paint/sky-painter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  resetPaintQueueForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setJobRunnerForTests(null);
  vi.useRealTimers();
});
const flush = async (n = 40): Promise<void> => {
  for (let i = 0; i < n; i++) await act(async () => { await vi.advanceTimersByTimeAsync(20); });
};

describe('travaux du ciel', () => {
  it('clés uniques, versionnées, dépendantes de la graine et du cran', () => {
    const day = cloudStep(1, 0, 0);
    const rain = cloudStep(1, 0, 0.7);
    const keys = [...skyJobs(1), ...cloudJobs(1, day), fogJob(1, 150)].map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(cloudJobs(1, day)).toHaveLength(12);
    expect(cloudJobs(1, day)[0]!.key).not.toBe(cloudJobs(1, rain)[0]!.key);
    expect(cloudJobs(1, day)[0]!.key).not.toBe(cloudJobs(2, day)[0]!.key);
    expect(snowJobs(cityPaintPlan(1080, 340, 1))).toHaveLength(tileCount(1080));
    expect(snowJobs(cityPaintPlan(1080, 340, 1))[1]!.x).toBe(360);
  });
});

function SkyProbe({ on }: { on: boolean }) {
  const s = usePaintedSky(1, on);
  return <p data-ready={String(s.ready)}>{s.texture}</p>;
}
function CloudProbe({ step }: { step: CloudStep | null }) {
  const c = usePaintedClouds(1, step);
  return <p data-ready={String(c.ready)}>{c.urls[0] ?? ''}</p>;
}
const p = (): HTMLElement => container.querySelector('p')!;

describe('hooks du ciel', () => {
  it('ciel prêt quand la texture et les astres sont peints ; désactivé : rien de peint', async () => {
    setJobRunnerForTests(async (j) => `url:${j.key}`);
    act(() => root.render(<SkyProbe on={false} />));
    await flush();
    expect(p().dataset.ready).toBe('false');
    act(() => root.render(<SkyProbe on />));
    await flush();
    expect(p().dataset.ready).toBe('true');
    expect(p().textContent).toContain('texture');
  });

  it('garde l’ancien jeu de nuages pendant que le nouveau se peint', async () => {
    let release: (() => void) | null = null;
    setJobRunnerForTests((j) =>
      j.key.includes('-0-0|') || j.key.includes('|12-0-0|')
        ? Promise.resolve(`url:${j.key}`)
        : new Promise((resolve) => { release = () => resolve(`url:${j.key}`); }),
    );
    const day = cloudStep(1, 0, 0);
    act(() => root.render(<CloudProbe step={day} />));
    await flush();
    const first = p().textContent;
    expect(p().dataset.ready).toBe('true');
    act(() => root.render(<CloudProbe step={cloudStep(1, 0, 0.7)} />));
    await flush();
    expect(p().textContent).toBe(first);
    expect(release).not.toBeNull();
  });
});
