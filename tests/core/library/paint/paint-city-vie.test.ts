import { describe, expect, it } from 'vitest';
import { cityPaintPlan, clearPlanCacheForTests } from '../../../../src/core/library/paint/city-plan';
import { fondMoment, SUNNY, type FondMeteo } from '../../../../src/core/library/paint/fond-time';
import {
  VIE_POOL, farLightK, flightCenter, flightsOf, funiAt, gradeHex, hiddenAt, kioskAt, kioskDay, pigeonsFlying, plumesOfDay, vehiclesAt, vieDay, vieFrame, vieModel, walkersAt,
  type VieDay, type VieModel, type VieNodePose,
} from '../../../../src/core/library/paint/fond-vie';
import { IDENTITY, NIGHT } from '../../../../src/core/library/paint/grade';

// Vie animée du fond (PR 2b, maquette docs/superpowers/maquettes/fond-ville/, 04-vie-fond.js).
const CLOUDY: FondMeteo = { cloud: 0.65, precip: 0, wind: 0.4, snow: false };
const dayOf = (iso: string, meteo: FondMeteo = SUNNY): VieDay => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return vieDay(fondMoment({ y, m, d }, 0, meteo));
};
const AUTUMN = dayOf('2026-10-27');
const WINTER = dayOf('2027-02-10', CLOUDY);
const SUNDAY = dayOf('2026-07-12');
const BASTILLE = dayOf('2026-07-14');
const frame = (m: VieModel, T: number, D: VieDay, still = false, daylight = 1): VieNodePose[] => vieFrame(m, { T, D, daylight, gloom: false, dim: 1 - daylight, minutes: Math.floor(T * 60), still });
const plans = [7, 42].map((seed) => cityPaintPlan(1440, 340, seed));

describe('vie du fond : jour', () => {
  it('fête nationale, week-end, froid, coucher du soleil', () => {
    expect(BASTILLE.national).toBe(true);
    expect(dayOf('2026-05-08').national).toBe(true);
    expect(dayOf('2026-11-11').national).toBe(true);
    expect(dayOf('2026-05-01').national).toBe(false);
    expect(SUNDAY.weekend).toBe(true);
    expect(AUTUMN.weekend).toBe(false);
    expect(WINTER.cold).toBe(true);
    expect(SUNDAY.cold).toBe(false);
    expect(AUTUMN.sunset).toBeGreaterThan(18.2);
    expect(AUTUMN.sunset).toBeLessThan(18.5);
    expect(dayOf('2026-01-01').prev).toBe('2025-12-31');
  });
});

describe('vie du fond : nœuds', () => {
  it('déterministe (plan recalculé), dépend de la graine', () => {
    const a = frame(vieModel(cityPaintPlan(1440, 340, 7)), 18.5, AUTUMN, false, 0.3);
    clearPlanCacheForTests();
    const b = frame(vieModel(cityPaintPlan(1440, 340, 7)), 18.5, AUTUMN, false, 0.3);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(frame(vieModel(cityPaintPlan(1440, 340, 8)), 18.5, AUTUMN, false, 0.3))).not.toBe(JSON.stringify(a));
  });

  it('nœuds constants : rien n’est créé ni détruit sur 24 h simulées (4 jours, 2 graines)', () => {
    for (const plan of plans) {
      const m = vieModel(plan);
      const ids = m.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const D of [AUTUMN, WINTER, SUNDAY, BASTILLE]) {
        for (let T = 0; T < 24; T += 37 / 3600 + 0.05) {
          const f = frame(m, T, D);
          expect(f.length).toBe(m.nodes.length);
          f.forEach((p, i) => {
            expect(p.a.display === 'none' || p.a.display === 'inline').toBe(true);
            // Enfants : jamais plus que ceux du gabarit.
            expect((p.k ?? []).length).toBeLessThanOrEqual(m.nodes[i]!.kids?.length ?? 0);
          });
        }
      }
    }
  });
});

// Point d'entrée ou de sortie permis : caché (mur du fond, premier plan, hors scène) ou à la porte d'une gare.
const atEntry = (m: VieModel, x: number, y: number): boolean => hiddenAt(m, x, y + 0.5) || m.escapes.some((ve) => Math.hypot(x - (ve.e.funi.x1 + 0.5), y + 0.6 - (ve.e.funi.y1 - 8)) < 3.5);

describe('vie du fond : entrées et sorties', () => {
  for (const plan of plans) {
    it(`graine ${plan.seed} : voitures, piétons et fanfare apparaissent et disparaissent derrière le mur ou par une gare`, () => {
      const m = vieModel(plan);
      for (const D of [AUTUMN, SUNDAY]) {
        for (const ve of m.escapes) {
          let prev = new Map<string, { x: number; y: number }>();
          let seen = 0;
          for (let T = 0; T < 24; T += 1 / 3600) {
            const now = new Map<string, { x: number; y: number }>();
            for (const v of vehiclesAt(m, ve, T, D)) now.set(v.key, v);
            for (const w of walkersAt(m, ve, T, D)) now.set(w.key, { x: w.x - (w.x - Math.round(w.x)) * 0, y: w.y });
            for (const w of kioskAt(m, ve, T, D)) if (w) now.set(w.key, w);
            for (const [k, p] of now) if (!prev.has(k)) {
              seen++;
              expect(atEntry(m, p.x - 2.2 * 0, p.y) || atEntry(m, p.x - 2.2, p.y) || atEntry(m, p.x + 2.2, p.y), `${k} entre à ${p.x.toFixed(1)},${p.y.toFixed(1)} (${T.toFixed(4)} h)`).toBe(true);
            }
            for (const [k, p] of prev) if (!now.has(k)) expect(atEntry(m, p.x, p.y) || atEntry(m, p.x - 2.2, p.y) || atEntry(m, p.x + 2.2, p.y), `${k} sort à ${p.x.toFixed(1)},${p.y.toFixed(1)}`).toBe(true);
            prev = now;
          }
          expect(seen).toBeGreaterThan(20);
        }
      }
    });
  }

  it('au plus VIE_POOL voitures et piétons à la fois par échappée', () => {
    const m = vieModel(plans[0]!);
    for (const ve of m.escapes) for (let T = 6; T < 22; T += 7 / 3600) {
      expect(vehiclesAt(m, ve, T, AUTUMN).length).toBeLessThanOrEqual(VIE_POOL.vehicles);
      expect(walkersAt(m, ve, T, SUNDAY).length).toBeLessThanOrEqual(VIE_POOL.walkers);
    }
  });

  it('oiseaux : entrent et sortent par les bords du ciel', () => {
    const m = vieModel(plans[0]!);
    for (const D of [AUTUMN, SUNDAY]) for (const f of flightsOf(m, D)) {
      const a = flightCenter(m, f, f.t0)!;
      const b = flightCenter(m, f, f.t0 + (f.dur - 1e-3) / 3600)!;
      // Nuée de 22 px de rayon au plus, martinets étalés sur 53 px : hors de la scène au premier et au dernier instant.
      const r = f.kind === 'starlings' ? 23 : 54;
      expect(a.x + r < 0 || a.x - r > m.W).toBe(true);
      expect(b.x + r < 0 || b.x - r > m.W).toBe(true);
    }
  });
});

describe('vie du fond : horaires', () => {
  it('funiculaire : 6 h → 0 h 45, cabines au repos en gare hors service, croisement à mi-pente', () => {
    expect(funiAt(3)).toEqual({ a: 0, b: 1, moving: false });
    expect(funiAt(0.8).moving).toBe(false);
    // Montée de 110 s toutes les 5 min, croisement à mi-course.
    const mid = funiAt(10 + 55 / 3600);
    expect(mid.moving).toBe(true);
    expect(mid.a).toBeCloseTo(0.5, 1);
    expect(funiAt(10 + 200 / 3600).moving).toBe(false);
    // Après 21 h : toutes les 10 min.
    let moves = 0;
    for (let s = 0; s < 3600; s += 5) if (funiAt(22 + s / 3600).moving) moves += 5;
    expect(moves).toBeGreaterThan(600);
    expect(moves).toBeLessThan(700);
  });

  it('fanfare : dimanches de mai à septembre, hors pluie, en place de 15 h 15 à 18 h', () => {
    expect(kioskDay(SUNDAY)).toBe(true);
    expect(kioskDay(dayOf('2026-07-11'))).toBe(false);
    expect(kioskDay(dayOf('2026-10-25'))).toBe(false);
    expect(kioskDay(dayOf('2026-07-12', { cloud: 0.9, precip: 0.6, wind: 0.5, snow: false }))).toBe(false);
    const m = vieModel(plans[0]!);
    const ve = m.escapes.find((e) => e.kiosk)!;
    const at16 = kioskAt(m, ve, 16, SUNDAY);
    expect(at16.filter((w) => w && !w.moving)).toHaveLength(VIE_POOL.kiosk);
    expect(kioskAt(m, ve, 13, SUNDAY).every((w) => w === null)).toBe(true);
    expect(kioskAt(m, ve, 19, SUNDAY).every((w) => w === null)).toBe(true);
  });

  it('pigeons : à l’heure pile de 8 h à 21 h, 40 s de vol', () => {
    expect(pigeonsFlying(15 + 10 / 3600)).toBe(true);
    expect(pigeonsFlying(21 + 39 / 3600)).toBe(true);
    expect(pigeonsFlying(15 + 41 / 3600)).toBe(false);
    expect(pigeonsFlying(7 + 10 / 3600)).toBe(false);
    expect(pigeonsFlying(22 + 10 / 3600)).toBe(false);
    expect(pigeonsFlying(3 + 10 / 3600)).toBe(false);
  });

  it('vols selon la saison : étourneaux d’octobre à février au crépuscule, martinets au printemps et l’été', () => {
    const m = vieModel(plans[0]!);
    const kinds = (D: VieDay): string[] => flightsOf(m, D).map((f) => f.kind);
    expect(kinds(AUTUMN)).toEqual(['starlings', 'starlings', 'starlings']);
    expect(kinds(WINTER).filter((k) => k === 'starlings')).toHaveLength(3);
    expect(kinds(SUNDAY)).toEqual(['swifts', 'swifts', 'swifts', 'swifts']);
    expect(kinds(dayOf('2027-04-20'))).toEqual(['swifts', 'swifts']);
    expect(kinds(dayOf('2026-09-15'))).toEqual([]);
    for (const f of flightsOf(m, AUTUMN)) {
      expect(f.t0).toBeGreaterThanOrEqual(AUTUMN.sunset - 1.3);
      expect(f.t0).toBeLessThanOrEqual(AUTUMN.sunset);
    }
  });

  it('drapeaux seulement les jours de fête nationale, monuments illuminés le soir', () => {
    const m = vieModel(plans[0]!);
    const on = (D: VieDay, T: number): number => frame(m, T, D).filter((p, i) => m.nodes[i]!.id.startsWith('drapeau') && p.a.display === 'inline').length;
    expect(on(BASTILLE, 14)).toBe(m.landmarks.length);
    expect(on(BASTILLE, 23)).toBe(0);
    expect(on(SUNDAY, 14)).toBe(0);
  });
});

describe('vie du fond : fumées et budget', () => {
  it('fumées : jours froids seulement, au plus 12 panaches, toujours les mêmes de la journée', () => {
    for (const plan of plans) {
      const m = vieModel(plan);
      const plumes = plumesOfDay(m, WINTER);
      expect(plumes.length).toBeGreaterThan(0);
      expect(plumes.length).toBeLessThanOrEqual(VIE_POOL.plumes);
      expect(plumesOfDay(m, SUNDAY)).toHaveLength(0);
      for (let T = 5; T < 23; T += 0.1) {
        const shown = frame(m, T, WINTER).filter((p, i) => m.nodes[i]!.id.startsWith('fumee') && p.a.display === 'inline').length;
        expect(shown).toBeLessThanOrEqual(VIE_POOL.plumes);
      }
      expect(frame(m, 8, SUNDAY).some((p, i) => m.nodes[i]!.id.startsWith('fumee') && p.a.display === 'inline')).toBe(false);
    }
  });

  it('au plus 40 nœuds mobiles réécrits d’une image à la suivante (15 images/s), hors lumières', () => {
    for (const plan of plans) {
      const m = vieModel(plan);
      for (const [D, T, dl] of [[WINTER, 8.2, 0.6], [AUTUMN, 18.2, 0.4], [SUNDAY, 15, 1], [SUNDAY, 18.02, 1], [BASTILLE, 14, 1]] as const) {
        const a = frame(m, T, D, false, dl);
        const b = frame(m, T + 1 / 15 / 3600, D, false, dl);
        const moved = a.filter((p, i) => m.nodes[i]!.mobile && JSON.stringify(p) !== JSON.stringify(b[i])).length;
        expect(moved, `${D.date} ${T}`).toBeLessThanOrEqual(40);
      }
    }
  });

  it('mouvement réduit : poses fixes, ni voitures, ni piétons, ni oiseaux en route', () => {
    const m = vieModel(plans[0]!);
    for (const [D, T] of [[AUTUMN, 18.5], [SUNDAY, 16], [WINTER, 8.3]] as const) {
      const a = frame(m, T + 1 / 3600, D, true);
      const b = frame(m, T + 6 / 3600, D, true);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      const moving = a.filter((p, i) => /^(voiture|pieton|fanfare|etourneaux|martinets|pigeons-vol)/.test(m.nodes[i]!.id) && p.a.display === 'inline');
      expect(moving).toHaveLength(0);
    }
  });
});

describe('vie du fond : lumières', () => {
  it('fenêtres du mur du fond : 15 % derrière un volet fermé', () => {
    const plan = plans[0]!;
    const D = fondMoment({ y: 2026, m: 10, d: 27 }, 23.9 * 60, SUNNY);
    const ks = plan.buildings.filter((b) => b.far && b.look.shutters && b.life).flatMap((b) => b.lit.map((w) => farLightK(b, w, D)));
    expect(ks.length).toBeGreaterThan(0);
    expect(ks.every((k) => Math.abs(k - 0.15) < 1e-9)).toBe(true);
    const noon = fondMoment({ y: 2026, m: 10, d: 27 }, 12 * 60, SUNNY);
    expect(plan.buildings.filter((b) => b.far && b.look.shutters && b.life).flatMap((b) => b.lit.map((w) => farLightK(b, w, noon))).filter((k) => k < 1).length).toBeLessThan(ks.length * 0.2);
  });

  it('étalonnage des couleurs : identité de jour, nuit bleutée', () => {
    expect(gradeHex('#C8463A', IDENTITY)).toBe('#c8463a');
    const n = gradeHex('#F0F0E8', NIGHT);
    expect(parseInt(n.slice(5, 7), 16)).toBeGreaterThan(parseInt(n.slice(1, 3), 16));
  });
});
