import { useMemo, useRef, type ReactElement } from 'react';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor, type Trip } from '../core/library/city/doors';
import { cityIntensity, type CityContext } from '../core/library/city/intensity';
import { cityMetrics, type CityMetrics } from '../core/library/city/metrics';
import { pedestrianGate, pedestriansFor, type Pedestrian } from '../core/library/city/people';
import { LANE_DIR, vehicleGate, vehiclesFor, type Vehicle } from '../core/library/city/vehicles';
import { loopX } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite, VehicleSprite } from './city-sprites';
import { useWallClockLoop } from './use-wallclock-loop';

// Vie de la scène Ville : passants, habitants qui sortent de leur immeuble ou y rentrent, deux files de circulation.
// La présence (data-active, opacité) ne change qu'à la minute (re-rendu React) ; les positions sont posées par la boucle
// d'animation directement sur `transform`, sans re-rendu. Seuls les habitants voient aussi leur présence décidée par la
// boucle (un tirage par tour de cycle de trajet).
export type CityLifeProps = { width: number; height: number; sky: Sky; seed: number; city: CityContext; rainy: boolean };

// Les véhicules de la file du fond paraissent un peu plus petits.
const FAR_SHRINK = 0.9;
// Écart entre un parent et chaque enfant qu'il accompagne (repère du sprite, avant l'échelle).
const COMPANION_GAP = 16;

const vehicleTransform = (v: Vehicle, m: CityMetrics, width: number, t: number): string => {
  const x = loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t);
  const k = m.unit * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1);
  return `translate(${x.toFixed(1)} ${m.laneY[v.lane].toFixed(1)}) scale(${(LANE_DIR[v.lane] * k).toFixed(3)} ${k.toFixed(3)})`;
};

const pedTransform = (p: Pedestrian, m: CityMetrics, width: number, t: number): string => {
  const x = loopX(p.phase, p.dir * p.speed, width, t);
  // Légère profondeur sur le trottoir : les passants ne marchent pas tous sur la même ligne.
  const y = m.walkY - (p.depth - 0.5) * m.unit * 6;
  const k = m.unit * p.scale;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(p.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

const residentTransform = (trip: Trip, x: number, m: CityMetrics): string => {
  const k = m.unit * trip.scale;
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(trip.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

// Position et présence d'un habitant à l'instant t : présent si son trajet a lieu dans ce tour de cycle et s'il est en route.
const residentState = (trip: Trip, gate: number, width: number, t: number): { active: boolean; x: number; fade: number } => {
  const pos = tripAt(trip, width, t);
  const active = pos !== null && tripHappens(trip, t, gate);
  return { active, x: pos?.x ?? trip.doorX, fade: active && pos ? pos.fade : 0 };
};

const setIfChanged = (node: Element, name: string, value: string): void => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};

export function CityLifeLayer({ width, height, sky, seed, city, rainy }: CityLifeProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  // Calculs mémoïsés par (width, height, seed) : populations, entrées, trajets. Recalculés par minute : intensités.
  const metrics = useMemo(() => cityMetrics(height), [height]);
  const peds = useMemo(() => pedestriansFor(width, seed), [width, seed]);
  const vehicles = useMemo(() => vehiclesFor(width, seed), [width, seed]);
  const doors = useMemo(() => doorsFor(width, height, seed), [width, height, seed]);
  const trips = useMemo(() => tripsFor(doors, seed), [doors, seed]);
  const intensity = useMemo(() => cityIntensity(city), [city]);
  const flow = useMemo(() => residentFlow(intensity, city.minutes), [intensity, city.minutes]);
  const lights = sky.daylight < 0.5 || rainy;
  const gateOf = (trip: Trip): number => (trip.kind === 'out' ? flow.out : flow.in);

  const pedActive = useMemo(() => new Set(peds.filter((p) => p.u < pedestrianGate(p, intensity)).map((p) => p.id)), [peds, intensity]);
  const vehActive = useMemo(() => new Set(vehicles.filter((v) => v.u < vehicleGate(v, intensity)).map((v) => v.id)), [vehicles, intensity]);

  // Placement à chaque image. La table des nœuds est remplie au premier appel (après le montage) ;
  // tout est placé une fois, puis seuls les présents bougent (les absents sont à opacité 0).
  const place = useMemo(() => {
    let nodes: Map<string, SVGGElement> | null = null;
    let first = true;
    return (t: number): void => {
      const el = root.current;
      if (!el) return;
      if (!nodes) {
        nodes = new Map();
        for (const node of el.querySelectorAll<SVGGElement>('[data-life-id]')) nodes.set(node.getAttribute('data-life-id')!, node);
      }
      for (const v of vehicles) if (first || vehActive.has(v.id)) nodes.get(v.id)?.setAttribute('transform', vehicleTransform(v, metrics, width, t));
      for (const p of peds) if (first || pedActive.has(p.id)) nodes.get(p.id)?.setAttribute('transform', pedTransform(p, metrics, width, t));
      for (const trip of trips) {
        const node = nodes.get(trip.id);
        if (!node) continue;
        const s = residentState(trip, trip.kind === 'out' ? flow.out : flow.in, width, t);
        // N'écrire que ce qui change : la plupart des habitants restent chez eux, inutile de toucher leur nœud à chaque image.
        setIfChanged(node, 'data-active', s.active ? 'true' : 'false');
        setIfChanged(node, 'opacity', s.fade.toFixed(2));
        if (s.active || first) node.setAttribute('transform', residentTransform(trip, s.x, metrics));
      }
      first = false;
    };
  }, [vehicles, peds, trips, vehActive, pedActive, flow, metrics, width]);
  useWallClockLoop(place, [place]);

  // Rendu initial : mêmes calculs qu'à la première image, pour que le premier dessin (et les tests) soient justes.
  const t0 = Date.now() / 1000;
  const lane = (which: 'far' | 'near'): ReactElement => (
    <g data-city-lane={which}>
      {vehicles
        .filter((v) => v.lane === which)
        .map((v) => {
          const active = vehActive.has(v.id);
          return (
            <g
              key={v.id}
              data-life-id={v.id}
              data-vehicle=""
              data-kind={v.kind}
              data-lane={v.lane}
              data-active={active ? 'true' : 'false'}
              transform={vehicleTransform(v, metrics, width, t0)}
              opacity={active ? 1 : 0}
              style={{ transition: 'opacity 3s ease' }}
            >
              <VehicleSprite vehicle={v} sky={sky} lights={lights} />
            </g>
          );
        })}
    </g>
  );

  return (
    <g data-city-life="" ref={root}>
      {/* Ordre de dessin : trottoir (passants, habitants) au fond, contre les immeubles, puis la file du fond, puis celle du premier plan. */}
      <g data-city-sidewalk="">
        {trips.map((trip) => {
          const s = residentState(trip, gateOf(trip), width, t0);
          return (
            <g
              key={trip.id}
              data-life-id={trip.id}
              data-resident=""
              data-trip={trip.kind}
              data-active={s.active ? 'true' : 'false'}
              transform={residentTransform(trip, s.x, metrics)}
              opacity={s.fade.toFixed(2)}
            >
              <PersonSprite outfit={trip.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />
            </g>
          );
        })}
        {peds.map((p) => {
          const active = pedActive.has(p.id);
          return (
            <g
              key={p.id}
              data-life-id={p.id}
              data-ped=""
              data-role={p.role}
              data-profile={p.profile}
              data-active={active ? 'true' : 'false'}
              transform={pedTransform(p, metrics, width, t0)}
              opacity={active ? 1 : 0}
              style={{ transition: 'opacity 3s ease' }}
            >
              {/* Les enfants accompagnés suivent derrière le parent (repère du sprite : derrière = x négatif), à l'échelle 0,7. */}
              {p.companions.map((outfit, k) => (
                <g key={k} data-companion="" transform={`translate(${-COMPANION_GAP * (k + 1)} 0) scale(0.7)`}>
                  <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />
                </g>
              ))}
              <PersonSprite outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />
            </g>
          );
        })}
      </g>
      {lane('far')}
      {lane('near')}
    </g>
  );
}
