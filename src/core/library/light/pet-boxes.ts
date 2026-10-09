import type { Layout, Species } from '../library-types';
import type { PetFrame, Pose } from '../pets/runner';
import { hostOf, kOf, supportOf, type Box, type Geom } from './occluders';

export type Shape = 'stand' | 'sit' | 'lie' | 'none';

// Silhouette de chaque pose. « cachée » = dans le panier ou la niche, qui sont déjà des meubles.
const SHAPE: Record<Pose, Shape> = {
  walk: 'stand', jump: 'stand', greet: 'stand', play: 'stand', sniff: 'stand', eat: 'stand', hiss: 'stand', scan: 'stand', beep: 'stand',
  sit: 'sit', groom: 'sit', yawn: 'sit', scratch: 'sit', purr: 'sit', pant: 'sit', howl: 'sit', shake: 'sit', umbrella: 'sit', shortcircuit: 'sit', reboot: 'sit',
  sleep: 'lie', stretch: 'lie', cower: 'lie', standby: 'lie', charge: 'lie',
  hide: 'none',
};
export const shapeOf = (pose: Pose): Shape => SHAPE[pose];

// [x0, x1, z0, z1, demi-profondeur], en px depuis les pieds au centre ; +x = avant (sens du regard).
type Part = readonly [x0: number, x1: number, z0: number, z1: number, hd: number];
type Parts = Record<Exclude<Shape, 'none'>, readonly Part[]>;

const CAT: Parts = {
  stand: [[-16, 16, 6, 24, 9], [14, 26, 14, 34, 7], [-24, -15, 10, 36, 3]],
  sit: [[-9, 9, 0, 22, 9], [-2, 10, 20, 34, 8], [-16, -9, 0, 6, 3]],
  lie: [[-17, 15, 0, 12, 9], [12, 22, 0, 10, 7], [-26, -17, 0, 4, 3]],
};
const DOG: Parts = {
  stand: [[-19, 19, 8, 26, 11], [17, 30, 16, 36, 7], [-27, -19, 18, 32, 3]],
  sit: [[-13, 6, 0, 26, 10], [0, 12, 24, 38, 7], [-22, -13, 0, 8, 3]],
  lie: [[-20, 18, 0, 13, 10], [16, 28, 0, 11, 7], [-28, -20, 0, 4, 3]],
};
// Robot : châssis large et bas (le dos reste à 26 px, le chat s'y couche), antenne très fine ; ni tête ni queue.
const ROBOT_PARTS: readonly Part[] = [[-14, 14, 0, 26, 11], [-1, 1, 26, 40, 1]];
const ROBOT: Parts = { stand: ROBOT_PARTS, sit: ROBOT_PARTS, lie: ROBOT_PARTS };
const PARTS: Record<Species, Parts> = { cat: CAT, dog: DOG, robot: ROBOT };

// Profondeur du bord des pieds → d (même inversion que le bas du rectangle écran d'un meuble).
const dOf = (y: number, g: Geom): number => Math.max(0, (y - g.wallH) / kOf(g));

export function petBoxesOf(frames: readonly PetFrame[], layout: Layout, geom: Geom): Box[] {
  const out: Box[] = [];
  for (const f of frames) {
    const shape = shapeOf(f.pose);
    if (shape === 'none') continue;
    // Sur un bureau ou une étagère : posé sur le dessus, au milieu du support.
    // Sur un autre meuble (assise, table basse) : au milieu du support, à la hauteur d'assise (y écran = wallH + d·k − z).
    // Sinon au sol, levé de depthY − pos.y.
    const host = f.top && f.on ? hostOf(layout, f.on, geom) : null;
    const seat = !host && f.on ? supportOf(layout, f.on, geom) : null;
    const dSeat = seat ? seat.dFront - 0.5 * seat.D : 0;
    const dC = host ? host.dFront - 0.5 * host.D : seat ? dSeat : dOf(f.depthY, geom);
    const lift = host ? host.r.h : seat ? Math.max(0, geom.wallH + dSeat * kOf(geom) - f.pos.y) : Math.max(0, f.depthY - f.pos.y);
    const sign = f.facing === 'r' ? 1 : -1;
    for (const [x0, x1, z0, z1, hd] of PARTS[f.species][shape]) {
      const a = f.pos.x + sign * x0;
      const b = f.pos.x + sign * x1;
      out.push({
        owner: f.id,
        x0: Math.min(a, b), x1: Math.max(a, b),
        d0: Math.max(0, dC - hd), d1: dC + hd,
        z0: lift + z0, z1: lift + z1,
      });
    }
  }
  return out;
}
