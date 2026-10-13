// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CarriedItem3D, Item3DArt, Model3DArt } from '../../src/content/model3d-art';
import { computerPlacement, placementRectPx } from '../../src/core/library/carried-items';
import { drawSize } from '../../src/core/library/footprint';
import { FURNITURE_MODELS } from '../../src/core/library/furniture-models';
import { openingOf } from '../../src/core/library/furniture-render3d';
import { paletteOf } from '../../src/core/library/styles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function draw(el: ReactElement) {
  const c = document.createElement('div');
  document.body.append(c);
  act(() => { createRoot(c).render(<svg>{el}</svg>); });
  return c;
}
const pal = paletteOf('scandinave');
const rect = { x: 0, y: 0, w: 30, h: 30 };
const URL = 'data:image/png;base64,AAAA';

describe('Item3DArt', () => {
  it('un CD de face : l’image de la carte est posée sur la couverture par une matrice', () => {
    const c = draw(<Item3DArt shape="cd" display="cover" angle={0} rect={rect} palette={pal} content={{ url: URL, title: 'Kiki' }} />);
    const img = c.querySelector('[data-item3d] image')!;
    expect(img.getAttribute('href')).toBe(URL);
    expect(img.closest('[transform^="matrix("]')).not.toBeNull();
  });
  it('un livre sur la tranche : le titre est écrit le long de la tranche', () => {
    const c = draw(<Item3DArt shape="book" display="spine" angle={0} rect={rect} palette={pal} content={{ url: URL, title: 'Paris' }} />);
    expect(c.querySelector('[data-item3d] text')!.textContent).toBe('Paris');
    expect(c.querySelector('[data-item3d] image')).toBeNull(); // couverture cachée de face
  });
  it('sans image : couverture de remplacement avec le titre', () => {
    const c = draw(<Item3DArt shape="dvd" display="cover" angle={0} rect={rect} palette={pal} content={{ title: 'Totoro' }} />);
    expect(c.querySelector('[data-item3d] image')).toBeNull();
    expect([...c.querySelectorAll('[data-item3d] text')].map((t) => t.textContent)).toContain('Totoro');
  });
  it('le jeu garde son bandeau rouge en haut de la couverture', () => {
    const c = draw(<Item3DArt shape="game" display="cover" angle={0} rect={rect} palette={pal} content={{ url: URL, title: 'Zelda' }} />);
    expect(c.querySelector('[data-item3d] [fill="#E24B4A"]')).not.toBeNull();
  });
  it('petite lampe : allumée, halo et abat-jour clair ; éteinte, ni l’un ni l’autre', () => {
    const on = draw(<Item3DArt shape="small-lamp" angle={1} rect={rect} palette={pal} content={{ lit: true }} />);
    const off = draw(<Item3DArt shape="small-lamp" angle={1} rect={rect} palette={pal} content={{ lit: false }} />);
    expect(on.querySelector('[data-lamp-halo]')).not.toBeNull();
    expect(off.querySelector('[data-lamp-halo]')).toBeNull();
    expect(on.innerHTML).not.toBe(off.innerHTML);
  });
  it('l’écran affiche l’image de la carte de face, pas de dos', () => {
    const front = draw(<Item3DArt shape="monitor" angle={0} rect={{ x: 0, y: 0, w: 90, h: 57 }} palette={pal} content={{ url: URL }} />);
    const back = draw(<Item3DArt shape="monitor" angle={4} rect={{ x: 0, y: 0, w: 90, h: 57 }} palette={pal} content={{ url: URL }} />);
    expect(front.querySelector('image')).not.toBeNull();
    expect(back.querySelector('image')).toBeNull();
  });
});

describe('Model3DArt garni', () => {
  it('l’étagère dessine ses objets rangés : une image par couverture visible, un titre par tranche', () => {
    const items = [
      { key: 'a', shape: 'cd' as const, display: 'cover' as const, x: 5, y: 61, z: 27 },
      { key: 'b', shape: 'book' as const, display: 'spine' as const, x: 5, y: 8, z: 1 },
    ];
    const c = draw(<Model3DArt kind="shelf" angle={0} rect={{ x: 0, y: 0, w: 120, h: 270 }} palette={pal} items={items} content={{ a: { url: URL, title: 'Kiki' }, b: { url: URL, title: 'Paris' } }} />);
    expect(c.querySelectorAll('[data-model3d] image')).toHaveLength(1);
    expect([...c.querySelectorAll('[data-model3d] text')].map((t) => t.textContent)).toContain('Paris');
  });
  it('de ¾ (1 et 7), chaque forme d’objet rangé est découpée à l’ouverture projetée de l’étagère ; de profil, rien ne se voit', () => {
    const items = [
      { key: 'a', shape: 'cd' as const, display: 'cover' as const, x: 63, y: 121, z: 27 },
      { key: 'b', shape: 'book' as const, display: 'spine' as const, x: 4, y: 8, z: 2 },
      { key: 'c', shape: 'book' as const, display: 'spine' as const, x: 73, y: 8, z: 2 },
    ];
    const content = { a: { url: URL, title: 'Kiki' }, b: { url: URL, title: 'Paris' }, c: { url: URL, title: 'Dune' } };
    for (const angle of [1, 7] as const) {
      const c = draw(<Model3DArt kind="shelf" angle={angle} rect={{ x: 0, y: 0, w: 120, h: 270 }} palette={pal} items={items} content={content} />);
      const clipped = [...c.querySelectorAll('[data-model3d] g[clip-path]')];
      expect(clipped.length, `angle ${angle}`).toBeGreaterThan(0);
      for (const g of clipped) {
        const id = g.getAttribute('clip-path')!.match(/url\(#(.+)\)/)![1]!;
        const poly = c.querySelector(`clipPath[id="${id}"] polygon`)!;
        const opening = openingOf(FURNITURE_MODELS.shelf, angle)!.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ');
        expect(poly.getAttribute('points')).toBe(opening);
      }
      // Toutes les images et tous les titres des objets sont dans une découpe.
      for (const el of c.querySelectorAll('[data-model3d] image, [data-model3d] text')) expect(el.closest('g[clip-path]'), `angle ${angle}`).not.toBeNull();
      expect(c.querySelectorAll('[data-model3d] g[clip-path] polygon').length).toBeGreaterThan(10);
    }
    const side = draw(<Model3DArt kind="shelf" angle={2} rect={{ x: 0, y: 0, w: 60, h: 270 }} palette={pal} items={items} content={content} />);
    expect(side.querySelector('[data-model3d] image')).toBeNull();
    expect(side.querySelector('[data-model3d] text')).toBeNull();
  });
});

describe('CarriedItem3D', () => {
  // Points de tous les polygones de l'objet, ramenés en px de la pièce (translate · scale · translate du groupe).
  function screenBox(c: HTMLElement): { x0: number; x1: number; y0: number; y1: number } {
    const g = c.querySelector('[data-item3d]')!;
    const [a, b, sx, sy, e, f] = g.getAttribute('transform')!.match(/-?[\d.]+/g)!.map(Number) as [number, number, number, number, number, number];
    const pts = [...g.querySelectorAll('polygon')].filter((p) => !p.closest('[transform^="matrix("]')).flatMap((p) => p.getAttribute('points')!.split(' ').map((q) => q.split(',').map(Number) as [number, number]));
    const xs = pts.map(([x]) => a + sx * (x + e));
    const ys = pts.map(([, y]) => b + sy * (y + f));
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  it('un objet rangé est dessiné à sa place dans le repère de l’étagère tournée (même encombrement que sa pose 3D)', () => {
    for (const angle of [0, 1, 7] as const) {
      const rect = { x: 60, y: 30, w: drawSize('shelf', angle).w * 30, h: drawSize('shelf', angle).h * (510 / 18) };
      for (const display of ['cover', 'spine'] as const) {
        const pl = { key: 'a', shape: 'cd' as const, display, x: 40, y: 61, z: 2 };
        const c = draw(<CarriedItem3D host="shelf" angle={angle} rect={rect} placement={pl} palette={pal} content={{ url: URL, title: 'Kiki' }} />);
        const box = screenBox(c);
        const want = placementRectPx('shelf', angle, rect, pl);
        expect(box.x0, `${angle} ${display}`).toBeCloseTo(want.x, 0);
        expect(box.x1).toBeCloseTo(want.x + want.w, 0);
        expect(box.y0).toBeCloseTo(want.y, 0);
        expect(box.y1).toBeCloseTo(want.y + want.h, 0);
      }
    }
  });
  it('l’écran d’une pièce Steampunk est la machine analytique ; de face, il affiche l’image de la carte', () => {
    const rect = { x: 0, y: 300, w: drawSize('desk', 0).w * 30, h: drawSize('desk', 0).h * (510 / 18) };
    const steam = draw(<CarriedItem3D host="desk" angle={0} rect={rect} placement={computerPlacement('pc')} palette={pal} steampunk content={{ url: URL }} />);
    expect(steam.querySelector('[data-steampunk-art="analytical-engine"] image')!.getAttribute('href')).toBe(URL);
    const plain = draw(<CarriedItem3D host="desk" angle={0} rect={rect} placement={computerPlacement('pc')} palette={pal} content={{ url: URL }} />);
    expect(plain.querySelector('[data-steampunk-art]')).toBeNull();
    expect(plain.querySelector('[data-item3d="monitor"] image')).not.toBeNull();
  });
  it('deux livres de couleurs différentes : même géométrie, dos à la couleur de chacun (couleur posée au dessin)', () => {
    const rect = { x: 0, y: 0, w: drawSize('shelf', 1).w * 30, h: drawSize('shelf', 1).h * (510 / 18) };
    const pl = { key: 'a', shape: 'book' as const, display: 'spine' as const, x: 10, y: 8, z: 2 };
    const red = draw(<CarriedItem3D host="shelf" angle={1} rect={rect} placement={{ ...pl, color: '#AA2222' }} palette={pal} />);
    const blue = draw(<CarriedItem3D host="shelf" angle={1} rect={rect} placement={{ ...pl, color: '#2222AA' }} palette={pal} />);
    const pts = (c: HTMLElement) => [...c.querySelectorAll('polygon')].map((e) => e.getAttribute('points'));
    const fills = (c: HTMLElement) => [...c.querySelectorAll('polygon')].map((e) => e.getAttribute('fill'));
    expect(pts(red)).toEqual(pts(blue));
    // Le dos (ombré selon la face) prend la couleur de chaque livre : rouge d'un côté, bleu de l'autre.
    const hue = (f: string | null) => (f && /^#[0-9a-f]{6}$/.test(f) ? [parseInt(f.slice(1, 3), 16), parseInt(f.slice(5, 7), 16)] : [0, 0]);
    expect(fills(red).some((f) => hue(f)[0]! > hue(f)[1]! + 60)).toBe(true);
    expect(fills(blue).some((f) => hue(f)[1]! > hue(f)[0]! + 60)).toBe(true);
    expect(fills(red)).not.toEqual(fills(blue));
  });
});
