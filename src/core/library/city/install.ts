import { hashString, mulberry32 } from '../scene-world';
import { addDays, festivitiesOn, festivityStartsOn, type FestivityId, type YMD } from './calendar';
import { doorsFor } from './doors';
import { lampsFor } from './lamps';
import { DOOR_WIDTH } from './metrics';
import { dayNumber } from './shops/hours';

// Décors de fête posés et retirés par des équipes (spec §7.2). Tout est une fonction de l'heure absolue, comme
// shops/works.ts : aucun état, aucun Math.random. Un jeu de décor est traité élément par élément par une seule équipe ;
// l'élément k occupe le k-ième créneau (de même durée) de la fenêtre de montage, puis de démontage.

export type Equipment = 'ladder' | 'lift' | 'hand';
export type ItemKind = 'lamp-flag' | 'door-flag' | 'stage-floor' | 'stage-frame' | 'stage-spots' | 'barrier' | 'stand-counter' | 'stand-awning'
  | 'lamp-pumpkin' | 'lamp-bats' | 'door-web' | 'door-ghost';
// Décors de lampadaire (posés au camion élévateur, à la place du drapeau) et d'entrée (posés à l'échelle, au-dessus de la porte).
export const LAMP_KINDS: ReadonlySet<ItemKind> = new Set(['lamp-flag', 'lamp-pumpkin', 'lamp-bats']);
export const DOOR_KINDS: ReadonlySet<ItemKind> = new Set(['door-flag', 'door-web', 'door-ghost']);
// `x` : centre de l'élément ; `u` / `removeU` : ordre d'intervention au montage / au démontage (croissant).
// `lane` : barrière posée EN TRAVERS de la chaussée, dans cette file (rue privatisée de la Fête de la musique) ; absent =
// au bord du trottoir (défilé). `group` : élément d'un ensemble (stand de bière `stand-k` : comptoir et auvent).
export type DecorItem = { id: string; kind: ItemKind; x: number; high: boolean; u: number; removeU: number; lane?: 'far' | 'near'; group?: string };
export type DecorWindow = { dayOffset: number; from: number; to: number }; // minutes ; dayOffset par rapport au jour de la fête
// `day` : numéro du jour de la fête (dayNumber) — ajout au plan, pour que l'appelant sache quel `festDay` passer.
// `transport` : véhicule où le décor est ENTREPOSÉ (spec §7.2, table des transports) : il y est pris à la pose et rangé à la
// dépose, avant que le véhicule reparte. `van` : camionnette (barrières, échelles) ; `cargo-bike` : vélo porteur (drapeaux
// d'entrée, légers, et l'échelle) ; `truck` : camion plateau (scène, stands de bière) ; `lift` : plateau du camion élévateur
// lui-même (drapeaux de lampadaires) ; `door` : aucun véhicule, un habitant sort de l'immeuble avec sa petite échelle et le
// décor, et y rentre (Halloween).
export type Transport = 'van' | 'cargo-bike' | 'truck' | 'lift' | 'door';
export type DecorSet = { id: string; fest: FestivityId; day: number; equipment: Equipment; transport: Transport; install: DecorWindow; remove: DecorWindow; items: DecorItem[] };
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

// Équipement propre à un élément : le plancher de scène, les barrières et le comptoir d'un stand (sorti de la camionnette)
// se portent à la main, le reste suit le jeu.
const BY_HAND: readonly ItemKind[] = ['stage-floor', 'barrier', 'stand-counter'];
export const itemEquipment = (set: DecorSet, item: DecorItem): Equipment => (BY_HAND.includes(item.kind) ? 'hand' : set.equipment);

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
      id: lampsId, fest, day, equipment: 'lift', transport: 'lift', install: { ...EVE }, remove: { ...MORROW },
      items: lampsFor(width, seed).map((l) => ({ id: l.id, kind: 'lamp-flag', x: l.x, high: true, ...drawn(seed, lampsId, l.id) })),
    });
    const doorsId = `doors-${fest}`;
    out.push({
      id: doorsId, fest, day, equipment: 'ladder', transport: 'cargo-bike', install: { ...EVE }, remove: { ...MORROW },
      items: doorsFor(width, height, seed)
        .filter((d) => d.hallU < 0.5)
        .map((d) => ({ id: d.id, kind: 'door-flag', x: d.x + DOOR_WIDTH / 2, high: true, ...drawn(seed, doorsId, d.id) })),
    });
  }
  if (fest === 'halloween') out.push(...halloweenSets(day, width, height, seed));
  if (fest === 'bastille') {
    const id = 'barriers-bastille';
    const items: DecorItem[] = [];
    for (let k = 0, x = BARRIER_STEP / 2; x < width; k++, x += BARRIER_STEP) items.push({ id: `barrier-${k}`, kind: 'barrier', x, high: false, ...drawn(seed, id, `barrier-${k}`) });
    out.push({ id, fest, day, equipment: 'hand', transport: 'van', install: { dayOffset: 0, from: 420, to: 480 }, remove: { dayOffset: 0, from: 750, to: 810 }, items });
  }
  if (fest === 'music') {
    // Scènes : ordre imposé, plancher, ossature, projecteurs au montage ; l'inverse au démontage (on ne retire pas le
    // plancher sous une ossature debout). Il est porté par u / removeU, si bien que le tri commun suffit.
    const kinds: ItemKind[] = ['stage-floor', 'stage-frame', 'stage-spots'];
    stageXs(width, seed).forEach((x, k) => {
      out.push({
        id: `stage-music-${k}`, fest, day, equipment: 'lift', transport: 'truck', install: { dayOffset: 0, from: 540, to: 960 }, remove: { dayOffset: 1, from: 0, to: 240 },
        items: kinds.map((kind, i) => ({ id: kind, kind, x, high: kind !== 'stage-floor', u: i / 3, removeU: (2 - i) / 3 })),
      });
    });
    // Rue privatisée : deux barrières en travers de la chaussée (une par file) à chaque bout de la rue.
    const barriersId = 'barriers-music';
    const barriers: DecorItem[] = [];
    for (const [end, x] of [['west', MUSIC_BARRIER_EDGE], ['east', width - MUSIC_BARRIER_EDGE]] as const) {
      for (const lane of ['far', 'near'] as const) {
        const id = `barrier-${end}-${lane}`;
        barriers.push({ id, kind: 'barrier', x, high: false, lane, ...drawn(seed, barriersId, id) });
      }
    }
    out.push({ id: barriersId, fest, day, equipment: 'hand', transport: 'van', install: { dayOffset: 0, from: 780, to: 840 }, remove: { dayOffset: 1, from: 270, to: 300 }, items: barriers });
    // Stands de bière : stand par stand (ordre tiré), le comptoir à la main puis l'auvent à l'échelle ; au démontage,
    // l'auvent d'abord, puis le comptoir.
    const standsId = 'beer-stands-music';
    const stands = beerStandsFor(width, height, seed);
    const rank = (key: string): number[] => {
      const rng = mulberry32(seed ^ hashString(standsId + key));
      const order = stands.map((_, j) => ({ j, r: rng() })).sort((a, b) => a.r - b.r);
      const out: number[] = [];
      order.forEach(({ j }, k) => {
        out[j] = k;
      });
      return out;
    };
    const up = rank('install');
    const down = rank('remove');
    const n = stands.length * 2;
    out.push({
      id: standsId, fest, day, equipment: 'ladder', transport: 'truck', install: { dayOffset: 0, from: 720, to: 930 }, remove: { dayOffset: 1, from: 150, to: 300 },
      items: stands.flatMap((st, j): DecorItem[] => [
        { id: `${st.id}-counter`, kind: 'stand-counter', x: st.x, high: false, group: st.id, u: (2 * up[j]!) / n, removeU: (2 * down[j]! + 1) / n },
        { id: `${st.id}-awning`, kind: 'stand-awning', x: st.x, high: true, group: st.id, u: (2 * up[j]! + 1) / n, removeU: (2 * down[j]!) / n },
      ]),
    });
  }
  return out;
}

// ---------- Halloween : lampadaires (mairie) et entrées (habitants) ----------
// Lampadaires : lanterne citrouille ou guirlande de chauves-souris, posées au camion élévateur le samedi d'avant (24 octobre)
// et retirées le mardi 3 novembre, de 9 h à 17 h (spec 2026-10-20 « Halloween » §4).
export const HALLOWEEN_LAMPS = { install: { dayOffset: -7, from: 540, to: 1020 }, remove: { dayOffset: 3, from: 540, to: 1020 } } as const;
// Entrées : un habitant sur deux à trois décore la sienne (toile d'araignée ou fantôme), à l'échelle, un jour du 24 au 31
// octobre ; il la retire un jour du 1er au 8 novembre. Jours pondérés et heures de tendance comme les décors des logements
// (city/halloween.ts) ; un geste dure DOOR_GESTURE minutes (sortie, échelle, pose, retour).
const DOOR_SHARE = 0.6;
const DOOR_GESTURE = 12;
const DOOR_INSTALL: readonly (readonly [number, number])[] = [[-7, 3], [-6, 3], [-5, 1], [-4, 1], [-3, 1.2], [-2, 1], [-1, 1.4], [0, 1.6]];
const DOOR_REMOVE: readonly (readonly [number, number])[] = [[1, 2], [2, 1], [3, 1], [4, 1.2], [5, 1], [6, 1], [7, 2.2], [8, 1.2]];
const drawOffset = (list: readonly (readonly [number, number])[], r: number): number => {
  const tot = list.reduce((acc, [, w]) => acc + w, 0);
  let a = r * tot;
  for (const [o, w] of list) {
    a -= w;
    if (a < 0) return o;
  }
  return list[list.length - 1]![0];
};
// Heure de tendance d'un geste (minutes) le jour `day` (dayNumber) : en journée le week-end et le 1er novembre, le 31 avant la
// soirée, après le travail en semaine.
function doorMinute(day: number, offset: number, r: number): number {
  const wd = new Date(day * 86_400_000).getUTCDay();
  if (offset === 0) return Math.round(600 + r * 300);
  if (wd === 0 || wd === 6 || offset === 1) return Math.round(600 + r * 420);
  return Math.round(1080 + r * 120);
}
function halloweenSets(day: number, width: number, height: number, seed: number): DecorSet[] {
  const year = new Date(day * 86_400_000).getUTCFullYear();
  const base = seed ^ hashString(`halloween${year}`);
  const lampsId = 'lamps-halloween';
  const out: DecorSet[] = [{
    id: lampsId, fest: 'halloween', day, equipment: 'lift', transport: 'lift', install: { ...HALLOWEEN_LAMPS.install }, remove: { ...HALLOWEEN_LAMPS.remove },
    items: lampsFor(width, seed).map((l) => ({ id: l.id, kind: mulberry32(base ^ hashString(l.id))() < 0.55 ? 'lamp-pumpkin' : 'lamp-bats', x: l.x, high: true, ...drawn(base, lampsId, l.id) })),
  }];
  for (const d of doorsFor(width, height, seed)) {
    // Toujours les mêmes tirages par porte, dans le même ordre.
    const r = mulberry32(base ^ hashString(`door:${d.id}`));
    const rOn = r(), rKind = r(), rIn = r(), rOut = r(), rAt = r(), rRat = r();
    if (rOn >= DOOR_SHARE) continue;
    const inOff = drawOffset(DOOR_INSTALL, rIn);
    const outOff = drawOffset(DOOR_REMOVE, rOut);
    const from = doorMinute(day + inOff, inOff, rAt);
    const to = doorMinute(day + outOff, outOff, rRat);
    out.push({
      id: `halloween-${d.id}`, fest: 'halloween', day, equipment: 'ladder', transport: 'door',
      install: { dayOffset: inOff, from, to: from + DOOR_GESTURE }, remove: { dayOffset: outOff, from: to, to: to + DOOR_GESTURE },
      items: [{ id: d.id, kind: rKind < 0.6 ? 'door-web' : 'door-ghost', x: d.x + DOOR_WIDTH / 2, high: true, u: 0, removeU: 0 }],
    });
  }
  return out;
}

// ---------- Fête de la musique : scènes et stands de bière (positions) ----------
// Barrières de la rue privatisée : à cette distance (px) de chaque bord du monde.
export const MUSIC_BARRIER_EDGE = 24;
// Demi-largeur (unités) du plancher d'une scène de la Fête de la musique (STAGE.half d'install-sprites).
export const STAGE_HALF = 48;
// Un stand reste à au moins cette distance (unités) du centre d'une scène : demi-scène (48) + demi-stand (26) + marge.
export const STAND_STAGE_CLEAR = 82;
// Marge (px) entre un stand et le bord du monde.
const STAND_EDGE = 40;
// `side` : côté de la file d'attente (+1 : à droite du comptoir).
export type BeerStand = { id: string; x: number; side: 1 | -1 };

// N scènes (N = max(1, round(largeur / 700))), une par part de rue, avec un léger tirage autour du milieu de la part.
export function stageXs(width: number, seed: number): number[] {
  const n = Math.max(1, Math.round(width / 700));
  const rng = mulberry32(seed ^ hashString('stage-music'));
  return Array.from({ length: n }, (_, k) => Math.round((k + 0.5 + (rng() - 0.5) * 0.3) * (width / n)));
}

// Stands de bière : max(2, round(largeur / 240)), sur la chaussée, répartis régulièrement (léger tirage) sur la longueur de
// rue libre, c'est-à-dire hors des abords des scènes (STAND_STAGE_CLEAR) : jamais sur une scène. Triés de gauche à droite.
export function beerStandsFor(width: number, height: number, seed: number): BeerStand[] {
  const n = Math.max(2, Math.round(width / 240));
  const clear = STAND_STAGE_CLEAR * (height / 340);
  const rng = mulberry32(seed ^ hashString('beer-stands'));
  // Intervalles libres de [STAND_EDGE, width - STAND_EDGE] privés des abords des scènes.
  let free: [number, number][] = [[STAND_EDGE, width - STAND_EDGE]];
  for (const x of stageXs(width, seed)) {
    free = free.flatMap(([a, b]): [number, number][] => [[a, Math.min(b, x - clear)], [Math.max(a, x + clear), b]]).filter(([a, b]) => b > a);
  }
  const total = free.reduce((acc, [a, b]) => acc + (b - a), 0);
  // Rue trop courte pour éviter les scènes : répartition simple sur toute la rue.
  if (total <= 0) free = [[STAND_EDGE, Math.max(STAND_EDGE + 1, width - STAND_EDGE)]];
  const len = free.reduce((acc, [a, b]) => acc + (b - a), 0);
  const toX = (p: number): number => {
    let left = p;
    for (const [a, b] of free) {
      if (left <= b - a) return a + left;
      left -= b - a;
    }
    return free[free.length - 1]![1];
  };
  return Array.from({ length: n }, (_, j) => {
    const p = Math.min(len, Math.max(0, (j + 0.5 + (rng() - 0.5) * 0.4) * (len / n)));
    return { id: `stand-${j}`, x: Math.round(toX(p) * 10) / 10, side: rng() < 0.5 ? 1 : -1 };
  });
}

// Fêtes dont les décors débordent plus loin que la veille et le lendemain (Halloween : de −7 à +8 jours).
const LOOK_BACK = 8;
const LOOK_AHEAD = 7;
// Les jeux dont la fête tombe la veille, le jour même ou le lendemain de `date` (un décor déborde sur les jours voisins), et,
// plus loin, ceux dont une fenêtre de pose ou de retrait couvre ce jour (Halloween).
export function decorSetsFor(date: YMD, width: number, height: number, seed: number): DecorSet[] {
  const out: DecorSet[] = [];
  const today = dayNumber(date);
  for (let k = -LOOK_BACK; k <= LOOK_AHEAD; k++) {
    const d = addDays(date, k);
    // Une fête qui passe minuit (Fête de la musique jusqu'à 4 h 30 le 22/6) n'a ses décors qu'une fois : au jour où elle commence.
    const fests = festivitiesOn(d).map((f) => f.id).filter((id, i, all) => all.indexOf(id) === i && festivityStartsOn(d, id));
    for (const fest of fests) {
      const sets = setsForFest(fest, dayNumber(d), width, height, seed);
      out.push(...(Math.abs(k) <= 1 ? sets : sets.filter((s) => today >= s.day + s.install.dayOffset && today <= s.day + s.remove.dayOffset)));
    }
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

// Fenêtre entière (minutes absolues) de montage ou de démontage d'un jeu : le camion plateau reste garé de son début à sa fin
// (on y prend encore des pièces après le dernier créneau à pied, ou on y en range avant le premier).
export function setWindow(set: DecorSet, removing: boolean): { from: number; to: number } {
  const w = removing ? set.remove : set.install;
  return { from: absMinute(set.day + w.dayOffset, w.from), to: absMinute(set.day + w.dayOffset, w.to) };
}

// Pièce posée au camion élévateur : l'ouvrier de la nacelle la prend (dans la caisse du plateau du camion élévateur, ou à
// l'arrière du camion plateau) pendant le déploiement, entre ces deux fractions de l'étape : il y va les mains vides, la sort,
// revient. À la dépose, pendant le repli, il la rapporte, la range entre ces deux fractions, puis revient les mains vides.
export const LIFT_FETCH = { from: 0.4, to: 0.6 } as const;

// L'élément est-il entreposé dans son véhicule de transport à cet instant ? Avant son créneau de pose et après son créneau de
// dépose (le véhicule de la fenêtre l'emporte) ; au camion élévateur, aussi jusqu'à la prise (déploiement) et dès le
// rangement (repli). À la main ou à l'échelle, l'objet sort du véhicule dès le début de l'aller (calque : `tripStage`).
export function inVehicle(set: DecorSet, item: DecorItem, abs: number): boolean {
  const p = itemPhase(set, item, abs, set.day);
  if (p.phase === 'absent') return true;
  if (p.phase === 'present' || itemEquipment(set, item) !== 'lift') return false;
  if (p.phase === 'installing') return p.step === 'arrive' || (p.step === 'deploy' && p.progress < LIFT_FETCH.from);
  return p.step === 'leave' || (p.step === 'stow' && p.progress >= LIFT_FETCH.to);
}

// Entrées décorées pour Halloween (toile, fantôme) le jour `date` à la minute `minute` : ids des portes (nuit du 31 :
// porte-à-porte, city/halloween-night.ts).
export function halloweenDoorIds(date: YMD, minute: number, width: number, height: number, seed: number): Set<string> {
  const abs = absMinute(dayNumber(date), minute);
  const out = new Set<string>();
  for (const set of decorSetsFor(date, width, height, seed)) {
    if (set.fest !== 'halloween' || set.transport !== 'door') continue;
    for (const item of set.items) if (DOOR_KINDS.has(item.kind) && itemShown(set, item, itemPhase(set, item, abs, set.day))) out.add(item.id);
  }
  return out;
}
