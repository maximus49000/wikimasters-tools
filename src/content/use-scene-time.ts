import { useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import type { YMD } from '../core/library/city/calendar';
import type { TimeSetting } from '../core/library/library-types';
import { skyAt, sunTimes, type Sky, type SunTimes } from '../core/library/sky';
import { minutesFor } from '../core/library/time-setting';
import { currentPosition, subscribePosition } from './scene-position';

// `date` : jour local (stable tant qu'il ne change pas) ; `mode` : réglage d'heure (réelle, jour, nuit, manuelle).
export type SceneTime = { minutes: number; sky: Sky; times: SunTimes; date: YMD; mode: TimeSetting['mode'] };

// Minute courante, ciel, heures de lever/coucher et date du jour. En heure réelle la minute est relue toutes les 30 s.
export function useSceneTime(setting: TimeSetting): SceneTime {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (setting.mode !== 'real') return;
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, [setting.mode]);
  // La position change quand le joueur accorde la géolocalisation ; on la lit à l'identique tant qu'elle ne change pas.
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const minutes = minutesFor(setting, now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const date = useMemo<YMD>(() => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }), [now.getFullYear(), now.getMonth(), now.getDate()]);
  const mode = setting.mode;
  return useMemo(() => {
    const times = sunTimes(date, position, -now.getTimezoneOffset());
    return { minutes, times, sky: skyAt(minutes, times), date, mode };
    // `now` n'entre que par sa date (`date`) : la minute vient de `minutes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, position.lat, position.lon, date, mode]);
}
