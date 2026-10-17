// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSpine, spineLayoutOf } from '../../src/content/game-spine';
import { gameBoxContent } from '../../src/content/game-box-content';
import { setGameBoxService } from '../../src/content/game-box-registry';
import { createGameBoxService, type GameBox, type GameBoxService } from '../../src/content/game-box-service';
import { Item3DArt } from '../../src/content/model3d-art';
import { ShelfBoardZoom } from '../../src/content/shelf-board-zoom';
import { createMemoryStore } from '../../src/core/cache/store';
import type { GameDetail } from '../../src/core/game/game-detail';
import { createGameVersionRepo } from '../../src/core/game/game-version-repo';
import { caseStyleOfPlatformName } from '../../src/core/game/platform-boxes';
import type { Room } from '../../src/core/library/library-types';
import { paletteOf } from '../../src/core/library/styles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function draw(el: ReactElement) {
  const c = document.createElement('div');
  document.body.append(c);
  act(() => { createRoot(c).render(<svg>{el}</svg>); });
  return c;
}
const SWITCH = caseStyleOfPlatformName('Nintendo Switch');
const PS4 = caseStyleOfPlatformName('Sony Playstation 4');
const XONE = caseStyleOfPlatformName('Microsoft Xbox One');
const WII = caseStyleOfPlatformName('Nintendo Wii');
const W = 14;
const H = 170;
const yOf = (el: Element): number => Number(/translate\(\S+ ([\d.]+)\)/.exec(el.getAttribute('transform') ?? '')?.[1] ?? el.getAttribute('y'));

describe('spineLayoutOf (table unique des tranches par console)', () => {
  const of = (name: string, format: Parameters<typeof spineLayoutOf>[0]) => spineLayoutOf(format, caseStyleOfPlatformName(name), name);
  it('logo de console en haut et marque en bas, comme sur la vraie tranche', () => {
    expect(of('Nintendo Switch', 'switch')).toMatchObject({ key: 'switch', head: 'switch', foot: 'nintendo' });
    expect(of('Sony Playstation 4', 'bluray')).toMatchObject({ key: 'playstation', head: 'playstation', foot: 'studio' });
    expect(of('Sony Playstation 5', 'bluray')).toMatchObject({ key: 'playstation', head: 'playstation' });
    expect(of('Microsoft Xbox One', 'bluray')).toMatchObject({ key: 'xbox', head: 'xbox' });
    expect(of('Microsoft Xbox Series X', 'bluray')).toMatchObject({ key: 'xbox', head: 'xbox' });
    expect(of('Nintendo Wii U', 'dvd')).toMatchObject({ key: 'wiiu', head: 'band', foot: 'nintendo' });
    expect(of('Nintendo Wii', 'dvd')).toMatchObject({ key: 'nintendo-white', head: 'console-mark', foot: 'nintendo' });
    expect(of('Nintendo DS', 'ds')).toMatchObject({ key: 'nintendo-white', head: 'console-mark' });
    expect(of('Sony PSP', 'psp')).toMatchObject({ key: 'plain', head: 'none', foot: 'studio' });
  });
  it('PlayStation : vrai logo PS au-dessus du mot « PS4 », dans le bandeau, teintés en blanc', () => {
    const c = draw(<GameSpine w={W} h={H} style={PS4} format="bluray" title="RDR2" console="Sony Playstation 4" />);
    const head = c.querySelector('[data-spine-head="playstation"]')!;
    const ps = head.querySelector('image[data-spine-logo-mark="playstation"]')!;
    const word = head.querySelector('image[data-spine-logo-mark="ps4"]')!;
    expect(dataY(ps)).toBeLessThan(dataY(word));
    expect(dataY(word)).toBeLessThan(Number(c.querySelector('[data-spine-band]')!.getAttribute('height')));
    expect(svgOf(word)).toContain('flood-color="#FFFFFF"');
  });
});

const dataY = (el: Element): number => Number(el.getAttribute('data-y'));
// SVG d'un logo embarqué (data:) : le fichier Commons, teinté si besoin.
const svgOf = (img: Element): string => decodeURIComponent(img.getAttribute('href')!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

describe('GameSpine', () => {
  it('Switch : tranche rouge, titre blanc, vrai logo Switch blanc en haut, logo « Nintendo » sur pastille blanche en bas', () => {
    const c = draw(<GameSpine w={W} h={H} style={SWITCH} format="switch" title="Hollow Knight" console="Nintendo Switch" />);
    expect(c.querySelector('[data-spine-body]')!.getAttribute('fill')).toBe('#E60012');
    expect(c.querySelector('[data-spine-title]')!.getAttribute('fill')).toBe('#FFFFFF');
    const pill = c.querySelector('[data-spine-nintendo]')!;
    expect(pill.querySelector('rect')!.getAttribute('fill')).toBe('#FFFFFF');
    const nin = pill.querySelector('image[data-spine-logo-mark="nintendo"]')!;
    expect(dataY(nin)).toBeGreaterThan(H * 0.8);
    expect(svgOf(nin)).not.toContain('flood-color');
    const mark = c.querySelector('image[data-spine-logo-mark="switch"]')!;
    expect(dataY(mark)).toBeLessThan(H * 0.1);
    expect(svgOf(mark)).toContain('flood-color="#FFFFFF"');
  });
  it('PS4 : bandeau bleu en haut', () => {
    const c = draw(<GameSpine w={W} h={H} style={PS4} format="bluray" title="Red Dead Redemption 2" console="Sony Playstation 4" />);
    const band = c.querySelector('[data-spine-band]')!;
    expect(band.getAttribute('fill')).toBe('#1F4C9E');
    expect(band.getAttribute('y') ?? '0').toBe('0');
  });
  it('PS5 : bandeau blanc, logos teintés en noir', () => {
    const c = draw(<GameSpine w={W} h={H} style={caseStyleOfPlatformName('Sony Playstation 5')} format="bluray" title="Astro Bot" console="Sony Playstation 5" />);
    expect(svgOf(c.querySelector('image[data-spine-logo-mark="ps5"]')!)).toContain('flood-color="#1B1B1F"');
  });
  it('PS3 (pas de mot embarqué) : libellé dessiné en repli', () => {
    const c = draw(<GameSpine w={W} h={H} style={caseStyleOfPlatformName('Sony Playstation 3')} format="bluray" title="Uncharted" console="Sony Playstation 3" />);
    expect(c.querySelector('image[data-spine-logo-mark="playstation"]')).not.toBeNull();
    expect(c.querySelector('[data-spine-band-label]')!.textContent).toBe('PS3');
  });
  it('Xbox One : bandeau vert, sphère puis mot « XBOX ONE » (vertical)', () => {
    const c = draw(<GameSpine w={W} h={H} style={XONE} format="bluray" title="Halo 5" console="Microsoft Xbox One" />);
    expect(c.querySelector('[data-spine-band]')!.getAttribute('fill')).toBe('#107C10');
    const sphere = c.querySelector('image[data-spine-logo-mark="xbox-sphere"]')!;
    const word = c.querySelector('image[data-spine-logo-mark="xbox-one"]')!;
    expect(dataY(sphere)).toBeLessThan(dataY(word));
    expect(word.closest('[transform*="rotate(90)"]')).not.toBeNull();
  });
  it('Xbox One : un long titre tient entier (police réduite) avec le studio', () => {
    const c = draw(<GameSpine w={W} h={H} style={XONE} format="bluray" title="Red Dead Redemption 2" studio="Rockstar Games" console="Microsoft Xbox One" />);
    const t = c.querySelector('[data-spine-title]')!;
    expect(t.textContent).toBe('Red Dead Redemption 2');
    expect(Number(t.getAttribute('font-size'))).toBeGreaterThan(Number(c.querySelector('[data-spine-studio]')!.getAttribute('font-size')));
  });
  it('PS4 : le mot « PS4 » reste à plat sous le logo PS', () => {
    const c = draw(<GameSpine w={W} h={H} style={PS4} format="bluray" title="RDR2" console="Sony Playstation 4" />);
    expect(c.querySelector('image[data-spine-logo-mark="ps4"]')!.closest('[transform*="rotate(90)"]')).toBeNull();
  });
  it('Wii : texte sombre sur blanc, vrai logo Wii (couleurs d’origine) en haut', () => {
    const c = draw(<GameSpine w={W} h={H} style={WII} format="dvd" title="Super Mario Galaxy" console="Nintendo Wii" />);
    expect(c.querySelector('[data-spine-body]')!.getAttribute('fill')).toBe('#F2F2F0');
    expect(c.querySelector('[data-spine-title]')!.getAttribute('fill')).toBe('#1B1B1F');
    const wii = c.querySelector('image[data-spine-logo-mark="wii"]')!;
    expect(svgOf(wii)).not.toContain('flood-color');
    expect(c.querySelector('[data-spine-nintendo] rect')).toBeNull();
    expect(c.querySelector('[data-spine-nintendo] image[data-spine-logo-mark="nintendo"]')).not.toBeNull();
  });
  it('Wii U, DS, 3DS : leur vrai logo', () => {
    const mk = (name: string, f: Parameters<typeof spineLayoutOf>[0]) => draw(<GameSpine w={W} h={H} style={caseStyleOfPlatformName(name)} format={f} title="Jeu" console={name} />);
    expect(mk('Nintendo Wii U', 'dvd').querySelector('image[data-spine-logo-mark="wiiu"]')).not.toBeNull();
    expect(mk('Nintendo DS', 'ds').querySelector('image[data-spine-logo-mark="ds"]')).not.toBeNull();
    expect(mk('Nintendo 3DS', 'ds').querySelector('image[data-spine-logo-mark="3ds"]')).not.toBeNull();
  });
  it('avec logo : une image tournée de 90°, pas de titre en texte', () => {
    const c = draw(<GameSpine w={W} h={H} style={PS4} format="bluray" title="RDR2" logoUrl="https://cdn.test/logo.png" />);
    const img = c.querySelector('image[data-spine-logo]')!;
    expect(img.getAttribute('href')).toBe('https://cdn.test/logo.png');
    expect(img.closest('[transform*="rotate(90)"]')).not.toBeNull();
    expect(c.querySelector('[data-spine-title]')).toBeNull();
  });
  it('sans logo : le titre en texte vertical', () => {
    const c = draw(<GameSpine w={W} h={H} style={PS4} format="bluray" title="RDR2" />);
    const t = c.querySelector('[data-spine-title]')!;
    expect(t.textContent).toBe('RDR2');
    expect(t.getAttribute('transform')).toContain('rotate(90)');
  });
  it('studio en petit en bas', () => {
    const c = draw(<GameSpine w={W} h={H} style={PS4} format="bluray" title="RDR2" studio="Rockstar Games" />);
    const s = c.querySelector('[data-spine-studio]')!;
    expect(s.textContent).toBe('Rockstar Games');
    expect(yOf(s)).toBeGreaterThan(H * 0.6);
    expect(Number(s.getAttribute('font-size'))).toBeLessThan(Number(c.querySelector('[data-spine-title]')!.getAttribute('font-size')));
  });
  it('autre console (PSP) : corps de la couleur du boîtier, titre seul', () => {
    const c = draw(<GameSpine w={W} h={H} style={{ plastic: '#1B1B1F', band: null }} format="psp" title="Patapon" console="Sony PSP" />);
    expect(c.querySelector('[data-spine-body]')!.getAttribute('fill')).toBe('#1B1B1F');
    expect(c.querySelector('[data-spine-band]')).toBeNull();
    expect(c.querySelector('[data-spine-mark]')).toBeNull();
    expect(c.querySelector('[data-spine-nintendo]')).toBeNull();
    expect(c.querySelector('[data-spine-title]')!.textContent).toBe('Patapon');
  });
});

const ps4Box = (extra: Partial<GameBox> = {}): GameBox => ({ format: 'bluray', style: PS4, platformName: 'Sony Playstation 4', shots: [], title: 'RDR2', ...extra });

describe('tranche dans la pièce et le second zoom', () => {
  afterEach(() => setGameBoxService(null));
  it('gameBoxContent fournit la tranche (style, format, titre, logo, studio, console)', () => {
    setGameBoxService({ peek: () => ps4Box({ logoUrl: 'logo.png', studio: 'Rockstar' }) } as unknown as GameBoxService);
    expect(gameBoxContent('game', 'x').spine).toEqual({ style: PS4, format: 'bluray', title: 'RDR2', logoUrl: 'logo.png', studio: 'Rockstar', console: 'Sony Playstation 4' });
  });
  it('Item3DArt sur la tranche : GameSpine quand la boîte est connue, ancien dessin sinon', () => {
    const pal = paletteOf('scandinave');
    const rect = { x: 0, y: 0, w: 120, h: 255 };
    const spine = { style: PS4, format: 'bluray' as const, title: 'RDR2', console: 'Sony Playstation 4' };
    const known = draw(<Item3DArt shape="game" display="spine" angle={0} rect={rect} palette={pal} box="bluray" color="#1F4C9E" content={{ title: 'RDR2', band: PS4.band, spine }} />);
    expect(known.querySelector('[data-game-spine]')).not.toBeNull();
    const unknown = draw(<Item3DArt shape="game" display="spine" angle={0} rect={rect} palette={pal} content={{ title: 'RDR2' }} />);
    expect(unknown.querySelector('[data-game-spine]')).toBeNull();
    expect(unknown.textContent).toContain('RDR2');
  });
  it('second zoom : un jeu sur la tranche à boîte connue est dessiné par GameSpine', () => {
    setGameBoxService({ peek: (s: string) => (s === 'RDR2' ? ps4Box() : undefined) } as unknown as GameBoxService);
    const room: Room = {
      id: 'r', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
      layout: [
        { id: 's', kind: 'shelf', col: 0, row: 6 },
        { id: 'a', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, slug: 'RDR2', display: 'spine', box: 'bluray', caseColor: '#1F4C9E' },
        { id: 'b', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 1, slug: 'Inconnu', display: 'spine' },
      ],
    };
    const c = document.createElement('div');
    document.body.append(c);
    act(() => { createRoot(c).render(<ShelfBoardZoom shelfIds={['s']} level={0} room={room} cards={{ RDR2: { title: 'RDR2' }, Inconnu: { title: 'Inconnu' } }} imageOf={() => undefined} onCard={() => undefined} onLevel={() => undefined} />); });
    expect(c.querySelector('[data-board-card="RDR2"] [data-game-spine]')).not.toBeNull();
    expect(c.querySelector('[data-board-card="Inconnu"] [data-game-spine]')).toBeNull();
    expect(c.querySelector('[data-board-card="Inconnu"] [data-board-title]')!.textContent).toBe('Inconnu');
  });
});

describe('studio de la boîte', () => {
  it('le premier développeur de la fiche, sans appel de plus', async () => {
    const detail: GameDetail = { source: 'igdb', id: 1, title: 'RDR2', genres: [], platforms: ['PlayStation 4'], developers: ['Rockstar Studios', 'Autre'], pageUrl: 'x' };
    const view = vi.fn(async () => ({ status: 'detail', detail }) as never);
    const service = createGameBoxService({ versions: async () => [], images: async () => null, choices: createGameVersionRepo(createMemoryStore()), game: { view }, store: createMemoryStore() });
    expect((await service.box('RDR2', 'RDR2'))?.studio).toBe('Rockstar Studios');
    expect(view).toHaveBeenCalledTimes(1);
  });
});
