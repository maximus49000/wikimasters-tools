// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { FurnitureZoom } from '../../src/content/furniture-zoom';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 's', kind: 'shelf', col: 0, row: 6, angle: 2 },
    { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Daft_Punk' },
    { id: 'c2', kind: 'stored', shape: 'book', shelfId: 's', slot: 4, slug: 'Inconnue' },
  ],
};

function mount(phase: 'opening' | 'open' | 'closing', onCard = vi.fn(), onBack = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <FurnitureZoom target={{ kind: 'shelf', id: 's' }} room={room} cards={{ Daft_Punk: { title: 'Daft Punk' } }} imageOf={() => undefined}
        phase={phase} from={{ x: 10, y: 20, w: 60, h: 160 }} stage={{ w: 800, h: 400 }} onCard={onCard} onBack={onBack} />,
    );
  });
  return { container, onCard, onBack };
}

describe('calque du zoom', () => {
  it('ouvert : vue de face avec les 15 emplacements et les cartes, même si l’étagère est de profil', () => {
    const { container } = mount('open');
    const zoom = container.querySelector('[data-furniture-zoom]')!;
    expect(zoom.getAttribute('data-zoom-face')).toBe('front');
    expect(container.querySelector('[data-zoom-card="Daft_Punk"]')).not.toBeNull();
    expect(container.querySelector('[data-zoom-card="Inconnue"]')).not.toBeNull();
  });
  it('toucher une carte connue la signale ; une inconnue ne fait rien', () => {
    const { container, onCard } = mount('open');
    act(() => { container.querySelector('[data-zoom-card="Daft_Punk"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCard).toHaveBeenCalledWith('Daft_Punk');
    act(() => { container.querySelector('[data-zoom-card="Inconnue"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCard).toHaveBeenCalledTimes(1);
  });
  it('← et le fond flouté appellent onBack', () => {
    const { container, onBack } = mount('open');
    act(() => { container.querySelector<HTMLButtonElement>('[data-action="zoom-back"]')!.click(); });
    act(() => { container.querySelector('[data-zoom-backdrop]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
  it('à l’ouverture d’un meuble tourné, la première moitié montre le meuble sous son angle', () => {
    const { container } = mount('opening');
    expect(container.querySelector('[data-furniture-zoom]')!.getAttribute('data-zoom-face')).toBe('angled');
  });
});
