// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ComputerBackArt, Model3DArt } from '../../src/content/model3d-art';
import { paletteOf } from '../../src/core/library/styles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function draw(el: ReactElement) {
  const c = document.createElement('div');
  document.body.append(c);
  act(() => { createRoot(c).render(<svg>{el}</svg>); });
  return c;
}
const rect = { x: 0, y: 0, w: 120, h: 255 };

describe('Model3DArt', () => {
  it('dessine des polygones encrés pour chaque angle', () => {
    for (const angle of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const c = draw(<Model3DArt kind="chair" angle={angle} rect={rect} palette={paletteOf('scandinave')} />);
      expect(c.querySelectorAll('[data-model3d] polygon').length).toBeGreaterThan(3);
    }
  });
  it('l’abat-jour de la lampe change avec lit, à tous les angles', () => {
    for (const angle of [0, 3, 6] as const) {
      const on = draw(<Model3DArt kind="lamp" angle={angle} rect={rect} palette={paletteOf('scandinave')} lit />).innerHTML;
      const off = draw(<Model3DArt kind="lamp" angle={angle} rect={rect} palette={paletteOf('scandinave')} lit={false} />).innerHTML;
      expect(on).not.toBe(off);
    }
  });
  it('les garnitures Steampunk n’apparaissent que dans une pièce Steampunk', () => {
    const plain = draw(<Model3DArt kind="desk" angle={0} rect={rect} palette={paletteOf('steampunk')} />);
    const steam = draw(<Model3DArt kind="desk" angle={0} rect={rect} palette={paletteOf('steampunk')} steampunk />);
    expect(steam.querySelectorAll('polygon').length).toBeGreaterThan(plain.querySelectorAll('polygon').length);
  });
  it('les traits fins (parallèles du globe) sont des lignes sans remplissage', () => {
    const c = draw(<Model3DArt kind="globe" angle={0} rect={rect} palette={paletteOf('steampunk')} />);
    const lines = c.querySelectorAll('[data-model3d] polyline');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.getAttribute('fill')).toBe('none');
  });
  it('coordonnées arrondies au dixième (attributs courts)', () => {
    const c = draw(<Model3DArt kind="armchair" angle={1} rect={rect} palette={paletteOf('steampunk')} steampunk />);
    const nums = [...c.querySelectorAll('[data-model3d] polygon, [data-model3d] polyline')].flatMap((el) => el.getAttribute('points')!.split(/[ ,]/));
    nums.push(...[...c.querySelectorAll('[data-model3d] ellipse')].flatMap((el) => ['cx', 'cy', 'rx', 'ry'].map((a) => el.getAttribute(a)!)));
    expect(nums.length).toBeGreaterThan(10);
    for (const n of nums) expect(n).toMatch(/^-?\d+(\.\d)?$/);
  });
  it('la lampe allumée a un halo qui ne capte pas le pointeur ; éteinte, pas de halo', () => {
    const on = draw(<Model3DArt kind="lamp" angle={2} rect={rect} palette={paletteOf('scandinave')} lit />);
    expect(on.querySelector('[data-lamp-halo]')!.getAttribute('pointer-events')).toBe('none');
    expect(draw(<Model3DArt kind="lamp" angle={2} rect={rect} palette={paletteOf('scandinave')} lit={false} />).querySelector('[data-lamp-halo]')).toBeNull();
  });
  it('écran vu de dos : gris, sans image', () => {
    const c = draw(<ComputerBackArt rect={{ x: 0, y: 0, w: 84, h: 56 }} side={false} />);
    expect(c.querySelector('[data-computer-back]')).not.toBeNull();
    expect(c.querySelector('image')).toBeNull();
  });
});
