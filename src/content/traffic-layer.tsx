import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CityEvent } from '../core/library/city/events';
import { FAR_SHRINK, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { CROSS_HALF, MARGIN, TRACK_DIR, advance, lightPoleX, agentView, braking, warmTraffic, type Agent, type TrafficEnv, type TrafficWorld } from '../core/library/city/traffic/engine';
import type { Walker } from '../core/library/city/traffic/crossing';
import type { Rider } from '../core/library/city/traffic/bus-stop';
import { nextStops } from '../core/library/city/traffic/bus-lines';
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
import { lookOfCar, type VehicleLook } from '../core/library/city/traffic/look';
import { specialLook } from '../core/library/city/traffic/special-art';
import { useCarRegistry } from './vehicle/car-host';
import { ExhaustPuffs, placePuffs } from './vehicle/exhaust-puffs';
import { GhibliCar, placeCar } from './vehicle/ghibli-car';
import { FOOT_DOWN_V, GhibliBike, crankPhase, riderPose } from './figure/ghibli-cyclist';
import { GhibliFigure, poseFigure } from './figure/ghibli-figure';
import { PropImage } from './prop/prop-host';
import '../core/library/paint/props/street';
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
  // Vélo : au bord du trottoir d'en face ; pour doubler, il monte vers le milieu comme une voiture (dessiné alors derrière elle).
  if (a.track === 'bike') return m.laneY.near + BIKE_TRACK_DY * m.unit - lat * gap;
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
// Véhicule d'ambiance vu par les sprites actuels (classique) : deux-roues motorisé en vélo avec son pilote, car scolaire en bus.
const CLASSIC_KIND: Partial<Record<Agent['kind'], Vehicle['kind']>> = { van: 'van', bus: 'bus', bike: 'bike', moto: 'bike', 'school-bus': 'bus' };
const asVehicle = (a: Agent): Vehicle => ({ id: a.id, lane: a.track === 'far' ? 'far' : 'near', kind: CLASSIC_KIND[a.kind] ?? 'car', color: a.color, speed: a.vmax, phase: 0, u: 0, scale: a.scale, ...(a.rider ? { rider: a.rider } : {}), ...(a.car ? { len: a.car.L } : {}) });
// Apparence peinte (Ghibli) : voiture générée ou véhicule à part (spec véhicules §4) ; vélos à part (ghibli-cyclist).
const lookOf = (a: Agent): VehicleLook | null => (a.car ? lookOfCar(a.car) : a.special ? specialLook(a.special) : null);
const paintedLook = (a: Agent, ghibli: boolean): VehicleLook | null => (ghibli && a.kind !== 'bike' && a.kind !== 'delivery-bike' ? lookOf(a) : null);
// Demi-longueur dessinée (repère du sprite) : feux à l'arrière, détresse aux deux bouts.
const SPRITE_HALF: Record<string, number> = { car: 20, van: 23, bus: 34, bike: 9, tram: 66, ambulance: 21, 'garbage-truck': 34, 'delivery-bike': 9, moto: 9, 'school-bus': 34 };

// Girouette latérale du bus Ghibli (repère du véhicule, comme GhibliCar) : bandeau sombre au-dessus des vitres, texte ambré
// qui défile (deux copies bout à bout dans un <svg> imbriqué : rognage sans clipPath). Avant l'arrêt de la scène : « Prochain
// arrêt » et la suite ; à l'arrêt : son nom ; après : les arrêts suivants jusqu'au terminus. La boucle n'écrit que la
// translation du texte, et le texte quand l'état change.
const MARQUEE = { x0: -14, x1: 20, y: -29.8, h: 2.5, size: 1.9, speed: 7 } as const;
const marqueeW = (msg: string): number => msg.length * MARQUEE.size * 0.56 + 8;
function marqueeState(a: Agent): 'a' | 's' | 'd' {
  return a.stop === 'bus' ? 's' : a.stops.length > 0 ? 'a' : 'd';
}
function marqueeText(w: TrafficWorld, a: Agent, state: 'a' | 's' | 'd'): string {
  const line = a.special?.line;
  if (!line) return '';
  const side = a.track === 'far' ? 'far' : 'near';
  const stops = nextStops(line, w.stopNames[side], state === 'd', a.seed);
  if (state === 's') return `${line.ref} · Arrêt : ${stops[0] ?? w.stopNames[side]} · Direction ${line.to}`;
  return `${line.ref} · Prochain arrêt : ${stops.join(' · ')}`;
}
function BusMarquee({ dir, msg, state }: { dir: 1 | -1; msg: string; state: string }): ReactElement {
  const w = MARQUEE.x1 - MARQUEE.x0;
  const x = dir > 0 ? MARQUEE.x0 : -MARQUEE.x1;
  const tw = marqueeW(msg);
  return (
    <svg data-marquee={state} x={x} y={MARQUEE.y} width={w} height={MARQUEE.h} viewBox={`0 0 ${w} ${MARQUEE.h}`} overflow="hidden">
      <rect width={w} height={MARQUEE.h} rx={0.6} fill="#1f1a17" />
      <g data-marquee-text="" data-w={tw.toFixed(2)} transform="translate(0 0)" fill="#ffc94a" fontSize={MARQUEE.size} fontWeight={700} fontFamily="sans-serif">
        <text x={0.6} y={MARQUEE.h - 0.55}>{msg}</text>
        <text x={0.6 + tw} y={MARQUEE.h - 0.55}>{msg}</text>
      </g>
    </svg>
  );
}
function placeMarquee(w: TrafficWorld, a: Agent, node: Element, t: number): void {
  const el = node.querySelector('[data-marquee]');
  if (!el) return;
  const state = marqueeState(a);
  const g = el.querySelector('[data-marquee-text]');
  if (!g) return;
  if (el.getAttribute('data-marquee') !== state) {
    const msg = marqueeText(w, a, state);
    const tw = marqueeW(msg);
    el.setAttribute('data-marquee', state);
    g.setAttribute('data-w', tw.toFixed(2));
    const [t0, t1] = g.querySelectorAll('text');
    if (t0) t0.textContent = msg;
    if (t1) {
      t1.textContent = msg;
      t1.setAttribute('x', (0.6 + tw).toFixed(2));
    }
  }
  const tw = Number(g.getAttribute('data-w'));
  g.setAttribute('transform', `translate(${(-((t * MARQUEE.speed) % tw)).toFixed(2)} 0)`);
}

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
        const look = paintedLook(a, ghibli);
        node.setAttribute('transform', transformOf(w, a, metrics, t, look !== null));
        if (look) {
          // Véhicule Ghibli : roues, occupants, images peintes, gyrophares ; feu stop, feux de détresse ; bouffées au pot.
          const k = kOf(a, metrics);
          const dir = TRACK_DIR[a.track];
          const view = agentView(w, a, t);
          const carNode = node.querySelector('[data-ghibli-car]');
          if (carNode && !still) placeCar(figures, cars, carNode, { look, dist: a.dist / k, v: a.v / k, lean: view.lean, seed: a.seed }, dir, t);
          if (a.special?.id === 'bus') placeMarquee(w, a, node, t);
          node.querySelector('[data-brake]')?.setAttribute('opacity', braking(a, w.unit) ? '1' : '0');
          node.querySelector(':scope > [data-hazard]')?.setAttribute('opacity', a.hazard && Math.floor(t * 1.6) % 2 === 0 ? '1' : '0');
          if (!still) {
            alive.add(a.id);
            const ex = look.art.exhaust;
            if (ex) emitPuffs(puffs, { id: a.id, x: view.x + ex.x * k * dir, y: yOf(a, view.lat, metrics) + ex.y * k, k, acc: a.cmd, v: a.v, unit: w.unit, dir }, t);
          }
          continue;
        }
        const brake = node.querySelector(':scope > [data-brake]');
        if (brake) brake.setAttribute('opacity', braking(a, w.unit) ? '1' : '0');
        const hazard = node.querySelector(':scope > [data-hazard]');
        if (hazard) hazard.setAttribute('opacity', a.hazard && Math.floor(t * 1.6) % 2 === 0 ? '1' : '0');
        if (ghibli && a.kind === 'bike' && !still) poseFigure(figures, node.querySelector('[data-bike-rider] > [data-figure]'), riderPose(1, crankPhase(a.dist / kOf(a, metrics)), a.v < FOOT_DOWN_V * metrics.unit));
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
  // Profondeur : au premier plan, le plus au centre de la chaussée (décalage > 0) est derrière ; à décalage égal, les vélos
  // (au bord du trottoir) devant. Un vélo qui double par le milieu passe donc derrière la voiture doublée. Au fond, l'inverse.
  const depth = (a: Agent): number => (lane === 'near' ? -a.lat : a.lat) + (a.track === 'bike' ? 0.05 : 0);
  const order = [...mine].sort((p, q) => depth(p) - depth(q));
  return (
    <g data-traffic-lane={lane} ref={root}>
      {order.map((a) => {
        const ev = a.event ? eventsByKey.get(a.event) : undefined;
        const half = a.car ? a.car.L / 2 : (SPRITE_HALF[a.kind] ?? 20);
        const look = paintedLook(a, ghibli);
        const painted = look !== null;
        const dir = TRACK_DIR[a.track];
        return (
          <g key={a.id} data-life-id={a.id} data-vehicle="" data-kind={a.kind} data-lane={a.track} data-active="true" transform={transformOf(w, a, metrics, now, painted)}>
            {look ? (
              <>
                <GhibliCar look={look} dir={dir} sky={sky} rainy={rainy} lights={lights} still={still} />
                {a.special?.id === 'bus' && <BusMarquee dir={dir} msg={marqueeText(w, a, marqueeState(a))} state={marqueeState(a)} />}
              </>
            ) : ev ? (
              <CityEventSprite event={ev} sky={sky} still={still} lights={lights} rainy={rainy} fests={fests} ghibli={ghibli} />
            ) : ghibli && a.kind === 'bike' ? (
              <GhibliBike outfit={a.rider ?? DEFAULT_RIDER} color={tone(a.color, sky)} ink={tone('#3B3F4A', sky)} sky={sky} rainy={rainy} dir={1} phase={still ? 0 : crankPhase(a.dist / kOf(a, metrics))} lights={lights} stopped={a.v < FOOT_DOWN_V * metrics.unit} />
            ) : (
              <VehicleSprite vehicle={asVehicle(a)} sky={sky} lights={lights} />
            )}
            {!painted && a.kind !== 'bike' && a.kind !== 'delivery-bike' && <circle data-brake="" cx={-half + 1.2} cy={-9} r={1.5} fill="#FF3B2F" opacity={braking(a, w.unit) ? 1 : 0} />}
            {look && a.kind === 'van' && (
              <g data-hazard="" opacity={0} fill="#FFB020">
                <circle cx={look.art.tail.x * dir} cy={look.art.tail.y} r={1.3} />
                <circle cx={look.art.head.x * dir} cy={look.art.head.y} r={1.3} />
              </g>
            )}
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
// Ghibli (G5) : feu et poteau d'arrêt sont des accessoires peints (`traffic-pole`, `bus-stop`) aux mêmes repères, le dessin
// classique en repli tant que l'image n'est pas cuite ; la couleur du feu et l'appel sont alors des arguments de l'image
// (re-rendu à chaque changement, l'image précédente reste affichée le temps de cuire la nouvelle) et restent lisibles
// sur le <g> porteur (`data-light-lamp` = couleur active, `data-call` = appel).
type LightShown = { color: string; pressed: boolean };
const lightShown = (w: TrafficWorld): LightShown => ({ color: w.light?.color ?? 'green', pressed: w.light?.pressedAt != null });
// Panneau « Prochain bus » (afficheur lumineux accroché au poteau, sous la plaque) : ligne et attente en minutes, « à l'approche »
// quand le bus roule déjà vers l'arrêt ou y est arrêté, « Fin de service » la nuit (aucun bus attendu).
type Board = { line: string | null; colour: string; wait: string };
export function nextBusBoard(w: TrafficWorld, served: 'near' | 'far'): Board {
  const n = w.nextBus[served];
  if (!n) return { line: null, colour: '#555', wait: 'Fin de service' };
  const min = Math.ceil(n.in / 60);
  return { line: n.line.ref, colour: n.line.colour, wait: n.in < 45 ? 'à l’approche' : `${min} min` };
}
const BOARD_W = 15;
function NextBusBoard({ x, board }: { x: number; board: Board }): ReactElement {
  return (
    <g data-next-bus={board.line ?? ''} data-next-wait={board.wait} transform={`translate(${x.toFixed(2)} -23.6) scale(1)`}>
      <rect width={BOARD_W} height={6} rx={0.6} fill="#1f1a17" stroke="#3a3430" strokeWidth={0.3} />
      <text x={BOARD_W / 2} y={2.1} fontSize={1.6} fontWeight={700} textAnchor="middle" fill="#ffc94a" fontFamily="sans-serif">PROCHAIN BUS</text>
      {board.line !== null && (
        <>
          <rect x={0.8} y={2.8} width={4.6} height={2.6} rx={0.6} fill={/^#[0-9a-fA-F]{6}$/.test(board.colour) ? board.colour : '#2F7D64'} />
          <text x={3.1} y={4.75} fontSize={1.8} fontWeight={700} textAnchor="middle" fill="#FFFFFF" fontFamily="sans-serif">{board.line}</text>
        </>
      )}
      <text x={board.line !== null ? 10.2 : BOARD_W / 2} y={4.8} fontSize={1.9} fontWeight={700} textAnchor="middle" fill="#ffc94a" fontFamily="sans-serif">{board.wait}</text>
    </g>
  );
}

export function TrafficFixtures({ handle, metrics, sky, still, frozenT, side, ghibli = false }: { handle: TrafficHandle; metrics: CityMetrics; sky: Sky; still: boolean; frozenT: number; side: 'near' | 'far'; ghibli?: boolean }): ReactElement {
  const w = handle.world;
  const u = metrics.unit;
  const t = (c: string): string => tone(c, sky);
  const root = useRef<SVGGElement | null>(null);
  // Nom de l'arrêt et lignes : changent quand les lignes réelles arrivent (roster du moteur).
  const [, setRoster] = useState(w.roster);
  const seen = useRef(w.roster);
  const [light, setLight] = useState<LightShown>(() => lightShown(w));
  const lightSeen = useRef(light);
  // Panneau « Prochain bus » de l'arrêt dessiné ici (ligne et minutes), réécrit quand le texte change.
  const served: 'near' | 'far' = side === 'near' ? 'far' : 'near';
  const [board, setBoard] = useState(() => nextBusBoard(w, served));
  const boardSeen = useRef(board);
  const place = useMemo(
    () => (now: number): void => {
      void now;
      if (w.roster !== seen.current) {
        seen.current = w.roster;
        setRoster(w.roster);
      }
      const b = nextBusBoard(w, served);
      if (b.line !== boardSeen.current.line || b.wait !== boardSeen.current.wait) {
        boardSeen.current = b;
        setBoard(b);
      }
      const el = root.current;
      if (!el) return;
      // Feu des voitures, et petit voyant « appel enregistré » du boîtier à bouton quand un piéton a appuyé.
      const next = lightShown(w);
      if (ghibli) {
        if (next.color !== lightSeen.current.color || next.pressed !== lightSeen.current.pressed) {
          lightSeen.current = next;
          setLight(next);
        }
        return;
      }
      for (const lamp of el.querySelectorAll('[data-light-lamp]')) lamp.setAttribute('opacity', lamp.getAttribute('data-light-lamp') === next.color ? '1' : '0.18');
      for (const led of el.querySelectorAll('[data-call]')) led.setAttribute('opacity', next.pressed ? '1' : '0.15');
    },
    [w, ghibli, served],
  );
  useWallClockLoop(place, [place]);
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);
  // Dessin classique du feu ; en Ghibli (repli), lampe active et voyant à leur opacité d'état (la boucle n'y touche pas).
  const poleArt = (): ReactElement => (
    <>
      <rect x={-0.8} y={-34} width={1.6} height={34} fill={t('#3A3434')} />
      <rect x={-3} y={-46} width={6} height={13} rx={1.6} fill={t('#2A2626')} />
      <circle data-light-lamp="red" cx={0} cy={-42.6} r={1.7} fill="#E0402F" opacity={ghibli && light.color === 'red' ? 1 : 0.18} />
      <circle data-light-lamp="amber" cx={0} cy={-39.4} r={1.7} fill="#F2A33A" opacity={ghibli && light.color === 'amber' ? 1 : 0.18} />
      <circle data-light-lamp="green" cx={0} cy={-36.2} r={1.7} fill="#3FC06A" opacity={ghibli && light.color === 'green' ? 1 : 0.18} />
      {/* Boîtier à bouton-poussoir des piétons, voyant d'appel. */}
      <rect x={0.8} y={-20} width={3.2} height={4.6} rx={0.6} fill={t('#E8C440')} />
      <circle cx={2.4} cy={-17.2} r={0.8} fill={t('#2A2626')} />
      <circle data-call="" cx={2.4} cy={-19} r={0.5} fill="#FF5A3A" opacity={ghibli && light.pressed ? 1 : 0.15} />
    </>
  );
  const pole = (x: number, y: number, flip: boolean): ReactElement =>
    ghibli ? (
      // Jamais de miroir de l'image peinte : l'orientation est un paramètre du peintre (`dir`).
      <g data-light-lamp={light.color} data-call={light.pressed ? 'true' : 'false'} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${u.toFixed(3)})`}>
        <PropImage
          spec={{ id: 'traffic-pole', args: { color: light.color, pressed: light.pressed }, dir: flip ? -1 : 1, day: sky.daylight, lit: sky.daylight < 0.45 }}
          fallback={<g transform={flip ? 'scale(-1 1)' : undefined}>{poleArt()}</g>}
        />
      </g>
    ) : (
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(flip ? -u : u).toFixed(3)} ${u.toFixed(3)})`}>{poleArt()}</g>
    );
  // Poteau d'arrêt : drapeau « BUS », plaque au nom de l'arrêt (lignes réelles ou de repli, voir bus-lines.ts) et pastilles
  // des trois premières lignes à leurs couleurs. La plaque s'ouvre vers l'amont de la voie servie (d'où vient le bus).
  const busStop = (x: number, y: number, served: 'near' | 'far'): ReactElement => {
    const name = w.stopNames[served];
    const refs = w.lines.slice(0, 3);
    const plate = Math.max(12, name.length * 1.6 + 2.4);
    const px = served === 'near' ? -plate + 0.6 : -0.6;
    const art = (
      <>
        <rect x={-0.6} y={-30} width={1.2} height={30} fill={t('#3A3434')} />
        <rect x={-4.2} y={-40} width={8.4} height={7} rx={1} fill={t('#2F7D64')} />
        <text x={0} y={-34.9} fontSize={4} fontWeight={700} textAnchor="middle" fill={t('#F2EFE6')}>BUS</text>
        <rect x={px} y={-33} width={plate} height={4.4} rx={0.6} fill={t('#F2EFE6')} stroke={t('#33241F')} strokeWidth={0.35} />
        <text x={px + plate / 2} y={-29.8} fontSize={2.7} fontWeight={700} textAnchor="middle" fill={t('#2A2622')}>{name}</text>
        {refs.map((l, i) => (
          <g key={i}>
            <rect x={px + 0.4 + i * 5.6} y={-28.2} width={5} height={3.4} rx={0.8} fill={t(l.colour)} />
            <text x={px + 2.9 + i * 5.6} y={-25.6} fontSize={2.4} fontWeight={700} textAnchor="middle" fill={t('#FFFFFF')}>{l.ref}</text>
          </g>
        ))}
      </>
    );
    // Lignes de l'image peinte : « ref:#rrggbb » par ligne (couleur de repli du peintre si la couleur n'est pas hexadécimale).
    const lines = refs.map((l) => `${l.ref.replace(/,/g, ' ')}${/^#[0-9a-fA-F]{6}$/.test(l.colour) ? `:${l.colour}` : ''}`).join(',');
    return (
      <g data-bus-stop={served} data-stop-name={name} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${u.toFixed(3)})`}>
        {ghibli ? <PropImage spec={{ id: 'bus-stop', args: { name, lines, served }, day: sky.daylight }} fallback={art} /> : art}
        <NextBusBoard x={served === 'near' ? -BOARD_W - 1.2 : 1.2} board={board} />
      </g>
    );
  };
  return (
    <g data-traffic-fixtures={side} ref={root}>
      {/* La voie du premier plan (vers la droite) longe le trottoir d'en face, en bas de l'image ; celle du fond, le trottoir du haut. */}
      {side === 'near' ? busStop(w.busStop.far, metrics.curb + 1, 'far') : busStop(w.busStop.near, metrics.farSide, 'near')}
      {/* Chaque feu est à droite de la voie qu'il règle, à sa ligne d'arrêt, donc AVANT le passage pour les voitures qui
          arrivent : voie du fond (vers la gauche) → poteau du trottoir des immeubles, à droite du passage ; voie du premier plan
          (vers la droite) → poteau du trottoir d'en face, à gauche du passage. Boîtier du bouton tourné vers le passage. */}
      {w.light && (side === 'near' ? pole(lightPoleX(w.light.x, 'far', u), metrics.curb + 1, true) : pole(lightPoleX(w.light.x, 'near', u), metrics.farSide, false))}
    </g>
  );
}

// Bandes du passage piéton (sous les voies) : bandes claires empilées du trottoir des immeubles à celui d'en face, un peu
// plus larges vers le bas (plus près du spectateur).
// Ghibli (G5) : une image peinte par bande (`crosswalk-band`, demi-largeur en u entiers, étirée à la largeur exacte de la
// bande) au même pas ; la bande peint sa propre transparence et son ombre.
export function Crosswalk({ handle, metrics, sky, ghibli = false }: { handle: TrafficHandle; metrics: CityMetrics; sky: Sky; ghibli?: boolean }): ReactElement | null {
  const l = handle.world.light;
  if (!l) return null;
  const u = metrics.unit;
  const top = metrics.curb + 2 * u;
  const bottom = metrics.farSide - 2 * u;
  const bars: ReactElement[] = [];
  for (let y = top, i = 0; y < bottom - 2 * u; y += 6 * u, i++) {
    const half = CROSS_HALF * u * (0.92 + 0.16 * ((y - top) / (bottom - top)));
    if (!ghibli) {
      bars.push(<rect key={i} x={l.x - half} y={y} width={2 * half} height={3 * u} rx={0.6 * u} />);
      continue;
    }
    const h = Math.max(1, Math.round(half / u));
    bars.push(
      <g key={i} transform={`translate(${l.x.toFixed(1)} ${y.toFixed(1)}) scale(${(half / h).toFixed(4)} ${u.toFixed(3)})`}>
        <PropImage spec={{ id: 'crosswalk-band', args: { h }, day: sky.daylight }} fallback={<rect x={-h} y={0} width={2 * h} height={3} rx={0.6} opacity={0.82} />} />
      </g>,
    );
  }
  return (
    <g data-crosswalk="" fill={tone('#F2EFE6', sky)} opacity={ghibli ? 1 : 0.82}>
      {bars}
    </g>
  );
}

// Piétons du passage (crossing.ts, état porté par le moteur) : arrivent par un trottoir, appuient sur le bouton, attendent au
// bord, traversent au rouge des voitures, repartent. Deux parties pour la profondeur (revue du 2026-10-13 : « des gens passent
// devant les voitures ») : `far`, sur le trottoir des immeubles, dessinée derrière les voies (les voitures les cachent) ;
// `near`, sur la chaussée (voitures arrêtées avant le passage) et sur le trottoir d'en face, devant. Re-rendu quand la liste ou
// l'étape d'un piéton change (roster).
type CrossProps = { handle: TrafficHandle; metrics: CityMetrics; sky: Sky; rainy: boolean; still: boolean; ghibli: boolean; frozenT: number };
export type CrossPart = 'far' | 'near';
// Sur le trottoir des immeubles : avant de traverser vers le bas, ou après être monté.
const crossPartOf = (p: Walker): CrossPart => ((p.down && (p.stage === 'approach' || p.stage === 'wait')) || (!p.down && p.stage === 'leave') ? 'far' : 'near');
const YAW = { right: 0, down: 4, left: 8, up: 12 } as const;
export function CrossingLayer({ handle, metrics, sky, rainy, still, ghibli, frozenT, part = 'near' }: CrossProps & { part?: CrossPart }): ReactElement {
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
        if (crossPartOf(p) !== part) continue;
        const node = el.querySelector(`[data-crosser="${p.id}"]`);
        if (!node) continue;
        node.setAttribute('transform', transform(p));
        if (ghibli && !still) poseFigure(figures, node.querySelector(':scope > [data-figure]'), pose(p));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, still, ghibli, figures, top, bottom, part],
  );
  useWallClockLoop(place, [place]);
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);
  return (
    <g data-crossing={part} ref={root}>
      {w.walkers.filter((p) => crossPartOf(p) === part).map((p) => {
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

// Voyageurs des arrêts de bus (bus-stop.ts, état porté par le moteur) : arrivent à pied par un bord, attendent au poteau en
// regardant venir le bus, marchent jusqu'à sa porte avant et montent (petite marche vers la chaussée, derrière la caisse) ;
// d'autres descendent et repartent. Trois parties pour la profondeur : `far` (trottoir des immeubles, derrière la voie du
// fond), `near-step` (montée et descente au premier plan, juste derrière la voie du premier plan), `near` (trottoir d'en face,
// devant). Re-rendu quand la liste ou la partie d'un voyageur change (roster).
export type RiderPart = 'far' | 'near-step' | 'near';
const partOf = (p: Rider): RiderPart | null => (p.stage === 'inside' ? null : p.side === 'far' ? 'far' : p.stage === 'step' || p.stage === 'alight' ? 'near-step' : 'near');
export function BusStopRiders({ handle, metrics, sky, rainy, still, ghibli, frozenT, part }: CrossProps & { part: RiderPart }): ReactElement {
  const w = handle.world;
  const u = metrics.unit;
  const top = metrics.walkY;
  const bottom = metrics.farSide + 5 * u;
  const figures = useFigureRegistry();
  const root = useRef<SVGGElement | null>(null);
  const [, setRoster] = useState(w.roster);
  const view = (p: Rider): { x: number; y: number; yaw: number; k: number; walking: boolean } => {
    const wait = p.side === 'far' ? (metrics.walkY + metrics.curb) / 2 : bottom;
    const lane = p.side === 'far' ? metrics.laneY.far - 3 * u : metrics.laneY.near - 2 * u;
    const y = wait + (lane - wait) * p.step * 0.8;
    const arrived = Math.abs(p.target - p.x) < 0.5;
    // Orientation (16 directions : 0 vers la droite, 4 face à nous, 8 vers la gauche, 12 de dos) : en marche, vers la cible ;
    // à l'attente, vers la chaussée et le côté d'où vient le bus ; sur la marche du bus, vers lui (montée) ou vers nous (descente).
    const yaw = p.stage === 'step' ? (p.side === 'near' ? 12 : 4) : p.stage === 'alight' ? (p.side === 'near' ? 4 : 12) : !arrived ? (p.target > p.x ? 0 : 8) : p.side === 'near' ? 10 : 2;
    return { x: p.x, y, yaw, k: u * STREET_SCALE.person * (1 + 0.12 * ((y - top) / (bottom - top))), walking: p.stage === 'step' || p.stage === 'alight' || !arrived };
  };
  const transform = (p: Rider): string => {
    const v = view(p);
    const mirror = !ghibli && v.yaw > 4 && v.yaw < 12 ? -1 : 1;
    return `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${(mirror * v.k).toFixed(3)} ${v.k.toFixed(3)})`;
  };
  const pose = (p: Rider) => {
    const v = view(p);
    return { yaw: v.yaw, gait: v.walking ? ('walk' as const) : ('stand' as const), phase: v.walking ? phaseIndexOf((p.walked + p.step * 14 * u) / v.k) : 0, head: 0 };
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
      for (const p of w.stopCrowd.riders) {
        if (partOf(p) !== part) continue;
        const node = el.querySelector(`[data-rider="${p.id}"]`);
        if (!node) continue;
        node.setAttribute('transform', transform(p));
        if (ghibli && !still) poseFigure(figures, node.querySelector(':scope > [data-figure]'), pose(p));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, still, ghibli, figures, top, bottom, part],
  );
  useWallClockLoop(place, [place]);
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);
  // Profondeur : du plus loin (haut) au plus près (bas).
  const mine = w.stopCrowd.riders.filter((p) => partOf(p) === part).sort((a, b) => view(a).y - view(b).y);
  return (
    <g data-bus-riders={part} ref={root}>
      {mine.map((p) => {
        const outfit = outfitFor('ordinary', mulberry32(Math.floor(p.u * 1e9)));
        return (
          <g key={p.id} data-rider={p.id} data-stage={p.stage} transform={transform(p)}>
            {ghibli ? <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={pose(p)} /> : <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />}
          </g>
        );
      })}
    </g>
  );
}
