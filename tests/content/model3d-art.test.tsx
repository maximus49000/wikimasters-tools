// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CarriedItem3D, Item3DArt, Model3DArt, itemsKey } from '../../src/content/model3d-art';
import { drawSize } from '../../src/core/library/footprint';
import { CELL_H, CELL_W, PLUNGE_CAMERA } from '../../src/core/library/furniture-render3d';
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

describe('boîte de jeu : dos et bandeau de console', () => {
  const pal = paletteOf('scandinave');
  const hrefs = (c: HTMLElement) => [...c.querySelectorAll('image')].map((i) => i.getAttribute('href'));
  it('de dos, le décalque `back` dessine l’image du dos (pas la couverture)', () => {
    const c = draw(<Item3DArt shape="game" display="back" angle={0} rect={rect} palette={pal} box="bluray" content={{ url: 'face.png', backUrl: 'dos.png', title: 'Hollow Knight' }} />);
    expect(hrefs(c)).toContain('dos.png');
    expect(c.querySelector('[data-decal-back]')).not.toBeNull();
  });
  it('sans image du dos : aplat de la couleur du boîtier et titre', () => {
    const c = draw(<Item3DArt shape="game" display="back" angle={0} rect={rect} palette={pal} box="switch" color="#E60012" content={{ url: 'face.png', title: 'Zelda' }} />);
    const back = c.querySelector('[data-decal-back]')!;
    expect(back.querySelector('image')).toBeNull();
    expect(back.querySelector('rect')!.getAttribute('fill')!.toUpperCase()).toBe('#E60012');
    expect(back.textContent).toContain('Zelda');
  });
  it('sans scan du dos mais boîte connue : le dos fabriqué', () => {
    const made = { key: 'k', draw: (w: number, h: number) => <rect data-test-made={`${w}x${h}`} width={w} height={h} /> };
    const c = draw(<Item3DArt shape="game" display="back" angle={0} rect={rect} palette={pal} box="switch" content={{ url: 'face.png', title: 'Zelda', back: made }} />);
    const back = c.querySelector('[data-decal-back]')!;
    expect(back.querySelector('[data-test-made]')).not.toBeNull();
    expect(back.textContent).not.toContain('Zelda');
  });
  it('bandeau de la console (couleur, nom) au lieu du rouge unique ; sans bandeau connu : aucun', () => {
    const ps4 = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} box="bluray" content={{ url: 'face.png', title: 'RDR2', band: { color: '#1F4C9E', label: 'PS4' } }} />);
    expect(ps4.innerHTML.toUpperCase()).toContain('#1F4C9E');
    expect(ps4.innerHTML.toUpperCase()).not.toContain('#E24B4A');
    expect(ps4.textContent).toContain('PS4');
    const ps2 = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} box="dvd" content={{ url: 'face.png', title: 'GTA', band: null }} />);
    expect(ps2.innerHTML.toUpperCase()).not.toContain('#E24B4A');
    const unknown = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} content={{ url: 'face.png', title: 'GTA' }} />);
    expect(unknown.innerHTML.toUpperCase()).toContain('#E24B4A');
  });
  it('jaquette scannée (TheGamesDB) : son bandeau imprimé suffit, pas de second bandeau sur la couverture ; sans image, le bandeau revient', () => {
    const band = { color: '#1F4C9E', label: 'PS4' };
    const scan = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} box="bluray" content={{ url: 'face.png', title: 'RDR2', band, printed: true }} />);
    expect(scan.textContent).not.toContain('PS4');
    const none = draw(<Item3DArt shape="game" angle={0} rect={rect} palette={pal} box="bluray" content={{ title: 'RDR2', band, printed: true }} />);
    expect(none.textContent).toContain('PS4');
  });
});

describe('boîtier blanc (PS5, Wii, DS)', () => {
  const pal = paletteOf('scandinave');
  const PS5 = { color: '#FFFFFF', label: 'PS5' };
  it('titre de la tranche foncé sur un boîtier blanc ; bandeau blanc cerné d’un trait', () => {
    // Sur la tranche, de face : la tranche (et son titre) est vers l'avant.
    const c = draw(<Item3DArt shape="game" display="spine" angle={0} rect={rect} palette={pal} box="bluray" color="#F2F2F0" content={{ title: 'Astro Bot', band: PS5 }} />);
    const title = [...c.querySelectorAll('text')].find((t) => t.textContent?.includes('Astro'))!;
    expect(title.getAttribute('fill')).toBe('#1B1B1F');
    const band = [...c.querySelectorAll('rect')].find((r) => r.getAttribute('fill')?.toUpperCase() === '#FFFFFF')!;
    expect(band.getAttribute('stroke')).toBe('#1B1B1F');
  });
  it('boîtier foncé : titre blanc, bandeau sans trait', () => {
    const c = draw(<Item3DArt shape="game" display="spine" angle={0} rect={rect} palette={pal} box="bluray" color="#1F4C9E" content={{ title: 'RDR2', band: { color: '#1F4C9E', label: 'PS4' } }} />);
    const title = [...c.querySelectorAll('text')].find((t) => t.textContent?.includes('RDR2'))!;
    expect(title.getAttribute('fill')).toBe('#FFFFFF');
    const band = [...c.querySelectorAll('rect')].find((r) => r.getAttribute('fill')?.toUpperCase() === '#1F4C9E')!;
    expect(band.getAttribute('stroke')).toBeNull();
  });
});

describe('objet porté sous une caméra plongeante', () => {
  it('se dessine sur le dessus du bureau projeté : comme le même objet dessiné dans le meuble', () => {
    const palette = paletteOf('scandinave');
    const pl = { key: 'm', shape: 'monitor', x: 10, y: 75, z: 10 } as const;
    const { w, h } = drawSize('desk', 0, PLUNGE_CAMERA);
    const r = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
    const polys = (c: HTMLElement) => [...c.querySelectorAll('polygon')].map((e) => e.getAttribute('points')!);
    const host = new Set(polys(draw(<Model3DArt kind="desk" angle={0} rect={r} palette={palette} camera={PLUNGE_CAMERA} />)));
    const inHost = polys(draw(<Model3DArt kind="desk" angle={0} rect={r} palette={palette} camera={PLUNGE_CAMERA} items={[pl]} />)).filter((q) => !host.has(q));
    const alone = draw(<svg><CarriedItem3D host="desk" angle={0} rect={r} placement={pl} palette={palette} camera={PLUNGE_CAMERA} /></svg>);
    const g = alone.querySelector('[data-item3d]')!;
    const [tx, ty] = g.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)$/)!.slice(1).map(Number) as [number, number];
    const box = (list: string[], dx: number, dy: number) => {
      const xy = list.flatMap((q) => q.trim().split(/\s+/).map((v) => v.split(',').map(Number) as [number, number]));
      return [Math.min(...xy.map((v) => v[0])) + dx, Math.min(...xy.map((v) => v[1])) + dy, Math.max(...xy.map((v) => v[0])) + dx, Math.max(...xy.map((v) => v[1])) + dy];
    };
    expect(inHost.length).toBeGreaterThan(0);
    const mine = box(polys(alone), tx, ty);
    box(inHost, 0, 0).forEach((v, i) => expect(mine[i]).toBeCloseTo(v, 0));
    // Et ce n'est pas la même place que sous la caméra de face.
    const face = draw(<svg><CarriedItem3D host="desk" angle={0} rect={{ x: 0, y: 0, w: drawSize('desk', 0).w * CELL_W, h: drawSize('desk', 0).h * CELL_H }} placement={pl} palette={palette} /></svg>);
    expect(face.querySelector('[data-item3d]')!.getAttribute('transform')).not.toBe(g.getAttribute('transform'));
  });
});
