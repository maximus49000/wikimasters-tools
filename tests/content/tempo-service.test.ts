import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createTempoRepo } from '../../src/core/music/tempo-repo';
import { createTempoService } from '../../src/content/tempo-service';

const track = { uri: 'spotify:track:a', title: 'One More Time', artist: 'Daft Punk' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Decoded = { samples: Float32Array; sampleRate: number };
type Over = {
  relay?: () => Response | Promise<Response>;
  preview?: () => Response | Promise<Response>;
  decode?: () => Promise<Decoded>;
  estimate?: () => number | null;
};

function setup(over: Over = {}) {
  const repo = createTempoRepo(createMemoryStore());
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/deezer-preview')) {
      return (over.relay ?? (() => json({ previewUrl: 'https://cdnt-preview.dzcdn.net/x.mp3', deezerBpm: 123 })))();
    }
    return (over.preview ?? (() => new Response(new ArrayBuffer(8))))();
  });
  const decode = vi.fn(over.decode ?? (async () => ({ samples: new Float32Array(4), sampleRate: 22_050 })));
  const estimate = vi.fn(over.estimate ?? (() => 124));
  const service = createTempoService({ repo, fetch: fetchMock as unknown as typeof fetch, decode, estimate: estimate as never });
  const relayCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/deezer-preview')).length;
  return { repo, fetchMock, decode, estimate, service, relayCalls };
}

describe('createTempoService', () => {
  it('piste connue du dépôt : aucun fetch', async () => {
    const { repo, fetchMock, service } = setup();
    await repo.save(track.uri, 100);
    expect(await service.tempo(track)).toBe(100);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.known(track.uri)).toBe(100);
  });

  it('piste inconnue : relais, extrait, estimation avec deezerBpm en indice, sauvegarde', async () => {
    const { repo, fetchMock, estimate, service } = setup();
    expect(service.known(track.uri)).toBeUndefined();
    expect(await service.tempo(track)).toBe(124);
    const relayUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(relayUrl).toContain('/deezer-preview?');
    expect(relayUrl).toContain('title=One+More+Time');
    expect(relayUrl).toContain('artist=Daft+Punk');
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://cdnt-preview.dzcdn.net/x.mp3');
    expect(estimate).toHaveBeenCalledWith(expect.any(Float32Array), 22_050, 123);
    expect(await repo.get(track.uri)).toBe(124);
    expect(service.known(track.uri)).toBe(124);
  });

  it('previewUrl null : null gardé, pas de téléchargement', async () => {
    const { repo, fetchMock, service } = setup({ relay: () => json({ previewUrl: null, deezerBpm: null }) });
    expect(await service.tempo(track)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await repo.get(track.uri)).toBeNull();
    expect(service.known(track.uri)).toBeNull();
  });

  const pannes: Array<[string, Over]> = [
    ['fetch du relais rejeté', { relay: () => Promise.reject(new Error('réseau')) }],
    ['relais 502', { relay: () => json({ error: 'x' }, 502) }],
    ['relais 429', { relay: () => json({}, 429) }],
    ['relais 400', { relay: () => json({}, 400) }],
    ['corps du relais illisible', { relay: () => new Response('pas du json') }],
    ['fetch de l’extrait rejeté', { preview: () => Promise.reject(new Error('réseau')) }],
    ['extrait en 403', { preview: () => new Response('', { status: 403 }) }],
  ];
  it.each(pannes)('%s : null, rien gardé, pas d’exception', async (_nom, over) => {
    const { repo, service } = setup(over);
    expect(await service.tempo(track)).toBeNull();
    expect(await repo.get(track.uri)).toBeUndefined();
    expect(service.known(track.uri)).toBeUndefined();
  });

  it('extrait indécodable : null gardé', async () => {
    const { repo, service } = setup({ decode: () => Promise.reject(new Error('codec')) });
    expect(await service.tempo(track)).toBeNull();
    expect(await repo.get(track.uri)).toBeNull();
    expect(service.known(track.uri)).toBeNull();
  });

  it('estimation sans résultat : null gardé', async () => {
    const { repo, service } = setup({ estimate: () => null });
    expect(await service.tempo(track)).toBeNull();
    expect(await repo.get(track.uri)).toBeNull();
  });

  it('deux tempo() simultanés de la même piste : un seul appel relais', async () => {
    const { service, relayCalls } = setup();
    const [a, b] = await Promise.all([service.tempo(track), service.tempo(track)]);
    expect([a, b]).toEqual([124, 124]);
    expect(relayCalls()).toBe(1);
    await service.tempo(track);
    expect(relayCalls()).toBe(1);
  });

  it('known() reste exact par uri : le résultat tardif d’une piste n’est pas attribué à une autre', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = setup({
      decode: async () => {
        await gate;
        return { samples: new Float32Array(4), sampleRate: 22_050 };
      },
    });
    const slow = service.tempo(track);
    const autre = 'spotify:track:b';
    expect(service.known(autre)).toBeUndefined();
    release();
    await slow;
    expect(service.known(track.uri)).toBe(124);
    expect(service.known(autre)).toBeUndefined();
  });

  it('subscribe est notifié à la fin de la mesure, et on peut se désabonner', async () => {
    const { service } = setup();
    const listener = vi.fn();
    const off = service.subscribe(listener);
    await service.tempo(track);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await service.tempo({ ...track, uri: 'spotify:track:z' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
