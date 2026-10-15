import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAndroidSpotifyRemote, type RemoteWindow } from '../../src/android/spotify-remote';
import { RemoteError } from '../../src/core/spotify/remote-types';

function fakeWindow() {
  const bridge = {
    connect: vi.fn(),
    play: vi.fn(),
    skipToIndex: vi.fn(),
    queue: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    disconnect: vi.fn(),
    packageName: vi.fn(() => 'io.github.maximus49000.wikimasterstools'),
    fingerprint: vi.fn(() => 'C2:21'),
  };
  const win: RemoteWindow = { WmtSpotifyRemote: bridge };
  return { win, bridge };
}

describe('createAndroidSpotifyRemote', () => {
  afterEach(() => vi.useRealTimers());

  it('rend undefined sans pont (ancien APK)', () => {
    expect(createAndroidSpotifyRemote({})).toBeUndefined();
  });

  it('résout un appel quand Android répond sans erreur, avec un identifiant propre à chaque appel', async () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const first = remote.play('spotify:track:A');
    const second = remote.queue('spotify:track:B');
    const firstId = bridge.play.mock.calls[0]![0] as string;
    const secondId = bridge.queue.mock.calls[0]![0] as string;
    expect(firstId).not.toBe(secondId);
    expect(bridge.play).toHaveBeenCalledWith(firstId, 'spotify:track:A');
    win.__wmtSpotifyRemoteDone!(secondId, '');
    win.__wmtSpotifyRemoteDone!(firstId, '');
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('rejette avec le code reçu ; un code inconnu devient failed', async () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const denied = remote.connect('client', 'wikimasterstools://spotify');
    expect(bridge.connect).toHaveBeenCalledWith(expect.any(String), 'client', 'wikimasterstools://spotify', false);
    win.__wmtSpotifyRemoteDone!(bridge.connect.mock.calls[0]![0] as string, 'not-authorized');
    await expect(denied).rejects.toMatchObject({ code: 'not-authorized' });
    const odd = remote.pause();
    win.__wmtSpotifyRemoteDone!(bridge.pause.mock.calls[0]![0] as string, 'bizarre');
    await expect(odd).rejects.toBeInstanceOf(RemoteError);
    await expect(odd).rejects.toMatchObject({ code: 'failed' });
  });

  it('abandonne après le délai : 90 s pour connect (temps d’accepter l’accord Spotify), 10 s pour le reste', async () => {
    vi.useFakeTimers();
    const { win } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const connect = remote.connect('client', 'wikimasterstools://spotify');
    const play = remote.play('spotify:track:A');
    const connectFailed = expect(connect).rejects.toMatchObject({ code: 'failed' });
    const playFailed = expect(play).rejects.toMatchObject({ code: 'failed' });
    await vi.advanceTimersByTimeAsync(10_000);
    await playFailed;
    let settled = false;
    void connect.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(20_000);
    await connectFailed;
  });

  it('connect transmet la reconnexion silencieuse (sans écran d’accord) au pont', () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    void remote.connect('client', 'wikimasterstools://spotify', true).catch(() => undefined);
    expect(bridge.connect).toHaveBeenCalledWith(expect.any(String), 'client', 'wikimasterstools://spotify', true);
  });

  it('rejette failed si le pont lève', async () => {
    const { win, bridge } = fakeWindow();
    bridge.resume.mockImplementation(() => {
      throw new Error('boum');
    });
    await expect(createAndroidSpotifyRemote(win)!.resume()).rejects.toMatchObject({ code: 'failed' });
  });

  it('transmet skipToIndex avec la position', async () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const done = remote.skipToIndex('spotify:album:X', 3);
    expect(bridge.skipToIndex).toHaveBeenCalledWith(expect.any(String), 'spotify:album:X', 3);
    win.__wmtSpotifyRemoteDone!(bridge.skipToIndex.mock.calls[0]![0] as string, '');
    await done;
  });

  it("diffuse l'état poussé par Android ; ignore un JSON illisible", () => {
    const { win } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const seen: unknown[] = [];
    const off = remote.onEvent((event) => seen.push(event));
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X, Y', imageUrl: 'https://i.scdn.co/image/ab', playing: true } }));
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: true, track: null }));
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: false }));
    win.__wmtSpotifyRemoteState!('{pas du json');
    off();
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: false }));
    expect(seen).toEqual([
      { connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X, Y', imageUrl: 'https://i.scdn.co/image/ab', playing: true } },
      { connected: true, track: null },
      { connected: false },
    ]);
  });

  it('lit le paquet et l’empreinte de façon synchrone', () => {
    const { win } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    expect(remote.packageName()).toBe('io.github.maximus49000.wikimasterstools');
    expect(remote.fingerprint()).toBe('C2:21');
  });
});
