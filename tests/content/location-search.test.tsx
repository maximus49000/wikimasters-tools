// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DELAY_MS, usePlaceSearch } from '../../src/content/use-place-search';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris' };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let root: Root;
let last: ReturnType<typeof usePlaceSearch>;
function Probe() {
  last = usePlaceSearch();
  return null;
}
const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('usePlaceSearch', () => {
  it('moins de 2 lettres : aucune requête', async () => {
    const fetchFn = vi.fn(async () => reply({ ok: true, cities: [ANGERS] }));
    vi.stubGlobal('fetch', fetchFn);
    act(() => last.setQuery(' a '));
    await wait(1000);
    expect(last.status).toBe('short');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('attend 350 ms puis rend les villes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: true, cities: [ANGERS] })));
    act(() => last.setQuery('Angers'));
    expect(last.status).toBe('loading');
    await wait(SEARCH_DELAY_MS);
    expect(last.status).toBe('done');
    expect(last.hits).toEqual([ANGERS]);
  });

  it('une réponse arrivée après qu’on a effacé sous 2 lettres est ignorée', async () => {
    let answer: ((r: Response) => void) | null = null;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; })));
    act(() => last.setQuery('ang'));
    await wait(SEARCH_DELAY_MS);
    expect(answer).not.toBeNull();
    act(() => last.setQuery('a'));
    await act(async () => { answer!(reply({ ok: true, cities: [ANGERS] })); });
    await wait(0);
    expect(last.status).toBe('short');
    expect(last.hits).toEqual([]);
  });

  it('hors ligne : état « offline », sans résultat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    act(() => last.setQuery('Angers'));
    await wait(SEARCH_DELAY_MS);
    expect(last.status).toBe('offline');
    expect(last.hits).toEqual([]);
  });
});
