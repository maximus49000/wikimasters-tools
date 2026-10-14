// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
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

function mount(level: ShelfLevel, ids = ['s', 't']) {
  const onCard = vi.fn();
  const onLevel = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  act(() => { createRoot(container).render(<ShelfBoardZoom shelfIds={ids} level={level} room={room} cards={cards} imageOf={() => undefined} onCard={onCard} onLevel={onLevel} />); });
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
});
