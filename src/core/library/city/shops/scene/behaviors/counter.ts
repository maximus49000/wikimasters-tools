import { HALF, PLACE } from '../stage';
import { atDepth, depth, gest, walkTo, weighted, yawCounter, yawStaff, yawToward, type Act, type Actor, type Beat, type PartyRt, type Service, type World } from '../engine';
import { MOVES } from '../moves';
import { counterSignature, fetchesItself } from '../signatures';
import { childOf } from './group';
import { browseLike, partyWalk, serveX } from './places';
import { payActs } from './service';

// Comptoir, caisse, rayon (G4b) : le squelette joué au poste. Salut → demande → prise (l'employé va à l'étagère ; au rayon,
// le client pose l'article) → étapes signature du métier (signatures.ts : pesée, dégustation, essai de montures…) → passage
// en caisse (rayon) → paiement → remise → au revoir (→ bavardage du bavard). Vélos : l'employé examine, rien n'est remis.

type Pair = [Actor, Act[]];
const B = (pairs: Pair[], log?: string): Beat => ({ acts: pairs.filter(([, acts]) => acts.length > 0), ...(log ? { log } : {}) });
const SKIP: Beat = { acts: [] };
const turn = (yaw: number): Act => ({ move: 'turn', yaw });
const bikes = (w: World): boolean => w.family === 'machine';
// Comptoir en face de cette place (tabourets) : l'employé sert par-dessus ; sinon (mange-debout) il vient à côté.
const overCounter = (w: World, x: number): boolean => !!w.stage.counter && x >= w.stage.counter.x0 - 1e-9 && x <= w.stage.counter.x1 + 1e-9;
const facing = (w: World, s: Actor, x: number): number => (overCounter(w, x) ? yawStaff(w) : yawToward(s.x, x));

export function askBeat(w: World, s: Actor, party: PartyRt): Beat {
  const L = party.actors[0]!;
  const c = party.p.character;
  const yawS = facing(w, s, L.x);
  if (c === 'regular') return B([[s, [gest('nod', { yaw: yawS })]], [L, [gest('nod')]]], `habitué : ${s.staff!.label} prépare sans qu'il ait à parler`);
  // Indécis pressé par la file : il désigne aussitôt, gestes au plus court.
  if (c === 'undecided' && (party.flags.has('quick') || w.queue.length >= 2 || w.t >= w.closing)) {
    return B([[L, [gest('point-item', { dur: MOVES['point-item'].dur[0] })]], [s, [gest('nod', { dur: MOVES.nod.dur[0] })]]], `${party.desc} se décide vite`);
  }
  if (c === 'undecided') return B([[L, [gest('chin-think'), gest('change-mind')]], [s, [gest('listen')]]], `${party.desc} désigne, se ravise, redésigne`);
  if (c === 'rushed') return B([[L, [gest('point-item')]], [s, [gest('nod')]]]);
  if (c === 'lost') return B([[L, [gest('ask-way')]], [s, [gest('listen')]]]);
  const child = childOf(party);
  const pairs: Pair[] = [[L, [gest(weighted(w, [['ask', 2], ['point-item', 1]] as const))]], [s, [gest('listen')]]];
  if (child && w.rng() < 0.35) pairs.push([child, [gest('child-point')]]);
  return B(pairs);
}

// Temps 0-3 : approche, salut, demande, prise. Les étapes signature sont compilées à la prise (tirages au sort faits une fois).
function openBeat(w: World, svc: Service, p: number): Beat {
  const { staff: s, party } = svc;
  const L = party.actors[0]!;
  const post = s.staff!.post;
  const yawS = yawStaff(w);
  switch (p) {
    case 0: return B([...partyWalk(w, party, serveX(w, post), yawCounter(w)), [s, [walkTo(post), turn(yawS)]]]);
    case 1: return B([[s, [gest(party.p.character === 'regular' ? 'nod' : 'greet', { yaw: yawS })]], [L, [gest(party.p.character === 'rushed' ? 'nod' : 'greet', { yaw: yawCounter(w) })]]]);
    case 2: return askBeat(w, s, party);
    default: {
      if (bikes(w)) return B([[s, [gest('prepare', { dur: 5 + w.rng() * 5 })]]], `${s.staff!.label} examine le vélo`);
      svc.steps = counterSignature(w, s, L);
      if (browseLike(w)) return B([[L, [gest('put-down')]]]);
      if (fetchesItself(w)) return SKIP;
      const shelf = atDepth(w, Math.min(w.stage.w - HALF, depth(w, post) + PLACE * 0.8));
      const wait: Act[] = party.incidents.delete('phone-ring') ? [gest('phone-ring')] : party.p.character === 'chatty' && w.rng() < 0.5 ? [gest('chat', { dur: 4 })] : [];
      return B([[s, [walkTo(shelf), gest('fetch', { yaw: 12 }), walkTo(post), turn(yawS)]], [L, wait]]);
    }
  }
}

// Après la signature : passage en caisse (rayon), paiement, remise, au revoir, bavardage du bavard.
function closeBeat(w: World, svc: Service, q: number): Beat | null {
  const { staff: s, party } = svc;
  const L = party.actors[0]!;
  const yawS = yawStaff(w);
  const closing = w.t >= w.closing;
  switch (q) {
    case 0: return browseLike(w) ? B([[s, [gest('take-item', { yaw: yawS }), gest('prepare', { dur: 5 })]]]) : SKIP;
    case 1: {
      const pay = payActs(w, party);
      return B([[L, pay.acts], [s, [gest('nod')]]], pay.log);
    }
    case 2: return bikes(w) ? SKIP : B([[s, [gest('hand-over')]], [L, [gest('take-item')]]]);
    case 3: {
      const rushed = party.p.character === 'rushed';
      const chatty = party.p.character === 'chatty' && !closing;
      if (chatty) party.until = w.t + 6 + w.rng() * 8;
      return B([[L, rushed ? [] : [gest('wave-bye')]], [s, [gest('nod')]]], rushed ? `${party.desc} repart aussitôt` : chatty ? `${party.desc} reste accoudé à bavarder` : undefined);
    }
    default: {
      if (party.p.character !== 'chatty' || closing || w.t >= party.until || party.flags.has('cut')) return null;
      if (w.queue.length > 0) {
        party.flags.add('cut');
        return B([[s, [gest('beckon-wait')]], [L, [gest('shrug')]]], `${s.staff!.label} fait signe « j'arrive » au suivant — écourte`);
      }
      const dur = 5 + w.rng() * 3;
      return B([[L, [gest('lean-counter', { dur })]], [s, [gest('chat', { dur })]]]);
    }
  }
}

export function serveBeat(w: World, svc: Service, p: number): Beat | null {
  if (p <= 3) return openBeat(w, svc, p);
  const steps = svc.steps ?? [];
  const k = p - 4;
  if (k < steps.length) {
    const st = steps[k]!;
    return B([[svc.staff, st.staff], [svc.party.actors[0]!, st.client]], st.log);
  }
  return closeBeat(w, svc, k - steps.length);
}
