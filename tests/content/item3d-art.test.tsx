// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Item3DArt, Model3DArt } from '../../src/content/model3d-art';
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
});
