import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { FAR_SHRINK, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { PARADE_SPEED, paradeOn, paradeUnits, paradeX, type ParadeLane, type ParadeUnit } from '../core/library/city/parade';
import { phaseIndexOf } from '../core/library/figure/gait';
import type { Sky } from '../core/library/sky';
import { CITIZENS_3D } from './figure/citizen-config';
import { useFigureRegistry } from './figure/figure-host';
import { EnterWait3D, gateEntering, poseFigure } from './figure/ghibli-figure';
import { FIG, PARADE_YAW, ParadeUnitSprite, paradeArms, type MarchArms } from './parade-sprites';
import { useWallClockLoop } from './use-wallclock-loop';
import { useCarRegistry } from './vehicle/car-host';
import { placeScripted } from './vehicle/scripted-car';

// Calque du grand défilé du 14 juillet (spec §7.4). Le moteur (`city/parade.ts`) est pur : le flux des unités se calcule
// depuis l'instant (s) du début du jour de la scène. Ici, la boucle lit l'horloge murale, pose chaque unité visible par un
// `transform` (sans re-rendu) et ne re-rend que lorsque l'ensemble des unités dans le champ change. Le cortège roule sur les deux
// files de la route (une instance du calque par file, la file du fond réduite de FAR_SHRINK), vers la droite, pendant la fermeture de la route du 14 juillet à partir de 10 h (`paradeOn`). Mouvement réduit :
// le cortège ne part pas (rien n'est dessiné).
// Ghibli (G3c) : la boucle pose aussi les marcheurs (`[data-arms]`) au pas cadencé : image de marche tirée de la distance
// parcourue par le cortège depuis le début du jour (toutes les unités roulent à PARADE_SPEED : tout le monde au même pas,
// aucun pied qui glisse) ; poseFigure n'écrit que si l'image change.

// Début du jour de la scène (s, horloge murale) : la minute de la scène est alignée sur les minutes de l'horloge
// (voir hyperStartMinute dans events.ts), donc début = début de la minute murale − minutes × 60. Gardé tant qu'il ne bouge
// pas de plus d'une minute : un re-rendu tombé entre le changement de minute de l'horloge et celui de la scène ne fait pas
// sauter le cortège. Gardé aussi tant que la minute de la scène ne change pas : heure figée (réglage jour, nuit, manuel), le
// temps continue de couler depuis l'ancrage, rien ne saute en arrière toutes les deux minutes.
export function useSceneDayStart(minutes: number, nowS: number): number {
  const ref = useRef<{ start: number; minutes: number } | null>(null);
  const fresh = Math.floor(nowS / 60 + 1e-9) * 60 - minutes * 60;
  const r = ref.current;
  if (r === null || (minutes !== r.minutes && Math.abs(fresh - r.start) > 90)) ref.current = { start: fresh, minutes };
  else if (minutes !== r.minutes) ref.current = { start: r.start, minutes };
  return ref.current!.start;
}

type Props = { width: number; seed: number; sky: Sky; still: boolean; dayFests: readonly FestivityId[]; minutes: number; metrics: CityMetrics; lane: ParadeLane; ghibli?: boolean };

// Habitants 3D : une unité est montée ENTER_LEAD_S secondes avant d'entrer dans le champ, cachée hors champ tant qu'un de ses
// personnages attend sa 3D (EnterWait3D, gateEntering) : marcheurs et cavaliers entrent directement en 3D.
// Interrupteur à false : montée à l'entrée dans le champ, comme avant.
const ENTER_LEAD_S = CITIZENS_3D ? 6 : 0;
const nearAt = (u: ParadeUnit, width: number, t: number): boolean => paradeX(u, width, t) !== null || (ENTER_LEAD_S > 0 && paradeX(u, width, t + ENTER_LEAD_S) !== null);
const visibleAt = (units: readonly ParadeUnit[], width: number, t: number): ParadeUnit[] => units.filter((u) => nearAt(u, width, t));
const keyOf = (list: readonly ParadeUnit[]): string => list.map((u) => u.id).join(',');

// Marcheurs et véhicules peints d'une unité (nœuds lus une fois par nœud d'unité).
const marchersOf = new WeakMap<Element, Element[]>();
const carsOf = new WeakMap<Element, Element[]>();

export function ParadeLayer({ width, seed, sky, still, dayFests, minutes, metrics, lane, ghibli = false }: Props): ReactElement | null {
  const figures = useFigureRegistry();
  const carReg = useCarRegistry();
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
      const phase = ghibli ? phaseIndexOf((PARADE_SPEED * (t - dayStart)) / (k * FIG)) : 0;
      for (const u of vis) {
        const node = el.querySelector(`[data-parade-id="${u.id}"]`);
        node?.setAttribute('transform', transformAt(u, t));
        if (!ghibli || !node) continue;
        if (CITIZENS_3D) {
          const ok = gateEntering(figures, node, paradeX(u, width, t) !== null);
          if (node.getAttribute('visibility') !== (ok ? 'visible' : 'hidden')) node.setAttribute('visibility', ok ? 'visible' : 'hidden');
        }
        let marchers = marchersOf.get(node);
        // Relu si les enfants ont été remplacés (bascule de graphisme) : nœuds détachés.
        if (!marchers || (marchers.length > 0 && !marchers[0]!.isConnected)) marchersOf.set(node, (marchers = [...node.querySelectorAll('[data-arms]')]));
        for (const m of marchers) {
          const arms = paradeArms(m.getAttribute('data-arms') as MarchArms, t);
          poseFigure(figures, m.querySelector(':scope > [data-figure]'), { yaw: PARADE_YAW, gait: 'walk', phase, head: 0, arms });
        }
        // Véhicules peints (V5) : roues tournées par la distance parcourue par le cortège depuis l'entrée de l'unité, gyrophares,
        // occupants (unités du véhicule : px du monde / échelle de la file).
        let cars = carsOf.get(node);
        if (!cars || (cars.length > 0 && !cars[0]!.isConnected)) carsOf.set(node, (cars = [...node.querySelectorAll('[data-scripted-car]')]));
        for (const c of cars) placeScripted(figures, carReg, c, (PARADE_SPEED * (t - u.start)) / k, PARADE_SPEED / k, 1, t);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, width, shown, k, y, ghibli, figures, carReg, dayStart],
  );
  useWallClockLoop(place, [place]);

  if (!on) return null;
  // Rendu : les unités dans le champ au dernier passage de la boucle (et au premier rendu, celles de l'instant présent).
  const ids = new Set(shown.split(','));
  const list = units.filter((u) => ids.has(u.id) || nearAt(u, width, now));
  return (
    <g data-parade="" data-lane={lane} ref={root}>
      {list.map((u) => (
        <g key={u.id} data-parade-id={u.id} transform={transformAt(u, now)}>
          <EnterWait3D.Provider value={ghibli}>
            <ParadeUnitSprite unit={u} sky={sky} still={still} ghibli={ghibli} />
          </EnterWait3D.Provider>
        </g>
      ))}
    </g>
  );
}
