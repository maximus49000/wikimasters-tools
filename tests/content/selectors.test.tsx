// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicSelector } from '../../src/content/opened-item/selectors';
import { setMusicService, setPlatformChoice } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = ['A', 'B', 'C'].map((t) => ({ uri: `spotify:track:${t}`, title: t, artist: 'X' }));
const ready = { status: 'ready', listen: { kind: 'album', items, albumUri: 'spotify:album:Z' } };

let container: HTMLDivElement;
let root: Root;

function setup(view: unknown, play: unknown = vi.fn().mockResolvedValue(null)) {
  const service = { view: vi.fn().mockResolvedValue(view), play, subscribe: () => () => undefined } as unknown as MusicService;
  setMusicService(service);
  return service;
}
async function render(onPlayed = vi.fn()) {
  await act(async () => root.render(<MusicSelector slug="Abbey_Road" title="Abbey Road" onPlayed={onPlayed} />));
  return onPlayed;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
  setPlatformChoice(null);
});

describe('MusicSelector', () => {
  it('une ligne par piste ; toucher joue avec la carte puis prévient', async () => {
    const service = setup(ready);
    const onPlayed = await render();
    expect(container.querySelectorAll('[data-track]')).toHaveLength(3);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire B"]')!.click());
    expect(service.play).toHaveBeenCalledWith(items[1], ready.listen, { slug: 'Abbey_Road', title: 'Abbey Road' });
    expect(onPlayed).toHaveBeenCalledWith(items[1]);
  });
  it('lecture refusée : message affiché, pas d’onPlayed', async () => {
    setup(ready, vi.fn().mockResolvedValue('Spotify indisponible'));
    const onPlayed = await render();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Lire A"]')!.click());
    expect(container.textContent).toContain('Spotify indisponible');
    expect(onPlayed).not.toHaveBeenCalled();
  });
  it('vue vide ou en erreur : « Aucune piste trouvée »', async () => {
    setup({ status: 'notfound' });
    await render();
    expect(container.textContent).toContain('Aucune piste trouvée');
    await act(async () => root.unmount());
    root = createRoot(container);
    setMusicService({ view: vi.fn().mockRejectedValue(new Error('x')), subscribe: () => () => undefined } as unknown as MusicService);
    await render();
    expect(container.textContent).toContain('Aucune piste trouvée');
  });
  it('Tidal : lien externe, et onPlayed au clic', async () => {
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting({ getItem: () => 'tidal', setItem: () => undefined }) });
    setup(ready);
    const onPlayed = await render();
    const link = container.querySelector<HTMLAnchorElement>('a[href]')!;
    expect(link.getAttribute('href')).toBeTruthy();
    link.addEventListener('click', (e) => e.preventDefault());
    await act(async () => link.click());
    expect(onPlayed).toHaveBeenCalledWith(items[0]);
  });
});
