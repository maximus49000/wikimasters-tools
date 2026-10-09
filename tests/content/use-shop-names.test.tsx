// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NamePool } from '../../src/core/library/city/shops/lifecycle';
const pos = vi.hoisted(() => ({ known: false, value: { lat: 48.85, lon: 2.35 } }));
vi.mock('../../src/content/scene-position', () => ({
  currentPosition: () => pos.value,
  isPositionKnown: () => pos.known,
  subscribePosition: () => () => undefined,
}));

import { resetShopNamesCacheForTests, useShopNames } from '../../src/content/use-shop-names';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unmounts: (() => void)[] = [];

function renderNames(enabled = true): { current: NamePool } {
  const out = { current: undefined as unknown as NamePool };
  function Probe() {
    out.current = useShopNames(enabled);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  unmounts.push(() => act(() => root.unmount()));
  return out;
}

async function waitFor(check: () => void): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 50; i += 1) {
    try {
      check();
      return;
    } catch (e) {
      last = e;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }
  throw last;
}

beforeEach(() => {
  pos.known = false;
  resetShopNamesCacheForTests();
  window.localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  unmounts.splice(0).forEach((u) => u());
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('useShopNames', () => {
  it('position inconnue : {} et aucun fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const out = renderNames();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(out.current).toEqual({});
    expect(f).not.toHaveBeenCalled();
  });

  it('position connue : un seul appel partagé, puis les noms', async () => {
    pos.known = true;
    const f = vi.fn(async (_url: string) => json({ ok: true, names: { bar: ['Le Welsh'] } }));
    vi.stubGlobal('fetch', f);
    const a = renderNames();
    const b = renderNames();
    await waitFor(() => expect(a.current).toEqual({ bar: ['Le Welsh'] }));
    await waitFor(() => expect(b.current).toEqual({ bar: ['Le Welsh'] }));
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]![0])).toMatch(/\/shops\?lat=48\.9&lon=2\.4$/);
  });

  it('échec : {} et date d’échec mémorisée, pas de nouvel appel dans les 24 h', async () => {
    pos.known = true;
    const f = vi.fn(async () => {
      throw new Error('réseau');
    });
    vi.stubGlobal('fetch', f);
    const out = renderNames();
    await waitFor(() => expect(window.localStorage.getItem('wmt:city-shops-fail')).not.toBeNull());
    expect(out.current).toEqual({});
    expect(window.localStorage.getItem('wmt:city-shops-fail')).toMatch(/^\d+$/);
    expect(f).toHaveBeenCalledTimes(1);
    resetShopNamesCacheForTests();
    renderNames();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
