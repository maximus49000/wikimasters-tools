import { PHASES, STRIDE, YAWS } from './skeleton';

// Allure du pantin : orientation (indice 0–15, pas de 22,5°) et image de marche (0–11) tirées du déplacement réel.
// La phase suit la distance parcourue (unités du pantin) : les pieds ne glissent pas, quelle que soit la vitesse.
export const YAW_RIGHT = 0;
export const YAW_FRONT = 4;
export const YAW_LEFT = 8;
export const YAW_BACK = 12;
// Durée d'un demi-tour (s) : 0,4 s environ, petits pas sur place.
export const TURN_S = 0.45;

const mod = (a: number, n: number): number => ((a % n) + n) % n;
export const facingYaw = (dir: 1 | -1): number => (dir > 0 ? YAW_RIGHT : YAW_LEFT);
export const phaseIndexOf = (distanceUnits: number): number => mod(Math.floor((distanceUnits / STRIDE) * PHASES + 1e-9), PHASES);

// Écart signé le plus court de a vers b (indices).
const delta = (a: number, b: number): number => {
  const d = mod(b - a, YAWS);
  return d > YAWS / 2 ? d - YAWS : d;
};

// Orientation à l'avancement p ∈ [0, 1] d'un demi-tour de `from` à `to`, en passant par `via` s'il est donné.
export function turnYaw(from: number, to: number, p: number, via?: number): number {
  const t = Math.min(1, Math.max(0, p));
  const legs = via === undefined ? [[from, to]] : [[from, via], [via, to]];
  const lens = legs.map(([a, b]) => Math.abs(delta(a!, b!)));
  const total = lens.reduce((s, x) => s + x, 0);
  if (total === 0) return mod(to, YAWS);
  let walked = t * total;
  for (let i = 0; i < legs.length; i++) {
    const [a, b] = legs[i]!;
    if (walked <= lens[i]! || i === legs.length - 1) return mod(Math.round(a! + Math.sign(delta(a!, b!)) * Math.min(walked, lens[i]!)), YAWS);
    walked -= lens[i]!;
  }
  return mod(to, YAWS);
}

// Orientation d'un déplacement dans le plan du sol : dx vers la droite, dz vers le spectateur.
export const yawToward = (dx: number, dz: number): number => mod(Math.round(Math.atan2(dz, dx) / (Math.PI / 8)), YAWS);
