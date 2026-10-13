import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { CityIntensity } from '../core/library/city/intensity';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { EDGE_PAD, pedShown, pedestrianGate, pedestriansFor, type Pedestrian } from '../core/library/city/people';
import { facingYaw, phaseIndexOf } from '../core/library/figure/gait';
import { hashString, loopX } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite } from './city-sprites';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure } from './figure/ghibli-figure';
import type { TrafficHandle } from './traffic-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Trottoir d'en face (revue du 2026-10-13 : « plus de passants sur l'autre trottoir, sans cacher la ville ») : des passants
// ordinaires longent le trottoir du bas, devant la chaussée. Seulement des personnes (rien de haut ni de large qui masquerait
// les façades) ; un peu plus grands que ceux du trottoir des immeubles (plus près du spectateur). Présence selon l'affluence,
// basculée seulement hors champ (personne ne surgit ni ne s'efface dans la rue) ; ils passent devant les voyageurs qui
// attendent à l'arrêt de bus de ce trottoir (pas à travers).

// Un passant pour ~110 px de rue.
const PER_PX = 110;
// Plus près du spectateur que le trottoir des immeubles.
const NEAR_SCALE = 1.12;

export function frontPedestriansFor(width: number, seed: number): Pedestrian[] {
  const n = Math.max(3, Math.round(width / PER_PX));
  return pedestriansFor(width * 1.5, (seed ^ hashString('front-sidewalk')) >>> 0)
    .filter((p) => p.role === 'general')
    .slice(0, n)
    .map((p) => ({ ...p, id: `front-${p.id}` }));
}

type Props = { width: number; seed: number; metrics: CityMetrics; sky: Sky; rainy: boolean; still: boolean; ghibli: boolean; intensity: CityIntensity; handle: TrafficHandle; frozenT: number };

export function FrontSidewalk({ width, seed, metrics, sky, rainy, still, ghibli, intensity, handle, frozenT }: Props): ReactElement {
  const peds = useMemo(() => frontPedestriansFor(width, seed), [width, seed]);
  const figures = useFigureRegistry();
  const root = useRef<SVGGElement | null>(null);
  const shown = useRef(new Map<string, boolean>());
  const u = metrics.unit;
  const kOf = (p: Pedestrian): number => u * STREET_SCALE.person * p.scale * NEAR_SCALE;
  const baseY = (p: Pedestrian): number => metrics.farSide + (3.5 + p.depth * 4) * u;
  // Voyageurs qui attendent à l'arrêt de ce trottoir : on passe devant eux (côté spectateur).
  const footAt = (p: Pedestrian, t: number): { x: number; y: number } => {
    const x = loopX(p.phase, p.dir * p.speed, width, t);
    let y = baseY(p);
    const w = handle.world;
    if (w.stopCrowd.riders.some((r) => r.side === 'near' && (r.stage === 'wait' || r.stage === 'arrive'))) {
      const out = Math.max(0, Math.abs(x - w.busStop.near) - 26 * u);
      const k = Math.max(0, 1 - out / (12 * u));
      const front = metrics.farSide + 9 * u;
      y += Math.max(0, front - y) * k * k * (3 - 2 * k);
    }
    return { x, y };
  };
  const transform = (p: Pedestrian, t: number): string => {
    const { x, y } = footAt(p, t);
    const k = kOf(p);
    return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${((ghibli ? 1 : p.dir) * k).toFixed(3)} ${k.toFixed(3)})`;
  };
  const pose = (p: Pedestrian, t: number) => (still ? { yaw: facingYaw(p.dir), gait: 'stand' as const, phase: 0, head: 0 } : { yaw: facingYaw(p.dir), gait: 'walk' as const, phase: phaseIndexOf((p.phase + p.speed * t) / kOf(p)), head: 0 });
  const wanted = (p: Pedestrian): boolean => p.u < pedestrianGate(p, intensity);
  const place = useMemo(
    () => (now: number): void => {
      const el = root.current;
      if (!el) return;
      const t = still ? frozenT : now;
      for (const p of peds) {
        const node = el.querySelector(`[data-front-ped="${p.id}"]`);
        if (!node) continue;
        const prev = shown.current.get(p.id) ?? wanted(p);
        const next = still ? wanted(p) : pedShown(prev, wanted(p), loopX(p.phase, p.dir * p.speed, width, t), width, EDGE_PAD + 8 * u);
        shown.current.set(p.id, next);
        if (next !== prev) node.setAttribute('visibility', next ? 'visible' : 'hidden');
        const fig = node.querySelector(':scope > [data-figure]');
        if (!next) {
          if (ghibli) hideFigure(figures, fig);
          continue;
        }
        node.setAttribute('transform', transform(p, t));
        if (ghibli) poseFigure(figures, fig, pose(p, t));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peds, still, ghibli, figures, intensity, width, metrics, frozenT],
  );
  useWallClockLoop(place, [place], { enabled: !still });
  useEffect(() => {
    if (still) place(frozenT);
  }, [still, place, frozenT]);
  const t0 = still ? frozenT : Date.now() / 1000;
  // Du plus loin au plus près.
  const ordered = [...peds].sort((a, b) => a.depth - b.depth);
  return (
    <g data-front-sidewalk="" ref={root}>
      {ordered.map((p) => {
        const on = shown.current.get(p.id) ?? wanted(p);
        return (
          <g key={p.id} data-front-ped={p.id} visibility={on ? 'visible' : 'hidden'} transform={transform(p, t0)}>
            {ghibli ? <GhibliFigure outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} initial={pose(p, t0)} hidden={!on} /> : <PersonSprite outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />}
          </g>
        );
      })}
    </g>
  );
}
