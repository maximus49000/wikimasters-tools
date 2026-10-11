import { hashString, mulberry32 } from '../../scene-world';
import type { Weather } from '../../weather/weather-types';
import type { ShopDef } from './catalog';

// Terrasses (vague 1b-iv-b) : moteur pur, aucun état conservé. Les tables sortent à l'ouverture, rentrent avant la fermeture
// et disparaissent par mauvais temps ou de nuit ; la vue se contente de dessiner ce qu'il rend.
// « emptying » : première minute d'une averse sur une terrasse sortie ; les convives se lèvent et rentrent, les tables restent.
export type TerraceState = 'none' | 'setting-up' | 'open' | 'umbrellas' | 'emptying' | 'clearing';
export type TerraceWeather = { rain: boolean; snow: boolean; storm: boolean; wind: boolean; sunny: boolean };

export const SETUP_MIN = 6; // montage dans les 6 minutes après l'ouverture
export const CLEAR_MIN = 6; // durée du démontage, qui commence avant la fermeture
export const CLEAR_LEAD = 10; // démontage commencé 10 min avant la fermeture…
export const CLEAR_LEAD_BAR = 30; // … 30 min pour le bar (les clients s'attardent)
export const WEATHER_HOLD = 10; // le mauvais temps garde la terrasse rentrée 10 min de plus
export const COLD_FROM = 22 * 60; // nuit froide : pas de table de 22 h à 7 h
export const COLD_UNTIL = 7 * 60;
export const MAX_GUESTS = 4;
const TURN_MIN = 45; // un convive reste jusqu'à la fin de son « tour » de 45 minutes
// Averse soudaine (G3b) : une minute pour que les convives rentrent à pied, puis les tables rentrent en 3 minutes (au lieu de 6).
export const RUSH_LEAVE_MIN = 1;
export const RUSH_CLEAR_MIN = 3;

// Météo continue de la scène (voir weather-types) vers les cinq drapeaux de la terrasse.
// Le vent existe (Weather.wind, 0..1) : seuil haut, qu'atteint surtout l'orage (0,9 ; la pluie reste à 0,5).
export function terraceWeatherAt(w: Weather): TerraceWeather {
  const raining = w.kind === 'rain' && w.precip > 0.15;
  return {
    rain: raining,
    snow: w.kind === 'snow' && w.precip > 0.1,
    storm: w.lightning > 0.5,
    wind: w.wind > 0.6,
    sunny: w.cloud < 0.35 && w.precip < 0.05 && w.fog < 0.3,
  };
}

export const isBad = (w: TerraceWeather): boolean => w.rain || w.snow || w.storm || w.wind;

// Résumé d'une fenêtre de relevés (les WEATHER_HOLD dernières minutes) pour `weatherBefore` : un mauvais temps est retenu
// s'il a été relevé une fois, le soleil seulement s'il a duré toute la fenêtre. Fenêtre vide : temps correct, sans soleil.
export function holdWeather(samples: readonly TerraceWeather[]): TerraceWeather {
  const any = (k: keyof TerraceWeather): boolean => samples.some((w) => w[k]);
  return { rain: any('rain'), snow: any('snow'), storm: any('storm'), wind: any('wind'), sunny: samples.length > 0 && samples.every((w) => w.sunny) };
}
const NONE = { state: 'none' as TerraceState, progress: 0, tables: 0 };
// Averse récente : `sinceBad` minutes depuis le début du mauvais temps (1 : il commence à la minute courante ; 0 : aucun début
// d'averse dans les dernières minutes), qu'il dure encore ou non ; `beforeBad` : résumé des WEATHER_HOLD minutes qui précèdent
// ce début (la terrasse était-elle sortie quand l'averse est arrivée ?).
export type TerraceRush = { sinceBad: number; beforeBad: TerraceWeather };
// `span` : durée (min) du montage ou du démontage en cours.
export type TerraceAt = { state: TerraceState; progress: number; tables: number; span?: number };

// `minutes` : minute du jour (0..1439) ; `openedAt` / `closesAt` : ouverture et fermeture de la plage en cours (closesAt peut passer 1440).
// `weatherBefore` : résumé des WEATHER_HOLD dernières minutes (un drapeau est levé s'il l'a été à un moment de la fenêtre) ;
// c'est l'hystérésis : un coup de pluie garde la terrasse rentrée 10 min. Absent, la météo est supposée stable.
export function terraceAt(
  def: ShopDef,
  isOpen: boolean,
  minutes: number,
  weather: TerraceWeather,
  openedAt: number,
  closesAt: number,
  weatherBefore: TerraceWeather = weather,
  rush?: TerraceRush,
): TerraceAt {
  if (def.terrace === 0 || !isOpen) return NONE;
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= COLD_FROM || m < COLD_UNTIL) return NONE;
  // Averse sur une terrasse sortie (elle l'était la minute d'avant l'averse) : personne ne disparaît, les convives rentrent
  // d'abord (une minute), l'employé rentre ensuite les tables (démontage court), jusqu'au bout même si l'averse a cessé (le
  // beau temps revenu, l'hystérésis la garde rentrée). Sans `rush`, tout rentre d'un coup.
  if (rush && rush.sinceBad >= 1 && rush.sinceBad <= RUSH_LEAVE_MIN + RUSH_CLEAR_MIN && !isBad(rush.beforeBad)) {
    const was = terraceAt(def, isOpen, minutes - rush.sinceBad, rush.beforeBad, openedAt, closesAt, rush.beforeBad);
    if (was.state === 'open' || was.state === 'umbrellas') {
      const step = rush.sinceBad - 1;
      if (step < RUSH_LEAVE_MIN) return { state: 'emptying', progress: 0, tables: def.terrace };
      return { state: 'clearing', progress: (step - RUSH_LEAVE_MIN) / RUSH_CLEAR_MIN, tables: def.terrace, span: RUSH_CLEAR_MIN };
    }
  }
  if (isBad(weather) || isBad(weatherBefore)) return NONE;
  const tables = def.terrace;
  const clearStart = closesAt - (def.id === 'bar' ? CLEAR_LEAD_BAR : CLEAR_LEAD);
  if (minutes >= clearStart) {
    if (minutes < clearStart + CLEAR_MIN) return { state: 'clearing', progress: (minutes - clearStart) / CLEAR_MIN, tables, span: CLEAR_MIN };
    return NONE;
  }
  if (minutes >= openedAt && minutes < openedAt + SETUP_MIN) return { state: 'setting-up', progress: (minutes - openedAt) / SETUP_MIN, tables, span: SETUP_MIN };
  return { state: weather.sunny ? 'umbrellas' : 'open', progress: 1, tables };
}

// Convives assis : 0 à 2 par table selon l'affluence (0..1), 4 au plus en tout, stables pendant leur tour de 45 min.
// `state` : hors « open » / « umbrellas » / « emptying » (montage, démontage, rien), personne ne s'assoit ; pendant « emptying »,
// les convives sont encore là (ils repartent à pied pendant la minute).
export function terraceGuests(
  tables: number,
  seed: number,
  slotId: string,
  minutes: number,
  crowd: number,
  state: TerraceState = 'open',
): { table: number; seat: 0 | 1; leavesAt: number }[] {
  if (tables <= 0 || crowd <= 0 || (state !== 'open' && state !== 'umbrellas' && state !== 'emptying')) return [];
  const guests: { table: number; seat: 0 | 1; leavesAt: number }[] = [];
  for (let table = 0; table < tables; table++) {
    for (const seat of [0, 1] as const) {
      const key = seed ^ hashString(`${slotId}/terrace/${table}/${seat}`);
      const offset = Math.floor(mulberry32(key)() * TURN_MIN); // décale les tours pour que tout le monde ne parte pas ensemble
      const turn = Math.floor((minutes + offset) / TURN_MIN);
      const rng = mulberry32(key ^ Math.imul(turn + 1, 2654435761));
      if (rng() < Math.min(1, crowd) * (seat === 0 ? 0.7 : 0.45)) guests.push({ table, seat, leavesAt: (turn + 1) * TURN_MIN - offset });
    }
  }
  return guests.slice(0, MAX_GUESTS);
}

// Arrivées et départs (G3b) : un convive ne se pose ni ne disparaît sur sa chaise. Comparés aux convives des minutes voisines
// (mêmes règles, `before` à minutes − 1, `after` à minutes + 1), celui qui n'y était pas arrive à pied pendant la minute, celui
// qui n'y sera plus repart à pied ; présent une seule minute, il n'est pas montré (trop court pour venir et repartir).
// Un convive est reconnu par sa table, sa place et la fin de son tour. Fonction pure.
export type TerraceGuest = { table: number; seat: 0 | 1; leavesAt: number };
export type GuestMove = 'seated' | 'arrive' | 'leave';
const guestKey = (g: TerraceGuest): string => `${g.table}/${g.seat}/${g.leavesAt}`;
export function terraceGuestMoves(before: readonly TerraceGuest[], now: readonly TerraceGuest[], after: readonly TerraceGuest[]): (TerraceGuest & { move: GuestMove })[] {
  const was = new Set(before.map(guestKey));
  const stays = new Set(after.map(guestKey));
  const out: (TerraceGuest & { move: GuestMove })[] = [];
  for (const g of now) {
    const a = was.has(guestKey(g));
    const b = stays.has(guestKey(g));
    if (a || b) out.push({ ...g, move: !a ? 'arrive' : !b ? 'leave' : 'seated' });
  }
  return out;
}
