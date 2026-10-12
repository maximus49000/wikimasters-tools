import type { ShopTypeId } from '../catalog';
import { HALF, PLACE } from './stage';
import { inward, turn } from './beats';
import { MOVES, type MoveId, type PictoId, type PropId } from './moves';
import { atDepth, depth, gest, walkTo, yawStaff, yawToward, type Act, type Actor, type World } from './engine';

// Étapes signature des métiers (G4b-3) : le geste propre à chaque commerce, greffé dans le squelette de sa famille entre la
// « demande » et la « remise » (comptoir, caisse, rayon : counter.ts ; bar et café : service.ts, à la place de la prise au
// comptoir ; fauteuils : chair.ts, entre l'installation et le paiement). Une étape = un temps du service : le geste de
// l'employé et celui du client partent ensemble, le temps suivant quand les deux ont fini. `walk` : l'employé va d'abord
// quelque part (étagère derrière le comptoir, seaux de la fleuriste, arrière-boutique, côté miroir du fauteuil) ; il revient
// à son poste à la première étape sans `walk`. `prop` : l'objet réel du geste (`Act.as`) ; `picto` : celui que porte le geste
// (documentaire, vérifié par les tests). Rien ne sort de nulle part : l'objet est pris (prise, étagère, seaux, comptoir)
// avant d'être tendu, et posé ou emporté ensuite ; le paquet et le bouquet naissent du papier et des tiges à la fin de
// l'emballage. Lunettes (opticien) : après `try-frames` le client garde la monture (`carry: 'frames'`) ; convention de
// rendu (tâche 10) : la monture `frames` est en main dans la fenêtre d'objet du geste joué, portée sur le visage partout
// ailleurs (fin de `try-frames`, `look-mirror`, attente) — elle quitte le visage à la prise de `put-down`.
// Durées (spec §5) : vente rapide 30-60 s (boucher, fromager, fleuriste, pharmacien, barista) ; conseil 2-4 min (opticien,
// caviste : conversations à la durée CONSULT, étapes facultatives OPTIONAL tirées par visite) ; long (coiffeur, tatoueur).
// `mute` : le geste du client se joue sans son picto (le miroir qui ne convainc pas).
export type SignatureStep = { staff: MoveId | null; customer: MoveId | null; prop?: PropId; picto?: PictoId; walk?: 'shelf' | 'buckets' | 'back' | 'mirror'; mute?: boolean };
type Extra = Pick<SignatureStep, 'prop' | 'picto' | 'walk' | 'mute'>;
const S = (staff: MoveId | null, customer: MoveId | null = null, o: Extra = {}): SignatureStep => ({ staff, customer, ...o });
// Opticien : une monture prise au comptoir (celle que le client a posée) ou à l'étagère, essayée devant le miroir, reposée.
// Seule la dernière monture essayée plaît (traits de joie, posés par visitSteps) ; devant les autres, le client se regarde
// sans se prononcer (`mute`).
const PAIR = (from: 'counter' | 'shelf'): SignatureStep[] => [
  ...(from === 'counter' ? [S('offer-frames', null, { prop: 'frames' })] : [S('fetch', null, { prop: 'frames', walk: 'shelf' }), S('hand-over', null, { prop: 'frames' })]),
  S(null, 'take-item', { prop: 'frames' }), S(null, 'try-frames', { prop: 'frames' }), S('nod', 'look-mirror', { prop: 'frames', mute: true }), S(null, 'put-down', { prop: 'frames' }),
];
// Caviste : un fond versé, tendu ; le client sent (♪) pendant que le caviste raconte, goûte (joie), repose le verre.
const TASTING: SignatureStep[] = [
  S('pour-wine', null, { prop: 'glass' }), S('hand-over', 'take-item', { prop: 'glass' }), S('chat', 'sniff-wine', { prop: 'glass', picto: 'note' }),
  S(null, 'sip-wine', { prop: 'glass', picto: 'joy' }), S('nod', 'put-down', { prop: 'glass' }),
];
// Seconde bouteille du caviste : prise à l'étagère, posée sur le comptoir, goûtée aussi.
const SECOND_BOTTLE: SignatureStep[] = [S('fetch', null, { walk: 'shelf' }), S('put-down'), ...TASTING];
// Troisième monture : le client hésite, l'opticien en propose une autre, celle-là plaît.
const THIRD_PAIR: SignatureStep[] = [S('listen', 'chin-think'), ...PAIR('shelf')];

export const SIGNATURES: Partial<Record<ShopTypeId, readonly SignatureStep[]>> = {
  // Boucher : pose la pièce, la pèse, l'emballe → le paquet, remis à la fin.
  butcher: [S('put-down'), S('weigh'), S('wrap', null, { prop: 'parcel' })],
  // Fromager : pose la meule, coupe un éclat, le tend ; le client goûte (traits de joie) ; emballage.
  cheese: [S('put-down'), S('cut-sample', null, { prop: 'sample' }), S('hand-over', 'take-item', { prop: 'sample' }), S('nod', 'taste', { prop: 'sample', picto: 'joy' }), S('wrap', null, { prop: 'parcel' })],
  // Opticien (rayon : le client a posé la paire qu'il a choisie) : conseil, première monture essayée devant le miroir, puis
  // conversation ; seconde monture prise à l'étagère ; facultatif : hésitation et troisième monture ; dernier conseil, et la
  // paire reposée pour la caisse.
  optician: [S('chat', 'listen'), ...PAIR('counter'), S('chat', 'listen'), ...PAIR('shelf'), ...THIRD_PAIR, S('chat', 'listen-nod')],
  // Coiffeur : shampoing (client renversé), ciseaux par passes (bavardage entre deux), miroir tenu côté porte, reposé.
  hairdresser: [S('shampoo', 'lie-back'), S('cut-hair'), S('hold-mirror', 'look-mirror', { prop: 'mirror', picto: 'joy', walk: 'mirror' }), S('put-down', 'nod', { prop: 'mirror' })],
  // Fleuriste : aux seaux, choisit des tiges (deux fois), revient à la table composer, emballe → le bouquet.
  florist: [S('pick-stems', null, { prop: 'bouquet', walk: 'buckets' }), S('pick-stems', null, { prop: 'bouquet', walk: 'buckets' }), S('compose-bouquet', null, { prop: 'bouquet' }), S('wrap', null, { prop: 'bouquet' })],
  // Caviste (caisse : la bouteille est posée) : conversation, dégustation, conversation ; facultatif : une seconde bouteille ;
  // dernier mot du caviste.
  wine: [S('chat', 'listen'), ...TASTING, S('chat', 'listen'), ...SECOND_BOTTLE, S('chat', 'listen-nod')],
  // Tatoueur : longue séance penché par passes (pauses pour essuyer), le client grimace parfois (goutte) ; miroir à la fin.
  tattoo: [S('tattoo', 'wince', { picto: 'sweat' }), S('hold-mirror', 'look-mirror', { prop: 'mirror', picto: 'joy', walk: 'mirror' }), S('put-down', 'nod', { prop: 'mirror' })],
  // Pharmacien : pose la boîte, la reprend et pointe la notice ; le client écoute, hoche la tête.
  pharmacy: [S('put-down'), S('explain-box', 'listen-nod')],
  // Restaurant : la signature est l'enchaînement complet de table.ts (placement → carte → commande → cuisine → assiettes →
  // débarrassage → note), joué en quatre passages du serveur ; rien à greffer ici.
  restaurant: [],
  // Barista : va à la machine (fond du comptoir), mouture et percolation, revient la tasse en main (remise par le squelette).
  cafe: [S('brew-coffee', null, { prop: 'cup', walk: 'shelf' })],
};
// Conseil : durée (s) des gestes en boucle d'une étape (conversation), tirée par étape ; les autres métiers laissent le
// moteur tirer la durée propre du geste.
const CONSULT: Partial<Record<ShopTypeId, readonly [number, number]>> = { optician: [15, 25], wine: [15, 25] };
// Étapes facultatives, jouées avec la probabilité `p` tirée une fois par visite : la troisième monture (opticien), la
// seconde bouteille (caviste) ; `from` : indice de leur première étape dans le tableau.
const OPTIONAL: Partial<Record<ShopTypeId, { from: number; n: number; p: number }>> = {
  optician: { from: 1 + PAIR('counter').length + 1 + PAIR('shelf').length, n: THIRD_PAIR.length, p: 0.5 },
  wine: { from: 1 + TASTING.length + 1, n: SECOND_BOTTLE.length, p: 0.5 },
};
// Journal de la première étape.
const LOG: Partial<Record<ShopTypeId, string>> = {
  butcher: 'pèse, puis emballe', cheese: 'fait goûter un éclat', optician: 'conseille, fait essayer devant le miroir', hairdresser: 'shampoing, puis coupe aux ciseaux',
  florist: 'compose le bouquet dans les seaux, puis l’emballe', wine: 'raconte le vin, fait sentir, puis goûter', tattoo: 'commence la séance', pharmacy: 'explique la posologie', cafe: 'prépare le café à la machine',
};
// Pause entre deux passes d'une séance au fauteuil : le coiffeur bavarde, le tatoueur essuie.
const PAUSE: Partial<Record<ShopTypeId, MoveId>> = { hairdresser: 'chat', tattoo: 'wipe-counter' };
const PAUSE_P = 0.3;
const WINCE_P = 0.3;
// Marche vers un lieu de `walk` (s), comptée aller et retour dans une séance.
const WALK_S = 3;

// Étape compilée : les actes de l'employé et du client d'un temps de service.
export type SigStep = { staff: Act[]; client: Act[]; log?: string };
type Places = Record<NonNullable<SignatureStep['walk']>, number>;
// Où l'employé joue : à son poste (`home`, tourné `face`) ou à l'un des lieux de `walk` (tourné vers le mur, ou vers le
// client côté miroir).
type Ctx = { w: World; s: Actor; L: Actor; home: number; face: number; places: Places };
type Timed = { st: SignatureStep; dur?: number; client?: Act[] };

// Côté miroir du fauteuil : face au client, côté porte.
const mirrorX = (w: World, chair: number): number => atDepth(w, Math.max(HALF, depth(w, chair) - PLACE * 0.6));
const isLoop = (id: MoveId | null): boolean => !!id && !!MOVES[id].loop;

// L'objet réel de l'étape ne vaut que pour un geste qui tient un objet (fenêtre d'objet) : un hochement de tête à côté
// d'un client qui goûte n'en tient pas.
const realProp = (id: MoveId, st: SignatureStep): Pick<Act, 'as'> => (st.prop && MOVES[id].prop ? { as: st.prop } : {});
const staffAct = (st: SignatureStep, yaw: number, dur?: number): Act => gest(st.staff!, { yaw, ...realProp(st.staff!, st), ...(dur === undefined ? {} : { dur }) });
// Le client : l'objet réel du geste ; la monture essayée reste sur le nez ; la durée de l'étape pour une boucle
// (conversation) ou le client renversé au bac, la sienne sinon.
const clientAct = (st: SignatureStep, dur?: number): Act => {
  const timed = dur !== undefined && (isLoop(st.customer) || st.customer === 'lie-back');
  return gest(st.customer!, { ...realProp(st.customer!, st), ...(st.customer === 'try-frames' ? { carry: 'frames' as const } : {}), ...(st.mute ? { mute: true } : {}), ...(timed ? { dur } : {}) });
};

// Compile les étapes en temps de service : marche vers le lieu de l'étape (ou retour au poste) avant le geste. `dur` : durée
// imposée à l'étape ; `homeAtEnd` : revenir au poste après la dernière étape si l'on en est parti.
function compile(c: Ctx, steps: readonly Timed[], homeAtEnd: boolean): SigStep[] {
  let where: SignatureStep['walk'] | 'home' = 'home';
  const out: SigStep[] = steps.map(({ st, dur, client }) => {
    const dest = st.walk ?? 'home';
    const staff: Act[] = [];
    if (dest !== where) {
      staff.push(walkTo(dest === 'home' ? c.home : c.places[dest]));
      where = dest;
    }
    const x = dest === 'home' ? c.home : c.places[dest];
    const yaw = dest === 'home' ? c.face : dest === 'mirror' ? yawToward(x, c.L.x) : 12;
    if (st.staff) staff.push(staffAct(st, yaw, dur));
    else if (staff.length) staff.push(turn(yaw));
    return { staff, client: client ?? (st.customer ? [clientAct(st, dur)] : []) };
  });
  if (homeAtEnd && where !== 'home' && out.length) out[out.length - 1]!.staff.push(walkTo(c.home), turn(c.face));
  return out;
}
const withLogs = (w: World, s: Actor, steps: SigStep[]): SigStep[] => {
  const text = LOG[w.type];
  if (steps[0] && text) steps[0].log = `${s.staff!.label} ${text}`;
  const mirror = steps.find((st) => st.staff.some((a) => a.move === 'hold-mirror'));
  if (mirror) mirror.log = 'le miroir : ça plaît';
  return steps;
};
const ctxCounter = (w: World, s: Actor, L: Actor): Ctx => {
  const post = s.staff!.post;
  const shelf = inward(w, post);
  return { w, s, L, home: post, face: yawStaff(w), places: { shelf, buckets: shelf, back: w.stage.back, mirror: post } };
};
// Les étapes de la visite : sans les facultatives si le sort en décide, les conversations à la durée du conseil.
function visitSteps(w: World): Timed[] {
  const steps = SIGNATURES[w.type] ?? [];
  const opt = OPTIONAL[w.type];
  const skip = !!opt && w.rng() >= opt.p;
  const consult = CONSULT[w.type];
  const kept = steps.filter((_, k) => !(skip && k >= opt!.from && k < opt!.from + opt!.n));
  // Le dernier miroir de la visite est celui qui plaît : son picto de joie remplace le silence des essais précédents.
  const lastMirror = kept.map((st) => st.customer).lastIndexOf('look-mirror');
  return kept.map((st, k) => ({
    st: k === lastMirror && st.mute ? { ...st, mute: false, picto: 'joy' as const } : st,
    ...(consult && isLoop(st.staff) ? { dur: consult[0] + w.rng() * (consult[1] - consult[0]) } : {}),
  }));
}

// Comptoir, caisse, rayon : les étapes du métier, jouées au poste entre la demande et la remise. Vide si le métier n'en a pas.
export function counterSignature(w: World, s: Actor, L: Actor): SigStep[] {
  return withLogs(w, s, compile(ctxCounter(w, s, L), visitSteps(w), true));
}
// La signature commence par aller chercher elle-même (seaux de la fleuriste) : le squelette saute sa prise générique.
export const fetchesItself = (w: World): boolean => !!SIGNATURES[w.type]?.[0]?.walk;

// Bar, café : les actes de l'employé qui remplacent la prise au comptoir (il revient ensuite vers le client), ou null.
export function drinkSignature(w: World, s: Actor, L: Actor): { acts: Act[]; log?: string } | null {
  if (!SIGNATURES[w.type]?.length) return null;
  const compiled = withLogs(w, s, compile(ctxCounter(w, s, L), visitSteps(w), false));
  return { acts: compiled.flatMap((st) => st.staff), log: compiled[0]!.log };
}

// Fauteuils : la séance de `budget` s. Les gestes en boucle du squelette (shampoing, ciseaux, séance) se partagent le temps
// restant une fois les gestes unitaires et les marches (aller et retour) comptés — le premier d'entre eux (shampoing) n'en
// prend qu'un cinquième quand il y en a plusieurs — et se jouent par passes de la durée du geste, jamais plus courtes que son
// minimum, entrecoupées de pauses (PAUSE_P) ; le client renversé (`lie-back`) le reste toute la passe, la grimace (`wince`) ne
// vient qu'une passe sur trois. Métier sans signature : une étape générique, l'employé travaille, le client reste assis.
export function chairSignature(w: World, s: Actor, L: Actor, chair: number, home: number, budget: number): SigStep[] {
  const skeleton = SIGNATURES[w.type] ?? [S('prepare')];
  const places: Places = { shelf: home, buckets: home, back: w.stage.back, mirror: mirrorX(w, chair) };
  const ctx: Ctx = { w, s, L, home, face: yawToward(home, chair), places };
  const loops = skeleton.filter((st) => isLoop(st.staff));
  const fixed = skeleton.reduce((sum, st) => sum + (st.staff && !isLoop(st.staff) ? MOVES[st.staff].dur[1] : 0) + (st.walk ? 2 * WALK_S : 0), 0);
  const pool = Math.max(0, budget - fixed);
  const first = loops.length > 1 ? pool / 5 : 0;
  const rest = loops.length > 1 ? (pool - first) / (loops.length - 1) : pool;
  const steps: Timed[] = [];
  for (const st of skeleton) {
    if (!isLoop(st.staff)) {
      steps.push({ st });
      continue;
    }
    const [lo, hi] = MOVES[st.staff!].dur;
    let left = loops.length > 1 && st === loops[0] ? first : rest;
    while (left >= lo) {
      // Une passe de la durée du geste ; la dernière absorbe un reste trop court pour une passe, sinon laisse au moins une
      // passe minimale derrière elle.
      let d = lo + w.rng() * (hi - lo);
      if (left - d < lo) d = left <= hi ? left : left - lo;
      left -= d;
      const client = st.customer === 'wince' ? (w.rng() < WINCE_P ? [clientAct(st)] : []) : undefined;
      steps.push({ st, dur: d, ...(client ? { client } : {}) });
      const pause = PAUSE[w.type];
      if (pause) {
        const pd = MOVES[pause].dur[0];
        if (left - pd >= lo && w.rng() < PAUSE_P) {
          left -= pd;
          steps.push({ st: S(pause), dur: pd, client: [] });
        }
      }
    }
  }
  return withLogs(w, s, compile(ctx, steps, true));
}
