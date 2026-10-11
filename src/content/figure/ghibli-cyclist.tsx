// src/content/figure/ghibli-cyclist.tsx
import type { ReactElement } from 'react';
import type { Outfit } from '../../core/library/city/people';
import { rideFrame } from '../../core/library/figure/bake';
import { shapeOf, signatureOf, type Work } from '../../core/library/figure/dress';
import { PHASES } from '../../core/library/figure/skeleton';
import type { Sky } from '../../core/library/sky';
import { GhibliFigure, type PoseIn } from './ghibli-figure';

// Cycliste Ghibli (G3c) : pantin à vélo (allure `pedal`, mains au guidon) posé sur la selle, dans le repère des véhicules
// (roues à y = 0, regard vers +x). Le vélo est dessiné autour du pantin : pédalier au centre du cercle de ses chevilles,
// guidon à ses mains. Le groupe du véhicule est retourné en miroir sur la file du fond (`dir` = −1) : le pantin y est retourné
// une seconde fois et tourné vers la gauche (jamais de pantin en miroir, la lumière reste en haut à gauche).
export const RIDER_SCALE = 0.7;
// Hauteur du pédalier (repère du vélo) : au niveau des moyeux, un peu au-dessus.
const CRANK_Y = -5.6;
// Un tour de pédalier pour 2,2 tours de roue (rayon 5).
export const CRANK_TURN = 2.2 * 2 * Math.PI * 5;
const mod = (a: number, n: number): number => ((a % n) + n) % n;
// Image du pédalier pour une distance parcourue (unités du vélo).
export const crankPhase = (dist: number): number => mod(Math.floor((dist / CRANK_TURN) * PHASES + 1e-9), PHASES);
export const riderPose = (dir: 1 | -1, phase: number): PoseIn => ({ yaw: dir > 0 ? 1 : 7, gait: 'pedal', phase, head: 0, arms: 'handlebar' });

type Geo = { seat: readonly [number, number]; crank: readonly [number, number]; hands: readonly [number, number]; anchor: readonly [number, number] };
const geoCache = new Map<string, Geo>();
// Repères du vélo (repère du véhicule, regard vers +x) pour une selle à `seatX` ; `anchor` : selle du sprite à poser sur `seat`.
function geoOf(sig: string, dir: 1 | -1, seatX: number): Geo {
  const k = `${sig}|${dir}|${seatX}`;
  let g = geoCache.get(k);
  if (!g) {
    // Repères tirés de la vue vers la droite (le pantin tourné vers la gauche, retourné, donne les mêmes).
    const f = rideFrame(sig, 1);
    const s = RIDER_SCALE;
    const seat = [seatX, CRANK_Y - s * (f.crank[1] - f.seat[1])] as const;
    const map = (p: readonly [number, number]): readonly [number, number] => [seat[0] + s * (p[0] - f.seat[0]), seat[1] + s * (p[1] - f.seat[1])];
    g = { seat, crank: map(f.crank), hands: map(f.hands), anchor: rideFrame(sig, dir > 0 ? 1 : 7).seat };
    geoCache.set(k, g);
  }
  return g;
}

// Pantin seul, selle à `seat` (repère du véhicule) : pour un vélo déjà dessiné (vélo porteur).
// `seatY` : hauteur de la selle si le vélo est déjà dessiné (sinon tirée du pédalier, CRANK_Y).
export function GhibliRider({ outfit, sky, rainy, dir, phase, work = 'none', seatX, seatY }: { outfit: Outfit; sky: Sky; rainy: boolean; dir: 1 | -1; phase: number; work?: Work; seatX: number; seatY?: number }): ReactElement {
  const g0 = geoOf(signatureOf(shapeOf(outfit, false, work)), dir, seatX);
  const g = seatY === undefined ? g0 : { ...g0, seat: [seatX, seatY] as const };
  return (
    <g data-bike-rider="" transform={`translate(${g.seat[0]} ${g.seat[1]}) scale(${dir * RIDER_SCALE} ${RIDER_SCALE}) translate(${-g.anchor[0]} ${-g.anchor[1]})`}>
      <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={riderPose(dir, phase)} work={work} />
    </g>
  );
}

// Vélo de ville et son cycliste : roues, cadre en losange autour du pédalier, selle, guidon, phare.
export function GhibliBike({ outfit, color, ink, sky, rainy, dir, phase, lights }: { outfit: Outfit; color: string; ink: string; sky: Sky; rainy: boolean; dir: 1 | -1; phase: number; lights: boolean }): ReactElement {
  const g = geoOf(signatureOf(shapeOf(outfit, false)), dir, -3);
  const [bx, by] = g.crank;
  const rear = [bx - 7.4, -5] as const;
  const front = [bx + 8.2, -5] as const;
  const st = [g.seat[0] + 0.4, g.seat[1] + 2] as const; // haut du tube de selle
  const ht = [g.hands[0] - 1.6, g.hands[1] + 1.8] as const; // haut du tube de direction
  const hb = [ht[0] + 0.9, ht[1] + 3.2] as const;
  const P = (p: readonly [number, number]): string => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  return (
    <g data-ghibli-bike="">
      <g fill="none" stroke={ink} strokeWidth={1.3}>
        <circle cx={rear[0]} cy={rear[1]} r={5} />
        <circle cx={front[0]} cy={front[1]} r={5} />
      </g>
      <g fill="none" stroke={ink} strokeWidth={0.5} opacity={0.6}>
        <circle cx={rear[0]} cy={rear[1]} r={0.8} />
        <circle cx={front[0]} cy={front[1]} r={0.8} />
      </g>
      <path
        d={`M${P(rear)} L${P([bx, by])} L${P(st)} Z M${P([bx, by])} L${P(hb)} M${P(st)} L${P(ht)} L${P(front)} M${P(ht)} L${P(g.hands)}`}
        fill="none"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={`M${P([st[0] - 0.4, st[1]])} L${P([g.seat[0], g.seat[1] + 0.6])}`} stroke={ink} strokeWidth={0.7} />
      <rect x={g.seat[0] - 1.8} y={g.seat[1] + 0.2} width={3.4} height={1} rx={0.5} fill={ink} />
      <circle cx={bx} cy={by} r={1.3} fill="none" stroke={ink} strokeWidth={0.6} />
      <GhibliRider outfit={outfit} sky={sky} rainy={rainy} dir={dir} phase={phase} seatX={-3} />
      {lights && (
        <g data-headlight="">
          <circle cx={ht[0] + 1.4} cy={ht[1]} r={1.4} fill="#FFE9A0" />
          <path d={`M${ht[0] + 1.4} ${ht[1]} L${ht[0] + 16} ${ht[1] + 4} L${ht[0] + 16} ${ht[1] - 4}Z`} fill="#FFE9A0" opacity={0.25} />
        </g>
      )}
    </g>
  );
}
