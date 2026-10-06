// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGameService } from '../../src/content/game-registry';
import type { GameService, GameView } from '../../src/content/game-service';
import { GameSection } from '../../src/content/GameSection';
import { setMusicService } from '../../src/content/music-registry';
import type { GameDetail } from '../../src/core/game/game-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const steam: GameDetail = {
  source: 'steam',
  id: 1245620,
  title: 'ELDEN RING',
  genres: ['Action', 'RPG'],
  platforms: ['Windows'],
  developers: ['FromSoftware, Inc.'],
  releaseDate: '24 févr. 2022',
  rating: { kind: 'positive', value: 93, count: 1157783, verdict: 'Très positives' },
  metascore: { score: 94 },
  price: '59,99 €',
  playersOnline: 22386,
  trailer: { kind: 'hls', url: 'https://x/hls.m3u8', poster: 'https://x/p.jpg' },
  pageUrl: 'https://store.steampowered.com/app/1245620',
};
const igdb: GameDetail = { source: 'igdb', id: 1, title: 'Super Metroid', genres: [], platforms: ['SNES'], developers: [], rating: { kind: 'score', value: 91, count: 21 }, trailer: { kind: 'youtube', key: 'abcdefghijk' }, pageUrl: 'https://www.igdb.com/games/super-metroid' };

async function show(view: GameView) {
  const service = { view: vi.fn(async () => view), igdbEnabled: true } as unknown as GameService;
  setGameService(service);
  await act(async () => root.render(<GameSection slug="Elden_Ring" title="Elden Ring" />));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  setMusicService(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setGameService(null);
});

describe('GameSection', () => {
  it('rien pour une carte qui n’est pas un jeu', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });

  it('une fiche Steam : note, verdict, Metascore, prix, joueurs, lien et source', async () => {
    await show({ status: 'detail', detail: steam });
    const text = container.textContent ?? '';
    expect(text).toContain('93');
    expect(text).toContain('Très positives');
    expect(text).toContain('94');
    expect(text).toContain('59,99');
    expect(text).toContain('22');
    expect(text).toContain('Données : Steam');
    expect(container.querySelector<HTMLAnchorElement>('a[aria-label="Ouvrir la page Steam"]')?.href).toBe('https://store.steampowered.com/app/1245620');
    expect(container.querySelector('[aria-label="Changer de jeu"]')).not.toBeNull();
  });

  it('une fiche IGDB : note sur 100 et lien IGDB', async () => {
    await show({ status: 'detail', detail: igdb });
    expect(container.textContent).toContain('91');
    expect(container.textContent).toContain('/100');
    expect(container.textContent).toContain('Données : IGDB.com');
    expect(container.querySelector('a[aria-label="Ouvrir la fiche IGDB"]')).not.toBeNull();
  });

  it('section vide : le titre et le glyphe seulement', async () => {
    await show({ status: 'empty' });
    expect(container.textContent).toContain('Jeu vidéo');
    expect(container.querySelector('[aria-label="Changer de jeu"]')).not.toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('une erreur : message discret, glyphe conservé', async () => {
    await show({ status: 'error', message: 'Steam est indisponible pour le moment.' });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Steam est indisponible pour le moment.');
    expect(container.querySelector('[aria-label="Changer de jeu"]')).not.toBeNull();
  });
});
