import type { ReactElement } from 'react';
import { SCENE_IDS, WEATHER_STATES, type SceneId, type TimeSetting, type WeatherSetting, type WeatherState } from '../core/library/library-types';
import { WEATHER_LABEL } from '../core/library/weather/weather-types';
import { localClock } from '../core/library/scene-clock';
import type { SceneLocation } from '../core/library/scene-location';
import { formatMinutes } from '../core/library/time-setting';
import { WEATHER_SCENES } from './scene-weather';
import type { ZoneChoice } from './zone-setting';
import { Btn, Icon, ICONS } from './library-ui';

const WEATHER_ICON: Record<WeatherState, readonly string[]> = { sun: ICONS.sun, cloudy: ICONS.wxCloudy, drizzle: ICONS.wxDrizzle, rain: ICONS.wxRain, storm: ICONS.wxStorm, snow: ICONS.wxSnow, fog: ICONS.wxFog };

const SCENE_ICON: Record<SceneId, readonly string[]> = {
  city: ['M4 21V9h6v12', 'M10 21V4h6v17', 'M16 21v-8h4v8', 'M3 21h18'],
  countryside: ['M2 18c4-6 8-6 10-2 2-4 6-4 10 2', 'M3 21h18', 'M12 6v4', 'M10 8h4'],
  mountain: ['M2 20l7-12 4 6 3-4 6 10z', 'M9 8l2 3'],
  sea: ['M2 14c3-3 5 3 8 0s5 3 8 0 3-1 4 0', 'M2 19c3-3 5 3 8 0s5 3 8 0 3-1 4 0', 'M16 5a3 3 0 1 0 0 0.1'],
  space: ['M12 3l2 5 5 .5-4 3.5 1.5 5L12 14l-4.5 3 1.5-5L5 8.5 10 8z'],
  earth: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
};
const SCENE_LABEL: Record<SceneId, string> = { city: 'Ville', countryside: 'Campagne', mountain: 'Montagne', sea: 'Mer', space: 'Espace', earth: 'Terre vue d’en haut' };

// Réglage cyclique de la zone des vacances : Auto → A → B → C → Corse → Auto.
export const NEXT_ZONE: Record<ZoneChoice, ZoneChoice> = { auto: 'A', A: 'B', B: 'C', C: 'Corse', Corse: 'auto' };
const ZONE_GLYPH: Record<ZoneChoice, string> = { auto: '📍', A: 'A', B: 'B', C: 'C', Corse: 'Co' };

// Bandeau du lieu en tête du menu ☁️ : ce que suit la scène (ville, position de l'appareil ou fuseau de l'appareil).
export type PlaceBanner = { mode: SceneLocation['mode']; glyph: string; title: string; sub: string };
export function placeBanner(location: SceneLocation, failure: string | null, now: Date): PlaceBanner {
  if (location.mode === 'city') {
    const time = formatMinutes(localClock(now, location.city.tz).minutes);
    return { mode: 'city', glyph: '🏙', title: location.city.name, sub: [location.city.country, time, 'heure de la ville'].filter(Boolean).join(' · ') };
  }
  if (location.mode === 'geo') return { mode: 'geo', glyph: '📍', title: 'Ma position', sub: `géolocalisation · ${failure ?? 'environ 10 km près'}` };
  return { mode: 'off', glyph: '⊘', title: 'Lieu désactivé', sub: 'fuseau de l’appareil' };
}

const TIME_MODES = [
  ['real', 'Heure réelle', ICONS.clock],
  ['day', 'Toujours le jour', ICONS.sun],
  ['night', 'Toujours la nuit', ICONS.moon],
  ['manual', 'Choisir l’heure', ICONS.sliders],
] as const;

type Props = {
  scene: SceneId;
  onScene: (id: SceneId) => void;
  time: TimeSetting;
  onTime: (mode: TimeSetting['mode']) => void;
  onMinutes: (minutes: number) => void;
  sunLabel: string;
  lightOn: boolean;
  onLight: (on: boolean) => void;
  zoneChoice: ZoneChoice;
  zoneLabel: string;
  onZone: () => void;
  weather: WeatherSetting;
  onWeather: (next: WeatherSetting) => void;
  positionOn: boolean;
  weatherLabel: string;
  weatherNote: string | null;
  place: PlaceBanner;
  onPlace: () => void;
};

// Menu ☁️ de la barre du haut : scène et ciel, heure, lumière, zone des vacances, météo (pour les scènes qui en ont une).
export function SkyMenu(p: Props): ReactElement {
  const hasWeather = WEATHER_SCENES.includes(p.scene);
  return (
    <>
      <button type="button" className="wmt-lib-place" data-location-banner={p.place.mode} aria-label={`Lieu de la scène : ${p.place.title}, ${p.place.sub}. Changer le lieu`} title="Changer le lieu de la scène" onClick={p.onPlace}>
        <span className="wmt-lib-place-glyph" aria-hidden="true">{p.place.glyph}</span>
        <span aria-hidden="true">
          <strong>{p.place.title}</strong>
          <small>{p.place.sub}</small>
        </span>
        <span className="wmt-lib-place-chev" aria-hidden="true">›</span>
      </button>
      <div className="wmt-lib-pop-group" role="group" aria-label="Ciel">
        {SCENE_IDS.map((id) => (
          <Btn key={id} label={SCENE_LABEL[id]} pressed={p.scene === id} data={{ scene: id }} onClick={() => p.onScene(id)}>
            <Icon paths={SCENE_ICON[id]} />
          </Btn>
        ))}
      </div>
      <div className="wmt-lib-pop-group" role="group" aria-label="Heure">
        {TIME_MODES.map(([mode, label, icon]) => (
          <Btn key={mode} label={label} pressed={p.time.mode === mode} data={{ time: mode }} onClick={() => p.onTime(mode)}>
            <Icon paths={icon} />
          </Btn>
        ))}
        {hasWeather && (
          <Btn label="Lumière" pressed={p.lightOn} data={{ 'light-toggle': '' }} onClick={() => p.onLight(!p.lightOn)}>
            <Icon paths={ICONS.bulb} />
          </Btn>
        )}
        {p.scene === 'city' && (
          <Btn label={`Zone des vacances : ${p.zoneLabel}`} pressed={p.zoneChoice !== 'auto'} data={{ 'zone-toggle': '' }} onClick={p.onZone}>
            <span className="wmt-lib-zone-glyph" aria-hidden="true">
              {ZONE_GLYPH[p.zoneChoice]}
            </span>
          </Btn>
        )}
        {p.time.mode === 'manual' && (
          <input type="range" data-time-slider="" aria-label="Heure" min={0} max={1439} step={5} value={p.time.minutes} onChange={(event) => p.onMinutes(Number(event.currentTarget.value))} />
        )}
        <span className="wmt-lib-msg" data-sun-times="">
          {p.sunLabel}
        </span>
      </div>
      {hasWeather && (
        <div className="wmt-lib-pop-group" role="group" aria-label="Météo">
          <Btn label="Météo aléatoire" pressed={p.weather.mode === 'random'} data={{ 'weather-mode': 'random' }} onClick={() => p.onWeather({ mode: 'random' })}>
            <Icon paths={ICONS.dice} />
          </Btn>
          <Btn label={p.positionOn ? 'Météo réelle' : 'Météo réelle (lieu désactivé)'} pressed={p.weather.mode === 'real'} disabled={!p.positionOn} data={{ 'weather-mode': 'real' }} onClick={() => p.onWeather({ mode: 'real' })}>
            <Icon paths={ICONS.globe} />
          </Btn>
          {WEATHER_STATES.map((state) => (
            <Btn key={state} label={WEATHER_LABEL[state]} pressed={p.weather.mode === 'forced' && p.weather.state === state} data={{ 'weather-state': state }} onClick={() => p.onWeather({ mode: 'forced', state })}>
              <Icon paths={WEATHER_ICON[state]} />
            </Btn>
          ))}
          <span className="wmt-lib-msg" data-weather-label="">
            {p.weatherLabel}
          </span>
          {p.weatherNote !== null && (
            <span className="wmt-lib-msg" data-weather-note="" title={p.positionOn ? 'Position inconnue ou réseau indisponible : la météo reste simulée.' : 'Lieu désactivé (bandeau du menu ☁️ ou Paramètre d’extension › Position) : la météo reste simulée.'}>
              {p.weatherNote}
            </span>
          )}
        </div>
      )}
    </>
  );
}
