import { describe, expect, it, vi } from 'vitest';
import { createPlayerSource } from '../../src/content/player-source';
import { SpotifyError } from '../../src/core/spotify/errors';

const playing = { playing: true, title: 'Something', artist: 'The Beatles', imageUrl: null };

function setup(over: { linked?: boolean; hidden?: string | null } = {}) {
  const scheduled: { fn: () => void; ms: number }[] = [];
  const stored = new Map<string, string>(over.hidden ? [['wmt:spotifyPlayerHidden', over.hidden]] : []);
  const api = {
    playerState: vi.fn(async () => playing as typeof playing | null),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
  };
  let linked = over.linked ?? true;
  const listeners = new Set<() => void>();
  const session = {
    isLinked: async () => linked,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const source = createPlayerSource({
    api,
    session,
    storage: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => void stored.set(k, v) },
    schedule: (fn, ms) => {
      const entry = { fn, ms };
      scheduled.push(entry);
      return () => void scheduled.splice(scheduled.indexOf(entry), 1);
    },
  });
  return { source, api, scheduled, stored, setLinked: (value: boolean) => { linked = value; listeners.forEach((l) => l()); } };
}

describe('createPlayerSource', () => {
  it('commence masqué selon la valeur mémorisée, et mémorise le choix', () => {
    const { source, stored } = setup({ hidden: '1' });
    expect(source.current().hidden).toBe(true);
    source.setHidden(false);
    expect(source.current().hidden).toBe(false);
    expect(stored.get('wmt:spotifyPlayerHidden')).toBe('0');
  });

  it("interroge l'état puis reprogramme : 5 s en lecture, 15 s sinon", async () => {
    const { source, api, scheduled } = setup();
    source.start();
    await vi.waitFor(() => expect(source.current().track).toEqual({ title: 'Something', artist: 'The Beatles', imageUrl: null, playing: true }));
    expect(source.current().linked).toBe(true);
    expect(scheduled.at(-1)?.ms).toBe(5000);
    api.playerState.mockResolvedValueOnce({ ...playing, playing: false });
    scheduled.at(-1)!.fn();
    await vi.waitFor(() => expect(source.current().track?.playing).toBe(false));
    expect(scheduled.at(-1)?.ms).toBe(15000);
  });

  it("n'interroge pas Spotify quand le compte n'est pas lié, et démarre à la liaison", async () => {
    const { source, api, setLinked } = setup({ linked: false });
    source.start();
    await vi.waitFor(() => expect(source.current().linked).toBe(false));
    expect(api.playerState).not.toHaveBeenCalled();
    setLinked(true);
    await vi.waitFor(() => expect(api.playerState).toHaveBeenCalled());
  });

  it('attend la durée demandée après un 429, et efface le lecteur si le compte est délié', async () => {
    const { source, api, scheduled, setLinked } = setup();
    api.playerState.mockRejectedValueOnce(new SpotifyError('rate-limited', 'x', 8000));
    source.start();
    await vi.waitFor(() => expect(scheduled.at(-1)?.ms).toBe(8000));
    setLinked(false);
    await vi.waitFor(() => expect(source.current()).toMatchObject({ linked: false, track: null }));
  });

  it('bascule lecture/pause selon l’état courant', async () => {
    const { source, api } = setup();
    source.start();
    await vi.waitFor(() => expect(source.current().track?.playing).toBe(true));
    await source.toggle();
    expect(api.pause).toHaveBeenCalled();
    api.playerState.mockResolvedValue({ ...playing, playing: false });
    await source.refresh();
    await source.toggle();
    expect(api.play).toHaveBeenCalledWith(null);
  });

  it("arrête le sondage à l'arrêt", async () => {
    const { source, scheduled } = setup();
    source.start();
    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    source.stop();
    expect(scheduled).toHaveLength(0);
  });
});
