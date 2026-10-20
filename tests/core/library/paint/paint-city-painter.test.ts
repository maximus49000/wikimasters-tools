import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan, hillTopY } from '../../../../src/core/library/paint/city-plan';
import { CORNICE, LEFT_GAP, leftOf, paintBuilding, paintCityTile, paintPodium, TILE, tileCount, tileItems, tileKey } from '../../../../src/core/library/paint/city-painter';
import { doorsFor } from '../../../../src/core/library/city/doors';
import { GROUND_FLOOR } from '../../../../src/core/library/city/metrics';
import { roofOutline } from '../../../../src/core/library/city/facade-layout';
import { PAINT_VERSION } from '../../../../src/core/library/paint/city-painter';
import { paintParisRoof } from '../../../../src/core/library/paint/roof-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Un point est permis s'il est dans la rue (y ≥ sol), dans un immeuble (débord d'avant-toit ≤ 2 px, antenne ≤ 9 px au-dessus),
// ou dans le fond (sous le haut de la colline, maisons et repères compris).
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  if (plan.buildings.some((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.top - 9 - 1e-6)) return true;
  return y >= hillTopY(plan, x) - 1e-6;
}

describe('peintre de tranche', () => {
  it('tranches : nombre et contenu', () => {
    expect(tileCount(720)).toBe(2);
    expect(tileCount(721)).toBe(3);
    const plan = cityPaintPlan(1080, 340, 1);
    const straddling = plan.buildings.find((b) => b.x < TILE && b.x + b.w > TILE);
    if (straddling) {
      expect(tileItems(plan, 0).buildings).toContain(straddling);
      expect(tileItems(plan, 1).buildings).toContain(straddling);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : rien au-dessus de la silhouette ni du fond`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintCityTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(500);
        const bad = ctx.points.filter(([x, y]) => x >= -8 && x <= 1088 && !allowed(plan, x, y));
        expect(bad.slice(0, 3)).toEqual([]);
      }
    });
  }

  it('un immeuble est peint à l’identique quelle que soit la tranche', () => {
    const plan = cityPaintPlan(720, 340, 3);
    for (const b of [plan.buildings.find((x) => !x.far)!, plan.buildings.find((x) => x.far)!]) {
      const a = recordingCtx();
      const c = recordingCtx();
      paintBuilding(a, plan, b);
      paintBuilding(c, plan, b);
      expect(a.ops).toEqual(c.ops);
    }
  });

  it('voisin de gauche : même plan, contigu, le plus proche', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    const near = plan.buildings.filter((b) => !b.far);
    expect(leftOf(plan, near[0]!)).toBeNull();
    const l = leftOf(plan, near[1]!);
    expect(l).toBe(near[0]);
    for (const b of plan.buildings) {
      const left = leftOf(plan, b);
      if (left) {
        expect(left.far).toBe(b.far);
        expect(left.x).toBeLessThan(b.x);
        expect(left.x + left.w).toBeGreaterThanOrEqual(b.x - LEFT_GAP);
      }
    }
  });

  it('ombre portée : seulement d’un voisin mitoyen plus haut, sur un étage sous l’égout (audit D3)', () => {
    let mitoyens = 0;
    let separes = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plan = cityPaintPlan(2160, 340, seed);
      for (const b of plan.buildings) {
        if (b.far) continue;
        const left = leftOf(plan, b);
        if (!left || left.top >= b.top) continue;
        const eave = b.top + b.look.roofH;
        const ctx = recordingCtx();
        paintBuilding(ctx, plan, b);
        const i = ctx.ops.findIndex((o, k) => o.op === 'moveTo' && o.args[0] === b.x && o.args[1] === eave && ctx.ops[k + 1]?.op === 'lineTo' && ctx.ops[k + 1]!.args[1] === eave && (ctx.ops[k + 1]!.args[0] as number) > b.x);
        // Plus jamais de triangle tiré du toit du voisin jusqu'au trottoir.
        expect(ctx.ops.some((o) => o.op === 'moveTo' && o.args[0] === b.x && o.args[1] === left.top)).toBe(false);
        if (left.x + left.w >= b.x - 2) {
          mitoyens++;
          expect(i).toBeGreaterThanOrEqual(0);
          const y1 = Math.min(plan.ground - GROUND_FLOOR, eave + 14);
          expect(ctx.ops[i + 2]!.args[1]).toBe(y1);
          expect((ctx.ops[i + 1]!.args[0] as number) - b.x).toBeLessThanOrEqual(b.w * 0.45 + 1e-9);
        } else {
          separes++;
          expect(i).toBe(-1);
        }
      }
    }
    expect(mitoyens).toBeGreaterThan(0);
    expect(separes).toBeGreaterThan(0);
  });

  it('raccord : un immeuble à cheval est peint des deux côtés avec les mêmes points', () => {
    const full = cityPaintPlan(1080, 340, 3);
    // Premier plan seul (le mur du fond, derrière, a sa propre découpe par tranche).
    const plan = { ...full, buildings: full.buildings.filter((b) => !b.far) };
    const straddling = plan.buildings.find((x) => x.x < 360 && x.x + x.w > 360);
    if (!straddling) return;
    // Points des immeubles seuls : ceux de la tranche complète moins ceux de la même tranche peinte sans immeuble (fond, rue,
    // arbres, mobilier), dont la découpe par tranche diffère pour le fond.
    const mine = (tile: number): string[] => {
      const all = recordingCtx();
      const rest = recordingCtx();
      paintCityTile(all, plan, tile);
      paintCityTile(rest, { ...plan, buildings: [] }, tile);
      const left = new Map<string, number>();
      for (const [x, y] of rest.points) left.set(`${x.toFixed(3)},${y.toFixed(3)}`, (left.get(`${x.toFixed(3)},${y.toFixed(3)}`) ?? 0) + 1);
      const out: string[] = [];
      for (const [x, y] of all.points) {
        const k = `${x.toFixed(3)},${y.toFixed(3)}`;
        const n = left.get(k) ?? 0;
        if (n > 0) left.set(k, n - 1);
        else if (x >= straddling.x - 2 && x <= straddling.x + straddling.w + 2) out.push(k);
      }
      return out;
    };
    const a = mine(0);
    expect(a.length).toBeGreaterThan(50);
    expect(a).toEqual(mine(1));
  });

  it('clé : stable, dépend de la graine, inchangée pour la 1re tranche quand la pièce grandit', () => {
    const p1 = cityPaintPlan(720, 340, 1);
    expect(tileKey(p1, 0)).toBe(tileKey(cityPaintPlan(720, 340, 1), 0));
    expect(tileKey(p1, 0)).not.toBe(tileKey(cityPaintPlan(720, 340, 2), 0));
    expect(tileKey(cityPaintPlan(1080, 340, 1), 0)).toBe(tileKey(p1, 0));
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintCityTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });

  it('peint la corniche du socle en débord de 1,5 u de chaque côté, et ses fenêtres', () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const p = plan.podiums[0]!;
    const ctx = recordingCtx();
    paintPodium(ctx, plan, p);
    const rects = ctx.ops.filter((o) => o.op === 'fillRect').map((o) => ({ x: o.args[0]!, y: o.args[1]!, w: o.args[2]!, h: o.args[3]! }));
    expect(rects.some((r) => r.x <= p.x - 1.5 && r.x + r.w >= p.x + p.w + 1.5 && Math.abs(r.y - p.top) < 2)).toBe(true);
    // Rien au-dessus de la corniche ni hors du débord.
    for (const [x, y] of ctx.points) {
      expect(y).toBeGreaterThanOrEqual(p.top - 1.5);
      expect(x).toBeGreaterThanOrEqual(p.x - 1.6);
      expect(x).toBeLessThanOrEqual(p.x + p.w + 1.6);
    }
    for (const win of p.wins) expect(rects.some((r) => r.x === win.x && r.y === win.y && r.w === win.w && r.h === win.h)).toBe(true);
    const again = recordingCtx();
    paintPodium(again, plan, p);
    expect(again.ops).toEqual(ctx.ops);
  });

  it('un socle dont la corniche déborde dans la tranche voisine y est listé', () => {
    const full = cityPaintPlan(1440, 340, 4);
    const p = full.podiums[0]!;
    const x0 = TILE - 2;
    // Socle fini 1 u avant le bord de la tranche 1 : sa corniche (1,5 u) y entre ; fini 5 u avant : non.
    const at = (end: number) => ({ ...full, podiums: [{ ...p, x: end - p.w }] });
    expect(CORNICE.over).toBe(1.5);
    expect(tileItems(at(x0 - 1), 1).podiums).toHaveLength(1);
    expect(tileItems(at(x0 - 5), 1).podiums).toHaveLength(0);
    expect(tileItems(at(x0 - 1), 0).podiums).toHaveLength(1);
  });

  it('tour sur socle : pas de salissure de pied (elle serait sous le socle)', () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const tower = plan.buildings.find((b) => b.podiumTop !== null)!;
    const simple = plan.buildings.find((b) => !b.far && b.podiumTop === null)!;
    const foot = (b: typeof tower): number => {
      const ctx = recordingCtx();
      paintBuilding(ctx, plan, b);
      return ctx.ops.filter((o) => o.op === 'fillRect' && o.args[0] === b.x && o.args[1] === plan.ground - 3 && o.args[2] === b.w && o.args[3] === 3).length;
    };
    expect(foot(simple)).toBe(1);
    expect(foot(tower)).toBe(0);
  });

  it('mitoyens : un trait encré appuyé à la jonction, du toit le plus bas au sol', () => {
    let found = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plan = cityPaintPlan(2160, 340, seed);
      for (const b of plan.buildings) {
        if (b.far) continue;
        const left = leftOf(plan, b);
        const touching = left !== null && left.x + left.w >= b.x - 0.5;
        const ctx = recordingCtx();
        paintBuilding(ctx, plan, b);
        const y0 = touching ? (left.top > b.top ? left.top + left.look.roofH : b.top + b.look.roofH) : NaN;
        const joint = ctx.ops.some((o, i) => o.op === 'moveTo' && o.args[0] === b.x && o.args[1] === y0 && ctx.ops[i + 1]!.op === 'lineTo' && ctx.ops[i + 1]!.args[0] === b.x && ctx.ops[i + 1]!.args[1] === plan.ground);
        expect(joint).toBe(touching);
        if (touching) found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('PAINT_VERSION vaut 10', () => {
    expect(PAINT_VERSION).toBe(10);
  });

  it('tranches : aucun volet ni rideau peint (le calque de la vie aux fenêtres les dessine)', () => {
    let shutters = 0;
    let curtains = 0;
    for (const seed of [1, 4, 9]) {
      const plan = cityPaintPlan(2160, 340, seed);
      for (let t = 0; t < tileCount(2160); t++) {
        const ctx = recordingCtx();
        paintCityTile(ctx, plan, t);
        // Rectangles remplis (géométrie + couleur) et tracés de la tranche.
        const filled: string[] = [];
        const stroked = new Set<string>();
        let k = 0;
        for (const o of ctx.ops) {
          // `fills` reçoit une couleur par `fill` et par `fillRect`, dans l'ordre des appels.
          if (o.op === 'fillRect') filled.push(`${o.args.join(',')}|${ctx.fills[k++]}`);
          else if (o.op === 'fill') k++;
          if (o.op === 'strokeRect') stroked.add(o.args.join(','));
        }
        const rects = new Set(filled.map((f) => f.split('|')[0]));
        expect(ctx.fills).not.toContain('rgba(255,248,230,0.35)');
        for (const b of tileItems(plan, t).buildings) {
          if (b.far || !b.layout) continue;
          for (const win of b.layout.windows) {
            const { x, y, w, h } = win;
            if (b.layout.shutters && (win.kind === 'std' || win.kind === 'top')) {
              shutters++;
              expect(rects.has([x - 2.6, y, 2, h].join(','))).toBe(false);
              expect(stroked.has([x + w + 0.6, y, 2, h].join(','))).toBe(false);
            }
            const home = win.home >= 0 ? b.homes[win.home] : undefined;
            if (home?.curtain?.style === 'side' && win.kind !== 'stair' && win.kind !== 'dormer') {
              curtains++;
              const cw = Math.min(1.8, Math.max(1, w * 0.22));
              expect(filled).not.toContain(`${[x, y, cw, h].join(',')}|${home.curtain.color}`);
            }
          }
        }
      }
    }
    expect(shutters).toBeGreaterThan(0);
    expect(curtains).toBeGreaterThan(0);
  });

  it('premier plan : chaque fenêtre de la mise en page (étages et lucarnes) a sa vitre à sa taille', () => {
    let n = 0;
    for (const seed of [1, 4]) {
      const plan = cityPaintPlan(1440, 340, seed);
      for (const b of plan.buildings) {
        if (b.far || !b.layout) continue;
        const ctx = recordingCtx();
        paintBuilding(ctx, plan, b);
        const rects = ctx.ops.filter((o) => o.op === 'fillRect').map((o) => o.args.join(','));
        for (const w of b.layout.windows) {
          expect(rects).toContain([w.x, w.y, w.w, w.h].join(','));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('dernier étage court : corniche (rehaut, trait, ombre) interrompue au droit des vitres, jour = nuit', () => {
    // Le peintre du toit ne touche aucune vitre d'étage : ni remplissage, ni trait (épaisseur comprise). Les vitres des
    // lucarnes sont peintes par lui (exclues).
    let close = 0;
    let bitten = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = cityPaintPlan(1440, 340, seed);
      for (const b of plan.buildings) {
        if (b.far || !b.layout) continue;
        const panes = b.layout.windows.filter((v) => v.kind !== 'dormer');
        const eave = b.top + b.look.roofH;
        close += panes.filter((v) => v.y < eave + 4.8).length;
        bitten += panes.filter((v) => v.y < eave + 2.55).length;
        const ctx = recordingCtx();
        const strokes: { pts: [[number, number], [number, number]]; lw: number }[] = [];
        let path: [number, number][] = [];
        const { beginPath, moveTo, lineTo, stroke, strokeRect } = ctx;
        ctx.beginPath = () => { path = []; beginPath(); };
        ctx.moveTo = (x, y) => { path.push([x, y]); moveTo(x, y); };
        ctx.lineTo = (x, y) => { path.push([x, y]); lineTo(x, y); };
        ctx.stroke = () => { for (let i = 1; i < path.length; i++) strokes.push({ pts: [path[i - 1]!, path[i]!], lw: ctx.lineWidth }); stroke(); };
        ctx.strokeRect = (x, y, w, h) => {
          const c: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
          for (let i = 1; i < c.length; i++) strokes.push({ pts: [c[i - 1]!, c[i]!], lw: ctx.lineWidth });
          strokeRect(x, y, w, h);
        };
        paintParisRoof(ctx, plan, b);
        const hits = (x0: number, y0: number, x1: number, y1: number) =>
          panes.find((v) => x0 < v.x + v.w - 1e-6 && x1 > v.x + 1e-6 && y0 < v.y + v.h - 1e-6 && y1 > v.y + 1e-6);
        for (const o of ctx.ops) {
          if (o.op !== 'fillRect') continue;
          const [x, y, w, h] = o.args as [number, number, number, number];
          expect(hits(x, y, x + w, y + h), `remplissage ${o.args.join(',')}`).toBeUndefined();
        }
        for (const { pts: [[ax, ay], [bx, by]], lw } of strokes) {
          // Segments droits seulement (corniche, souches) : le contour du toit, en pente, est au-dessus de l'avant-toit.
          if (ax !== bx && ay !== by) continue;
          const r = lw / 2;
          expect(hits(Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r), `trait ${ax},${ay} → ${bx},${by}`).toBeUndefined();
        }
      }
    }
    // Des vitres du dernier étage dans la bande de la corniche existent bien (sinon le test ne prouve rien).
    expect(close).toBeGreaterThan(0);
    // … et sous le rehaut et le trait de la corniche (eave + 2,55).
    expect(bitten).toBeGreaterThan(0);
  });

  it('premier plan : le trait encré du toit suit exactement roofOutline', () => {
    const plan = cityPaintPlan(1440, 340, 1);
    const kinds = new Set<string>();
    for (const b of plan.buildings) {
      if (b.far || !b.layout) continue;
      const ctx = recordingCtx();
      paintBuilding(ctx, plan, b);
      const pts = roofOutline(b.layout);
      const at = ctx.ops.findIndex((o, i) => o.op === 'moveTo' && o.args[0] === pts[0]![0] && o.args[1] === pts[0]![1] && pts.slice(1).every(([x, y], k) => ctx.ops[i + 1 + k]?.op === 'lineTo' && ctx.ops[i + 1 + k]!.args[0] === x && ctx.ops[i + 1 + k]!.args[1] === y));
      expect(at).toBeGreaterThanOrEqual(0);
      kinds.add(b.layout.roof.kind);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('entrées d’immeuble : celles de doorsFor, dans les tranches qu’elles touchent, et dans la clé', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    expect(plan.doors.map((d) => d.x)).toEqual(doorsFor(1080, 340, 1).map((d) => d.x));
    for (const d of plan.doors) {
      for (let t = 0; t < tileCount(1080); t++) {
        const touches = d.cx - 13 * d.s < (t + 1) * TILE + 2 && d.cx + 13 * d.s > t * TILE - 2;
        expect(tileItems(plan, t).doors.includes(d)).toBe(touches);
      }
    }
    const other = cityPaintPlan(1080, 340, 2);
    expect(tileKey(plan, 0).split('|').slice(5)).not.toEqual(tileKey(other, 0).split('|').slice(5));
  });
});

