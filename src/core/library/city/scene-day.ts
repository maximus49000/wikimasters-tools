import { hashString, mulberry32 } from '../scene-world';
import { addDays, type DayContext, type DayKind, type FestivityId, type YMD } from './calendar';
import { fireworksShow, type FireworksShow } from './fireworks-show';
import type { Dwelling, Room } from './households';

// Jour de scène et tirage du jour de chaque logement (spec 2026-10-19 « vie au-dessus de la rue » §5.1 : « aléatoire et
// imprévisible, mais logique »). Le contexte du jour (soleil, pluie, saison, vacances, fêtes, feux) ne dépend que de la date,
// de la météo et de la graine ; le tirage d'un logement ne dépend que de (logement, date, graine) : aucune heure, aucun état.
// L'absence (vacances, week-end ailleurs) est tirée une fois par semaine ISO : un foyer parti l'est du lundi au dimanche.
// Les horaires types de notes.md §Emploi du temps deviennent des tendances autour desquelles on tire les décalages ci-dessous.

export type SceneDay = {
  iso: string; weekday: number; weekend: boolean; kind: DayKind; schoolHoliday: boolean; month: number;
  sunrise: number; sunset: number; // minutes, lever et coucher de Paris du mois
  wet: boolean; cold: boolean; december: boolean; fests: FestivityId[]; show: FireworksShow | null;
  moving: boolean; // déménagement de commerce ce jour-là (8 h-10 h), renseigné par l'appelant
  // Semaine de vacances scolaires (week-end compris), renseignée par l'appelant d'après le mercredi de la semaine ;
  // à défaut, `schoolHoliday`.
  holidayWeek: boolean;
  week: number; // semaine ISO, année × 100 + numéro (graine de l'absence)
  weekMonth: number; // mois du jeudi de la semaine ISO (juillet-août : plus d'absences)
};

// Lever / coucher de Paris le 15 de chaque mois, en heures (SUNS de docs/superpowers/maquettes/vie-etages/src/03-temps.js).
const SUNS: readonly (readonly [number, number])[] = [
  [8.7, 17.3], [8.1, 18.2], [7.2, 19.0], [7.1, 20.7], [6.3, 21.4], [5.8, 21.9], [6.1, 21.8], [6.8, 21.1], [7.5, 20.1], [8.2, 19.0], [8.0, 17.3], [8.6, 16.9],
];
const WET_PRECIP = 0.3;
const COLD_MONTHS = new Set([11, 12, 1, 2, 3]);

// Jeudi de la semaine ISO (lundi-dimanche) : il donne l'année et le numéro de la semaine.
function isoWeek(date: YMD, weekday: number): { week: number; thursday: YMD } {
  const thursday = addDays(date, 3 - ((weekday + 6) % 7));
  const dayOfYear = (Date.UTC(thursday.y, thursday.m - 1, thursday.d) - Date.UTC(thursday.y, 0, 1)) / 86400000;
  return { week: thursday.y * 100 + Math.floor(dayOfYear / 7) + 1, thursday };
}

export function sceneDay(day: DayContext, weather: { precip: number; snow: boolean; storm: boolean }, seed: number, moving = false, holidayWeek?: boolean): SceneDay {
  const month = day.date.m;
  const { week, thursday } = isoWeek(day.date, day.weekday);
  const [sr, ss] = SUNS[month - 1]!;
  const fests = day.festivities.map((f) => f.id).filter((id, i, all) => all.indexOf(id) === i);
  return {
    iso: day.iso,
    weekday: day.weekday,
    weekend: day.weekday === 0 || day.weekday === 6,
    kind: day.kind,
    schoolHoliday: day.kind === 'holiday',
    month,
    sunrise: Math.round(sr * 60),
    sunset: Math.round(ss * 60),
    wet: weather.precip >= WET_PRECIP || weather.storm,
    cold: COLD_MONTHS.has(month),
    december: month === 12,
    fests,
    show: fireworksShow(seed, day.date),
    moving,
    holidayWeek: holidayWeek ?? day.kind === 'holiday',
    week,
    weekMonth: thursday.m,
  };
}

// normal ; away : parti (vacances, week-end ailleurs), logement éteint ; sick : malade, reste à la maison (pas de départ) ;
// guests : 1-2 invités au dîner, extinction plus tardive ; late : rentré tard du travail.
export type Presence = 'normal' | 'away' | 'sick' | 'guests' | 'late';
// water : arroser (retraité) ; rug : battre le tapis (retraité) ; look : regarder la rue (fenêtre ou balcon) ; smoke : cigarette
// au balcon ou à la fenêtre (fumeur) ; party : fête de la coloc (samedi) ; tv sinon read : soirée télé, ou lecture à la lampe
// chaude au salon ; kidWindow : enfant à la fenêtre (famille).
export type OptionalScene = 'water' | 'rug' | 'look' | 'smoke' | 'party' | 'tv' | 'read' | 'kidWindow';
// Décalages en minutes autour des horaires types : wake (lever), back (retour), evening (dîner, télé), bed (coucher).
// offOrder : ordre des extinctions des pièces ; rng : graine entière pour les tirages en aval (emplois du temps).
export type DayDraw = { presence: Presence; wake: number; back: number; evening: number; bed: number; optional: Record<OptionalScene, boolean>; offOrder: Room[]; rng: number };

// Probabilités de présence : away (par semaine), puis par jour sick, guests, late.
const AWAY = { base: 0.03, holidayFamily: 0.3, holidayOther: 0.12, summer: 1.5 } as const;
const SICK = 0.03;
const GUESTS = { friSat: 0.15, other: 0.06, extra: [45, 90] } as const;
const LATE = { p: 0.12, extra: [60, 150] } as const;
// Amplitudes (± minutes, uniformes).
// Lever : ±50 le week-end et les jours fériés.
const SPREAD = { wakeWeek: 25, wakeWeekend: 50, back: 45, evening: 40, bed: 35 } as const;
const OPTIONAL = { water: 0.7, rug: 0.35, look: 0.55, smoke: 0.85, party: 0.65, tv: 0.75, kidWindow: 0.6 } as const;

const spread = (r: number, amp: number): number => (2 * r - 1) * amp;
const between = (r: number, [a, b]: readonly [number, number]): number => a + r * (b - a);

export function dayDraw(d: Dwelling, day: SceneDay, seed: number): DayDraw {
  const rng = mulberry32(seed ^ hashString(day.iso) ^ d.key ^ hashString('day'));
  const { type, smoker } = d.hh;
  // Tous les nombres sont tirés dans le même ordre quoi qu'il arrive : la pluie ou le jour de la semaine ne font que masquer
  // une scène, sans décaler les autres tirages du logement. Le premier tirage (ancienne absence du jour) est gardé pour ne
  // pas décaler les suivants ; l'absence vient du tirage de la semaine.
  rng();
  const rAway = mulberry32(seed ^ hashString('away') ^ d.key ^ day.week)();
  const rSick = rng(), rGuests = rng(), rLate = rng(), rLateExtra = rng(), rGuestsExtra = rng();
  const rWake = rng(), rBack = rng(), rEvening = rng(), rBed = rng();
  const rWater = rng(), rRug = rng(), rLook = rng(), rSmoke = rng(), rParty = rng(), rTv = rng(), rKid = rng();

  let pAway = day.holidayWeek ? (type === 'famille' ? AWAY.holidayFamily : AWAY.holidayOther) : AWAY.base;
  if (day.weekMonth === 7 || day.weekMonth === 8) pAway *= AWAY.summer;
  const workday = !day.weekend && day.kind !== 'public-holiday';
  const pGuests = day.weekday === 5 || day.weekday === 6 ? GUESTS.friSat : GUESTS.other;
  const presence: Presence =
    rAway < pAway ? 'away' : rSick < SICK ? 'sick' : rGuests < pGuests ? 'guests' : workday && rLate < LATE.p ? 'late' : 'normal';

  const wake = spread(rWake, !workday ? SPREAD.wakeWeekend : SPREAD.wakeWeek);
  const back = spread(rBack, SPREAD.back) + (presence === 'late' ? between(rLateExtra, LATE.extra) : 0);
  const evening = spread(rEvening, SPREAD.evening);
  const bed = spread(rBed, SPREAD.bed) + (presence === 'guests' ? between(rGuestsExtra, GUESTS.extra) : 0);

  const retired = type === 'retraite';
  const tv = rTv < OPTIONAL.tv;
  const optional: Record<OptionalScene, boolean> = {
    water: retired && !day.wet && rWater < OPTIONAL.water,
    rug: retired && !day.wet && rRug < OPTIONAL.rug,
    look: !(day.wet && d.balcony) && rLook < OPTIONAL.look,
    smoke: smoker && rSmoke < OPTIONAL.smoke,
    party: type === 'coloc' && day.weekday === 6 && rParty < OPTIONAL.party,
    tv,
    read: !tv,
    kidWindow: type === 'famille' && rKid < OPTIONAL.kidWindow,
  };

  // Ordre des extinctions : permutation (Fisher-Yates) des pièces distinctes du logement.
  const offOrder = d.rooms.filter((r, i, all) => all.indexOf(r) === i);
  for (let i = offOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [offOrder[i], offOrder[j]] = [offOrder[j]!, offOrder[i]!];
  }
  return { presence, wake, back, evening, bed, optional, offOrder, rng: Math.floor(rng() * 4294967296) };
}
