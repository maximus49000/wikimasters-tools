// @vitest-environment jsdom
// tests/content/figure/figure-host-3d.test.tsx
// Branchement des habitants 3D dans le registre des figures : repli pantin, attente 3D, budget, accroches, interrupteur.
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { BLANK_SPRITE, FigureContext, FigureRegistry, figureAnchors, paletteKey, spriteKey, type Citizen3D, type SpriteAnchors } from '../../../src/content/figure/figure-host';
import { GhibliFigure, citizenLight, figureHeadTop, figurePalette, hideFigure, poseFigure, rainOutfit, type Held, type PoseIn } from '../../../src/content/figure/ghibli-figure';
import { CitizenRenderer } from '../../../src/content/citizens/citizen-renderer';
import { RENDER_BUDGET_MS, WAIT3D_FALLBACK_MS } from '../../../src/content/figure/citizen-config';
import { keyString, type FigureKey } from '../../../src/core/library/figure/bake';
import { PHASES } from '../../../src/core/library/figure/skeleton';
import { shapeOf, signatureOf } from '../../../src/core/library/figure/dress';
import { skyAt, sunTimes, type Sky } from '../../../src/core/library/sky';
import { hashString } from '../../../src/core/library/scene-world';
import type { CitizenDesc } from '../../../src/core/citizens/catalogue';
import type { Outfit, Top } from '../../../src/core/library/city/people';
import { tone } from '../../../src/content/city-sprites';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sun = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const sky = skyAt(12 * 60, sun);
const o: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'jeans', bottomColor: '#243044', accessory: 'none', accessoryColor: '#5A6B7A' };
const OUTFITS: Outfit[] = [
  o,
  { skin: '#8A5A3B', hair: 'long', hairColor: '#111111', hatColor: '#3B6FD6', top: 'coat', topColor: '#2E8B6A', bottom: 'skirt', bottomColor: '#7A3B8C', accessory: 'bag', accessoryColor: '#E0A21E' },
  { skin: '#E0A97F', hair: 'cap', hairColor: '#9A9A9A', hatColor: '#B3262B', top: 'tee', topColor: '#F2C94C', bottom: 'shorts', bottomColor: '#43506A', accessory: 'backpack', accessoryColor: '#2A9DAA' },
];
const POSE: PoseIn = { yaw: 0, gait: 'walk', phase: 0, head: 0 };
const keyOf = (out: Outfit, p: PoseIn = POSE): FigureKey => ({ sig: signatureOf(shapeOf(out, false, 'none')), yaw: p.yaw, gait: p.gait, phase: p.phase, head: p.head, arms: p.arms ?? 'swing', lean: p.lean ?? 0 });

// Faux rendu 3D : coût simulé sur l'horloge du registre, image et accroches tirées de la pose.
const ANCHORS: SpriteAnchors = { handR: [7.5, -21], handL: [-7.5, -21], hands: [0, -21], head: [0, -40], headTop: [0, -47.5], nape: [0, -34], seat: [0, -19] };
class Fake implements Citizen3D {
  isReady = false;
  renders = 0;
  prepared: CitizenDesc[] = [];
  constructor(
    private readonly clock: { t: number },
    private readonly cost = 0,
  ) {}
  ready(): boolean {
    return this.isReady;
  }
  prepare(d: CitizenDesc): void {
    this.prepared.push(d);
  }
  render(_d: CitizenDesc, key: FigureKey, light: number, face: string): { url: string; anchors: SpriteAnchors } {
    this.clock.t += this.cost;
    this.renders++;
    return { url: `data:image/png;base64,3D${this.renders}|${keyString(key)}|${light}|${face}`, anchors: ANCHORS };
  }
  dispose(): void {}
}
const setup = (cost = 0): { r: FigureRegistry; fake: Fake; clock: { t: number } } => {
  const clock = { t: 0 };
  const fake = new Fake(clock, cost);
  return { r: new FigureRegistry('t', { citizens: () => fake, now: () => clock.t }), fake, clock };
};

function mount(r: FigureRegistry, el: ReactElement): { node: Element; unmount: () => void } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<FigureContext.Provider value={r}><svg>{el}</svg></FigureContext.Provider>));
  return { node: host.querySelector('[data-figure]')!, unmount: () => { act(() => root.unmount()); host.remove(); } };
}
const fig = (props: { out?: Outfit; waitFor3D?: boolean; held?: readonly Held[]; rainy?: boolean; s?: Sky } = {}): ReactElement => (
  <GhibliFigure outfit={props.out ?? o} sky={props.s ?? sky} rainy={props.rainy ?? false} umbrella={false} initial={POSE} waitFor3D={props.waitFor3D} held={props.held} />
);
const href = (n: Element): string | null => n.firstElementChild!.getAttribute('href');

describe('interrupteur coupé (CITIZENS_3D = false)', () => {
  it('clés de palette et de sprite identiques à avant (3 tenues), aucun rendu 3D construit', async () => {
    vi.resetModules();
    vi.doMock('../../../src/content/figure/citizen-config', async (orig) => ({ ...(await orig<object>()), CITIZENS_3D: false }));
    const fh = await import('../../../src/content/figure/figure-host');
    const gf = await import('../../../src/content/figure/ghibli-figure');
    const factory = vi.fn(() => null);
    const r = new fh.FigureRegistry('t', { citizens: factory });
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <fh.FigureContext.Provider value={r}>
          <svg>
            {OUTFITS.map((out, i) => (
              <gf.GhibliFigure key={i} outfit={out} sky={sky} rainy={i === 2} umbrella={false} initial={POSE} citizen={i} waitFor3D />
            ))}
          </svg>
        </fh.FigureContext.Provider>,
      ),
    );
    const nodes = [...host.querySelectorAll('[data-figure]')];
    const got = nodes.map((n) => ({ pk: hashString(n.getAttribute('data-palette')!), sk: hashString(n.getAttribute('data-key')!), attrs: n.getAttributeNames().join(' '), img: href(n) === BLANK_SPRITE }));
    // Valeurs relevées avec le code d'avant le branchement (2a7d1473) : rien ne change.
    expect(got).toMatchInlineSnapshot(`
      [
        {
          "attrs": "data-figure data-sig data-palette data-key",
          "img": true,
          "pk": 3276458429,
          "sk": 2818459407,
        },
        {
          "attrs": "data-figure data-sig data-palette data-key",
          "img": true,
          "pk": 1288525300,
          "sk": 4214355484,
        },
        {
          "attrs": "data-figure data-sig data-palette data-key",
          "img": true,
          "pk": 3906990862,
          "sk": 1611038801,
        },
      ]
    `);
    for (const [i, n] of nodes.entries()) {
      const pal = gf.figurePalette(OUTFITS[i]!, sky, i === 2, { key: 'k', light: 1 });
      expect(pal.c3d).toBeUndefined();
      expect(n.getAttribute('data-key')).toBe(fh.spriteKey(fh.paletteKey(pal), keyOf(OUTFITS[i]!)));
    }
    expect(factory).not.toHaveBeenCalled();
    act(() => root.unmount());
    vi.doUnmock('../../../src/content/figure/citizen-config');
    vi.resetModules();
  });
});

describe('repli pantin et passage en 3D', () => {
  it('3D pas prête : le sprite pantin est servi ; prête : sprite 3D dès que le cycle est rendu', () => {
    const { r, fake } = setup();
    const { node, unmount } = mount(r, fig());
    const pk = node.getAttribute('data-palette')!;
    expect(r.is3D(pk)).toBe(true);
    expect(node.getAttribute('data-key')).toBe(spriteKey(pk, keyOf(o)));
    expect(href(node)).toBe(BLANK_SPRITE);
    r.flush();
    expect(fake.renders).toBe(0);
    expect(href(node)).toBe(BLANK_SPRITE);
    fake.isReady = true;
    r.flush();
    // Rendu gratuit : les 12 phases du cycle dans le même flush, puis la figure passe en 3D.
    expect(fake.renders).toBe(PHASES);
    expect(node.getAttribute('data-key')).toBe(`${spriteKey(pk, keyOf(o))}@3d`);
    expect(href(node)!.startsWith('data:image/png;base64,3D')).toBe(true);
    unmount();
  });
  it('passage en 3D seulement une fois les 12 phases du cycle rendues (rendu de 4 ms : 2 par image)', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const { node, unmount } = mount(r, fig());
    for (let i = 1; i < PHASES / 2; i++) {
      r.flush();
      expect(fake.renders).toBe(2 * i);
      expect(node.getAttribute('data-key')!.includes('@3d')).toBe(false);
    }
    r.flush();
    expect(fake.renders).toBe(PHASES);
    expect(node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    unmount();
  });
  it('6 marcheurs, rendu de 4 ms (2 par image) : jamais la même image plus de 2 changements de phase de suite (demi-tour en route)', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const outs = Array.from({ length: 6 }, (_, n) => ({ ...OUTFITS[n % 3]!, topColor: ['#C0463A', '#3B6FD6', '#2E8B6A', '#E0A21E', '#7A3B8C', '#E07A8C'][n]! }));
    const ws = outs.map((out) => mount(r, fig({ out })));
    // Une phase toutes les 2 images (le pantin manquant est peint au flush, montré à l'image suivante, comme avant).
    const last = ws.map(() => '');
    const same = ws.map(() => 0);
    let max = 0;
    let shown3D = 0;
    for (let i = 0; i < 320; i++) {
      // Demi-tour à l'image 160 : de nouveaux cycles (yaw 8) à rendre.
      for (const w of ws) poseFigure(r, w.node, { ...POSE, yaw: i < 160 ? 0 : 8, phase: Math.floor(i / 2) % PHASES });
      r.flush();
      if (i % 2 === 0) continue;
      // Image montrée à la fin de chaque phase.
      ws.forEach((w, n) => {
        const k = w.node.getAttribute('data-key')!;
        same[n] = k === last[n] ? same[n]! + 1 : 0;
        max = Math.max(max, same[n]!);
        last[n] = k;
        if (k.includes('@3d')) shown3D++;
      });
    }
    expect(max).toBeLessThanOrEqual(2);
    // Chaque marcheur finit en 3D, des deux côtés du demi-tour.
    expect(shown3D).toBeGreaterThan(ws.length * 80);
    for (const w of ws) expect(w.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    for (const w of ws) w.unmount();
  });
  it('palier de lumière changé (crépuscule) : la figure reste en 3D pendant que le nouveau palier se rend', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const host = document.createElement('div');
    const root = createRoot(host);
    const draw = (s: Sky): void => act(() => root.render(<FigureContext.Provider value={r}><svg>{fig({ s })}</svg></FigureContext.Provider>));
    draw({ ...sky, daylight: 1 });
    for (let i = 0; i < 6; i++) r.flush();
    const node = host.querySelector('[data-figure]')!;
    const day = node.getAttribute('data-key')!;
    const dayPk = node.getAttribute('data-palette');
    expect(r.anchors(day)).not.toBeNull();
    draw({ ...sky, daylight: 0.5 });
    // Nouvelle palette (autre palier) : l'image 3D du palier précédent reste montrée, aucun retour au pantin.
    expect(node.getAttribute('data-palette')).not.toBe(dayPk);
    expect(node.getAttribute('data-key')).toBe(day);
    for (let i = 0; i < 8; i++) {
      expect(r.anchors(node.getAttribute('data-key')!)).not.toBeNull();
      r.flush();
    }
    // Le nouveau palier finit par être montré.
    expect(node.getAttribute('data-key')).toBe(r.keyFor(node.getAttribute('data-palette')!, keyOf(o)));
    act(() => root.unmount());
  });
  it('waitFor3D : aucune image avant la 3D, pantin après 4 000 ms', () => {
    const { r, clock } = setup();
    const { node, unmount } = mount(r, fig({ waitFor3D: true }));
    expect(href(node)).toBeNull();
    expect(node.hasAttribute('data-key')).toBe(false);
    clock.t = 1000;
    r.flush();
    poseFigure(r, node, POSE);
    expect(href(node)).toBeNull();
    clock.t = WAIT3D_FALLBACK_MS - 1;
    r.flush();
    expect(href(node)).toBeNull();
    clock.t = WAIT3D_FALLBACK_MS;
    r.flush();
    expect(href(node)).toBe(BLANK_SPRITE);
    unmount();
  });
  it('waitFor3D : la 3D prête à temps est la première image montrée', () => {
    const { r, fake } = setup();
    fake.isReady = true;
    const { node, unmount } = mount(r, fig({ waitFor3D: true }));
    expect(href(node)).toBeNull();
    r.flush();
    expect(href(node)!.startsWith('data:image/png;base64,3D')).toBe(true);
    unmount();
  });
  it('passant waitFor3D caché : après 4 000 ms, les figures suivies ne sont pas réexaminées à chaque image', () => {
    const { r, clock } = setup();
    const { node, unmount } = mount(r, fig({ waitFor3D: true }));
    hideFigure(r, node);
    const spy = vi.fn(() => false);
    r.watch(document.createElementNS('http://www.w3.org/2000/svg', 'g'), spy);
    clock.t = WAIT3D_FALLBACK_MS;
    r.flush();
    const atExpiry = spy.mock.calls.length;
    expect(atExpiry).toBe(1);
    for (let i = 0; i < 10; i++) r.flush();
    expect(spy.mock.calls.length).toBe(atExpiry);
    unmount();
  });
});

describe('3D hors service', () => {
  it('attente écoulée sans aucun rendu réussi : 3D hors service, plus de passant invisible ; nouvel essai après 30 s', () => {
    const { r, fake, clock } = setup();
    const a = mount(r, fig({ waitFor3D: true }));
    clock.t = WAIT3D_FALLBACK_MS;
    r.flush();
    expect(href(a.node)).toBe(BLANK_SPRITE);
    expect(r.is3D(a.node.getAttribute('data-palette')!)).toBe(false);
    // Un nouveau passant en attente 3D se montre tout de suite en pantin.
    const b = mount(r, fig({ out: OUTFITS[1], waitFor3D: true }));
    expect(href(b.node)).toBe(BLANK_SPRITE);
    // La 3D arrive : rien avant le nouvel essai (30 s), puis les figures passent en 3D.
    fake.isReady = true;
    r.flush();
    poseFigure(r, b.node, { ...POSE, phase: 1 });
    expect(fake.renders).toBe(0);
    clock.t += 30_000;
    poseFigure(r, b.node, { ...POSE, phase: 2 });
    r.flush();
    poseFigure(r, b.node, { ...POSE, phase: 3 });
    // Les deux habitants (a encore en file) : leurs cycles complets.
    expect(fake.renders).toBe(2 * PHASES);
    expect(b.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    expect(r.is3D(b.node.getAttribute('data-palette')!)).toBe(true);
    a.unmount();
    b.unmount();
  });
  it('5 rendus nuls de suite avec une base prête : 3D hors service ; levé par un rendu réussi après 30 s', () => {
    const { r, fake, clock } = setup();
    fake.isReady = true;
    const real = fake.render.bind(fake);
    let fail = true;
    fake.render = (...args: Parameters<Fake['render']>) => {
      if (!fail) return real(...args);
      fake.renders++;
      return null as unknown as ReturnType<Fake['render']>;
    };
    const figs = OUTFITS.map((out) => mount(r, fig({ out })));
    for (let i = 0; i < 4; i++) {
      for (const f of figs) poseFigure(r, f.node, { ...POSE, phase: i });
      r.flush();
    }
    const pk = figs[0]!.node.getAttribute('data-palette')!;
    expect(fake.renders).toBeGreaterThanOrEqual(5);
    expect(r.is3D(pk)).toBe(false);
    const tried = fake.renders;
    r.flush();
    expect(fake.renders).toBe(tried);
    fail = false;
    clock.t += 30_000;
    for (const f of figs) poseFigure(r, f.node, { ...POSE, phase: 5 });
    r.flush();
    expect(r.is3D(pk)).toBe(true);
    poseFigure(r, figs[0]!.node, { ...POSE, phase: 6 });
    expect(figs[0]!.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    for (const f of figs) f.unmount();
  });
});

describe('visages', () => {
  it('sans `faces` : visage neutre (aucun état dans la clé) ; avec : état du visage dans la clé, figures fixes suivies', () => {
    const clock = { t: 0 };
    const plain = Object.assign(new Fake(clock), { faceOf: () => 'cb1' });
    plain.isReady = true;
    const withFaces = Object.assign(new Fake(clock), { faceOf: vi.fn(() => 'cb1') });
    withFaces.isReady = true;
    const r1 = new FigureRegistry('t', { citizens: () => plain, now: () => clock.t });
    const a = mount(r1, fig());
    r1.flush();
    expect(a.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    const r2 = new FigureRegistry('t', { citizens: () => withFaces, now: () => clock.t, faces: true });
    const b = mount(r2, fig());
    r2.flush();
    // Cycle rendu au visage neutre ; l'état du visage est rendu ensuite et montré à la figure fixe.
    expect(b.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    r2.flush();
    expect(b.node.getAttribute('data-key')!.endsWith('@3dcb1')).toBe(true);
    expect(withFaces.faceOf).toHaveBeenCalledWith('swing', 'neutre', 0, expect.any(Number));
    // Clignement suivant : la figure fixe le suit.
    withFaces.faceOf.mockReturnValue('');
    r2.flush();
    expect(b.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    a.unmount();
    b.unmount();
  });
});

describe('budget de rendu 3D', () => {
  it(`renderer simulé de 4 ms : au plus 2 rendus 3D par flush (budget ${RENDER_BUDGET_MS} ms depuis le début de l'image)`, () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const { node, unmount } = mount(r, fig());
    const pk = node.getAttribute('data-palette')!;
    for (let y = 1; y < 6; y++) r.request(pk, keyOf(o, { ...POSE, yaw: y }));
    r.flush();
    expect(fake.renders).toBe(2);
    for (let y = 1; y < 6; y++) r.request(pk, keyOf(o, { ...POSE, yaw: y }));
    r.flush();
    expect(fake.renders).toBe(4);
    unmount();
  });
});

describe('accroches', () => {
  it('handR d’une figure 3D = celle du rendu 3D (objets tenus, haut de la tête, figureAnchors)', () => {
    const { r, fake } = setup();
    const held: Held[] = [{ anchor: 'handR', node: <circle r={1} /> }];
    const { node, unmount } = mount(r, fig({ held }));
    const k = keyOf(o);
    const pk = node.getAttribute('data-palette')!;
    // Pantin : accroches du pantin.
    expect(r.anchors(spriteKey(pk, k))).toBeNull();
    expect(figureAnchors(r, spriteKey(pk, k), k).handR).not.toEqual(ANCHORS.handR);
    fake.isReady = true;
    r.flush();
    const sk = node.getAttribute('data-key')!;
    expect(r.anchors(sk)!.handR).toEqual(ANCHORS.handR);
    expect(figureAnchors(r, sk, k).handR).toEqual(ANCHORS.handR);
    expect(node.querySelector('[data-held="handR"]')!.getAttribute('transform')).toBe(`translate(${ANCHORS.handR[0]} ${ANCHORS.handR[1]})`);
    expect(figureHeadTop(node)).toEqual(ANCHORS.headTop);
    unmount();
  });
});

describe('relais injoignable', () => {
  it('loadBase → null : pantins partout, aucune exception, passants waitFor3D en pantin après 4 000 ms', async () => {
    const clock = { t: 0 };
    const make = vi.fn(() => {
      throw new Error('pas de WebGL');
    });
    const cr = new CitizenRenderer({ pxPerUnit: 3, loadBase: async () => null, makeRenderer: make });
    const r = new FigureRegistry('t', { citizens: () => cr, now: () => clock.t });
    const a = mount(r, fig());
    const b = mount(r, fig({ out: OUTFITS[1], waitFor3D: true }));
    expect(href(a.node)).toBe(BLANK_SPRITE);
    expect(href(b.node)).toBeNull();
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
      r.flush();
      poseFigure(r, a.node, { ...POSE, phase: i % 12 });
    }
    expect(href(a.node)).toBe(BLANK_SPRITE);
    expect(a.node.getAttribute('data-key')!.includes('@3d')).toBe(false);
    clock.t = WAIT3D_FALLBACK_MS;
    expect(() => r.flush()).not.toThrow();
    expect(href(b.node)).toBe(BLANK_SPRITE);
    expect(make).not.toHaveBeenCalled();
    a.unmount();
    b.unmount();
  });
});

describe('palette 3D', () => {
  it('crépuscule recalculé à la minute : même clé c3d-light tant que le palier 1/8 ne change pas', () => {
    const lights: string[] = [];
    const from = Math.round(sun.kind === 'normal' ? sun.sunset : 18 * 60) - 90;
    for (let m = from; m < from + 180; m++) {
      const s = skyAt(m, sun);
      const p = figurePalette(o, s, false, { key: 'k', light: citizenLight(s) });
      expect(p['c3d-light']).toBe(String(Math.round(citizenLight(s) * 8) / 8));
      if (lights.length === 0 || lights.at(-1) !== p['c3d-light']) lights.push(p['c3d-light']!);
    }
    // Quelques paliers sur trois heures, et non un par minute.
    expect(lights.length).toBeGreaterThan(1);
    expect(lights.length).toBeLessThanOrEqual(9);
    // La clé de palette ne change qu'avec le palier.
    const pk = (d: number): string => paletteKey(figurePalette(o, { ...sky, daylight: d }, false, { key: 'k', light: citizenLight({ ...sky, daylight: d }) }));
    expect(pk(0.51)).toBe(pk(0.53));
    expect(pk(0.3)).not.toBe(pk(0.7));
  });
  it('pluie : imperméable seulement sur tee/sweater/jacket/shirt (pantin et 3D)', () => {
    const tops: Top[] = ['tee', 'sweater', 'jacket', 'coat', 'shirt', 'suit', 'jersey'];
    const coat = tone('#2E5E8A', { ...sky, daylight: Math.round(sky.daylight * 8) / 8 });
    for (const top of tops) {
      const out = { ...o, top };
      const yes = ['tee', 'sweater', 'jacket', 'shirt'].includes(top);
      expect(figurePalette(out, sky, true)['f-top'] === coat).toBe(yes);
      expect(figurePalette(out, sky, false)['f-top']).not.toBe(coat);
      expect(rainOutfit(out, true).topColor === '#2E5E8A').toBe(yes);
      // Habitant 3D : la tenue décrite porte l'imperméable sous la pluie.
      const { r, fake } = setup();
      const { unmount } = mount(r, fig({ out, rainy: true }));
      const colors = fake.prepared.at(-1)!.items.map((i) => i.color.toUpperCase());
      expect(colors.includes('#2E5E8A')).toBe(yes);
      unmount();
    }
  });
});
