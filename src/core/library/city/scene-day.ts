import { hashString, mulberry32 } from '../scene-world';
import type { SunTimes } from '../sky';
import { addDays, type DayContext, type DayKind, type FestivityId, type YMD } from './calendar';
import { fireworksShow, type FireworksShow } from './fireworks-show';
import type { Dwelling, Room } from './households';

// Jour de scène et tirage du jour de chaque logement (spec 2026-10-19 « vie au-dessus de la rue » §5.1 : « aléatoire et
// imprévisible, mais logique »). Le contexte du jour (soleil, pluie, saison, vacances, fêtes, feux) ne dépend que de la date,
// de la météo et de la graine ; le tirage d'un logement ne dépend que de (logement, date, graine) : aucune heure, aucun état.
// L'absence (départ en vacances) et les horaires viennent des journées de chaque habitant (person-day.ts) ; le tirage du
// jour ne donne plus que les invités du dîner, les scènes facultatives et l'ordre des extinctions.

export type SceneDay = {
  iso: string; weekday: number; weekend: boolean; kind: DayKind; schoolHoliday: boolean; month: number;
  sunrise: number; sunset: number; // minutes locales, lever et coucher du lieu de la scène (`sunOf`)
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
// Aux pôles, lever et coucher fictifs (minutes locales) qui gardent les règles logiques : nuit polaire, une courte journée
// sombre de 10 h à 14 h (les volets se ferment tôt ; les lumières suivent l'emploi du temps et le ciel) ; jour polaire, coucher à minuit, après celui du foyer (les volets se
// ferment à son coucher habituel, voir le retraité de `buildSchedule`) et lever à 4 h.
const POLAR_NIGHT = { sunrise: 600, sunset: 840 } as const;
const POLAR_DAY = { sunrise: 240, sunset: 1440 } as const;

// Lever et coucher du jour de scène : ceux du lieu (`SceneTime.times`, calculés pour sa position et le décalage réel de son
// fuseau), à défaut la table de Paris du mois (aucun lieu connu, aperçus).
function sunOf(month: number, sun: SunTimes | undefined): { sunrise: number; sunset: number } {
  if (sun?.kind === 'normal') return { sunrise: Math.round(sun.sunrise), sunset: Math.round(sun.sunset) };
  if (sun?.kind === 'polar') return sun.polar === 'night' ? POLAR_NIGHT : POLAR_DAY;
  const [sr, ss] = SUNS[month - 1]!;
  return { sunrise: Math.round(sr * 60), sunset: Math.round(ss * 60) };
}
const WET_PRECIP = 0.3;
const COLD_MONTHS = new Set([11, 12, 1, 2, 3]);

// Jeudi de la semaine ISO (lundi-dimanche) : il donne l'année et le numéro de la semaine.
export function isoWeek(date: YMD, weekday: number): { week: number; thursday: YMD } {
  const thursday = addDays(date, 3 - ((weekday + 6) % 7));
  const dayOfYear = (Date.UTC(thursday.y, thursday.m - 1, thursday.d) - Date.UTC(thursday.y, 0, 1)) / 86400000;
  return { week: thursday.y * 100 + Math.floor(dayOfYear / 7) + 1, thursday };
}

export function sceneDay(day: DayContext, weather: { precip: number; snow: boolean; storm: boolean }, seed: number, moving = false, holidayWeek?: boolean, sun?: SunTimes): SceneDay {
  const month = day.date.m;
  const { week, thursday } = isoWeek(day.date, day.weekday);
  const { sunrise, sunset } = sunOf(month, sun);
  const fests = day.festivities.map((f) => f.id).filter((id, i, all) => all.indexOf(id) === i);
  return {
    iso: day.iso,
    weekday: day.weekday,
    weekend: day.weekday === 0 || day.weekday === 6,
    kind: day.kind,
    schoolHoliday: day.kind === 'holiday',
    month,
    sunrise,
    sunset,
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

// water : arroser (retraité) ; rug : battre le tapis (retraité) ; look : regarder la rue (fenêtre ou balcon) ; smoke : cigarette
// au balcon ou à la fenêtre (fumeur) ; party : fête de la coloc (samedi) ; tv sinon read : soirée télé, ou lecture à la lampe
// chaude au salon ; kidWindow : enfant à la fenêtre (famille).
export type OptionalScene = 'water' | 'rug' | 'look' | 'smoke' | 'party' | 'tv' | 'read' | 'kidWindow';
// guests : invités au dîner ce soir (visitors.ts, `dayVisits`, en reçoit 1 ou 2) ; optional : scènes facultatives accordées,
// posées dans le temps libre de qui est concerné (schedules.ts) ; offOrder : ordre des extinctions des pièces au coucher ;
// rng : graine entière des petits tirages des emplois du temps. Les horaires (lever, sorties, coucher) ne viennent plus de
// ce tirage mais des journées de chaque habitant (person-day.ts).
export type DayDraw = { guests: boolean; optional: Record<OptionalScene, boolean>; offOrder: Room[]; rng: number };

// Probabilité d'un dîner avec invités : vendredi et samedi, autres jours.
const GUESTS = { friSat: 0.15, other: 0.06 } as const;
const OPTIONAL = { water: 0.7, rug: 0.35, look: 0.55, smoke: 0.85, party: 0.65, tv: 0.75, kidWindow: 0.6 } as const;

export function dayDraw(d: Dwelling, day: SceneDay, seed: number): DayDraw {
  const rng = mulberry32(seed ^ hashString(day.iso) ^ d.key ^ hashString('day'));
  const { type, smoker } = d.hh;
  // Tous les nombres sont tirés dans le même ordre quoi qu'il arrive : la pluie ou le jour de la semaine ne font que masquer
  // une scène, sans décaler les autres tirages du logement. Les tirages de l'ancien décalage par foyer (absence, malade,
  // rentré tard, lever, retour, soirée, coucher) restent consommés, inutilisés, pour ne pas décaler les suivants.
  rng(); rng();
  const rGuests = rng();
  for (let i = 0; i < 7; i++) rng();
  const rWater = rng(), rRug = rng(), rLook = rng(), rSmoke = rng(), rParty = rng(), rTv = rng(), rKid = rng();

  const guests = rGuests < (day.weekday === 5 || day.weekday === 6 ? GUESTS.friSat : GUESTS.other);
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
  return { guests, optional, offOrder, rng: Math.floor(rng() * 4294967296) };
}
