import { useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import { astroAt, withRealSky } from '../core/library/astro';
import type { YMD } from '../core/library/city/calendar';
import type { TimeSetting } from '../core/library/library-types';
import { localClock } from '../core/library/scene-clock';
import { skyAt, sunTimes, type Sky, type SunTimes } from '../core/library/sky';
import { minutesFor } from '../core/library/time-setting';
import { currentPosition, sceneTimeZone, subscribePosition } from './scene-position';

// `date` : jour local de la scène (stable tant qu'il ne change pas) ; `mode` : réglage d'heure (réelle, jour, nuit, manuelle) ;
// `tz` : fuseau de la scène (ville choisie) ou null (appareil).
export type SceneTime = { minutes: number; sky: Sky; times: SunTimes; date: YMD; mode: TimeSetting['mode']; tz: string | null };

// Minute courante, ciel (astres à leur place réelle pour le lieu et la date, phase de la lune), heures de lever/coucher et date du jour, dans le fuseau de la scène. En heure réelle la minute est relue toutes
// les 30 s ; un changement de lieu (abonnés de la position) recalcule tout aussitôt.
export function useSceneTime(setting: TimeSetting): SceneTime {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (setting.mode !== 'real') return;
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, [setting.mode]);
  // La position change quand le joueur accorde la géolocalisation ou choisit une ville ; lue à l'identique tant qu'elle ne change pas.
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const tz = useSyncExternalStore(subscribePosition, sceneTimeZone, sceneTimeZone);
  const clock = localClock(now, tz);
  const minutes = minutesFor(setting, now, tz);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const date = useMemo<YMD>(() => clock.date, [clock.date.y, clock.date.m, clock.date.d]);
  const mode = setting.mode;
  const offsetMin = clock.offsetMin;
  return useMemo(() => {
    const times = sunTimes(date, position, offsetMin);
    const sky = withRealSky(skyAt(minutes, times), astroAt(date, minutes, position, offsetMin));
    return { minutes, times, sky, date, mode, tz };
    // `now` n'entre que par la date et le décalage du fuseau : la minute vient de `minutes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, position.lat, position.lon, date, mode, offsetMin, tz]);
}
