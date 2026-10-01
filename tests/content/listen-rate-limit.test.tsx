// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListenSection } from '../../src/content/ListenSection';
import { createMusicService } from '../../src/content/music-service';
import { setMusicService } from '../../src/content/music-registry';
import { createMemoryStore } from '../../src/core/cache/store';
import { createListenRepo } from '../../src/core/music/listen-repo';
import { createSpotifyApi } from '../../src/core/spotify/spotify-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

// Vrai client Spotify + vraie fiche, seul le réseau est simulé : Spotify répond toujours 429.
// `retryAfter: null` reproduit une page web (WebView de l'APK) : Spotify n'expose pas Retry-After en CORS.
function setup(retryAfter: string | null) {
  const calls: number[] = [];
  const fetch = vi.fn(async () => {
    calls.push(Date.now());
    // Un vrai réseau met du temps à répondre.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return new Response('', { status: 429, ...(retryAfter ? { headers: { 'Retry-After': retryAfter } } : {}) });
  });
  const api = createSpotifyApi({ session: { accessToken: async () => 'token' }, fetch, store: createMemoryStore() });
  const service = createMusicService({
    collection: { list: async () => [{ slug: 'Abbey_Road', title: 'Abbey Road' }] as never },
    kinds: { resolveMissing: async () => undefined, load: async () => ({ cards: { Abbey_Road: { natures: ['Q482994'], occupations: [], genres: [] } }, labels: {} }) as never },
    music: { resolve: async () => ({ Abbey_Road: { performer: 'The Beatles' } }) as never },
    listens: createListenRepo(createMemoryStore()),
    session: { isLinked: async () => true, link: async () => undefined, unlink: async () => undefined, subscribe: () => () => undefined },
    api,
    onPlayed: () => undefined,
  });
  setMusicService(service);
  return { calls, fetch };
}

const text = () => container.textContent ?? '';

// Avance l'horloge par pas de 100 ms et note chaque changement d'affichage (M = message, · = rien).
async function observe(totalMs: number) {
  const changes: string[] = [];
  let last = '';
  for (let t = 0; t < totalMs; t += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const now = text() === '' ? '·' : 'M';
    if (now !== last) changes.push(`${(t / 1000).toFixed(1)}s:${now}`);
    last = now;
  }
  return changes.join(' ');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ListenSection + client Spotify, limite qui persiste', () => {
  it("Retry-After illisible (APK) : les tentatives automatiques s'espacent au lieu de frapper toutes les 6 s, et la fiche ne clignote pas", async () => {
    const { calls } = setup(null);
    await act(async () => {
      root.render(<ListenSection slug="Abbey_Road" title="Abbey Road" />);
    });
    const display = await observe(10 * 60_000);

    // 1 chargement + 5 relances, de plus en plus espacées : avant, elles tombaient toutes les 6 s (6 requêtes en 32 s).
    expect(calls).toHaveLength(6);
    const gaps = calls.slice(1).map((time, index) => time - calls[index]!);
    expect(gaps.every((gap, index) => index === 0 || gap > gaps[index - 1]! * 2)).toBe(true);
    expect(calls[5]! - calls[0]!).toBeGreaterThan(5 * 60_000);

    // Le message est affiché dès la première réponse et n'est plus retiré : plus de disparition à chaque essai.
    expect(display).toMatch(/^0\.0s:· \d+\.\ds:M$/);
  });

  it('Retry-After lisible (extension) : une relance par délai demandé, sans clignotement', async () => {
    const { calls } = setup('40');
    await act(async () => {
      root.render(<ListenSection slug="Abbey_Road" title="Abbey Road" />);
    });
    const display = await observe(10 * 60_000);
    expect(calls.slice(1).map((time, index) => Math.round((time - calls[index]!) / 1000))).toEqual([41, 41, 41, 41, 41]);
    expect(display).toMatch(/^0\.0s:· \d+\.\ds:M$/);
  });
});
