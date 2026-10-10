import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { FAR_SHRINK, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { paradeOn, paradeUnits, paradeX, type ParadeLane, type ParadeUnit } from '../core/library/city/parade';
import type { Sky } from '../core/library/sky';
import { ParadeUnitSprite } from './parade-sprites';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque du grand défilé du 14 juillet (spec §7.4). Le moteur (`city/parade.ts`) est pur : le flux des unités se calcule
// depuis l'instant (s) du début du jour de la scène. Ici, la boucle lit l'horloge murale, pose chaque unité visible par un
// `transform` (sans re-rendu) et ne re-rend que lorsque l'ensemble des unités dans le champ change. Le cortège roule sur les deux
// files de la route (une instance du calque par file, la file du fond réduite de FAR_SHRINK), vers la droite, pendant la fermeture de la route du 14 juillet à partir de 10 h (`paradeOn`). Mouvement réduit :
// le cortège ne part pas (rien n'est dessiné).

// Début du jour de la scène (s, horloge murale) : la minute de la scène est alignée sur les minutes de l'horloge
// (voir hyperStartMinute dans events.ts), donc début = début de la minute murale − minutes × 60. Gardé tant qu'il ne bouge
// pas de plus d'une minute : un re-rendu tombé entre le changement de minute de l'horloge et celui de la scène ne fait pas
// sauter le cortège.
export function useSceneDayStart(minutes: number, nowS: number): number {
  const ref = useRef<number | null>(null);
  const fresh = Math.floor(nowS / 60 + 1e-9) * 60 - minutes * 60;
  if (ref.current === null || Math.abs(fresh - ref.current) > 90) ref.current = fresh;
  return ref.current;
}

type Props = { width: number; seed: number; sky: Sky; still: boolean; dayFests: readonly FestivityId[]; minutes: number; metrics: CityMetrics; lane: ParadeLane };

const visibleAt = (units: readonly ParadeUnit[], width: number, t: number): ParadeUnit[] => units.filter((u) => paradeX(u, width, t) !== null);
const keyOf = (list: readonly ParadeUnit[]): string => list.map((u) => u.id).join(',');

export function ParadeLayer({ width, seed, sky, still, dayFests, minutes, metrics, lane }: Props): ReactElement | null {
  const on = !still && paradeOn(dayFests, minutes);
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  const units = useMemo(() => (on ? paradeUnits(seed, width, dayStart).filter((u) => u.lane === lane) : []), [on, lane, seed, width, dayStart]);
  const [shown, setShown] = useState<string>(() => keyOf(visibleAt(units, width, now)));
  const root = useRef<SVGGElement | null>(null);
  const k = metrics.unit * STREET_SCALE.vehicle * (lane === 'far' ? FAR_SHRINK : 1);
  const y = metrics.laneY[lane];
  const transformAt = (u: ParadeUnit, t: number): string => `translate(${(paradeX(u, width, t) ?? -9999).toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`;

  const place = useMemo(
    () => (t: number): void => {
      const el = root.current;
      if (!el || units.length === 0) return;
      const vis = visibleAt(units, width, t);
      const key = keyOf(vis);
      if (key !== shown) setShown(key);
      for (const u of vis) el.querySelector(`[data-parade-id="${u.id}"]`)?.setAttribute('transform', transformAt(u, t));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, width, shown, k, y],
  );
  useWallClockLoop(place, [place]);

  if (!on) return null;
  // Rendu : les unités dans le champ au dernier passage de la boucle (et au premier rendu, celles de l'instant présent).
  const ids = new Set(shown.split(','));
  const list = units.filter((u) => ids.has(u.id) || paradeX(u, width, now) !== null);
  return (
    <g data-parade="" data-lane={lane} ref={root}>
      {list.map((u) => (
        <g key={u.id} data-parade-id={u.id} transform={transformAt(u, now)}>
          <ParadeUnitSprite unit={u} sky={sky} still={still} />
        </g>
      ))}
    </g>
  );
}
