// @vitest-environment jsdom
// tests/content/figure/figure-host-3d.test.tsx
// Branchement des habitants 3D dans le registre des figures : repli pantin, attente 3D, budget, accroches, interrupteur.
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { BLANK_SPRITE, CLOSE_UP_SPRITES_MAX, FIGURE_SPRITES_MAX, FigureContext, FigureRegistry, HOLD_3D_FRAMES, figureAnchors, paletteKey, phaseSet, sharedCitizen3D, spriteKey, spriteKey3D, viewFigureOptions, type Citizen3D, type SpriteAnchors } from '../../../src/content/figure/figure-host';
import { GhibliFigure, citizenLight, figureHeadTop, figurePalette, hideFigure, poseFigure, prewarmCitizen, prewarmFigure, rainOutfit, setShown3DFitter, type Held, type PoseIn } from '../../../src/content/figure/ghibli-figure';
import { CitizenRenderer } from '../../../src/content/citizens/citizen-renderer';
import { RENDER_BUDGET_MS, WAIT3D_FALLBACK_MS } from '../../../src/content/figure/citizen-config';
import { keyString, type FigureKey } from '../../../src/core/library/figure/bake';
import { PHASES } from '../../../src/core/library/figure/skeleton';
import { shapeOf, signatureOf } from '../../../src/core/library/figure/dress';
import { skyAt, sunTimes, type Sky } from '../../../src/core/library/sky';
import { hashString } from '../../../src/core/library/scene-world';
import { citizen, type CitizenDesc } from '../../../src/core/citizens/catalogue';
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
  it('figure immobile (debout) : une seule pose distincte, passage en 3D après 1 rendu', () => {
    const stand: PoseIn = { yaw: 0, gait: 'stand', phase: 0, head: 0 };
    expect(phaseSet(keyOf(o, stand)).phases).toEqual([0]);
    expect(phaseSet(keyOf(o)).phases).toHaveLength(PHASES);
    const { r, fake } = setup(4);
    fake.isReady = true;
    const { node, unmount } = mount(r, <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={stand} />);
    r.flush();
    expect(fake.renders).toBe(1);
    expect(node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    // Une autre phase de la même pose immobile : même image 3D, aucun rendu de plus.
    poseFigure(r, node, { ...stand, phase: 7 });
    r.flush();
    expect(fake.renders).toBe(1);
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
    // La figure fixe `a` (ni rendu React ni poseFigure depuis) est reprise en suivi et passe en 3D elle aussi.
    expect(a.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
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

describe('habitant en échec', () => {
  it('un habitant dont l’habillage échoue reste en pantin, les autres restent en 3D (la 3D ne passe pas hors service)', () => {
    const { r, fake, clock } = setup();
    fake.isReady = true;
    const real = fake.render.bind(fake);
    let failure: 'citizen' | null = null;
    // Essais de l'habitant en échec (les rendus d'avance des autres, orientations voisines, ne comptent pas).
    let badCalls = 0;
    const bad = OUTFITS[1]!;
    fake.render = (d: CitizenDesc, ...rest: [FigureKey, number, string]) => {
      if (d.items.some((i) => i.color === bad.topColor)) {
        fake.renders++;
        badCalls++;
        failure = 'citizen';
        return null as unknown as ReturnType<Fake['render']>;
      }
      failure = null;
      return real(d, ...rest);
    };
    Object.assign(fake, { lastFailure: () => failure });
    const good = mount(r, fig());
    const broken = mount(r, fig({ out: bad }));
    for (let i = 0; i < 20; i++) {
      poseFigure(r, good.node, { ...POSE, phase: i % PHASES });
      poseFigure(r, broken.node, { ...POSE, phase: i % PHASES });
      r.flush();
    }
    expect(good.node.getAttribute('data-key')!.includes('@3d')).toBe(true);
    expect(broken.node.getAttribute('data-key')!.includes('@3d')).toBe(false);
    expect(r.is3D(good.node.getAttribute('data-palette')!)).toBe(true);
    expect(r.is3D(broken.node.getAttribute('data-palette')!)).toBe(false);
    // Un seul essai pour l'habitant en échec (pas de nouvel essai avant 30 s) ; un nouveau passant attendu se montre en 3D.
    expect(badCalls).toBe(1);
    const other = mount(r, fig({ out: OUTFITS[2], waitFor3D: true }));
    r.flush();
    expect(other.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    // Après 30 s, nouvel essai pour lui seul.
    clock.t += 30_000;
    poseFigure(r, broken.node, { ...POSE, phase: 3 });
    r.flush();
    expect(badCalls).toBe(2);
    good.unmount();
    broken.unmount();
    other.unmount();
  });
});

describe('file des rendus 3D', () => {
  it('cycle non redemandé depuis 15 images : abandonné', () => {
    const { r, fake } = setup();
    const { node, unmount } = mount(r, fig());
    hideFigure(r, node);
    for (let i = 0; i < 16; i++) r.flush();
    fake.isReady = true;
    r.flush();
    expect(fake.renders).toBe(0);
    unmount();
  });
  it('3D hors service : une figure fixe re-rendue par React reste mise de côté et passe en 3D au nouvel essai', () => {
    const { r, fake, clock } = setup();
    const host = document.createElement('div');
    const root = createRoot(host);
    const draw = (s: Sky): void => act(() => root.render(<FigureContext.Provider value={r}><svg>{fig({ s, waitFor3D: true })}</svg></FigureContext.Provider>));
    draw(sky);
    const node = host.querySelector('[data-figure]')!;
    clock.t = WAIT3D_FALLBACK_MS;
    r.flush();
    expect(href(node)).toBe(BLANK_SPRITE);
    // Re-rendu React pendant la panne (nouvelle minute, autre palier).
    draw({ ...sky, daylight: 0.5 });
    fake.isReady = true;
    clock.t += 30_000;
    // Nouvel essai : aucune pose ni rendu React, la figure fixe passe en 3D.
    r.flush();
    r.flush();
    expect(node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    act(() => root.unmount());
  });
});

describe('visages', () => {
  const STAND: PoseIn = { yaw: 0, gait: 'stand', phase: 0, head: 0 };
  // Faux visages : 'c' (émotion de fond), `state.v` quand le clignement est demandé (pose immobile).
  type FaceFn = (a: string, m: string, t: number, s: number, blink: boolean) => string;
  const faced = (clock: { t: number }, state: { v: string }): Fake & { faceOf: Mock<FaceFn> } => {
    const f = Object.assign(new Fake(clock), { faceOf: vi.fn<FaceFn>((_a, _m, _t, _s, blink) => (blink ? state.v : 'c')) });
    f.isReady = true;
    return f;
  };
  it('sans `faces` : visage neutre (aucun état dans la clé) ; avec : cycle au visage de fond, clignement de la figure fixe ensuite', () => {
    const clock = { t: 0 };
    const plain = Object.assign(new Fake(clock), { faceOf: () => 'cb1' });
    plain.isReady = true;
    const state = { v: 'cb1' };
    const withFaces = faced(clock, state);
    const r1 = new FigureRegistry('t', { citizens: () => plain, now: () => clock.t });
    const a = mount(r1, fig());
    r1.flush();
    expect(a.node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    const r2 = new FigureRegistry('t', { citizens: () => withFaces, now: () => clock.t, faces: true });
    const b = mount(r2, <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={STAND} />);
    r2.flush();
    // Cycle rendu au visage de fond ; l'état du clignement est rendu ensuite et montré à la figure fixe.
    expect(b.node.getAttribute('data-key')!.endsWith('@3dc')).toBe(true);
    r2.flush();
    expect(b.node.getAttribute('data-key')!.endsWith('@3dcb1')).toBe(true);
    expect(withFaces.faceOf).toHaveBeenCalledWith('swing', 'neutre', 0, expect.any(Number), true);
    // Clignement suivant : la figure fixe le suit.
    state.v = 'c';
    r2.flush();
    expect(b.node.getAttribute('data-key')!.endsWith('@3dc')).toBe(true);
    a.unmount();
    b.unmount();
  });
  it('marcheur : visage de son émotion seulement (jamais de clignement), aucune image seule rendue', () => {
    const clock = { t: 0 };
    const state = { v: 'cb1' };
    const f = faced(clock, state);
    const r = new FigureRegistry('t', { citizens: () => f, now: () => clock.t, faces: true });
    const { node, unmount } = mount(r, fig());
    for (let i = 0; i < 40; i++) {
      clock.t += 16;
      poseFigure(r, node, { ...POSE, phase: Math.floor(i / 2) % PHASES });
      r.flush();
    }
    expect(f.renders).toBe(PHASES);
    expect(f.faceOf.mock.calls.every((c) => c[4] === false)).toBe(true);
    expect(node.getAttribute('data-key')!.endsWith('@3dc')).toBe(true);
    unmount();
  });
  it('une image seule (visage) par flush au plus', () => {
    const clock = { t: 0 };
    const state = { v: 'c' };
    const f = faced(clock, state);
    const r = new FigureRegistry('t', { citizens: () => f, now: () => clock.t, faces: true });
    const ws = OUTFITS.map((out) => mount(r, <GhibliFigure outfit={out} sky={sky} rainy={false} umbrella={false} initial={STAND} />));
    r.flush();
    expect(f.renders).toBe(3);
    // Les trois clignent en même temps : un visage rendu par image au plus, tous rendus à la fin.
    state.v = 'cb1';
    let prev = f.renders;
    for (let i = 0; i < 6; i++) {
      r.flush();
      expect(f.renders - prev).toBeLessThanOrEqual(1);
      prev = f.renders;
    }
    expect(f.renders).toBe(6);
    for (const w of ws) expect(w.node.getAttribute('data-key')!.endsWith('@3dcb1')).toBe(true);
    for (const w of ws) w.unmount();
  });
});

describe('budget : habillage à part et dette', () => {
  // Faux rendu qui habille à part (comme CitizenRenderer) : `buildCost` ms pour habiller, `cost` ms par rendu.
  class RigFake extends Fake {
    builds = 0;
    readonly rigs = new Set<string>();
    constructor(
      private readonly clk: { t: number },
      cost: number,
      private readonly buildCost: number,
    ) {
      super(clk, cost);
    }
    hasRig(d: CitizenDesc): boolean {
      return this.rigs.has(JSON.stringify(d));
    }
    buildRig(d: CitizenDesc): boolean {
      this.clk.t += this.buildCost;
      this.builds++;
      this.rigs.add(JSON.stringify(d));
      return true;
    }
  }
  const STAND: PoseIn = { yaw: 0, gait: 'stand', phase: 0, head: 0 };
  it('habillage de 50 ms : seul dans son image, puis ceil(50/6) − 1 = 8 images sans 3D, puis le rendu', () => {
    const clock = { t: 0 };
    const f = new RigFake(clock, 4, 50);
    f.isReady = true;
    const r = new FigureRegistry('t', { citizens: () => f, now: () => clock.t });
    const { node, unmount } = mount(r, <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={STAND} />);
    r.flush();
    expect(f.builds).toBe(1);
    expect(f.renders).toBe(0);
    for (let i = 0; i < Math.ceil(50 / RENDER_BUDGET_MS) - 1; i++) {
      r.flush();
      expect(f.renders).toBe(0);
    }
    r.flush();
    expect(f.renders).toBe(1);
    expect(node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    unmount();
  });
  it('rendu de 20 ms : 3 images sautées après chacun, moyenne dans le budget', () => {
    const clock = { t: 0 };
    const f = new RigFake(clock, 20, 0);
    f.isReady = true;
    const r = new FigureRegistry('t', { citizens: () => f, now: () => clock.t });
    const { node, unmount } = mount(r, fig());
    const n = 40;
    for (let i = 0; i < n; i++) {
      poseFigure(r, node, POSE);
      r.flush();
    }
    // Image 1 : habillage (0 ms) seul ; puis un rendu toutes les 4 images.
    expect(f.renders).toBe(Math.ceil((n - 1) / 4));
    expect((f.renders * 20) / n).toBeLessThanOrEqual(RENDER_BUDGET_MS);
    unmount();
  });
});

describe('priorités et attente', () => {
  it('passant caché waitFor3D : sa première image 3D passe avant les cycles des figures déjà visibles', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const visible = OUTFITS.map((out) => mount(r, fig({ out: { ...out, topColor: '#123456' } })));
    const waiter = mount(r, fig({ waitFor3D: true }));
    expect(href(waiter.node)).toBeNull();
    // 12 phases à 2 rendus par image : 6 images.
    for (let i = 0; i < PHASES / 2; i++) {
      for (const w of [...visible, waiter]) poseFigure(r, w.node, POSE);
      r.flush();
    }
    expect(href(waiter.node)!.startsWith('data:image/png;base64,3D')).toBe(true);
    for (const w of visible) expect(w.node.getAttribute('data-key')!.includes('@3d')).toBe(false);
    for (const w of [...visible, waiter]) w.unmount();
  });
  it('figure waitFor3D déjà montrée : un demi-tour ne la fige pas (nouvelle image en ≤ HOLD_3D_FRAMES + 1 images)', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const { node, unmount } = mount(r, fig({ waitFor3D: true }));
    for (let i = 0; i < PHASES / 2; i++) {
      poseFigure(r, node, POSE);
      r.flush();
    }
    const before = node.getAttribute('data-key')!;
    expect(before.endsWith('@3d')).toBe(true);
    let changedAt = -1;
    for (let i = 0; i < 4 && changedAt < 0; i++) {
      poseFigure(r, node, { ...POSE, yaw: 8 });
      expect(href(node)).not.toBeNull();
      if (node.getAttribute('data-key') !== before) changedAt = i;
      r.flush();
    }
    expect(changedAt).toBeGreaterThanOrEqual(0);
    expect(changedAt).toBeLessThanOrEqual(HOLD_3D_FRAMES + 1);
    unmount();
  });
});

describe('rendu partagé et vue rapprochée', () => {
  it('rendu partagé : détruit avec le dernier registre qui s’en sert, refait au suivant', async () => {
    const disposed = vi.fn();
    const create = vi.fn(async (): Promise<Citizen3D> => ({ ready: () => false, prepare() {}, render: () => null, dispose: disposed }));
    const factory = sharedCitizen3D(create, 0);
    const d = citizen(7);
    const a = new FigureRegistry('a', { citizens: factory, pxPerUnit: 6 });
    const b = new FigureRegistry('b', { citizens: factory, pxPerUnit: 6 });
    a.citizen(d, 1);
    b.citizen(d, 1);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(create).toHaveBeenCalledTimes(1);
    a.dispose();
    await new Promise((ok) => setTimeout(ok, 5));
    expect(disposed).not.toHaveBeenCalled();
    b.dispose();
    await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(1));
    const c = new FigureRegistry('c', { citizens: factory, pxPerUnit: 6 });
    c.citizen(d, 1);
    expect(create).toHaveBeenCalledTimes(2);
    // Registre libéré avant l'arrivée du rendu : libéré à l'arrivée.
    c.dispose();
    await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(2));
  });
  it('rendu partagé : revenir dans le délai de grâce réutilise le rendu (pas de nouveau contexte)', async () => {
    const disposed = vi.fn();
    const create = vi.fn(async (): Promise<Citizen3D> => ({ ready: () => false, prepare() {}, render: () => null, dispose: disposed }));
    const factory = sharedCitizen3D(create, 60);
    const d = citizen(7);
    const a = new FigureRegistry('a', { citizens: factory, pxPerUnit: 6 });
    a.citizen(d, 1);
    await new Promise((ok) => setTimeout(ok, 0));
    a.dispose();
    const b = new FigureRegistry('b', { citizens: factory, pxPerUnit: 6 });
    b.citizen(d, 1);
    await new Promise((ok) => setTimeout(ok, 100));
    expect(create).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
    b.dispose();
    await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(1));
  });
  it('réglages de la vue : rapprochée à 6 px avec visages ; interrupteur coupé : plafond d’avant dans les deux vues', async () => {
    expect(viewFigureOptions(true)).toEqual({ max: CLOSE_UP_SPRITES_MAX, pxPerUnit: 6, faces: true });
    expect(viewFigureOptions(false)).toEqual({ max: FIGURE_SPRITES_MAX });
    vi.resetModules();
    vi.doMock('../../../src/content/figure/citizen-config', async (orig) => ({ ...(await orig<object>()), CITIZENS_3D: false }));
    const fh = await import('../../../src/content/figure/figure-host');
    expect(fh.viewFigureOptions(true)).toEqual({ max: FIGURE_SPRITES_MAX });
    expect(fh.viewFigureOptions(false)).toEqual({ max: FIGURE_SPRITES_MAX });
    vi.doUnmock('../../../src/content/figure/citizen-config');
    vi.resetModules();
  });
  it('réglage d’un groupe (charge portée à deux) rappelé dès qu’une de ses figures passe en 3D', () => {
    const { r, fake } = setup();
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<FigureContext.Provider value={r}><svg><g data-crew="">{fig()}</g></svg></FigureContext.Provider>));
    const group = host.querySelector('[data-crew]')!;
    const node = host.querySelector('[data-figure]')!;
    const fit = vi.fn();
    setShown3DFitter(group, fit);
    r.flush();
    expect(fit).not.toHaveBeenCalled();
    fake.isReady = true;
    r.flush();
    expect(node.getAttribute('data-key')!.endsWith('@3d')).toBe(true);
    expect(fit).toHaveBeenCalledTimes(1);
    poseFigure(r, node, { ...POSE, phase: 3 });
    expect(fit).toHaveBeenCalledTimes(1);
    setShown3DFitter(group, null);
    act(() => root.unmount());
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

// Retours du téléphone (pré-prod 1729) : « sautes ancien / nouveau modèle » et « personne ne sort des portes ».
const is3DKey = (n: Element): boolean => n.getAttribute('data-key')?.includes('@3d') ?? false;
describe('retours S26 : une figure montrée en 3D ne revient jamais au pantin', () => {
  // Marcheur en 3D (cycle yaw 0 complet), puis nouvelle orientation jamais rendue, au milieu d'autres marcheurs.
  it('nouvelle orientation (cycle incomplet) : image 3D du même habitant à chaque image, jamais le pantin, cycle prioritaire', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const { node, unmount } = mount(r, fig());
    for (let i = 0; i < PHASES / 2; i++) {
      poseFigure(r, node, { ...POSE, phase: i % PHASES });
      r.flush();
    }
    expect(is3DKey(node)).toBe(true);
    const others = OUTFITS.map((out) => mount(r, fig({ out: { ...out, topColor: '#654321' } })));
    let to2D = 0;
    let turned = -1;
    for (let i = 0; i < 40; i++) {
      for (const w of others) poseFigure(r, w.node, { ...POSE, phase: i % PHASES });
      poseFigure(r, node, { ...POSE, yaw: 3, phase: i % PHASES });
      if (!is3DKey(node)) to2D++;
      if (turned < 0 && node.getAttribute('data-key') === r.keyFor(node.getAttribute('data-palette')!, keyOf(o, { ...POSE, yaw: 3, phase: i % PHASES }))) turned = i;
      r.flush();
    }
    expect(to2D).toBe(0);
    // Cycle de la nouvelle orientation avant ceux des autres (2 rendus par image : 6 images), image exacte ensuite.
    expect(turned).toBeGreaterThanOrEqual(0);
    expect(turned).toBeLessThanOrEqual(PHASES / 2 + 1);
    for (const w of others) w.unmount();
    unmount();
  });
  it('autre nœud du même habitant (porte puis rue, changement de calque) : apparaît en 3D, même en waitFor3D', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const door = mount(r, <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={{ ...POSE, yaw: 4, gait: 'stand' }} />);
    r.flush();
    expect(is3DKey(door.node)).toBe(true);
    // Nœud de rue (nouvelle orientation, en marche : cycle pas rendu) : visible tout de suite, en 3D.
    const street = mount(r, <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={POSE} />);
    expect(is3DKey(street.node)).toBe(true);
    const moved = mount(r, <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={{ ...POSE, yaw: 8 }} waitFor3D />);
    expect(href(moved.node)).not.toBeNull();
    expect(is3DKey(moved.node)).toBe(true);
    for (const w of [door, street, moved]) w.unmount();
  });
  it('image d’une phase retirée par le plafond : la figure reste en 3D (image la plus proche)', () => {
    const clock = { t: 0 };
    const fake = new Fake(clock);
    fake.isReady = true;
    // Plafond juste au-dessus d'un cycle : les autres figures font partir des phases du marcheur.
    const r = new FigureRegistry('t', { citizens: () => fake, now: () => clock.t, max: PHASES + 2 });
    const { node, unmount } = mount(r, fig());
    r.flush();
    expect(is3DKey(node)).toBe(true);
    const others = OUTFITS.map((out) => mount(r, fig({ out: { ...out, topColor: '#0a0b0c' } })));
    let to2D = 0;
    for (let i = 0; i < 48; i++) {
      for (const w of others) poseFigure(r, w.node, { ...POSE, phase: i % PHASES });
      poseFigure(r, node, { ...POSE, phase: i % PHASES });
      if (!is3DKey(node)) to2D++;
      r.flush();
    }
    expect(to2D).toBe(0);
    for (const w of others) w.unmount();
    unmount();
  });
  it('sans aucune image 3D de l’habitant dans le registre : dernière image gardée HOLD_3D_FRAMES images, puis pantin', () => {
    const clock = { t: 0 };
    const f1 = new Fake(clock);
    f1.isReady = true;
    const r1 = new FigureRegistry('a', { citizens: () => f1, now: () => clock.t });
    const r2 = new FigureRegistry('b', { citizens: () => new Fake(clock), now: () => clock.t, pxPerUnit: 6 });
    const host = document.createElement('div');
    const root = createRoot(host);
    const draw = (r: FigureRegistry): void => act(() => root.render(<FigureContext.Provider value={r}><svg>{fig({ waitFor3D: true })}</svg></FigureContext.Provider>));
    draw(r1);
    r1.flush();
    const node = host.querySelector('[data-figure]')!;
    const first = node.getAttribute('data-key');
    draw(r2);
    let i = 0;
    for (; i < HOLD_3D_FRAMES + 8 && node.getAttribute('data-key') === first; i++) {
      poseFigure(r2, node, { ...POSE, phase: 1 + (i % 3) });
      expect(href(node)).not.toBeNull();
      r2.flush();
    }
    expect(i).toBeGreaterThanOrEqual(HOLD_3D_FRAMES - 1);
    // + 3 images : les pantins des trois phases de la marche sont peints au flush (pas d'image tant qu'ils manquent).
    expect(i).toBeLessThanOrEqual(HOLD_3D_FRAMES + 4);
    expect(href(node)).not.toBeNull();
    expect(is3DKey(node)).toBe(false);
    act(() => root.unmount());
  });
  it('bascule de la vue Dehors (inherit) : la figure suit sa marche avec les images reprises, puis celles du nouveau registre', () => {
    const clock = { t: 0 };
    const f1 = new Fake(clock);
    f1.isReady = true;
    const r1 = new FigureRegistry('a', { citizens: () => f1, now: () => clock.t });
    const f2 = new Fake(clock);
    const r2 = new FigureRegistry('b', { citizens: () => f2, now: () => clock.t, pxPerUnit: 6 });
    const host = document.createElement('div');
    const root = createRoot(host);
    const draw = (r: FigureRegistry): void => act(() => root.render(<FigureContext.Provider value={r}><svg>{fig({ waitFor3D: true })}</svg></FigureContext.Provider>));
    draw(r1);
    r1.flush();
    const node = host.querySelector('[data-figure]')!;
    r2.inherit(r1);
    draw(r2);
    expect(is3DKey(node)).toBe(true);
    const pk = node.getAttribute('data-palette')!;
    for (let i = 1; i <= 3; i++) {
      poseFigure(r2, node, { ...POSE, phase: i });
      // Image reprise, exactement à la phase de la marche.
      expect(node.getAttribute('data-key')).toBe(`${spriteKey(pk, keyOf(o, { ...POSE, phase: i }))}@3d`);
      r2.flush();
    }
    f2.isReady = true;
    r2.flush();
    // Le cycle est refait à la résolution du nouveau registre (les images reprises ne comptent pas comme rendues).
    expect(f2.renders).toBe(PHASES);
    poseFigure(r2, node, { ...POSE, phase: 5 });
    expect(is3DKey(node)).toBe(true);
    act(() => root.unmount());
  });
  it('marcheur montré en 3D : orientations voisines préparées quand il ne reste rien d’autre à rendre', () => {
    const { r, fake } = setup();
    fake.isReady = true;
    const { node, unmount } = mount(r, fig());
    for (let i = 0; i < 30; i++) {
      poseFigure(r, node, { ...POSE, phase: i % PHASES });
      r.flush();
    }
    // Son cycle (12) puis yaw 15 et yaw 1 (12 chacun).
    expect(fake.renders).toBe(3 * PHASES);
    poseFigure(r, node, { ...POSE, yaw: 1, phase: 2 });
    expect(node.getAttribute('data-key')).toBe(r.keyFor(node.getAttribute('data-palette')!, keyOf(o, { ...POSE, yaw: 1, phase: 2 })));
    unmount();
  });
});

describe('retours S26 : demandes d’avance (habitants qui sortent de leur porte)', () => {
  it('prewarmCitizen : le cycle passe avant les nouveaux cycles des autres, reste en file sans renouvellement, la figure apparaît en 3D', () => {
    const { r, fake } = setup(4);
    fake.isReady = true;
    const others = OUTFITS.map((out) => mount(r, fig({ out: { ...out, topColor: '#abcdef' } })));
    const resident: Outfit = { ...o, topColor: '#3D9970' };
    prewarmCitizen(r, { outfit: resident, sky, rainy: false, umbrella: false, id: { citizen: 77 } }, [POSE]);
    // 30 images sans renouveler la demande (les autres figures redemandent les leurs à chaque image).
    for (let i = 0; i < 30; i++) {
      for (const w of others) poseFigure(r, w.node, { ...POSE, phase: i % PHASES });
      r.flush();
      if (i === PHASES / 2 - 1) for (const w of others) expect(is3DKey(w.node)).toBe(false);
    }
    const w = mount(r, <GhibliFigure outfit={resident} sky={sky} rainy={false} umbrella={false} initial={POSE} citizen={77} />);
    expect(is3DKey(w.node)).toBe(true);
    for (const x of [...others, w]) x.unmount();
  });
  it('prewarmFigure : même chose depuis le nœud caché de la figure (palette et signature lues sur le nœud)', () => {
    const { r, fake } = setup();
    fake.isReady = true;
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<FigureContext.Provider value={r}><svg><GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={POSE} hidden citizen={5} /></svg></FigureContext.Provider>));
    const node = host.querySelector('[data-figure]')!;
    expect(href(node)).toBeNull();
    prewarmFigure(r, node, [{ ...POSE, yaw: 4, gait: 'step' }, POSE]);
    r.flush();
    expect(fake.renders).toBeGreaterThan(0);
    poseFigure(r, node, POSE);
    expect(is3DKey(node)).toBe(true);
    act(() => root.unmount());
  });
});

describe('retours S26 : plafond de sprites plein (cache des images 3D)', () => {
  const walk = (r: FigureRegistry, node: Element, n: number): void => {
    for (let i = 0; i < n; i++) {
      poseFigure(r, node, { ...POSE, phase: i % PHASES });
      r.flush();
    }
  };
  it('habitant montré en 3D, caché puis remontré (nœud de réserve) après un flot d’autres habitants : de nouveau en 3D, jamais le pantin', () => {
    const clock = { t: 0 };
    const fake = new Fake(clock);
    fake.isReady = true;
    const r = new FigureRegistry('t', { citizens: () => fake, now: () => clock.t, max: 3 * PHASES });
    const a = mount(r, fig());
    walk(r, a.node, PHASES);
    expect(is3DKey(a.node)).toBe(true);
    hideFigure(r, a.node);
    // Huit autres habitants qui marchent et tournent : bien plus d'images que le plafond.
    const others = Array.from({ length: 8 }, (_, j) => mount(r, fig({ out: { ...o, topColor: `#10${j}0${j}0` } })));
    for (let i = 0; i < 200; i++) {
      others.forEach((w, j) => poseFigure(r, w.node, { ...POSE, yaw: (j + Math.floor(i / 20)) % 4, phase: i % PHASES }));
      r.flush();
    }
    poseFigure(r, a.node, { ...POSE, yaw: 2, phase: 3 });
    expect(href(a.node)).not.toBeNull();
    expect(is3DKey(a.node)).toBe(true);
    for (const w of [a, ...others]) w.unmount();
  });
  it('demandes d’avance en flot : le cycle montré d’un marcheur reste entier (les images d’avance partent avant)', () => {
    const clock = { t: 0 };
    const fake = new Fake(clock);
    fake.isReady = true;
    const r = new FigureRegistry('t', { citizens: () => fake, now: () => clock.t, max: 2 * PHASES });
    const a = mount(r, fig());
    walk(r, a.node, PHASES);
    const pk = a.node.getAttribute('data-palette')!;
    let lost = 0;
    let to2D = 0;
    for (let i = 0; i < 60; i++) {
      poseFigure(r, a.node, { ...POSE, phase: i % PHASES });
      if (!is3DKey(a.node)) to2D++;
      prewarmCitizen(r, { outfit: { ...o, topColor: `#20${i % 6}0${i % 6}0` }, sky, rainy: false, umbrella: false }, [POSE, { ...POSE, yaw: 4 }]);
      r.flush();
      for (let p = 0; p < PHASES; p++) if (!r.has(spriteKey3D(pk, keyOf(o, { ...POSE, phase: p }), ''))) lost++;
    }
    expect(to2D).toBe(0);
    expect(lost).toBe(0);
    a.unmount();
  });
  it('cache occupé par les habitants montrés : plus de rendus d’avance (mémoire bornée)', () => {
    const clock = { t: 0 };
    const fake = new Fake(clock);
    fake.isReady = true;
    const r = new FigureRegistry('t', { citizens: () => fake, now: () => clock.t, max: PHASES + 2 });
    const a = mount(r, fig());
    walk(r, a.node, PHASES);
    const before = fake.renders;
    for (let i = 0; i < 20; i++) {
      poseFigure(r, a.node, { ...POSE, phase: i % PHASES });
      prewarmCitizen(r, { outfit: { ...o, topColor: '#305050' }, sky, rainy: false, umbrella: false }, [POSE]);
      r.flush();
    }
    // Ni le voyageur d'avance, ni les orientations voisines du marcheur.
    expect(fake.renders).toBe(before);
    a.unmount();
  });
});
