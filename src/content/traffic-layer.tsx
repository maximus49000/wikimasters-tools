import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CityEvent } from '../core/library/city/events';
import { FAR_SHRINK, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { CROSS_HALF, MARGIN, TRACK_DIR, advance, agentView, braking, warmTraffic, type Agent, type TrafficEnv, type TrafficWorld } from '../core/library/city/traffic/engine';
import type { Walker } from '../core/library/city/traffic/crossing';
import { outfitFor } from '../core/library/city/people';
import { phaseIndexOf } from '../core/library/figure/gait';
import { mulberry32 } from '../core/library/scene-world';
import type { Vehicle } from '../core/library/city/vehicles';
import type { FestivityId } from '../core/library/city/calendar';
import type { Sky } from '../core/library/sky';
import { CityEventSprite } from './city-event-sprites';
import { DEFAULT_RIDER, PersonSprite, VehicleSprite, tone } from './city-sprites';
import { useFigureRegistry } from './figure/figure-host';
import { createPuffs, emitPuffs, forgetPuffSources } from '../core/library/city/traffic/exhaust';
import { carArt } from '../core/library/city/traffic/car-art';
import { useCarRegistry } from './vehicle/car-host';
import { ExhaustPuffs, placePuffs } from './vehicle/exhaust-puffs';
import { GhibliCar, placeCar } from './vehicle/ghibli-car';
import { GhibliBike, crankPhase, riderPose } from './figure/ghibli-cyclist';
import { GhibliFigure, poseFigure } from './figure/ghibli-figure';
import { useWallClockLoop } from './use-wallclock-loop';

// Circulation de la scène Ville (spec véhicules §1, livraison V1). Un moteur par pièce (useTraffic, dans CityLifeLayer),
// partagé par les deux voies dessinées (TrafficLane) : chaque voie le fait avancer à l'horloge murale (le second appel de
// l'image ne fait rien), pose ses véhicules par `transform` (position interpolée, décalage dans la voie) et ne se re-rend
// que lorsque la liste des véhicules change (entrée, sortie). Les événements de rue (bus, tram, ambulance, benne, vélo
// livreur) sont des véhicules du moteur, dessinés avec leur sprite d'événement. Feux stop au freinage, feux de détresse en
// livraison. Mouvement réduit : instantané du démarrage à chaud, immobile.

export type TrafficHandle = { world: TrafficWorld; env: TrafficEnv };

// Moteur de la pièce : recréé (démarrage à chaud) quand la rue change ; l'environnement (demande, fermeture, arrivées
// planifiées, livraisons) est relu à chaque pas.
export function useTraffic(o: { width: number; seed: number; unit: number; env: TrafficEnv; startS: number }): TrafficHandle {
  const ref = useRef<{ key: string; handle: TrafficHandle } | null>(null);
  const key = `${o.width}|${o.seed}|${o.unit.toFixed(4)}`;
  if (!ref.current || ref.current.key !== key) ref.current = { key, handle: { world: warmTraffic({ width: o.width, seed: o.seed, unit: o.unit, startS: o.startS }, o.env), env: o.env } };
  ref.current.handle.env = o.env;
  return ref.current.handle;
}

// Échelle d'un véhicule (px par unité de sprite) et ordonnée selon sa voie et son décalage latéral. Voiture générée :
// échelle 1 (sa longueur est dans sa fiche).
const kOf = (a: Agent, m: CityMetrics): number => m.unit * STREET_SCALE.vehicle * (a.event || a.car ? 1 : a.scale) * (a.track === 'far' ? FAR_SHRINK : 1);
const BIKE_TRACK_DY = 2;
function yOf(a: Agent, lat: number, m: CityMetrics): number {
  const gap = m.laneY.near - m.laneY.far;
  if (a.track === 'far') return m.laneY.far + lat * gap;
  if (a.track === 'bike') return m.laneY.near + BIKE_TRACK_DY * m.unit - lat * gap * 0.3;
  return m.laneY.near - lat * gap;
}
// Voiture Ghibli (`painted`) : jamais retournée (GhibliCar porte le sens), tressaute sur les pavés et tangue au freinage.
const transformOf = (w: TrafficWorld, a: Agent, m: CityMetrics, now: number, painted = false): string => {
  const v = agentView(w, a, now);
  const k = kOf(a, m);
  if (painted) {
    const dir = TRACK_DIR[a.track];
    const bump = Math.sin((a.dist / k) * 0.13 + a.seed) * 0.12 * Math.min(1, a.v / (30 * m.unit)) * k;
    return `translate(${v.x.toFixed(1)} ${(yOf(a, v.lat, m) + bump).toFixed(2)}) scale(${k.toFixed(3)}) rotate(${(v.pitch * dir * (180 / Math.PI)).toFixed(2)})`;
  }
  return `translate(${v.x.toFixed(1)} ${yOf(a, v.lat, m).toFixed(1)}) scale(${(TRACK_DIR[a.track] * k).toFixed(3)} ${k.toFixed(3)})`;
};
// Véhicule d'ambiance vu par les sprites actuels.
const asVehicle = (a: Agent): Vehicle => ({ id: a.id, lane: a.track === 'far' ? 'far' : 'near', kind: a.kind === 'van' || a.kind === 'bus' || a.kind === 'bike' ? a.kind : 'car', color: a.color, speed: a.vmax, phase: 0, u: 0, scale: a.scale, ...(a.rider ? { rider: a.rider } : {}), ...(a.car ? { len: a.car.L } : {}) });
const paintedCar = (a: Agent, ghibli: boolean): boolean => ghibli && a.kind === 'car' && a.car !== undefined;
// Demi-longueur dessinée (repère du sprite) : feux à l'arrière, détresse aux deux bouts.
const SPRITE_HALF: Record<string, number> = { car: 20, van: 23, bus: 34, bike: 9, tram: 66, ambulance: 21, 'garbage-truck': 34, 'delivery-bike': 9 };

type LaneProps = {
  handle: TrafficHandle;
  lane: 'near' | 'far';
  metrics: CityMetrics;
  sky: Sky;
  lights: boolean;
  rainy: boolean;
  still: boolean;
  ghibli: boolean;
  fests: readonly FestivityId[];
  eventsByKey: ReadonlyMap<string, CityEvent>;
  frozenT: number;
};

export function TrafficLane({ handle, lane, metrics, sky, lights, rainy, still, ghibli, fests, eventsByKey, frozenT }: LaneProps): ReactElement {
  const w = handle.world;
  const [, setRoster] = useState(w.roster);
  const root = useRef<SVGGElement | null>(null);
  const figures = useFigureRegistry();
  const cars = useCarRegistry();
  const seen = useRef(w.roster);
  // Fumée d'échappement (Ghibli) : pool fixe de la voie.
  const puffs = useRef(createPuffs(48)).current;
  const smoke = useRef<SVGGElement | null>(null);
  const place = useMemo(
    () => (now: number): void => {
      const t = still ? frozenT : now;
      if (!still) advance(w, t, handle.env);
      if (w.roster !== seen.current) {
        seen.current = w.roster;
        setRoster(w.roster);
      }
      const el = root.current;
      if (!el) return;
      const alive = new Set<string>();
      for (const node of el.children) {
        const id = node.getAttribute('data-life-id');
        const a = id ? w.agents.find((x) => x.id === id) : undefined;
        if (!a) continue;
        const painted = paintedCar(a, ghibli);
        node.setAttribute('transform', transformOf(w, a, metrics, t, painted));
        if (painted) {
          // Voiture Ghibli : roues, occupants, images peintes ; feu stop ; bouffées au pot.
          const k = kOf(a, metrics);
          const dir = TRACK_DIR[a.track];
          const view = agentView(w, a, t);
          const carNode = node.querySelector('[data-ghibli-car]');
          if (carNode && !still) placeCar(figures, cars, carNode, { car: a.car!, dist: a.dist / k, v: a.v / k, lean: view.lean, seed: a.seed }, dir, t);
          node.querySelector('[data-brake]')?.setAttribute('opacity', braking(a, w.unit) ? '1' : '0');
          if (!still) {
            alive.add(a.id);
            const ex = carArt(a.car!).exhaust;
            emitPuffs(puffs, { id: a.id, x: view.x + ex.x * k * dir, y: yOf(a, view.lat, metrics) + ex.y * k, k, acc: a.cmd, v: a.v, unit: w.unit, dir }, t);
          }
          continue;
        }
        const brake = node.querySelector(':scope > [data-brake]');
        if (brake) brake.setAttribute('opacity', braking(a, w.unit) ? '1' : '0');
        const hazard = node.querySelector(':scope > [data-hazard]');
        if (hazard) hazard.setAttribute('opacity', a.hazard && Math.floor(t * 1.6) % 2 === 0 ? '1' : '0');
        if (ghibli && a.kind === 'bike' && !still) poseFigure(figures, node.querySelector('[data-bike-rider] > [data-figure]'), riderPose(1, crankPhase(a.dist / kOf(a, metrics))));
      }
      if (ghibli) {
        forgetPuffSources(puffs, alive);
        placePuffs(smoke.current?.firstElementChild ?? null, puffs, t);
        cars.flush();
      }
    },
    [w, handle, metrics, still, frozenT, ghibli, figures, cars, puffs],
  );
  useWallClockLoop(place, [place]);
  // Mouvement réduit : un seul placement après le montage.
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);

  const now = still ? frozenT : Date.now() / 1000;
  const mine = w.agents.filter((a) => (lane === 'far' ? a.track === 'far' : a.track !== 'far'));
  // Profondeur : au premier plan, le plus au centre de la chaussée (décalage > 0) est derrière ; vélos devant tout.
  // Au fond, l'inverse.
  const order = [...mine].sort((p, q) => (p.track === 'bike' ? 1 : 0) - (q.track === 'bike' ? 1 : 0) || (lane === 'near' ? q.lat - p.lat : p.lat - q.lat));
  return (
    <g data-traffic-lane={lane} ref={root}>
      {order.map((a) => {
        const ev = a.event ? eventsByKey.get(a.event) : undefined;
        const half = a.car ? a.car.L / 2 : (SPRITE_HALF[a.kind] ?? 20);
        const painted = paintedCar(a, ghibli);
        return (
          <g key={a.id} data-life-id={a.id} data-vehicle="" data-kind={a.kind} data-lane={a.track} data-active="true" transform={transformOf(w, a, metrics, now, painted)}>
            {painted ? (
              <GhibliCar car={a.car!} dir={TRACK_DIR[a.track]} sky={sky} rainy={rainy} lights={lights} still={still} />
            ) : ev ? (
              <CityEventSprite event={ev} sky={sky} still={still} lights={lights} rainy={rainy} fests={fests} ghibli={ghibli} />
            ) : ghibli && a.kind === 'bike' ? (
              <GhibliBike outfit={a.rider ?? DEFAULT_RIDER} color={tone(a.color, sky)} ink={tone('#3B3F4A', sky)} sky={sky} rainy={rainy} dir={1} phase={still ? 0 : crankPhase(a.dist / kOf(a, metrics))} lights={lights} />
            ) : (
              <VehicleSprite vehicle={asVehicle(a)} sky={sky} lights={lights} />
            )}
            {!painted && a.kind !== 'bike' && a.kind !== 'delivery-bike' && <circle data-brake="" cx={-half + 1.2} cy={-9} r={1.5} fill="#FF3B2F" opacity={braking(a, w.unit) ? 1 : 0} />}
            {!painted && (a.kind === 'van' || a.kind === 'car') && (
              <g data-hazard="" opacity={0} fill="#FFB020">
                <circle cx={-half + 1.2} cy={-11.5} r={1.3} />
                <circle cx={half - 1.2} cy={-11.5} r={1.3} />
              </g>
            )}
          </g>
        );
      })}
      {ghibli && (
        <g ref={smoke}>
          <ExhaustPuffs pool={puffs} />
        </g>
      )}
    </g>
  );
}

// Feu tricolore du monde (pièces larges) et poteaux d'arrêt de bus : dessin simple, posé au bord du trottoir. `side` : trottoir
// du haut (`near` : celui des immeubles, derrière les voies) ou d'en face (`far`, en bas de l'image, devant elles).
export function TrafficFixtures({ handle, metrics, sky, still, frozenT, side }: { handle: TrafficHandle; metrics: CityMetrics; sky: Sky; still: boolean; frozenT: number; side: 'near' | 'far' }): ReactElement {
  const w = handle.world;
  const u = metrics.unit;
  const t = (c: string): string => tone(c, sky);
  const root = useRef<SVGGElement | null>(null);
  const place = useMemo(
    () => (now: number): void => {
      void now;
      const el = root.current;
      if (!el) return;
      // Feu des voitures, et petit voyant « appel enregistré » du boîtier à bouton quand un piéton a appuyé.
      const color = w.light.color;
      for (const lamp of el.querySelectorAll('[data-light-lamp]')) lamp.setAttribute('opacity', lamp.getAttribute('data-light-lamp') === color ? '1' : '0.18');
      for (const led of el.querySelectorAll('[data-call]')) led.setAttribute('opacity', w.light.pressedAt !== null ? '1' : '0.15');
    },
    [w],
  );
  useWallClockLoop(place, [place]);
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);
  const pole = (x: number, y: number, flip: boolean): ReactElement => (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(flip ? -u : u).toFixed(3)} ${u.toFixed(3)})`}>
      <rect x={-0.8} y={-34} width={1.6} height={34} fill={t('#3A3434')} />
      <rect x={-3} y={-46} width={6} height={13} rx={1.6} fill={t('#2A2626')} />
      <circle data-light-lamp="red" cx={0} cy={-42.6} r={1.7} fill="#E0402F" opacity={0.18} />
      <circle data-light-lamp="amber" cx={0} cy={-39.4} r={1.7} fill="#F2A33A" opacity={0.18} />
      <circle data-light-lamp="green" cx={0} cy={-36.2} r={1.7} fill="#3FC06A" opacity={0.18} />
      {/* Boîtier à bouton-poussoir des piétons, voyant d'appel. */}
      <rect x={0.8} y={-20} width={3.2} height={4.6} rx={0.6} fill={t('#E8C440')} />
      <circle cx={2.4} cy={-17.2} r={0.8} fill={t('#2A2626')} />
      <circle data-call="" cx={2.4} cy={-19} r={0.5} fill="#FF5A3A" opacity={0.15} />
    </g>
  );
  const busStop = (x: number, y: number): ReactElement => (
    <g data-bus-stop="" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${u.toFixed(3)})`}>
      <rect x={-0.6} y={-30} width={1.2} height={30} fill={t('#3A3434')} />
      <rect x={-4.2} y={-36} width={8.4} height={7} rx={1} fill={t('#2F7D64')} />
      <text x={0} y={-30.9} fontSize={4} fontWeight={700} textAnchor="middle" fill={t('#F2EFE6')}>BUS</text>
    </g>
  );
  return (
    <g data-traffic-fixtures={side} ref={root}>
      {/* La voie du premier plan (vers la droite) longe le trottoir d'en face, en bas de l'image ; celle du fond, le trottoir du haut. */}
      {side === 'near' ? busStop(w.busStop.far, metrics.curb + 1) : busStop(w.busStop.near, metrics.farSide)}
      {w.light && (side === 'near' ? pole(w.light.x - (CROSS_HALF + 3) * u, metrics.curb + 1, true) : pole(w.light.x + (CROSS_HALF + 3) * u, metrics.farSide, false))}
    </g>
  );
}

// Bandes du passage piéton (sous les voies) : bandes claires empilées du trottoir des immeubles à celui d'en face, un peu
// plus larges vers le bas (plus près du spectateur).
export function Crosswalk({ handle, metrics, sky }: { handle: TrafficHandle; metrics: CityMetrics; sky: Sky }): ReactElement | null {
  const l = handle.world.light;
  if (!l) return null;
  const u = metrics.unit;
  const top = metrics.curb + 2 * u;
  const bottom = metrics.farSide - 2 * u;
  const bars: ReactElement[] = [];
  for (let y = top, i = 0; y < bottom - 2 * u; y += 6 * u, i++) {
    const half = CROSS_HALF * u * (0.92 + 0.16 * ((y - top) / (bottom - top)));
    bars.push(<rect key={i} x={l.x - half} y={y} width={2 * half} height={3 * u} rx={0.6 * u} />);
  }
  return (
    <g data-crosswalk="" fill={tone('#F2EFE6', sky)} opacity={0.82}>
      {bars}
    </g>
  );
}

// Piétons du passage (crossing.ts, état porté par le moteur) : arrivent par un trottoir, appuient sur le bouton, attendent au
// bord, traversent au rouge des voitures, repartent. Dessinés devant les voies (sur le trottoir des immeubles, aucun véhicule
// ne les recouvre ; sur la chaussée, les voitures sont arrêtées avant le passage). Re-rendu quand la liste change (roster).
type CrossProps = { handle: TrafficHandle; metrics: CityMetrics; sky: Sky; rainy: boolean; still: boolean; ghibli: boolean; frozenT: number };
const YAW = { right: 0, down: 4, left: 8, up: 12 } as const;
export function CrossingLayer({ handle, metrics, sky, rainy, still, ghibli, frozenT }: CrossProps): ReactElement {
  const w = handle.world;
  const u = metrics.unit;
  const top = metrics.walkY;
  const bottom = metrics.farSide + 5 * u;
  const figures = useFigureRegistry();
  const root = useRef<SVGGElement | null>(null);
  const [, setRoster] = useState(w.roster);
  const view = (p: Walker): { x: number; y: number; heading: keyof typeof YAW; k: number } => {
    const crossed = p.stage === 'leave' || (p.stage === 'cross' && p.cy >= 1);
    const y0 = p.down ? top : bottom;
    const y1 = p.down ? bottom : top;
    const y = p.stage === 'cross' ? y0 + (y1 - y0) * p.cy : crossed ? y1 : y0;
    const heading: keyof typeof YAW = p.stage === 'approach' ? (p.xc > p.fromEdge ? 'right' : 'left') : p.stage === 'leave' ? (p.toEdge > p.xc ? 'right' : 'left') : p.down ? 'down' : 'up';
    return { x: p.x, y, heading, k: u * STREET_SCALE.person * (1 + 0.12 * ((y - top) / (bottom - top))) };
  };
  const transform = (p: Walker): string => {
    const v = view(p);
    const mirror = !ghibli && v.heading === 'left' ? -1 : 1;
    return `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${(mirror * v.k).toFixed(3)} ${v.k.toFixed(3)})`;
  };
  const pose = (p: Walker) => {
    const v = view(p);
    return { yaw: YAW[v.heading], gait: p.stage === 'wait' ? ('stand' as const) : ('walk' as const), phase: p.stage === 'wait' ? 0 : phaseIndexOf(p.walked / v.k), head: 0 };
  };
  const seen = useRef(w.roster);
  const place = useMemo(
    () => (now: number): void => {
      void now;
      if (w.roster !== seen.current) {
        seen.current = w.roster;
        setRoster(w.roster);
      }
      const el = root.current;
      if (!el) return;
      for (const p of w.walkers) {
        const node = el.querySelector(`[data-crosser="${p.id}"]`);
        if (!node) continue;
        node.setAttribute('transform', transform(p));
        if (ghibli && !still) poseFigure(figures, node.querySelector(':scope > [data-figure]'), pose(p));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, still, ghibli, figures, top, bottom],
  );
  useWallClockLoop(place, [place]);
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);
  return (
    <g data-crossing="" ref={root}>
      {w.walkers.map((p) => {
        const outfit = outfitFor('ordinary', mulberry32(Math.floor(p.u * 1e9)));
        return (
          <g key={p.id} data-crosser={p.id} transform={transform(p)}>
            {ghibli ? <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={pose(p)} /> : <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />}
          </g>
        );
      })}
    </g>
  );
}
