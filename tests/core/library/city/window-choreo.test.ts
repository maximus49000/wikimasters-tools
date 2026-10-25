import { describe, expect, it } from 'vitest';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import { homeState, type Actor } from '../../../../src/core/library/city/home-state';
import { dayContext } from '../../../../src/core/library/city/calendar';
import { dwellingDay } from '../../../../src/core/library/city/dwelling-day';
import { sceneDay } from '../../../../src/core/library/city/scene-day';
import type { Choreo, Where } from '../../../../src/core/library/city/schedules';
import { WINDOW_ARM_POSES, windowPose, type WindowPose } from '../../../../src/core/library/city/window-choreo';
import { YAW_FRONT, YAW_LEFT, YAW_RIGHT } from '../../../../src/core/library/figure/gait';
import { ARM_POSES, armTarget } from '../../../../src/core/library/figure/skeleton';

const W = 1440;
const H = 340;
const dwellings = cityDwellings(cityFacades(W, H, 3), 3);
const home: Dwelling = dwellings.find((d) => d.rooms.length === 3 && d.balcony) ?? dwellings.find((d) => d.rooms.length === 3)!;
const CHOREOS: Choreo[] = ['cook', 'openShutters', 'closeShutters', 'armsUp', 'drawCurtains', 'table', 'tv', 'read', 'lean', 'leanRail', 'water', 'shake', 'smoke', 'cross', 'stand', 'dance'];

// Acteur à l'avancement `p` d'une scène de `dur` minutes (t s'en déduit : la durée se lit dans t / p).
const actor = (choreo: Choreo, p: number, dur = 4, x: Partial<Actor> = {}): Actor => ({
  dwelling: home.id, room: 'salon', where: 'in', m: 0, choreo, p, t: p * dur,
  seat: 0, party: 1, desk: false, slot: 0, reverse: false, animated: true, prio: 1, culled: false, ...x,
});
const whereOf = (choreo: Choreo): Where => (choreo === 'leanRail' ? 'balcony' : choreo === 'lean' || choreo === 'shake' ? 'lean' : 'in');

describe('poses des pantins de fenêtre', () => {
  it('toute chorégraphie commence et finit par une marche ou hors champ', () => {
    for (const c of CHOREOS) {
      for (const p of [0.01, 0.99]) {
        const pose = windowPose(actor(c, p, 4, { where: whereOf(c) }), home);
        if (pose !== null) {
          expect(pose.gait, `${c} à p=${p}`).toBe('walk');
          expect(pose.still, `${c} à p=${p}`).toBe(false);
        }
      }
    }
  });

  it('balcon : on traverse la vitre (where in → balcony) en marchant', () => {
    const seen: Where[] = [];
    let crossedWalking = false;
    for (let p = 0.005; p < 1; p += 0.005) {
      const pose = windowPose(actor('leanRail', p, 2, { where: 'balcony' }), home);
      if (!pose) continue;
      if (seen[seen.length - 1] !== pose.where) seen.push(pose.where);
      if (pose.where === 'balcony' && pose.gait === 'walk' && seen.length === 2) crossedWalking = true;
    }
    // Dedans en marchant, dehors en marchant puis immobile au garde-corps, et retour par le même chemin.
    expect(seen).toEqual(['in', 'balcony', 'in']);
    expect(crossedWalking).toBe(true);
    const mid = windowPose(actor('leanRail', 0.5, 22, { where: 'balcony' }), home)!;
    expect(mid.where).toBe('balcony');
    expect(mid.gait).toBe('stand');
    expect(mid.arms).toBe('rail');
    expect(mid.still).toBe(true);
    expect(mid.dx).toBeCloseTo(0.3, 9);
  });

  it('les nouvelles ArmPose sont dans ARM_POSES et ont des cibles', () => {
    expect(WINDOW_ARM_POSES).toEqual(['shutters', 'curtain', 'sill', 'rail', 'smoke-up', 'smoke-down', 'water', 'shake-1', 'shake-2', 'cook-1', 'cook-2', 'table', 'tv', 'dance-1', 'dance-2']);
    for (const a of WINDOW_ARM_POSES) {
      expect(ARM_POSES, a).toContain(a);
      // Le bras droit est celui des gestes : toujours une cible ; les deux bras pour les gestes à deux mains.
      expect(armTarget(a, 1), a).not.toBeNull();
    }
    for (const a of ['shutters', 'sill', 'rail', 'shake-1', 'table', 'dance-1'] as const) expect(armTarget(a, -1), a).not.toBeNull();
  });

  it('pose déterministe pour un même acteur', () => {
    for (const c of CHOREOS) {
      const a = actor(c, 0.47, 6, { where: whereOf(c), slot: 1, seat: 1, party: 2 });
      const p1 = windowPose(a, home);
      const p2 = windowPose({ ...a }, home);
      expect(p2).toEqual(p1);
    }
  });

  it('orientation et allure des poses clés (maquette 06-pantins.js)', () => {
    const at = (c: Choreo, p: number, x: Partial<Actor> = {}): WindowPose => windowPose(actor(c, p, 6, { where: whereOf(c), ...x }), home)!;
    const tv = at('tv', 0.5);
    expect(tv).toMatchObject({ gait: 'seated', arms: 'tv', yaw: YAW_LEFT, still: true, dx: 0.22 });
    const alone = at('table', 0.5, { desk: true });
    expect(alone).toMatchObject({ gait: 'seated', arms: 'table', yaw: YAW_RIGHT, still: true, dx: -0.12, props: ['cup'] });
    const guest = at('table', 0.5, { seat: 1, party: 2 });
    expect(guest).toMatchObject({ yaw: YAW_LEFT, dx: 0.24 });
    expect(at('cook', 0.5)).toMatchObject({ gait: 'stand', yaw: YAW_RIGHT, dx: -0.22, still: false, props: ['spoon'] });
    expect(['cook-1', 'cook-2']).toContain(at('cook', 0.5).arms);
    expect(at('armsUp', 0.5)).toMatchObject({ gait: 'stand', arms: 'shutters', yaw: YAW_FRONT, dx: 0 });
    expect(at('lean', 0.5)).toMatchObject({ gait: 'stand', arms: 'sill', lean: 2, where: 'lean', still: true });
    expect(at('shake', 0.5)).toMatchObject({ where: 'lean', props: ['rug'], still: false });
    expect(['shake-1', 'shake-2']).toContain(at('shake', 0.5).arms);
    expect(at('water', 0.5, { where: 'balcony' })).toMatchObject({ yaw: YAW_RIGHT, where: 'balcony', props: ['watering-can'] });
    expect(at('smoke', 0.5)).toMatchObject({ where: 'lean', props: ['cigarette'] });
    expect(['smoke-up', 'smoke-down']).toContain(at('smoke', 0.5).arms);
    expect(at('read', 0.5)).toMatchObject({ gait: 'seated', arms: 'read', props: ['book'], still: true });
    expect(at('drawCurtains', 0.5)).toMatchObject({ arms: 'curtain', yaw: YAW_FRONT, still: false });
    expect(at('openShutters', 0.4)).toMatchObject({ arms: 'shutters', yaw: YAW_FRONT });
    expect(at('openShutters', 0.8)).toMatchObject({ arms: 'sill', where: 'lean', lean: 2 });
    expect(at('closeShutters', 0.6)).toMatchObject({ arms: 'shutters' });
    expect(['dance-1', 'dance-2']).toContain(at('dance', 0.5).arms);
    expect(at('stand', 0.5)).toMatchObject({ gait: 'stand', arms: 'down', still: true });
  });

  it('le fumeur alterne main à la bouche et bras baissé sur un cycle de 11 s', () => {
    const arms = new Set<string>();
    for (let s = 0; s < 11; s += 0.5) arms.add(windowPose(actor('smoke', 0.5, 4, { where: 'lean', t: 2 + s / 60 }), home)!.arms);
    expect([...arms].sort()).toEqual(['smoke-down', 'smoke-up']);
  });

  it('les gestes animés alternent leurs variantes toutes les 0,6 s', () => {
    const a1 = windowPose(actor('cook', 0.5, 8, { t: 4 }), home)!.arms;
    const a2 = windowPose(actor('cook', 0.5, 8, { t: 4 + 0.9 / 60 }), home)!.arms;
    const a3 = windowPose(actor('cook', 0.5, 8, { t: 4 + 1.5 / 60 }), home)!.arms;
    expect(a1).not.toBe(a2);
    expect(a3).toBe(a1);
  });

  it('taille : membre du foyer, invité à la taille d\'un adulte, enfant plus petit', () => {
    const fam = dwellings.find((d) => d.hh.members.some((m) => m.kid))!;
    const kid = fam.hh.members.findIndex((m) => m.kid);
    expect(windowPose(actor('lean', 0.5, 4, { dwelling: fam.id, where: 'lean', m: kid }), fam)!.size).toBe(fam.hh.members[kid]!.size);
    expect(windowPose(actor('table', 0.5, 4, { dwelling: fam.id, m: fam.hh.members.length + 1 }), fam)!.size).toBe(1);
  });

  it('entrée et sortie : 11 s de marche, au plus 30 % d\'une scène courte', () => {
    // Scène de 10 min : 11 s = 1,8 % ; à p = 0,03 on est déjà en place.
    expect(windowPose(actor('tv', 0.03, 10), home)!.gait).toBe('seated');
    expect(windowPose(actor('tv', 0.01, 10), home)!.gait).toBe('walk');
    // Scène de 30 s : l'entrée est plafonnée à 30 %.
    expect(windowPose(actor('tv', 0.29, 0.5), home)!.gait).toBe('walk');
    expect(windowPose(actor('tv', 0.31, 0.5), home)!.gait).toBe('seated');
  });

  it('siège ≥ 1 : le pantin entre et sort jusqu\'à sa place, sans saut', () => {
    for (const c of ['tv', 'read'] as const) {
      const tIn = 11 / (120 * 60);
      const before = windowPose(actor(c, tIn * 0.999, 120, { seat: 1 }), home)!;
      const after = windowPose(actor(c, tIn * 1.001, 120, { seat: 1 }), home)!;
      expect(before.gait).toBe('walk');
      expect(after.gait).toBe('seated');
      expect(Math.abs(after.dx - before.dx)).toBeLessThan(0.01);
      const out0 = windowPose(actor(c, 1 - tIn * 1.001, 120, { seat: 1 }), home)!;
      const out1 = windowPose(actor(c, 1 - tIn * 0.999, 120, { seat: 1 }), home)!;
      expect(out1.gait).toBe('walk');
      expect(Math.abs(out1.dx - out0.dx)).toBeLessThan(0.01);
    }
  });

  it('une pose still ne change pas entre deux instants proches', () => {
    for (const c of CHOREOS) {
      for (const where of ['in', 'lean', 'balcony'] as Where[]) {
        const a = actor(c, 0.5, 6, { where, slot: 1 });
        const p1 = windowPose(a, home);
        if (!p1?.still) continue;
        const p2 = windowPose({ ...a, t: a.t + 0.7 / 60 }, home);
        expect(p2, `${c} ${where}`).toEqual(p1);
      }
    }
  });

  it('mouvement réduit : pose clé centrale immobile, identique à deux instants du milieu, hors champ aux bouts', () => {
    for (const c of CHOREOS) {
      const where = whereOf(c);
      const p1 = windowPose(actor(c, 0.45, 6, { where, slot: 1 }), home, true);
      const p2 = windowPose(actor(c, 0.55, 6, { where, slot: 1, t: 0.55 * 6 + 0.3 / 60 }), home, true);
      for (const p of [0.01, 0.99]) expect(windowPose(actor(c, p, 6, { where }), home, true), `${c} à p=${p}`).toBeNull();
      if (c === 'cross') {
        // Traversée fugace : hors champ sur toute la scène en mouvement réduit.
        expect(p1).toBeNull();
        expect(p2).toBeNull();
        continue;
      }
      expect(p1, c).not.toBeNull();
      expect(p1!.still, c).toBe(true);
      expect(p1!.gait, c).not.toBe('walk');
      expect(p2, c).toEqual(p1);
    }
    expect(windowPose(actor('openShutters', 0.5, 3), home, true)!.arms).toBe('shutters');
    expect(windowPose(actor('drawCurtains', 0.5, 1), home, true)!.arms).toBe('curtain');
    expect(windowPose(actor('cook', 0.5, 8), home, true)!.arms).toBe('cook-1');
    expect(windowPose(actor('smoke', 0.5, 4, { where: 'balcony' }), home, true)!.arms).toBe('smoke-down');
    expect(windowPose(actor('water', 0.5, 4, { where: 'balcony' }), home, true)).toMatchObject({ arms: 'water', dx: home.balconnet ? 0.05 : 0.4 }); // pot du milieu
  });

  it('traversée : hors champ aux deux bouts, marche au milieu', () => {
    expect(windowPose(actor('cross', 0.01, 0.3), home)).toBeNull();
    expect(windowPose(actor('cross', 0.5, 0.3), home)).toMatchObject({ gait: 'walk', yaw: YAW_RIGHT, dx: 0 });
    expect(windowPose(actor('cross', 0.99, 0.3), home)).toBeNull();
  });

  it('balcon : le pied de chaque occupant reste dans la largeur du balcon de son logement (balconnet : deux côte à côte au plus)', () => {
    // Garde-corps : balconnet de x − 1,2 à x + w + 1,2 ; filant de x − w/2 à x + 2,2 w (sans dépasser la façade), comme `railPath`.
    const FOOT = 0.8; // demi-largeur des pieds d'un pantin, en px
    let checked = 0, balconnets = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const facades = cityFacades(W, H, seed);
      const dws = cityDwellings(facades, seed).filter((d) => d.balcony);
      for (const date of [{ y: 2026, m: 7, d: 14 }, { y: 2026, m: 6, d: 9 }, { y: 2026, m: 6, d: 13 }]) {
        const ctx = dayContext(date, []);
        const day = sceneDay(ctx, { precip: 0, snow: false, storm: false }, seed);
        for (const d of dws) {
          const f = facades[d.facade]!;
          const layout = f.layout!;
          const salon = f.lamps.filter((w) => w.home === d.home && w.kind !== 'stair' && d.roomOfWindow.get(w.bay) === 'salon').at(-1);
          if (!salon) continue;
          const level = layout.levels[salon.level];
          const balconnet = level?.balcony === 'balconnet';
          const [x0, x1] = balconnet ? [salon.x - 1.2, salon.x + salon.w + 1.2] : [salon.x - salon.w * 0.5, Math.min(layout.x + layout.w - 1, salon.x + salon.w * 2.2)];
          const sched = dwellingDay(d, ctx, day, seed).schedule;
          for (const g of sched.segments) {
            if (g.k !== 'act' || g.where !== 'balcony') continue;
            for (let m = g.t0; m < g.t1; m += 0.05) {
              const st = homeState(d, sched, null, m);
              const onRail = st.actors.filter((a) => a.where === 'balcony').map((a) => ({ a, pose: windowPose(a, d) })).filter((x) => x.pose?.where === 'balcony');
              for (const { a, pose } of onRail) {
                const x = salon.x + salon.w / 2 + pose!.dx * salon.w;
                checked++;
                if (balconnet) balconnets++;
                expect(x - FOOT, `${d.id} ${a.choreo} créneau ${a.slot} à ${m.toFixed(2)}`).toBeGreaterThanOrEqual(x0);
                expect(x + FOOT, `${d.id} ${a.choreo} créneau ${a.slot} à ${m.toFixed(2)}`).toBeLessThanOrEqual(x1);
              }
              if (balconnet) expect(onRail.length).toBeLessThanOrEqual(2);
            }
          }
        }
      }
    }
    expect(balconnets).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(balconnets);
  });
});
