import { hashString, mulberry32 } from '../../scene-world';
import type { Weather } from '../../weather/weather-types';
import type { ShopDef } from './catalog';

// Terrasses (vague 1b-iv-b) : moteur pur, aucun état conservé. Les tables sortent à l'ouverture, rentrent avant la fermeture
// et disparaissent par mauvais temps ou de nuit ; la vue se contente de dessiner ce qu'il rend.
export type TerraceState = 'none' | 'setting-up' | 'open' | 'umbrellas' | 'clearing';
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

const isBad = (w: TerraceWeather): boolean => w.rain || w.snow || w.storm || w.wind;
const NONE = { state: 'none' as TerraceState, progress: 0, tables: 0 };

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
): { state: TerraceState; progress: number; tables: number } {
  if (def.terrace === 0 || !isOpen) return NONE;
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= COLD_FROM || m < COLD_UNTIL) return NONE;
  if (isBad(weather) || isBad(weatherBefore)) return NONE;
  const tables = def.terrace;
  const clearStart = closesAt - (def.id === 'bar' ? CLEAR_LEAD_BAR : CLEAR_LEAD);
  if (minutes >= clearStart) {
    if (minutes < clearStart + CLEAR_MIN) return { state: 'clearing', progress: (minutes - clearStart) / CLEAR_MIN, tables };
    return NONE;
  }
  if (minutes >= openedAt && minutes < openedAt + SETUP_MIN) return { state: 'setting-up', progress: (minutes - openedAt) / SETUP_MIN, tables };
  return { state: weather.sunny ? 'umbrellas' : 'open', progress: 1, tables };
}

// Convives assis : 0 à 2 par table selon l'affluence (0..1), 4 au plus en tout, stables pendant leur tour de 45 min.
// `state` : hors « open » / « umbrellas » (montage, démontage, rien), personne ne s'assoit.
export function terraceGuests(
  tables: number,
  seed: number,
  slotId: string,
  minutes: number,
  crowd: number,
  state: TerraceState = 'open',
): { table: number; seat: 0 | 1; leavesAt: number }[] {
  if (tables <= 0 || crowd <= 0 || (state !== 'open' && state !== 'umbrellas')) return [];
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
