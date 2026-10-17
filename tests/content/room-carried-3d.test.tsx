// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setPlayerSource } from '../../src/content/music-registry';
import type { PlayerSource } from '../../src/content/player-source';
import { RoomView } from '../../src/content/RoomView';
import { computerPlacement, placementRectPx, screenQuad, storedFrontQuad, storedPlacementsOf } from '../../src/core/library/carried-items';
import { drawSize } from '../../src/core/library/footprint';
import { FURNITURE_MODELS } from '../../src/core/library/furniture-models';
import { openingOf } from '../../src/core/library/furniture-render3d';
import type { Layout, Room } from '../../src/core/library/library-types';
import { pxRect, rectOf } from '../../src/core/library/room-grid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMG = 'data:image/png;base64,AAAA';
const CARDS = { Daft_Punk: { title: 'Daft Punk', imageUrl: IMG }, Dune: { title: 'Dune' }, Paris: { title: 'Paris', imageUrl: IMG } };

function mount(layout: Layout, extra: Partial<Parameters<typeof RoomView>[0]> = {}) {
  const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout };
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} cards={CARDS} {...extra} />,
    );
  });
  return container;
}
const shelf = (angle: 0 | 1 | 2 | 7 = 0) => ({ id: 's', kind: 'shelf', col: 2, row: 4, angle }) as const;
const items: Layout = [
  { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
  { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 1, slug: 'Dune' },
  { id: 'u', kind: 'stored', shape: 'dvd', shelfId: 's', level: 1, order: 0, slug: 'Inconnue' },
];
const pts = (s: string | null): [number, number][] => (s ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

describe('objets rangés en 3D dans la pièce', () => {
  it('de face : l’image de la carte sur la couverture, le titre sur la tranche d’un livre, chacun dans son modèle 3D', () => {
    const c = mount([shelf(), ...items]);
    expect(c.querySelector('[data-card="Daft_Punk"] [data-item3d="cd"] image')!.getAttribute('href')).toBe(IMG);
    expect(c.querySelector('[data-card="Dune"] [data-item3d="book"] text')!.textContent).toBe('Dune');
    // Carte inconnue : dessinée en 3D, estompée, sans image.
    const unknown = c.querySelector('[data-card="Inconnue"]')!;
    expect(unknown.getAttribute('data-missing')).toBe('true');
    expect(unknown.querySelector('[data-item3d="dvd"]')).not.toBeNull();
    expect(unknown.querySelector('image')).toBeNull();
  });

  it('les objets d’une étagère sont découpés à son ouverture projetée (¾ compris) ; de profil, aucun', () => {
    for (const angle of [0, 1, 7] as const) {
      const c = mount([shelf(angle), ...items]);
      const card = c.querySelector('[data-card="Daft_Punk"]')!;
      const g = card.closest('g[clip-path]')!;
      expect(g, `angle ${angle}`).not.toBeNull();
      const id = g.getAttribute('clip-path')!.match(/url\(#(.+)\)/)![1]!;
      const poly = pts(c.querySelector(`clipPath[id="${id}"] polygon`)!.getAttribute('points'));
      const rect = pxRect(rectOf(shelf(angle))!);
      const { w, h } = drawSize('shelf', angle);
      const want = openingOf(FURNITURE_MODELS.shelf, angle)!.map(([x, y]) => [rect.x + (x * rect.w) / (w * 30), rect.y + (y * rect.h) / (h * (510 / 18))]);
      poly.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(want[i]![0]!, 1);
        expect(y).toBeCloseTo(want[i]![1]!, 1);
      });
      // Tous les objets de l'étagère partagent la même découpe.
      expect(c.querySelector('[data-card="Dune"]')!.closest('g[clip-path]')).toBe(g);
    }
    expect(mount([shelf(2), ...items]).querySelector('[data-card]')).toBeNull();
  });

  it('zone touchable : la face avant de l’objet, là où on le voit', () => {
    const layout = [shelf(1), ...items];
    const c = mount(layout);
    const pl = storedPlacementsOf(layout, 's').get('a')!;
    const want = storedFrontQuad(1, pxRect(rectOf(shelf(1))!), pl);
    const hit = pts(c.querySelector('[data-card="Daft_Punk"] > polygon[fill="transparent"]')!.getAttribute('points'));
    hit.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(want[i]![0]!, 1);
      expect(y).toBeCloseTo(want[i]![1]!, 1);
    });
  });

  it('ordre de dessin : tablette du bas d’abord, puis du côté opposé au spectateur', () => {
    const order = (angle: 0 | 1 | 7) => [...mount([shelf(angle), ...items]).querySelectorAll('[data-card]')].map((e) => e.getAttribute('data-id'));
    expect(order(1)).toEqual(['u', 'a', 'b']);
    expect(order(7)).toEqual(['u', 'b', 'a']);
  });

  it('la copie soulevée d’un objet rangé n’est pas découpée par l’étagère', () => {
    const c = mount([shelf(), ...items], { drag: { id: 'a', x: 400, y: 400, ok: true, ghost: null } });
    const copy = c.querySelector('[data-lifted-copy]')!;
    expect(copy).not.toBeNull();
    expect(copy.closest('g[clip-path]')).toBeNull();
  });
});

describe('écran et petits objets en 3D', () => {
  const desk = (angle: 0 | 1 | 4 = 0) => ({ id: 'd', kind: 'desk', col: 2, row: 11, angle }) as const;
  const carried = (angle: 0 | 1 | 4 = 0): Layout => [desk(angle), { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Paris' }, { id: 'o', kind: 'small', item: 'plant', hostId: 'd', x: 7.5, z: 22.5 }, { id: 'l', kind: 'small', item: 'lamp', hostId: 'd', x: 97.5, z: 22.5, lit: true }];

  it('l’écran est un modèle 3D qui affiche la carte ; sa zone touchable dépasse au-dessus du bureau, comme lui', () => {
    const c = mount(carried(1));
    const pc = c.querySelector('[data-furniture="computer"]')!;
    expect(pc.querySelector('[data-item3d="monitor"] image')!.getAttribute('href')).toBe(IMG);
    const deskRect = pxRect(rectOf(desk(1))!);
    const want = placementRectPx('desk', 1, deskRect, computerPlacement('pc'));
    const hit = pc.querySelector(':scope > rect[fill="transparent"]')!;
    expect(Number(hit.getAttribute('y'))).toBeCloseTo(want.y, 1);
    expect(Number(hit.getAttribute('y'))).toBeLessThan(deskRect.y);
    expect(Number(hit.getAttribute('height'))).toBeCloseTo(want.h, 1);
    // La carte de l'écran se touche sur la vitre.
    const glass = pts(c.querySelector('[data-screen="pc"] > polygon[fill="transparent"]')!.getAttribute('points'));
    screenQuad(1, deskRect, computerPlacement('pc')).forEach(([x, y], i) => {
      expect(glass[i]![0]).toBeCloseTo(x, 1);
      expect(glass[i]![1]).toBeCloseTo(y, 1);
    });
  });

  it('de dos, l’écran est dessiné (sans image ni zone de carte) et passe devant les petits objets', () => {
    const c = mount(carried(4));
    expect(c.querySelector('[data-furniture="computer"] [data-item3d="monitor"]')).not.toBeNull();
    expect(c.querySelector('[data-furniture="computer"] image')).toBeNull();
    expect(c.querySelector('[data-screen]')).toBeNull();
    const order = [...c.querySelectorAll('[data-furniture="computer"], [data-furniture="small"]')].map((e) => e.getAttribute('data-id'));
    expect(order[order.length - 1]).toBe('pc');
    const front = [...mount(carried(0)).querySelectorAll('[data-furniture="computer"], [data-furniture="small"]')].map((e) => e.getAttribute('data-id'));
    expect(front[0]).toBe('pc');
  });

  it('petite plante et petite lampe en 3D ; la lampe allumée a son halo', () => {
    const c = mount(carried(0));
    expect(c.querySelector('[data-furniture="small"][data-id="o"] [data-item3d="small-plant"]')).not.toBeNull();
    expect(c.querySelector('[data-furniture="small"][data-id="l"] [data-item3d="small-lamp"] [data-lamp-halo]')).not.toBeNull();
  });
});

describe('cartes posées en 3D sur le plateau', () => {
  const layout = (): Layout => [
    { id: 'd', kind: 'desk', col: 2, row: 11, angle: 0 },
    { id: 'cd', kind: 'posed', shape: 'cd', hostId: 'd', x: 4, z: 4, slug: 'Daft_Punk' },
    { id: 'dv', kind: 'posed', shape: 'dvd', hostId: 'd', x: 60, z: 4, pose: 'flat', slug: 'Paris' },
  ];
  afterEach(() => setPlayerSource(null));

  it('un CD sur trépied et un DVD à plat sont dessinés, avec leur pochette', () => {
    const c = mount(layout());
    const cd = c.querySelector('[data-furniture="posed"][data-id="cd"]')!;
    expect(cd.querySelector('[data-item3d="cd"] image')!.getAttribute('href')).toBe(IMG);
    // Trépied : socle, rebord, béquille + boîtier ; à plat : un seul boîtier, couverture sur le dessus.
    const dvd = c.querySelector('[data-furniture="posed"][data-id="dv"]')!;
    expect(dvd.querySelector('[data-item3d="dvd"] image')!.getAttribute('href')).toBe(IMG);
    expect(dvd.querySelectorAll('[data-item3d="dvd"] polygon').length).toBeLessThan(cd.querySelectorAll('[data-item3d="cd"] polygon').length);
  });

  it('une carte posée jouée sur la chaîne disparaît de sa place pendant la lecture', () => {
    const withHifi: Layout = [...layout(), { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 100, z: 2 }];
    const view = { linked: true, hidden: false, enabled: true, card: { slug: 'Daft_Punk', title: 'Discovery' }, track: { uri: 'u', title: 'T', artist: 'A', imageUrl: null, playing: true } };
    setPlayerSource({ current: () => view, subscribe: () => () => undefined } as unknown as PlayerSource);
    const c = mount(withHifi);
    expect(c.querySelector('[data-furniture="posed"][data-id="cd"]')).toBeNull();
    expect(c.querySelector('[data-furniture="posed"][data-id="dv"]')).not.toBeNull();
    expect(c.querySelector('[data-hifi-sleeve="Daft_Punk"]')).not.toBeNull();
  });
});
