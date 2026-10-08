// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { STEAMPUNK_REDRAWN } from '../../src/content/furniture-art-steampunk';
import type { Room, StyleId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roomOf = (style: StyleId): Room => ({
  id: 'r1',
  name: 'Atelier',
  style,
  orientation: 'landscape',
  cols: 48,
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
  it('liste les trois meubles redessinés', () => {
    expect([...STEAMPUNK_REDRAWN]).toEqual(['desk', 'armchair', 'lamp']);
  });

  it('dessine chaque meuble avec son art Steampunk', () => {
    const container = mount(roomOf('steampunk'));
    const art: Record<string, string> = { desk: 'desk', computer: 'analytical-engine', armchair: 'armchair', lamp: 'lamp', globe: 'globe', telescope: 'telescope', automaton: 'automaton' };
    for (const [kind, name] of Object.entries(art)) {
      expect(container.querySelector(`[data-furniture="${kind}"] [data-steampunk-art="${name}"]`), kind).not.toBeNull();
    }
  });

  it("affiche l'image de la carte dans l'écran de la machine analytique", () => {
    const image = mount(roomOf('steampunk')).querySelector('[data-steampunk-art="analytical-engine"] image');
    expect(image?.getAttribute('href')).toBe('https://x/p.jpg');
    expect(image?.getAttribute('referrerPolicy')).toBe('no-referrer');
  });

  it('anime la lampe et la manivelle', () => {
    const container = mount(roomOf('steampunk'));
    expect(container.querySelector('[data-steampunk-art="lamp"] animate[attributeName="opacity"]')).not.toBeNull();
    expect(container.querySelector('[data-steampunk-art="automaton"] animateTransform')).not.toBeNull();
  });

  it('hors Steampunk : ni art Steampunk, ni meubles exclusifs', () => {
    const container = mount(roomOf('scandinave'));
    expect(container.querySelector('[data-steampunk-art]')).toBeNull();
    for (const kind of ['globe', 'telescope', 'automaton']) expect(container.querySelector(`[data-furniture="${kind}"]`), kind).toBeNull();
    for (const kind of ['desk', 'computer', 'armchair', 'lamp']) expect(container.querySelector(`[data-furniture="${kind}"]`), kind).not.toBeNull();
  });
});
