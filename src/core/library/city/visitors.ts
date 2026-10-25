import { hashString, mulberry32 } from '../scene-world';
import type { HouseholdMeals } from './home-rooms';
import type { Dwelling, Household } from './households';
import { visitorIdentity, type Visitor } from './id-card';
import type { Sex } from './identity';
import type { HouseholdDays } from './person-day';
import { dayRng } from './person-traits';
import type { SceneDay } from './scene-day';

// Visiteurs à identité stable (lot 3, tâche 9) : on ne vient que voir quelqu'un qui est PRÉSENT (éveillé, au logement) de
// l'arrivée à la fin de la montée ; les visiteurs habitent ailleurs (quartier hors champ) et ont une carte d'identité fixe.
// Amis et famille : tirés par foyer (graine du foyer ^ 'visitors') ; livreurs, vendeurs, commerciaux : par ville.
//
// Choix (à confirmer) :
// - Hôte = premier adulte (ni enfant ni nounou) présent pendant toute la visite, dans l'ordre des membres ; l'hôte d'une
//   visite de nounou est le premier adulte (sa présence est garantie par `householdDays`, pas par ce module).
// - Dîner : arrivée dîner − 12 (+ 3 par invité supplémentaire), départ 45–90 min après la fin du dîner, avant le coucher de
//   l'hôte − 8 (montée comprise) ; seulement si `guests` (tirage du jour) et si un hôte est présent. 1 ou 2 invités.
// - Ami / famille / livreur / vendeur / commercial : un tirage de moment ; si aucun hôte n'est là, la visite est annulée.
// - Jour libre (amis) : week-end, férié, vacances scolaires (enfants à la maison, même en semaine) ; livreurs et autres
//   continuent de venir les jours ouvrés.
// - Indices d'invités pour `roomTimeline` : members.length + rang de la visite parmi les visites non-nounou dans l'ordre de
//   `dayVisits` ; la nounou y est `NANNY_M`.
// - Un même visiteur n'a jamais deux visites qui se chevauchent le même jour.

export type VisitKind = 'diner' | 'ami' | 'famille' | 'livreur' | 'vendeur' | 'commercial' | 'nounou';
// arrive / leave : heures de passage de la porte ; inside : entre dans le logement (donc vu aux fenêtres).
export type Visit = { visitor: Visitor; kind: VisitKind; host: number; arrive: number; leave: number; inside: boolean };
type Callers = Record<'livreur' | 'vendeur' | 'commercial', Visitor[]>;

const V = {
  friends: 2, friendAgeGap: 6, minAge: 18, parentGap: [24, 38], parentMax: 88,
  pAmi: 0.08, ami: [60, 120], pFamille: 0.10, famille: [90, 150], pLivreur: 0.10, livreur: [2, 4], pVendeur: 0.008, pCommercial: 0.008, shop: [5, 25],
  callerWindow: [540, 1110], amiWindow: [600, 1080], familleWindow: [660, 1020],
  dinnerEarly: 12, dinnerStep: 3, dinnerLen: 40, dinnerStay: [45, 90], dinnerBedGap: 8, minDinner: 40,
  counts: { livreur: 4, vendeur: 2, commercial: 2 },
} as const;
const FRIEND_JOBS_M = ['designer', 'infirmier', 'enseignant', 'développeur', 'architecte', 'photographe', 'cuisinier', 'libraire', 'médecin', 'journaliste'];
const FRIEND_JOBS_F = ['designeuse', 'infirmière', 'enseignante', 'développeuse', 'architecte', 'photographe', 'cuisinière', 'libraire', 'médecin', 'journaliste'];
const CALLER_JOBS = { livreur: ['livreur', 'livreuse'], vendeur: ['vendeur', 'vendeuse'], commercial: ['commercial', 'commerciale'] } as const;

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const int5 = (rng: Rng, lo: number, hi: number): number => Math.round((lo + rng() * (hi - lo)) / 5) * 5;
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;
const sexOf = (rng: Rng): Sex => (rng() < 0.5 ? 'f' : 'm');
const adults = (hh: Household): number[] => hh.members.flatMap((m, i) => (m.who.status === 'enfant' ? [] : [i]));

// Deux amis d'âge proche des adultes du foyer et un parent ou grand-parent (ids `friend:<seed>:<k>`, k = 0, 1, 2).
export function visitorPool(hh: Household): Visitor[] {
  const rng = mulberry32(hh.seed ^ hashString('visitors'));
  const taken = new Set(hh.members.map((m) => m.who.first));
  const ages = adults(hh).map((i) => hh.members[i]!.who.age);
  const ref = ages.length ? ages : [30];
  const out: Visitor[] = [];
  for (let k = 0; k < V.friends; k++) {
    const sex = sexOf(rng);
    const age = Math.max(V.minAge, pick(ref, rng) + int(rng, -V.friendAgeGap, V.friendAgeGap));
    const job = age >= 65 ? (sex === 'f' ? 'retraitée' : 'retraité') : pick(sex === 'f' ? FRIEND_JOBS_F : FRIEND_JOBS_M, rng);
    const v = visitorIdentity(rng, sex, age, job, taken);
    taken.add(v.who.first);
    out.push({ id: `friend:${hh.seed}:${k}`, ...v });
  }
  const sex = sexOf(rng);
  const age = Math.min(V.parentMax, Math.max(...ref) + int(rng, ...V.parentGap));
  out.push({ id: `friend:${hh.seed}:${V.friends}`, ...visitorIdentity(rng, sex, age, sex === 'f' ? 'retraitée' : 'retraité', taken) });
  return out;
}

const callersCache = new Map<number, Callers>();
// Livreurs (4), vendeurs (2) et commerciaux (2) de la ville : mêmes visages dans tous les immeubles.
export function cityCallers(seed: number): Callers {
  const hit = callersCache.get(seed);
  if (hit) return hit;
  const rng = mulberry32(seed ^ hashString('callers'));
  const make = (kind: keyof typeof CALLER_JOBS): Visitor[] => Array.from({ length: V.counts[kind] }, (_, k) => {
    const sex = sexOf(rng);
    const age = int(rng, 22, 58);
    return { id: `${kind}:${seed}:${k}`, ...visitorIdentity(rng, sex, age, CALLER_JOBS[kind][sex === 'f' ? 1 : 0]) };
  });
  const out: Callers = { livreur: make('livreur'), vendeur: make('vendeur'), commercial: make('commercial') };
  callersCache.set(seed, out);
  return out;
}

// Première minute (≥ from) où le membre n'est plus éveillé au logement, ou -1 s'il n'y est pas à `from`.
function presentUntil(hd: HouseholdDays, m: number, from: number): number {
  const p = hd.people[m]!;
  if (hd.away.state !== 'home') return -1;
  const end = p.outing && p.outing.ret > 1440 ? 1440 : p.bed;
  if (from < p.wake || from >= end) return -1;
  let stop = end;
  for (const [a, b] of p.out) {
    if (from >= a && from < b) return -1;
    if (a >= from && a < stop) stop = a;
  }
  return stop;
}

export function dayVisits(d: Dwelling, hd: HouseholdDays, meals: HouseholdMeals, day: SceneDay, seed: number, guests: boolean): Visit[] {
  if (hd.away.state !== 'home') return [];
  const hh = d.hh;
  const rng = dayRng(hh.seed, 0, day.iso, 'visites');
  const hosts = adults(hh);
  const pool = visitorPool(hh);
  const callers = cityCallers(seed);
  const climb = d.climb;
  const here = (m: number, a: number, b: number): boolean => presentUntil(hd, m, a) >= b + climb;
  const hostFor = (a: number, b: number): number => hosts.find((m) => here(m, a, b)) ?? -1;

  const nanny: Visit[] = hd.nanny
    ? hd.nanny.visits.map((v) => {
      // Hôte de la nounou : un adulte (sinon un enfant) éveillé au logement à son arrivée.
      const host = [...hosts, ...hd.people.map((_, m) => m)].find((m) => presentUntil(hd, m, v.arrive) > v.arrive) ?? hosts[0] ?? 0;
      return { visitor: hd.nanny!.visitor, kind: 'nounou' as const, host, arrive: v.arrive, leave: v.leave, inside: true };
    })
    : [];
  const kept: Visit[] = [...nanny];
  const busy = (v: Visitor, a: number, b: number): boolean => kept.some((t) => t.visitor.id === v.id && a < t.leave && b > t.arrive);

  // Dîner : 1 ou 2 invités (tirages toujours consommés, qu'il y ait dîner ou non).
  const nGuests = 1 + Math.floor(rng() * 2);
  const firstGuest = Math.floor(rng() * (V.friends + 1));
  const stay = int5(rng, ...V.dinnerStay);
  const dinner: Visit[] = [];
  if (guests && meals.dinner !== null) {
    for (let i = 0; i < nGuests; i++) {
      const visitor = pool[(firstGuest + i) % pool.length]!;
      const a = meals.dinner - V.dinnerEarly + V.dinnerStep * i;
      // Premier adulte pour qui la visite tient (présent, assez de temps avant son coucher ou sa sortie).
      let host = -1, b = 0;
      for (const m of hosts) {
        const until = presentUntil(hd, m, a);
        if (until <= a) continue;
        b = Math.min(meals.dinner + V.dinnerLen + stay, until - V.dinnerBedGap - climb);
        if (b - a >= V.minDinner && here(m, a, b)) { host = m; break; }
      }
      if (host < 0 || busy(visitor, a, b)) continue;
      const visit: Visit = { visitor, kind: 'diner', host, arrive: a, leave: b, inside: true };
      dinner.push(visit);
      kept.push(visit);
    }
  }

  const workday = day.weekday >= 1 && day.weekday <= 5 && day.kind !== 'public-holiday';
  const freeDay = day.weekend || day.kind === 'public-holiday' || day.kind === 'holiday' || day.schoolHoliday || day.holidayWeek;
  // Probabilité, moment, durée et choix du visiteur de chaque sorte (toujours consommés dans le même ordre).
  const draw = (p: number, [lo, hi]: readonly [number, number], [dl, dh]: readonly [number, number], exact = false) =>
    ({ yes: rng() < p, at: int5(rng, lo, hi), len: exact ? int(rng, dl, dh) : int5(rng, dl, dh), who: rng() });
  const ami = draw(V.pAmi, V.amiWindow, V.ami);
  const fam = draw(V.pFamille, V.familleWindow, V.famille);
  const liv = draw(V.pLivreur, V.callerWindow, V.livreur, true);
  const ven = draw(V.pVendeur, V.callerWindow, V.shop);
  const com = draw(V.pCommercial, V.callerWindow, V.shop);

  const others: Visit[] = [];
  const attempt = (t: ReturnType<typeof draw>, list: readonly Visitor[], kind: VisitKind, inside: boolean): void => {
    if (!t.yes) return;
    const visitor = list[Math.floor(t.who * list.length)]!;
    const a = t.at, b = a + Math.max(t.len, 2);
    const host = hostFor(a, b);
    if (host < 0 || busy(visitor, a, b)) return;
    const visit: Visit = { visitor, kind, host, arrive: a, leave: b, inside };
    others.push(visit);
    kept.push(visit);
  };
  if (freeDay) attempt(ami, pool.slice(0, V.friends), 'ami', true);
  if (day.weekday === 0) attempt(fam, pool.slice(V.friends), 'famille', true);
  if (workday) {
    attempt(liv, callers.livreur, 'livreur', false);
    attempt(ven, callers.vendeur, 'vendeur', false);
    attempt(com, callers.commercial, 'commercial', false);
  }
  others.sort((p, q) => p.arrive - q.arrive);
  return [...nanny, ...dinner, ...others];
}
