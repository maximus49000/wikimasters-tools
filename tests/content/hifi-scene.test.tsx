// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { setPlayerSource } from '../../src/content/music-registry';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';
import type { Layout, Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMG = 'data:image/png;base64,AAAA';
const CARDS = { Daft_Punk: { title: 'Discovery', imageUrl: IMG } };

let view: PlayerView;
const listeners = new Set<() => void>();
function play(playing: boolean, slug = 'Daft_Punk') {
  view = { linked: true, hidden: false, enabled: true, card: { slug, title: 'Discovery' }, track: { uri: 'spotify:track:1', title: 'One More Time', artist: 'Daft Punk', imageUrl: IMG, playing } };
  act(() => listeners.forEach((l) => l()));
}
function install() {
  view = { linked: true, hidden: false, enabled: true, card: null, track: null };
  setPlayerSource({ current: () => view, subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); }, toggle: async () => undefined } as unknown as PlayerSource);
}

const base: Layout = [
  { id: 's', kind: 'shelf', col: 2, row: 4 },
  { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
  { id: 'd', kind: 'desk', col: 12, row: 10 },
];
const hifi: Layout[number] = { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 };

let root: Root | null = null;
function render(layout: Layout, c?: HTMLElement): HTMLElement {
  const container = c ?? document.createElement('div');
  if (!c) document.body.append(container);
  root ??= createRoot(container);
  const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout };
  act(() => root!.render(<RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={CARDS} />));
  return container;
}
afterEach(() => { act(() => root?.unmount()); root = null; setPlayerSource(null); listeners.clear(); });

const avgY = (points: string | null): number => {
  const ys = (points ?? '').trim().split(/\s+/).map((p) => Number(p.split(',')[1]));
  return ys.reduce((a, b) => a + b, 0) / ys.length;
};

describe('chaîne hi-fi dans la pièce', () => {
  it('l’album qui joue quitte l’étagère : son disque tourne sur le poste, sa pochette est couchée devant', () => {
    install();
    const c = render([...base, hifi]);
    expect(c.querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    play(true);
    expect(c.querySelector('[data-card="Daft_Punk"]')).toBeNull();
    const station = c.querySelector('[data-hifi]')!;
    expect(station.getAttribute('data-id')).toBe('h');
    expect(station.querySelector<SVGGElement>('[data-hifi-disc-spin]')!.style.animation).toContain('wmt-hifi-disc-spin');
    expect(station.querySelector('[data-hifi-display]')!.textContent).toContain('One More Time');
    const sleeve = c.querySelector('[data-hifi-sleeve]')!;
    expect(sleeve.getAttribute('data-hifi-sleeve')).toBe('Daft_Punk');
    expect(sleeve.querySelector('image')!.getAttribute('href')).toBe(IMG);
    // Devant le poste : dessinée après lui, plus bas à l'écran que le milieu du poste.
    expect(station.compareDocumentPosition(sleeve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const hit = station.querySelector(':scope > rect[fill="transparent"]')!;
    const middle = Number(hit.getAttribute('y')) + Number(hit.getAttribute('height')) / 2;
    expect(avgY(sleeve.querySelector('[data-hifi-sleeve-top]')!.getAttribute('points'))).toBeGreaterThan(middle);
  });

  it('pause : le disque reste posé, immobile', () => {
    install();
    const c = render([...base, hifi]);
    play(false);
    expect(c.querySelector('[data-card="Daft_Punk"]')).toBeNull();
    expect(c.querySelector<SVGGElement>('[data-hifi] [data-hifi-disc-spin]')!.style.animation).toBe('');
    expect(c.querySelector('[data-hifi-sleeve]')).not.toBeNull();
  });

  it('poste retiré de la pièce : l’objet revient sur l’étagère', () => {
    install();
    const c = render([...base, hifi]);
    play(true);
    expect(c.querySelector('[data-card="Daft_Punk"]')).toBeNull();
    render(base, c);
    expect(c.querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(c.querySelector('[data-hifi-sleeve]')).toBeNull();
    expect(c.querySelector('[data-hifi]')).toBeNull();
  });

  it('autre carte en lecture : rien ne quitte l’étagère, le poste est vide mais affiche la piste', () => {
    install();
    const c = render([...base, hifi]);
    play(true, 'Autre');
    expect(c.querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(c.querySelector('[data-hifi-sleeve]')).toBeNull();
    expect(c.querySelector('[data-hifi] [data-hifi-disc-spin]')).toBeNull();
    expect(c.querySelector('[data-hifi] [data-hifi-display]')!.textContent).toContain('One More Time');
  });
});
