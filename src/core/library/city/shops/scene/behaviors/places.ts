import { HALF, PLACE, TIGHT, blockSpan, disjoint, standZones } from '../stage';
import { atDepth, depth, idleNow, walkTo, type Act, type Actor, type PartyRt, type World } from '../engine';

// Places des clients (G4b) : qui est dedans, où se tient un groupe, file, places debout libres, employé disponible.
// Règle de chevauchement : deux clients IMMOBILES (en file, servis, au rayon, au tabouret, attablés) ne se chevauchent
// jamais ; un client qui MARCHE (segment `walk`) peut passer devant un client immobile — le rendu le dessine devant avec un
// léger décalage de profondeur. On n'entre pas pendant qu'un autre sort (embrasure de la porte).
const INSIDE: ReadonlySet<PartyRt['state']> = new Set(['browse', 'queue', 'served', 'spot', 'stay', 'bill', 'seated', 'ordered', 'eating', 'done', 'waiting', 'leaving']);
export const inside = (p: PartyRt): boolean => INSIDE.has(p.state);
// Parti en train de sortir (ou dont un membre n'a pas encore franchi la porte).
export const outgoing = (p: PartyRt, t: number): boolean => p.state === 'leaving' || (p.state === 'gone' && p.actors.some((a) => a.active || (a.track.exit ?? -1) > t));
export const browseLike = (w: World): boolean => w.family === 'browse' || w.family === 'till';
export const queued = (w: World): boolean => w.family === 'counter' || browseLike(w) || (w.family === 'machine' && w.type !== 'laundry');

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
// Place occupée : un client d'un autre parti s'y tient encore, ou s'y rend (x = fin de son geste en cours).
export function placeTaken(w: World, party: PartyRt, anchorX: number): boolean {
  const [lo, hi] = blockSpan(depth(w, anchorX), party.actors.length);
  return w.parties.some((o) => o !== party && o.actors.some((a) => a.active && depth(w, a.x) > lo - HALF + 1e-9 && depth(w, a.x) < hi + HALF - 1e-9));
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
  // Le meneur prend la plus profonde de ses places (les autres se serrent vers la porte, dans les places suivantes ou
  // précédentes selon que la file part vers la porte ou vers le fond).
  const mine = q.slice(Math.min(i, q.length - 1), i + consume(party.actors.length));
  return mine.reduce((a, b) => (depth(w, b) > depth(w, a) ? b : a));
}
// Place qu'il prendrait s'il entrait maintenant dans la file.
export function queueAnchorIf(w: World, party: PartyRt): number {
  w.queue.push(party);
  const x = queueAnchor(w, party);
  w.queue.pop();
  return x;
}
// Sans place de file (comptoir tout près de la porte), on attend son tour au comptoir même, quand personne n'y est servi.
export const queueRoom = (w: World, party: PartyRt): boolean => {
  if (w.stage.queue.length === 0) return w.queue.length === 0 && !w.parties.some((p) => p.service?.kind === 'serve');
  return w.queue.reduce((s, p) => s + consume(p.actors.length), 0) + consume(party.actors.length) <= w.stage.queue.length;
};
// Places debout de la famille (rayons, tabourets, sièges, fauteuils, machines).
export const placesOf = (w: World): number[] => (w.family === 'table' ? w.stage.tables.flatMap((t) => t.seats) : w.family === 'chair' ? w.stage.chairs : w.stage.spots);
// Place libre pour ce groupe : hors des zones de service et de file, et loin de tout autre groupe arrêté à sa place.
function spotFree(w: World, party: PartyRt, x: number): boolean {
  const mine = blockSpan(depth(w, x), party.actors.length);
  if (!standZones(w.stage, w.type).every((z) => disjoint(mine, z))) return false;
  return w.parties.every((o) => o === party || o.spot === null || !inside(o) || disjoint(mine, blockSpan(depth(w, o.spot), o.actors.length)));
}
export const freeSpots = (w: World, party: PartyRt): number[] => placesOf(w).filter((x) => spotFree(w, party, x));
// Un employé pourra servir : présent, ou en réserve, assez longtemps.
export const staffAvailable = (w: World, margin = 45): boolean => w.staff.some((s) => s.staff!.state !== 'gone' && s.deadline - w.t >= margin && (s.staff!.state === 'floor' || s.staff!.reserve || s.staff!.present[0] <= w.t + 5));
