import { hashString, mulberry32 } from '../scene-world';
import type { Household } from './households';
import type { Contract } from './identity';

// Traits FIXES de journée de chaque habitant (lot 1, tâche 2) : horaire de travail, trajet, préparation, besoin de sommeil,
// heure de coucher habituelle, école ou cours. Tirés une fois par personne sur un flux à part (graine du foyer ^
// hashString('traits') ^ indice du membre) ; valeurs de la maquette « lever des habitants » (notes § Paramètres). Les tirages
// du jour (lever, sorties, bruit de quelques minutes) viennent plus tard et ne changent jamais ces traits.

// Minutes depuis minuit. `start` : début de travail ; `effective` : travail effectif par jour ; `commute` : trajet (min) ;
// `prep` : préparation (min) ; `split` : horaires coupés (deux services [début, fin], jours de la semaine 0 = dimanche).
export type WorkTraits = {
  start: number; effective: number; commute: number; walk: boolean; prep: number;
  split: null | { a: [number, number]; b: [number, number]; days: number[] };
  rttPerYear: number;
};
// `bedtime` : minutes depuis minuit, peut dépasser 1440 (0 h 30 → 1470). `school.start` : lundi → vendredi, -1 = pas de cours
// ce jour-là (étudiant). `school.kind` : crèche (moins de 3 ans), école (3–10 ans), collège ou lycée (11–17 ans), études
// supérieures (étudiant).
export type SchoolKind = 'creche' | 'ecole' | 'college' | 'fac';
export type PersonTraits = {
  work: WorkTraits | null; sleep: number; bedtime: number; earlyP: number;
  // Trajet (min), à pied si court, préparation (min) et pause déjeuner (cadre 45–90, sinon 30) : pour tous, actif ou non.
  commute: number; walk: boolean; prep: number; pause: number;
  // `end` : fin des cours, lundi → vendredi, -1 sans cours.
  school: null | { kind: SchoolKind; start: number[]; end: number[]; autonomous: boolean };
};

const RTT: Record<Contract, number> = { '35h': 0, '39h': 11, forfait: 11, 'fonction-publique': 15, hcr: 0, particulier: 0 };
const EFFECTIVE: Record<Contract, number | null> = { '35h': 420, '39h': 468, forfait: null, 'fonction-publique': 450, hcr: 450, particulier: 420 };
const HCR_SPLIT = { a: [660, 870], b: [1110, 1350], days: [2, 3, 4, 5, 6] } as const; // 11 h-14 h 30, 18 h 30-22 h 30, mardi → samedi
const SCHOOL_START = 500; // 8 h 20
const CRECHE_START = 510; // 8 h 30, lundi → vendredi (pas de demi-journée le mercredi)
const CRECHE_AGE = 3; // la crèche avant 3 ans, l'école maternelle ensuite

type Rng = () => number;
// Entier tiré dans [lo, hi], arrondi au multiple de 5 (comme la maquette).
const int5 = (rng: Rng, lo: number, hi: number): number => Math.round((lo + rng() * (hi - lo)) / 5) * 5;
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

// Flux du jour nommé : (graine du foyer, membre, date ISO, usage) → même suite, sans état d'un jour à l'autre.
export function dayRng(seed: number, m: number, iso: string, use: string): () => number {
  return mulberry32((seed ^ hashString(iso + '|' + use) ^ Math.imul(m + 1, 0x9e3779b1)) >>> 0);
}

const cache = new WeakMap<Household, PersonTraits[]>();

export function traitsOf(hh: Household, m: number): PersonTraits {
  let list = cache.get(hh);
  if (!list) cache.set(hh, (list = []));
  return (list[m] ??= draw(hh, m));
}

function draw(hh: Household, m: number): PersonTraits {
  const who = hh.members[m]!.who;
  const rng = mulberry32((hh.seed ^ hashString('traits') ^ m) >>> 0);
  const { status, age, contract } = who;
  const active = status === 'cadre' || status === 'non-cadre';
  // Travail : début, effectif, trajet, mode, préparation (dans l'ordre de la maquette).
  let work: WorkTraits | null = null;
  let start = 0;
  let effective = 0;
  let pause = 30;
  if (status === 'cadre') { start = int5(rng, 510, 570); effective = int5(rng, 450, 510); pause = int5(rng, 45, 90); }
  else if (status === 'non-cadre') { start = int5(rng, 390, 480); effective = int5(rng, 420, 465); }
  else { rng(); rng(); }
  const commute = int5(rng, 10, 50);
  rng(); // mode (métro / bus) : tiré par la suite
  const prep = int5(rng, 30, 60);
  const gap = int5(rng, -30, 30);
  if (active) {
    effective = EFFECTIVE[contract!] ?? effective;
    work = {
      start, effective, commute, walk: commute <= 15, prep, rttPerYear: RTT[contract!],
      split: contract === 'hcr' ? { a: [...HCR_SPLIT.a], b: [...HCR_SPLIT.b], days: [...HCR_SPLIT.days] } as WorkTraits['split'] : null,
    };
    if (contract === 'hcr') work.start = 660;
  }
  const sleep = status === 'enfant' ? (age <= 5 ? 690 : age < 11 ? 630 : 570)
    : status === 'retraite' ? 420 + gap : status === 'etudiant' ? 480 + gap : 450 + gap;
  // Coucher habituel : senior (retraité ou 65 ans et plus), jeune (< 35 ans, hors famille), adulte. Un enfant se couche plus tôt.
  const parent = hh.members.some((x) => x.who.status === 'enfant') && status !== 'enfant';
  let bedtime: number;
  if (status === 'enfant') bedtime = age < 11 ? 1230 : 1290;
  else if (status === 'retraite' || age >= 65) bedtime = int5(rng, 1320, 1395);
  else if (!parent && age < 35) bedtime = int5(rng, 1425, 1485);
  else bedtime = int5(rng, 1365, 1425);
  const earlyP = status === 'retraite' ? 0.15 + 0.7 * rng() : 0;
  let school: null | Omit<NonNullable<PersonTraits['school']>, 'end'> = null;
  if (status === 'enfant') {
    school = age < CRECHE_AGE
      ? { kind: 'creche', start: Array.from({ length: 5 }, () => CRECHE_START), autonomous: false }
      : age < 11
        ? { kind: 'ecole', start: Array.from({ length: 5 }, () => SCHOOL_START), autonomous: false }
        : { kind: 'college', start: Array.from({ length: 5 }, () => pick([480, 540, 600], rng)), autonomous: true };
  } else if (status === 'etudiant') {
    school = { kind: 'fac', start: Array.from({ length: 5 }, () => (rng() < 0.2 ? -1 : int5(rng, 480, 660))), autonomous: true };
  }
  // Fin des cours : tirée après tout le reste pour ne pas bouger les traits du lot 1.
  if (school) {
    const { kind, start } = school;
    const end = start.map((s, d) => s === -1 ? -1
      : kind === 'college' ? (d === 2 ? 720 : Math.min(s + int5(rng, 390, 480), 1050))
        : Math.min(s + int5(rng, 180, 480), 1110));
    return { work, sleep, bedtime, earlyP, commute, walk: commute <= 15, prep, pause, school: { ...school, end } };
  }
  return { work, sleep, bedtime, earlyP, commute, walk: commute <= 15, prep, pause, school: null };
}
