// Mouvement des occupants d'une voiture (spec véhicules §1, « occupants en mouvement logique ») : portage de occupantMotion
// de la maquette. Pur : tout se tire de la graine et du temps. Inertie (buste en avant au freinage, en arrière à
// l'accélération, lue sur `lean` du moteur), tête qui suit les pavés en roulant, regards : à l'arrêt le conducteur se tourne
// vers le passager ou l'arrière, coup d'œil au rétroviseur ; les passagers regardent devant, vers le conducteur, dehors, et
// hochent la tête en parlant. L'indice de tête (sprite du pantin, −4…4) est tiré au quart de seconde : au plus 4 changements
// de sprite par seconde ; le reste (inclinaison, buste, volant) est continu (transform).
import type { Occupant } from './cars';

export type OccupantPose = { head: number; tilt: number; dx: number; dy: number; wheel: number };
const frac = (x: number): number => x - Math.floor(x);
const ROLE_N: Record<Occupant['role'], number> = { driver: 0, front: 1, rear: 2 };

export function occupantPose(o: { role: Occupant['role']; seed: number; t: number; v: number; dist: number; lean: number; unit: number }): OccupantPose {
  const role = ROLE_N[o.role];
  const s = (o.seed % 100003) * 13.7 + role * 5.3;
  const tq = Math.floor(o.t * 4) / 4;
  const phase = frac(tq * (0.18 + frac(s) * 0.1) + s);
  const moving = Math.min(1, o.v / (30 * o.unit));
  const dx = o.lean * 0.9;
  const dy = o.v > 0 ? Math.sin((o.dist / o.unit) * 0.13 + role) * 0.25 * moving : 0;
  let head = 0;
  let tilt = 0;
  if (role === 0) {
    const slow = o.v < 1.5 * o.unit;
    if (slow && phase < 0.18) head = phase < 0.09 ? 4 : 3;
    else if (phase > 0.55 && phase < 0.62) {
      head = 1;
      tilt = 0.25;
    }
  } else if (phase < 0.35) head = 0;
  else if (phase < 0.5) head = 2;
  else if (phase < 0.6) head = -2;
  else tilt = Math.sin(o.t * 2 + s) * 0.08;
  return { head, tilt, dx: dx === 0 ? 0 : dx, dy, wheel: Math.sin(o.t * 0.9 + s) * 0.15 * Math.min(1, o.v / (20 * o.unit)) };
}
