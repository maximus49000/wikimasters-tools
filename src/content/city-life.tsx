import { useId, useMemo, useRef, type ReactElement } from 'react';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor, type Trip } from '../core/library/city/doors';
import { PULL_DY, placeEvent, pullOver, type EventFrame, type EventPlacement } from '../core/library/city/event-place';
import type { CityEvent } from '../core/library/city/events';
import { cityFacades } from '../core/library/city/facades';
import { cityIntensity, type CityContext } from '../core/library/city/intensity';
import { lampLit as streetLampLit, lampsFor } from '../core/library/city/lamps';
import { FAR_SHRINK, STREET_SCALE, cityMetrics, type CityMetrics } from '../core/library/city/metrics';
import { pedestrianGate, pedestriansFor, type Pedestrian } from '../core/library/city/people';
import { LANE_DIR, vehicleGate, vehiclesFor, type Vehicle } from '../core/library/city/vehicles';
import { loopX } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { CityEventSprite } from './city-event-sprites';
import { LampSprite, PersonSprite, VehicleSprite } from './city-sprites';
import { useCityEvents } from './use-city-events';
import { useWallClockLoop } from './use-wallclock-loop';

// Vie de la scène Ville : passants, habitants qui sortent de leur immeuble ou y rentrent, deux files de circulation,
// et les événements de la ville (vague 1b-i). La présence (data-active, opacité) ne change qu'à la minute (re-rendu React)
// ou quand l'ensemble des événements change ; les positions sont posées par la boucle d'animation directement sur
// `transform`, sans re-rendu. Seuls les habitants voient aussi leur présence décidée par la boucle
// (un tirage par tour de cycle de trajet).
// `forcedNight` : mode « Toujours la nuit » (les lampadaires restent allumés).
export type CityLifeProps = { width: number; height: number; sky: Sky; seed: number; city: CityContext; rainy: boolean; forcedNight?: boolean };

// Écart entre un parent et chaque enfant qu'il accompagne (repère du sprite, avant l'échelle).
const COMPANION_GAP = 16;
// Durée du fondu d'apparition/disparition (CSS) ; un absent continue d'avancer tant qu'il s'efface (avec une petite marge).
const FADE_S = 3;
// Fondu court des habitants (leur présence est réécrite par la boucle) : ils n'apparaissent ni ne disparaissent d'un coup
// en pleine rue. Sert aussi aux voitures qui s'effacent devant un véhicule d'événement. Aucun fondu en mouvement réduit.
const RESIDENT_FADE_S = 0.4;
// Les vélos roulent sur une piste au bord de la file du premier plan (côté droit du sens de marche, vers le spectateur).
const BIKE_TRACK_DY = 2;

// `dy` : décalage d'une voiture qui se range devant l'ambulance (0 sinon).
const vehicleTransform = (v: Vehicle, m: CityMetrics, width: number, t: number, dy = 0): string => {
  const x = loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t);
  const k = m.unit * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1);
  const y = m.laneY[v.lane] + (v.kind === 'bike' ? BIKE_TRACK_DY * m.unit : 0) + dy;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(LANE_DIR[v.lane] * k).toFixed(3)} ${k.toFixed(3)})`;
};

const placementTransform = (p: EventPlacement): string => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})`;

// Décalage d'une voiture motorisée devant les ambulances actives de sa file (vers le bord : premier plan vers le bas, fond vers le haut).
const pullDy = (v: Vehicle, ambulances: CityEvent[], m: CityMetrics, width: number, t: number): number => {
  if (v.kind === 'bike' || ambulances.length === 0) return 0;
  let f = 0;
  for (const amb of ambulances) if (amb.track === v.lane) f = Math.max(f, pullOver(amb, loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t), width, t));
  return f * PULL_DY * m.unit * (v.lane === 'near' ? 1 : -1);
};

type StreetLampsProps = { width: number; height: number; seed: number; minutes: number; daylight: number; forcedNight?: boolean };

// Lampadaires au bord du trottoir : dessinés devant les passants (leur pied est plus près de la rue) et derrière les voitures.
// Ils sont dans le calque animé (la boucle n'y touche pas) ; sans contexte de ville, SceneActors les dessine seuls.
export function StreetLamps({ width, height, seed, minutes, daylight, forcedNight = false }: StreetLampsProps): ReactElement {
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const m = cityMetrics(height);
  const curb = m.curb;
  return (
    <g data-street-lamps="">
      {lamps.map((lamp) => {
        const lit = streetLampLit(lamp, minutes, daylight, forcedNight);
        return (
          <g key={lamp.id} data-street-lamp={lamp.id} data-lit={lit ? 'true' : 'false'} transform={`translate(${lamp.x} ${curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`}>
            <LampSprite lit={lit} />
          </g>
        );
      })}
    </g>
  );
}

const pedTransform = (p: Pedestrian, m: CityMetrics, width: number, t: number): string => {
  const x = loopX(p.phase, p.dir * p.speed, width, t);
  // Légère profondeur sur le trottoir : les passants ne marchent pas tous sur la même ligne.
  const y = m.walkY - (p.depth - 0.5) * m.unit * 6;
  const k = m.unit * STREET_SCALE.person * p.scale;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(p.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

const residentTransform = (trip: Trip, x: number, m: CityMetrics): string => {
  const k = m.unit * STREET_SCALE.person * trip.scale;
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

export function CityLifeLayer({ width, height, sky, seed, city, rainy, forcedNight = false }: CityLifeProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  // Passants et véhicules présents au dernier placement : ceux qui disparaissent continuent d'avancer pendant leur fondu.
  const moving = useRef<Set<string>>(new Set());
  // Calculs mémoïsés par (width, height, seed) : populations, entrées, trajets, façades. Recalculés par minute : intensités.
  const metrics = useMemo(() => cityMetrics(height), [height]);
  const peds = useMemo(() => pedestriansFor(width, seed), [width, seed]);
  const vehicles = useMemo(() => vehiclesFor(width, seed), [width, seed]);
  const doors = useMemo(() => doorsFor(width, height, seed), [width, height, seed]);
  const trips = useMemo(() => tripsFor(doors, seed), [doors, seed]);
  const facades = useMemo(() => cityFacades(width, height, seed), [width, height, seed]);
  const frame = useMemo<EventFrame>(() => ({ width, height, metrics, facades }), [width, height, metrics, facades]);
  const intensity = useMemo(() => cityIntensity(city), [city]);
  // Une entrée par immeuble : la probabilité par trajet est réduite selon le nombre d'entrées (≤ 6 habitants par 720 px).
  const flow = useMemo(() => residentFlow(intensity, city.minutes, doors.length, width), [intensity, city.minutes, doors.length, width]);
  const lights = sky.daylight < 0.5 || rainy;
  const gateOf = (trip: Trip): number => (trip.kind === 'out' ? flow.out : flow.in);
  const maskBase = `cm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-city-mask`;

  // Mouvement réduit : la boucle ne tourne pas, les positions restent celles du premier calcul (pas de saut à chaque minute).
  const frozen = useRef<number | null>(null);
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (frozen.current === null) frozen.current = Date.now() / 1000;

  // Événements de la ville : programme du grand créneau, événements actifs, voitures effacées, ambulances.
  const events = useCityEvents({ seed, width, city, intensity, vehicles, still, frozenT: frozen.current });

  const pedActive = useMemo(() => new Set(peds.filter((p) => p.u < pedestrianGate(p, intensity)).map((p) => p.id)), [peds, intensity]);
  // Une voiture effacée par un véhicule d'événement n'est pas présente pendant tout son passage.
  const vehActive = useMemo(
    () => new Set(vehicles.filter((v) => v.u < vehicleGate(v, intensity) && !events.yielded.has(v.id)).map((v) => v.id)),
    [vehicles, intensity, events.yielded],
  );

  // Placement à chaque image. La table des nœuds est remplie au premier appel (après le montage) ;
  // tout est placé une fois, puis bougent les présents et, pendant leur fondu, ceux qui viennent de disparaître.
  const place = useMemo(() => {
    let nodes: Map<string, SVGGElement> | null = null;
    let first = true;
    let leaving = new Set<string>();
    let leaveUntil = 0;
    const moves = (id: string, t: number): boolean => first || vehActive.has(id) || pedActive.has(id) || (t < leaveUntil && leaving.has(id));
    return (now: number): void => {
      // Mouvement réduit : toujours le même instant, y compris quand le placement est refait après un changement de minute.
      const t = still ? frozen.current! : now;
      const el = root.current;
      if (!el) return;
      if (!nodes) {
        nodes = new Map();
        for (const node of el.querySelectorAll<SVGGElement>('[data-life-id]')) nodes.set(node.getAttribute('data-life-id')!, node);
        leaving = new Set([...moving.current].filter((id) => !vehActive.has(id) && !pedActive.has(id)));
        leaveUntil = t + FADE_S + 0.2;
        moving.current = new Set([...vehActive, ...pedActive]);
      }
      for (const v of vehicles) if (moves(v.id, t)) nodes.get(v.id)?.setAttribute('transform', vehicleTransform(v, metrics, width, t, pullDy(v, events.ambulances, metrics, width, t)));
      for (const p of peds) if (moves(p.id, t)) nodes.get(p.id)?.setAttribute('transform', pedTransform(p, metrics, width, t));
      for (const e of events.active) nodes.get(e.key)?.setAttribute('transform', placementTransform(placeEvent(e, t, frame)));
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
      // En dernier : peut demander un re-rendu (nouvel ensemble d'événements), qui recrée cette fonction.
      events.check(t);
    };
  }, [vehicles, peds, trips, vehActive, pedActive, flow, metrics, width, still, events, frame]);
  useWallClockLoop(place, [place]);

  // Rendu initial : mêmes calculs qu'à la première image, pour que le premier dessin (et les tests) soient justes.
  const t0 = still ? frozen.current : Date.now() / 1000;
  const eventNode = (e: CityEvent): ReactElement => (
    <g key={e.key} data-life-id={e.key} data-event={e.id} data-active="true" transform={placementTransform(placeEvent(e, t0, frame))}>
      <CityEventSprite event={e} sky={sky} still={still} lights={lights} rainy={rainy} />
    </g>
  );
  const of = (pred: (e: CityEvent) => boolean): CityEvent[] => events.active.filter(pred);
  const fireworks = of((e) => e.id === 'fireworks');
  const cranes = of((e) => e.id === 'crane');
  const near = facades.filter((b) => !b.far);
  const lane = (which: 'far' | 'near'): ReactElement => (
    <g data-city-lane={which}>
      {/* Vélos après les voitures : leur piste est au bord de la file, plus près du spectateur. */}
      {[...vehicles.filter((v) => v.lane === which && v.kind !== 'bike'), ...vehicles.filter((v) => v.lane === which && v.kind === 'bike')]
        .map((v) => {
          const active = vehActive.has(v.id);
          const yielded = events.yielded.has(v.id);
          return (
            <g
              key={v.id}
              data-life-id={v.id}
              data-vehicle=""
              data-kind={v.kind}
              data-lane={v.lane}
              data-active={active ? 'true' : 'false'}
              data-yield={yielded ? 'true' : undefined}
              transform={vehicleTransform(v, metrics, width, t0, pullDy(v, events.ambulances, metrics, width, t0))}
              opacity={active ? 1 : 0}
              style={{ transition: `opacity ${yielded ? RESIDENT_FADE_S : FADE_S}s ease` }}
            >
              <VehicleSprite vehicle={v} sky={sky} lights={lights} />
            </g>
          );
        })}
      {/* Véhicules d'événement de cette file (et de la piste cyclable pour le premier plan). */}
      {of((e) => e.layer === 'street' && (e.track === which || (which === 'near' && e.track === 'bike'))).map(eventNode)}
    </g>
  );
  const silhouette = (list: typeof facades): ReactElement[] =>
    list.map((b, i) => <rect key={i} x={b.x} y={metrics.ground - b.h} width={b.w} height={b.h + height} fill="#000" />);

  return (
    <g data-city-life="" ref={root}>
      {/* Masques des toits : le feu d'artifice part de derrière tous les immeubles, la grue est derrière le premier plan. */}
      {(fireworks.length > 0 || cranes.length > 0) && (
        <defs>
          {fireworks.length > 0 && (
            <mask id={`${maskBase}-skyline`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              {silhouette(facades)}
            </mask>
          )}
          {cranes.length > 0 && (
            <mask id={`${maskBase}-near`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              {silhouette(near)}
            </mask>
          )}
        </defs>
      )}
      <g data-city-events-back="">
        {fireworks.length > 0 && <g data-event-mask="skyline" mask={`url(#${maskBase}-skyline)`}>{fireworks.map(eventNode)}</g>}
        {cranes.length > 0 && <g data-event-mask="near" mask={`url(#${maskBase}-near)`}>{cranes.map(eventNode)}</g>}
        {of((e) => e.layer === 'sky' || e.id === 'kite' || e.id === 'apartment').map(eventNode)}
      </g>
      {/* Ordre de dessin : trottoir (passants, habitants, événements de trottoir) au fond, contre les immeubles, puis les
          lampadaires (bord du trottoir), la file du fond, puis celle du premier plan. */}
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
              style={still ? undefined : { transition: `opacity ${RESIDENT_FADE_S}s ease` }}
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
              style={{ transition: `opacity ${FADE_S}s ease` }}
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
        {of((e) => e.layer === 'sidewalk').map(eventNode)}
      </g>
      <StreetLamps width={width} height={height} seed={seed} minutes={city.minutes} daylight={sky.daylight} forcedNight={forcedNight} />
      {lane('far')}
      {lane('near')}
    </g>
  );
}
