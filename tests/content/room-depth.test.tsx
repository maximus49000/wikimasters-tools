// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Layout, Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 'tab', kind: 'coffee-table', col: 0, row: 14 },
    { id: 'sh', kind: 'shelf', col: 0, row: 10 },
    { id: 'pl', kind: 'small', item: 'plant', hostId: 'sh', slot: 0 },
    { id: 'arm', kind: 'armchair', col: 1, row: 13 },
    { id: 'pos', kind: 'wall', shape: 'poster', col: 1, row: 7, slug: 'Paris' },
  ],
};

function mount({ editing = false, selectedId = null, layout }: { editing?: boolean; selectedId?: string | null; layout?: Layout } = {}): SVGSVGElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <RoomView room={layout ? { ...room, layout } : room} editing={editing} cellsActive={false} selectedId={selectedId} blink={[]} onCell={() => undefined} onPick={() => undefined} />,
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
});
