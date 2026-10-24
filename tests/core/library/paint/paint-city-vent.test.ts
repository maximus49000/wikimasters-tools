import { describe, expect, it } from 'vitest';
import { bendOf, gustOf, massAmp, windAt, windOf, type Wind } from '../../../../src/core/library/paint/fond-vent';
import type { TreeModel } from '../../../../src/core/library/paint/hill-trees';

const W = 1600;
const BORNE = 3.5; // base ≤ 0,9 + rafales (≤ 1,5 chacune) qui peuvent se chevaucher
const wind = (w: number, over: Partial<Wind> = {}): Wind => ({ wind: w, dir: 1, wet: 0, storm: false, ...over });

describe('champ de vent', () => {
  it('rafales mémorisées : deux vents en alternance (courant et de naissance) gardent chacun leurs rafales', () => {
    const a: Wind = { wind: 0.2, dir: 1, wet: 0, storm: false };
    const b: Wind = { wind: 0.7, dir: 1, wet: 0, storm: false };
    const first = [gustOf(3, a, 1440), gustOf(3, b, 1440)];
    for (let i = 0; i < 5; i++) {
      expect(gustOf(3, a, 1440)).toBe(first[0]);
      expect(gustOf(3, b, 1440)).toBe(first[1]);
    }
    expect(first[0]!.speed).not.toBe(first[1]!.speed);
    // Un troisième vent chasse le plus ancien ; valeurs identiques une fois recalculées.
    gustOf(3, { ...a, wind: 0.9 }, 1440);
    gustOf(3, b, 1440);
    expect(gustOf(3, a, 1440)).toEqual(first[0]);
  });
  it('est déterministe', () => {
    expect(windAt(300, 12.5, wind(0.6), W)).toBe(windAt(300, 12.5, wind(0.6), W));
  });

  it('calme : zéro', () => {
    expect(windAt(300, 12.5, wind(0.02), W)).toBe(0);
    expect(windAt(300, 12.5, wind(0), W)).toBe(0);
  });

  it('|windAt| ≤ 3,5 × wind', () => {
    for (const w of [0.3, 0.8, 1]) for (let t = 0; t < 120; t += 0.7) for (let x = 0; x <= W; x += 37) expect(Math.abs(windAt(x, t, wind(w), W))).toBeLessThanOrEqual(BORNE * w);
  });

  it('deux arbres à 40 px ne sont pas en phase', () => {
    const a: number[] = [], b: number[] = [];
    for (let t = 0; t < 60; t += 0.05) { a.push(windAt(500, t, wind(0.7), W)); b.push(windAt(540, t, wind(0.7), W)); }
    const m = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length, ma = m(a), mb = m(b);
    let c = 0, va = 0, vb = 0;
    for (let i = 0; i < a.length; i++) { c += (a[i]! - ma) * (b[i]! - mb); va += (a[i]! - ma) ** 2; vb += (b[i]! - mb) ** 2; }
    expect(c / Math.sqrt(va * vb)).toBeLessThan(0.95);
  });

  it('une rafale traverse dans le sens du vent à 50 + 60 × wind px/s', () => {
    const w = 1, speed = 50 + 60 * w;
    // On retire la base turbulente (connue) pour isoler les rafales, puis on suit le maximum local d'une rafale.
    const base = (x: number, t: number) => 0.35 + 0.25 * Math.sin(t * 0.9 - x * 0.012) + 0.18 * Math.sin(t * 1.7 - x * 0.031 + 1.3) + 0.12 * Math.sin(t * 3.1 - x * 0.07 + 2.1);
    const gusts = (x: number, t: number) => windAt(x, t, wind(w), 6000) / w - base(x, t);
    const argmax = (t: number, lo: number, hi: number) => { let bx = lo, bv = -Infinity; for (let x = lo; x <= hi; x += 1) { const v = gusts(x, t); if (v > bv) { bv = v; bx = x; } } return bx; };
    for (const t0 of [20, 47, 83, 130]) {
      const x0 = argmax(t0, 0, 1500), dt = 2;
      const x1 = argmax(t0 + dt, x0 + 0.5 * speed * dt, x0 + 1.5 * speed * dt);
      expect((x1 - x0) / dt).toBeGreaterThan(speed * 0.8);
      expect((x1 - x0) / dt).toBeLessThan(speed * 1.2);
    }
  });

  it('windOf dérive humidité et orage', () => {
    expect(windOf({ cloud: 0, precip: 0.3, wind: 0.5, snow: false }, true)).toEqual({ wind: 0.5, dir: 1, wet: 0.5, storm: true });
    expect(windOf({ cloud: 0, precip: 0, wind: 0.5, snow: false }, false).wet).toBe(0);
  });

  it('bendOf est borné et sensible à la pluie, à l\'orage et à la jeunesse', () => {
    expect(bendOf('poplar', false, 100, wind(1))).toBe(0.55);
    expect(bendOf('poplar', false, -100, wind(1))).toBe(-0.55);
    expect(bendOf('chene', false, 1, wind(1, { wet: 1 }))).toBeGreaterThan(bendOf('chene', false, 1, wind(1)));
    expect(bendOf('chene', false, 1, wind(1, { storm: true }))).toBeCloseTo(0.75 * 1.3 * 0.09);
    expect(bendOf('chene', true, 1, wind(1))).toBeCloseTo(1.8 * 0.09);
    expect(bendOf('inconnu', false, 1, wind(1))).toBeCloseTo(0.09);
  });

  it('massAmp : 1 sans touffe, croît avec l\'écart et la hauteur', () => {
    const m = { foot: { x: 0, y: 0 }, rx: 50, ry: 50, cy: 0, tufts: [{ cluster: 0, x: 0, y: 0 }, { cluster: 1, x: 50, y: -50 }] } as unknown as TreeModel;
    expect(massAmp(m, 7)).toBe(1);
    expect(massAmp(m, 0)).toBeCloseTo(0.8);
    expect(massAmp(m, 1)).toBeCloseTo(0.8 + 1.2 + 0.8 * 50 / 50);
  });
});

// ── Particules et oiseaux des arbres de la rue (tâche 7) ──
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { fondMoment, foliageOf, type FondMoment } from '../../../../src/core/library/paint/fond-time';
import { tuftState } from '../../../../src/core/library/paint/hill-trees';
import type { RuePit } from '../../../../src/core/library/paint/rue-verte-plan';
import { rueTreeModel } from '../../../../src/core/library/paint/rue-verte-painter';
import { BIRD_CYCLE, RUE_CAP_OF, RUE_PARTICLE_CAP, birdAway, nextBirdAway, rueBird, rueParticles, type RueParticle, type RueWeather } from '../../../../src/core/library/paint/rue-sprites';

describe('particules et oiseaux des arbres de la rue', () => {
  const PW = 1440;
  const plan = cityPaintPlan(PW, 340, 7);
  const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
  const day = (m: number, d: number, meteo: Partial<FondMoment['meteo']> = {}): FondMoment => fondMoment({ y: 2026, m, d }, 14 * 60, { cloud: 0.2, precip: 0, wind: 1, snow: false, ...meteo });
  const count = (ps: RueParticle[]) => {
    const n = { feuille: 0, petale: 0, goutte: 0, neige: 0, graine: 0 };
    for (const p of ps) n[p.kind]++;
    return n;
  };
  const caps = { feuille: RUE_PARTICLE_CAP.feuilles, petale: RUE_PARTICLE_CAP.petales, goutte: RUE_PARTICLE_CAP.gouttes, neige: RUE_PARTICLE_CAP.neige, graine: RUE_PARTICLE_CAP.graines };
  it('plafonds { feuilles 40, pétales 30, gouttes 24, neige 16, graines 20 }', () => {
    expect(RUE_PARTICLE_CAP).toEqual({ feuilles: 40, petales: 30, gouttes: 24, neige: 16, graines: 20 });
  });
  for (const [label, D] of [['novembre (feuilles, pluie)', day(11, 10, { precip: 0.3 })], ['avril (pétales)', day(4, 2)], ['mai (graines)', day(5, 20)], ['neige', day(1, 15, { snow: true })]] as const) {
    it(`${label} : plafonds respectés sur 600 s de vent 1, rien hors de [−5, W + 5]`, () => {
      const w = windOf(D.meteo, true);
      let seen = 0;
      for (let t = 0; t < 600; t += 0.5) {
        const ps = rueParticles(pits, D, 1000 + t, w, PW);
        seen += ps.length;
        const n = count(ps);
        for (const k of Object.keys(n) as (keyof typeof n)[]) expect(n[k], k).toBeLessThanOrEqual(caps[k]);
        for (const p of ps) {
          expect(p.x).toBeGreaterThanOrEqual(-5);
          expect(p.x).toBeLessThanOrEqual(PW + 5);
        }
      }
      expect(seen).toBeGreaterThan(0);
    });
  }
  it('une feuille naît à une touffe lâche (distance ≤ rayon de la touffe)', () => {
    const D = day(11, 10);
    const w = windOf(D.meteo, false);
    let checked = 0;
    for (let t = 0; t < 300 && checked < 20; t += 0.25) {
      for (const p of rueParticles(pits, D, 1000 + t, w, PW)) {
        if (p.kind !== 'feuille') continue;
        const near = pits.some((v) => {
          const m = rueTreeModel(v);
          const f = foliageOf(D, 'rue' + Math.round(v.x), v.species);
          return m.tufts.some((tf) => tuftState(tf, f, D, v.species).loose && Math.hypot(p.born.x - tf.x, p.born.y - tf.y) <= tf.rr);
        });
        expect(near).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('calme : aucune particule', () => {
    const D = day(11, 10, { wind: 0, precip: 0 });
    for (let t = 0; t < 60; t += 1) expect(rueParticles(pits, D, 1000 + t, windOf(D.meteo, false), PW)).toEqual([]);
  });
  it('oiseau : jamais la nuit ni sous forte pluie ; entre et sort par un bord', () => {
    const D = day(6, 10, { wind: 0.3 });
    const rainy = day(6, 10, { wind: 0.3, precip: 0.5 });
    const visits: { x: number }[][] = [];
    let cur: { x: number }[] = [];
    for (let t = 0; t < 1200; t += 0.05) {
      // Nuit ou forte pluie dès l'ouverture : aucun oiseau.
      expect(rueBird(pits, D, 1000 + t, PW, -Infinity)).toBeNull();
      const b = rueBird(pits, D, 1000 + t, PW);
      // Visite en cours au début de la fenêtre : ignorée.
      if (b && t === 0) cur = [{ x: NaN }];
      if (b) cur.push(b);
      else if (cur.length) {
        visits.push(cur);
        cur = [];
      }
    }
    expect(visits.length).toBeGreaterThan(0);
    for (const v of visits.filter((vv) => !Number.isNaN(vv[0]!.x))) {
      // Jamais de saut : l'oiseau vole d'un point à l'autre.
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]!.x - v[i - 1]!.x)).toBeLessThan(30);
      const a = v[0]!.x;
      const z = v.at(-1)!.x;
      expect(a < 0 || a > PW).toBe(true);
      expect(z < 0 || z > PW).toBe(true);
    }
    expect(birdAway(D, true)).toBe(true);
    expect(birdAway(rainy, false)).toBe(true);
    expect(birdAway(D, false)).toBe(false);
  });
  it('oiseau : la nuit tombe ou la forte pluie arrive pendant la visite → il repart par un bord, sans disparaître sur place', () => {
    const D = day(6, 10, { wind: 0.3 });
    // Instants de bascule répartis sur 40 cycles (vol d'arrivée, perchoir, départ, hors visite).
    let left = 0;
    for (let flip = 1000; flip < 1000 + 40 * BIRD_CYCLE; flip += 37.3) {
      let state: ReturnType<typeof nextBirdAway> | undefined;
      let prev: { x: number; y: number } | null = null;
      let after = false;
      // La bascule dure 30 s puis le temps redevient propice : rien ne réapparaît en cours de visite.
      for (let t = flip - 60; t < flip + 2 * BIRD_CYCLE; t += 0.05) {
        state = nextBirdAway(state, t >= flip && t < flip + 30, t);
        const b = rueBird(pits, D, t, PW, state?.since ?? null);
        if (prev && !b) expect(prev.x < 0 || prev.x > PW, `disparu sur place à ${t.toFixed(2)} (bascule ${flip})`).toBe(true);
        if (!prev && b && t > flip - 59.9) expect(b.x < 0 || b.x > PW, `apparu sur place à ${t.toFixed(2)} (bascule ${flip})`).toBe(true);
        if (b && t >= flip) after = true;
        // Aucune arrivée après la bascule tant que son cycle dure.
        if (b && t >= flip && Math.floor(t / BIRD_CYCLE) === Math.floor(flip / BIRD_CYCLE) && !prev) expect.fail(`arrivée après la bascule (${flip})`);
        prev = b;
      }
      if (after) left++;
    }
    // Au moins quelques bascules tombent pendant une visite.
    expect(left).toBeGreaterThan(3);
  });
});

// Suivi de chaque particule (clé de naissance) sur 300 s à 15 Hz : rien n'apparaît ni ne disparaît sur place.
describe('particules des arbres de la rue : vies entières', () => {
  const PW = 1440;
  const plan = cityPaintPlan(PW, 340, 7);
  const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
  const DT = 1 / 15;
  const STEP = 100 * DT + 1; // vitesse maximale ≈ 100 px/s
  const ground = Math.max(...pits.map((v) => v.y - 0.5));
  const crowns = pits.map((v) => {
    const m = rueTreeModel(v);
    return { x0: m.box.x0 - v.r, x1: m.box.x1 + v.r, y0: m.box.y0 - v.r, y1: v.y };
  });
  // Changement de météo au milieu du suivi (à 150 s) : `D2` ; sans lui, même météo tout du long.
  const cases: [string, FondMoment, 'feuille' | 'petale' | 'goutte' | 'neige' | 'graine', FondMoment?][] = [
    ['feuilles de novembre, vent 1 puis 0,3 sous la pluie', fondMoment({ y: 2026, m: 11, d: 10 }, 840, { cloud: 0.2, precip: 0, wind: 1, snow: false }), 'feuille', fondMoment({ y: 2026, m: 11, d: 10 }, 841, { cloud: 0.8, precip: 0.5, wind: 0.3, snow: false })],
    ['gouttes : pluie puis éclaircie', fondMoment({ y: 2026, m: 6, d: 10 }, 840, { cloud: 0.8, precip: 0.5, wind: 0.5, snow: false }), 'goutte', fondMoment({ y: 2026, m: 6, d: 10 }, 841, { cloud: 0.2, precip: 0, wind: 1, snow: false })],
    ['graines : vent 1 puis 0,2', fondMoment({ y: 2026, m: 5, d: 20 }, 840, { cloud: 0.2, precip: 0, wind: 1, snow: false }), 'graine', fondMoment({ y: 2026, m: 5, d: 20 }, 841, { cloud: 0.2, precip: 0, wind: 0.2, snow: false })],
    ['neige : vent 1 puis neige sans vent', fondMoment({ y: 2026, m: 1, d: 15 }, 840, { cloud: 0.8, precip: 0, wind: 1, snow: true }), 'neige', fondMoment({ y: 2026, m: 1, d: 15 }, 841, { cloud: 0.8, precip: 0, wind: 0.1, snow: true })],
    ['feuilles de novembre, vent 1', fondMoment({ y: 2026, m: 11, d: 10 }, 840, { cloud: 0.2, precip: 0, wind: 1, snow: false }), 'feuille'],
    ['feuilles de novembre, vent 0,2', fondMoment({ y: 2026, m: 11, d: 10 }, 840, { cloud: 0.2, precip: 0, wind: 0.2, snow: false }), 'feuille'],
    ['pétales d\'avril', fondMoment({ y: 2026, m: 4, d: 2 }, 840, { cloud: 0.2, precip: 0, wind: 1, snow: false }), 'petale'],
    ['graines de mai', fondMoment({ y: 2026, m: 5, d: 20 }, 840, { cloud: 0.2, precip: 0, wind: 1, snow: false }), 'graine'],
    ['gouttes sous la pluie', fondMoment({ y: 2026, m: 6, d: 10 }, 840, { cloud: 0.8, precip: 0.5, wind: 0.5, snow: false }), 'goutte'],
    ['neige au vent', fondMoment({ y: 2026, m: 1, d: 15 }, 840, { cloud: 0.8, precip: 0, wind: 1, snow: true }), 'neige'],
  ];
  for (const [label, D1, kind, D2] of cases) {
    it(`${label} : naissance à la source, aucun saut, fin au sol (fondu) ou par un bord, plafond tenu`, () => {
      const w1 = windOf(D1.meteo, false);
      const w2 = D2 ? windOf(D2.meteo, false) : w1;
      const hist: RueWeather[] = [{ from: -Infinity, w: w1, meteo: D1.meteo }];
      if (D2) hist.push({ from: 1150, w: w2, meteo: D2.meteo });
      const cap = RUE_CAP_OF[kind];
      const prev = new Map<string, RueParticle>();
      const seen = new Set<string>();
      let born = 0;
      let ended = 0;
      const frames = Math.round(300 / DT);
      for (let f = 0; f <= frames; f++) {
        const t = 1000 + f * DT;
        const late = !!D2 && t >= 1150;
        const ps = rueParticles(pits, late ? D2! : D1, t, late ? w2 : w1, PW, hist).filter((p) => p.kind === kind);
        expect(ps.length).toBeLessThanOrEqual(cap);
        expect(new Set(ps.map((p) => p.slot)).size).toBe(ps.length);
        for (const p of ps) expect(p.slot).toBeLessThan(cap);
        const now = new Map(ps.map((p) => [p.id, p]));
        for (const p of ps) {
          const q = prev.get(p.id);
          if (q) {
            expect(Math.hypot(p.x - q.x, p.y - q.y), p.id).toBeLessThanOrEqual(STEP);
            continue;
          }
          // Revenue après une absence : seulement hors du cadre visible (sortie puis retour sous le bord).
          if (seen.has(p.id)) {
            expect(p.x < 0 || p.x > PW, p.id).toBe(true);
            continue;
          }
          seen.add(p.id);
          if (f === 0) continue;
          born++;
          expect(Math.hypot(p.x - p.born.x, p.y - p.born.y), p.id).toBeLessThanOrEqual(STEP);
          expect(crowns.some((c) => p.born.x >= c.x0 && p.born.x <= c.x1 && p.born.y >= c.y0 && p.born.y <= c.y1), p.id).toBe(true);
        }
        if (f < frames)
          for (const [id, q] of prev) {
            if (now.has(id)) continue;
            ended++;
            // Dernière image d'un fondu : au plus un pas de fondu (éclaboussure de 0,3 s à 15 Hz : 0,22).
            const faded = q.alpha < 0.25 && q.y >= ground - 1.5;
            const edge = q.x < 5 + STEP || q.x > PW - 5 - STEP;
            expect(faded || edge, `${id} ${q.x.toFixed(1)},${q.y.toFixed(1)} a=${q.alpha.toFixed(2)}`).toBe(true);
          }
        prev.clear();
        for (const p of ps) prev.set(p.id, p);
      }
      expect(born).toBeGreaterThan(0);
      expect(ended).toBeGreaterThan(0);
    });
  }
});

describe('débit des feuilles', () => {
  it('suit le vent : moins de feuilles à l’écran au vent 0,2 qu’au vent 1 (novembre), aucune sous 0,05', () => {
    const plan = cityPaintPlan(1440, 340, 7);
    const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
    const mean = (wind: number): number => {
      const D = fondMoment({ y: 2026, m: 11, d: 10 }, 840, { cloud: 0.2, precip: 0, wind, snow: false });
      const w = windOf(D.meteo, false);
      let n = 0;
      let f = 0;
      for (let t = 1000; t < 1600; t += 0.5, f++) n += rueParticles(pits, D, t, w, 1440).filter((p) => p.kind === 'feuille').length;
      return n / f;
    };
    const strong = mean(1);
    const light = mean(0.2);
    expect(light).toBeLessThan(strong * 0.7);
    expect(light).toBeGreaterThan(0);
    expect(mean(0.04)).toBe(0);
  });
});
