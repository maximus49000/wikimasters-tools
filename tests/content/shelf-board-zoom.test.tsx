// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGameBoxService } from '../../src/content/game-box-registry';
import type { GameBox, GameBoxService } from '../../src/content/game-box-service';
import { ShelfBoardZoom, titleLines } from '../../src/content/shelf-board-zoom';
import type { Room, ShelfLevel } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 't', kind: 'shelf', col: 4, row: 6 },
    { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
    { id: 'c2', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 1, slug: 'Le_Petit_Prince' },
    { id: 'c3', kind: 'stored', shape: 'cd', shelfId: 't', level: 0, order: 0, slug: 'Inconnue' },
    { id: 'c4', kind: 'stored', shape: 'cd', shelfId: 's', level: 1, order: 0, slug: 'Paris' },
  ],
};
const cards = { Daft_Punk: { title: 'Daft Punk' }, Le_Petit_Prince: { title: 'Le Petit Prince' }, Paris: { title: 'Paris' } };

function mount(level: ShelfLevel, ids = ['s', 't'], stacked = false) {
  const onCard = vi.fn();
  const onLevel = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  act(() => { createRoot(container).render(<ShelfBoardZoom shelfIds={ids} level={level} room={room} cards={cards} imageOf={() => undefined} onCard={onCard} onLevel={onLevel} stacked={stacked} />); });
  return { container, onCard, onLevel };
}
const fire = (el: Element, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });

describe('titleLines', () => {
  it('mots entiers sur deux lignes, « … » si ça déborde', () => {
    expect(titleLines('Daft Punk', 12)).toEqual(['Daft Punk']);
    expect(titleLines('Le Seigneur des anneaux', 10)).toEqual(['Le', 'Seigneur…']);
    expect(titleLines('Supercalifragilistic', 6)).toEqual(['Super…']);
    expect(titleLines('', 10)).toEqual([]);
    expect(titleLines('Le Petit Prince', 40, 1)).toEqual(['Le Petit Prince']);
  });
});

describe('vue d’une tablette', () => {
  it('la tablette des deux bibliothèques, cartes du niveau seulement, titres', () => {
    const { container } = mount(0);
    expect(container.querySelectorAll('[data-board-shelf]')).toHaveLength(2);
    expect([...container.querySelectorAll('[data-board-card]')].map((e) => e.getAttribute('data-board-card'))).toEqual(['Daft_Punk', 'Le_Petit_Prince', 'Inconnue']);
    expect(container.querySelector('[data-board-card="Le_Petit_Prince"]')!.getAttribute('data-board-display')).toBe('spine');
    const titles = [...container.querySelectorAll('[data-board-title]')].map((t) => t.textContent);
    expect(titles.join(' ')).toContain('Daft');
    expect(titles.join(' ')).toContain('Inconnue');
  });
  it('toucher une carte connue ouvre la fiche ; inconnue : rien', () => {
    const { container, onCard } = mount(0);
    fire(container.querySelector('[data-board-card="Daft_Punk"]')!, 'click');
    fire(container.querySelector('[data-board-card="Inconnue"]')!, 'click');
    expect(onCard.mock.calls).toEqual([['Daft_Punk']]);
  });
  it('↑ ↓ : niveau voisin, grisés aux bords', () => {
    const top = mount(0);
    expect((top.container.querySelector('[data-action="board-up"]') as HTMLButtonElement).disabled).toBe(true);
    fire(top.container.querySelector('[data-action="board-down"]')!, 'click');
    expect(top.onLevel).toHaveBeenCalledWith(1);
    const bottom = mount(2);
    expect((bottom.container.querySelector('[data-action="board-down"]') as HTMLButtonElement).disabled).toBe(true);
    fire(bottom.container.querySelector('[data-action="board-up"]')!, 'click');
    expect(bottom.onLevel).toHaveBeenCalledWith(1);
  });
  it('glisser vers le haut : tablette du dessous ; le clic qui suit n’ouvre pas la fiche', () => {
    const { container, onLevel, onCard } = mount(0);
    const board = container.querySelector('[data-shelf-board]')!;
    const card = container.querySelector('[data-board-card="Daft_Punk"]')!;
    fire(card, 'pointerdown', { clientY: 300 });
    fire(card, 'pointerup', { clientY: 240 });
    fire(card, 'click');
    expect(onLevel).toHaveBeenCalledWith(1);
    expect(onCard).not.toHaveBeenCalled();
    fire(board, 'pointerdown', { clientY: 100 });
    fire(board, 'pointerup', { clientY: 120 });
    expect(onLevel).toHaveBeenCalledTimes(1);
  });
  it('hauteur recadrée sur l’objet le plus haut du niveau (+ 3 cm), objets posés sur la planche ; niveau vide : 16 cm', () => {
    const vb = (c: HTMLElement) => c.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    const { container } = mount(0);
    // livre 23 cm + 3 → 26 ; planche 2 ; bandeau des titres 8.
    expect(vb(container)).toEqual([0, 0, 2 * 74 + 3 * 3, 26 + 2 + 8]);
    const book = container.querySelector('[data-board-card="Le_Petit_Prince"] rect')!;
    expect(Number(book.getAttribute('y')) + Number(book.getAttribute('height'))).toBeCloseTo(26);
    expect(Number(book.getAttribute('height'))).toBeCloseTo(23);
    expect(vb(mount(2).container)[3]).toBe(16 + 2 + 8);
  });
  it('titres foncés sur un bandeau clair, quel que soit le style', () => {
    const { container } = mount(0);
    expect(container.querySelectorAll('[data-board-band]')).toHaveLength(2);
    for (const t of container.querySelectorAll('[data-board-title]')) expect(t.getAttribute('fill')).toBe('#2a2420');
  });
  it('empilées (portrait) : à peu près carré au lieu d’une bande, celle de gauche en haut, chacune avec ses montants et sa planche', () => {
    const { container } = mount(0, ['s', 't'], true);
    const [, , w, h] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    // Côte à côte : 157 × 36 (≈ 4,4 : 1) ; empilées et recadrées : 80 × 76 (≈ 1 : 1). Sans recadrage ce serait plus haut que large.
    expect(h).toBe(2 * (26 + 2 + 8) + 4);
    expect(w! / h!).toBeLessThan(1.1);
    expect(w).toBe(74 + 2 * 3);
    const shelves = [...container.querySelectorAll('[data-board-shelf]')];
    expect(shelves.map((g) => g.getAttribute('data-board-shelf'))).toEqual(['s', 't']);
    const ys = shelves.map((g) => Number(g.getAttribute('data-board-y')));
    expect(ys[0]).toBe(0);
    expect(ys[1]).toBeGreaterThan(26 + 2 + 8 - 1e-9);
    // La carte de la seconde bibliothèque est dessinée dans sa rangée, à gauche comme la première.
    const cd = container.querySelector('[data-board-card="Inconnue"] rect')!;
    expect(Number(cd.getAttribute('y'))).toBeGreaterThan(ys[1]!);
    expect(Number(cd.getAttribute('x'))).toBe(3);
  });
  it('un nouveau rendu au même niveau ne change pas l’animation d’entrée', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (level: ShelfLevel, imageOf: () => undefined) => act(() => { root.render(<ShelfBoardZoom shelfIds={['s', 't']} level={level} room={room} cards={cards} imageOf={imageOf} onCard={vi.fn()} onLevel={vi.fn()} />); });
    const enter = () => container.querySelector('svg')!.getAttribute('data-board-enter');
    render(0, () => undefined);
    expect(enter()).toBe('in');
    render(1, () => undefined);
    expect(enter()).toBe('below');
    render(1, () => undefined);
    expect(enter()).toBe('below');
    render(0, () => undefined);
    expect(enter()).toBe('above');
    render(0, () => undefined);
    expect(enter()).toBe('above');
  });
});

describe('jeux dans le second zoom', () => {
  const box = (backUrl?: string): GameBox => ({ format: 'bluray', style: { plastic: '#1F4C9E', band: { color: '#1F4C9E', label: 'PS4' } }, platformName: 'Sony Playstation 4', ...(backUrl ? { backUrl } : {}), shots: [], title: 'RDR2' });
  afterEach(() => setGameBoxService(null));
  const games: Room = {
    ...room,
    layout: [
      { id: 's', kind: 'shelf', col: 0, row: 6 },
      { id: 'g1', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, slug: 'RDR2', box: 'bluray', caseColor: '#1F4C9E', display: 'back' },
      { id: 'g2', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 1, slug: 'Zelda', box: 'switch', caseColor: '#E60012' },
    ],
  };
  const mountGames = () => {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => { createRoot(container).render(<ShelfBoardZoom shelfIds={['s']} level={0} room={games} cards={{ RDR2: { title: 'RDR2' }, Zelda: { title: 'Zelda' } }} imageOf={(s) => `${s}-face.png`} onCard={vi.fn()} onLevel={vi.fn()} />); });
    return container;
  };
  it('un jeu de dos montre l’image du dos, un jeu de face sa couverture', () => {
    setGameBoxService({ peek: (slug: string) => (slug === 'RDR2' ? box('dos.png') : undefined), subscribe: () => () => undefined, request: () => undefined } as unknown as GameBoxService);
    const c = mountGames();
    const back = c.querySelector('[data-board-card="RDR2"]')!;
    expect(back.getAttribute('data-board-display')).toBe('back');
    expect(back.querySelector('image')!.getAttribute('href')).toBe('dos.png');
    expect(c.querySelector('[data-board-card="Zelda"] image')!.getAttribute('href')).toBe('Zelda-face.png');
  });
  it('jeu de face : jaquette entière sur le plastique du boîtier, comme sur la boîte ouverte', () => {
    setGameBoxService(null);
    const c = mountGames();
    const card = c.querySelector('[data-board-card="Zelda"]')!;
    expect(card.querySelector('image')!.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(card.querySelector('rect')!.getAttribute('fill')).toBe('#E60012');
  });
  it('proportions du format : la boîte Switch garde ses mesures (10,5 × 17 cm)', () => {
    setGameBoxService(null);
    const c = mountGames();
    const sw = c.querySelector('[data-board-card="Zelda"] rect')!;
    expect(Number(sw.getAttribute('width'))).toBeCloseTo(10.5);
    expect(Number(sw.getAttribute('height'))).toBeCloseTo(17);
  });
  it('de dos sans image du dos : aplat de la couleur du boîtier', () => {
    setGameBoxService(null);
    const c = mountGames();
    const back = c.querySelector('[data-board-card="RDR2"]')!;
    expect(back.querySelector('image')).toBeNull();
    expect(back.querySelector('rect')!.getAttribute('fill')!.toUpperCase()).toBe('#1F4C9E');
  });
  it('de dos, boîte connue sans scan : dos fabriqué (bandeau de la console, titre)', () => {
    setGameBoxService({ peek: (slug: string) => (slug === 'RDR2' ? box() : undefined), subscribe: () => () => undefined, request: () => undefined } as unknown as GameBoxService);
    const c = mountGames();
    const back = c.querySelector('[data-board-card="RDR2"]')!;
    expect(back.querySelector('[data-made-back]')).not.toBeNull();
    expect(back.querySelector('[data-made-back-band]')!.textContent).toBe('PS4');
    expect(back.querySelector('[data-made-back-title]')!.textContent).toContain('RDR2');
  });
  it('les images ne transmettent pas la page d’origine', () => {
    setGameBoxService({ peek: (slug: string) => (slug === 'RDR2' ? box('dos.png') : undefined), subscribe: () => () => undefined, request: () => undefined } as unknown as GameBoxService);
    const c = mountGames();
    for (const img of c.querySelectorAll('image')) expect(img.getAttribute('referrerPolicy')).toBe('no-referrer');
  });
});
