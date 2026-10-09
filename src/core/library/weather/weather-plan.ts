// src/core/library/weather/weather-plan.ts
import type { WeatherState } from '../library-types';
import { hashString, mulberry32 } from '../scene-world';
import { blend, smooth, targetOf, type Weather } from './weather-types';

// Le temps est découpé en ticks de 4 min ; une époque de 6 h repart toujours de « nuageux » et s'apaise à la fin :
// la météo est une fonction pure de l'horloge, sans dérive ni discontinuité à la frontière d'une époque.
export const TICK_MS = 240_000;
export const EPOCH_TICKS = 90;
export const CALM_TICKS = 4;
// Même graine partout : à un instant donné, toutes les pièces et tous les appareils voient le même temps.
export const WEATHER_SEED = hashString('wmt-weather-v1');

const DAY_MS = 86_400_000;

// Température plausible à la latitude et à la date (sans service externe) : ~32 °C à l'équateur, -0,5 °C par degré, ±11 °C de saison.
export function plausibleTempC(lat: number, date: Date): number {
  // Jour de l'année en UTC : tous les appareils voient la même saison au même instant, quel que soit leur fuseau.
  const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / DAY_MS);
  const season = Math.cos((2 * Math.PI * (doy - 200)) / 365) * (lat >= 0 ? 1 : -1);
  return 32 - 0.5 * Math.abs(lat) + 11 * season * Math.min(1, Math.abs(lat) / 45);
}

// Pas logiques : jamais de soleil → orage direct. Poids relatifs ; « rester » est tiré à part.
const STEP: Record<WeatherState, [WeatherState, number][]> = {
  sun: [['cloudy', 1]],
  cloudy: [['sun', 0.4], ['drizzle', 0.25], ['fog', 0.15], ['snow', 0.2]],
  drizzle: [['rain', 0.4], ['cloudy', 0.6]],
  rain: [['storm', 0.2], ['drizzle', 0.45], ['cloudy', 0.35]],
  storm: [['rain', 1]],
  snow: [['cloudy', 0.7], ['fog', 0.3]],
  fog: [['cloudy', 0.6], ['sun', 0.4]],
};
const HOLD: Record<WeatherState, number> = { sun: 0.55, cloudy: 0.5, drizzle: 0.5, rain: 0.5, storm: 0.3, snow: 0.6, fog: 0.5 };
// Apaisement de fin d'époque : un pas vers « nuageux » (l'orage met 3 pas).
const CALM: Record<WeatherState, WeatherState> = { sun: 'cloudy', cloudy: 'cloudy', drizzle: 'cloudy', rain: 'drizzle', storm: 'rain', snow: 'cloudy', fog: 'cloudy' };

// La neige n'existe que par temps froid ; la pluie gèle en neige, l'orage devient pluie sous 0 °C.
function byTemperature(state: WeatherState, tempC: number): WeatherState {
  if (state === 'snow' && tempC >= 2) return 'drizzle';
  if ((state === 'drizzle' || state === 'rain') && tempC <= -1) return 'snow';
  if (state === 'storm' && tempC <= 0) return 'rain';
  return state;
}

function pick(options: [WeatherState, number][], u: number): WeatherState {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let acc = 0;
  for (const [state, weight] of options) {
    acc += weight / total;
    if (u < acc) return state;
  }
  return options[options.length - 1]![0];
}

type EpochData = { states: WeatherState[]; wet: number[]; snow: number[] };
const cache = new Map<string, EpochData>();

// Accumulateurs de fin de tick : le sol se mouille vite et sèche en ≈ 15 min, la neige s'accumule et fond un peu plus lentement.
const DRY = 0.7;
const SOAK = 0.6;
const MELT = 0.78;
const PILE = 0.5;

function epochData(seed: number, epoch: number, lat: number): EpochData {
  // Latitude arrondie au degré, utilisée à la fois pour la clé et pour le calcul : le résultat ne dépend pas de l'ordre des appels.
  const latKey = Math.round(lat);
  const key = `${seed}:${epoch}:${latKey}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tempC = plausibleTempC(latKey, new Date(epoch * EPOCH_TICKS * TICK_MS));
  const rng = mulberry32(seed ^ Math.imul(epoch + 1, 2654435761));
  const states: WeatherState[] = ['cloudy'];
  for (let i = 1; i < EPOCH_TICKS; i++) {
    const prev = states[i - 1]!;
    // Les deux tirages sont toujours consommés : la suite reste la même quel que soit le chemin.
    const hold = rng();
    const step = rng();
    if (i >= EPOCH_TICKS - CALM_TICKS) states.push(CALM[prev]);
    else if (hold < HOLD[prev]) states.push(prev);
    else states.push(byTemperature(pick(STEP[prev], step), tempC));
  }
  const wet: number[] = [];
  const snow: number[] = [];
  let w = 0;
  let s = 0;
  for (const state of states) {
    const t = targetOf(state);
    w = Math.min(1, w * DRY + (t.kind === 'rain' ? t.precip * SOAK : 0));
    s = Math.min(1, s * MELT + (t.kind === 'snow' ? t.precip * PILE : 0));
    wet.push(w);
    snow.push(s);
  }
  const data = { states, wet, snow };
  if (cache.size > 64) cache.clear();
  cache.set(key, data);
  return data;
}

export function epochStates(seed: number, epoch: number, lat: number): WeatherState[] {
  return epochData(seed, epoch, lat).states;
}

export function weatherAtRandom(ctx: { seed: number; lat: number }, nowMs: number): Weather {
  const tick = Math.floor(nowMs / TICK_MS);
  const epoch = Math.floor(tick / EPOCH_TICKS);
  const i = tick - epoch * EPOCH_TICKS;
  const { states, wet, snow } = epochData(ctx.seed, epoch, ctx.lat);
  const cur = targetOf(states[i]!);
  const prev = targetOf(i > 0 ? states[i - 1]! : 'cloudy');
  const intoTick = (nowMs - tick * TICK_MS) / 1000;
  // Durée du fondu entre deux états : 20 à 60 s, tirée de la graine et du tick.
  const blendSeconds = 20 + 40 * mulberry32(ctx.seed ^ Math.imul(tick + 7, 40503))();
  const mixed = blend(prev, cur, smooth(intoTick / blendSeconds));
  const frac = (nowMs - tick * TICK_MS) / TICK_MS;
  const lerp = (a: number, b: number): number => a + (b - a) * frac;
  // Au premier tick d'une époque, le sol part de l'état d'arrivée de l'époque précédente (pas de saut à la frontière).
  const before = i > 0 ? { wet, snow } : epochData(ctx.seed, epoch - 1, ctx.lat);
  const last = i > 0 ? i - 1 : EPOCH_TICKS - 1;
  const prevWet = before.wet[last]!;
  const prevSnow = before.snow[last]!;
  return { ...mixed, wet: lerp(prevWet, wet[i]!), snowCover: lerp(prevSnow, snow[i]!) };
}
