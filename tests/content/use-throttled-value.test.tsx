// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThrottledValue } from '../../src/content/useThrottledValue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const seen: number[] = [];

function Probe({ value, throttle, flush }: { value: number; throttle: boolean; flush: boolean }) {
  const shown = useThrottledValue(value, throttle, () => 2000, flush);
  seen.push(shown);
  return <span>{shown}</span>;
}
const render = (value: number, throttle = true, flush = false) => act(async () => root.render(<Probe value={value} throttle={throttle} flush={flush} />));
const shown = () => Number(container.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  seen.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useThrottledValue', () => {
  it('sans frein, suit la valeur tout de suite', async () => {
    await render(1, false);
    await render(2, false);
    expect(shown()).toBe(2);
  });

  it('freiné : plusieurs valeurs rapprochées ne livrent que la dernière, une fois par fenêtre', async () => {
    await render(0);
    for (let v = 1; v <= 5; v++) {
      await render(v);
      await act(async () => vi.advanceTimersByTime(300));
    }
    // 1 500 ms écoulées : rien n'est encore livré.
    expect(shown()).toBe(0);
    await act(async () => vi.advanceTimersByTime(500));
    expect(shown()).toBe(5);
    // Un flux continu ne repousse jamais la livraison suivante au-delà de la fenêtre.
    for (let v = 6; v <= 12; v++) {
      await render(v);
      await act(async () => vi.advanceTimersByTime(300));
    }
    // Livrée à 4 000 ms (2 000 ms après la précédente) : la valeur du moment, 12 (posée à 3 800 ms).
    expect(shown()).toBe(12);
    // Les valeurs intermédiaires ne sont jamais montrées.
    expect(seen.filter((v) => (v > 0 && v < 5) || (v > 5 && v < 12))).toEqual([]);
  });

  it('une purge livre la valeur du moment sans attendre', async () => {
    await render(0);
    await render(1);
    expect(shown()).toBe(0);
    await render(2, true, true);
    expect(shown()).toBe(2);
  });
});
