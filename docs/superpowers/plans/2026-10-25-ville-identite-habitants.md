# Ville : identité des habitants (lot 1) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** chaque habitant d'un logement (et la nounou d'une famille) a une identité stable : prénom, sexe, âge, statut,
profession, contrat, conjoint, enfants, et ses traits fixes de journée ; une fonction rend sa carte d'identité.

**Architecture :** `households.ts` garde ses tirages (types, membres, drapeaux) ; un **flux de tirage séparé** (graine du
foyer ^ `hashString('identity')`) ajoute `Member.who: Identity`. Prénoms dans un module de listes, traits de journée dans un
module à part, nounou et carte d'identité dans un troisième. Aucun rendu ne change dans ce lot, sauf deux cohérences
visibles : la taille des enfants suit leur âge, et la tenue des fenêtres respecte le sexe (coiffure, jupe/robe).

**Tech Stack :** TypeScript, Vitest.

**Spec :** `docs/superpowers/specs/2026-10-25-ville-journees-habitants-design.md` (lot 1) ; valeurs :
`docs/superpowers/maquettes/lever-habitants/notes.md` (§ Paramètres, § Contrats et congés) et `modele.js` (référence).

## Global Constraints

- Déterminisme : (graine de la ville, clé du logement, indice du membre) → même identité ; jamais de tirage à l'affichage ;
  la date ne change jamais une identité.
- Flux séparé : les tirages existants de `makeHousehold` / `householdFor` restent dans le même ordre (types, membres,
  couleurs, drapeaux inchangés) ; l'identité se tire après, sur `mulberry32(hh.seed ^ hashString('identity'))`.
- Statuts : `'cadre' | 'non-cadre' | 'chomeur' | 'retraite' | 'etudiant' | 'enfant'` ; contrats :
  `'35h' | '39h' | 'forfait' | 'fonction-publique' | 'hcr' | 'particulier'` (nounou) ; RTT/an : 35h 0, 39h 11, forfait 11,
  fonction publique 15, hcr 0, particulier 0 ; CP : 25 jours ouvrés pour tous.
- Paramètres (notes § Paramètres) : début du travail cadre 8 h 30 – 9 h 30 (510–570), non-cadre 6 h 30 – 8 h 00 (390–480) ;
  trajet 10–50 min (≤ 15 : à pied) ; préparation 30–60 min ; sommeil adulte 450 ± 30, retraité 420 ± 30, étudiant
  480 ± 30, enfant ≤ 5 ans 690, 6–10 ans 630, 11 ans et plus 570 ; coucher habituel jeune (< 35) 23 h 45 – 0 h 45, adulte
  22 h 45 – 23 h 45, senior (≥ 65) 22 h – 23 h 15 ; probabilité lève-tôt du retraité 0,15 – 0,85 ; horaires coupés HCR
  11 h – 14 h 30 et 18 h 30 – 22 h 30, mardi → samedi.
- Textes en français (prénoms, professions, carte) ; commits en français avec
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; tests : famille `scene-ville` seulement
  (`npm run test:famille -- scene-ville`), une session de tests à la fois sur la machine.

## Review Focus

1. Famille : écart d'âge parent – enfant ≥ 18 ans et ≤ 45 ans, enfants plus jeunes que les deux parents ; un « enfant » de
   18 ans ou plus n'existe pas (au-delà : pas un membre `kid`).
2. Couple : conjoints liés dans les deux sens (`partner` réciproque), écart d'âge ≤ 15 ans ; coloc et solo : `partner` null.
3. Prénoms : jamais deux fois le même prénom dans un foyer ; prénom cohérent avec le sexe et la génération (un enfant de
   2026 ne s'appelle pas Gérard).
4. Lucarne (1 travée) : étudiant seul, carte valide (pas de conjoint, pas d'enfant).
5. Retraité seul de 88 ans, chômeur de 58 ans : traits de travail absents (`work` null), carte sans contrat.

---

### Task 1 : prénoms et identité des membres

**Files :** Create `src/core/library/city/first-names.ts`, `src/core/library/city/identity.ts` ; Modify
`src/core/library/city/households.ts` (`Member.who`, taille des enfants) ; Test `tests/core/library/city/identity.test.ts`,
adapter `tests/core/library/city/households.test.ts` (taille des enfants).

**Interfaces :**
- Produces : `export type Sex = 'f' | 'm'` ; `export type Status = …` ; `export type Contract = …` ;
  `export type Identity = { first: string; sex: Sex; age: number; status: Status; job: string | null; contract: Contract | null; partner: number | null; children: number[]; parents: number[] }`
  (indices dans `hh.members`) ; `Member` gagne `who: Identity` ; `export function firstNameFor(sex: Sex, birthYear: number, rng: () => number, taken: ReadonlySet<string>): string`.
- Répartition : couple — 2 adultes 25–60 ans, 90 % femme + homme, 10 % même sexe ; famille — 2 parents 28–52 ans
  (même règle), enfants 1–17 ans (aîné ≥ 11 ans dans 35 % des familles) ; retraite — 65–88 ans, à deux = couple ;
  etudiant — 18–26 ans ; coloc — 20–32 ans, statut tiré parmi étudiant 40 %, non-cadre 40 % (dont 1 sur 3 en hcr, métier
  serveur·se / cuisinier·ère), cadre 20 % ; solo — 25–85 ans, statut selon l'âge (≥ 65 : retraité ; sinon cadre 40 %,
  non-cadre 45 %, chômeur 15 %). Actifs en couple / famille : cadre 40 %, non-cadre 50 %, chômeur 10 %.
- Contrat : cadre → forfait 70 %, 39h 30 % ; non-cadre → 35h 40 %, 39h 30 %, fonction-publique 20 %, hcr 10 % ;
  métiers par contrat dans `identity.ts` (cadre : avocat·e, ingénieur·e, chef·fe de projet, informaticien·ne,
  pharmacien·ne, consultant·e, chargé·e de com, directeur·rice d'agence ; non-cadre : technicien·ne, aide-soignant·e,
  magasinier·ère, boulanger·ère, vendeur·se, secrétaire, agent·e d'entretien, caissier·ère ; hcr : serveur·se,
  cuisinier·ère), accordés au sexe.
- Taille `kid` : ≤ 5 ans 0,58, 6–10 ans 0,64, 11–14 ans 0,8, 15–17 ans 0,92 (au lieu de 0,62 / 0,7).

- [ ] **Step 1 : tests rouges** (`identity.test.ts`) : `même graine → mêmes identités, autre graine → différentes` ;
  `familles : écart parent-enfant 18-45 ans, enfants < 18` ; `conjoints réciproques, écart ≤ 15 ans, coloc et solo sans
  conjoint` ; `prénoms uniques par foyer et cohérents avec le sexe et l'année de naissance` (table de `first-names.ts` :
  chaque prénom porte un sexe et une plage d'années) ; `répartition des statuts sur 5 graines dans ± 8 points des
  proportions ci-dessus` ; `lucarne : étudiant seul` ; `tirages existants inchangés` (types, couleurs, drapeaux identiques à
  avant pour 3 graines — figer une empreinte JSON dans `tests/core/library/fixtures/`).
- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/city/identity.test.ts` → échec (module absent).
- [ ] **Step 3 : implémenter** `first-names.ts` (≥ 40 prénoms par sexe répartis en générations 1935-1965, 1966-1990,
  1991-2010, 2011-2026, prénoms français courants de chaque époque) puis `identity.ts` (`identityOf(hh, home)` appelée à la
  fin de `householdFor`), et la taille des enfants.
- [ ] **Step 4 : vert** sur `identity.test.ts` et `households.test.ts` (adapter le test des tailles aux nouvelles valeurs).
- [ ] **Step 5 : commit** `feat(ville): identité des habitants (prénom, âge, statut, métier, famille)`.

### Task 2 : traits fixes de journée

**Files :** Create `src/core/library/city/person-traits.ts` ; Test `tests/core/library/city/person-traits.test.ts`.

**Interfaces :**
- Consumes : `Identity` (tâche 1).
- Produces : `export type WorkTraits = { start: number; effective: number; commute: number; walk: boolean; prep: number; split: null | { a: [number, number]; b: [number, number]; days: number[] } ; rttPerYear: number }` ;
  `export type PersonTraits = { work: WorkTraits | null; sleep: number; bedtime: number; earlyP: number; school: null | { start: number[] /* lun→ven, minutes */; autonomous: boolean } }` ;
  `export function traitsOf(hh: Household, m: number): PersonTraits` (mémoïsée par foyer, flux `hh.seed ^ hashString('traits') ^ m`).
- Valeurs : Global Constraints ; `effective` 35h → 420, 39h → 468, forfait → 450–510 tiré, fonction publique → 450,
  hcr → 450 (en deux services) ; `work` null pour chômeur, retraité, étudiant, enfant ; `earlyP` seulement pour les
  retraités (0 sinon) ; `school` : enfant < 11 → école 8 h 20 lun/mar/jeu/ven, mercredi matin (`autonomous` false) ;
  ≥ 11 → collège, début tiré par jour de semaine parmi 480/540/600 (`autonomous` true) ; étudiant : cours, début par jour
  parmi 480–660 ou aucun (1 jour sur 5).

- [ ] **Step 1 : tests rouges** : `bornes de chaque trait` (une boucle sur 5 graines × tous les membres) ;
  `actifs seulement ont work` ; `hcr : services 11 h-14 h 30 et 18 h 30-22 h 30, mardi → samedi` ; `travail effectif ≤ 10 h
  et amplitude ≤ 11 h (13 h coupé)` ; `même membre → mêmes traits`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter** `person-traits.ts`.
- [ ] **Step 4 : vert**.
- [ ] **Step 5 : commit** `feat(ville): traits de journée des habitants (travail, trajet, sommeil, école)`.

### Task 3 : nounou, carte d'identité, tenue des fenêtres selon le sexe

**Files :** Create `src/core/library/city/id-card.ts` ; Modify `src/core/library/city/households.ts` (`Household.nanny`),
`src/content/window-life.tsx` (`windowOutfit`) ; Test `tests/core/library/city/id-card.test.ts`,
`tests/content/window-life.test.tsx` (cas ajouté).

**Interfaces :**
- Consumes : `Identity`, `traitsOf`.
- Produces : `Household.nanny: Visitor | null` avec `export type Visitor = { id: string; who: Identity; quarter: string; job: string }`
  (`quarter` : quartier d'origine, nom de quartier parisien hors champ) ; nounou présente si la famille a un enfant < 11 ans
  et que ses deux parents travaillent, avec probabilité 0,6 (contrat `particulier`, 25–60 ans, métier « nounou ») ;
  `export type IdCard = { first: string; age: number; job: string; situation: { kind: 'celibataire' } | { kind: 'couple'; with: string }; children: { first: string; age: number }[]; quarter: string | null }` ;
  `export function idCardOf(d: Dwelling, m: number): IdCard` et `export function idCardOfVisitor(v: Visitor): IdCard`
  (`job` : métier, sinon « retraité·e », « étudiant·e », « en recherche d'emploi », « écolier·ère » / « collégien·ne » /
  « lycéen·ne » accordés).
- `windowOutfit(d, m)` : coiffure et bas tirés selon `who.sex` (f : long, bun, short ; jupe/robe permises — m : short,
  bald ; pantalon/jean) ; même flux qu'aujourd'hui.

- [ ] **Step 1 : tests rouges** : `carte d'un parent : en couple avec le prénom du conjoint, enfants avec prénoms et âges` ;
  `carte d'un enfant : pas de conjoint, pas d'enfants, métier scolaire selon l'âge` ; `solo célibataire` ;
  `nounou seulement si enfant < 11 et deux parents actifs, identité stable, quartier non vide` ;
  `windowOutfit : jamais de jupe ni de robe pour un homme, jamais chauve pour une femme`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter**.
- [ ] **Step 4 : vert**, puis `npx tsc --noEmit` et `npm run test:famille -- scene-ville` (vérifier qu'aucune autre session
  ne joue vitest avant ; les empreintes de rendu qui changent à cause de la taille des enfants sont réenregistrées et
  listées dans le rapport).
- [ ] **Step 5 : commit** `feat(ville): carte d'identité des habitants et nounou des familles`.

### Task 4 : contrôle (contrôleur)

- [ ] Planche de vérification (node) : un immeuble, liste des cartes d'identité, envoyée à l'utilisateur.
- [ ] PR, fusion, `npm run preprod` (pas de rendu nouveau au-delà des tailles d'enfants : pas de mesure S26 pour ce lot ;
  la mesure se fera aux lots 2-3).
