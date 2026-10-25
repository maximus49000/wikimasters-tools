// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { SpriteContext, SpriteRegistry } from '../../src/content/furniture/sprite-host';
import type { Layout, Room } from '../../src/core/library/library-types';
import { isStanding } from '../../src/core/library/room-grid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COVER = 'data:image/png;base64,COUVERTURE';
const CARDS = { Daft_Punk: { title: 'Daft Punk', imageUrl: COVER }, Dune: { title: 'Dune', imageUrl: COVER } };
const LAYOUT: Layout = [
  { id: 's', kind: 'shelf', col: 2, row: 4 },
  { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
  { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 1, order: 0, slug: 'Dune' },
  { id: 'so', kind: 'sofa', col: 8, row: 12, angle: 1 },
  { id: 'l', kind: 'lamp', col: 20, row: 11, lit: true },
  { id: 'd', kind: 'desk', col: 13, row: 9 },
  { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 2, z: 2.5 },
];
const STANDING = LAYOUT.filter(isStanding).length;

let root: Root | null = null;
let queue: (() => void)[] = [];
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  queue = [];
  localStorage.removeItem(ART_KEY);
});

function mount(extra: Partial<Parameters<typeof RoomView>[0]> = {}): HTMLElement {
  const reg = new SpriteRegistry('test', { schedule: (cb) => void queue.push(cb) });
  const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout: LAYOUT };
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(
    <SpriteContext.Provider value={reg}>
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={CARDS} {...extra} />
    </SpriteContext.Provider>,
  ));
  return container;
}
const flush = () => act(() => { while (queue.length) queue.shift()!(); });
// Matrices de la couverture d'une carte rangée : groupe de l'objet et repère de sa face.
// Couverture (image de la carte) ou titre de tranche : groupe de l'objet et repère de sa face.
const decalChain = (c: HTMLElement, slug: string, what: 'image' | 'text'): string[] => {
  const el = c.querySelector(`[data-card="${slug}"] ${what === 'image' ? `image[href="${COVER}"]` : 'text'}`)!;
  return [el.closest('[data-item3d]')!.getAttribute('transform')!, el.closest('g[transform^="matrix"]')!.getAttribute('transform')!];
};

describe('sprites cellulo dans la pièce (Ghibli)', () => {
  describe('en Ghibli', () => {
    beforeEach(() => writeArt('ghibli'));

    it('chaque meuble debout rend un sprite : repli avant cuisson, image après ; l’ombre au sol part avec le repli', () => {
      const c = mount();
      const furniture = [...c.querySelectorAll('[data-furniture]')].filter((g) => ['shelf', 'sofa', 'lamp', 'desk'].includes(g.getAttribute('data-furniture')!));
      expect(furniture.length).toBe(STANDING);
      for (const g of furniture) {
        expect(g.querySelector('[data-furniture-sprite] [data-sprite-fallback] [data-model3d]'), g.getAttribute('data-id')!).not.toBeNull();
        expect(g.querySelector('[data-furniture-sprite] > image')).toBeNull();
      }
      expect(c.querySelectorAll('polygon[data-ground-shadow]').length).toBe(STANDING);
      flush();
      for (const g of furniture) {
        expect(g.querySelector('[data-furniture-sprite] > image'), g.getAttribute('data-id')!).not.toBeNull();
        expect(g.querySelector('[data-sprite-fallback]')).toBeNull();
      }
      // L'ombre est dans l'image.
      expect(c.querySelectorAll('polygon[data-ground-shadow]').length).toBe(0);
      // Objets portés : chacun son image, dans son groupe d'objet.
      expect(c.querySelector('[data-card="Daft_Punk"] [data-item3d="cd"] image[data-sprite-image]')).not.toBeNull();
      expect(c.querySelector('[data-id="h"] [data-item3d] image[data-sprite-image]')).not.toBeNull();
    });

    it('une étagère garnie garde ses décalques : la couverture à la même matrice qu’en classique', () => {
      const c = mount();
      flush();
      const ghibli = { cd: decalChain(c, 'Daft_Punk', 'image'), book: decalChain(c, 'Dune', 'text') };
      act(() => root?.unmount());
      root = null;
      localStorage.removeItem(ART_KEY);
      const k = mount();
      expect(k.querySelector('image[data-sprite-image]')).toBeNull();
      expect(ghibli).toEqual({ cd: decalChain(k, 'Daft_Punk', 'image'), book: decalChain(k, 'Dune', 'text') });
    });

    it('l’image peinte n’est jamais assombrie : aucun voile hors du cadre d’un décor (tranche de livre de profil)', () => {
      // Étagère tournée : la tranche du livre est sur un côté ombré (dim > 0).
      const layout: Layout = [{ id: 's', kind: 'shelf', col: 2, row: 4, angle: 1 }, { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 0, slug: 'Dune' }];
      const reg = new SpriteRegistry('test', { schedule: (cb) => void queue.push(cb) });
      const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout };
      const c = document.createElement('div');
      document.body.append(c);
      root = createRoot(c);
      act(() => root!.render(<SpriteContext.Provider value={reg}><RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={CARDS} /></SpriteContext.Provider>));
      flush();
      const item = c.querySelector('[data-card="Dune"] [data-item3d]')!;
      expect(item.querySelector('image[data-sprite-image]')).not.toBeNull();
      // Côté ombré : le titre est atténué (transparence), pas l'image recouverte d'un voile.
      expect(item.querySelector('text')!.closest('g[opacity]')).not.toBeNull();
      // Aucun polygone noir (l'ancien voile couvrait toute la face à boîtes, par-dessus l'image) ; un voile éventuel est sous la matrice du décor.
      expect(item.querySelectorAll('polygon[fill="#000000"]').length).toBe(0);
      for (const r of item.querySelectorAll('[fill="#000000"]')) expect(r.closest('g[transform^="matrix"]')).not.toBeNull();
    });

    it('attributs, zone de toucher et contour de sélection inchangés', () => {
      const c = mount({ editing: true, selectedId: 'so' });
      flush();
      const sofa = c.querySelector('[data-furniture="sofa"]')!;
      expect(sofa.getAttribute('data-id')).toBe('so');
      expect(sofa.getAttribute('data-angle')).toBe('1');
      expect(sofa.querySelector(':scope > rect[fill="transparent"]')).not.toBeNull();
      expect(sofa.querySelector('[data-outline="selected"]')).not.toBeNull();
      expect(c.querySelector('[data-id="h"]')!.getAttribute('data-hifi')).toBe('empty');
      // La copie de sélection montre aussi l'image peinte.
      expect(c.querySelector('[data-selected-copy] [data-furniture-sprite]')).not.toBeNull();
    });
  });

  it('en classique (défaut des tests), le rendu ne change pas : aucun sprite', () => {
    const c = mount();
    flush();
    expect(c.querySelector('[data-furniture-sprite]')).toBeNull();
    expect(c.querySelector('[data-sprite-fallback]')).toBeNull();
    expect(c.querySelector('image[data-sprite-image]')).toBeNull();
    expect(c.querySelectorAll('polygon[data-ground-shadow]').length).toBe(STANDING);
    expect(c.querySelectorAll('[data-model3d]').length).toBeGreaterThanOrEqual(STANDING);
  });
});
