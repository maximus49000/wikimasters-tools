import { hashString, mulberry32 } from '../scene-world';
import { firstNameFor } from './first-names';
import type { Dwelling, Household } from './households';
import { IDENTITY_YEAR, type Identity, type Sex } from './identity';
import { traitsOf } from './person-traits';

// Nounou des familles et carte d'identité (lot 1, tâche 3) : la nounou est une visiteuse tirée sur un flux À PART (graine du
// foyer ^ hashString('nanny')), après les identités et les traits du foyer ; la carte d'identité est ce que montrera le
// futur passeport (prénom, âge, métier ou situation, conjoint, enfants, quartier d'origine d'un visiteur).

// Visiteur : quelqu'un qui vient d'ailleurs (`quarter` : son quartier, hors champ de la scène).
export type Visitor = { id: string; who: Identity; quarter: string; job: string };
export type IdCard = {
  first: string; age: number; job: string;
  situation: { kind: 'celibataire' } | { kind: 'couple'; with: string } | { kind: 'enfant'; of: string[] }; // enfant : prénoms des parents
  children: { first: string; age: number }[];
  quarter: string | null; // null : habite ici
};

// Quartiers parisiens d'où viennent les visiteurs (hors champ).
export const QUARTERS = [
  'Belleville', 'Ménilmontant', 'la Goutte-d’Or', 'les Batignolles', 'Montparnasse', 'la Butte-aux-Cailles', 'Charonne',
  'Bercy', 'Picpus', 'la Villette', 'Grenelle', 'Auteuil', 'les Épinettes', 'Plaisance', 'la Chapelle', 'Saint-Ambroise',
] as const;
const NANNY = { p: 0.6, ages: [25, 60], female: 0.9, job: 'nounou' } as const;
const NANNY_KID_AGE = 11; // une nounou garde les enfants de moins de 11 ans

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

// Identité d'un visiteur (ami, famille, livreur…) : quartier puis prénom tirés dans cet ordre sur `rng` ; `taken` : prénoms
// à éviter (ceux du foyer visité). Retraité dès 65 ans, sinon non-cadre ; `job` est le métier ou la situation affichés.
export function visitorIdentity(rng: Rng, sex: Sex, age: number, job: string, taken: ReadonlySet<string> = new Set()): Omit<Visitor, 'id'> {
  const quarter = pick(QUARTERS, rng);
  const first = firstNameFor(sex, IDENTITY_YEAR - age, rng, taken);
  const status = age >= 65 ? 'retraite' : 'non-cadre';
  return { who: { first, sex, age, status, job, contract: null, partner: null, children: [], parents: [] }, quarter, job };
}

// Nounou d'un foyer : une famille avec un enfant de moins de 11 ans dont les deux parents travaillent en a une 6 fois sur 10
// (contrat `particulier`, 25–60 ans). Appelée par `householdFor` une fois les identités posées.
export function nannyFor(hh: Household): Visitor | null {
  if (hh.type !== 'famille') return null;
  if (!hh.members.some((m) => m.who.status === 'enfant' && m.who.age < NANNY_KID_AGE)) return null;
  if (traitsOf(hh, 0).work === null || traitsOf(hh, 1).work === null) return null;
  const rng = mulberry32(hh.seed ^ hashString('nanny'));
  if (rng() >= NANNY.p) return null;
  const sex: Sex = rng() < NANNY.female ? 'f' : 'm';
  const age = int(rng, ...NANNY.ages);
  const quarter = pick(QUARTERS, rng);
  const first = firstNameFor(sex, IDENTITY_YEAR - age, rng, new Set(hh.members.map((m) => m.who.first)));
  return {
    id: `nanny:${hh.seed}`,
    who: { first, sex, age, status: 'non-cadre', job: NANNY.job, contract: 'particulier', partner: null, children: [], parents: [] },
    quarter,
    job: NANNY.job,
  };
}

// Métier affiché : le métier, sinon la situation accordée au sexe (crèche avant 3 ans, puis scolarité selon l'âge).
function jobLabel(who: Identity): string {
  if (who.job) return who.job;
  const f = who.sex === 'f';
  switch (who.status) {
    case 'retraite': return f ? 'retraitée' : 'retraité';
    case 'etudiant': return f ? 'étudiante' : 'étudiant';
    case 'enfant':
      if (who.age < 3) return 'à la crèche';
      if (who.age < 11) return f ? 'écolière' : 'écolier';
      if (who.age < 15) return f ? 'collégienne' : 'collégien';
      return f ? 'lycéenne' : 'lycéen';
    default: return 'en recherche d’emploi';
  }
}

function cardOf(who: Identity, members: readonly { who: Identity }[], quarter: string | null): IdCard {
  return {
    first: who.first,
    age: who.age,
    job: jobLabel(who),
    situation: who.parents.length ? { kind: 'enfant', of: who.parents.map((p) => members[p]!.who.first) }
      : who.partner === null ? { kind: 'celibataire' } : { kind: 'couple', with: members[who.partner]!.who.first },
    children: who.children.map((c) => ({ first: members[c]!.who.first, age: members[c]!.who.age })),
    quarter,
  };
}

// Carte d'identité du membre `m` d'un logement.
export function idCardOf(d: Dwelling, m: number): IdCard {
  return cardOf(d.hh.members[m]!.who, d.hh.members, null);
}

// Carte d'identité d'un visiteur (nounou…) : pas de conjoint ni d'enfants connus, son quartier d'origine.
export function idCardOfVisitor(v: Visitor): IdCard {
  return { ...cardOf(v.who, [], v.quarter), job: v.job };
}
