import { hashString, mulberry32 } from '../scene-world';
import { addDays, weekdayOf, type HolidayPeriod, type YMD } from './calendar';
import type { Facade } from './facades';
import type { Dwelling, Room } from './households';
import { awayState } from './leave-plan';
import type { Schedule, Segment } from './schedules';
import { dayNumber } from './shops/hours';

// Décors d'Halloween posés par les habitants aux fenêtres et aux balcons (spec 2026-10-20 « Halloween » §2-3 ; maquette
// docs/superpowers/maquettes/halloween/src/09-halloween.js). Le plan d'une édition (qui décore, quoi, où, quel jour il pose et
// quel jour il retire) est tiré de la graine de la ville et de l'année ; l'heure exacte d'un geste est celle de sa scène dans
// l'emploi du temps du jour (schedules.ts, `decorLean` / `decorBalcony`), à défaut l'heure de tendance du plan. Aucun état.
// Les décors d'entrée (habitant à l'échelle) et de lampadaires (mairie) sont des jeux de décor d'install.ts.

export type HwStyle = 'citrouilles' | 'sorcellerie' | 'macabre';
export type HwKind = 'pumpkin' | 'witch' | 'skeleton' | 'crow' | 'spider';
// Où est l'objet : sur l'appui d'une fenêtre, sur la rambarde (balconnet ou balcon filant), sur la dalle du balcon (derrière le
// garde-corps), pendu sous la dalle.
export type HwPlace = 'sill' | 'rail' | 'slab' | 'under';
// Geste : penché à la fenêtre (`lean`), ou sorti au balcon par la porte-fenêtre du salon (`balcony`).
export type HwGesture = 'lean' | 'balcony';
// `room` : pièce de la fenêtre du geste (et de l'objet, pour l'appui) ; `dx` : place de l'objet en largeurs de fenêtre depuis le
// centre de cette fenêtre ; `m` : membre qui pose et retire ; `v` : tirage du dessin ; `off` : extinction de la nuit (minutes
// après minuit) ; `install` / `remove` : jours (dayNumber) ; `at` / `rat` : minutes de tendance de la pose et du retrait.
export type HwItem = {
  id: string; dwelling: string; facade: number; kind: HwKind; place: HwPlace; gesture: HwGesture; room: Room; dx: number; m: number;
  v: number; off: number; install: number; remove: number; at: number; rat: number;
};
export type HwPlan = { year: number; items: HwItem[]; styles: ReadonlyMap<number, HwStyle> };
// Tâche d'un jour pour l'emploi du temps d'un logement : poser (`removing` faux) ou retirer un décor, vers la minute `at`.
export type DecorTask = { item: HwItem; removing: boolean; at: number };

// Scènes de l'emploi du temps : durée (minutes) et avancement où l'objet passe des mains au décor (pose) ou l'inverse (retrait).
export const DECOR_SCENE: Readonly<Record<HwGesture, { dur: number; gesture: number }>> = {
  lean: { dur: 1.2, gesture: 0.5 },
  balcony: { dur: 2.2, gesture: 0.55 },
};
// Écart entre deux décors d'un même foyer, le même jour (minutes).
export const DECOR_GAP = 3;

// Jours de pose (24 → 31 octobre) et de retrait (1er → 8 novembre), pondérés : les week-ends et la veille comptent plus.
const INSTALL_DAYS: readonly (readonly [number, number])[] = [[24, 3], [25, 3], [26, 1], [27, 1], [28, 1.2], [29, 1], [30, 1.4], [31, 1.6]];
const REMOVE_DAYS: readonly (readonly [number, number])[] = [[1, 2], [2, 1], [3, 1], [4, 1.2], [5, 1], [6, 1], [7, 2.2], [8, 1.2]];
// Un foyer parti glisse sa pose au premier jour de présence jusqu'au 31 ; son retrait au premier jour de présence, au plus
// tard le 15 novembre (au-delà, le décor est retiré ce jour-là sans geste : le logement est vide).
const REMOVE_LAST = 15;
// Bornes de la période où un plan existe (jour avant la première pose, lendemain du dernier retrait possible).
const FIRST = { m: 10, d: 23 } as const;
const LAST = { m: 11, d: REMOVE_LAST + 1 } as const;

// Part des foyers qui mettent une citrouille (≈ une fenêtre sur huit au total) et un décor au balcon filant.
const PUMPKIN: Readonly<Record<Dwelling['hh']['type'], number>> = { famille: 0.4, coloc: 0.25, couple: 0.2, etudiant: 0.14, solo: 0.14, retraite: 0.1 };
const BALCONY: Readonly<Record<Dwelling['hh']['type'], number>> = { famille: 0.5, coloc: 0.45, couple: 0.3, etudiant: 0.2, solo: 0.2, retraite: 0.15 };
// Style dominant de la façade : multiplicateur des citrouilles et poids des décors de balcon (un style et des accents).
const STYLES: Readonly<Record<HwStyle, { pumpkin: number; balcony: Readonly<Partial<Record<HwKind, number>>> }>> = {
  citrouilles: { pumpkin: 1.4, balcony: { pumpkin: 4, crow: 2, witch: 1, skeleton: 1, spider: 1 } },
  sorcellerie: { pumpkin: 0.85, balcony: { witch: 4, crow: 3, spider: 1, skeleton: 1 } },
  macabre: { pumpkin: 0.85, balcony: { skeleton: 4, spider: 3, crow: 1, witch: 1 } },
};
const STYLE_IDS: readonly HwStyle[] = ['citrouilles', 'sorcellerie', 'macabre'];
// Places sur le balcon filant, en largeurs de la porte-fenêtre du salon depuis son centre (celles des occupants du balcon,
// window-choreo.ts) : la citrouille de la rambarde et le décor du balcon n'ont jamais la même.
const BALCONY_DX: readonly number[] = [0.3, 0.85, -0.25];

const pickW = <K extends string>(weights: Readonly<Partial<Record<K, number>>>, r: number): K => {
  const e = Object.entries(weights) as [K, number][];
  const tot = e.reduce((s, [, w]) => s + w, 0);
  let a = r * tot;
  for (const [k, w] of e) {
    a -= w;
    if (a < 0) return k;
  }
  return e[e.length - 1]![0];
};

// Édition dont la date fait partie (du 23 octobre au 16 novembre), sinon null.
export function halloweenYear(date: YMD): number | null {
  const md = date.m * 100 + date.d;
  return md >= FIRST.m * 100 + FIRST.d && md <= LAST.m * 100 + LAST.d ? date.y : null;
}

// Présence du foyer un jour donné : pas parti en vacances ce jour-là (le jour du départ et celui du retour comptent comme
// présents), comme dans `dayDraw` (vacances d'après `periods`).
function presentOn(d: Dwelling, date: YMD, seed: number, periods: readonly HolidayPeriod[]): boolean {
  return awayState(d, seed, date, periods).state !== 'away';
}

// Minute de tendance d'un geste : en journée le week-end et le 1er novembre (férié), après le travail en semaine, le 31 avant la
// soirée.
function tendency(date: YMD, r: number): number {
  const wd = weekdayOf(date);
  if (date.m === 10 && date.d === 31) return Math.round(600 + r * 300);
  if (wd === 0 || wd === 6 || (date.m === 11 && date.d === 1)) return Math.round(600 + r * 420);
  return Math.round(1080 + r * 132);
}

function drawDay(list: readonly (readonly [number, number])[], r: number): number {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  let a = r * tot;
  for (const [d, w] of list) {
    a -= w;
    if (a < 0) return d;
  }
  return list[list.length - 1]![0];
}

type Win = { room: Room; kind: string; balconnet: boolean };
// Fenêtres d'un logement (une par pièce) : sorte de fenêtre et balconnet de l'étage.
function windowsOf(d: Dwelling, f: Facade | undefined): Win[] {
  if (!f) return [];
  const out: Win[] = [];
  for (const win of f.lamps) {
    if (win.home !== d.home || win.kind === 'stair') continue;
    const room = d.roomOfWindow.get(win.bay);
    if (!room) continue;
    const level = win.level >= 0 ? f.layout?.levels[win.level] : undefined;
    out.push({ room, kind: win.kind, balconnet: level?.balcony === 'balconnet' && (win.kind === 'std' || win.kind === 'top') });
  }
  return out;
}

// Plan de l'édition `year` : un tirage par façade (style), puis par logement (citrouille, décor de balcon, jours, heures).
// `periods` : vacances scolaires connues (absences) ; vides, seule l'absence ordinaire compte.
export function halloweenPlan(dwellings: readonly Dwelling[], facades: readonly Facade[], seed: number, year: number, periods: readonly HolidayPeriod[] = []): HwPlan {
  const base = seed ^ hashString(`halloween${year}`);
  const styles = new Map<number, HwStyle>();
  const styleOf = (fi: number): HwStyle => {
    let s = styles.get(fi);
    if (!s) styles.set(fi, (s = STYLE_IDS[Math.floor(mulberry32(base ^ hashString(`style:${fi}`))() * STYLE_IDS.length)]!));
    return s;
  };
  const items: HwItem[] = [];
  for (const d of dwellings) {
    const f = facades[d.facade];
    const style = STYLES[styleOf(d.facade)];
    // Toujours les mêmes tirages, dans le même ordre, quel que soit le logement.
    const rng = mulberry32(base ^ d.key ^ hashString('dwelling'));
    const rPump = rng(), rBal = rng(), rKind = rng(), rWin = rng(), rDay = rng(), rRem = rng(), rAt = rng(), rRat = rng();
    const v1 = rng(), v2 = rng(), off1 = rng(), off2 = rng(), rSlot = rng();
    const m = Math.max(0, d.hh.members.findIndex((x) => !x.kid));
    const wins = windowsOf(d, f);
    const filant = d.balcony && !d.balconnet && wins.some((w) => w.room === 'salon' && w.kind === 'french');
    // Jours : tirés, puis glissés au premier jour de présence.
    const at = { y: year, m: 10, d: drawDay(INSTALL_DAYS, rDay) };
    let install: YMD | null = at;
    while (install && !presentOn(d, install, seed, periods)) install = install.d < 31 ? addDays(install, 1) : null;
    if (!install) continue;
    let remove: YMD = { y: year, m: 11, d: drawDay(REMOVE_DAYS, rRem) };
    while (remove.d < REMOVE_LAST && !presentOn(d, remove, seed, periods)) remove = addDays(remove, 1);
    const days = { install: dayNumber(install), remove: dayNumber(remove), at: tendency(install, rAt), rat: tendency(remove, rRat) };
    const own: HwItem[] = [];
    const slots = [...BALCONY_DX];
    const takeSlot = (r: number): number => slots.splice(Math.floor(r * slots.length), 1)[0]!;
    // Citrouille : sur l'appui d'une fenêtre ordinaire (ou la rambarde de son balconnet), sinon sur la rambarde du balcon filant.
    if (rPump < PUMPKIN[d.hh.type] * style.pumpkin) {
      const lean = wins.filter((w) => w.kind === 'std' || w.kind === 'top');
      const w = lean[Math.floor(rWin * lean.length)];
      if (w) own.push({ id: `${d.id}:pumpkin`, dwelling: d.id, facade: d.facade, kind: 'pumpkin', place: w.balconnet ? 'rail' : 'sill', gesture: 'lean', room: w.room, dx: w.balconnet ? -0.15 : 0.22, m, v: v1, off: off1, ...days });
      else if (filant) own.push({ id: `${d.id}:pumpkin`, dwelling: d.id, facade: d.facade, kind: 'pumpkin', place: 'rail', gesture: 'balcony', room: 'salon', dx: takeSlot(rSlot), m, v: v1, off: off1, ...days });
    }
    // Décor du balcon filant, sorti par la porte-fenêtre du salon.
    if (filant && rBal < BALCONY[d.hh.type]) {
      const kind = pickW(style.balcony, rKind);
      const place: HwPlace = kind === 'witch' ? 'slab' : kind === 'spider' ? 'under' : 'rail';
      own.push({ id: `${d.id}:${kind === 'pumpkin' ? 'pumpkin-2' : kind}`, dwelling: d.id, facade: d.facade, kind, place, gesture: 'balcony', room: 'salon', dx: takeSlot(1 - rSlot), m, v: v2, off: off2, ...days });
    }
    // Un geste après l'autre, le même jour.
    own.forEach((it, i) => {
      it.at += i * DECOR_GAP;
      it.rat += i * DECOR_GAP;
    });
    items.push(...own);
  }
  return { year, items, styles };
}

// Plan de la date, ou null hors de la période.
export function halloweenPlanFor(date: YMD, dwellings: readonly Dwelling[], facades: readonly Facade[], seed: number, periods: readonly HolidayPeriod[] = []): HwPlan | null {
  const year = halloweenYear(date);
  return year === null ? null : halloweenPlan(dwellings, facades, seed, year, periods);
}

// Tâches du jour d'un logement : poses et retraits prévus ce jour-là.
export function decorTasks(plan: HwPlan | null, dwelling: string, date: YMD): DecorTask[] {
  if (!plan) return [];
  const day = dayNumber(date);
  const out: DecorTask[] = [];
  for (const item of plan.items) {
    if (item.dwelling !== dwelling) continue;
    if (item.install === day) out.push({ item, removing: false, at: item.at });
    if (item.remove === day) out.push({ item, removing: true, at: item.rat });
  }
  return out;
}

type Act = Extract<Segment, { k: 'act' }>;
// Minute du jour où l'objet change d'état (passe des mains au décor, ou l'inverse) : sur la scène du geste dans l'emploi du temps
// du jour, à défaut (personne n'a pu le faire : foyer parti, membres occupés) l'heure de tendance, sans geste.
export function decorSwitch(item: HwItem, removing: boolean, schedule: Pick<Schedule, 'segments'> | null): number {
  const s = schedule?.segments.find((g): g is Act => g.k === 'act' && g.decor?.id === item.id && !!g.reverse === removing);
  if (!s) return removing ? item.rat : item.at;
  return s.t0 + DECOR_SCENE[item.gesture].gesture * (s.t1 - s.t0);
}

// Le décor est-il en place le jour `day` (dayNumber) à la minute `minute` ? `today` : emploi du temps du jour du logement.
export function decorShown(item: HwItem, day: number, minute: number, today: Pick<Schedule, 'segments'> | null): boolean {
  if (day < item.install || day > item.remove) return false;
  if (day === item.install && minute < decorSwitch(item, false, today)) return false;
  if (day === item.remove && minute >= decorSwitch(item, true, today)) return false;
  return true;
}

// Lumière de fête (citrouille, yeux de l'araignée) : la nuit (`dark`), jusqu'à son extinction tirée entre 0 h 20 et 1 h 30
// (plus tard que les pièces), des nuits de la pose jusqu'à celle du 31 au 1er novembre ; après, ce qui reste n'est plus allumé.
export const lightOff = (item: Pick<HwItem, 'off'>): number => Math.round(20 + item.off * 70);
export function decorLit(item: HwItem, day: number, minute: number, dark: boolean, today: Pick<Schedule, 'segments'> | null): boolean {
  if (!dark || (item.kind !== 'pumpkin' && item.kind !== 'spider')) return false;
  if (!decorShown(item, day, minute, today)) return false;
  const last = dayNumber({ y: new Date(item.install * 86_400_000).getUTCFullYear(), m: 10, d: 31 });
  return minute >= 720 ? day <= last : minute < lightOff(item) && day - 1 <= last;
}
