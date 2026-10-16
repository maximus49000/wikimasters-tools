// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenedItemLayer } from '../../src/content/opened-item/OpenedItemLayer';
import type { Placed } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const placed: Placed = { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Abbey_Road' };
let container: HTMLDivElement;
let root: Root;

function mount(hasHifi = true) {
  const h = { onInfo: vi.fn(), onClose: vi.fn(), onAddHifi: vi.fn() };
  act(() => root.render(
    <OpenedItemLayer placed={placed} card={{ title: 'Abbey Road' }} cover={null} color="#c33" state={{ placedId: 'c1', from: null, to: null, phase: 'open' }}
      disc="in" hasHifi={hasHifi} {...h} />,
  ));
  return h;
}
const btn = (a: string) => container.querySelector<HTMLButtonElement>(`button[data-action="${a}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OpenedItemLayer', () => {
  it('ⓘ ouvre la fiche, ✕ ferme, Échap ferme', () => {
    const h = mount();
    act(() => btn('info')!.click());
    expect(h.onInfo).toHaveBeenCalled();
    act(() => btn('close')!.click());
    expect(h.onClose).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });
  it('sans poste : glyphe d’ajout ; avec poste : absent', () => {
    const h = mount(false);
    act(() => btn('add-hifi')!.click());
    expect(h.onAddHifi).toHaveBeenCalled();
    mount(true);
    expect(btn('add-hifi')).toBeNull();
  });
  it('écran en hauteur : calque tourné de 90°, sinon plein écran', () => {
    mount();
    const layer = () => container.querySelector<HTMLElement>('[data-opened-item]')!;
    expect(layer().style.transform).not.toContain('rotate');
    Object.assign(window, { innerWidth: 400, innerHeight: 800 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(layer().style.transform).toContain('rotate(90deg)');
  });
  it('écran en hauteur : départ et arrivée du boîtier convertis dans le repère du calque tourné', () => {
    Object.assign(window, { innerWidth: 400, innerHeight: 800 });
    act(() => root.render(
      <OpenedItemLayer placed={placed} card={{ title: 'Abbey Road' }} cover={null} color="#c33" state={{ placedId: 'c1', from: { x: 10, y: 20, w: 30, h: 40 }, to: null, phase: 'opening' }}
        disc="in" hasHifi onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()} />,
    ));
    // (10, 20, 30×40) à l'écran → (20, 360, 40×30) dans le calque : le boîtier part de y = 360.
    expect(container.querySelector<HTMLElement>('[data-item-case]')!.style.transform).toMatch(/translate\([\d.]+px, 360px\)/);
  });
  it('vol du disque : monté par-dessus le boîtier, posé après 900 ms', () => {
    vi.useFakeTimers();
    try {
      const onLanded = vi.fn();
      act(() => root.render(
        <OpenedItemLayer placed={placed} card={{ title: 'Abbey Road' }} cover={null} color="#c33" state={{ placedId: 'c1', from: null, to: null, phase: 'open' }}
          disc="flying" hasHifi onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()} flight={{ id: 1, target: { x: 2000, y: 100, w: 30, h: 30 }, onLanded }} />,
      ));
      const fly = container.querySelector<HTMLElement>('[data-disc-flight]')!;
      expect(fly).not.toBeNull();
      // Dessiné après le boîtier, au-dessus de lui.
      expect(container.querySelector('[data-item-case]')!.compareDocumentPosition(fly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      act(() => { vi.advanceTimersByTime(900); });
      expect(onLanded).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('jeu : le format donne la boîte (Switch : cartouche) et le vol part en « cart »', () => {
    vi.useFakeTimers();
    try {
      const game: Placed = { id: 'g1', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, slug: 'Zelda' };
      act(() => root.render(
        <OpenedItemLayer placed={game} format="switch" caseColor="#E60012" card={{ title: 'Zelda' }} cover={null} color="#c33" state={{ placedId: 'g1', from: null, to: null, phase: 'open' }}
          disc="flying" hasHifi onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()} flight={{ id: 1, target: { x: 600, y: 100, w: 30, h: 30 }, onLanded: vi.fn() }} />,
      ));
      expect(container.querySelector('[data-case-tray] > svg')!.getAttribute('viewBox')).toBe('0 0 105 170');
      expect(container.querySelector('[data-case-disc][data-support="cart"]')).not.toBeNull();
      expect(container.querySelector('[data-disc-flight]')!.getAttribute('data-kind')).toBe('cart');
    } finally {
      vi.useRealTimers();
    }
  });
  it('jeu Blu-ray : le disque vole en « game »', () => {
    const game: Placed = { id: 'g1', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, slug: 'RDR2' };
    act(() => root.render(
      <OpenedItemLayer placed={game} format="bluray" card={{ title: 'RDR2' }} cover={null} color="#c33" state={{ placedId: 'g1', from: null, to: null, phase: 'open' }}
        disc="flying" hasHifi onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()} flight={{ id: 1, target: { x: 600, y: 100, w: 30, h: 30 }, onLanded: vi.fn() }} />,
    ));
    expect(container.querySelector('[data-disc-flight]')!.getAttribute('data-kind')).toBe('game');
  });

  describe('retourner (⟲) la boîte de jeu', () => {
    const game: Placed = { id: 'g1', kind: 'stored', shape: 'game', shelfId: 's', level: 0, order: 0, slug: 'RDR2' };
    const caseBox = () => {
      const t = container.querySelector<HTMLElement>('[data-item-case]')!.style.transform;
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(t)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const drawGame = (extra: Record<string, unknown> = {}) => act(() => root.render(
      <OpenedItemLayer placed={game} format="bluray" card={{ title: 'RDR2' }} cover={null} color="#c33" state={{ placedId: 'g1', from: null, to: null, phase: 'open' }}
        disc="in" hasHifi onInfo={vi.fn()} onClose={vi.fn()} onAddHifi={vi.fn()} {...extra} />,
    ));
    it('bouton ⟲ au-dessus de la boîte, centré sur elle ; absent pour un CD', () => {
      mount();
      expect(btn('flip')).toBeNull();
      drawGame();
      const b = btn('flip')!;
      expect(b.textContent).toBe('⟲');
      expect(b.style.width).toBe('44px');
      // La charnière (bord gauche du plateau) est le centre de la boîte ouverte.
      expect(parseFloat(b.style.left) + 22).toBeCloseTo(caseBox().x, 1);
      expect(parseFloat(b.style.top) + 44).toBeLessThanOrEqual(caseBox().y);
      expect(parseFloat(b.style.top)).toBeGreaterThanOrEqual(0);
    });
    it('⟲ montre l’extérieur (dos, tranche, devant), ⟲ à nouveau l’intérieur', () => {
      drawGame();
      const flipped = () => container.querySelector('[data-item-case]')!.getAttribute('data-flipped');
      expect(flipped()).toBe('false');
      act(() => btn('flip')!.click());
      expect(flipped()).toBe('true');
      expect([...container.querySelectorAll<HTMLElement>('[data-case-outside] [data-outside-zone]')].map((z) => z.dataset.outsideZone)).toEqual(['back', 'spine', 'front']);
      act(() => btn('flip')!.click());
      expect(flipped()).toBe('false');
    });
    it('couche tournée (écran en hauteur) : le bouton reste au-dessus de la boîte dans le repère tourné (Review Focus 4)', () => {
      Object.assign(window, { innerWidth: 400, innerHeight: 800 });
      drawGame();
      expect(container.querySelector<HTMLElement>('[data-opened-item]')!.style.transform).toContain('rotate(90deg)');
      const b = btn('flip')!;
      // Repère du calque : 800 × 400.
      expect(caseBox().x).toBeCloseTo(400, 1);
      expect(parseFloat(b.style.left) + 22).toBeCloseTo(400, 1);
      expect(parseFloat(b.style.top) + 44).toBeLessThanOrEqual(caseBox().y);
    });
    it('une vidéo en cours est arrêtée au retournement', () => {
      const onFlip = vi.fn();
      drawGame({ right: <video data-test-video="" />, onFlip });
      expect(container.querySelector('[data-test-video]')).not.toBeNull();
      act(() => btn('flip')!.click());
      expect(container.querySelector('[data-test-video]')).toBeNull();
      expect(onFlip).toHaveBeenCalledWith(true);
    });
  });
});
