// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Item3DArt, Model3DArt, itemsKey } from '../../src/content/model3d-art';
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
  it.each(['paper-lantern', 'arc-lamp'] as const)('%s : l’abat-jour s’allume comme celui du lampadaire', (kind) => {
    const on = draw(<Model3DArt kind={kind} angle={0} rect={rect} palette={paletteOf('scandinave')} lit />).innerHTML;
    const off = draw(<Model3DArt kind={kind} angle={0} rect={rect} palette={paletteOf('scandinave')} lit={false} />).innerHTML;
    expect(on.toUpperCase()).toContain('#FFE9A8');
    expect(off.toUpperCase()).not.toContain('#FFE9A8');
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
});

describe('clé de dessin des objets posés : le format de boîte compte', () => {
  const pl = { key: 'g', shape: 'game' as const, display: 'cover' as const, x: 1, y: 2, z: 3 };
  it('deux placements identiques sauf box ont des clés différentes', () => {
    expect(itemsKey([pl])).not.toBe(itemsKey([{ ...pl, box: 'switch' }]));
    expect(itemsKey([{ ...pl, box: 'ds' }])).not.toBe(itemsKey([{ ...pl, box: 'switch' }]));
  });
  it('un objet seul change de dessin avec son format de boîte', () => {
    const pal = paletteOf('scandinave');
    const a = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} />).innerHTML;
    const b = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} box="switch" />).innerHTML;
    expect(a).not.toBe(b);
  });
});
