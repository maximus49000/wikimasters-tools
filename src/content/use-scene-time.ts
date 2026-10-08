import { useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import type { TimeSetting } from '../core/library/library-types';
import { skyAt, sunTimes, type Sky, type SunTimes } from '../core/library/sky';
import { minutesFor } from '../core/library/time-setting';
import { currentPosition, subscribePosition } from './scene-position';

export type SceneTime = { minutes: number; sky: Sky; times: SunTimes };

// Minute courante, ciel et heures de lever/coucher du jour. En heure réelle la minute est relue toutes les 30 s.
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
  return useMemo(() => {
    const times = sunTimes({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, position, -now.getTimezoneOffset());
    return { minutes, times, sky: skyAt(minutes, times) };
    // `now` n'entre que par sa date : la minute vient de `minutes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, position.lat, position.lon, now.getFullYear(), now.getMonth(), now.getDate()]);
}
