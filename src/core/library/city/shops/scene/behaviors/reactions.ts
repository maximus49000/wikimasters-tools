import { TURN_S } from '../../../../figure/gait';
import { HALF, PLACE } from '../stage';
import { STEP } from '../slots';
import {
  SPEED, atDepth, cast, gest, idleNow, say, walkTo, yawCounter, yawToDoor,
  type Act, type Actor, type PartyRt, type World,
} from '../engine';
import { atPlace, inside, partyIdle, partyWalk, placeTaken } from './places';

// Réactions à la rue (G4b, spec §3.5), d'après l'état de la rue du créneau (street.ts) : averse (le client qui sortait
// attend dans l'embrasure que ça passe, sauf s'il a son parapluie), défilé (un employé libre et les clients qui flânent ou
// séjournent vont regarder à la vitrine), passage du bus (les acteurs libres tournent la tête une seconde). Les klaxons ne
// sont pas connus au calcul du créneau : le rendu les joue en surcouche (tâche 10). Rue vide : aucun tirage, aucun effet.

// Attente au plus après le début de l'averse (s) ; défilé sans fin connue : temps pendant lequel il attire les regards (s).
const RAIN_WAIT = 20;
const PARADE_S = 60;
// Tourné vers la rue (comme `look-window`).
const YAW_STREET = 4;

const watchable = (p: PartyRt): boolean => (p.state === 'browse' || p.state === 'stay') && !p.service;
const homeYaw = (w: World): number => (w.family === 'drink' ? yawCounter(w) : 12);
// Fin du défilé (exclue, s du créneau) : dernier instant actif + 1 s, sinon PARADE_S après son début.
const paradeEnd = (w: World): number => {
  const { paradeFrom: from, paradeTo: to } = w.street;
  return to !== null && to !== undefined ? to + 1 : from! + PARADE_S;
};
const paradeOn = (w: World): boolean => {
  const from = w.street.paradeFrom;
  return from !== null && w.t >= from && w.t < Math.min(paradeEnd(w), w.closing);
};
// Place de l'employé à la vitrine : la plus profonde (les clients prennent d'abord celle près de la porte).
const staffWindow = (w: World): number => w.stage.window[w.stage.window.length - 1]!;

// Averse : parti sortant, au complet et libre, entré AVANT le début de l'averse (celui qui est entré sous la pluie le
// sait). Il attend dans l'embrasure (dedans) jusqu'à rainFrom + RAIN_WAIT, jamais au-delà de l'échéance de fermeture.
// Un parti resté dehors (renoncé à la porte : jamais entré) n'est pas concerné. Rend vrai tant qu'il attend.
export function rainHold(w: World, party: PartyRt, a: Actor): boolean {
  const { rainFrom, umbrellas } = w.street;
  if (rainFrom === null || umbrellas || w.t < rainFrom) return false;
  const entered = party.actors[0]!.track.enter;
  if (!inside(party) || entered === null || entered > w.t || entered >= rainFrom) return false;
  if (w.t >= Math.min(rainFrom + RAIN_WAIT, w.force)) {
    party.flags.delete('rain-wait');
    return false;
  }
  if (!party.flags.has('rain-wait')) {
    party.flags.add('rain-wait');
    say(w, `${party.desc} attend que l'averse passe`);
    const door = atDepth(w, HALF);
    const turnOnly = party.actors.map((m): [Actor, Act[]] => [m, [{ move: 'turn', yaw: yawToDoor(w) }]]);
    cast(placeTaken(w, party, door) ? turnOnly : partyWalk(w, party, door, yawToDoor(w)));
  }
  a.fill = 'wait-rain';
  return true;
}

// Défilé, meneur d'un parti : aller à la vitrine, regarder, puis revenir à sa place (restée à lui) quand le défilé
// n'attire plus, à la fin de son séjour ou à l'approche de la fermeture. Rend vrai s'il s'en occupe (pas d'autre décision).
export function paradeReact(w: World, party: PartyRt, a: Actor): boolean {
  if (party.watch !== undefined) return watching(w, party, a);
  if (!paradeOn(w) || !watchable(party) || party.holding || party.spot === null || party.flags.has('asking') || party.flags.has('parade')) return false;
  if (party.state === 'stay' && w.t >= party.until - 10) return false;
  if (!partyIdle(w, party) || !atPlace(w, party, party.spot)) return false;
  const staffAt = w.staff.some((s) => s.active && s.staff!.watching && !s.staff!.service) ? staffWindow(w) : null;
  const win = w.stage.window.find((x) => !placeTaken(w, party, x) && (staffAt === null || Math.abs(staffAt - x) >= PLACE));
  if (win === undefined) return false;
  party.flags.add('parade');
  party.watch = Math.min(w.t + 20 + w.rng() * 15, paradeEnd(w), w.closing);
  say(w, `${party.desc} regarde le défilé`);
  cast(partyWalk(w, party, win, YAW_STREET));
  return true;
}

function watching(w: World, party: PartyRt, a: Actor): boolean {
  const end = Math.min(party.watch!, party.state === 'stay' ? party.until : Infinity);
  if (watchable(party) && w.t < end) {
    if (idleNow(a, w.t)) cast([[a, [gest('look-street', { yaw: YAW_STREET })]]]);
    return true;
  }
  party.watch = -Infinity; // fini : les accompagnants ne regardent plus
  if (watchable(party) && party.spot !== null && !atPlace(w, party, party.spot)) {
    if (partyIdle(w, party)) cast(partyWalk(w, party, party.spot, homeYaw(w)));
    return true;
  }
  delete party.watch;
  return false;
}

// Accompagnant d'un parti qui regarde le défilé : regarde aussi (au plus 5 s, puis libre : le meneur peut bouger le groupe).
export function paradeFollow(w: World, a: Actor): boolean {
  const party = a.party!;
  if (party.watch === undefined || w.t >= party.watch || !watchable(party)) return false;
  if (w.t >= a.rest) {
    a.rest = w.t + 7;
    cast([[a, [gest('look-street', { yaw: YAW_STREET })]]]);
  }
  return true;
}

// Défilé, employé libre (sans service, rien d'autre à faire) : un seul à la fois va à la vitrine et regarde ; geste
// interruptible (un client qui attend passe avant). Rend vrai s'il y va.
export function staffParade(w: World, s: Actor): boolean {
  const m = s.staff!;
  const x = staffWindow(w);
  const other = w.staff.some((o) => o !== s && o.active && o.staff!.watching && !o.staff!.service);
  const crowded = w.parties.some((p) => p.watch !== undefined && p.actors.some((c) => c.active && Math.abs(c.x - x) < PLACE));
  const trip = (2 * Math.abs(x - s.x)) / SPEED + 3 * TURN_S;
  if (!paradeOn(w) || other || crowded || w.t + trip + 5 >= s.deadline) {
    m.watching = false;
    return false;
  }
  if (!m.watching) say(w, `${m.label} regarde le défilé`);
  m.watching = true;
  cast([[s, [walkTo(x, { soft: true }), gest('look-street', { yaw: YAW_STREET, soft: true })]]]);
  return true;
}

// Passage d'un bus pendant ce pas : chaque acteur libre (hors service, hors sortie, loin de son échéance) tourne la tête.
export function busGlance(w: World, actors: readonly Actor[]): void {
  if (!w.street.busAt.some((b) => b >= w.t - 1e-9 && b < w.t + STEP - 1e-9)) return;
  let n = 0;
  for (const a of actors) {
    if (!a.active || !idleNow(a, w.t) || a.staff?.service || a.party?.service || w.t >= a.deadline - 2) continue;
    if (a.staff && a.staff.state !== 'floor') continue;
    if (a.party && (a.party.state === 'leaving' || a.party.state === 'gone')) continue;
    cast([[a, [gest('head-turn', { dur: 1 })]]]);
    n++;
  }
  if (n > 0) say(w, n > 1 ? 'le bus passe — on tourne la tête' : 'le bus passe — un regard');
}
