import { hashString, mulberry32 } from '../scene-world';
import { addDays, festivitiesOn, type FestivityId, type YMD } from './calendar';
import { doorsFor } from './doors';
import { lampsFor } from './lamps';
import { DOOR_WIDTH } from './metrics';
import { dayNumber } from './shops/hours';

// Décors de fête posés et retirés par des équipes (spec §7.2). Tout est une fonction de l'heure absolue, comme
// shops/works.ts : aucun état, aucun Math.random. Un jeu de décor est traité élément par élément par une seule équipe ;
// l'élément k occupe le k-ième créneau (de même durée) de la fenêtre de montage, puis de démontage.

export type Equipment = 'ladder' | 'lift' | 'hand';
export type ItemKind = 'lamp-flag' | 'door-flag' | 'stage-floor' | 'stage-frame' | 'stage-spots' | 'barrier';
// `x` : centre de l'élément ; `u` / `removeU` : ordre d'intervention au montage / au démontage (croissant).
export type DecorItem = { id: string; kind: ItemKind; x: number; high: boolean; u: number; removeU: number };
export type DecorWindow = { dayOffset: number; from: number; to: number }; // minutes ; dayOffset par rapport au jour de la fête
// `day` : numéro du jour de la fête (dayNumber) — ajout au plan, pour que l'appelant sache quel `festDay` passer.
export type DecorSet = { id: string; fest: FestivityId; day: number; equipment: Equipment; install: DecorWindow; remove: DecorWindow; items: DecorItem[] };
export type CrewStep = string; // voir STEPS_BY_EQUIPMENT
export type ItemPhase = { phase: 'absent' } | { phase: 'present' } | { phase: 'installing' | 'removing'; step: string; progress: number };

// Étapes du montage. Démontage : choix retenu = un mapping (`stepsOf(eq, true)`) où le geste `fix` devient `unfix` ;
// à la main, `place` reste `place` (on ramasse la barrière : le sens est donné par la phase `removing` / `removing: true`).
export const STEPS_BY_EQUIPMENT: Readonly<Record<Equipment, readonly string[]>> = {
  ladder: ['arrive', 'ladder-up', 'climb', 'fix', 'descend', 'ladder-down', 'leave'],
  lift: ['arrive', 'deploy', 'rise', 'fix', 'lower', 'stow', 'leave'],
  hand: ['arrive', 'place', 'leave'],
};
const UNFIX: Readonly<Record<Equipment, readonly string[]>> = {
  ladder: STEPS_BY_EQUIPMENT.ladder.map((s) => (s === 'fix' ? 'unfix' : s)),
  lift: STEPS_BY_EQUIPMENT.lift.map((s) => (s === 'fix' ? 'unfix' : s)),
  hand: STEPS_BY_EQUIPMENT.hand,
};
export const stepsOf = (equipment: Equipment, removing: boolean): readonly string[] => (removing ? UNFIX : STEPS_BY_EQUIPMENT)[equipment];
// Le geste qui fait apparaître (montage) ou disparaître (démontage) l'élément.
const GESTURE: Readonly<Record<Equipment, number>> = { ladder: 3, lift: 3, hand: 1 };

// Poids des étapes dans un créneau (index parallèle aux listes ci-dessus).
const WEIGHTS: Readonly<Record<Equipment, readonly number[]>> = {
  ladder: [2, 3, 2, 6, 2, 3, 2],
  lift: [3, 2, 2, 6, 2, 2, 3],
  hand: [2, 4, 2],
};

export const absMinute = (dayNumber: number, minute: number): number => dayNumber * 1440 + minute;

// Équipement propre à un élément : le plancher de scène et les barrières se portent à la main, le reste suit le jeu.
export const itemEquipment = (set: DecorSet, item: DecorItem): Equipment => (item.kind === 'stage-floor' || item.kind === 'barrier' ? 'hand' : set.equipment);

const FLAG_FESTS: readonly FestivityId[] = ['bastille', 'armistice', 'may-day'];
const EVE = { dayOffset: -1, from: 540, to: 1020 } as const;
const MORROW = { dayOffset: 1, from: 540, to: 1020 } as const;
const BARRIER_STEP = 120;

const drawn = (seed: number, setId: string, id: string): { u: number; removeU: number } => {
  const rng = mulberry32(seed ^ hashString(setId + id));
  return { u: rng(), removeU: rng() };
};

function setsForFest(fest: FestivityId, day: number, width: number, height: number, seed: number): DecorSet[] {
  const out: DecorSet[] = [];
  if (FLAG_FESTS.includes(fest)) {
    const lampsId = `lamps-${fest}`;
    out.push({
      id: lampsId, fest, day, equipment: 'lift', install: { ...EVE }, remove: { ...MORROW },
      items: lampsFor(width, seed).map((l) => ({ id: l.id, kind: 'lamp-flag', x: l.x, high: true, ...drawn(seed, lampsId, l.id) })),
    });
    const doorsId = `doors-${fest}`;
    out.push({
      id: doorsId, fest, day, equipment: 'ladder', install: { ...EVE }, remove: { ...MORROW },
      items: doorsFor(width, height, seed)
        .filter((d) => d.hallU < 0.5)
        .map((d) => ({ id: d.id, kind: 'door-flag', x: d.x + DOOR_WIDTH / 2, high: true, ...drawn(seed, doorsId, d.id) })),
    });
  }
  if (fest === 'bastille') {
    const id = 'barriers-bastille';
    const items: DecorItem[] = [];
    for (let k = 0, x = BARRIER_STEP / 2; x < width; k++, x += BARRIER_STEP) items.push({ id: `barrier-${k}`, kind: 'barrier', x, high: false, ...drawn(seed, id, `barrier-${k}`) });
    out.push({ id, fest, day, equipment: 'hand', install: { dayOffset: 0, from: 420, to: 480 }, remove: { dayOffset: 0, from: 750, to: 810 }, items });
  }
  if (fest === 'music') {
    // Ordre imposé : plancher, ossature, projecteurs au montage ; l'inverse au démontage (on ne retire pas le plancher
    // sous une ossature debout). Il est porté par u / removeU, si bien que le tri commun suffit.
    const x = Math.round(width * (0.25 + mulberry32(seed ^ hashString('stage-music'))() * 0.5));
    const kinds: ItemKind[] = ['stage-floor', 'stage-frame', 'stage-spots'];
    out.push({
      id: 'stage-music', fest, day, equipment: 'lift', install: { dayOffset: 0, from: 540, to: 960 }, remove: { dayOffset: 1, from: 0, to: 240 },
      items: kinds.map((kind, i) => ({ id: kind, kind, x, high: kind !== 'stage-floor', u: i / 3, removeU: (2 - i) / 3 })),
    });
  }
  return out;
}

// Les jeux dont la fête tombe la veille, le jour même ou le lendemain de `date` (un décor déborde sur les jours voisins).
export function decorSetsFor(date: YMD, width: number, height: number, seed: number): DecorSet[] {
  const out: DecorSet[] = [];
  for (const k of [-1, 0, 1]) {
    const d = addDays(date, k);
    const fests = festivitiesOn(d).map((f) => f.id).filter((id, i, all) => all.indexOf(id) === i);
    for (const fest of fests) out.push(...setsForFest(fest, dayNumber(d), width, height, seed));
  }
  return out;
}

type Slot = { from: number; to: number };

// Créneau de l'élément dans la fenêtre : n créneaux consécutifs de même durée, dans l'ordre de `u` (ou `removeU`).
function slotOf(set: DecorSet, item: DecorItem, festDay: number, removing: boolean): Slot {
  const w = removing ? set.remove : set.install;
  const key = (i: DecorItem): number => (removing ? i.removeU : i.u);
  const order = [...set.items].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
  const k = order.findIndex((i) => i.id === item.id);
  const start = absMinute(festDay + w.dayOffset, w.from);
  const len = (w.to - w.from) / set.items.length;
  return { from: start + k * len, to: start + (k + 1) * len };
}

function stepAt(eq: Equipment, slot: Slot, abs: number, removing: boolean): { step: string; progress: number; index: number; from: number; to: number } {
  const weights = WEIGHTS[eq];
  const total = weights.reduce((s, x) => s + x, 0);
  const steps = stepsOf(eq, removing);
  let at = slot.from;
  for (let i = 0; i < steps.length; i++) {
    const to = i === steps.length - 1 ? slot.to : at + ((slot.to - slot.from) * weights[i]!) / total;
    if (abs < to) return { step: steps[i]!, progress: (abs - at) / (to - at), index: i, from: at, to };
    at = to;
  }
  return { step: steps[steps.length - 1]!, progress: 0, index: steps.length - 1, from: slot.to, to: slot.to };
}

export function itemPhase(set: DecorSet, item: DecorItem, abs: number, festDay: number): ItemPhase {
  const eq = itemEquipment(set, item);
  const inSlot = slotOf(set, item, festDay, false);
  if (abs < inSlot.from) return { phase: 'absent' };
  if (abs < inSlot.to) {
    const { step, progress } = stepAt(eq, inSlot, abs, false);
    return { phase: 'installing', step, progress };
  }
  const outSlot = slotOf(set, item, festDay, true);
  if (abs < outSlot.from) return { phase: 'present' };
  if (abs < outSlot.to) {
    const { step, progress } = stepAt(eq, outSlot, abs, true);
    return { phase: 'removing', step, progress };
  }
  return { phase: 'absent' };
}

// L'élément est-il dessiné ? Au montage, il n'apparaît qu'à la fin du geste (`fix` / `place`) ; au démontage, il reste
// en place pendant `unfix` / `place` et disparaît à sa fin.
export function itemShown(set: DecorSet, item: DecorItem, p: ItemPhase): boolean {
  if (p.phase === 'absent') return false;
  if (p.phase === 'present') return true;
  const eq = itemEquipment(set, item);
  const i = stepsOf(eq, p.phase === 'removing').indexOf(p.step);
  return p.phase === 'installing' ? i > GESTURE[eq] : i <= GESTURE[eq];
}

// L'équipe du jeu : occupée dans le créneau de l'élément en cours (un seul à la fois), sinon null.
export function crewAt(set: DecorSet, abs: number, festDay: number): { itemId: string; step: string; progress: number; removing: boolean } | null {
  for (const item of set.items) {
    const p = itemPhase(set, item, abs, festDay);
    if (p.phase === 'installing' || p.phase === 'removing') return { itemId: item.id, step: p.step, progress: p.progress, removing: p.phase === 'removing' };
  }
  return null;
}

// Bornes (minutes absolues) de l'étape en cours de l'équipe du jeu, sinon null : le calque en tire la durée d'un trajet
// (le camion élévateur reste hors champ une minute au début de son arrivée et à la fin de son départ).
export function crewStepWindow(set: DecorSet, abs: number, festDay: number): { from: number; to: number } | null {
  for (const item of set.items) {
    const p = itemPhase(set, item, abs, festDay);
    if (p.phase !== 'installing' && p.phase !== 'removing') continue;
    const removing = p.phase === 'removing';
    const { from, to } = stepAt(itemEquipment(set, item), slotOf(set, item, festDay, removing), abs, removing);
    return { from, to };
  }
  return null;
}

// Créneaux de l'équipe à pied (échelle, à la main) dans la fenêtre de montage ou de démontage : début du premier, fin du
// dernier (minutes absolues, jour de la fête `set.day`) ; null si le jeu n'a pas d'équipe à pied. La camionnette se gare
// avant `first` et repart après `last` (city/van.ts).
export function footWindow(set: DecorSet, removing: boolean): { first: number; last: number } | null {
  const key = (i: DecorItem): number => (removing ? i.removeU : i.u);
  const foot = [...set.items].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1)).filter((i) => itemEquipment(set, i) !== 'lift');
  if (foot.length === 0) return null;
  return { first: slotOf(set, foot[0]!, set.day, removing).from, last: slotOf(set, foot[foot.length - 1]!, set.day, removing).to };
}
