import { HALF, PLACE } from './stage';
import { atDepth, depth, yawStaff, yawToward, type Act, type Actor, type Beat, type World } from './engine';

// Petits outils partagés des temps de service (G4b) : construction d'un temps, places derrière le comptoir, orientation
// de l'employé face à un client. Une seule définition pour service.ts, counter.ts, chair.ts, table.ts et signatures.ts.

export type Pair = [Actor, Act[]];
// Un temps : les paires (acteur, actes) non vides, le journal, et les acteurs à attendre en plus de ceux du lot.
export const B = (pairs: Pair[], log?: string, wait?: Actor[]): Beat => ({ acts: pairs.filter(([, a]) => a.length > 0), ...(log ? { log } : {}), ...(wait ? { wait } : {}) });
export const SKIP: Beat = { acts: [] };
export const turn = (yaw: number): Act => ({ move: 'turn', yaw });
export const bikes = (w: World): boolean => w.family === 'machine';
// Place `k` places plus profond que `x` (vers le fond), sans sortir de la vitrine : l'étagère derrière le comptoir (0,8 :
// la prise, les seaux de la fleuriste, la machine du barista), derrière un fauteuil (0,6), à côté d'un client (0,8).
export const inward = (w: World, x: number, k = 0.8): number => atDepth(w, Math.min(w.stage.w - HALF, depth(w, x) + PLACE * k));
// Comptoir en face de cette place (tabourets) : l'employé sert par-dessus ; sinon (mange-debout) il vient à côté.
export const overCounter = (w: World, x: number): boolean => !!w.stage.counter && x >= w.stage.counter.x0 - 1e-9 && x <= w.stage.counter.x1 + 1e-9;
export const facing = (w: World, s: Actor, x: number): number => (overCounter(w, x) ? yawStaff(w) : yawToward(s.x, x));
