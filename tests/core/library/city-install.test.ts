// tests/core/library/city-install.test.ts
import { describe, expect, it } from 'vitest';
import type { YMD } from '../../../src/core/library/city/calendar';
import {
  STEPS_BY_EQUIPMENT,
  absMinute,
  crewAt,
  decorSetsFor,
  itemEquipment,
  itemPhase,
  itemShown,
  stepsOf,
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
    expect(ids({ y: 2026, m: 6, d: 21 })).toContain('stage-music');
    expect(ids({ y: 2026, m: 6, d: 22 })).toContain('stage-music');
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
    const stage = setOf({ y: 2026, m: 6, d: 21 }, 'stage-music');
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
    const stage = sets.find((s) => s.id === 'stage-music')!;
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
    const sets = [...decorSetsFor({ y: 2026, m: 7, d: 14 }, W, H, SEED), setOf({ y: 2026, m: 6, d: 21 }, 'stage-music')];
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
  const stage = setOf({ y: 2026, m: 6, d: 21 }, 'stage-music');
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
    const sets = [...decorSetsFor({ y: 2026, m: 7, d: 14 }, W, H, SEED), setOf({ y: 2026, m: 6, d: 21 }, 'stage-music')];
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
