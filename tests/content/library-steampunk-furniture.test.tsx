// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Room, StyleId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roomOf = (style: StyleId): Room => ({
  id: 'r1',
  name: 'Atelier',
  style,
  scene: 'city',
  orientation: 'landscape',
  cols: 48,
  pets: [],
  layout: [
    { id: 'd', kind: 'desk', col: 2, row: 14 },
    { id: 'c', kind: 'computer', deskId: 'd', slug: 'Paris' },
    { id: 'a', kind: 'armchair', col: 10, row: 14 },
    { id: 'l', kind: 'lamp', col: 14, row: 13 },
    { id: 'g', kind: 'globe', col: 18, row: 14 },
    { id: 't', kind: 'telescope', col: 22, row: 13 },
    { id: 'm', kind: 'automaton', col: 27, row: 15 },
  ],
});

function mount(room: Room) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={{ Paris: { title: 'Paris', imageUrl: 'https://x/p.jpg' } }} />);
  });
  return container;
}

describe('meubles Steampunk', () => {
  it('dessine chaque meuble par son modèle 3D, garnitures Steampunk comprises', () => {
    const steam = mount(roomOf('steampunk'));
    const plain = mount(roomOf('scandinave'));
    for (const kind of ['desk', 'armchair', 'lamp', 'globe', 'telescope', 'automaton']) {
      expect(steam.querySelector(`[data-furniture="${kind}"] [data-model3d]`), kind).not.toBeNull();
    }
    // Garnitures (laiton, rivets) : plus de formes que le même meuble hors Steampunk.
    for (const kind of ['desk', 'armchair', 'lamp']) {
      const count = (c: HTMLElement) => c.querySelectorAll(`[data-furniture="${kind}"] [data-model3d] > *`).length;
      expect(count(steam), kind).toBeGreaterThan(count(plain));
    }
    expect(steam.querySelector('[data-furniture="computer"] [data-steampunk-art="analytical-engine"]')).not.toBeNull();
  });

  it("affiche l'image de la carte dans l'écran de la machine analytique", () => {
    const image = mount(roomOf('steampunk')).querySelector('[data-steampunk-art="analytical-engine"] image');
    expect(image?.getAttribute('href')).toBe('https://x/p.jpg');
    expect(image?.getAttribute('referrerPolicy')).toBe('no-referrer');
  });

  it('la lampe allumée a son halo, qui ne capte pas le pointeur', () => {
    const halo = mount(roomOf('steampunk')).querySelector('[data-furniture="lamp"] [data-lamp-halo]');
    expect(halo?.getAttribute('pointer-events')).toBe('none');
  });

  it('hors Steampunk : ni machine analytique, ni meubles exclusifs, même tournés', () => {
    const container = mount(roomOf('scandinave'));
    expect(container.querySelector('[data-steampunk-art]')).toBeNull();
    for (const kind of ['globe', 'telescope', 'automaton']) expect(container.querySelector(`[data-furniture="${kind}"]`), kind).toBeNull();
    for (const kind of ['desk', 'computer', 'armchair', 'lamp']) expect(container.querySelector(`[data-furniture="${kind}"]`), kind).not.toBeNull();
    const turned = roomOf('scandinave');
    turned.layout = turned.layout.map((p) => (p.kind === 'globe' ? { ...p, angle: 0 } : p.kind === 'telescope' ? { ...p, angle: 3 } : p));
    const c2 = mount(turned);
    for (const kind of ['globe', 'telescope']) expect(c2.querySelector(`[data-furniture="${kind}"]`), kind).toBeNull();
  });
});
