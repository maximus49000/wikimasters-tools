// tests/core/library/city/roof-life.test.ts — toits vivants (chantier « vie au-dessus de la rue », tâche 12) : chat par la
// tabatière, pigeons des corniches qui partent et reviennent en vol, fumées d'hiver, couvreur du mardi et du jeudi.
import { describe, expect, it } from 'vitest';
import { dayContext } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import type { FacadeLayout } from '../../../../src/core/library/city/facade-layout';
import { sceneDay, type SceneDay } from '../../../../src/core/library/city/scene-day';
import type { Schedule } from '../../../../src/core/library/city/schedules';
import {
  CAT_EMERGE, catOutings, catRoofs, catState, chimneyVisible, dryOutings, homeOccupied, pigeonFlocks, pigeonsAt, rooferAt, smokeAt,
} from '../../../../src/core/library/city/roof-life';

const SEED = 1;
const W = 1080;
const H = 340;
const layouts = cityFacades(W, H, SEED).map((f) => f.layout);
const fronts = layouts.filter((l): l is FacadeLayout => l !== null);
const withHatch = fronts.find((l) => l.roof.kind === 'mansard' && l.dormers.some((d) => d.type === 'tabatiere'))!;
const dayOf = (y: number, m: number, d: number, wet = false): SceneDay => sceneDay(dayContext({ y, m, d }, []), { precip: wet ? 1 : 0, snow: false, storm: false }, SEED);
// Mardi 15 décembre 2026, mercredi 16, jeudi 17 ; mardi 16 juin 2026.
const TUE = dayOf(2026, 12, 15);
const WED = dayOf(2026, 12, 16);
const THU = dayOf(2026, 12, 17);
const JUNE = dayOf(2026, 6, 16);

describe('chat des toits', () => {
  it('chat absent des toits sans tabatière', () => {
    const noHatch: FacadeLayout = { ...withHatch, dormers: withHatch.dormers.filter((d) => d.type !== 'tabatiere') };
    const flat: FacadeLayout = { ...withHatch, roof: { kind: 'zinc', h: 11, zinc: '#8290A2' } };
    const outs = catOutings(SEED, TUE.iso, 0);
    for (let m = 0; m < 1440; m += 1) {
      expect(catState(noHatch, outs, m)).toBeNull();
      expect(catState(flat, outs, m)).toBeNull();
    }
    expect(catRoofs([noHatch, flat], SEED)).toEqual([]);
    // Un toit à la Mansart avec tabatière a bien un chat à l'une de ses sorties.
    const o = outs[0]!;
    expect(catState(withHatch, outs, o.start + o.dur / 2)?.pose).toBe('sit');
  });

  it('trois sorties par jour dans leurs créneaux, de 40 à 55 min', () => {
    const outs = catOutings(SEED, TUE.iso, 2);
    expect(outs).toHaveLength(3);
    const slots = [[600, 720], [900, 1020], [1320, 1440]];
    outs.forEach((o, i) => {
      expect(o.dur).toBeGreaterThanOrEqual(40);
      expect(o.dur).toBeLessThanOrEqual(55);
      expect(o.start).toBeGreaterThanOrEqual(slots[i]![0]!);
      expect(o.start + o.dur).toBeLessThanOrEqual(slots[i]![1]!);
    });
  });

  it("sorties du chat différentes d'un jour à l'autre", () => {
    const a = catOutings(SEED, TUE.iso, 2);
    const b = catOutings(SEED, WED.iso, 2);
    expect(a).toEqual(catOutings(SEED, TUE.iso, 2));
    expect(a.map((o) => Math.round(o.start))).not.toEqual(b.map((o) => Math.round(o.start)));
    // Deux toits du même jour ne sortent pas leur chat ensemble.
    expect(catOutings(SEED, TUE.iso, 3).map((o) => Math.round(o.start))).not.toEqual(a.map((o) => Math.round(o.start)));
  });

  it('sort et rentre par la tabatière : jamais d’apparition sur place', () => {
    const outs = catOutings(SEED, TUE.iso, 0);
    const tab = withHatch.dormers.find((d) => d.type === 'tabatiere')!;
    for (const o of outs) {
      const first = catState(withHatch, outs, o.start + 1e-4)!;
      const last = catState(withHatch, outs, o.start + o.dur - 1e-4)!;
      expect(first.pose).toBe('emerge');
      expect(first.phase).toBeLessThan(0.01);
      expect(last.pose).toBe('emerge');
      expect(last.phase).toBeLessThan(0.01);
      expect(first.x).toBeCloseTo(tab.cx + 2.5, 5);
      expect(catState(withHatch, outs, o.start - 1e-3)).toBeNull();
      expect(catState(withHatch, outs, o.start + o.dur + 1e-3)).toBeNull();
      // Pas de saut d'une seconde à l'autre.
      let prev = first;
      for (let m = o.start; m < o.start + o.dur; m += 1 / 60) {
        const c = catState(withHatch, outs, m);
        if (!c) continue;
        expect(Math.abs(c.x - prev.x)).toBeLessThan(1);
        prev = c;
      }
    }
  });

  it('aucune sortie sous la pluie ; une averse en cours de sortie fait rentrer le chat sans saut', () => {
    const outs = catOutings(SEED, TUE.iso, 0);
    const o = outs[1]!;
    // Pluie qui commence avant la deuxième sortie et dure toute la journée : la deuxième et la troisième sont annulées.
    expect(dryOutings(outs, [[o.start - 5, Infinity]])).toEqual([outs[0]]);
    // Averse au milieu de la sortie : la sortie est raccourcie, le chat reste continu et rentre par la tabatière.
    const cut = dryOutings(outs, [[o.start + 15, o.start + 30]]);
    const c = cut[1]!;
    expect(c.start).toBe(o.start);
    expect(c.dur).toBeLessThan(o.dur);
    expect(c.start + c.dur).toBeLessThan(o.start + 20);
    let prev = catState(withHatch, cut, c.start + 1e-4)!;
    for (let m = c.start; m < c.start + c.dur; m += 1 / 60) {
      const s = catState(withHatch, cut, m);
      if (!s) continue;
      expect(Math.abs(s.x - prev.x)).toBeLessThan(1);
      prev = s;
    }
    expect(catState(withHatch, cut, c.start + c.dur - 1e-4)?.pose).toBe('emerge');
    // Rien au-delà de la rentrée, pendant l'averse.
    expect(catState(withHatch, cut, o.start + 25)).toBeNull();
  });

  it('émergence : avancement de 0 à 1 en CAT_EMERGE minutes', () => {
    const outs = catOutings(SEED, TUE.iso, 0);
    const o = outs[0]!;
    expect(catState(withHatch, outs, o.start + CAT_EMERGE / 2)!.phase).toBeCloseTo(0.5, 3);
  });
});

describe('pigeons des corniches', () => {
  // Toit avec au moins une volée ce jour-là.
  const host = fronts.find((l) => pigeonFlocks(l, SEED, TUE.iso).length > 0)!;
  it('la position passe par le vol entre posé et absent', () => {
    expect(host).toBeDefined();
    const birds = pigeonFlocks(host, SEED, TUE.iso).flatMap((f) => f.birds.map((b) => b.id));
    const seen = new Map<number, string>();
    let hadPerch = false;
    let hadAway = false;
    for (let s = 6 * 3600; s < 22 * 3600; s += 0.5) {
      const now = pigeonsAt(host, SEED, TUE.iso, s / 60, false);
      for (const id of birds) {
        const b = now.find((p) => p.id === id);
        const st = b ? (b.pose === 'fly' ? 'fly' : 'perch') : 'away';
        if (st === 'perch') hadPerch = true;
        if (st === 'away') hadAway = true;
        const before = seen.get(id) ?? 'away';
        // Jamais de posé à absent (ou l'inverse) sans vol entre les deux.
        expect(`${before}>${st}`).not.toBe('perch>away');
        expect(`${before}>${st}`).not.toBe('away>perch');
        // Un oiseau absent n'apparaît que hors de la scène (au-dessus du haut).
        if (before === 'away' && st === 'fly') expect(b!.y).toBeLessThan(0);
        seen.set(id, st);
      }
    }
    expect(hadPerch && hadAway).toBe(true);
  });

  it('posés sur la corniche, aucun la nuit ; sous la pluie ils ne picorent pas', () => {
    const flocks = pigeonFlocks(host, SEED, TUE.iso);
    expect(flocks.length).toBeLessThanOrEqual(2);
    // Deux pigeons ne se posent jamais l'un sur l'autre (volées sur deux parts de la corniche), sur tous les toits.
    for (const l of fronts) for (let d = 1; d <= 28; d++) {
      const xs = pigeonFlocks(l, SEED, `2026-12-${String(d).padStart(2, '0')}`).flatMap((f) => f.birds.map((b) => b.x)).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(2.5);
    }
    for (const f of flocks) {
      expect(f.P).toBeGreaterThanOrEqual(11);
      expect(f.P).toBeLessThanOrEqual(17);
    }
    expect(pigeonsAt(host, SEED, TUE.iso, 2 * 60, false)).toEqual([]);
    expect(pigeonsAt(host, SEED, TUE.iso, 23.5 * 60, false)).toEqual([]);
    let poses = 0;
    for (let m = 8 * 60; m < 19 * 60; m += 0.37) {
      for (const b of pigeonsAt(host, SEED, TUE.iso, m, false)) if (b.pose !== 'fly') {
        expect(b.y).toBeCloseTo(host.eave - 0.8, 5);
        expect(b.x).toBeGreaterThanOrEqual(host.x);
        expect(b.x).toBeLessThanOrEqual(host.x + host.w);
      }
      for (const b of pigeonsAt(host, SEED, TUE.iso, m, true)) if (b.pose !== 'fly') {
        expect(b.pose).toBe('perch');
        poses++;
      }
    }
    expect(poses).toBeGreaterThan(0);
  });
});

describe('fumées', () => {
  it('fumées seulement en hiver', () => {
    const l = fronts.find((f) => smokeAt(f, TUE, true, SEED).some(Boolean))!;
    expect(l).toBeDefined();
    expect(smokeAt(l, TUE, true, SEED)).toHaveLength(l.chimneys.length);
    expect(smokeAt(l, JUNE, true, SEED).some(Boolean)).toBe(false);
    // Et seulement si quelqu'un est à la maison sous ce toit.
    expect(smokeAt(l, TUE, false, SEED).some(Boolean)).toBe(false);
  });

  it('jamais de fumée d’une souche cachée par une lucarne (tabatière peinte par-dessus)', () => {
    const l = fronts.find((f) => smokeAt(f, TUE, true, SEED).some(Boolean))!;
    const k = smokeAt(l, TUE, true, SEED).findIndex(Boolean);
    const c = l.chimneys[k]!;
    const covered: FacadeLayout = { ...l, dormers: [...l.dormers, { type: 'tabatiere', bay: 0, cx: c.x + 2, y: c.top + 1, w: 5, h: 2.6 }] };
    expect(chimneyVisible(l, k)).toBe(true);
    expect(chimneyVisible(covered, k)).toBe(false);
    expect(smokeAt(covered, TUE, true, SEED)[k]).toBe(false);
  });

  it('quelqu’un à la maison : membres sortis par la porte et pas revenus, logement parti', () => {
    const s = (segments: Schedule['segments']): Schedule => ({ dwelling: '0:0', segments, shutUser: false, maxActors: 0 });
    const two = s([{ k: 'depart', t: 480, m: 0 }, { k: 'depart', t: 500, m: 1 }, { k: 'return', t: 1100, m: 1 }]);
    expect(homeOccupied(two, 2, 470)).toBe(true);
    expect(homeOccupied(two, 2, 600)).toBe(false);
    expect(homeOccupied(two, 2, 1110)).toBe(true);
    // Un invité (indice ≥ membres) ne compte pas.
    expect(homeOccupied(s([{ k: 'depart', t: 480, m: 0 }, { k: 'return', t: 490, m: 1 }]), 1, 600)).toBe(false);
    expect(homeOccupied(s([]), 2, 600)).toBe(false);
  });
});

describe('couvreur', () => {
  it('couvreur seulement mardi et jeudi par temps sec', () => {
    const at = (day: SceneDay, m: number) => rooferAt(fronts, SEED, day, m);
    expect(at(TUE, 11 * 60)).not.toBeNull();
    expect(at(THU, 11 * 60)).not.toBeNull();
    expect(at(WED, 11 * 60)).toBeNull();
    expect(at(dayOf(2026, 12, 15, true), 11 * 60)).toBeNull();
    for (let d = 13; d <= 19; d++) {
      const day = dayOf(2026, 12, d);
      const any = Array.from({ length: 48 }, (_, k) => at(day, k * 30)).some(Boolean);
      expect(any).toBe(day.weekday === 2 || day.weekday === 4);
    }
    // Hors de 9 h - 16 h 30 : personne.
    for (let m = 0; m < 1440; m += 5) if (m < 540 || m > 990) expect(at(TUE, m)).toBeNull();
    // Sur un toit à la Mansart (terrasson où s'agenouiller).
    expect(fronts[at(TUE, 11 * 60)!.facade]!.roof.kind).toBe('mansard');
  });

  it("arrive et repart par l'arrière du toit (caché sous le faîtage), sans saut ; l'averse le fait redescendre", () => {
    let prev: ReturnType<typeof rooferAt> = null;
    let entered = 0;
    for (let m = 520; m < 1000; m += 1 / 60) {
      const r = rooferAt(fronts, SEED, TUE, m);
      const l = r ? fronts[r.facade]! : null;
      if (r && !prev) {
        entered++;
        // Il entre entièrement caché derrière le faîtage (pieds 11 px sous la ligne du terrasson).
        expect(r.y).toBeGreaterThanOrEqual(l!.top + 0.6 + 11);
      }
      if (!r && prev) expect(prev.y).toBeGreaterThanOrEqual(fronts[prev.facade]!.top + 0.6 + 11 - 0.1);
      if (r && prev) {
        expect(Math.abs(r.x - prev.x)).toBeLessThan(1.5);
        expect(Math.abs(r.y - prev.y)).toBeLessThan(1);
      }
      prev = r;
    }
    // Matin et après-midi (pause de midi).
    expect(entered).toBe(2);
    // Pluie à 11 h : il finit ce qu'il fait et redescend, ne revient pas l'après-midi.
    const wet = dayOf(2026, 12, 15, true);
    const r1 = rooferAt(fronts, SEED, wet, 11 * 60 + 0.2, 11 * 60);
    expect(r1?.pose).toBe('walk');
    expect(rooferAt(fronts, SEED, wet, 11 * 60 + 5, 11 * 60)).toBeNull();
    expect(rooferAt(fronts, SEED, wet, 14 * 60, 11 * 60)).toBeNull();
  });
});
