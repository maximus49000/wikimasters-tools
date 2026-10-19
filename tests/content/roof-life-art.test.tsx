// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { amb } from '../../src/content/ghibli-window-art';
import { DARK_ALPHA, DARK_VEIL } from '../../src/content/window-life-art';
import { Cat, Pigeon, Roofer, Smoke } from '../../src/content/roof-life-art';

// Dessins des toits vivants (chantier « vie au-dessus de la rue ») : chat, pigeon, fumée, couvreur à nœuds constants par pose
// (seuls transform / opacity / un `d` précalculé changent avec la phase), deux sens tracés chacun, ambiance de nuit portée
// par chaque dessin (chat : variante `night` ; pigeon et couvreur : voile `dark`).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const render = (el: ReactElement) => act(() => root.render(<svg>{el}</svg>));
const svg = () => container.querySelector('svg')!;
const all = () => [...svg().querySelectorAll('*')];
// Empreinte d'un rendu hors transform / opacity / d : balise et attributs restants, dans l'ordre du document.
const VARIABLE = new Set(['transform', 'opacity', 'd']);
const shape = () => all().map((el) => `${el.tagName}|${[...el.attributes].filter((a) => !VARIABLE.has(a.name)).map((a) => `${a.name}=${a.value}`).sort().join(' ')}`);
const html = () => svg().innerHTML;
const veils = () => [...svg().querySelectorAll('[data-dark-veil]')];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('chat des toits', () => {
  it('nœuds constants quelle que soit la phase, pour chaque pose et chaque sens', () => {
    for (const pose of ['emerge', 'walk', 'sit'] as const) {
      for (const dir of [1, -1] as const) {
        const shapes = [0, 0.37, 1.9, 7.3].map((phase) => {
          render(<Cat pose={pose} phase={phase} night={false} dir={dir} />);
          return shape();
        });
        expect(shapes[0]!.length).toBeGreaterThan(4);
        for (const s of shapes) expect(s).toEqual(shapes[0]);
      }
    }
  });

  it('deux sens : même nombre de nœuds, dessin différent (tracé propre au sens, pas d’image retournée)', () => {
    render(<Cat pose="walk" phase={0.5} night={false} dir={1} />);
    const right = html();
    const n = all().length;
    render(<Cat pose="walk" phase={0.5} night={false} dir={-1} />);
    expect(all().length).toBe(n);
    expect(html()).not.toBe(right);
    expect(svg().querySelector('image')).toBeNull();
  });

  it('nuit : pelage amb(#4A3E48), yeux #C8FF8A visibles ; jour : pelage #8A6A4A, yeux transparents', () => {
    render(<Cat pose="sit" phase={0} night={true} dir={1} />);
    expect(html()).toContain(amb('#4A3E48'));
    const eyes = [...svg().querySelectorAll('[data-cat-eye]')];
    expect(eyes.length).toBeGreaterThan(0);
    for (const e of eyes) {
      expect(e.getAttribute('fill')).toBe('#C8FF8A');
      expect(Number(e.getAttribute('opacity') ?? '1')).toBe(1);
    }
    const night = shape();
    render(<Cat pose="sit" phase={0} night={false} dir={1} />);
    expect(html()).toContain('#8A6A4A');
    expect(shape().length).toBe(night.length);
    for (const e of svg().querySelectorAll('[data-cat-eye]')) expect(Number(e.getAttribute('opacity'))).toBe(0);
  });

  it('emerge : le chat monte avec la phase (translation seule), découpé par une fenêtre SVG sans clip-path', () => {
    render(<Cat pose="emerge" phase={0} night={false} dir={1} />);
    const start = html();
    render(<Cat pose="emerge" phase={1} night={false} dir={1} />);
    expect(html()).not.toBe(start);
    expect(svg().querySelector('[clip-path], clipPath')).toBeNull();
    expect(html()).not.toContain('clip-path');
    const win = svg().querySelector('svg svg');
    expect(win).not.toBeNull();
    expect(win!.getAttribute('overflow')).toBe('hidden');
  });

  it('emerge : à l’avancement 0, tout le chat est sous la ligne de coupe de la fenêtre (rien ne dépasse de la tabatière)', () => {
    // Oreilles à −3,9, bout de la queue à −4,2 moins un demi-trait (0,35) : il faut remonter de plus de 4,55 pour passer sous la
    // coupe à +0,3 ; à l'avancement 1, le chat est à sa place (translation nulle).
    const rise = (): number => Number(/translate\(0 (-?[\d.]+)\)/.exec(svg().querySelector('[data-roof-cat-window] > g')!.getAttribute('transform')!)![1]);
    render(<Cat pose="emerge" phase={0} night={false} dir={1} />);
    expect(rise()).toBeGreaterThanOrEqual(4.55 + 0.3);
    const win = svg().querySelector('[data-roof-cat-window]')!;
    expect(Number(win.getAttribute('y')) + Number(win.getAttribute('height'))).toBeCloseTo(0.3, 5);
    render(<Cat pose="emerge" phase={1} night={false} dir={1} />);
    expect(rise()).toBe(0);
  });

  it('sit : la queue bouge avec la phase (d), le reste ne change pas', () => {
    render(<Cat pose="sit" phase={0} night={false} dir={-1} />);
    const a = html();
    const tail0 = svg().querySelector('[data-cat-tail]')!.getAttribute('d');
    render(<Cat pose="sit" phase={2} night={false} dir={-1} />);
    expect(html()).not.toBe(a);
    expect(svg().querySelector('[data-cat-tail]')!.getAttribute('d')).not.toBe(tail0);
  });
});

describe('pigeon', () => {
  it('nœuds constants par pose quelle que soit la phase, dans les deux sens', () => {
    for (const pose of ['perch', 'peck', 'fly'] as const) {
      for (const dir of [1, -1] as const) {
        const shapes = [0, 0.4, 1.7, 5.2].map((phase) => {
          render(<Pigeon pose={pose} phase={phase} dir={dir} />);
          return shape();
        });
        expect(shapes[0]!.length).toBeGreaterThan(2);
        for (const s of shapes) expect(s).toEqual(shapes[0]);
      }
    }
  });

  it('fly : les ailes battent (d change), le corps reste', () => {
    render(<Pigeon pose="fly" phase={0} dir={1} />);
    const w0 = svg().querySelector('[data-pigeon-wings]')!.getAttribute('d');
    const h0 = html();
    render(<Pigeon pose="fly" phase={Math.PI / 2} dir={1} />);
    expect(svg().querySelector('[data-pigeon-wings]')!.getAttribute('d')).not.toBe(w0);
    expect(html().replace(/ d="[^"]*"/g, '')).toBe(h0.replace(/ d="[^"]*"/g, ''));
  });

  it('profil lisible : corps d’au moins 3,5 px de long, tête dans son groupe, pattes, bec vers `dir` ; la tête seule bouge', () => {
    // Posé : la tête pointe par instants (sin(phase) > 0,8) ; picore : la tête plonge. Le corps (chemins hors du groupe de la
    // tête) ne change pas, dans les deux sens.
    for (const dir of [1, -1] as const) {
      render(<Pigeon pose="perch" phase={0} dir={dir} />);
      expect(svg().querySelector('[data-pigeon-legs]')).not.toBeNull();
      const head = svg().querySelector('[data-pigeon-head]')!;
      expect(head.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
      const bodyOf = () => [...svg().querySelectorAll('[data-roof-pigeon] > path')].map((p) => p.getAttribute('d')).join('|');
      const body0 = bodyOf();
      const xs = body0.match(/-?\d+(\.\d+)?(?= -?\d)/g)!.map(Number);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(3.5);
      const headX = /M(-?[\d.]+)/.exec(head.querySelector('path')!.getAttribute('d')!)![1];
      expect(Math.sign(Number(headX))).toBe(dir);
      const t0 = head.getAttribute('transform');
      render(<Pigeon pose="perch" phase={Math.PI / 2} dir={dir} />);
      expect(head.getAttribute('transform')).not.toBe(t0);
      expect(bodyOf()).toBe(body0);
      render(<Pigeon pose="peck" phase={Math.PI / 12} dir={dir} />);
      expect(svg().querySelector('[data-pigeon-head]')!.getAttribute('transform')).not.toBe(t0);
      expect(bodyOf()).toBe(body0);
    }
  });

  it('dark : voiles #1E2A5A sur le plumage (corps, tête, ailes) à 0,64 × dark, même nombre de nœuds', () => {
    render(<Pigeon pose="perch" phase={0} dir={1} />);
    const n = all().length;
    const v0 = veils();
    expect(v0.length).toBeGreaterThan(0);
    for (const v of v0) expect(Number(v.getAttribute('opacity'))).toBe(0);
    render(<Pigeon pose="perch" phase={0} dir={1} dark={1} />);
    expect(all().length).toBe(n);
    for (const v of veils()) {
      expect(v.getAttribute('fill')).toBe(DARK_VEIL);
      expect(Number(v.getAttribute('opacity'))).toBeCloseTo(DARK_ALPHA, 5);
    }
    render(<Pigeon pose="peck" phase={0} dir={-1} dark={0.5} />);
    for (const v of veils()) expect(Number(v.getAttribute('opacity'))).toBeCloseTo(DARK_ALPHA * 0.5, 5);
    render(<Pigeon pose="fly" phase={1} dir={1} dark={1} />);
    expect(veils().length).toBeGreaterThanOrEqual(2);
    for (const v of veils()) expect(Number(v.getAttribute('opacity'))).toBeCloseTo(DARK_ALPHA, 5);
  });
});

describe('fumée de cheminée', () => {
  it('six bouffées à nœuds constants ; la phase et le vent ne changent que transform / opacity', () => {
    render(<Smoke phase={0} night={false} wind={0} />);
    const puffs = svg().querySelectorAll('[data-puff]');
    expect(puffs.length).toBe(6);
    const base = shape();
    const h0 = html();
    for (const [phase, wind] of [[3.3, 0], [0, 1], [9.9, 1]] as const) {
      render(<Smoke phase={phase} night={false} wind={wind} />);
      expect(shape()).toEqual(base);
      expect(html()).not.toBe(h0);
    }
  });

  it('couleurs : rgb(235,235,242) le jour, rgb(200,205,225) la nuit ; opacité qui décroît avec l’âge', () => {
    render(<Smoke phase={0} night={false} wind={1} />);
    expect(html()).toContain('235,235,242');
    render(<Smoke phase={0} night={true} wind={1} />);
    expect(html()).toContain('200,205,225');
    expect(html()).not.toContain('235,235,242');
    const ops = [...svg().querySelectorAll('[data-puff]')].map((p) => Number(p.getAttribute('opacity')));
    for (const o of ops) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('couvreur', () => {
  it('kneel : nœuds constants entre le marteau levé et le coup, dans les deux sens', () => {
    for (const dir of [1, -1] as const) {
      const shapes = [0, 0.31, 1.1, 2.6].map((phase) => {
        render(<Roofer pose="kneel" phase={phase} dir={dir} />);
        return shape();
      });
      expect(shapes[0]!.length).toBeGreaterThan(8);
      for (const s of shapes) expect(s).toEqual(shapes[0]);
    }
  });

  it('kneel : le marteau frappe (d du marteau change avec la phase)', () => {
    const ds = [0, 0.31].map((phase) => {
      render(<Roofer pose="kneel" phase={phase} dir={1} />);
      return svg().querySelector('[data-hammer]')!.getAttribute('d');
    });
    expect(ds[0]).not.toBe(ds[1]);
  });

  it('walk : nœuds constants sur un cycle de marche, dessin différent selon le sens, aucune image', () => {
    const shapes = [0, 0.15, 0.3, 0.45, 0.6, 0.75].map((phase) => {
      render(<Roofer pose="walk" phase={phase} dir={1} />);
      return shape();
    });
    for (const s of shapes) expect(s).toEqual(shapes[0]);
    const right = html();
    render(<Roofer pose="walk" phase={0} dir={-1} />);
    expect(shape().length).toBe(shapes[0]!.length);
    expect(html()).not.toBe(right);
    expect(svg().querySelector('image')).toBeNull();
  });

  it('dark : voile #1E2A5A à 0,64 × dark sur le pantin, 0 par défaut, même nombre de nœuds', () => {
    render(<Roofer pose="kneel" phase={0} dir={1} />);
    const n = all().length;
    expect(veils().length).toBeGreaterThan(0);
    for (const v of veils()) expect(Number(v.getAttribute('opacity'))).toBe(0);
    render(<Roofer pose="kneel" phase={0} dir={1} dark={1} />);
    expect(all().length).toBe(n);
    for (const v of veils()) {
      expect(v.getAttribute('fill')).toBe(DARK_VEIL);
      expect(Number(v.getAttribute('opacity'))).toBeCloseTo(DARK_ALPHA, 5);
    }
  });
});
