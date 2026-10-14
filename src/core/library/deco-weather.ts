import type { WeatherState } from './library-types';
import { plausibleTempC } from './weather/weather-plan';

// Ce que montrent les météomètres : état, libellé, température et nuit (lune au lieu du soleil).
export type DecoWeather = { state: WeatherState; label: string; tempC: number; night: boolean };

// Mesure réelle si on l'a (météo réelle) ; sinon température plausible du lieu et de la saison, −2 °C la nuit, 0 °C au plus sous la neige.
export function shownTempC(input: { realTempC: number | null; lat: number; now: Date; state: WeatherState; night: boolean }): number {
  if (input.realTempC !== null) return Math.round(input.realTempC);
  const t = Math.round(plausibleTempC(input.lat, input.now) - (input.night ? 2 : 0));
  return input.state === 'snow' ? Math.min(0, t) : t;
}

// Position de l'aiguille du baromètre (degrés, 0 = « Variable » en haut), de « Tempête » (−120°) à « Très sec » (+120°).
export const BAROMETER_ANGLE: Record<WeatherState, number> = { storm: -118, rain: -70, snow: -55, drizzle: -45, fog: -20, cloudy: 0, sun: 70 };

export const iconOf = (state: WeatherState, night: boolean): 'moon' | WeatherState => (state === 'sun' && night ? 'moon' : state);
