// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function mount(phase: 'opening' | 'open' | 'closing', onCard = vi.fn(), onBack = vi.fn(), r: Room = room) {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <FurnitureZoom target={{ kind: 'shelf', id: 's' }} room={r} cards={{ Daft_Punk: { title: 'Daft Punk' } }} imageOf={() => undefined}
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
    // 13 emplacements vides en pointillés + 2 cartes = 15.
    expect(container.querySelectorAll('rect[stroke-dasharray]').length + container.querySelectorAll('[data-zoom-card]').length).toBe(15);
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

  describe('animation', () => {
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    const face = (c: HTMLElement) => c.querySelector('[data-furniture-zoom]')!.getAttribute('data-zoom-face');
    const flat: Room = { ...room, layout: room.layout.map((p) => (p.id === 's' ? { ...p, angle: 0 } : p)) } as Room;

    it('meuble tourné : de face après 250 ms à l’ouverture, de profil après 250 ms à la fermeture', () => {
      vi.useFakeTimers();
      const o = mount('opening');
      expect(face(o.container)).toBe('angled');
      act(() => { vi.advanceTimersByTime(260); });
      expect(face(o.container)).toBe('front');
      const c = mount('closing');
      expect(face(c.container)).toBe('front');
      act(() => { vi.advanceTimersByTime(260); });
      expect(face(c.container)).toBe('angled');
    });
    it('meuble de face : part du rectangle du toucher puis rejoint le cadre final', () => {
      vi.useFakeTimers();
      const { container } = mount('opening', vi.fn(), vi.fn(), flat);
      const piece = container.querySelector<HTMLElement>('.wmt-lib-zoom-piece')!;
      expect(piece.style.left).toBe('10px');
      expect(piece.style.width).toBe('60px');
      act(() => { vi.advanceTimersByTime(50); });
      expect(piece.style.left).not.toBe('10px');
      expect(piece.style.width).not.toBe('60px');
      expect(piece.style.transition).toContain('500ms');
    });
    it('mouvement réduit : de face tout de suite, au cadre final, fondu', () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} }));
      vi.useFakeTimers();
      const { container } = mount('opening');
      expect(face(container)).toBe('front');
      expect(container.querySelector<HTMLElement>('.wmt-lib-zoom-piece')!.style.left).not.toBe('10px');
      const root = container.querySelector<HTMLElement>('[data-furniture-zoom]')!;
      expect(root.style.opacity).toBe('0');
      act(() => { vi.advanceTimersByTime(50); });
      expect(root.style.opacity).toBe('1');
    });
  });
});
