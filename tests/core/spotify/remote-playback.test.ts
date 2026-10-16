import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createRemotePlayback, REMOTE_STATUS_KEY } from '../../../src/core/spotify/remote-playback';
import { RemoteError, type RemoteEvent, type RemoteErrorCode } from '../../../src/core/spotify/remote-types';
import { SpotifyError } from '../../../src/core/spotify/errors';

const KEY = '30d88341188741668651e8ab170849cb';

function setup(options: { connectError?: (RemoteErrorCode | null)[]; status?: string; clientId?: string | null; now?: () => number } = {}) {
  const store = createMemoryStore();
  if (options.status) void store.set(REMOTE_STATUS_KEY, { status: options.status });
  const failures = [...(options.connectError ?? [])];
  let push: (event: RemoteEvent) => void = () => undefined;
  const remote = {
    connect: vi.fn(async () => {
      const code = failures.shift();
      if (code) throw new RemoteError(code);
    }),
    play: vi.fn(async () => undefined),
    skipToIndex: vi.fn(async () => undefined),
    queue: vi.fn(async (_uri: string) => undefined),
    repeatOff: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    onEvent: vi.fn((listener: (event: RemoteEvent) => void) => {
      push = listener;
      return () => undefined;
    }),
    packageName: () => 'p',
    fingerprint: () => 'f',
  };
  const api = {
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    playerState: vi.fn(async () => ({ playing: false, uri: 'spotify:track:W', title: 'Web', artist: 'API', imageUrl: null })),
  };
  let sessionListener: () => void = () => undefined;
  const session = {
    clientId: vi.fn(async () => (options.clientId === undefined ? KEY : options.clientId)),
    subscribe: vi.fn((listener: () => void) => {
      sessionListener = listener;
      return () => undefined;
    }),
  };
  const playback = createRemotePlayback({ remote, api, session, redirectUri: async () => 'wikimasterstools://spotify', store, now: options.now });
  return { playback, remote, api, store, push: (event: RemoteEvent) => push(event), sessionChanged: () => sessionListener() };
}

describe('createRemotePlayback.play', () => {
  it('titre d’album à sa position : skipToIndex, puis statut ok et voie sdk', async () => {
    const { playback, remote, api, store } = setup();
    await playback.play({ contextUri: 'spotify:album:A', offsetUri: 'spotify:track:2', offsetIndex: 1 });
    expect(remote.connect).toHaveBeenCalledWith(KEY, 'wikimasterstools://spotify', false);
    expect(remote.skipToIndex).toHaveBeenCalledWith('spotify:album:A', 1);
    expect(api.play).not.toHaveBeenCalled();
    expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status: 'ok' });
    expect(playback.lastRoute()).toBe('sdk');
  });

  it('album ou playlist depuis le début : play(contexte)', async () => {
    const { playback, remote } = setup();
    await playback.play({ contextUri: 'spotify:playlist:P' });
    expect(remote.play).toHaveBeenCalledWith('spotify:playlist:P');
  });

  it('reprise (null) : resume', async () => {
    const { playback, remote } = setup();
    await playback.play(null);
    expect(remote.resume).toHaveBeenCalled();
  });

  it('liste lancée depuis une carte : coupe « répéter le titre » après le lancement, pas à la reprise', async () => {
    const { playback, remote } = setup();
    await playback.play({ contextUri: 'spotify:album:A', offsetIndex: 1 });
    expect(remote.repeatOff).toHaveBeenCalledTimes(1);
    expect(remote.skipToIndex.mock.invocationCallOrder[0]!).toBeLessThan(remote.repeatOff.mock.invocationCallOrder[0]!);
    await playback.play(null);
    expect(remote.repeatOff).toHaveBeenCalledTimes(1);
  });

  it('un refus de couper la répétition ne fait pas échouer la lecture (reste sur le SDK)', async () => {
    const { playback, remote, api } = setup();
    remote.repeatOff.mockRejectedValueOnce(new RemoteError('failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await playback.play({ uris: ['spotify:track:1'] });
    expect(remote.play).toHaveBeenCalledWith('spotify:track:1');
    expect(api.play).not.toHaveBeenCalled();
    expect(playback.lastRoute()).toBe('sdk');
    warn.mockRestore();
  });

  it('liste de titres : le premier, puis 10 en file au plus, dans l’ordre', async () => {
    const { playback, remote } = setup();
    const uris = Array.from({ length: 14 }, (_, i) => `spotify:track:${i}`);
    await playback.play({ uris });
    expect(remote.play).toHaveBeenCalledWith('spotify:track:0');
    expect(remote.queue.mock.calls.map((call) => call[0])).toEqual(uris.slice(1, 11));
  });

  it('une file qui échoue n’arrête pas la lecture', async () => {
    const { playback, remote } = setup();
    remote.queue.mockRejectedValueOnce(new RemoteError('failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(playback.play({ uris: ['spotify:track:0', 'spotify:track:1', 'spotify:track:2'] })).resolves.toBeUndefined();
    expect(remote.queue).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it.each([
    ['not-installed', 'not-installed'],
    ['not-authorized', 'not-configured'],
    ['unsupported', 'outdated'],
  ] as const)('%s : Web API, et SDK écarté (statut %s) pour les lectures suivantes', async (code, status) => {
    const { playback, remote, api, store } = setup({ connectError: [code] });
    await playback.play({ uris: ['spotify:track:0'] });
    expect(api.play).toHaveBeenCalledWith({ uris: ['spotify:track:0'] });
    expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status });
    expect(playback.lastRoute()).toBe('web-api');
    await playback.play({ uris: ['spotify:track:1'] });
    expect(remote.connect).toHaveBeenCalledTimes(1);
  });

  it('connexion en échec (failed ou délai) : pas de seconde connexion, Web API tout de suite, statut inchangé', async () => {
    const { playback, remote, api, store } = setup({ connectError: ['failed'] });
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).toHaveBeenCalledTimes(1);
    expect(api.play).toHaveBeenCalledTimes(1);
    expect(playback.lastRoute()).toBe('web-api');
    expect(await store.get(REMOTE_STATUS_KEY)).toBeUndefined();
  });

  it('commande en échec sur une connexion établie : une reconnexion, puis la commande réussit', async () => {
    const { playback, remote, api } = setup();
    remote.play.mockRejectedValueOnce(new RemoteError('failed'));
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).toHaveBeenCalledTimes(2);
    expect(remote.play).toHaveBeenCalledTimes(2);
    expect(api.play).not.toHaveBeenCalled();
    expect(playback.lastRoute()).toBe('sdk');
  });

  it('commande en échec puis reconnexion en échec : Web API, sans troisième essai', async () => {
    const { playback, remote, api } = setup({ connectError: [null, 'failed'] });
    remote.play.mockRejectedValueOnce(new RemoteError('failed'));
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).toHaveBeenCalledTimes(2);
    expect(api.play).toHaveBeenCalledTimes(1);
  });

  it('failed n’écarte pas le SDK : 60 s de pause sans le toucher, puis il est réessayé', async () => {
    let clock = 1_000_000;
    const { playback, remote, api } = setup({ connectError: ['failed'], now: () => clock });
    await playback.play({ uris: ['spotify:track:0'] });
    clock += 59_000;
    await playback.play({ uris: ['spotify:track:1'] });
    expect(remote.connect).toHaveBeenCalledTimes(1);
    expect(api.play).toHaveBeenCalledTimes(2);
    clock += 2_000;
    await playback.play({ uris: ['spotify:track:2'] });
    expect(remote.connect).toHaveBeenCalledTimes(2);
    expect(remote.play).toHaveBeenCalledWith('spotify:track:2');
    expect(api.play).toHaveBeenCalledTimes(2);
  });

  it('not-logged-in : Web API pour cet appel ; si elle échoue aussi, message « connecte-toi dans l’appli »', async () => {
    const { playback, api } = setup({ connectError: ['not-logged-in', 'not-logged-in'] });
    api.play.mockRejectedValueOnce(new SpotifyError('no-device', 'x'));
    await expect(playback.play({ uris: ['spotify:track:0'] })).rejects.toMatchObject({ code: 'app-logged-out' });
    await playback.play({ uris: ['spotify:track:1'] });
    expect(api.play).toHaveBeenCalledTimes(2);
  });

  it('sans clé : Web API directement (elle donnera son propre message)', async () => {
    const { playback, remote, api } = setup({ clientId: null });
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).not.toHaveBeenCalled();
    expect(api.play).toHaveBeenCalled();
  });

  it('deux lectures simultanées partagent une seule connexion', async () => {
    const { playback, remote } = setup();
    await Promise.all([playback.play({ uris: ['spotify:track:0'] }), playback.play({ uris: ['spotify:track:1'] })]);
    expect(remote.connect).toHaveBeenCalledTimes(1);
  });
});

describe('createRemotePlayback : état et pause', () => {
  it('connecté : l’état poussé est rendu sans réseau, et chaque état prévient les abonnés', async () => {
    const { playback, api, push } = setup();
    const listener = vi.fn();
    playback.subscribe(listener);
    await playback.play(null);
    push({ connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X', imageUrl: null, playing: true } });
    expect(listener).toHaveBeenCalled();
    expect(await playback.playerState()).toEqual({ uri: 'spotify:track:A', title: 'T', artist: 'X', imageUrl: null, playing: true });
    expect(api.playerState).not.toHaveBeenCalled();
  });

  it('connecté sans titre connu (page rechargée) : la Web API donne l’état', async () => {
    const { playback, api, push } = setup();
    await playback.play(null);
    push({ connected: true, track: null });
    expect((await playback.playerState())?.uri).toBe('spotify:track:W');
    expect(api.playerState).toHaveBeenCalled();
  });

  it('déconnecté (arrière-plan) : retour à la Web API, sans l’ancien titre', async () => {
    const { playback, api, push } = setup();
    await playback.play(null);
    push({ connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X', imageUrl: null, playing: true } });
    push({ connected: false });
    expect((await playback.playerState())?.uri).toBe('spotify:track:W');
    expect(api.playerState).toHaveBeenCalled();
  });

  it('pause : par le SDK si connecté, sinon par la Web API', async () => {
    const first = setup();
    await first.playback.play(null);
    await first.playback.pause();
    expect(first.remote.pause).toHaveBeenCalled();
    expect(first.api.pause).not.toHaveBeenCalled();
    const second = setup();
    await second.playback.pause();
    expect(second.api.pause).toHaveBeenCalled();
  });
});

describe('createRemotePlayback : statut', () => {
  it('pas encore essayé au départ ; warm ne reconnecte que si le SDK a déjà réussi', async () => {
    const fresh = setup();
    expect(await fresh.playback.status()).toBe('untried');
    fresh.playback.warm();
    await Promise.resolve();
    expect(fresh.remote.connect).not.toHaveBeenCalled();
    const known = setup({ status: 'ok' });
    known.playback.warm();
    await vi.waitFor(() => expect(known.remote.connect).toHaveBeenCalledTimes(1));
    expect(known.remote.connect).toHaveBeenCalledWith(KEY, 'wikimasterstools://spotify', true);
  });

  it('une lecture pendant la reconnexion silencieuse lance sa propre connexion, avec l’écran d’accord', async () => {
    const { playback, remote } = setup({ status: 'ok' });
    let settle: (error?: RemoteError) => void = () => undefined;
    remote.connect.mockImplementationOnce(() => new Promise<void>((resolve, reject) => (settle = (error) => (error ? reject(error) : resolve()))));
    playback.warm();
    await vi.waitFor(() => expect(remote.connect).toHaveBeenCalledTimes(1));
    const playing = playback.play({ uris: ['spotify:track:0'] });
    await vi.waitFor(() => expect(remote.connect).toHaveBeenCalledTimes(2));
    expect(remote.connect).toHaveBeenLastCalledWith(KEY, 'wikimasterstools://spotify', false);
    settle(new RemoteError('failed'));
    await playing;
    expect(remote.play).toHaveBeenCalledWith('spotify:track:0');
  });

  it('délier, relier ou changer de clé : déconnexion et statut remis à zéro', async () => {
    const { playback, remote, store, sessionChanged } = setup({ status: 'not-configured' });
    sessionChanged();
    expect(remote.disconnect).toHaveBeenCalled();
    await vi.waitFor(async () => expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status: 'untried' }));
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).toHaveBeenCalled();
  });

  it('reset (bouton « Réessayer la lecture directe ») : statut untried, abonnés prévenus', async () => {
    const { playback, store } = setup({ status: 'not-installed' });
    const listener = vi.fn();
    playback.subscribe(listener);
    await playback.reset();
    expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status: 'untried' });
    expect(listener).toHaveBeenCalled();
  });
});
