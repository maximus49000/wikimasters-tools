// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMusicService, setPlatformChoice } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';
import { SpotifyPlayer } from '../../src/content/SpotifyPlayer';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = { uri: 'spotify:track:1', title: 'Bohemian Rhapsody', artist: 'Queen', imageUrl: null, playing: true };
const queen = { slug: 'Queen_(band)', title: 'Queen' };

const sourceOf = (over: Partial<PlayerView> = {}) => {
  const view: PlayerView = { linked: true, track, hidden: false, enabled: true, card: queen, ...over };
  return { current: () => view, subscribe: () => () => undefined, toggle: vi.fn(), setHidden: vi.fn() } as unknown as PlayerSource;
};

// Le service ne retient que les cartes dont la liste d'écoute contient le titre : ici, toutes ou aucune.
const serviceFinding = (found: boolean) => {
  const playingSlugs = vi.fn(async (cards: { slug: string }[]) => new Set(found ? cards.map((card) => card.slug) : []));
  setMusicService({ playingSlugs } as unknown as MusicService);
  return playingSlugs;
};

let container: HTMLDivElement;
let root: Root;

async function render(over: Partial<PlayerView> = {}) {
  const openCard = vi.fn();
  await act(async () => {
    root.render(<SpotifyPlayer source={sourceOf(over)} openCard={openCard} />);
  });
  return openCard;
}

const cardButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Ouvrir la carte"]');

describe('SpotifyPlayer, bouton « Carte »', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setMusicService(null);
    setPlatformChoice(null);
  });

  it('ouvre la fiche de la carte quand le titre en cours est le sien', async () => {
    const playingSlugs = serviceFinding(true);
    const openCard = await render();
    expect(playingSlugs).toHaveBeenCalledWith([queen], track);
    expect(cardButton()).not.toBeNull();
    expect(cardButton()?.title).toBe('Ouvrir la carte');
    cardButton()?.click();
    expect(openCard).toHaveBeenCalledWith('Queen_(band)');
  });

  it("n'en propose aucun quand la lecture ne vient d'aucune carte", async () => {
    const playingSlugs = serviceFinding(true);
    await render({ card: null });
    expect(cardButton()).toBeNull();
    expect(playingSlugs).not.toHaveBeenCalled();
  });

  it("n'en propose aucun quand le titre en cours n'est plus celui de la carte (autre musique lancée depuis Spotify)", async () => {
    serviceFinding(false);
    await render();
    expect(cardButton()).toBeNull();
  });

  it('reste proposé en pause', async () => {
    serviceFinding(true);
    await render({ track: { ...track, playing: false } });
    expect(cardButton()).not.toBeNull();
  });

  it("n'en propose aucun sans titre en cours", async () => {
    const playingSlugs = serviceFinding(true);
    await render({ track: null });
    expect(cardButton()).toBeNull();
    expect(playingSlugs).not.toHaveBeenCalled();
  });

  it("n'en propose aucun sans service musique", async () => {
    setMusicService(null);
    await render();
    expect(cardButton()).toBeNull();
  });

  it('est aussi dans le lecteur replié', async () => {
    serviceFinding(true);
    const openCard = await render({ hidden: true });
    expect(cardButton()).not.toBeNull();
    cardButton()?.click();
    expect(openCard).toHaveBeenCalledWith('Queen_(band)');
  });

  it('le lecteur replié sans carte garde sa note décorative et aucun bouton', async () => {
    serviceFinding(true);
    await render({ hidden: true, card: null });
    expect(cardButton()).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('SpotifyPlayer, plateforme', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setMusicService(null);
    setPlatformChoice(null);
  });

  it("reste caché quand la plateforme choisie est Tidal, et revient avec Spotify", async () => {
    serviceFinding(true);
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting({ getItem: () => 'tidal', setItem: () => undefined }) });
    await render();
    expect(container.textContent).toBe('');
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting({ getItem: () => 'spotify', setItem: () => undefined }) });
    await render();
    expect(container.textContent).toContain('Bohemian Rhapsody');
  });
});
