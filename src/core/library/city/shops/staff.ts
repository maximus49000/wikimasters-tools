import { addDays, isoDate, type YMD } from '../calendar';
import { hashString, mulberry32 } from '../../scene-world';
import type { ShopDef } from './catalog';
import { isOpenAt, rangesOf } from './hours';

// Personnel d'un local : un plan du jour (qui est dans le local entre quelles minutes), puis l'état de chacun à la minute.
// Fonctions pures de (graine, local, jour, minute) : rien n'est mémorisé.
// Toutes les durées sont en minutes depuis minuit ; une plage qui passe minuit donne des heures > 1440.
export type StaffRole = 'opener' | 'closer' | 'floor';
export type StaffShift = {
  id: string;
  role: StaffRole;
  outfitKey: string;
  // Minute où la personne franchit la porte pour entrer / pour ressortir (elle marche WALK_MIN avant l'entrée et après la sortie).
  arriveAt: number;
  leaveAt: number;
  // Pauses (début, fin) : la personne reste dans l'arrière-boutique ; jamais sans quelqu'un d'autre dans le local.
  breaks: [number, number][];
  // Écart au brief : minute où cette personne lève / baisse le rideau (ouvreur, fermeur) ; absent sinon.
  shutterUp?: number;
  shutterDown?: number;
};

// Trajet à pied du bord de la scène à la porte (ou retour), comme les clients : 3 min de jeu.
export const WALK_MIN = 3;
// Durée du geste du rideau (5 s ≈ 0,1 min).
export const SHUTTER_MIN = 0.1;
// Le fermeur quitte le local 15 min après l'heure de fermeture ; les autres entre 5 et 14 min après.
const CLOSER_LEAVE = 15;
const RELAY_MIN_SPAN = 9 * 60;

// Une plage de plus de 9 h est tenue par deux équipes qui se croisent. (Calculé, jamais stocké dans ShopDef.)
export const isRelay = (def: ShopDef): boolean => [def.hours, def.sundayHours ?? []].some((ranges) => ranges.some(([a, b]) => b - a > RELAY_MIN_SPAN));

const rangeIsRelay = ([a, b]: readonly [number, number]): boolean => b - a > RELAY_MIN_SPAN;

const between = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

type Member = { arrive: number; leave: number; role: StaffRole; up?: number; down?: number };

// Équipe d'une plage (ou d'une moitié de plage en relais) : l'ancre (premier membre) ne prend jamais de pause,
// elle couvre donc toutes les pauses des autres.
function buildTeam(rng: () => number, def: ShopDef, from: number, to: number, opts: { first: boolean; last: boolean; arrive: (k: number) => number; leave: (k: number) => number }): Member[] {
  const n = between(rng, def.staff.min, def.staff.max);
  return Array.from({ length: n }, (_, k) => {
    const isFirst = k === 0 && opts.first;
    const isLast = k === n - 1 && opts.last;
    const role: StaffRole = isFirst ? 'opener' : isLast ? 'closer' : 'floor';
    return {
      arrive: opts.arrive(k),
      leave: isLast ? to + CLOSER_LEAVE : opts.leave(k),
      role,
      ...(isFirst ? { up: from } : {}),
      ...(isLast ? { down: to } : {}),
    };
  });
}

function breaksOf(rng: () => number, team: Member[], k: number): [number, number][] {
  if (k === 0 || team.length < 2) return [];
  const m = team[k]!;
  const anchor = team[0]!;
  const length = between(rng, 10, 20);
  const lo = Math.max(m.arrive, anchor.arrive) + WALK_MIN + 60;
  const hi = Math.min(m.leave, anchor.leave, m.down ?? Infinity) - 40 - length;
  const wanted = rng() < 0.85;
  if (!wanted || hi <= lo) return [];
  const start = lo + Math.floor(rng() * (hi - lo));
  return [[start, start + length]];
}

// Plan du jour : uniquement les postes des plages qui COMMENCENT ce jour-là (une plage qui passe minuit garde ses heures > 1440 ;
// le lendemain, staffShiftsAt les rapporte). Vide si le commerce est fermé ce jour-là, férié compris.
export function staffPlan(def: ShopDef, seed: number, slotId: string, date: YMD): StaffShift[] {
  const ranges = rangesOf(def, date);
  const iso = isoDate(date);
  const rng = mulberry32(seed ^ hashString(`staff|${slotId}|${iso}`));
  const out: StaffShift[] = [];
  ranges.forEach(([a, b], r) => {
    const earliness = between(rng, 20, 30);
    const wait = Math.round((earliness * 2) / 3); // 2/3 du temps d'avance passé à l'intérieur
    const teams: Member[][] = [];
    if (rangeIsRelay([a, b])) {
      const mid = Math.round((a + b) / 2);
      const overlap = between(rng, 3, 8); // chaque équipe déborde de `overlap` min de part et d'autre : croisement ≥ 6 min
      teams.push(buildTeam(rng, def, a, b, {
        first: true, last: false,
        arrive: (k) => (k === 0 ? a - wait : a - between(rng, 1, 8)),
        leave: () => mid + overlap + between(rng, 0, 2),
      }));
      teams.push(buildTeam(rng, def, a, b, {
        first: false, last: true,
        arrive: () => mid - overlap - between(rng, 0, 2),
        leave: () => b + between(rng, 5, CLOSER_LEAVE - 1),
      }));
    } else {
      teams.push(buildTeam(rng, def, a, b, {
        first: true, last: true,
        arrive: (k) => (k === 0 ? a - wait : a - between(rng, 1, 8)),
        leave: () => b + between(rng, 5, CLOSER_LEAVE - 1),
      }));
    }
    // Un membre seul est à la fois ouvreur et fermeur (en relais : ouvreur pour la 1re équipe, fermeur pour la 2de).
    teams.forEach((team, t) => {
      team.forEach((m, k) => {
        const id = `${slotId}-${iso}-r${r}-t${t}-m${k}`;
        out.push({
          id,
          role: m.role,
          outfitKey: `${slotId}:${iso}:${t}.${k}`,
          arriveAt: m.arrive,
          leaveAt: m.leave,
          breaks: breaksOf(rng, team, k),
          ...(m.up !== undefined ? { shutterUp: m.up } : {}),
          ...(m.down !== undefined ? { shutterDown: m.down } : {}),
        });
      });
    });
  });
  return out;
}

// Postes à considérer pour les minutes de `date` : ceux du jour, plus ceux de la veille qui passent minuit
// (heures ramenées à ce jour, soustraction de 1440) tant qu'ils ne sont pas repartis.
export function staffShiftsAt(def: ShopDef, seed: number, slotId: string, date: YMD): StaffShift[] {
  const carried = staffPlan(def, seed, slotId, addDays(date, -1))
    .filter((s) => s.leaveAt + WALK_MIN > 1440)
    .map((s): StaffShift => ({
      ...s,
      arriveAt: s.arriveAt - 1440,
      leaveAt: s.leaveAt - 1440,
      breaks: s.breaks.map(([x, y]): [number, number] => [x - 1440, y - 1440]),
      ...(s.shutterUp !== undefined ? { shutterUp: s.shutterUp - 1440 } : {}),
      ...(s.shutterDown !== undefined ? { shutterDown: s.shutterDown - 1440 } : {}),
    }));
  return [...carried, ...staffPlan(def, seed, slotId, date)];
}

export type StaffState = {
  id: string;
  where: 'absent' | 'walking-in' | 'opening' | 'inside' | 'closing' | 'walking-out';
  side: 1 | -1;
  progress: number;
  onBreak: boolean;
};

// Côté d'où la personne arrive et où elle repart (tiré du bord, stable pour un poste).
const sideOf = (id: string): 1 | -1 => (hashString(`side|${id}`) % 2 === 0 ? 1 : -1);

export function staffAt(shifts: StaffShift[], minutes: number): StaffState[] {
  return shifts.map((s) => {
    const side = sideOf(s.id);
    const state = (where: StaffState['where'], progress = 0, onBreak = false): StaffState => ({ id: s.id, where, side, progress, onBreak });
    if (minutes >= s.arriveAt - WALK_MIN && minutes < s.arriveAt) return state('walking-in', (minutes - (s.arriveAt - WALK_MIN)) / WALK_MIN);
    if (minutes >= s.leaveAt && minutes < s.leaveAt + WALK_MIN) return state('walking-out', (minutes - s.leaveAt) / WALK_MIN);
    if (minutes < s.arriveAt || minutes >= s.leaveAt) return state('absent');
    if (s.shutterUp !== undefined && minutes >= s.shutterUp && minutes < s.shutterUp + SHUTTER_MIN) return state('opening', (minutes - s.shutterUp) / SHUTTER_MIN);
    if (s.shutterDown !== undefined && minutes >= s.shutterDown && minutes < s.shutterDown + SHUTTER_MIN) return state('closing', (minutes - s.shutterDown) / SHUTTER_MIN);
    const onBreak = s.breaks.some(([a, b]) => minutes >= a && minutes < b);
    return state('inside', 0, onBreak);
  });
}

// Rideau : se lève/tombe pendant le geste de l'ouvreur/du fermeur ; levé seulement si le local est ouvert ET que quelqu'un est dedans.
export function shutterAt(shifts: StaffShift[], def: ShopDef, date: YMD, minutes: number): 'up' | 'down' | 'rising' | 'falling' {
  const states = staffAt(shifts, minutes);
  if (states.some((s) => s.where === 'opening')) return 'rising';
  if (states.some((s) => s.where === 'closing')) return 'falling';
  if (isOpenAt(def, date, Math.floor(minutes)) && states.some((s) => s.where === 'inside' && !s.onBreak)) return 'up';
  return 'down';
}
