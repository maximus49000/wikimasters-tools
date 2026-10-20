// tests/core/library/city-install.test.ts
import { describe, expect, it } from 'vitest';
import type { YMD } from '../../../src/core/library/city/calendar';
import {
  STEPS_BY_EQUIPMENT,
  absMinute,
  crewAt,
  beerStandsFor,
  decorSetsFor,
  itemEquipment,
  stageXs,
  itemPhase,
  itemShown,
  stepsOf,
  STAND_STAGE_CLEAR,
  type DecorSet,
} from '../../../src/core/library/city/install';
import { dayNumber } from '../../../src/core/library/city/shops/hours';

const W = 1440;
const H = 600;
const SEED = 12345;
const at = (date: YMD, h: number, min = 0): number => absMinute(dayNumber(date), h * 60 + min);
const ids = (date: YMD, seed = SEED): string[] => decorSetsFor(date, W, H, seed).map((s) => s.id);
const setOf = (date: YMD, id: string, seed = SEED): DecorSet => {
  const s = decorSetsFor(date, W, H, seed).find((x) => x.id === id);
  if (!s) throw new Error(`jeu ${id} absent`);
  return s;
};
const BASTILLE = dayNumber({ y: 2026, m: 7, d: 14 });
const MUSIC = dayNumber({ y: 2026, m: 6, d: 21 });

describe('decorSetsFor', () => {
  it('regarde la veille et le lendemain de la fête', () => {
    expect(ids({ y: 2026, m: 7, d: 13 })).toEqual(expect.arrayContaining(['lamps-bastille', 'doors-bastille']));
    expect(ids({ y: 2026, m: 7, d: 12 })).toEqual([]);
    expect(ids({ y: 2026, m: 7, d: 14 })).toEqual(expect.arrayContaining(['barriers-bastille', 'lamps-bastille', 'doors-bastille']));
    expect(ids({ y: 2026, m: 7, d: 15 })).toEqual(expect.arrayContaining(['lamps-bastille', 'doors-bastille']));
    expect(ids({ y: 2026, m: 6, d: 21 })).toContain('stage-music-0');
    expect(ids({ y: 2026, m: 6, d: 22 })).toContain('stage-music-0');
    expect(ids({ y: 2026, m: 3, d: 10 })).toEqual([]);
  });
  it('pose les drapeaux le 1er mai et le 11 novembre', () => {
    expect(ids({ y: 2026, m: 5, d: 1 })).toEqual(expect.arrayContaining(['lamps-may-day', 'doors-may-day']));
    expect(ids({ y: 2026, m: 11, d: 10 })).toEqual(expect.arrayContaining(['lamps-armistice', 'doors-armistice']));
  });
  it('porte le jour de la fête et les fenêtres du plan', () => {
    const lamps = setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille');
    expect(lamps.day).toBe(BASTILLE);
    expect(lamps.equipment).toBe('lift');
    expect(lamps.install).toEqual({ dayOffset: -1, from: 540, to: 1020 });
    expect(lamps.remove).toEqual({ dayOffset: 1, from: 540, to: 1020 });
    expect(lamps.items.length).toBeGreaterThan(3);
    expect(lamps.items.every((i) => i.kind === 'lamp-flag')).toBe(true);
    const doors = setOf({ y: 2026, m: 7, d: 13 }, 'doors-bastille');
    expect(doors.equipment).toBe('ladder');
    expect(doors.items.every((i) => i.kind === 'door-flag')).toBe(true);
    const barriers = setOf({ y: 2026, m: 7, d: 14 }, 'barriers-bastille');
    expect(barriers.equipment).toBe('hand');
    expect(barriers.install).toEqual({ dayOffset: 0, from: 420, to: 480 });
    expect(barriers.remove).toEqual({ dayOffset: 0, from: 750, to: 810 });
    expect(barriers.items.map((i) => i.x)).toEqual(Array.from({ length: barriers.items.length }, (_, k) => 60 + 120 * k));
    const stage = setOf({ y: 2026, m: 6, d: 21 }, 'stage-music-0');
    expect(stage.items.map((i) => i.kind)).toEqual(['stage-floor', 'stage-frame', 'stage-spots']);
    expect(new Set(stage.items.map((i) => i.x)).size).toBe(1);
  });
  it('les éléments en hauteur seulement pour l’échelle ou le camion, jamais à la main', () => {
    const sets = [...decorSetsFor({ y: 2026, m: 7, d: 14 }, W, H, SEED), ...decorSetsFor({ y: 2026, m: 6, d: 21 }, W, H, SEED)];
    for (const s of sets) {
      for (const item of s.items) {
        const eq = itemEquipment(s, item);
        if (eq === 'hand') expect(item.high).toBe(false);
        if (item.high) expect(['ladder', 'lift']).toContain(eq);
      }
    }
    const stage = sets.find((s) => s.id === 'stage-music-0')!;
    expect(stage.items.map((i) => itemEquipment(stage, i))).toEqual(['hand', 'lift', 'lift']);
  });
});

describe('itemPhase', () => {
  const lamps = setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille');
  const first = [...lamps.items].sort((a, b) => a.u - b.u)[0]!;
  it('suit la vie d’un drapeau de lampadaire', () => {
    expect(itemPhase(lamps, first, at({ y: 2026, m: 7, d: 13 }, 8), BASTILLE)).toEqual({ phase: 'absent' });
    expect(itemPhase(lamps, first, at({ y: 2026, m: 7, d: 13 }, 9, 1), BASTILLE).phase).toBe('installing');
    for (const item of lamps.items) {
      expect(itemPhase(lamps, item, at({ y: 2026, m: 7, d: 13 }, 17, 30), BASTILLE)).toEqual({ phase: 'present' });
      expect(itemPhase(lamps, item, at({ y: 2026, m: 7, d: 14 }, 12), BASTILLE)).toEqual({ phase: 'present' });
      expect(itemPhase(lamps, item, at({ y: 2026, m: 7, d: 15 }, 18), BASTILLE)).toEqual({ phase: 'absent' });
    }
    const firstOut = [...lamps.items].sort((a, b) => a.removeU - b.removeU)[0]!;
    const p = itemPhase(lamps, firstOut, at({ y: 2026, m: 7, d: 15 }, 9, 1), BASTILLE);
    expect(p.phase).toBe('removing');
  });
  it('va toujours absent → installing → present → removing → absent', () => {
    const sets = [...decorSetsFor({ y: 2026, m: 7, d: 14 }, W, H, SEED), ...decorSetsFor({ y: 2026, m: 6, d: 21 }, W, H, SEED)];
    for (const s of sets) {
      const day = s.day;
      for (const item of s.items) {
        const seq: string[] = [];
        for (let t = absMinute(day - 2, 0); t < absMinute(day + 3, 0); t += 1) {
          const ph = itemPhase(s, item, t, day).phase;
          if (seq[seq.length - 1] !== ph) seq.push(ph);
        }
        expect(seq, `${s.id}/${item.id}`).toEqual(['absent', 'installing', 'present', 'removing', 'absent']);
      }
    }
  });
  it('le drapeau n’apparaît qu’à la fin de la fixation et reste jusqu’à la fin du démontage du geste', () => {
    const order = [...lamps.items].sort((a, b) => a.u - b.u);
    const item = order[0]!;
    const steps: string[] = [];
    const shown: boolean[] = [];
    for (let t = at({ y: 2026, m: 7, d: 13 }, 9); t < at({ y: 2026, m: 7, d: 13 }, 17); t += 0.25) {
      const p = itemPhase(lamps, item, t, BASTILLE);
      if (p.phase !== 'installing') continue;
      steps.push(p.step);
      shown.push(itemShown(lamps, item, p));
    }
    const lastFix = steps.lastIndexOf('fix');
    expect(lastFix).toBeGreaterThan(0);
    expect(shown.slice(0, lastFix + 1).every((s) => !s)).toBe(true);
    expect(shown.slice(lastFix + 1).every((s) => s)).toBe(true);
    expect(itemShown(lamps, item, { phase: 'present' })).toBe(true);
    expect(itemShown(lamps, item, { phase: 'absent' })).toBe(false);
    const rSteps: string[] = [];
    const rShown: boolean[] = [];
    for (let t = at({ y: 2026, m: 7, d: 15 }, 9); t < at({ y: 2026, m: 7, d: 15 }, 17); t += 0.25) {
      const p = itemPhase(lamps, item, t, BASTILLE);
      if (p.phase !== 'removing') continue;
      rSteps.push(p.step);
      rShown.push(itemShown(lamps, item, p));
    }
    expect(rSteps).toContain('unfix');
    expect(rSteps).not.toContain('fix');
    const lastUnfix = rSteps.lastIndexOf('unfix');
    expect(rShown.slice(0, lastUnfix + 1).every((s) => s)).toBe(true);
    expect(rShown.slice(lastUnfix + 1).every((s) => !s)).toBe(true);
  });
  it('suit les étapes de l’équipement dans l’ordre, progression dans [0, 1)', () => {
    const doors = setOf({ y: 2026, m: 7, d: 13 }, 'doors-bastille');
    const item = doors.items[0]!;
    const seen: string[] = [];
    for (let t = at({ y: 2026, m: 7, d: 13 }, 9); t < at({ y: 2026, m: 7, d: 13 }, 17); t += 0.1) {
      const p = itemPhase(doors, item, t, BASTILLE);
      if (p.phase !== 'installing') continue;
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThan(1);
      if (seen[seen.length - 1] !== p.step) seen.push(p.step);
    }
    expect(seen).toEqual([...STEPS_BY_EQUIPMENT.ladder]);
    expect(stepsOf('ladder', true)).toEqual(['arrive', 'ladder-up', 'climb', 'unfix', 'descend', 'ladder-down', 'leave']);
    expect(STEPS_BY_EQUIPMENT.lift).toEqual(['arrive', 'deploy', 'rise', 'fix', 'lower', 'stow', 'leave']);
    expect(STEPS_BY_EQUIPMENT.hand).toEqual(['arrive', 'place', 'leave']);
  });
  it('est déterministe et l’ordre dépend de la graine', () => {
    const a = setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille', 7);
    const b = setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille', 7);
    const c = setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille', 8);
    const t = at({ y: 2026, m: 7, d: 13 }, 12);
    expect(a.items.map((i) => itemPhase(a, i, t, BASTILLE))).toEqual(b.items.map((i) => itemPhase(b, i, t, BASTILLE)));
    const order = (s: DecorSet): string[] => [...s.items].sort((x, y) => x.u - y.u).map((i) => i.id);
    const removeOrder = (s: DecorSet): string[] => [...s.items].sort((x, y) => x.removeU - y.removeU).map((i) => i.id);
    expect(order(a)).toEqual(order(b));
    // Le nombre de lampadaires dépend aussi de la graine : on compare l'ordre sur les éléments communs.
    const common = (o: string[], ref: string[]): string[] => o.filter((id) => ref.includes(id));
    const other = [8, 9, 10, 11].map((sd) => order(setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille', sd)));
    expect(other.some((o) => common(o, order(a)).join() !== common(order(a), o).join())).toBe(true);
    expect(c.items[0]!.u).not.toBe(a.items[0]!.u);
    expect(removeOrder(a)).toEqual(removeOrder(b));
  });
});

describe('scène de la Fête de la musique', () => {
  const stage = setOf({ y: 2026, m: 6, d: 21 }, 'stage-music-0');
  const [floor, frame, spots] = stage.items as [DecorSet['items'][0], DecorSet['items'][0], DecorSet['items'][0]];
  const firstPresent = (item: typeof floor): number => {
    for (let t = absMinute(MUSIC, 0); t < absMinute(MUSIC + 1, 0); t += 1) if (itemPhase(stage, item, t, MUSIC).phase === 'present') return t;
    return Infinity;
  };
  it('monte le plancher, puis l’ossature, puis les projecteurs, entre 9 h et 16 h', () => {
    expect(firstPresent(floor)).toBeLessThan(firstPresent(frame));
    expect(firstPresent(frame)).toBeLessThan(firstPresent(spots));
    expect(itemPhase(stage, floor, absMinute(MUSIC, 539), MUSIC)).toEqual({ phase: 'absent' });
    for (const item of stage.items) expect(itemPhase(stage, item, absMinute(MUSIC, 960), MUSIC)).toEqual({ phase: 'present' });
  });
  it('démonte dans la nuit du 21 au 22, de 0 h à 4 h, projecteurs d’abord', () => {
    for (const item of stage.items) {
      expect(itemPhase(stage, item, absMinute(MUSIC, 1439), MUSIC)).toEqual({ phase: 'present' });
      expect(itemPhase(stage, item, absMinute(MUSIC + 1, 240), MUSIC)).toEqual({ phase: 'absent' });
    }
    const firstGone = (item: typeof floor): number => {
      for (let t = absMinute(MUSIC + 1, 0); t < absMinute(MUSIC + 1, 300); t += 1) if (itemPhase(stage, item, t, MUSIC).phase === 'absent') return t;
      return Infinity;
    };
    expect(firstGone(spots)).toBeLessThan(firstGone(frame));
    expect(firstGone(frame)).toBeLessThan(firstGone(floor));
    expect(firstGone(floor)).toBeLessThanOrEqual(absMinute(MUSIC + 1, 240));
  });
});

describe('crewAt', () => {
  it('une seule intervention à la fois par jeu, null hors fenêtres', () => {
    const sets = [...decorSetsFor({ y: 2026, m: 7, d: 14 }, W, H, SEED), ...decorSetsFor({ y: 2026, m: 6, d: 21 }, W, H, SEED)];
    for (const s of sets) {
      const day = s.day;
      for (let t = absMinute(day - 2, 0); t < absMinute(day + 3, 0); t += 2) {
        const busy = s.items.filter((i) => {
          const p = itemPhase(s, i, t, day).phase;
          return p === 'installing' || p === 'removing';
        });
        expect(busy.length, `${s.id} @${t}`).toBeLessThanOrEqual(1);
        const crew = crewAt(s, t, day);
        if (busy.length === 0) expect(crew).toBeNull();
        else {
          const p = itemPhase(s, busy[0]!, t, day);
          expect(crew).toEqual({ itemId: busy[0]!.id, step: (p as { step: string }).step, progress: (p as { progress: number }).progress, removing: p.phase === 'removing' });
        }
      }
    }
    const lamps = setOf({ y: 2026, m: 7, d: 13 }, 'lamps-bastille');
    expect(crewAt(lamps, at({ y: 2026, m: 7, d: 13 }, 8), BASTILLE)).toBeNull();
    expect(crewAt(lamps, at({ y: 2026, m: 7, d: 14 }, 12), BASTILLE)).toBeNull();
    expect(crewAt(lamps, at({ y: 2026, m: 7, d: 13 }, 12), BASTILLE)).not.toBeNull();
    expect(crewAt(lamps, at({ y: 2026, m: 7, d: 15 }, 12), BASTILLE)?.removing).toBe(true);
  });
});

describe('Fête de la musique : scènes, barrières, stands de bière', () => {
  const D20: YMD = { y: 2026, m: 6, d: 20 };
  const D21: YMD = { y: 2026, m: 6, d: 21 };
  const D22: YMD = { y: 2026, m: 6, d: 22 };
  it('un seul exemplaire de chaque jeu, la veille, le jour et le lendemain (la fête du 22/6 0 h-4 h 30 prolonge celle du 21)', () => {
    for (const d of [D20, D21, D22]) {
      const list = ids(d);
      expect(list.filter((id) => id === 'beer-stands-music')).toHaveLength(1);
      expect(list.filter((id) => id === 'barriers-music')).toHaveLength(1);
      expect(list).toContain('stage-music-0');
      expect(new Set(list).size).toBe(list.length);
      for (const s of decorSetsFor(d, W, H, SEED)) if (s.fest === 'music') expect(s.day).toBe(MUSIC);
    }
    expect(ids({ y: 2026, m: 6, d: 23 }).some((id) => id.endsWith('-music'))).toBe(false);
    expect(ids({ y: 2026, m: 6, d: 19 })).toEqual([]);
  });
  it('N scènes = max(1, round(largeur / 700)), régulièrement réparties', () => {
    for (const [w, n] of [[400, 1], [720, 1], [1440, 2], [2100, 3], [2800, 4]] as const) {
      const xs = stageXs(w, SEED);
      expect(xs, `${w}`).toHaveLength(n);
      const sets = decorSetsFor(D21, w, H, SEED).filter((s) => s.id.startsWith('stage-music'));
      expect(sets.map((s) => s.id)).toEqual(Array.from({ length: n }, (_, k) => `stage-music-${k}`));
      sets.forEach((s, k) => {
        expect(s.items.map((i) => i.kind)).toEqual(['stage-floor', 'stage-frame', 'stage-spots']);
        expect(s.items.every((i) => i.x === xs[k])).toBe(true);
        expect(s.install).toEqual({ dayOffset: 0, from: 540, to: 960 });
        expect(s.remove).toEqual({ dayOffset: 1, from: 0, to: 240 });
        // Chaque scène dans sa part de rue.
        expect(xs[k]!).toBeGreaterThan((k * w) / n);
        expect(xs[k]!).toBeLessThan(((k + 1) * w) / n);
      });
    }
    expect(stageXs(1440, 1)).not.toEqual(stageXs(1440, 2));
  });
  it('barrières de la rue privatisée : posées de 13 h à 14 h le 21/6, retirées de 4 h 30 à 5 h le 22/6', () => {
    const b = setOf(D21, 'barriers-music');
    expect(b.equipment).toBe('hand');
    expect(b.install).toEqual({ dayOffset: 0, from: 780, to: 840 });
    expect(b.remove).toEqual({ dayOffset: 1, from: 270, to: 300 });
    expect(b.items.length).toBeGreaterThanOrEqual(2);
    expect(b.items.every((i) => i.kind === 'barrier' && !i.high && (i.lane === 'far' || i.lane === 'near'))).toBe(true);
    expect(b.items.some((i) => itemPhase(b, i, at(D21, 13, 59) + 0.5, MUSIC).phase !== 'present')).toBe(true);
    for (const i of b.items) {
      expect(itemPhase(b, i, at(D21, 12, 59), MUSIC).phase).toBe('absent');
      expect(itemPhase(b, i, at(D21, 14), MUSIC).phase).toBe('present');
      expect(itemPhase(b, i, at(D22, 4, 29), MUSIC).phase).toBe('present');
      expect(itemPhase(b, i, at(D22, 5), MUSIC).phase).toBe('absent');
    }
  });
  it('stands : max(2, round(largeur / 240)), sur la chaussée, jamais sur une scène', () => {
    for (const w of [400, 720, 1000, 1440, 2100, 2800]) {
      for (const seed of [1, 2, 3, 12345]) {
        const stands = beerStandsFor(w, H, seed);
        expect(stands, `${w}`).toHaveLength(Math.max(2, Math.round(w / 240)));
        const stages = stageXs(w, seed);
        const clear = STAND_STAGE_CLEAR * (H / 340);
        for (const s of stands) {
          expect(s.x).toBeGreaterThan(0);
          expect(s.x).toBeLessThan(w);
          if (w >= 720) for (const x of stages) expect(Math.abs(s.x - x), `${w}/${seed} ${s.id}`).toBeGreaterThanOrEqual(clear - 1e-9);
          expect([1, -1]).toContain(s.side);
        }
        // Ordonnés de gauche à droite, ids distincts.
        expect(stands.map((s) => s.x)).toEqual([...stands.map((s) => s.x)].sort((a, b) => a - b));
        expect(new Set(stands.map((s) => s.id)).size).toBe(stands.length);
      }
    }
  });
  it('jeu beer-stands-music : comptoir (main) puis auvent (échelle), montage 12 h-15 h 30, dépose 2 h 30-5 h', () => {
    const set = setOf(D21, 'beer-stands-music');
    const stands = beerStandsFor(W, H, SEED);
    expect(set.install).toEqual({ dayOffset: 0, from: 720, to: 930 });
    expect(set.remove).toEqual({ dayOffset: 1, from: 150, to: 300 });
    expect(set.items).toHaveLength(stands.length * 2);
    for (const st of stands) {
      const counter = set.items.find((i) => i.id === `${st.id}-counter`)!;
      const awning = set.items.find((i) => i.id === `${st.id}-awning`)!;
      expect(counter.kind).toBe('stand-counter');
      expect(awning.kind).toBe('stand-awning');
      expect(counter.high).toBe(false);
      expect(awning.high).toBe(true);
      expect(itemEquipment(set, counter)).toBe('hand');
      expect(itemEquipment(set, awning)).toBe('ladder');
      expect(counter.x).toBe(st.x);
      expect(awning.x).toBe(st.x);
      expect(counter.group).toBe(st.id);
      // L'auvent ne se pose qu'après le comptoir, et se retire avant lui.
      expect(awning.u).toBeGreaterThan(counter.u);
      expect(awning.removeU).toBeLessThan(counter.removeU);
      let counterUp = Infinity;
      let awningUp = Infinity;
      for (let t = at(D21, 12); t < at(D21, 16); t += 0.5) {
        if (counterUp === Infinity && itemPhase(set, counter, t, MUSIC).phase === 'present') counterUp = t;
        if (awningUp === Infinity && itemPhase(set, awning, t, MUSIC).phase === 'present') awningUp = t;
      }
      expect(counterUp).toBeLessThan(awningUp);
      expect(awningUp).toBeLessThanOrEqual(at(D21, 15, 30));
      for (const i of [counter, awning]) {
        expect(itemPhase(set, i, at(D21, 11, 59), MUSIC)).toEqual({ phase: 'absent' });
        expect(itemPhase(set, i, at(D22, 2, 29), MUSIC)).toEqual({ phase: 'present' });
        expect(itemPhase(set, i, at(D22, 5), MUSIC)).toEqual({ phase: 'absent' });
      }
    }
    expect(STEPS_BY_EQUIPMENT.ladder).toContain('fix');
  });
});

describe('Halloween : lampadaires (mairie) et entrées (habitants)', () => {
  const OCT = (d: number): YMD => ({ y: 2026, m: 10, d });
  const NOV = (d: number): YMD => ({ y: 2026, m: 11, d });
  const HW = dayNumber(OCT(31));
  const doorSets = (date: YMD): DecorSet[] => decorSetsFor(date, W, H, SEED).filter((s) => s.id.startsWith('halloween-'));

  it('lampadaires : posés au camion élévateur le samedi 24 octobre, retirés le mardi 3 novembre, de 9 h à 17 h', () => {
    expect(ids(OCT(23))).not.toContain('lamps-halloween');
    expect(ids(NOV(4))).not.toContain('lamps-halloween');
    const set = setOf(OCT(24), 'lamps-halloween');
    expect(set.equipment).toBe('lift');
    expect(set.transport).toBe('lift');
    expect(set.day).toBe(HW);
    expect(new Set(set.items.map((i) => i.kind))).toEqual(new Set(['lamp-pumpkin', 'lamp-bats']));
    for (const item of set.items) {
      expect(itemPhase(set, item, at(OCT(24), 8, 59), set.day).phase).toBe('absent');
      expect(itemPhase(set, item, at(OCT(27), 12), set.day).phase).toBe('present');
      expect(itemPhase(set, item, at(NOV(3), 17, 1), set.day).phase).toBe('absent');
    }
    // Un seul exemplaire du jeu chaque jour de la période.
    for (const d of [OCT(24), OCT(28), OCT(31), NOV(1), NOV(3)]) expect(ids(d).filter((x) => x === 'lamps-halloween')).toHaveLength(1);
  });

  it('entrées : une partie seulement, posées entre le 24 et le 31, retirées entre le 1er et le 8 novembre, par un habitant à l’échelle', () => {
    const all = doorSets(OCT(31));
    expect(all.length).toBeGreaterThan(0);
    for (const set of all) {
      expect(set.transport).toBe('door');
      expect(set.equipment).toBe('ladder');
      expect(set.items).toHaveLength(1);
      expect(['door-web', 'door-ghost']).toContain(set.items[0]!.kind);
      expect(set.install.dayOffset).toBeGreaterThanOrEqual(-7);
      expect(set.install.dayOffset).toBeLessThanOrEqual(0);
      expect(set.remove.dayOffset).toBeGreaterThanOrEqual(1);
      expect(set.remove.dayOffset).toBeLessThanOrEqual(8);
      expect(set.install.to - set.install.from).toBe(12);
      // Le geste suit les étapes de l'échelle ; présent entre la pose et le retrait.
      const item = set.items[0]!;
      const day0 = set.day + set.install.dayOffset;
      expect(itemPhase(set, item, absMinute(day0, set.install.from + 1), set.day).phase).toBe('installing');
      expect(itemPhase(set, item, absMinute(set.day, 1200), set.day).phase).toBe('present');
    }
    // Le 8 novembre, il reste au plus les jeux retirés ce jour-là ; le 9, plus rien.
    expect(doorSets(NOV(9))).toEqual([]);
  });

  it('les jeux d’autres fêtes ne débordent pas (drapeaux du 14 juillet : de la veille au lendemain)', () => {
    expect(ids({ y: 2026, m: 7, d: 11 })).toEqual([]);
    expect(ids({ y: 2026, m: 7, d: 17 })).toEqual([]);
  });
});
