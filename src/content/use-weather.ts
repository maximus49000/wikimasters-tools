import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { WeatherSetting } from '../core/library/library-types';
import { WEATHER_SEED, weatherAtRandom } from '../core/library/weather/weather-plan';
import { createWeatherClock, steadySource, weatherFlags, type WeatherFlags, type WeatherSource } from '../core/library/weather/weather-clock';
import { createRealWeather, realToWeather, type RealObservation } from '../core/library/weather/weather-real';
import { WEATHER_LABEL, nearestState, type Weather } from '../core/library/weather/weather-types';
import { currentPosition, isPositionKnown, subscribePosition } from './scene-position';

export type WeatherView = { clock: { read(nowMs: number): Weather }; flags: WeatherFlags; label: string; real: 'ok' | 'fallback' | null; tempC: number | null };

const OFF: WeatherFlags = { gloom: false, rainy: false };
const REAL_POLL_MS = 60_000;

const storage = {
  get: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Stockage indisponible (fenêtre privée, page de test) : le cache mémoire suffit.
    }
  },
};

// Une seule horloge par vue : change de source (réglage) en fondu. Les valeurs sont relues à la demande par le dessin (`clock.read`),
// le hook ne re-rend que pour le libellé (toutes les 5 s) et les deux drapeaux du décor fixe.
export function useWeather(setting: WeatherSetting): WeatherView {
  const clock = useMemo(() => createWeatherClock(), []);
  const real = useMemo(() => createRealWeather({ fetch: (url) => fetch(url), now: () => Date.now(), storage }), []);
  const [observation, setObservation] = useState<RealObservation | null>(() => real.latest());
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const known = isPositionKnown();
  const flagsRef = useRef<WeatherFlags>(OFF);
  const [flags, setFlags] = useState<WeatherFlags>(OFF);
  const [label, setLabel] = useState('');

  const mode = setting.mode;
  const forcedState = setting.mode === 'forced' ? setting.state : null;
  const useObservation = mode === 'real' && known && observation !== null;
  const lat = position.lat;
  const lon = position.lon;

  // Position connue + mode réel : on interroge le relais (cache 15 min côté client) puis toutes les minutes.
  useEffect(() => {
    if (mode !== 'real' || !known) return;
    let alive = true;
    const poll = (): void => void real.refresh({ lat, lon }).then((obs) => alive && setObservation(obs));
    poll();
    const timer = window.setInterval(poll, REAL_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [mode, known, lat, lon, real]);

  const code = observation?.code;
  useEffect(() => {
    let source: WeatherSource;
    if (forcedState) source = steadySource(forcedState);
    else if (useObservation && observation) {
      const w = realToWeather(observation);
      source = () => w;
    } else source = (now) => weatherAtRandom({ seed: WEATHER_SEED, lat }, now);
    clock.setSource(source, Date.now());
    // L'observation entre par son code et sa position : la même lecture ne relance pas le fondu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, forcedState, useObservation, code, lat]);

  // Libellé et drapeaux relus à intervalle : le dessin, lui, lit l'horloge à chaque image sans passer par React.
  useEffect(() => {
    const sync = (): void => {
      const w = clock.read(Date.now());
      const next = weatherFlags(w, flagsRef.current);
      if (next.gloom !== flagsRef.current.gloom || next.rainy !== flagsRef.current.rainy) {
        flagsRef.current = next;
        setFlags(next);
      }
      setLabel(WEATHER_LABEL[nearestState(w)]);
    };
    sync();
    const timer = window.setInterval(sync, 5000);
    return () => window.clearInterval(timer);
  }, [clock, forcedState, useObservation, code]);

  return {
    clock,
    flags,
    label,
    real: mode === 'real' ? (useObservation ? 'ok' : 'fallback') : null,
    tempC: useObservation && observation ? observation.tempC : null,
  };
}
