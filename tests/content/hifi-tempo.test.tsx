// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '../../src/content/player-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: PlayerView;
const playerListeners = new Set<() => void>();
const player = {
  current: () => view,
  subscribe: vi.fn((l: () => void) => { playerListeners.add(l); return () => { playerListeners.delete(l); }; }),
};
const tempoFn = vi.fn();
const service = { tempo: tempoFn, known: () => undefined, subscribe: () => () => {} };
let hasService = true;

vi.mock('../../src/content/music-registry', () => ({
  getPlayerSource: () => player,
  getTempoService: () => (hasService ? service : null),
}));

const { useTrackTempo } = await import('../../src/content/hifi/use-track-tempo');

const trackView = (uri: string): PlayerView => ({
  linked: true, hidden: false, enabled: true, card: null,
  track: { uri, title: `T-${uri}`, artist: 'A', imageUrl: null, playing: true },
});
const setView = (v: PlayerView) => { view = v; act(() => { for (const l of [...playerListeners]) l(); }); };

let root: Root;
let container: HTMLElement;
let seen: (number | null)[];
function Probe({ active }: { active: boolean }) {
  const bpm = useTrackTempo(active);
  seen.push(bpm);
  return null;
}
const render = (active: boolean) => act(() => { root.render(<Probe active={active} />); });
const deferred = () => {
  let resolve!: (v: number | null) => void;
  const promise = new Promise<number | null>((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  hasService = true;
  playerListeners.clear();
  player.subscribe.mockClear();
  tempoFn.mockReset();
  seen = [];
  view = trackView('a');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('useTrackTempo', () => {
  it('active=false : ni abonnement ni mesure', () => {
    render(false);
    expect(player.subscribe).not.toHaveBeenCalled();
    expect(tempoFn).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeNull();
  });

  it('mesure une seule fois par piste et rend le tempo', async () => {
    tempoFn.mockResolvedValue(97);
    render(true);
    await act(async () => { await Promise.resolve(); });
    expect(seen.at(-1)).toBe(97);
    setView({ ...trackView('a') });
    render(true);
    expect(tempoFn).toHaveBeenCalledTimes(1);
  });

  it('sans service de tempo : tempo inconnu', () => {
    hasService = false;
    render(true);
    expect(seen.at(-1)).toBeNull();
    expect(tempoFn).not.toHaveBeenCalled();
  });

  it('changement de piste pendant une mesure : l\'ancienne valeur n\'est jamais rendue pour la nouvelle piste', async () => {
    const first = deferred();
    tempoFn.mockImplementation((t: { uri: string }) => (t.uri === 'a' ? first.promise : Promise.resolve(150)));
    render(true);
    setView(trackView('b'));
    await act(async () => { await Promise.resolve(); });
    expect(seen.at(-1)).toBe(150);
    await act(async () => { first.resolve(70); await Promise.resolve(); });
    expect(seen).not.toContain(70);
    expect(seen.at(-1)).toBe(150);
  });

  it('nouvelle piste pas encore mesurée : tempo inconnu, pas celui de la précédente', async () => {
    tempoFn.mockImplementation((t: { uri: string }) => (t.uri === 'a' ? Promise.resolve(70) : new Promise(() => {})));
    render(true);
    await act(async () => { await Promise.resolve(); });
    expect(seen.at(-1)).toBe(70);
    setView(trackView('b'));
    expect(seen.at(-1)).toBeNull();
  });
});
