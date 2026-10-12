import { HALF, PASS_W, PLACE, TIGHT } from '../stage';
import { atDepth, depth, idleNow, walkTo, type Act, type Actor, type PartyRt, type World } from '../engine';

// Places des clients (G4b) : qui est dedans, où se tient un groupe, file, places debout libres, employé disponible. Une
// vitrine étroite ne se traverse pas : un parti à la fois (les suivants attendent dehors, devant la porte).
const INSIDE: ReadonlySet<PartyRt['state']> = new Set(['browse', 'queue', 'served', 'spot', 'stay', 'bill', 'leaving']);
export const inside = (p: PartyRt): boolean => INSIDE.has(p.state);
// Parti en train de sortir (ou dont un membre n'a pas encore franchi la porte).
export const outgoing = (p: PartyRt, t: number): boolean => p.state === 'leaving' || (p.state === 'gone' && p.actors.some((a) => a.active || (a.track.exit ?? -1) > t));
export const browseLike = (w: World): boolean => w.family === 'browse' || w.family === 'till';
export const queued = (w: World): boolean => w.family === 'counter' || browseLike(w) || (w.family === 'machine' && w.type !== 'laundry');
export const singleFile = (w: World): boolean => w.stage.w < PASS_W;

// Places du groupe autour de `anchorX` : le meneur au plus profond, les autres serrés vers la porte.
export function blockXs(w: World, party: PartyRt, anchorX: number): number[] {
  const n = party.actors.length;
  const dA = Math.min(w.stage.w - HALF, Math.max(depth(w, anchorX), HALF + (n - 1) * TIGHT));
  return party.actors.map((_, k) => atDepth(w, dA - k * TIGHT));
}
export const partyIdle = (w: World, party: PartyRt): boolean => party.actors.every((a) => idleNow(a, w.t));
// Marche du groupe jusqu'à ses places, puis orientation commune.
export function partyWalk(w: World, party: PartyRt, anchorX: number, yaw?: number): [Actor, Act[]][] {
  const xs = blockXs(w, party, anchorX);
  return party.actors.map((a, k) => [a, [walkTo(xs[k]!), ...(yaw === undefined ? [] : [{ move: 'turn' as const, yaw }])]]);
}
export const atPlace = (w: World, party: PartyRt, anchorX: number): boolean => Math.abs(party.actors[0]!.x - blockXs(w, party, anchorX)[0]!) < 0.05;
// Le client servi se tient une demi-silhouette côté porte du vendeur.
export const serveX = (w: World, post: number): number => atDepth(w, Math.max(HALF, depth(w, post) - HALF));
// Places de file prises par un groupe de `n`.
const consume = (n: number): number => 1 + Math.ceil(((n - 1) * TIGHT) / PLACE);
export function queueAnchor(w: World, party: PartyRt): number {
  const q = w.stage.queue;
  if (q.length === 0) return serveX(w, w.stage.posts[0]!);
  let i = 0;
  for (const p of w.queue) {
    if (p === party) break;
    i += consume(p.actors.length);
  }
  return q[Math.min(i, q.length - 1)]!;
}
// Sans place de file (comptoir tout près de la porte), on attend son tour au comptoir même, quand personne n'y est servi.
export const queueRoom = (w: World, party: PartyRt): boolean => {
  if (singleFile(w)) return true;
  if (w.stage.queue.length === 0) return w.queue.length === 0 && !w.parties.some((p) => p.service?.kind === 'serve');
  return w.queue.reduce((s, p) => s + consume(p.actors.length), 0) + consume(party.actors.length) <= w.stage.queue.length;
};
// Places debout de la famille (rayons, tabourets, sièges, fauteuils, machines).
export const placesOf = (w: World): number[] => (w.family === 'table' ? w.stage.tables.flatMap((t) => t.seats) : w.family === 'chair' ? w.stage.chairs : w.stage.spots);
function spotFree(w: World, party: PartyRt, x: number): boolean {
  return w.parties.every((o) => o === party || o.spot === null || !inside(o) ||
    Math.abs(depth(w, o.spot) - depth(w, x)) >= PLACE + (o.actors.length - 1 + party.actors.length - 1) * TIGHT);
}
export const freeSpots = (w: World, party: PartyRt): number[] => placesOf(w).filter((x) => spotFree(w, party, x));
// Un employé pourra servir : présent, ou en réserve, assez longtemps.
export const staffAvailable = (w: World, margin = 45): boolean => w.staff.some((s) => s.staff!.state !== 'gone' && s.deadline - w.t >= margin && (s.staff!.state === 'floor' || s.staff!.reserve || s.staff!.present[0] <= w.t + 5));
