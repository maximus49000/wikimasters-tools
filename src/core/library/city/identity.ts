import { hashString, mulberry32 } from '../scene-world';
import { firstNameFor, type Sex } from './first-names';
import type { HouseholdType } from './households';

// Identité des habitants (lot 1, plan 2026-10-25 « identité des habitants ») : prénom, sexe, âge, statut, métier, contrat et
// liens de famille de chaque membre d'un foyer. Tirée sur un flux À PART (graine du foyer ^ hashString('identity')), après
// les tirages de `makeHousehold` : types, couleurs et drapeaux des foyers ne bougent pas. Ni la date ni l'affichage ne
// changent une identité ; les âges sont ceux de l'année de référence `IDENTITY_YEAR` (l'âge ne vieillit pas avec la date).

export type { Sex } from './first-names';
export type Status = 'cadre' | 'non-cadre' | 'chomeur' | 'retraite' | 'etudiant' | 'enfant';
export type Contract = '35h' | '39h' | 'forfait' | 'fonction-publique' | 'hcr' | 'particulier';
// partner, children, parents : indices dans `hh.members`.
export type Identity = {
  first: string; sex: Sex; age: number; status: Status; job: string | null; contract: Contract | null;
  partner: number | null; children: number[]; parents: number[];
};

// Année de référence des âges (année de naissance = IDENTITY_YEAR − âge, pour le choix du prénom).
export const IDENTITY_YEAR = 2026;

// Métiers [féminin, masculin] par catégorie.
const JOBS_CADRE: readonly (readonly [string, string])[] = [
  ['avocate', 'avocat'], ['ingénieure', 'ingénieur'], ['cheffe de projet', 'chef de projet'], ['informaticienne', 'informaticien'],
  ['pharmacienne', 'pharmacien'], ['consultante', 'consultant'], ['chargée de com', 'chargé de com'], ['directrice d’agence', 'directeur d’agence'],
];
const JOBS_NON_CADRE: readonly (readonly [string, string])[] = [
  ['technicienne', 'technicien'], ['aide-soignante', 'aide-soignant'], ['magasinière', 'magasinier'], ['boulangère', 'boulanger'],
  ['vendeuse', 'vendeur'], ['secrétaire', 'secrétaire'], ['agente d’entretien', 'agent d’entretien'], ['caissière', 'caissier'],
];
const JOBS_HCR: readonly (readonly [string, string])[] = [['serveuse', 'serveur'], ['cuisinière', 'cuisinier']];

// Tranches d'âge par type de foyer (bornes incluses).
const AGES = { couple: [25, 60], parent: [28, 52], kid: [1, 17], retraite: [65, 88], etudiant: [18, 26], coloc: [20, 32], solo: [25, 85] } as const;
const PARTNER_GAP = 10; // écart d'âge tiré entre conjoints (≤ 15 ans exigé)
const BIG_ELDEST = 0.35; // part des familles dont l'aîné a 11 ans ou plus
const PARENT_GAP = { min: 18, max: 45 } as const; // écart d'âge parent – enfant

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const coin = (rng: Rng): Sex => (rng() < 0.5 ? 'f' : 'm');
const jobOf = (list: readonly (readonly [string, string])[], sex: Sex, rng: Rng): string => pick(list, rng)[sex === 'f' ? 0 : 1];

// Sexes d'un couple : 90 % femme + homme (dans un ordre tiré), 10 % même sexe.
function coupleSexes(rng: Rng): [Sex, Sex] {
  if (rng() < 0.9) return rng() < 0.5 ? ['f', 'm'] : ['m', 'f'];
  const s = coin(rng);
  return [s, s];
}

// Âges de deux conjoints dans [lo, hi], écart ≤ PARTNER_GAP.
function coupleAges(rng: Rng, lo: number, hi: number): [number, number] {
  const a = int(rng, lo, hi);
  return [a, clamp(a + int(rng, -PARTNER_GAP, PARTNER_GAP), lo, hi)];
}

type Work = Pick<Identity, 'status' | 'job' | 'contract'>;
const NO_WORK = { job: null, contract: null } as const;

// Cadre : forfait 70 %, 39h 30 %.
function cadre(sex: Sex, rng: Rng): Work {
  const contract: Contract = rng() < 0.7 ? 'forfait' : '39h';
  return { status: 'cadre', contract, job: jobOf(JOBS_CADRE, sex, rng) };
}

// Non-cadre : 35h 40 %, 39h 30 %, fonction publique 20 %, hcr 10 % (serveur·se ou cuisinier·ère).
function nonCadre(sex: Sex, rng: Rng, hcr?: boolean): Work {
  let contract: Contract;
  if (hcr) contract = 'hcr';
  else {
    const r = rng() * (hcr === false ? 0.9 : 1);
    contract = r < 0.4 ? '35h' : r < 0.7 ? '39h' : r < 0.9 ? 'fonction-publique' : 'hcr';
  }
  return { status: 'non-cadre', contract, job: jobOf(contract === 'hcr' ? JOBS_HCR : JOBS_NON_CADRE, sex, rng) };
}

// Actif en couple ou en famille : cadre 40 %, non-cadre 50 %, chômeur 10 %.
function active(sex: Sex, rng: Rng): Work {
  const r = rng();
  return r < 0.4 ? cadre(sex, rng) : r < 0.9 ? nonCadre(sex, rng) : { status: 'chomeur', ...NO_WORK };
}

// Colocataire : étudiant 40 %, non-cadre 40 % (dont 1 sur 3 en hcr), cadre 20 %.
function colocWork(sex: Sex, rng: Rng): Work {
  const r = rng();
  if (r < 0.4) return { status: 'etudiant', ...NO_WORK };
  if (r < 0.8) return nonCadre(sex, rng, rng() < 1 / 3);
  return cadre(sex, rng);
}

// Personne seule : retraité à 65 ans et plus ; sinon cadre 40 %, non-cadre 45 %, chômeur 15 %.
function soloWork(age: number, sex: Sex, rng: Rng): Work {
  if (age >= 65) return { status: 'retraite', ...NO_WORK };
  const r = rng();
  return r < 0.4 ? cadre(sex, rng) : r < 0.85 ? nonCadre(sex, rng) : { status: 'chomeur', ...NO_WORK };
}

type Draft = { sex: Sex; age: number } & Work;

// Identités des membres d'un foyer, dans l'ordre de `hh.members` (famille : [parent, parent, enfant, enfant?]).
export function identityOf(hh: { type: HouseholdType; seed: number; members: readonly { kid: boolean }[] }): Identity[] {
  const rng = mulberry32(hh.seed ^ hashString('identity'));
  const n = hh.members.length;
  const drafts: Draft[] = [];
  let pair = false; // members[0] et members[1] sont conjoints
  if (hh.type === 'couple' || hh.type === 'famille' || (hh.type === 'retraite' && n === 2)) {
    pair = true;
    const big = hh.type === 'famille' && rng() < BIG_ELDEST;
    const [lo, hi] = hh.type === 'couple' ? AGES.couple : hh.type === 'famille' ? AGES.parent : AGES.retraite;
    // Aîné de 11 ans et plus : le plus jeune parent a au moins 11 + 18 ans.
    const [a0, a1] = coupleAges(rng, big ? Math.max(lo, 11 + PARENT_GAP.min) : lo, hi);
    const sexes = coupleSexes(rng);
    for (const [i, age] of [a0, a1].entries()) {
      const sex = sexes[i]!;
      drafts.push({ sex, age, ...(hh.type === 'retraite' ? { status: 'retraite', ...NO_WORK } : active(sex, rng)) });
    }
    if (hh.type === 'famille') {
      // Enfants : au moins 18 ans de moins que le plus jeune parent, au plus 45 de moins que le plus âgé.
      const young = Math.min(a0, a1);
      const old = Math.max(a0, a1);
      const kidLo = Math.max(AGES.kid[0], old - PARENT_GAP.max);
      const kidHi = Math.min(AGES.kid[1], young - PARENT_GAP.min);
      const eldest = big ? int(rng, Math.max(11, kidLo), kidHi) : int(rng, kidLo, Math.min(10, kidHi));
      let prev = eldest;
      for (let i = 2; i < n; i++) {
        const age = i === 2 ? eldest : prev > kidLo ? int(rng, kidLo, prev - 1) : prev;
        prev = age;
        drafts.push({ sex: coin(rng), age, status: 'enfant', ...NO_WORK });
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const sex = coin(rng);
      if (hh.type === 'retraite') drafts.push({ sex, age: int(rng, ...AGES.retraite), status: 'retraite', ...NO_WORK });
      else if (hh.type === 'etudiant') drafts.push({ sex, age: int(rng, ...AGES.etudiant), status: 'etudiant', ...NO_WORK });
      else if (hh.type === 'coloc') drafts.push({ sex, age: int(rng, ...AGES.coloc), ...colocWork(sex, rng) });
      else {
        const age = int(rng, ...AGES.solo);
        drafts.push({ sex, age, ...soloWork(age, sex, rng) });
      }
    }
  }
  // Prénoms en dernier (jamais deux fois le même dans le foyer), liens de famille.
  const taken = new Set<string>();
  const kids = hh.type === 'famille' ? drafts.map((_, i) => i).filter((i) => i >= 2) : [];
  return drafts.map((d, i): Identity => {
    const first = firstNameFor(d.sex, IDENTITY_YEAR - d.age, rng, taken);
    taken.add(first);
    const parent = pair && i < 2;
    return {
      first, sex: d.sex, age: d.age, status: d.status, job: d.job, contract: d.contract,
      partner: parent ? 1 - i : null,
      children: parent ? kids.slice() : [],
      parents: kids.includes(i) ? [0, 1] : [],
    };
  });
}

// Taille d'un enfant (relative à un adulte) selon son âge.
export const kidSize = (age: number): number => (age <= 5 ? 0.58 : age <= 10 ? 0.64 : age <= 14 ? 0.8 : 0.92);
