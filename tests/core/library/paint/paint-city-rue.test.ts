import { describe, expect, it } from 'vitest';
import { lampsFor } from '../../../../src/core/library/city/lamps';
import { cityMetrics } from '../../../../src/core/library/city/metrics';
import { shopFrame, shopSlotsFor } from '../../../../src/core/library/city/shops/slots';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { streetVerdure, type RueBox, type RueItem, type RuePit, type RuePots } from '../../../../src/core/library/paint/rue-verte-plan';
import { hashString } from '../../../../src/core/library/scene-world';
import { TILE, tileCount, tileItems } from '../../../../src/core/library/paint/city-painter';
import { fondMoment, sweptKey, SUNNY } from '../../../../src/core/library/paint/fond-time';
import { treeModel } from '../../../../src/core/library/paint/hill-trees';
import { LEAF_BAND, paintRueVerdure, rueLeafCount, rueSpan, rueTreeModel } from '../../../../src/core/library/paint/rue-verte-painter';
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

      it(`${tag} : déterministe et identique à plan.rue`, () => {
        const { rue: _omit, ...rest } = plan;
        expect(streetVerdure(rest, width)).toEqual(streetVerdure(rest, width));
        expect(streetVerdure(rest, width)).toEqual(rue);
        // Un arbre tous les 70-110 px (décision du 2026-10-20), moins les pas sautés devant les portes et les lampadaires :
        // mesuré au 2026-10-24 au moins 0,78 × largeur / 90 fosses (vides comprises) ; plancher 0,75.
        expect(pits.length).toBeGreaterThanOrEqual((0.75 * width) / 90);
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
          for (const t of plan.trees) expect(overlap(a, b, t.x - t.r - 6, t.x + t.r + 6)).toBe(false);
          // Porte vitrée ± 4 px contre la grille réelle de la fosse (x0 … x1). Le mobilier, côté façade, ne compte pas ici.
          for (const d of shopDoors) expect(overlap(p.x0, p.x1, d.x - 4, d.x + d.w + 4)).toBe(false);
        }
        for (const v of rue.filter((v): v is RueBox => v.kind === 'bac')) {
          for (const d of shopDoors) expect(overlap(v.x0, v.x1, d.x - 4, d.x + d.w + 4)).toBe(false);
          for (const f of plan.furniture) expect(overlap(v.x0, v.x1, f.x - 3, f.x + f.w + 3)).toBe(false);
        }
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

      // Pas de 70-110 px, centre libre cherché à ± 21 px : jamais moins de 70 − 2 × 21 = 28 px entre deux fosses ; au
      // moins 65 % des écarts entre 56 et 124 px (mesuré : 67 % au pire) (le reste : essai décalé loin, ou pas sauté devant une suite de portes).
      it(`${tag} : fosses dans l'ordre, au moins 28 px, 65 % des écarts entre 56 et 124 px`, () => {
        const gaps = pits.slice(1).map((p, i) => p.x - pits[i]!.x);
        for (const g of gaps) expect(g).toBeGreaterThanOrEqual(28);
        const inRange = gaps.filter((g) => g >= 56 && g <= 124).length;
        expect(inRange).toBeGreaterThanOrEqual(0.65 * gaps.length);
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

  it('365 jours : squelette des arbres de rue fixe (trunkBox et span identiques chaque jour), graines 1, 7, 42', () => {
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(1440, H, seed);
      const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
      expect(pits.length).toBeGreaterThan(5);
      const ref = pits.map((v) => JSON.stringify([rueTreeModel(v).trunkBox, rueTreeModel(v).span]));
      // Le modèle hors cache est le même (rien ne dépend de l'ordre des appels).
      const v0 = pits[0]!;
      const fresh = treeModel('rue' + Math.round(v0.x), v0.species, { x: v0.x, y: v0.y }, v0.h, v0.r * 2, v0.young ? 3 : 4, v0.r * (v0.young ? 0.42 : 0.3), v0.young ? 20 : 60, v0.young ? 0.7 : 1.3 + v0.r * 0.07);
      expect(JSON.stringify([fresh.trunkBox, fresh.span])).toBe(ref[0]);
      for (let doy = 0; doy < 365; doy++) {
        const D = dayOf(doy);
        paintRueVerdure(recordingCtx(), plan, plan.rue, D, 0, 1440);
        expect(pits.map((v) => JSON.stringify([rueTreeModel(v).trunkBox, rueTreeModel(v).span]))).toEqual(ref);
      }
    }
  });

  it('jeune arbre : fût de 0,7 px, 3 niveaux, 20 touffes au plus ; adulte : fût de 1,3 + 0,07 r', () => {
    const plan = cityPaintPlan(2880, H, 7);
    const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
    for (const v of pits) {
      const m = rueTreeModel(v);
      expect(m.w0).toBeCloseTo(v.young ? 0.7 : 1.3 + v.r * 0.07, 6);
      expect(m.tufts.length).toBeLessThanOrEqual(v.young ? 20 : 60);
      expect(m.foot).toEqual({ x: v.x, y: v.y });
    }
  });

  it('fosse vide : la grille et la terre seulement (ni tronc ni feuilles) ; fosse plantée : rien au-dessus du pied fleuri', () => {
    let empties = 0;
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(2880, H, seed);
      for (const v of plan.rue) {
        if (v.kind !== 'pit') continue;
        // Des jours sans feuilles mortes au sol (tapis global, testé à part), dont un jour de pluie (flaque).
        for (const D of [july, dayOf(100), { ...dayOf(200), meteo: { cloud: 0.9, precip: 0.6, wind: 0.4, snow: false } }]) {
          const ctx = recordingCtx();
          paintRueVerdure(ctx, plan, [v], D, v.x - 30, v.x + 30);
          const own = ctx.points;
          if (v.empty) {
            empties++;
            for (const [x, y] of own) {
              expect(Math.abs(x - v.x)).toBeLessThanOrEqual(4 + 1e-6);
              expect(Math.abs(y - v.y)).toBeLessThanOrEqual(1.6 + 1e-6);
            }
            expect(ctx.ops.filter((o) => o.op === 'arc').length).toBe(0);
          } else for (const [, y] of own) expect(y).toBeGreaterThanOrEqual(v.y - 3.2);
        }
      }
    }
    expect(empties).toBeGreaterThan(0);
  });

  const dates = (): ReturnType<typeof fondMoment>[] => [july, dayOf(20), { ...dayOf(40), meteo: { cloud: 1, precip: 0.5, wind: 0.3, snow: true } }, dayOf(110), dayOf(200), { ...dayOf(250), meteo: { cloud: 0.9, precip: 0.6, wind: 0.4, snow: false } }];
  const BOX_SHADOW = 'rgba(70,50,130,0.2)';

  it('couloir des passants (doorY → walkY) : seulement l’ombre portée des bacs et parterres (au sol), jamais un objet', () => {
    const m = cityMetrics(H);
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(2880, H, seed);
      const boxes = plan.rue.filter((v): v is RueBox => v.kind === 'bac' || v.kind === 'parterre');
      for (const D of dates()) {
        // Sans le tapis de feuilles mortes (posé à plat sur tout le trottoir, sous les pieds des passants).
        const ctx = recordingCtx();
        paintRueVerdure(ctx, plan, plan.rue, D, 0, 2880);
        expect(rueLeafCount(plan, D)).toBe(0);
        for (const [x, y] of ctx.points) {
          if (y <= m.doorY || y >= m.walkY) continue;
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
      // Toute fosse dont l'étendue touche la tranche y est peinte (grille : fillRect de 8 × 3,2).
      for (const v of it) if (v.kind === 'pit') expect(ctx.ops.some((o) => o.op === 'fillRect' && o.args[0] === v.x - 4 && o.args[2] === 8)).toBe(true);
    }
  });
});
