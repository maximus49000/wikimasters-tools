import { describe, expect, it } from 'vitest';
import { lampsFor } from '../../../../src/core/library/city/lamps';
import { cityMetrics } from '../../../../src/core/library/city/metrics';
import { shopFrame, shopSlotsFor } from '../../../../src/core/library/city/shops/slots';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { stageXs } from '../../../../src/core/library/city/install';
import { createTraffic, streetFixtures } from '../../../../src/core/library/city/traffic/engine';
import { PIT_BUS_STOP_CLEAR, PIT_CROSSING_CLEAR, PIT_HALF, PIT_MIN_GAP, PIT_PITCH, PIT_REPLANT, PIT_SEARCH, PIT_STAGE_CLEAR, pitFootY, pitTopY, rueCuts, rueSlots, sectionOf, streetVerdure, type RueBox, type RueItem, type RuePit, type RuePots } from '../../../../src/core/library/paint/rue-verte-plan';
import { hashString } from '../../../../src/core/library/scene-world';
import { TILE, tileCount, tileItems } from '../../../../src/core/library/paint/city-painter';
import { fondMoment, sweptKey, SUNNY } from '../../../../src/core/library/paint/fond-time';
import { LEAF_BAND, paintRueVerdure, pitTopOf, rueLeafCount, rueSpan } from '../../../../src/core/library/paint/rue-verte-painter';
import { rueTreeOf, rueYoungModel } from '../../../../src/core/library/paint/rue-sprites';
import { rueTreeModelV5 } from '../../../../src/core/library/paint/rue-trees';
import { recordingCtx } from './recording-ctx';

const H = 340;
const overlap = (a0: number, a1: number, b0: number, b1: number): boolean => a1 > b0 && a0 < b1;

describe('verdure de la rue (streetVerdure)', () => {
  it('le plan existant ne change pas (empreinte graine 7 relevée avant la verdure)', () => {
    const got = [720, 1440, 2880].map((w) => {
      const p = cityPaintPlan(w, H, 7) as unknown as Record<string, unknown>;
      return `${w}:` + ['trees', 'furniture', 'doors', 'buildings'].map((k) => hashString(JSON.stringify(p[k]))).join(',');
    });
    expect(got).toEqual([
      '720:1947613349,631844375,2050314074,751929030',
      '1440:1947613349,1840000233,3681931032,2270183717',
      '2880:1947613349,154990294,3390600007,497193754',
    ]);
  });

  it('parterres : en moyenne au moins 25 % des immeubles sans commerce (graines 1-20, 2 880 px), jamais sur une entrée ni un mobilier', () => {
    let free = 0;
    let beds = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const plan = cityPaintPlan(2880, H, seed);
      free += plan.buildings.filter((b) => !b.far && b.x >= 0 && b.x + b.w <= 2880 && !plan.blocked.some((s) => s.x1 - s.x0 > 20 && b.x + b.w / 2 > s.x0 && b.x + b.w / 2 < s.x1)).length;
      const parterres = plan.rue.filter((v): v is RueBox => v.kind === 'parterre');
      beds += parterres.length;
      for (const v of parterres) {
        expect(v.w).toBeGreaterThanOrEqual(8);
        expect(v.w).toBeLessThanOrEqual(22);
        // Entrée (span ± DOOR_MARGIN ; + 2 de dégagement à pleine largeur), mobilier ± 3.
        const pad = v.w === Math.min(22, plan.buildings.find((b) => !b.far && v.x0 >= b.x && v.x1 <= b.x + b.w)!.w * 0.45) ? 2 : 0;
        for (const d of plan.doors) expect(overlap(v.x0, v.x1, d.x - 4 - pad, d.x + 16 + pad)).toBe(false);
        for (const f of plan.furniture) expect(overlap(v.x0, v.x1, f.x - 3, f.x + f.w + 3)).toBe(false);
      }
    }
    expect(beds).toBeGreaterThanOrEqual(0.25 * free);
  });

  for (const seed of [1, 7, 42]) {
    for (const width of [720, 1440, 2880]) {
      const plan = cityPaintPlan(width, H, seed);
      const m = cityMetrics(H);
      const rue = plan.rue;
      const pits = rue.filter((v): v is RuePit => v.kind === 'pit');
      const tag = `graine ${seed}, ${width} px`;
      // Abords sans arbre (scènes, passage piéton, arrêt de bus du trottoir des immeubles) et longueur de rue qui reste.
      const fx = streetFixtures(width, seed, plan.unit);
      const zones = [
        ...stageXs(width, seed).map((x) => ({ x, half: PIT_STAGE_CLEAR * plan.unit })),
        { x: fx.lightX, half: PIT_CROSSING_CLEAR * plan.unit },
        { x: fx.busStop.far, half: PIT_BUS_STOP_CLEAR * plan.unit },
      ];
      const cleared = (() => {
        const spans = zones.map((z) => [Math.max(0, z.x - z.half - PIT_HALF), Math.min(width, z.x + z.half + PIT_HALF)] as const).sort((a, b) => a[0] - b[0]);
        let len = 0;
        let end = -Infinity;
        for (const [a, b] of spans) {
          if (b <= end) continue;
          len += b - Math.max(a, end);
          end = b;
        }
        return len;
      })();

      it(`${tag} : déterministe et identique à plan.rue`, () => {
        const { rue: _omit, ...rest } = plan;
        expect(streetVerdure(rest, width)).toEqual(streetVerdure(rest, width));
        expect(streetVerdure(rest, width)).toEqual(rue);
        // Boulevard (2026-10-24, notes §1 variante A) : une place tous les 60 px sur la rue hors des abords sans arbre, moins
        // les places sautées devant les entrées, portes de local et lampadaires (une porte tous les 30 px environ dans une rue
        // de locaux ; recherche à ± 20, porte vitrée contre le fût seulement) : plancher d'une fosse (vides comprises) par
        // 90 px de longueur libre, arrondi à l'entier inférieur (mesuré sur les graines 1-40 avec l écart minimal de 34 px : une par 68-70 px en moyenne, plancher tenu avec 1 fosse de marge au
        // pire ; l ancien pas de 48-72 px à ± 21 donnait une par 76 à 103 px).
        expect(pits.length).toBeGreaterThanOrEqual(Math.floor((width - cleared) / 90));
      });

      it(`${tag} : fosses hors des entrées, portes des locaux, lampadaires, arbres et mobilier`, () => {
        const lamps = lampsFor(width, seed).map((l) => l.x);
        const doorSpans = plan.doors.map((d) => ({ x0: d.x - 4, x1: d.x + 16 }));
        const shopDoors = shopSlotsFor(width, H, seed).map((s) => shopFrame(s, plan.ground).door);
        for (const p of pits) {
          const a = p.x - 6;
          const b = p.x + 6;
          // Entrée (span ± 4 px) contre la grille réelle de la fosse.
          for (const d of doorSpans) expect(overlap(p.x0, p.x1, d.x0, d.x1)).toBe(false);
          for (const l of lamps) expect(overlap(a, b, l - 9, l + 9)).toBe(false);
          // Porte vitrée ± 4 px contre le fût seulement (la fosse peut passer devant). Le mobilier, côté façade, ne compte pas ici.
          for (const d of shopDoors) expect(p.x > d.x - 4 && p.x < d.x + d.w + 4).toBe(false);
        }
        for (const v of rue.filter((v): v is RueBox => v.kind === 'bac')) {
          for (const d of shopDoors) expect(overlap(v.x0, v.x1, d.x - 4, d.x + d.w + 4)).toBe(false);
          for (const f of plan.furniture) expect(overlap(v.x0, v.x1, f.x - 3, f.x + f.w + 3)).toBe(false);
        }
      });

      it(`${tag} : aucune fosse dans l'emprise des scènes, du passage piéton ni de l'arrêt de bus du trottoir des immeubles`, () => {
        const u = plan.unit;
        for (const p of pits) for (const z of zones) expect(Math.abs(p.x - z.x)).toBeGreaterThanOrEqual(z.half + PIT_HALF);
        // Mêmes emplacements que le trafic (feu, arrêt) et la fête (scènes) : la placette est fixe.
        const w = createTraffic({ width, seed, unit: u, startS: 0 });
        expect(w.light.x).toBe(fx.lightX);
        expect(w.busStop).toEqual(fx.busStop);
      });

      it(`${tag} : couloir des passants libre (fosses à la bordure, bacs et pots à la façade)`, () => {
        for (const p of pits) {
          expect(p.y).toBeGreaterThanOrEqual(plan.curb - 5);
          expect(p.y).toBeLessThanOrEqual(plan.curb);
          expect(p.y).toBeGreaterThan(m.walkY);
        }
        for (const v of rue.filter((v): v is RueBox => v.kind === 'bac' || v.kind === 'parterre')) {
          // Debout contre le mur : bas de la face avant à doorY − 0,1 (pieds des figures qui longent la façade).
          expect(v.y + v.h).toBeCloseTo(m.doorY - 0.1, 9);
          expect(v.y).toBeGreaterThanOrEqual(plan.ground - 5);
        }
        for (const v of rue.filter((v): v is RuePots => v.kind === 'pots')) expect(plan.doors.some((d) => d.x === v.x)).toBe(true);
      });

      // Boulevard (notes §1, variante A) : une place tous les 60 px, centre cherché à ± 20 px, sinon la place reste vide.
      it(`${tag} : pas constant de ${PIT_PITCH} px chaque fosse à ± ${PIT_SEARCH} px de sa place, deux fosses à ${PIT_MIN_GAP} px au moins l'une de l'autre`, () => {
        const slots = rueSlots(seed, width);
        for (let i = 1; i < pits.length; i++) {
          const g = pits[i]!.x - pits[i - 1]!.x;
          expect(g).toBeGreaterThanOrEqual(PIT_MIN_GAP);
          expect(pits[i]!.slot).toBeGreaterThan(pits[i - 1]!.slot);
        }
        for (const p of pits) expect(Math.abs(p.x - slots[p.slot]!)).toBeLessThanOrEqual(PIT_SEARCH);
        // Au moins une place sautée dans la rue (portes, lampadaires, abords) : sinon le test des voisins ne prouve rien.
        if (width >= 1440) expect(pits.length).toBeLessThan(slots.length);
      });

      it(`${tag} : une place sautée ne décale pas ses voisins (mêmes fosses, mêmes tirages, sans les fosses voisines)`, () => {
        // Chaque fosse ne dépend que de sa place : forcer une place vide ne bouge aucune autre fosse (sauf la suivante, qui peut
        // cesser de céder à la fosse retirée), et ses tirages sont ceux de sa place, pas de son rang dans la rue.
        const { rue: _omit, ...rest } = plan;
        const victim = pits[Math.floor(pits.length / 2)]!.slot;
        const without = streetVerdure(rest, width, new Set([victim])).filter((v): v is RuePit => v.kind === 'pit');
        let compared = 0;
        for (const p of pits) {
          if (p.slot === victim || p.slot === victim + 1 || p.slot === victim + 2) continue;
          const same = without.find((q) => q.slot === p.slot);
          expect(same).toBeDefined();
          expect(same!.x).toBe(p.x);
          expect([same!.h, same!.r, same!.lean, same!.young, same!.empty]).toEqual([p.h, p.r, p.lean, p.young, p.empty]);
          compared++;
        }
        expect(compared).toBeGreaterThan(0);
        expect(without.some((q) => q.slot === victim)).toBe(false);
      });

      it(`${tag} : une essence par tronçon (coupé au passage piéton et à l'arrêt de bus), même âge, 1 replantation sur ${PIT_REPLANT} places`, () => {
        const cuts = rueCuts(width, seed, plan.unit);
        const bySection = new Map<number, Set<string>>();
        for (const p of pits) {
          expect(p.section).toBe(sectionOf(cuts, p.x));
          bySection.set(p.section, (bySection.get(p.section) ?? new Set()).add(p.species));
          expect(['platane', 'tilleul', 'robinier', 'frene', 'cerisier']).toContain(p.species);
          if (p.young) {
            expect(p.h).toBe(13 * plan.unit);
            expect(p.r).toBe(4.5 * plan.unit);
          } else {
            expect(Math.abs(p.h - 42 * plan.unit)).toBeLessThanOrEqual(3 * plan.unit + 1e-9);
            expect(Math.abs(p.r - 20 * plan.unit)).toBeLessThanOrEqual(1.5 * plan.unit + 1e-9);
          }
          expect(p.young && p.empty).toBe(false);
          expect(p.finish).toBe(p.empty ? 'terre' : p.young ? 'herbe' : 'grille');
        }
        for (const s of bySection.values()) expect(s.size).toBe(1);
        // Au plus une replantation (jeune ou vide) par dizaine de places consécutives.
        const again = pits.filter((p) => p.young || p.empty).map((p) => p.slot);
        for (let i = 1; i < again.length; i++) expect(again[i]! - again[i - 1]!).toBeGreaterThanOrEqual(PIT_REPLANT);
        expect(new Set(again.map((s) => s % PIT_REPLANT)).size).toBeLessThanOrEqual(1);
      });

      it(`${tag} : pied du fût au centre du carré de terre (walkY + 0,6 → curb − 0,4)`, () => {
        for (const p of pits) {
          expect(p.y).toBeCloseTo(pitFootY(plan.curb, plan.unit), 9);
          expect(pitTopY(plan.curb, plan.unit)).toBeGreaterThan(m.walkY);
          expect(p.x0).toBe(p.x - PIT_HALF);
          expect(p.x1).toBe(p.x + PIT_HALF);
          expect(p.x0).toBeGreaterThanOrEqual(2);
          expect(p.x1).toBeLessThanOrEqual(width - 2);
        }
        expect(pitFootY(plan.curb, plan.unit)).toBeCloseTo(255.4, 1);
        expect(pitTopY(plan.curb, plan.unit)).toBeCloseTo(252.6, 6);
      });

      it(`${tag} : rien hors de [0, largeur]`, () => {
        for (const v of rue) {
          if ('x0' in v) {
            expect(v.x0).toBeGreaterThanOrEqual(0);
            expect(v.x1).toBeLessThanOrEqual(width);
          }
          if ('x' in v) {
            expect(v.x).toBeGreaterThanOrEqual(0);
            expect(v.x).toBeLessThanOrEqual(width);
          }
        }
      });
    }
  }
});

// Peinture de la verdure dans les tranches (tâche 4) : calendrier réel, pas d'arbre (calque animé), couloir des passants libre.
describe('verdure de la rue : peinture (paintRueVerdure)', () => {
  const july = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, SUNNY);
  const dayOf = (doy: number): ReturnType<typeof fondMoment> => {
    const t = new Date(Date.UTC(2026, 0, 1 + doy));
    return fondMoment({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }, 15 * 60, SUNNY);
  };

  it('365 jours : squelette des arbres de rue fixe (axes V5 / segments des jeunes identiques chaque jour), graines 1, 7, 42', () => {
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(1440, H, seed);
      const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
      expect(pits.length).toBeGreaterThan(5);
      const sig = (v: RuePit): number => {
        const tr = rueTreeOf(v);
        return hashString(JSON.stringify(tr.young ? tr.m.segs : tr.m.axes));
      };
      const ref = pits.map(sig);
      // Le modèle hors cache est le même (rien ne dépend de l'ordre des appels).
      for (const v of pits) expect(hashString(JSON.stringify(v.young ? rueYoungModel(v).segs : rueTreeModelV5(v).axes))).toBe(sig(v));
      for (let doy = 0; doy < 365; doy += 3) {
        paintRueVerdure(recordingCtx(), plan, plan.rue, dayOf(doy), 0, 1440);
        expect(pits.map(sig)).toEqual(ref);
      }
    }
  });

  it('jeune arbre (ancien modèle, comme la maquette) : fût de 0,7 px, 20 touffes au plus ; adulte : modèle V5', () => {
    const plan = cityPaintPlan(2880, H, 7);
    const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
    expect(pits.some((v) => v.young)).toBe(true);
    for (const v of pits) {
      const tr = rueTreeOf(v);
      expect(tr.young).toBe(v.young);
      if (tr.young) {
        expect(tr.m.w0).toBeCloseTo(0.7, 6);
        expect(tr.m.tufts.length).toBeLessThanOrEqual(20);
      } else expect(tr.m.axes[0]!.level).toBe(1);
      expect(tr.m.foot).toEqual({ x: v.x, y: v.y });
    }
  });

  it('fosse vide : le carré de terre seulement (bordure + terre) ; fosse plantée : rien au-dessus du carré ; jamais de grille dans la tranche', () => {
    let empties = 0;
    let planted = 0;
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(2880, H, seed);
      for (const v of plan.rue) {
        if (v.kind !== 'pit') continue;
        const top = pitTopOf(v);
        // Des jours sans feuilles mortes au sol (tapis global, testé à part), dont un jour de pluie (flaque).
        for (const D of [july, dayOf(100), { ...dayOf(200), meteo: { cloud: 0.9, precip: 0.6, wind: 0.4, snow: false } }]) {
          const ctx = recordingCtx();
          paintRueVerdure(ctx, plan, [v], D, v.x - 30, v.x + 30);
          // Terre sous chaque fosse : fond #5A4634 sur le carré de 14 px.
          const earth = ctx.ops.findIndex((o) => o.op === 'fillRect' && Math.abs(o.args[0]! - (v.x - 7)) < 1e-9 && o.args[2] === 14 && Math.abs(o.args[1]! - top) < 1e-9);
          expect(earth).toBeGreaterThanOrEqual(0);
          // Plus de grille sur le béton : aucun trait, un seul rectangle encré (la bordure), aucun rectangle de l'ancienne grille
          // (fond #4A4238 de 8 × 3,2).
          expect(ctx.ops.filter((o) => o.op === 'stroke')).toEqual([]);
          const inked = ctx.ops.filter((o) => o.op === 'strokeRect');
          expect(inked).toHaveLength(1);
          expect(inked[0]!.args.map((n) => Math.round(n * 1000) / 1000)).toEqual([Math.round((v.x - 7.8) * 1000) / 1000, Math.round((top - 0.8) * 1000) / 1000, 15.6, 6.8]);
          let fi = 0;
          for (const o of ctx.ops) {
            if (o.op !== 'fill' && o.op !== 'fillRect') continue;
            const color = ctx.fills[fi++];
            if (o.op === 'fillRect') {
              expect(color).not.toBe('#4A4238');
              expect(o.args[2] === 8 && Math.abs(o.args[3]! - 3.2) < 1e-9).toBe(false);
            }
          }
          if (v.empty) {
            empties++;
            for (const [x, y] of ctx.points) {
              expect(Math.abs(x - v.x)).toBeLessThanOrEqual(7.8 + 1e-6);
              expect(y).toBeGreaterThanOrEqual(top - 0.8 - 1e-6);
              expect(y).toBeLessThanOrEqual(top + 5.4 + 0.6 + 1e-6);
            }
            expect(ctx.ops.filter((o) => o.op === 'arc' || o.op === 'ellipse').length).toBe(0);
          } else {
            planted++;
            for (const [, y] of ctx.points) expect(y).toBeGreaterThanOrEqual(top - 0.8 - 1e-6);
          }
        }
      }
    }
    expect(empties).toBeGreaterThan(0);
    expect(planted).toBeGreaterThan(0);
  });

  const dates = (): ReturnType<typeof fondMoment>[] => [july, dayOf(20), { ...dayOf(40), meteo: { cloud: 1, precip: 0.5, wind: 0.3, snow: true } }, dayOf(110), dayOf(200), { ...dayOf(250), meteo: { cloud: 0.9, precip: 0.6, wind: 0.4, snow: false } }];
  const BOX_SHADOW = 'rgba(70,50,130,0.2)';

  it('couloir des passants (doorY → walkY) : seulement l’ombre portée des bacs et parterres et le rebord du carré de terre (au sol), jamais un objet', () => {
    const m = cityMetrics(H);
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(2880, H, seed);
      const boxes = plan.rue.filter((v): v is RueBox => v.kind === 'bac' || v.kind === 'parterre');
      const pitsAll = plan.rue.filter((v): v is RuePit => v.kind === 'pit');
      for (const D of dates()) {
        // Sans le tapis de feuilles mortes (posé à plat sur tout le trottoir, sous les pieds des passants).
        const ctx = recordingCtx();
        paintRueVerdure(ctx, plan, plan.rue, D, 0, 2880);
        expect(rueLeafCount(plan, D)).toBe(0);
        for (const [x, y] of ctx.points) {
          if (y <= m.doorY || y >= m.walkY) continue;
          // Bordure de pierre du carré (0,8 px au-dessus de la terre, à plat sur le trottoir, comme la maquette).
          if (pitsAll.some((v) => Math.abs(x - v.x) <= 7.8 + 1e-6 && y >= pitTopOf(v) - 0.8 - 1e-6)) continue;
          // Ombre d'un bac ou d'un parterre : bande de 1,2 px sous son pied, décalée de 1 à 2,5 px à droite.
          expect(y).toBeLessThanOrEqual(m.doorY - 0.1 + 1.2 + 1e-6);
          expect(boxes.some((b) => x >= b.x0 + 1 - 1e-6 && x <= b.x1 + 2.5 + 1e-6)).toBe(true);
        }
      }
    }
  });

  it('bacs, parterres et pots debout contre le mur : tout leur dessin (hors ombre portée) au-dessus de doorY', () => {
    const m = cityMetrics(H);
    const kinds = new Set<string>();
    let n = 0;
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(2880, H, seed);
      const items: RueItem[] = plan.rue.filter((v) => v.kind === 'bac' || v.kind === 'parterre' || v.kind === 'pots');
      // Le plan ne pose aujourd'hui aucun parterre (voir le rapport de la tâche 4) : un parterre de haie et un de fleurs
      // placés comme le plan les placerait (pied à doorY − 0,1), à l'endroit d'un bac.
      const bac = items.find((v): v is RueBox => v.kind === 'bac')!;
      for (const hedge of [true, false]) items.push({ kind: 'parterre', x0: bac.x0, x1: bac.x0 + 18, y: m.doorY - 0.1 - 3.5, w: 18, h: 3.5, flowerSeed: bac.flowerSeed, hedge });
      for (const v of items) kinds.add(v.kind);
      for (const D of dates()) {
        for (const v of items) {
          const ctx = recordingCtx();
          // L'ombre portée (peinture au sol) n'est pas enregistrée : seuls les points de l'objet restent.
          const fillRect = ctx.fillRect;
          ctx.fillRect = (x, y, w, h) => (ctx.fillStyle === BOX_SHADOW ? undefined : fillRect(x, y, w, h));
          paintRueVerdure(ctx, plan, [v], D, 0, 2880);
          for (const [, y] of ctx.points) expect(y).toBeLessThanOrEqual(m.doorY + 1e-6);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(50);
    expect([...kinds].sort()).toEqual(['bac', 'parterre', 'pots']);
  });

  it('feuilles mortes : à l’automne entre le pied des façades et la bordure, aucune une fois la rue balayée', () => {
    const plan = cityPaintPlan(1440, H, 7);
    let seen = 0;
    for (let d = 1; d <= 30; d++) {
      const D = fondMoment({ y: 2026, m: 11, d }, 16 * 60, SUNNY);
      const n = rueLeafCount(plan, D);
      const ctx = recordingCtx();
      paintRueVerdure(ctx, plan, [], D, 0, 1440);
      const rects = ctx.ops.filter((o) => o.op === 'fillRect');
      // n feuilles par bande de LEAF_BAND px (bandes qui touchent la rue, marge de 40 px comprise).
      expect(rects.length).toBeLessThanOrEqual(n * Math.ceil((1440 + 80) / LEAF_BAND + 1));
      if (sweptKey(D, 16, plan.seed)) expect(n).toBe(0);
      for (const o of rects) {
        expect(o.args[1]!).toBeGreaterThanOrEqual(plan.ground);
        expect(o.args[1]! + o.args[3]!).toBeLessThanOrEqual(plan.curb + 1);
      }
      seen += rects.length;
    }
    expect(seen).toBeGreaterThan(1000);
    // Tirage par bande : une rue plus large garde les mêmes feuilles au début.
    const D = fondMoment({ y: 2026, m: 11, d: 20 }, 16 * 60, SUNNY);
    const wide = cityPaintPlan(2160, H, 7);
    const a = recordingCtx();
    const b = recordingCtx();
    paintRueVerdure(a, plan, [], D, 0, 360);
    paintRueVerdure(b, wide, [], D, 0, 360);
    expect(rueLeafCount(plan, D)).toBeGreaterThan(0);
    expect(b.ops).toEqual(a.ops);
    // Juillet : aucune.
    expect(rueLeafCount(plan, july)).toBe(0);
  });

  it('une tranche peint exactement la part de la rue qui la touche (deux tranches = une rue)', () => {
    const plan = cityPaintPlan(1080, H, 1);
    const D = fondMoment({ y: 2026, m: 11, d: 12 }, 16 * 60, { cloud: 0.8, precip: 0.6, wind: 0.4, snow: false });
    for (let t = 0; t < tileCount(1080); t++) {
      const it = tileItems(plan, t).rue;
      for (const v of plan.rue) {
        const [a, b] = rueSpan(v);
        expect(it.includes(v)).toBe(a < (t + 1) * TILE + 2 && b > t * TILE - 2);
      }
      const ctx = recordingCtx();
      paintRueVerdure(ctx, plan, it, D, t * TILE, Math.min(1080, (t + 1) * TILE));
      // Toute fosse dont l'étendue touche la tranche y est peinte (bordure : fillRect de 15,6 px de large).
      for (const v of it) if (v.kind === 'pit') expect(ctx.ops.some((o) => o.op === 'fillRect' && Math.abs(o.args[0]! - (v.x - 7.8)) < 1e-9 && Math.abs(o.args[2]! - 15.6) < 1e-9)).toBe(true);
    }
  });
});

// ── Couches cuites des arbres de rue (tâche 3 des arbres naturels) : couche fixe = tronc + lèvre + finition, couches au vent =
// bois et nuages d'une charpentière (touffes seules pour les jeunes), boîte des sprites, vent par cisaillement. ──
import { RUE_SHEAR_MAX, paintRueLayer, rueLayers, rueSpriteBox, rueTreePose } from '../../../../src/core/library/paint/rue-sprites';
import { paintRueClouds, paintRueSkeleton, rueCloudItems, rueLayerOfMass, rueTreeKey, type RueAxis } from '../../../../src/core/library/paint/rue-trees';
import { paintPitFront } from '../../../../src/core/library/paint/rue-verte-painter';
import { paintLeaves } from '../../../../src/core/library/paint/hill-trees';
import { foliageOf } from '../../../../src/core/library/paint/fond-time';
import { windOf } from '../../../../src/core/library/paint/fond-vent';

describe('arbres de rue : couches cuites (rue-sprites)', () => {
  const day = (m: number, d: number, meteo: Partial<ReturnType<typeof fondMoment>['meteo']> = {}) => fondMoment({ y: 2026, m, d }, 15 * 60, { ...SUNNY, ...meteo });
  const plans = [1, 7, 42].map((seed) => cityPaintPlan(2880, H, seed));
  const planted = plans.flatMap((p) => p.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty));
  const adults = planted.filter((v) => !v.young);
  const young = planted.filter((v) => v.young);
  const isLip = (o: { op: string; args: number[] }, v: RuePit): boolean => o.op === 'ellipse' && o.args[0] === v.x && Math.abs(o.args[1]! - (v.y + 0.9)) < 1e-9 && o.args[2] === 3.6 && o.args[3] === 0.9;
  const opsOf = (paint: (ctx: ReturnType<typeof recordingCtx>) => void) => {
    const ctx = recordingCtx();
    paint(ctx);
    return ctx.ops;
  };

  it('il y a des adultes et des jeunes', () => {
    expect(adults.length).toBeGreaterThan(20);
    expect(young.length).toBeGreaterThan(0);
  });

  it('couches : ombre, couche fixe, puis une couche par charpentière', () => {
    for (const v of planted) {
      const tr = rueTreeOf(v);
      const layers = rueLayers(tr);
      expect(layers.slice(0, 2)).toEqual(['shadow', 'trunk']);
      const n = tr.young ? tr.m.segs.filter((sg) => sg.lv === 1).length : tr.m.masses;
      expect(layers.slice(2)).toEqual(Array.from({ length: Math.min(6, Math.max(1, n)) }, (_, k) => `c${k}`));
    }
  });

  it('couche fixe : la lèvre de terre juste après le dernier trait du fût, puis la finition (grille des adultes, herbe des jeunes)', () => {
    const D = day(1, 15, { snow: true, cloud: 1 });
    for (const v of [...adults.slice(0, 30), ...young]) {
      const tr = rueTreeOf(v);
      const ops = opsOf((ctx) => paintRueLayer(ctx, v, 'trunk', D));
      const front = opsOf((ctx) => paintPitFront(ctx, v));
      // Le devant du carré est la fin exacte de la couche ; avant lui, tout le dessin du fût.
      expect(ops.slice(ops.length - front.length)).toEqual(front);
      const lip = ops.findIndex((o) => isLip(o, v));
      expect(lip).toBe(ops.length - front.length + 1);
      if (!tr.young) {
        const skel = opsOf((ctx) => paintRueSkeleton(ctx, tr.m, { wet: 0, snow: true, layer: 'fixed' }));
        expect(skel.length).toBeGreaterThan(0);
        expect(ops.slice(0, skel.length)).toEqual(skel);
        expect(skel.length).toBe(ops.length - front.length);
      } else expect(ops.slice(0, lip).some((o) => o.op === 'fill')).toBe(true);
      const after = ops.slice(lip + 1);
      if (v.finish === 'grille') {
        expect(v.young).toBe(false);
        expect(after.some((o) => o.op === 'ellipse' && o.args[2] === 6.4 && Math.abs(o.args[3]! - 6.4 * 0.38) < 1e-9)).toBe(true);
      } else {
        expect(v.finish).toBe('herbe');
        expect(v.young).toBe(true);
        expect(after.some((o) => o.op === 'arc' && o.args[2] === 0.55)).toBe(true);
      }
    }
  });

  it('adultes : couche fixe = le tronc seul ; couche k = bois (niveaux ≥ 2) et nuages de sa charpentière ; ensemble, tout l’arbre', () => {
    for (const D of [day(7, 7), day(11, 5, { precip: 0.5 }), day(4, 1)]) {
      const wet = D.meteo.precip > 0 ? 1 : 0;
      for (const v of adults.slice(0, 25)) {
        const tr = rueTreeOf(v);
        if (tr.young) continue;
        let clouds = 0;
        const seen = new Set<number>();
        for (const l of rueLayers(tr).slice(2)) {
          const k = Number(l.slice(1));
          const got = opsOf((ctx) => paintRueLayer(ctx, v, l, D));
          const want = opsOf((ctx) => {
            paintRueSkeleton(ctx, tr.m, { wet, snow: false, layer: k });
            paintRueClouds(ctx, tr.m, D, { mass: k, wet });
          });
          expect(got).toEqual(want);
          clouds += rueCloudItems(tr.m, D, { mass: k }).length;
          tr.m.axes.forEach((a, i) => a.level >= 2 && rueLayerOfMass(a.mass) === k && seen.add(i));
        }
        expect(clouds).toBe(rueCloudItems(tr.m, D).length);
        // Chaque axe de niveau ≥ 2 dans exactement une couche de charpentière ; le tronc dans la couche fixe.
        expect(seen.size).toBe(tr.m.axes.filter((a) => a.level >= 2).length);
        expect(tr.m.axes.filter((a) => a.level === 1)).toHaveLength(1);
      }
    }
  });

  it('jeunes : couches au vent = leurs touffes seules (bois dans la couche fixe)', () => {
    const D = day(7, 7);
    for (const v of young) {
      const tr = rueTreeOf(v);
      if (!tr.young) continue;
      const f = foliageOf(D, rueTreeKey(v), v.species);
      for (const l of rueLayers(tr).slice(2)) {
        const want = opsOf((ctx) => paintLeaves(ctx, tr.m, f, D, 0, { which: Number(l.slice(1)), wet: 0 }));
        expect(opsOf((ctx) => paintRueLayer(ctx, v, l, D))).toEqual(want);
      }
    }
  });

  it('boîte des sprites : tout ce que les couches peignent y tient, couches de charpentière cisaillées au maximum comprises', () => {
    const dates = [day(7, 7), day(11, 5, { precip: 0.6 }), day(1, 15, { snow: true, cloud: 1 }), day(4, 1), day(10, 20)];
    for (const v of [...adults.slice(0, 60), ...young]) {
      const b = rueSpriteBox(v);
      const tr = rueTreeOf(v);
      const y0s = rueTreePose(v, tr, 0, windOf({ cloud: 0, precip: 0, wind: 0, snow: false }, false)).masses.map((p) => p.y0);
      for (const D of dates)
        rueLayers(tr).forEach((l, li) => {
          const ctx = recordingCtx();
          paintRueLayer(ctx, v, l, D);
          const y0 = l[0] === 'c' ? y0s[li - 2]! : null;
          for (const sh of y0 === null ? [0] : [-RUE_SHEAR_MAX, RUE_SHEAR_MAX]) {
            const out = ctx.points.filter(([x, y]) => {
              const X = y0 === null ? x : x + sh * (y - y0);
              return X < b.x - 1e-6 || X > b.x + b.w + 1e-6 || y < b.y - 1e-6 || y > b.y + b.h + 1e-6;
            });
            expect(out, `${v.x} ${l}`).toEqual([]);
          }
        });
    }
  });

  it('vent (tempête sous la pluie, vent 0,5) : le haut bouge de plusieurs px, le pied des charpentières reste au tronc, chaque nuage reste sur son axe', () => {
    const W = 2880;
    const dist = (a: RueAxis, tf: (x: number, y: number) => [number, number], x: number, y: number): number => {
      let best = Infinity;
      const pts = a.pts.map(([px, py]) => tf(px, py));
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, y0] = pts[i]!;
        const [x1, y1] = pts[i + 1]!;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - x0 - t * dx, y - y0 - t * dy));
      }
      return best;
    };
    let topMax = 0;
    for (const w of [windOf({ cloud: 1, precip: 1, wind: 1, snow: false }, true), windOf({ cloud: 0, precip: 0, wind: 0.5, snow: false }, false)]) {
      for (const v of adults.slice(0, 30)) {
        const tr = rueTreeOf(v);
        if (tr.young) continue;
        for (let t = 0; t < 40; t += 1.3) {
          const p = rueTreePose(v, tr, 1000 + t, w, W);
          p.masses.forEach((mv, k) => {
            expect(Math.abs(mv.c)).toBeLessThanOrEqual(RUE_SHEAR_MAX + 1e-12);
            // Matrice (1 0 c 1 e 0) : le pied (y = y0) ne bouge pas.
            const tf = (x: number, y: number): [number, number] => [x + mv.c * y + mv.e, y];
            expect(Math.abs(tf(0, mv.y0)[0])).toBeLessThan(1e-9);
            const top = Math.min(...tr.m.axes.filter((a) => rueLayerOfMass(a.mass) === k && a.level >= 2).flatMap((a) => a.pts.map((q) => q[1])));
            topMax = Math.max(topMax, Math.abs(mv.c * (top - mv.y0)));
            // Après la même transformation, chaque nuage reste à moins de 1,3 r de son axe porteur (borne du modèle au repos).
            for (const c of tr.m.clouds) {
              if (rueLayerOfMass(c.mass) !== k) continue;
              const [cx, cy] = tf(c.x, c.y);
              expect(dist(tr.m.axes[c.axis]!, tf, cx, cy)).toBeLessThanOrEqual(1.3 * c.r + 1e-9);
            }
          });
        }
      }
    }
    // Comme les grappes d'avant : le haut des couronnes part de plusieurs px par grand vent.
    expect(topMax).toBeGreaterThan(4);
  });
});
