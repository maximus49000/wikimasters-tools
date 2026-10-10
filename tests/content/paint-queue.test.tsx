// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPaintQueueForTests, setJobRunnerForTests, usePaintJobs, type PaintJob } from '../../src/content/paint-queue';

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

const job = (key: string): PaintJob => ({ key, x: 0, w: 10, h: 10, res: 1, paint: () => undefined });
function Probe({ jobs, enabled = true }: { jobs: PaintJob[]; enabled?: boolean }) {
  const ready = usePaintJobs(jobs, enabled);
  return <p data-n={ready.size}>{[...ready.values()].join(',')}</p>;
}
const text = (): string => container.querySelector('p')!.textContent ?? '';
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await act(async () => { await vi.advanceTimersByTimeAsync(20); });
};

describe('file de peinture', () => {
  it('sous jsdom, le peintre canvas ne rend rien', async () => {
    act(() => root.render(<Probe jobs={[job('a')]} />));
    await flush();
    expect(text()).toBe('');
  });

  it('peint dans l’ordre, une image par créneau, et met en cache', async () => {
    const order: string[] = [];
    setJobRunnerForTests(async (j) => { order.push(j.key); return `url:${j.key}`; });
    act(() => root.render(<Probe jobs={[job('a'), job('b')]} />));
    await flush();
    expect(order).toEqual(['a', 'b']);
    expect(text()).toBe('url:a,url:b');
    act(() => root.render(<Probe jobs={[job('b')]} />));
    await flush();
    expect(order).toEqual(['a', 'b']);
    expect(text()).toBe('url:b');
  });

  it('un travail en échec n’est jamais repeint', async () => {
    let calls = 0;
    setJobRunnerForTests(async () => { calls++; throw new Error('canvas'); });
    act(() => root.render(<Probe jobs={[job('x')]} />));
    await flush();
    act(() => root.render(<Probe jobs={[job('x')]} />));
    await flush();
    expect(calls).toBe(1);
    expect(text()).toBe('');
  });

  it('désactivé : ne peint pas mais rend ce qui est en cache', async () => {
    setJobRunnerForTests(async (j) => `url:${j.key}`);
    act(() => root.render(<Probe jobs={[job('a')]} />));
    await flush();
    act(() => root.render(<Probe jobs={[job('a'), job('z')]} enabled={false} />));
    await flush();
    expect(text()).toBe('url:a');
  });
});
