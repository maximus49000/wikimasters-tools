// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerSettings } from '../../src/content/PlayerSettings';
import { setMusicService, setPlatformChoice } from '../../src/content/music-registry';
import { createPlatformSetting } from '../../src/core/music/platform';
import type { MusicService } from '../../src/content/music-service';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

// Source du lecteur simulée : `setLinked` rejoue ce que fait le vrai sondage quand la liaison change.
function makeSource(linked: boolean) {
  let view: PlayerView = { linked, track: null, hidden: false, enabled: true, card: null };
  const listeners = new Set<() => void>();
  const source = {
    current: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setEnabled: vi.fn(),
  } as unknown as PlayerSource;
  const setLinked = (next: boolean) =>
    act(async () => {
      view = { ...view, linked: next };
      listeners.forEach((listener) => listener());
    });
  return { source, setLinked };
}

function serve(over: { link?: () => Promise<string | null>; unlink?: () => Promise<void> } = {}) {
  const link = vi.fn(over.link ?? (async () => null));
  const unlink = vi.fn(over.unlink ?? (async () => undefined));
  setMusicService({ link, unlink, view: vi.fn(), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
  return { link, unlink };
}

async function render(source: PlayerSource) {
  await act(async () => {
    root.render(<PlayerSettings source={source} onClose={() => undefined} />);
  });
}

const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const text = () => container.textContent ?? '';
const press = (button: HTMLButtonElement | null) =>
  act(async () => {
    button?.click();
  });

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

describe('PlayerSettings, compte Spotify', () => {
  it('compte non lié : propose de le lier, et lie au clic', async () => {
    const { link } = serve();
    await render(makeSource(false).source);
    expect(text()).toContain('Compte Spotify : non lié');
    expect(byLabel('Délier Spotify')).toBeNull();
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('compte lié : propose de le délier, et délie au clic', async () => {
    const { unlink } = serve();
    await render(makeSource(true).source);
    expect(text()).toContain('Compte Spotify : lié');
    expect(byLabel('Lier Spotify')).toBeNull();
    await press(byLabel('Délier Spotify'));
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('le bouton suit la liaison : il devient « Délier » une fois le compte lié, et inversement', async () => {
    serve();
    const { source, setLinked } = makeSource(false);
    await render(source);
    await setLinked(true);
    expect(byLabel('Délier Spotify')).not.toBeNull();
    expect(byLabel('Lier Spotify')).toBeNull();
    await setLinked(false);
    expect(byLabel('Lier Spotify')).not.toBeNull();
  });

  it('montre la cause quand la liaison échoue, sans rien changer au bouton', async () => {
    serve({ link: async () => 'Liaison Spotify annulée.' });
    await render(makeSource(false).source);
    await press(byLabel('Lier Spotify'));
    expect(text()).toContain('Liaison Spotify annulée.');
    expect(byLabel('Lier Spotify')?.disabled).toBe(false);
  });

  it("n'envoie qu'une liaison à la fois : le bouton est inactif pendant l'autorisation", async () => {
    let finish: (message: string | null) => void = () => undefined;
    const { link } = serve({ link: () => new Promise<string | null>((resolve) => (finish = resolve)) });
    await render(makeSource(false).source);
    await press(byLabel('Lier Spotify'));
    expect(byLabel('Lier Spotify')?.disabled).toBe(true);
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
    expect(byLabel('Lier Spotify')?.disabled).toBe(false);
  });

  it("efface l'ancien message quand on relance une liaison", async () => {
    const { link } = serve();
    link.mockResolvedValueOnce('Liaison Spotify annulée.').mockResolvedValueOnce(null);
    await render(makeSource(false).source);
    await press(byLabel('Lier Spotify'));
    expect(text()).toContain('annulée');
    await press(byLabel('Lier Spotify'));
    expect(text()).not.toContain('annulée');
  });

  it("garde le réglage d'affichage du lecteur", async () => {
    serve();
    const { source } = makeSource(true);
    await render(source);
    const hide = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Masqué');
    await press(hide ?? null);
    expect((source as unknown as { setEnabled: ReturnType<typeof vi.fn> }).setEnabled).toHaveBeenCalledWith(false);
  });

  it("n'affiche pas de section compte sans service musique", async () => {
    setMusicService(null);
    await render(makeSource(false).source);
    expect(byLabel('Lier Spotify')).toBeNull();
    expect(byLabel('Délier Spotify')).toBeNull();
    expect(text()).not.toContain('Compte Spotify');
  });
});

describe('PlayerSettings, plateforme', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };
  const group = () => container.querySelector('[aria-label="Plateforme d’écoute"]');

  it("n'affiche aucun sélecteur quand une seule plateforme existe", async () => {
    serve();
    setPlatformChoice({ available: ['spotify'], setting: createPlatformSetting(memory()) });
    await render(makeSource(false).source);
    expect(group()).toBeNull();
    expect(byLabel('Lier Spotify')).not.toBeNull();
  });

  it('propose les plateformes disponibles, mémorise le choix et en suit le nom', async () => {
    serve();
    const setting = createPlatformSetting(memory());
    setPlatformChoice({ available: ['spotify', 'tidal'], setting });
    await render(makeSource(false).source);
    expect(group()).not.toBeNull();
    const tidal = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Plateforme d’écoute"] button')].find((button) => button.textContent === 'Tidal');
    await press(tidal ?? null);
    expect(setting.current()).toBe('tidal');
    expect(text()).toContain('Compte Tidal : non lié');
    expect(byLabel('Lier Tidal')).not.toBeNull();
  });
});
