import { describe, expect, it } from 'vitest';
import { HILL_ROWS, cityPaintPlan, hillCrestY } from '../../../../src/core/library/paint/city-plan';
import { HILL_SLICE_ANDROID, HILL_SLICE_DESKTOP, hillSlices } from '../../../../src/core/library/paint/hill-wind';
import { windOf, type Wind } from '../../../../src/core/library/paint/fond-vent';
import { PAINT_VERSION, TILE, hillCanopyBox, paintCityTile, tileCount, type HillPart } from '../../../../src/core/library/paint/city-painter';
import { fondMoment, SUNNY } from '../../../../src/core/library/paint/fond-time';
import { hashString } from '../../../../src/core/library/scene-world';
import { recordingCtx, type Op, type RecordingCtx } from './recording-ctx';

// Colline au vent (PR 3b, tâche 1) : la tranche se peint en parties (sans houppiers, houppiers d'un groupe, écran d'un
// groupe) ; 'all' reste le flux d'avant la PR, et les parties s'entrelacent exactement pour le redonner.
const H = 340;
const W = 1440;
const MOMENTS = {
  juillet: fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, SUNNY),
  novembre: fondMoment({ y: 2026, m: 11, d: 10 }, 10 * 60, SUNNY),
  neige: fondMoment({ y: 2027, m: 1, d: 15 }, 12 * 60, { cloud: 1, precip: 0.5, wind: 0.3, snow: true }),
};
const GROUPS = [0, 1, 2] as const;

// Empreintes relevées sur le code d'avant la PR (84487e6a) : par tranche, hashString des opérations puis des remplissages.
// Graine 1 : dernière tranche (x = 1080-1440) relevée après le retrait de l'ancien platane du plan (x = 1155, 2026-10-24),
// seule différence voulue ; les graines 7 et 42 n'en ont pas. Toutes relevées à nouveau après l'alignement des fosses en
// boulevard puis après l'écart minimal de 34 px (arbres de la rue V5, tâche 1, 2026-10-24 : fosses déplacées dans chaque tranche, colline inchangée ; seule la graine 7 a bougé au 2e relevé : dernière tranche).
// Relevées encore après le carré de terre des fosses (tâche 3 : bordure + terre dans la tranche, plus de grille sur le béton,
// ombre du fût allongée à la bordure) : toutes les tranches (chacune a des fosses), seul le code de la rue a changé.
const BEFORE: Record<string, string> = {
  '1-juillet': '431429720,2651167681,3165554119,2296335660,3821020363,1877171718,2510428731,3512358799',
  '1-novembre': '1549747174,2373032673,4041572797,1362000795,3328751826,1351790967,4031420366,406051726',
  '1-neige': '257960980,2600017795,1940153268,78223882,3221107136,4046739581,4234872019,315982605',
  '7-juillet': '1947061167,2019324488,1772180022,1578408995,1172947082,2830612714,341158931,3583953859',
  '7-novembre': '888718203,260205992,3454517300,218652077,3868185285,2359866576,1077301210,656276304',
  '7-neige': '1962123612,692309573,1608515451,28408619,1194219093,3166754651,689904178,2170816868',
  '42-juillet': '2367159012,2742813369,1454145404,4212253929,2499521057,2525063333,2896439972,654345317',
  '42-novembre': '253897123,1627403496,2864602840,3511841582,3905704966,4077320639,1472772718,618151749',
  '42-neige': '3050447902,3580099493,2852401440,3659500483,1626366491,55209550,2564397702,645693276',
};

const run = (plan: ReturnType<typeof cityPaintPlan>, t: number, D: ReturnType<typeof fondMoment>, part?: HillPart): RecordingCtx => {
  const ctx = recordingCtx();
  if (part === undefined) paintCityTile(ctx, plan, t, D);
  else paintCityTile(ctx, plan, t, D, part);
  return ctx;
};
const key = (o: Op): string => o.op + '|' + o.args.join(',');

// Longueur de l'accord entre `a` à partir de i et `b` à partir de j (borné : sert à départager les candidats).
const runLen = (a: string[], i: number, b: string[], j: number): number => {
  let n = 0;
  while (n < 64 && i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n++;
  return n;
};
// `all` est-il l'entrelacement de `base` et des flux `canopies`, chacun lu dans l'ordre ? À chaque pas, le candidat qui
// s'accorde le plus longtemps avec la suite de `all` est pris (les coordonnées sont des flottants : les flux divergent vite).
function interleaves(all: string[], base: string[], canopies: string[][]): boolean {
  let i = 0;
  const c = canopies.map(() => 0);
  for (let p = 0; p < all.length; p++) {
    let best = -1;
    let bestLen = 0;
    const lb = runLen(all, p, base, i);
    if (lb > bestLen) [best, bestLen] = [-1, lb];
    canopies.forEach((s, g) => {
      const l = runLen(all, p, s, c[g]!);
      if (l > bestLen) [best, bestLen] = [g, l];
    });
    if (bestLen === 0) return false;
    if (best < 0) i++;
    else c[best]!++;
  }
  return i === base.length && c.every((n, g) => n === canopies[g]!.length);
}

describe('colline au vent : tranche peinte en parties', () => {
  it('PAINT_VERSION vaut 16', () => {
    expect(PAINT_VERSION).toBe(16);
  });

  for (const seed of [1, 7, 42]) {
    const plan = cityPaintPlan(W, H, seed);
    for (const [name, D] of Object.entries(MOMENTS)) {
      const tag = `graine ${seed}, ${name}`;

      it(`${tag} : 'all' (et l'appel sans partie) donne le flux d'avant la PR`, () => {
        const hs: number[] = [];
        for (let t = 0; t < tileCount(W); t++) {
          const a = run(plan, t, D);
          const b = run(plan, t, D, 'all');
          expect(b.ops).toEqual(a.ops);
          hs.push(hashString(JSON.stringify(a.ops)), hashString(JSON.stringify(a.fills)));
        }
        expect(hs.join(',')).toBe(BEFORE[`${seed}-${name}`]);
      });

      it(`${tag} : 'all' = entrelacement de 'base' et des houppiers ; { after } suffixes emboîtés de 'base' ; boîte des houppiers`, () => {
        let boxes = 0;
        for (let t = 0; t < tileCount(W); t++) {
          const all = run(plan, t, D, 'all').ops.map(key);
          const base = run(plan, t, D, 'base').ops.map(key);
          const canopy = GROUPS.map((g) => run(plan, t, D, { canopy: g }));
          const cops = canopy.map((c) => c.ops.map(key));
          expect(base.length + cops.reduce((n, s) => n + s.length, 0)).toBe(all.length);
          expect(interleaves(all, base, cops)).toBe(true);
          // Écrans : suffixes de 'base', de plus en plus longs du groupe 2 au groupe 0, jamais 'base' entier.
          const after = GROUPS.map((g) => run(plan, t, D, { after: g }).ops.map(key));
          for (const s of after) {
            expect(s.length).toBeGreaterThan(0);
            expect(s.length).toBeLessThan(base.length);
            expect(s).toEqual(base.slice(base.length - s.length));
          }
          expect(after[2]!.length).toBeLessThanOrEqual(after[1]!.length);
          expect(after[1]!.length).toBeLessThanOrEqual(after[0]!.length);
          // Boîte : contient tout point des houppiers dans la tranche ; null → flux vide.
          const tx0 = t * TILE;
          const tx1 = Math.min(W, (t + 1) * TILE);
          for (const g of GROUPS) {
            const box = hillCanopyBox(plan, t, g);
            if (!box) {
              expect(canopy[g]!.ops.length).toBe(0);
              continue;
            }
            boxes++;
            for (const [x, y] of canopy[g]!.points) {
              if (x < tx0 || x > tx1) continue;
              expect(x).toBeGreaterThanOrEqual(box.x - 1e-6);
              expect(x).toBeLessThanOrEqual(box.x + box.w + 1e-6);
              expect(y).toBeGreaterThanOrEqual(box.y - 1e-6);
              expect(y).toBeLessThanOrEqual(box.y + box.h + 1e-6);
            }
            expect(box.x).toBeGreaterThanOrEqual(tx0);
            expect(box.x + box.w).toBeLessThanOrEqual(tx1);
          }
        }
        expect(boxes).toBeGreaterThan(0);
      });
    }
  }

  it('juillet : chaque groupe à boîte non nulle a un houppier peint (et un groupe sans boîte, aucun)', () => {
    let seen = 0;
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(W, H, seed);
      for (let t = 0; t < tileCount(W); t++) for (const g of GROUPS) {
        const n = run(plan, t, MOMENTS.juillet, { canopy: g }).ops.length;
        expect(n > 0).toBe(hillCanopyBox(plan, t, g) !== null);
        if (n > 0) seen++;
      }
    }
    expect(seen).toBeGreaterThan(9);
  });
});

// Colline au vent (PR 3b, tâche 2) : mouvement pur des bandes de feuillage.
describe('colline au vent : mouvement des bandes', () => {
  const CALM: Wind = { wind: 0, dir: 1, wet: 0, storm: false };
  const WINDS: Record<string, Wind> = {
    calme: CALM,
    '0.5': windOf({ ...SUNNY, wind: 0.5 }, false),
    '1': windOf({ ...SUNNY, wind: 1 }, false),
  };
  const GROUPS3 = [0, 1, 2] as const;
  const SLICES = [HILL_SLICE_DESKTOP, HILL_SLICE_ANDROID];

  it('bandes contiguës de [0, largeur), largeur `slice` sauf la dernière, pivots du pied du rang', () => {
    const plan = cityPaintPlan(W, H, 1);
    for (const slice of SLICES) for (const g of GROUPS3) {
      const bands = hillSlices(plan, g, slice, 3, WINDS['1']!);
      expect(bands[0]!.x0).toBe(0);
      expect(bands[bands.length - 1]!.x1).toBe(W);
      bands.forEach((b, i) => {
        if (i > 0) expect(b.x0).toBe(bands[i - 1]!.x1);
        if (i < bands.length - 1) expect(b.x1 - b.x0).toBe(slice);
        expect(b.x1 - b.x0).toBeLessThanOrEqual(slice);
        if (g > 0) expect(b.pivot).toBe(H * HILL_ROWS[g - 1]!.y);
        else expect(b.pivot).toBe(hillCrestY(plan, (b.x0 + b.x1) / 2));
      });
    }
  });

  it('vent nul : aucun déplacement ni cisaillement', () => {
    const plan = cityPaintPlan(W, H, 1);
    for (const slice of SLICES) for (const g of GROUPS3) for (let t = 0; t <= 60; t += 0.25) {
      for (const b of hillSlices(plan, g, slice, t, CALM)) {
        expect(b.dx).toBe(0);
        expect(b.s).toBe(0);
      }
    }
  });

  it('bornes |dx| ≤ 2, |s| ≤ 0,03, écart voisin ≤ 0,75 et pas de saut en 1/15 s (600 s, pas de 0,5 s ; le vent ne dépend pas de la graine, `windAt` ignore pluie et orage : une graine, sans cas « orage »)', () => {
    let maxGap = 0;
    let maxStep = 0;
    for (const seed of [7]) {
      const plan = cityPaintPlan(W, H, seed);
      for (const [name, w] of Object.entries(WINDS)) for (const slice of SLICES) for (const g of GROUPS3) {
        for (let t = 0; t <= 600; t += 0.5) {
          const a = hillSlices(plan, g, slice, t, w);
          const b = hillSlices(plan, g, slice, t + 1 / 15, w);
          a.forEach((s, i) => {
            if (Math.abs(s.dx) > 2 || Math.abs(s.s) > 0.03) throw new Error(`borne ${name} g${g} t${t}: dx ${s.dx} s ${s.s}`);
            if (i + 1 < a.length) maxGap = Math.max(maxGap, Math.abs(s.dx - a[i + 1]!.dx));
            maxStep = Math.max(maxStep, Math.abs(b[i]!.dx - s.dx));
          });
        }
      }
    }
    expect(maxGap).toBeLessThanOrEqual(0.75);
    expect(maxStep).toBeLessThanOrEqual(0.5);
  });

  it("couture : déplacement effectif dx + s·(y − pivot) de deux bandes voisines ≤ 0,75 px sur toute la hauteur des houppiers du groupe", () => {
    let worst = 0;
    for (const seed of [1, 7, 42]) {
      const plan = cityPaintPlan(W, H, seed);
      for (const g of GROUPS3) {
        // Hauteur des houppiers du groupe (toutes tranches) : le cisaillement y est le plus fort aux deux bords.
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let t = 0; t < tileCount(W); t++) {
          const b = hillCanopyBox(plan, t, g);
          if (b) ((y0 = Math.min(y0, b.y)), (y1 = Math.max(y1, b.y + b.h)));
        }
        for (const w of [WINDS['0.5']!, WINDS['1']!]) for (const slice of SLICES) for (let t = 0; t <= 300; t += 0.5) {
          const a = hillSlices(plan, g, slice, t, w);
          for (let i = 0; i + 1 < a.length; i++)
            for (const y of [y0, y1]) {
              const off = (k: number): number => a[k]!.dx + a[k]!.s * (y - a[k]!.pivot);
              worst = Math.max(worst, Math.abs(off(i) - off(i + 1)));
            }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(0.75);
  });
});
