import { afterEach, describe, expect, it } from 'vitest';
import { gameBoxContent } from '../../src/content/game-box-content';
import { setGameBoxService } from '../../src/content/game-box-registry';
import type { GameBox, GameBoxService } from '../../src/content/game-box-service';

const PS4 = { plastic: '#1F4C9E', band: { color: '#1F4C9E', label: 'PS4' } };
const box = (extra: Partial<GameBox> = {}): GameBox => ({ format: 'bluray', style: PS4, platformName: 'Sony Playstation 4', shots: [], title: 'RDR2', ...extra });
const serve = (b: GameBox | undefined) => setGameBoxService({ peek: () => b } as unknown as GameBoxService);

describe('gameBoxContent', () => {
  afterEach(() => setGameBoxService(null));
  it('rien pour un autre objet ou une boîte inconnue', () => {
    serve(box());
    expect(gameBoxContent('cd', 'x', 'a.png')).toEqual({});
    serve(undefined);
    expect(gameBoxContent('game', 'x', 'a.png')).toEqual({});
  });
  it('bandeau imprimé seulement si l’image dessinée est le scan TheGamesDB', () => {
    serve(box({ tgdbId: 1, frontUrl: 'scan.jpg', backUrl: 'dos.jpg' }));
    expect(gameBoxContent('game', 'x', 'scan.jpg')).toEqual({ band: PS4.band, printed: true, backUrl: 'dos.jpg' });
    expect(gameBoxContent('game', 'x', 'remplacement.webp')).toEqual({ band: PS4.band, backUrl: 'dos.jpg' });
    expect(gameBoxContent('game', 'x', undefined)).toEqual({ band: PS4.band, backUrl: 'dos.jpg' });
  });
  it('repli Steam/IGDB (sans tgdbId) : pas de bandeau imprimé', () => {
    serve(box({ frontUrl: 'steam.jpg' }));
    expect(gameBoxContent('game', 'x', 'steam.jpg')).toEqual({ band: PS4.band });
  });
});
