import { describe, expect, it } from 'vitest';
import { DARK } from '../../../src/core/library/city/events';
import { SANTA_DARK, SANTA_PERIOD_S, SANTA_WINDOW_S, chimneyHole, landDx, roofSlope, roofSurface, santaHillPoseAt, santaHillRoof, santaHillScale, santaHillStepAt, santaHillWindow, santaOn, santaPassFor, santaPoseAt, santaRoof, santaWindowsIn, santaHillSackGround, visibleHillHouses } from '../../../src/core/library/city/santa';
import { WORLD_MARGIN } from '../../../src/core/library/scene-world';
import { cityFacades } from '../../../src/core/library/city/facades';
import { cityMetrics } from '../../../src/core/library/city/metrics';

const SEED = 4242;
const facades = [
  // La plus haute est une fenêtre de cage (home −1) : jamais celle du père Noël.
  { x: 100, w: 40, h: 120, far: false, lamps: [{ x: 120, y: 50, w: 3, h: 5, home: -1 }, { x: 104, y: 60, w: 6, h: 9, home: 0 }, { x: 114, y: 60, w: 6, h: 9, home: 0 }, { x: 104, y: 74, w: 6, h: 10, home: 1 }] },
  { x: 300, w: 20, h: 90, far: false, lamps: [] },
  { x: 500, w: 50, h: 100, far: true, lamps: [] },
];

describe('père Noël', () => {
  it('SANTA_DARK reste égal au seuil de nuit des événements', () => expect(SANTA_DARK).toBe(DARK));
  it('n’est actif que la nuit de la fête', () => {
    expect(santaOn(['christmas-eve'], 0.1)).toBe(true);
    expect(santaOn(['christmas-eve'], 0.3)).toBe(false);
    expect(santaOn([], 0)).toBe(false);
  });
  it('un passage par quart d’heure, dans sa tranche, déterministe', () => {
    for (let n = 1000; n < 1100; n++) {
      const a = santaPassFor(n, SEED);
      expect(santaPassFor(n, SEED)).toEqual(a);
      expect(a.start).toBeGreaterThanOrEqual(n * SANTA_PERIOD_S);
      expect(a.end).toBeLessThanOrEqual((n + 1) * SANTA_PERIOD_S);
      expect(a.end - a.start).toBe(SANTA_WINDOW_S);
    }
  });
  it('environ un passage sur trois livre', () => {
    let deliver = 0;
    for (let n = 0; n < 600; n++) if (santaPassFor(n, SEED).deliver) deliver++;
    expect(deliver / 600).toBeGreaterThan(0.25);
    expect(deliver / 600).toBeLessThan(0.42);
  });
  it('liste les fenêtres qui chevauchent un intervalle', () => {
    const t0 = 1000 * SANTA_PERIOD_S;
    const w = santaWindowsIn(t0, t0 + 1200, SEED);
    expect(w.length).toBeGreaterThanOrEqual(1);
    expect(w.length).toBeLessThanOrEqual(3);
    for (const x of w) expect(x.start < t0 + 1200 && t0 < x.end).toBe(true);
  });
  it('choisit un toit visible (immeuble proche assez large) ou aucun', () => {
    const roof = santaRoof(santaPassFor(1, SEED), facades, 200, 800);
    expect(roof).not.toBeNull();
    expect(roof!.cx).toBe(120); // seul candidat : x 100, w 40
    expect(roof!.y).toBe(80);
    expect(santaRoof(santaPassFor(1, SEED), [facades[1]!, facades[2]!], 200, 800)).toBeNull();
  });
  it('la fenêtre allumée est l’une des trois plus hautes de l’immeuble', () => {
    const roof = santaRoof(santaPassFor(1, SEED), facades, 200, 800)!;
    expect(facades[0]!.lamps.filter((l) => l.home >= 0).map(({ x, y, w, h }) => ({ x, y, w, h }))).toContainEqual(roof.lamp);
  });
  it('la fenêtre du père Noël est une fenêtre de logement, à sa taille', () => {
    const city = cityFacades(1440, 340, SEED);
    const ground = cityMetrics(340).ground;
    let found = 0;
    for (let n = 0; n < 40; n++) {
      const roof = santaRoof(santaPassFor(n, SEED), city, ground, 1440);
      if (!roof?.lamp) continue;
      found++;
      const { x, y, w, h } = roof.lamp;
      const hit = city.flatMap((f) => f.lamps).find((l) => l.x === x && l.y === y && l.w === w && l.h === h);
      expect(hit).toBeDefined();
      expect(hit!.home).toBeGreaterThanOrEqual(0);
    }
    expect(found).toBeGreaterThan(0);
  });
  const deliverPass = (() => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (p.deliver) return p; } })();
  const roof = santaRoof(deliverPass, facades, 200, 800)!;
  const at = (p: number) => santaPoseAt(deliverPass, roof, deliverPass.start + p * SANTA_WINDOW_S, 800, 400);
  it('hors fenêtre : rien', () => {
    expect(santaPoseAt(deliverPass, roof, deliverPass.start - 1, 800, 400)).toBeNull();
    expect(santaPoseAt(deliverPass, roof, deliverPass.end, 800, 400)).toBeNull();
  });
  it('livraison : se pose sur le toit, disparaît, allume la fenêtre, repart', () => {
    expect(at(0.27)).toMatchObject({ landed: true, x: roof.cx, y: roof.y, santa: 'aboard', windowLit: false });
    expect(at(0.35)!.santa).toBe('walking');
    expect(at(0.5)).toMatchObject({ santa: 'hidden', windowLit: true, landed: true });
    expect(at(0.65)!.santa).toBe('walking');
    expect(at(0.72)).toMatchObject({ landed: true, santa: 'aboard', windowLit: false });
    expect(at(0.95)!.landed).toBe(false);
    expect(at(0.1)!.landed).toBe(false);
  });
  it('la livraison arrive de hors écran et repart hors écran', () => {
    const edge = deliverPass.dir > 0 ? -WORLD_MARGIN : 800 + WORLD_MARGIN;
    expect(at(0)!.x).toBe(edge);
    expect(Math.abs(at(0.999)!.x - (deliverPass.dir > 0 ? 800 + WORLD_MARGIN : -WORLD_MARGIN))).toBeLessThan(1);
  });
  it('sans toit, une livraison se rabat sur un passage simple', () => {
    const p = santaPoseAt(deliverPass, null, deliverPass.start + 0.5 * SANTA_WINDOW_S, 800, 400)!;
    expect(p).toMatchObject({ landed: false, santa: 'aboard', windowLit: false });
  });
  it('un passage simple traverse la scène de bord à bord', () => {
    const simple = (() => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (!p.deliver) return p; } })();
    const a = santaPoseAt(simple, null, simple.start, 800, 400)!;
    const b = santaPoseAt(simple, null, simple.end - 0.01, 800, 400)!;
    expect(Math.sign(b.x - a.x)).toBe(simple.dir);
    expect(a.x).toBe(simple.dir > 0 ? -WORLD_MARGIN : 800 + WORLD_MARGIN);
    expect(b.x).toBeCloseTo(simple.dir > 0 ? 800 + WORLD_MARGIN : -WORLD_MARGIN, 0);
  });
});

// ---------- Ghibli (G5) : pose sur une maison de la colline ----------
describe('père Noël sur la colline (Ghibli)', () => {
  const h = (row: 0 | 1 | 2, x: number, chimney: number | null) =>
    ({ row, x, w: 40, h: 30, base: 200, top: 170, s: 0.76, haze: 0.14, wall: [0, 0, 0], roof: [0, 0, 0], kind: 'gable', dormers: false, chimney, trees: null }) as const;
  it('choisit une maison de rang 2 avec cheminée dans la vue, sinon rang 1, sinon rien (Review Focus 4)', () => {
    const pass = santaPassFor(3, 42);
    expect(santaHillRoof(pass, [h(2, 100, 0.6), h(1, 300, 0.5)], 0, 500)!.cx).toBe(120);
    expect(santaHillRoof(pass, [h(2, 100, null), h(1, 300, 0.5)], 0, 500)!.cx).toBe(320);
    expect(santaHillRoof(pass, [h(2, 100, null)], 0, 500)).toBeNull();
    expect(santaHillRoof(pass, [h(2, 900, 0.6)], 0, 500)).toBeNull();
    // Jamais le rang 0 (trop loin), ni une maison trop étroite.
    expect(santaHillRoof(pass, [h(0, 100, 0.6)], 0, 500)).toBeNull();
    expect(santaHillRoof(pass, [{ ...h(2, 100, 0.6), w: 20 }], 0, 500)).toBeNull();
  });
  it('ne garde que les maisons dont le toit n’est pas caché par un immeuble (15 % de recouvrement au plus)', () => {
    const houses = [h(2, 100, 0.6), h(2, 300, 0.6), h(2, 500, 0.6)];
    // Immeuble haut devant la première (la couvre en entier), immeuble bas devant la deuxième (son toit reste au-dessus),
    // immeuble haut qui ne mord que 4 px sur la troisième.
    const facades = [{ x: 90, w: 60, h: 150 }, { x: 290, w: 60, h: 10 }, { x: 536, w: 60, h: 150 }];
    expect(visibleHillHouses(houses, facades, 300).map((x) => x.x)).toEqual([300, 500]);
  });
  it('rend le faîte, la hauteur du toit peint (0,32 h) et la cheminée de la maison', () => {
    const r = santaHillRoof(santaPassFor(3, 42), [h(2, 100, 0.6)], 0, 500)!;
    expect(r).toMatchObject({ cx: 120, y: 170, w: 40, kind: 'gable', chimney: 0.6, s: 0.76, haze: 0.14 });
    expect(r.rh).toBeCloseTo(9.6);
    // Cheminée du peintre (hill-painter) : brique de 3 s à x + w·chimney, haut à top − 4 s + 0,4 rh.
    const hole = chimneyHole(r);
    expect(hole.x).toBeCloseTo(100 + 24 + 1.5 * 0.76);
    expect(hole.y).toBeCloseTo(170 - 4 * 0.76 + 0.4 * 9.6);
  });
  it('posé à mi-pente du versant gauche, la cheminée sur l’autre versant', () => {
    const r = { cx: 100, y: 170, w: 40, rh: 9.6, kind: 'gable', chimney: 0.7, s: 0.76, haze: 0.14 } as const;
    expect(landDx(r)).toBeCloseTo(-9);
    expect(roofSlope(r, 90)).toBeLessThan(0);
    expect(roofSurface(r, 100)).toBeCloseTo(170);
    expect(roofSurface(r, 80)).toBeCloseTo(179.6);
    expect(roofSurface(r, 70)).toBeCloseTo(179.6);
    expect(landDx({ ...r, kind: 'mansard' })).toBeCloseTo(-8);
  });
  it('toits en croupe et en mansarde : plat au milieu, pente vers les bords', () => {
    const hip = { cx: 100, y: 170, w: 40, rh: 10, kind: 'hip', chimney: 0.7, s: 0.76, haze: 0.14 } as const;
    expect(roofSurface(hip, 105)).toBeCloseTo(170);
    expect(roofSurface(hip, 115)).toBeCloseTo(175);
    const mansard = { ...hip, kind: 'mansard' } as const;
    expect(roofSurface(mansard, 100)).toBeCloseTo(171);
    expect(roofSurface(mansard, 118)).toBeCloseTo(171);
    expect(roofSurface(mansard, 121.14)).toBeCloseTo(180, 0);
  });
  const r = { cx: 300, y: 120, w: 40, rh: 9.6, kind: 'gable', chimney: 0.7, s: 0.76, haze: 0.14 } as const;
  const deliver = (dir: 1 | -1) => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (p.deliver && p.dir === dir) return p; } };
  it('atterrissage et décollage continus : pas de saut de position ni d’inclinaison à 23,5 % ni à 75 %, montée le long du versant', () => {
    for (const dir of [1, -1] as const) {
      const pass = deliver(dir);
      const at = (p: number) => santaHillPoseAt(pass, r, pass.start + p * SANTA_WINDOW_S, 800, 400)!;
      const K = santaHillScale(r);
      // Fin d'approche = début de glissade : même point (6 unités avant la place), même inclinaison.
      const a = at(0.235 - 1e-6);
      const b = at(0.235);
      expect(Math.hypot(a.u - b.u, a.y - b.y)).toBeLessThan(0.05);
      expect(Math.abs(a.tilt - b.tilt)).toBeLessThan(0.01);
      expect(b.u).toBeCloseTo(landDx(r) - 6 * K, 1);
      // Fin de glissade = posé : inclinaison raccordée à la pente.
      expect(Math.abs(at(0.25 - 1e-6).tilt - at(0.25).tilt)).toBeLessThan(0.01);
      expect(Math.abs(at(0.25 - 1e-6).u - at(0.25).u)).toBeLessThan(0.05);
      // Décollage : part de sa place avec la pente, puis les patins suivent le versant jusqu'au faîte, jamais dedans.
      const c = at(0.75 - 1e-6);
      const d = at(0.75);
      expect(Math.hypot(c.u - d.u, c.y - d.y)).toBeLessThan(0.05);
      expect(Math.abs(c.tilt - d.tilt)).toBeLessThan(0.01);
      let prev = d;
      for (let p = 0.75; p < 1; p += 0.0005) {
        const s = at(p);
        if (s.u <= 0) {
          expect(s.y).toBeCloseTo(roofSurface(r, r.cx + s.u) - r.y, 1);
          expect(s.tilt).toBeLessThanOrEqual(0);
          expect(s.tilt).toBeGreaterThanOrEqual(d.tilt - 1e-9);
        }
        expect(Math.abs(s.tilt - prev.tilt)).toBeLessThan(0.05);
        expect(Math.hypot(s.u - prev.u, s.y - prev.y)).toBeLessThan(6);
        prev = s;
      }
    }
  });
  it('la hotte posée garde le même point pendant toute la visite (script et aide du calque)', () => {
    const pass = deliver(1);
    const g = santaHillSackGround(pass, r);
    expect(santaHillStepAt(pass, r, pass.start + 0.38 * SANTA_WINDOW_S)!.sack).toEqual(g);
    expect(santaHillStepAt(pass, r, pass.start + 0.62 * SANTA_WINDOW_S)!.sack).toEqual(g);
    expect(g.y).toBeGreaterThan(-20);
  });
  it('livraison : arrive du bord, glisse sur le versant d’arrivée, se pose incliné comme la pente, repart', () => {
    for (const dir of [1, -1] as const) {
      const pass = deliver(dir);
      const at = (p: number) => santaHillPoseAt(pass, r, pass.start + p * SANTA_WINDOW_S, 800, 400)!;
      // Repère local du toit : u = dir·(x − cx) ; le bord d'arrivée est toujours du côté négatif.
      expect(at(0).u).toBeLessThan(-200);
      expect(at(0).landed).toBe(false);
      const land = at(0.27);
      expect(land).toMatchObject({ landed: true, santa: 'aboard', u: landDx(r) });
      expect(land.y).toBeCloseTo(roofSurface(r, r.cx + landDx(r)) - r.y);
      expect(land.tilt).toBeCloseTo(roofSlope(r, r.cx + landDx(r)));
      expect(land.tilt).toBeLessThan(0);
      // Glissade : déjà au niveau du toit, 6 unités avant sa place, puis à sa place.
      expect(at(0.236).y).toBeCloseTo(land.y);
      expect(at(0.236).u).toBeLessThan(land.u);
      expect(at(0.236).slide).toBeGreaterThan(0);
      expect(at(0.5)).toMatchObject({ santa: 'hidden', windowLit: true });
      expect(at(0.95).landed).toBe(false);
      expect(at(0.999).u).toBeGreaterThan(200);
      expect(santaHillPoseAt(pass, r, pass.end, 800, 400)).toBeNull();
    }
  });
  it('script sur le toit : enjambe le traîneau, marche vers la cheminée penché vers l’amont, pose la hotte, descend (rogné), revient', () => {
    const pass = deliver(1);
    const at = (p: number) => santaHillStepAt(pass, r, pass.start + p * SANTA_WINDOW_S);
    expect(at(0.1)).toMatchObject({ gait: 'seated', arms: 'handlebar', sack: 'shoulder' });
    expect(at(0.3) !.gait).toBe('climb');
    const walk = at(0.34)!;
    expect(walk).toMatchObject({ gait: 'walk', arms: 'phone', sack: 'shoulder', yaw: 0 });
    expect(walk.lean).toBeCloseTo(-0.45 * walk.slope);
    expect(walk.slope).toBeLessThan(0);
    expect(at(0.38)).toMatchObject({ gait: 'stand', arms: 'reach' });
    expect(at(0.38)!.sack).not.toBe('shoulder');
    const sink = at(0.398)!;
    expect(sink).toMatchObject({ gait: 'climb', yaw: 12 });
    expect(sink.clip).not.toBeNull();
    expect(sink.y).toBeGreaterThan(sink.clip!);
    expect(sink.x).toBeCloseTo(chimneyHole(r).x - r.cx - landDx(r));
    expect(at(0.5)).toBeNull();
    expect(at(0.66)).toMatchObject({ gait: 'walk', yaw: 8 });
    expect(at(0.72)).toMatchObject({ gait: 'seated' });
    // Continu : pas de saut de plus de 3 px entre deux instants (hors seuils d'apparition).
    let prev = at(0.3)!;
    for (let p = 0.3; p < 0.4; p += 0.001) {
      const s = at(p)!;
      expect(Math.hypot(s.x - prev.x, s.y - prev.y)).toBeLessThan(3);
      prev = s;
    }
  });
  it('échelle 0,55·s, fenêtre de la maison et teinte lointaine', () => {
    expect(santaHillScale(r)).toBeCloseTo(0.418);
    expect(santaHillWindow(r)).toEqual({ x: 280 + 3 * 0.76, y: 120 + 9.6 + 4 * 0.76, w: 3.2 * 0.76, h: 4.5 * 0.76 });
  });
});
