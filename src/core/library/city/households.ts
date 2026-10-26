import { hashString, mulberry32 } from '../scene-world';
import type { Facade } from './facades';
import type { Home } from './facade-layout';
import { nannyFor, type Visitor } from './id-card';
import { identityOf, kidSize, type Identity } from './identity';

// Foyers fixes par logement (port de `householdFor` / `makeHousehold` de docs/superpowers/maquettes/vie-etages/src/02-layout.js,
// spec 2026-10-19 « vie au-dessus de la rue ») : qui habite chaque logement des façades du chantier 1, tiré de la graine de
// la ville et de la clé du logement seulement (ni la date ni la mise en page ne le changent ; `facadeLayout` n'est pas
// touché). Les pièces, l'étage, le balcon, les volets et la porte en découlent pour les emplois du temps (tâche 2).

export type HouseholdType = 'couple' | 'famille' | 'retraite' | 'etudiant' | 'coloc' | 'solo';
export type Room = 'cuisine' | 'chambre' | 'salon';
// size : relative à la taille d'un adulte (0,66 × hauteur d'étage) ; enfants selon l'âge (≤ 5 ans 0,58, 6–10 ans 0,64,
// 11–14 ans 0,8, 15–17 ans 0,92), retraités 0,94, étudiants 0,97. who : identité (prénom, âge, statut…, voir identity.ts).
export type Member = { kid: boolean; size: number; shirt: string; pants: string; skin: string; who: Identity };
type Drawn = Omit<Member, 'who'>;
// smoker : 40 % des couples et des personnes seules (coloc et étudiant fument selon leur emploi du temps) ; sapin : 55 % ;
// late : couche-tard, 50 % des étudiants ; seed : graine propre au foyer ; nanny : nounou de la famille (voir id-card.ts).
export type Household = { type: HouseholdType; members: Member[]; smoker: boolean; sapin: boolean; late: boolean; seed: number; nanny: Visitor | null };
export type Dwelling = {
  id: string; // `${facade}:${home}` (même clé que `data-home` du calque des fenêtres)
  facade: number; home: number; key: number; // index dans `facades`, index dans `facade.homes`, `Home.key`
  floorIdx: number; // 0 = premier étage au-dessus du rez-de-chaussée (socle : 0, lucarnes : levels.length)
  bays: number[]; rooms: Room[]; roomOfWindow: Map<number, Room>; // clé : `FacadeWindow.bay` (la `key` d'une fenêtre est celle du logement)
  balcony: boolean; // le salon donne sur un balcon filant ou un balconnet de l'étage
  balconnet?: boolean; // ce balcon est un balconnet d'une seule travée (deux personnes au plus, côte à côte)
  shutters: 'persienne' | 'battant' | null; // haussmann → persienne ; faubourg avec `layout.shutters` → battant ; lucarne, socle → null (le peintre n'en met pas au socle)
  doorX: number | null; // `layout.doorCx` de l'immeuble (socle des jumeaux : celui de la 1re tour)
  climb: number; // minutes de montée : 0,35 + 0,22 × (floorIdx + 1)
  hh: Household;
};

// Couleurs des pantins (notes.md §Couleurs).
const SHIRTS = ['#C85A3A', '#2E4A6E', '#8A5A8E', '#3F8A3A', '#E8C060', '#5A7AA8', '#B8705A', '#D86C7A', '#F4F0E0'];
const PANTS = ['#2E3A4A', '#5A3A2E', '#3A4A3A', '#8A7A6A', '#2A2A3A'];
const SKINS = ['#F2C9A0', '#D9A070', '#8A5A3A', '#F6D8B8', '#C8906A'];
// Montée : 0,35 min jusqu'au premier palier, puis 0,22 min par étage.
const CLIMB = { base: 0.35, perFloor: 0.22 } as const;

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;
const member = (rng: () => number, size = 1, kid = false): Drawn => ({ kid, size, shirt: pick(SHIRTS, rng), pants: pick(PANTS, rng), skin: pick(SKINS, rng) });

// Membres selon le type (ordre des tirages de la maquette), puis drapeaux du foyer (toujours tirés, dans le même ordre).
// Les tailles d'enfant tirées ici (0,62 / 0,7) sont remplacées par celles de l'âge dans `householdFor`.
function makeHousehold(type: HouseholdType, rng: () => number): Omit<Household, 'members' | 'nanny'> & { members: Drawn[] } {
  const members: Drawn[] = [];
  if (type === 'couple') members.push(member(rng), member(rng));
  else if (type === 'famille') {
    members.push(member(rng), member(rng), member(rng, 0.62, true));
    if (rng() < 0.5) members.push(member(rng, 0.7, true));
  } else if (type === 'retraite') {
    members.push(member(rng, 0.94));
    if (rng() < 0.6) members.push(member(rng, 0.94));
  } else if (type === 'etudiant') members.push(member(rng, 0.97));
  else if (type === 'coloc') {
    members.push(member(rng), member(rng));
    if (rng() < 0.6) members.push(member(rng));
  } else members.push(member(rng));
  const smoker = rng() < 0.4 && (type === 'couple' || type === 'solo');
  const sapin = rng() < 0.55;
  const late = rng() < 0.5 && type === 'etudiant';
  return { type, members, smoker, sapin, late, seed: Math.floor(rng() * 1e9) };
}

// Foyer d'un logement : couple 25 %, famille 20 %, retraité 18 %, étudiant 12 %, coloc 10 %, solo 15 % ; un logement d'une
// seule travée (lucarne) ne loge ni famille ni coloc (étudiant à la place).
export function householdFor(home: Home, seed: number): Household {
  const rng = mulberry32(seed ^ hashString('household') ^ home.key);
  const r = rng();
  let type: HouseholdType = r < 0.25 ? 'couple' : r < 0.45 ? 'famille' : r < 0.63 ? 'retraite' : r < 0.75 ? 'etudiant' : r < 0.85 ? 'coloc' : 'solo';
  if (home.bays.length === 1 && (type === 'famille' || type === 'coloc')) type = 'etudiant';
  const drawn = makeHousehold(type, rng);
  // Identité sur un flux à part (tirages ci-dessus inchangés) ; la taille d'un enfant suit son âge ; la nounou ensuite (son
  // propre flux, d'après les traits de journée des parents).
  const who = identityOf(drawn);
  const hh: Household = { ...drawn, members: drawn.members.map((m, i) => ({ ...m, size: m.kid ? kidSize(who[i]!.age) : m.size, who: who[i]! })), nanny: null };
  hh.nanny = nannyFor(hh);
  return hh;
}

// Pièces le long des travées du logement : 1 → salon ; 2 → cuisine, salon ; 3 et plus → cuisine, chambre(s), salon.
function roomsFor(n: number): Room[] {
  if (n <= 1) return ['salon'];
  return Array.from({ length: n }, (_, i): Room => (i === 0 ? 'cuisine' : i === n - 1 ? 'salon' : 'chambre'));
}

// Logements de la ville, dans l'ordre des façades puis de `facade.homes` (logements de la tour, lucarnes, puis socle des
// jumeaux). Immeubles du fond et façades sans logement : rien.
export function cityDwellings(facades: readonly Facade[], seed: number): Dwelling[] {
  const out: Dwelling[] = [];
  facades.forEach((f, fi) => {
    if (f.far) return;
    const layout = f.layout;
    const towerHomes = layout?.homes.length ?? 0;
    f.homes.forEach((home, hi) => {
      const podium = hi >= towerHomes;
      const dormer = !podium && home.level < 0;
      const level = podium || dormer ? null : (layout!.levels[home.level] ?? null);
      const floorIdx = podium ? 0 : dormer ? layout!.levels.length : home.level;
      const rooms = roomsFor(home.bays.length);
      const shutters = dormer || podium || !layout ? null : layout.kind === 'haussmann' ? 'persienne' : layout.shutters ? 'battant' : null;
      out.push({
        id: `${fi}:${hi}`,
        facade: fi,
        home: hi,
        key: home.key,
        floorIdx,
        bays: home.bays.slice(),
        rooms,
        roomOfWindow: new Map(home.bays.map((bay, i) => [bay, rooms[i]!])),
        balcony: level !== null && level.balcony !== 'none',
        balconnet: level?.balcony === 'balconnet',
        shutters,
        doorX: layout?.doorCx ?? null,
        climb: CLIMB.base + CLIMB.perFloor * (floorIdx + 1),
        hh: householdFor(home, seed),
      });
    });
  });
  return out;
}
