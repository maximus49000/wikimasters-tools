import { afterEach, describe, expect, it } from 'vitest';
import { boxChanges, gameBoxContent } from '../../src/content/game-box-content';
import { setGameBoxService } from '../../src/content/game-box-registry';
import type { GameBox, GameBoxService } from '../../src/content/game-box-service';

const PS4 = { plastic: '#1F4C9E', band: { color: '#1F4C9E', label: 'PS4' } };
const box = (extra: Partial<GameBox> = {}): GameBox => ({ format: 'bluray', style: PS4, platformName: 'Sony Playstation 4', shots: [], title: 'RDR2', ...extra });
const spine = { style: PS4, format: 'bluray', title: 'RDR2', console: 'Sony Playstation 4' };
const serve = (b: GameBox | undefined) => setGameBoxService({ peek: () => b } as unknown as GameBoxService);

describe('gameBoxContent', () => {
  afterEach(() => setGameBoxService(null));
  it('rien pour un autre objet ou une boîte inconnue', () => {
    serve(box());
    expect(gameBoxContent('cd', 'x', 'a.png')).toEqual({});
    serve(undefined);
    expect(gameBoxContent('game', 'x', 'a.png')).toEqual({});
  });
  it('jaquette de la boîte connue (la même que sur la boîte ouverte), bandeau imprimé si c’est le scan TheGamesDB', () => {
    serve(box({ tgdbId: 1, frontUrl: 'scan.jpg', backUrl: 'dos.jpg' }));
    for (const own of ['scan.jpg', 'remplacement.webp', undefined]) {
      expect(gameBoxContent('game', 'x', own)).toEqual({ url: 'scan.jpg', band: PS4.band, spine, printed: true, backUrl: 'dos.jpg' });
    }
  });
  it('boîte sans jaquette : l’image de la carte reste, sans bandeau imprimé', () => {
    serve(box({ tgdbId: 1, backUrl: 'dos.jpg' }));
    expect(gameBoxContent('game', 'x', 'carte.jpg')).toEqual({ band: PS4.band, spine, backUrl: 'dos.jpg' });
  });
  it('repli Steam/IGDB (sans tgdbId) : la jaquette de la boîte, pas de bandeau imprimé', () => {
    serve(box({ frontUrl: 'steam.jpg' }));
    const { back, ...rest } = gameBoxContent('game', 'x', 'carte.jpg');
    expect(rest).toEqual({ url: 'steam.jpg', band: PS4.band, spine });
    expect(back?.key).toContain('made-back');
  });
  it('sans scan du dos : dos fabriqué, dont la clé suit la boîte', () => {
    serve(box());
    const first = gameBoxContent('game', 'x').back!;
    serve(box({ shots: ['a.jpg'] }));
    expect(gameBoxContent('game', 'x').back!.key).not.toBe(first.key);
    serve(box({ backUrl: 'dos.jpg' }));
    expect(gameBoxContent('game', 'x').back).toBeUndefined();
  });
});

describe('boxChanges', () => {
  it('jeux rangés ET posés (présentoir) : format et couleur du boîtier suivent la boîte connue', () => {
    const state = { rooms: [{ id: 'r', layout: [
      { id: 's', kind: 'stored', shape: 'game', slug: 'a', shelfId: 'sh', level: 0, order: 0 },
      { id: 'p', kind: 'posed', shape: 'game', slug: 'b', hostId: 'h', x: 0, z: 0 },
      { id: 'c', kind: 'posed', shape: 'cd', slug: 'c', hostId: 'h', x: 0, z: 0 },
    ] }] } as never;
    const snes = box({ format: 'snes', style: { plastic: '#111', band: null } });
    expect(boxChanges(state, () => snes)).toEqual([
      { roomId: 'r', id: 's', format: 'snes', plastic: '#111' },
      { roomId: 'r', id: 'p', format: 'snes', plastic: '#111' },
    ]);
  });
});
