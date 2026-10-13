// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { PetView } from '../../src/content/pet-sim';
import type { Layout, Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 'tab', kind: 'coffee-table', col: 0, row: 13 },
    // Bas de l'étagère, du fauteuil et de la table basse sur la même ligne (16) : le niveau départage.
    { id: 'sh', kind: 'shelf', col: 0, row: 7 },
    { id: 'pl', kind: 'small', item: 'plant', hostId: 'sh', slot: 0 },
    { id: 'arm', kind: 'armchair', col: 1, row: 11 },
    { id: 'pos', kind: 'wall', shape: 'poster', col: 1, row: 7, slug: 'Paris' },
  ],
};

function mount({ editing = false, selectedId = null, layout, pets }: { editing?: boolean; selectedId?: string | null; layout?: Layout; pets?: PetView[] } = {}): SVGSVGElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <RoomView room={layout ? { ...room, layout } : room} editing={editing} cellsActive={false} selectedId={selectedId} blink={[]} onCell={() => undefined} onPick={() => undefined} pets={pets} />,
    );
  });
  return container.querySelector('svg')!;
}

describe('RoomView : niveaux de profondeur', () => {
  it('dessine du fond vers l’avant, chaque objet porté juste après son porteur', () => {
    const svg = mount();
    const ids = [...svg.querySelectorAll('[data-id]')].map((n) => n.getAttribute('data-id'));
    expect(ids.indexOf('pos')).toBeLessThan(ids.indexOf('sh'));
    expect(ids.indexOf('sh')).toBeLessThan(ids.indexOf('pl'));
    expect(ids.indexOf('pl')).toBeLessThan(ids.indexOf('arm'));
    expect(ids.indexOf('arm')).toBeLessThan(ids.indexOf('tab'));
  });

  it('dessine devant le meuble le plus bas à l’écran, même s’il est au fond', () => {
    const layout: Layout = [
      { id: 'sofa', kind: 'sofa', col: 0, row: 11 },
      { id: 'sh', kind: 'shelf', col: 2, row: 8 },
    ];
    const svg = mount({ layout });
    const ids = [...svg.querySelectorAll('[data-id]')].map((n) => n.getAttribute('data-id'));
    expect(ids.indexOf('sofa')).toBeLessThan(ids.indexOf('sh'));
  });

  it('marque le niveau de chaque objet', () => {
    const svg = mount();
    expect(svg.querySelector('[data-id="tab"]')!.closest('[data-depth]')!.getAttribute('data-depth')).toBe('3');
    expect(svg.querySelector('[data-id="pos"]')!.closest('[data-depth]')!.getAttribute('data-depth')).toBe('0');
  });

  it('redessine l’objet sélectionné par-dessus, sans capter le toucher', () => {
    const svg = mount({ editing: true, selectedId: 'sh' });
    const copy = svg.querySelector('[data-selected-copy]')!;
    expect(copy.getAttribute('pointer-events')).toBe('none');
    // La copie vient après la table basse.
    const all = [...svg.querySelectorAll('[data-id="tab"], [data-selected-copy]')];
    expect(all.at(-1)).toBe(copy);
  });

  it('dessine un objet rangé juste après son étagère, dans son groupe', () => {
    const svg = mount({ layout: [...room.layout, { id: 'cd', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 0, order: 0, slug: 'Paris' }] });
    const ids = [...svg.querySelectorAll('[data-id]')].map((n) => n.getAttribute('data-id'));
    expect(ids.indexOf('cd')).toBeGreaterThan(ids.indexOf('sh'));
    expect(ids.indexOf('cd')).toBeLessThan(ids.indexOf('arm'));
    const group = svg.querySelector('[data-id="sh"]')!.closest('[data-depth]')!;
    expect(group.querySelector('[data-id="cd"]')).not.toBeNull();
  });

  it('insère l’animal à son rang `behind` parmi les groupes meuble + objets portés', () => {
    const cat: PetView = { id: 'p1', species: 'cat', coat: 'orange', name: 'Minou', pose: 'sit', facing: 'r', behind: 1, top: false, on: null };
    const svg = mount({ pets: [cat] });
    const nodes = [...svg.querySelectorAll('[data-id="sh"], [data-id="pl"], [data-pet="p1"], [data-id="arm"]')];
    expect(nodes.map((n) => n.getAttribute('data-id') ?? 'chat')).toEqual(['sh', 'pl', 'chat', 'arm']);
  });

  it('la copie d’une étagère sélectionnée emporte ses objets, dessinés après elle, sans gestes', () => {
    const svg = mount({ editing: true, selectedId: 'sh', layout: [...room.layout, { id: 'cd', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 0, order: 0, slug: 'Paris' }] });
    const copy = svg.querySelector('[data-selected-copy]')!;
    // Enfants directs : le dessin de l'étagère d'abord, puis ses objets (plante posée, cartes rangées dans leur groupe découpé).
    const children = [...copy.children];
    expect(copy.querySelector('[data-shelf-items] > [data-copy-of="cd"]')).not.toBeNull();
    const card = children.find((el) => el.querySelector('[data-shelf-items]'))!;
    expect(card).toBeDefined();
    expect(children[0]!.hasAttribute('data-copy-of')).toBe(false);
    expect(children.indexOf(copy.querySelector(':scope > [data-copy-of="pl"]')!)).toBeGreaterThan(0);
    expect(children.indexOf(card)).toBeGreaterThan(0);
    expect(copy.querySelector('[data-id]')).toBeNull();
  });
});

describe('RoomView : ombre au sol', () => {
  it('chaque meuble debout pose une ombre au sol : la trace de sa base, sans pavé derrière un meuble creux', () => {
    const svg = mount({ layout: [{ id: 'x', kind: 'chair', col: 20, row: 10 }, { id: 'r', kind: 'rug', col: 2, row: 15 }] });
    const shadow = svg.querySelector('polygon[data-ground-shadow="x"]')!;
    expect(shadow).not.toBeNull();
    expect(shadow.getAttribute('stroke')).toBeNull();
    expect(svg.querySelector('[data-ground-shadow="r"]')).toBeNull(); // le tapis est au sol
    // Chaise 2 × 6 cases (rangées 10 à 15) : l'ombre reste dans la bande du sol (dernière rangée et un peu au-dessus), pas sur le dossier.
    const ys = shadow.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
    expect(Math.min(...ys)).toBeGreaterThan(14 * (510 / 18));
    expect(Math.max(...ys)).toBeLessThanOrEqual(16 * (510 / 18) + 6);
    expect(svg.querySelector('[data-contact-shadow]')).toBeNull();
  });
});
