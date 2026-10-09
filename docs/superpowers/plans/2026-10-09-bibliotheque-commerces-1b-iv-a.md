# Ville vivante 1b-iv-a : la rue commerçante — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** des commerces au rez-de-chaussée des immeubles de la scène Ville : 32 types, noms locaux (OpenStreetMap via le relais) ou écrits, cycle ouvert → À vendre / reloué, équipe du matin avec échelle, intérieur fixe visible par la vitrine, clients qui entrent et sortent.

**Architecture:** moteur pur et déterministe dans `src/core/library/city/shops/` (graine de la pièce + date, aucun `Math.random`), une seule donnée mémorisée (`Room.cityEpoch`, jour de départ). Devantures et intérieurs dans le décor fixe (`CityScene`, redessiné à la minute), clients et ouvriers dans la couche animée (`CityLifeLayer`). Noms locaux par une nouvelle route du relais `/shops` (Overpass, 25 km), gardés en mémoire seulement.

**Tech Stack:** TypeScript, React (SVG), Vitest + jsdom, zod (état), Cloudflare Worker (relais), WXT.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-commerces-design.md`

## Global Constraints

- Worktree : `C:\Users\maxim\Downloads\Wikimasters-commerces`, branche `feat/bibliotheque-commerces` (jonction `node_modules` déjà posée). Ne jamais travailler dans `C:\Users\maxim\Downloads\Wikimasters tools` ni `..\Wikimasters-bibliotheque` (autre session).
- Commentaires, textes visibles et messages de commit en français ; style des fichiers voisins (commentaires `//` denses, pas de JSDoc).
- Moteur pur : aucun `Math.random`, aucun `Date.now()` dans `src/core/library/city/shops/` ; tirages par `mulberry32` / `hashString` de `src/core/library/scene-world.ts`.
- État de la Bibliothèque : reste `version: 5`, aucune migration ; `Room.cityEpoch` est FACULTATIF.
- La position n'est jamais enregistrée (ni position, ni case, ni département) ; noms gardés en mémoire de page.
- Seuils et valeurs de la spec, à reprendre tels quels : locaux si partie visible ≥ 38 px ; ouvert 3 à 12 semaines (21 à 84 jours) ; reloué 1 fois sur 2 ; À vendre 1 à 3 semaines (7 à 21 jours) ; changement jamais un dimanche ni un jour férié ; chantier début 8 h 30-9 h 30, fin vers 12 h ; rayon Overpass 25 000 m ; ≤ 30 noms par type, ≤ 24 caractères ; cache relais 30 jours ; échec côté extension mémorisé 24 h ; clients au plus 2 par local.
- Fiche WikiHow : id `bibliotheque-v23` (la v22 est réservée à la vague 1c).
- Tests : `npx vitest run <fichiers> --maxWorkers=4` ; suite complète `npx vitest run --maxWorkers=4` ; `npm run typecheck` ; `npm run build`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Écarts à la spec (décidés à l'écriture du plan)

- `Room.cityEpoch` contient un **numéro de jour local** (jours depuis le 1970-01-01 de la date locale, `dayNumber`), pas des millisecondes : c'est l'unité de tout le cycle.
- La date de départ est posée par le panneau pour toute pièce dont la scène est « Ville » et qui n'en a pas encore (dès l'ouverture de la Bibliothèque), pas au premier affichage effectif de la fenêtre.
- Pendant un chantier, le rideau est levé et l'intérieur est vide (déménagement = 1b-iv-b).
- Les ouvriers se déplacent par transition CSS de 30 s entre deux rendus à la minute (pas dans la boucle d'animation) : leurs pas sont moins fins que ceux des passants.
- Le choix du nom consomme toujours exactement un tirage : le type et les dates ne dépendent jamais des noms disponibles.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/city/shops/catalog.ts` (créé) | `SHOP_TYPE_IDS`, `SHOP_DEFS` (32 types : horaires, couleurs, store, clientèle, noms écrits) |
| `src/core/library/city/shops/hours.ts` (créé) | `dayNumber`, `ymdOfDay`, `isWorkday`, `nextWorkday`, `isOpenAt`, `crowdAt` |
| `src/core/library/city/shops/slots.ts` (créé) | `SHOP_MIN_WIDTH`, `shopSlotsFor`, géométrie `shopFrame` |
| `src/core/library/city/doors.ts` (modifié) | entrée poussée au bord dans un immeuble à local |
| `src/core/library/city/shops/lifecycle.ts` (créé) | `streetOn` (simulation conjointe des locaux), `NamePool`, `Tenant`, `Change` |
| `src/core/library/city/shops/works.ts` (créé) | `worksPlan`, `worksAt`, étapes du chantier |
| `src/core/library/city/shops/view.ts` (créé) | `shopViewAt` : ce qu'on dessine à une minute donnée |
| `src/core/library/city/shops/customers.ts` (créé) | `visitsFor`, `visitAt`, `visitHappens`, `customerGate` |
| `relay/src/shops.ts` (créé), `relay/src/index.ts` (modifié) | route `/shops` |
| `src/core/library/library-types.ts`, `library-book.ts` (modifiés) | `Room.cityEpoch?` + `setCityEpoch` |
| `src/core/library/city/intensity.ts` (modifié) | `CityContext.shops?` |
| `src/content/use-shop-names.ts` (créé) | noms locaux (relais, mémoire, échec 24 h) |
| `src/content/LibraryPanel.tsx`, `RoomView.tsx` (modifiés) | pose de `cityEpoch`, transmission des noms et du départ |
| `src/content/shop-sprites.tsx` (créé) | devanture, enseigne, rideau, écriteau, bandeau nu, échelle, ouvrier |
| `src/content/shop-interiors.tsx` (créé) | 32 intérieurs fixes + vendeur |
| `src/content/scene-city.tsx`, `city-life.tsx` (modifiés) | dessin des locaux, clients, équipe |
| `src/core/whats-new/entries.ts` (modifié) | fiche `bibliotheque-v23` |

Tests : `tests/core/library/city-shops-*.test.ts`, `tests/relay/shops.test.ts`, `tests/content/shop-*.test.tsx`, `tests/content/use-shop-names.test.tsx`.

---

### Task 1 : catalogue des 32 types et horaires

**Files:**
- Create: `src/core/library/city/shops/catalog.ts`, `src/core/library/city/shops/hours.ts`
- Test: `tests/core/library/city-shops-catalog.test.ts`, `tests/core/library/city-shops-hours.test.ts`

**Interfaces:**
- Consumes: `publicHolidays(year)`, `isoDate`, `weekdayOf`, `addDays`, type `YMD` de `src/core/library/city/calendar.ts`.
- Produces :
  - `type ShopTypeId` (32 ids ci-dessous), `SHOP_TYPE_IDS: readonly ShopTypeId[]`, `type CrowdProfile`, `type ShopDef`, `SHOP_DEFS: Readonly<Record<ShopTypeId, ShopDef>>`.
  - `dayNumber(date: YMD): number`, `ymdOfDay(n: number): YMD`, `isWorkday(n: number): boolean`, `nextWorkday(n: number): number`, `isOpenAt(def: ShopDef, date: YMD, minutes: number): boolean`, `crowdAt(def: ShopDef, minutes: number): number` (0..1).

- [ ] **Step 1 : écrire les tests qui échouent**

`tests/core/library/city-shops-catalog.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SHOP_DEFS, SHOP_TYPE_IDS } from '../../../src/core/library/city/shops/catalog';

describe('catalogue des commerces', () => {
  it('a 32 types, chacun décrit sous sa clé', () => {
    expect(SHOP_TYPE_IDS).toHaveLength(32);
    for (const id of SHOP_TYPE_IDS) expect(SHOP_DEFS[id].id).toBe(id);
  });
  it('donne 10 à 15 noms écrits par type, uniques dans tout le catalogue, de 24 caractères au plus', () => {
    const all: string[] = [];
    for (const id of SHOP_TYPE_IDS) {
      const names = SHOP_DEFS[id].names;
      expect(names.length).toBeGreaterThanOrEqual(10);
      expect(names.length).toBeLessThanOrEqual(15);
      for (const n of names) expect(n.length).toBeLessThanOrEqual(24);
      all.push(...names);
    }
    expect(new Set(all).size).toBe(all.length);
  });
  it('a des plages horaires ordonnées dans [0, 2880) et des jours dans 0..6', () => {
    for (const id of SHOP_TYPE_IDS) {
      const d = SHOP_DEFS[id];
      expect(d.days.length).toBeGreaterThan(0);
      for (const day of d.days) expect(day >= 0 && day <= 6).toBe(true);
      for (const [a, b] of [...d.hours, ...(d.sundayHours ?? [])]) expect(0 <= a && a < b && b < 2880).toBe(true);
    }
  });
  it('met un store au café, au fleuriste et au primeur seulement', () => {
    expect(SHOP_TYPE_IDS.filter((id) => SHOP_DEFS[id].awning).sort()).toEqual(['cafe', 'florist', 'greengrocer']);
  });
});
```

`tests/core/library/city-shops-hours.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SHOP_DEFS } from '../../../src/core/library/city/shops/catalog';
import { crowdAt, dayNumber, isOpenAt, isWorkday, nextWorkday, ymdOfDay } from '../../../src/core/library/city/shops/hours';

const ymd = (y: number, m: number, d: number) => ({ y, m, d });

describe('jours', () => {
  it('numérote les jours depuis 1970 et revient à la date', () => {
    expect(dayNumber(ymd(1970, 1, 2))).toBe(1);
    expect(ymdOfDay(dayNumber(ymd(2026, 10, 9)))).toEqual(ymd(2026, 10, 9));
  });
  it('saute les dimanches et les jours fériés', () => {
    expect(isWorkday(dayNumber(ymd(2026, 10, 11)))).toBe(false); // dimanche
    expect(isWorkday(dayNumber(ymd(2026, 11, 11)))).toBe(false); // 11 novembre (mercredi)
    expect(isWorkday(dayNumber(ymd(2026, 10, 10)))).toBe(true); // samedi
    expect(ymdOfDay(nextWorkday(dayNumber(ymd(2026, 10, 11))))).toEqual(ymd(2026, 10, 12));
    expect(ymdOfDay(nextWorkday(dayNumber(ymd(2026, 12, 25))))).toEqual(ymd(2026, 12, 26));
  });
});

describe('horaires', () => {
  it('ferme la boulangerie le lundi et l’ouvre le dimanche matin seulement', () => {
    const b = SHOP_DEFS.bakery;
    expect(isOpenAt(b, ymd(2026, 10, 12), 600)).toBe(false); // lundi
    expect(isOpenAt(b, ymd(2026, 10, 13), 7 * 60)).toBe(true); // mardi 7 h
    expect(isOpenAt(b, ymd(2026, 10, 11), 12 * 60)).toBe(true); // dimanche midi
    expect(isOpenAt(b, ymd(2026, 10, 11), 14 * 60)).toBe(false); // dimanche après-midi
  });
  it('rattache la plage qui passe minuit au jour où elle commence', () => {
    const bar = SHOP_DEFS.bar;
    expect(isOpenAt(bar, ymd(2026, 10, 11), 90)).toBe(true); // dimanche 1 h 30 : soirée du samedi
    expect(isOpenAt(bar, ymd(2026, 10, 11), 150)).toBe(false); // 2 h 30
    const club = SHOP_DEFS.nightclub;
    expect(isOpenAt(club, ymd(2026, 10, 10), 4 * 60)).toBe(true); // samedi 4 h : nuit du vendredi
    expect(isOpenAt(club, ymd(2026, 10, 12), 60)).toBe(false); // lundi 1 h : dimanche fermé
  });
  it('ferme les jours fériés sauf les commerces qui y ouvrent', () => {
    const noel = ymd(2026, 12, 25); // vendredi
    expect(isOpenAt(SHOP_DEFS.bookshop, noel, 15 * 60)).toBe(false);
    expect(isOpenAt(SHOP_DEFS.minimarket, noel, 15 * 60)).toBe(true);
  });
  it('donne une clientèle nulle hors des heures de pointe d’un commerce de nuit', () => {
    expect(crowdAt(SHOP_DEFS.nightclub, 12 * 60)).toBe(0);
    expect(crowdAt(SHOP_DEFS.nightclub, 60)).toBeGreaterThan(0.5);
    expect(crowdAt(SHOP_DEFS.bakery, 8 * 60)).toBeGreaterThan(crowdAt(SHOP_DEFS.bakery, 15 * 60));
  });
});
```

- [ ] **Step 2 : lancer les tests (échec attendu : modules absents)**

Run: `npx vitest run tests/core/library/city-shops-catalog.test.ts tests/core/library/city-shops-hours.test.ts --maxWorkers=4`
Expected: FAIL (« Failed to resolve import »).

- [ ] **Step 3 : écrire `catalog.ts`**

Structure exacte (les valeurs d'horaires, jours et fériés sont celles du tableau de la spec, en minutes ; jours : 0 = dimanche … 6 = samedi ; une plage qui passe minuit a une fin > 1440) :

```ts
// Catalogue des commerces de la scène Ville (vague 1b-iv-a) : horaires, couleurs, clientèle et noms écrits.
// Les noms écrits servent quand le relais ne donne aucun nom local pour le type (ou pas de position).
export const SHOP_TYPE_IDS = [
  'bakery', 'pastry', 'chocolatier', 'butcher', 'fishmonger', 'cheese', 'greengrocer', 'wine', 'grocery', 'minimarket',
  'pharmacy', 'florist', 'bookshop', 'records', 'games', 'hairdresser', 'optician', 'tattoo', 'thrift', 'antiques',
  'petshop', 'bikes', 'laundry', 'cafe', 'restaurant', 'pizzeria', 'kebab', 'sushi', 'tearoom', 'arcade', 'bar', 'nightclub',
] as const;
export type ShopTypeId = (typeof SHOP_TYPE_IDS)[number];

// Forme de la clientèle sur la journée (voir crowdAt) ; `level` règle l'affluence (0,2 rares … 1 très nombreux).
export type CrowdProfile = 'morning' | 'meals' | 'afternoon' | 'regular' | 'evening' | 'night' | 'after-school' | 'allday';

export type ShopDef = {
  id: ShopTypeId;
  label: string;
  days: readonly number[];
  hours: readonly (readonly [number, number])[];
  // Plages propres au dimanche (boulangerie, fleuriste : le matin) ; absent = mêmes plages que les autres jours.
  sundayHours?: readonly (readonly [number, number])[];
  // Ouvert les jours fériés (supérette, laverie, bar, boîte, arcade, pizzeria, kebab, sushis).
  holidays: boolean;
  sign: string; // fond de l'enseigne
  ink: string; // lettres
  wall: string; // mur intérieur
  floor: string; // sol intérieur
  awning: boolean;
  crowd: CrowdProfile;
  level: number;
  names: readonly string[];
};

const H = (h: number, m = 0): number => h * 60 + m;
```

puis `export const SHOP_DEFS: Readonly<Record<ShopTypeId, ShopDef>> = { … }` avec, pour chaque type, ces valeurs :

| id | label | days | hours | sundayHours | holidays | crowd, level |
|---|---|---|---|---|---|---|
| bakery | Boulangerie | 0,2,3,4,5,6 | [H(7),H(20)] | [H(7),H(13)] | false | morning, 1 |
| pastry | Pâtisserie | 0,2,3,4,5,6 | [H(9),H(19)] | — | false | afternoon, 0.6 |
| chocolatier | Chocolatier | 2..6 | [H(10),H(19)] | — | false | regular, 0.3 |
| butcher | Boucherie | 2..6 | [H(8),H(19,30)] | — | false | morning, 0.6 |
| fishmonger | Poissonnerie | 2..6 | [H(8),H(13)] | — | false | morning, 0.6 |
| cheese | Fromager | 2..6 | [H(9),H(19,30)] | — | false | regular, 0.5 |
| greengrocer | Primeur | 1..6 | [H(8),H(20)] | — | false | regular, 0.6 |
| wine | Caviste | 2..6 | [H(10),H(20)] | — | false | evening, 0.4 |
| grocery | Épicerie | 1..6 | [H(8),H(21)] | — | false | regular, 0.6 |
| minimarket | Supérette | 0..6 | [H(8),H(23)] | — | true | allday, 0.7 |
| pharmacy | Pharmacie | 1..6 | [H(9),H(19,30)] | — | false | regular, 0.6 |
| florist | Fleuriste | 0,2,3,4,5,6 | [H(9),H(19)] | [H(9),H(13)] | false | regular, 0.4 |
| bookshop | Librairie | 2..6 | [H(10),H(19)] | — | false | afternoon, 0.5 |
| records | Disquaire | 2..6 | [H(11),H(19)] | — | false | regular, 0.3 |
| games | Magasin de jeux | 2..6 | [H(10),H(19)] | — | false | after-school, 0.5 |
| hairdresser | Coiffeur | 2..6 | [H(9),H(19)] | — | false | regular, 0.5 |
| optician | Opticien | 2..6 | [H(10),H(19)] | — | false | regular, 0.3 |
| tattoo | Tatoueur | 2..6 | [H(11),H(20)] | — | false | regular, 0.2 |
| thrift | Friperie | 2..6 | [H(11),H(19)] | — | false | afternoon, 0.5 |
| antiques | Antiquaire | 3..6 | [H(14),H(19)] | — | false | afternoon, 0.2 |
| petshop | Animalerie | 2..6 | [H(10),H(19)] | — | false | afternoon, 0.5 |
| bikes | Vélociste | 2..6 | [H(9),H(19)] | — | false | regular, 0.4 |
| laundry | Laverie | 0..6 | [H(7),H(22)] | — | true | allday, 0.5 |
| cafe | Café | 1..6 | [H(7),H(20)] | — | false | meals, 0.8 |
| restaurant | Restaurant | 2..6 | [H(12),H(14,30)], [H(19),H(23)] | — | false | meals, 0.7 |
| pizzeria | Pizzeria | 0..6 | [H(11,30),H(14)], [H(18),H(23,30)] | — | true | meals, 0.7 |
| kebab | Kebab | 0..6 | [H(11,30),H(14)], [H(18),H(23,30)] | — | true | meals, 0.7 |
| sushi | Sushis | 0..6 | [H(11,30),H(14)], [H(18),H(23,30)] | — | true | meals, 0.6 |
| tearoom | Salon de thé | 0,3,4,5,6 | [H(14),H(19)] | — | false | afternoon, 0.5 |
| arcade | Salle d'arcade | 0..6 | [H(14),H(25)] | — | true | evening, 0.6 |
| bar | Bar | 0..6 | [H(17),H(26)] | — | true | night, 0.8 |
| nightclub | Boîte de nuit | 4,5,6 | [H(23),H(29)] | — | true | night, 1 |

Couleurs (`sign`, `ink`, `wall`, `floor`) : une palette distincte par type, lisible (contraste enseigne/lettres franc), en `#RRGGBB` ; exemples imposés : `pharmacy` sign `#1E8A4C` ink `#FFFFFF` ; `bakery` sign `#8A4B1E` ink `#F7E3B5` ; `bar` sign `#2A1A3A` ink `#FFB347` ; `nightclub` sign `#120A24` ink `#FF4FD8`. Aucune paire (sign, ink) répétée.

`awning: true` pour `cafe`, `florist`, `greengrocer` uniquement.

`names` : 10 à 15 noms par type, inventés à partir de vrais usages de devantures françaises (jeux de mots, « Chez … », « Au … », « Le … »), crédibles et drôles, ≤ 24 caractères, tous différents dans tout le catalogue. Exemples imposés à inclure : bakery « Au Pain Perdu », hairdresser « L'Hair du temps », bar « Le Zinc », florist « Au Nom de la Rose », bookshop « Les Mots Passants », fishmonger « Il était une Fish ». Aucune marque réelle (pas d'enseigne nationale).

- [ ] **Step 4 : écrire `hours.ts`**

```ts
import { addDays, isoDate, publicHolidays, weekdayOf, type YMD } from '../calendar';
import type { ShopDef } from './catalog';

// Jours comptés depuis le 1970-01-01 (date locale, sans fuseau) : unité du cycle de vie des commerces.
export const dayNumber = ({ y, m, d }: YMD): number => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
export function ymdOfDay(n: number): YMD {
  const date = new Date(n * 86_400_000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

const holidayOf = (date: YMD): boolean => isoDate(date) in publicHolidays(date.y);

// Jour où une équipe peut venir : ni dimanche ni jour férié.
export const isWorkday = (n: number): boolean => {
  const date = ymdOfDay(n);
  return weekdayOf(date) !== 0 && !holidayOf(date);
};
export function nextWorkday(n: number): number {
  let day = n;
  while (!isWorkday(day)) day++;
  return day;
}

// Plages d'un jour donné (dimanche : plages propres s'il y en a) ; aucune si le commerce est fermé ce jour-là.
function rangesOf(def: ShopDef, date: YMD): readonly (readonly [number, number])[] {
  const weekday = weekdayOf(date);
  if (!def.days.includes(weekday)) return [];
  if (!def.holidays && holidayOf(date)) return [];
  return weekday === 0 && def.sundayHours ? def.sundayHours : def.hours;
}

// Ouvert à `minutes` (0..1439) du jour `date` : plages du jour, ou fin d'une plage de la veille qui passe minuit.
export function isOpenAt(def: ShopDef, date: YMD, minutes: number): boolean {
  if (rangesOf(def, date).some(([a, b]) => minutes >= a && minutes < b)) return true;
  return rangesOf(def, addDays(date, -1)).some(([, b]) => b > 1440 && minutes < b - 1440);
}

// Affluence (0..1) selon la forme de clientèle, multipliée par `level` ; l'ouverture est vérifiée à part (isOpenAt).
export function crowdAt(def: ShopDef, minutes: number): number {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  const bump = (center: number, width: number): number => Math.max(0, 1 - Math.abs(h - center) / width);
  let shape: number;
  switch (def.crowd) {
    case 'morning': shape = Math.max(bump(8, 2), bump(12.5, 1.5), 0.3); break;
    case 'meals': shape = Math.max(bump(8, 1.5) * 0.7, bump(12.75, 1.5), bump(20, 2), 0.15); break;
    case 'afternoon': shape = Math.max(bump(16, 3), 0.25); break;
    case 'after-school': shape = Math.max(bump(17, 1.5), 0.25); break;
    case 'evening': shape = Math.max(bump(19, 3), 0.2); break;
    case 'night': shape = h >= 22 || h < 4 ? 1 : h >= 18 ? 0.5 : 0; break;
    case 'allday': shape = 0.6; break;
    default: shape = Math.max(bump(11, 3), bump(17.5, 2), 0.35);
  }
  return Math.min(1, shape * def.level);
}
```

- [ ] **Step 5 : relancer les tests (attendu : PASS)**

Run: `npx vitest run tests/core/library/city-shops-catalog.test.ts tests/core/library/city-shops-hours.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 6 : commit**

```bash
git add src/core/library/city/shops tests/core/library/city-shops-catalog.test.ts tests/core/library/city-shops-hours.test.ts
git commit -m "feat(ville): catalogue de 32 commerces et leurs horaires"
```

---

### Task 2 : emplacements des locaux et entrée poussée au bord

**Files:**
- Create: `src/core/library/city/shops/slots.ts`
- Modify: `src/core/library/city/doors.ts` (fonction `doorsFor`)
- Test: `tests/core/library/city-shops-slots.test.ts` ; vérifier `tests/core/library/city-doors.test.ts`

**Interfaces:**
- Consumes: `citySkyline`, `mulberry32`, `hashString` (`scene-world.ts`), `DOOR_WIDTH`, `DOOR_MARGIN` (`doors.ts`), `GROUND_FLOOR` (`facades.ts`).
- Produces :
  - `SHOP_MIN_WIDTH = 38`, `type ShopSlot = { id: string; index: number; x: number; w: number; doorSide: 'left' | 'right'; residentDoorX: number }` (`x`, `w` : zone du local, porte d'habitants exclue).
  - `shopSlotsFor(width: number, height: number, seed: number): ShopSlot[]`.
  - `type ShopFrame = { sign: Rect; window: Rect; door: Rect }` avec `Rect = { x: number; y: number; w: number; h: number }`, `shopFrame(slot: ShopSlot, ground: number): ShopFrame`.
  - `doorsFor` : même signature ; pour un immeuble à local, `door.x === slot.residentDoorX`.

- [ ] **Step 1 : tests qui échouent** (`tests/core/library/city-shops-slots.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { DOOR_MARGIN, DOOR_WIDTH, doorsFor } from '../../../src/core/library/city/doors';
import { SHOP_MIN_WIDTH, shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { citySkyline } from '../../../src/core/library/scene-world';

describe('locaux commerciaux', () => {
  it('ne donne un local qu’aux immeubles du premier plan assez larges (environ 60 %)', () => {
    let near = 0;
    let shops = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const visible = citySkyline(1440, 340, seed).filter((b) => !b.far && Math.min(b.x + b.w, 1440) - Math.max(b.x, 0) > 0);
      near += visible.length;
      shops += shopSlotsFor(1440, 340, seed).length;
    }
    expect(shops / near).toBeGreaterThan(0.5);
    expect(shops / near).toBeLessThan(0.7);
  });
  it('met l’entrée des habitants au bord et le local dans le reste, sans chevauchement', () => {
    const slots = shopSlotsFor(1440, 340, 7);
    const doors = doorsFor(1440, 340, 7);
    for (const s of slots) {
      expect(doors.some((d) => d.x === s.residentDoorX)).toBe(true);
      const doorEnd = s.residentDoorX + DOOR_WIDTH;
      expect(s.x >= doorEnd || s.x + s.w <= s.residentDoorX).toBe(true);
      expect(s.w).toBeGreaterThanOrEqual(SHOP_MIN_WIDTH - DOOR_WIDTH - 2 * DOOR_MARGIN - 2);
    }
  });
  it('place enseigne, vitrine et porte dans le rez-de-chaussée', () => {
    const [s] = shopSlotsFor(1440, 340, 3);
    const f = shopFrame(s!, 238);
    expect(f.sign.y).toBeGreaterThanOrEqual(238 - 30);
    expect(f.window.y + f.window.h).toBeLessThanOrEqual(238);
    expect(f.window.w + f.door.w).toBeLessThanOrEqual(s!.w);
    expect(f.window.w).toBeGreaterThanOrEqual(8);
  });
  it('donne des identifiants stables shop-0, shop-1…', () => {
    expect(shopSlotsFor(720, 340, 5).map((s) => s.id)).toEqual(shopSlotsFor(720, 340, 5).map((_, i) => `shop-${i}`));
  });
});
```

- [ ] **Step 2 : lancer (échec attendu)** — `npx vitest run tests/core/library/city-shops-slots.test.ts --maxWorkers=4` → FAIL.

- [ ] **Step 3 : écrire `slots.ts`**

```ts
import { citySkyline, hashString, mulberry32 } from '../../scene-world';
import { DOOR_MARGIN, DOOR_WIDTH } from '../metrics';
import { GROUND_FLOOR } from '../facades';

// Locaux commerciaux : immeubles du premier plan dont la partie visible fait au moins SHOP_MIN_WIDTH px (≈ 60 %).
// L'entrée des habitants est poussée au bord (côté tiré) ; le local occupe le reste du rez-de-chaussée.
export const SHOP_MIN_WIDTH = 38;
// Écart entre l'entrée des habitants et le local.
const GAP = 2;
// Porte vitrée du magasin, à côté de la vitrine.
const SHOP_DOOR = 6;

export type ShopSlot = { id: string; index: number; x: number; w: number; doorSide: 'left' | 'right'; residentDoorX: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type ShopFrame = { sign: Rect; window: Rect; door: Rect };

export function shopSlotsFor(width: number, height: number, seed: number): ShopSlot[] {
  // Générateur propre aux locaux : les tirages de doorsFor (position, variante, hall) ne bougent pas.
  const rng = mulberry32(seed ^ hashString('shop-slots'));
  const out: ShopSlot[] = [];
  for (const b of citySkyline(width, height, seed)) {
    if (b.far || b.x + b.w <= 0 || b.x >= width) continue;
    const side: 'left' | 'right' = rng() < 0.5 ? 'left' : 'right';
    const lo = Math.max(b.x, 0);
    const hi = Math.min(b.x + b.w, width);
    if (hi - lo < SHOP_MIN_WIDTH) continue;
    const residentDoorX = Math.floor((side === 'left' ? lo + DOOR_MARGIN : hi - DOOR_MARGIN - DOOR_WIDTH) * 10) / 10;
    const x = side === 'left' ? residentDoorX + DOOR_WIDTH + GAP : lo + DOOR_MARGIN;
    const end = side === 'left' ? hi - DOOR_MARGIN : residentDoorX - GAP;
    out.push({ id: `shop-${out.length}`, index: out.length, x, w: end - x, doorSide: side, residentDoorX });
  }
  return out;
}

// Géométrie d'un local (repère du monde) : enseigne en haut du rez-de-chaussée, vitrine dessous, porte côté rue latérale
// opposé à l'entrée des habitants.
export function shopFrame(slot: ShopSlot, ground: number): ShopFrame {
  const top = ground - GROUND_FLOOR;
  const sign = { x: slot.x, y: top + 2, w: slot.w, h: 5 };
  const doorX = slot.doorSide === 'left' ? slot.x + slot.w - SHOP_DOOR : slot.x;
  const door = { x: doorX, y: top + 9, w: SHOP_DOOR, h: GROUND_FLOOR - 9 };
  const window = { x: slot.doorSide === 'left' ? slot.x : slot.x + SHOP_DOOR + 1, y: top + 8, w: slot.w - SHOP_DOOR - 1, h: GROUND_FLOOR - 9 };
  return { sign, window, door };
}
```

- [ ] **Step 4 : modifier `doorsFor`** (`src/core/library/city/doors.ts`) : garder les trois tirages par immeuble ; après le calcul de `lo`/`hi`, si l'immeuble a un local (même test `hi0 - lo0 >= SHOP_MIN_WIDTH` sur la partie visible), prendre `x = slot.residentDoorX` du local correspondant au lieu de `lo + at * (hi - lo)`. Implémentation : appeler `shopSlotsFor(width, height, seed)` une fois en tête, et faire correspondre par immeuble (index de l'immeuble visible au premier plan, compté dans la même boucle). Ajouter le commentaire : `// Immeuble à local : l'entrée est poussée au bord (shops/slots.ts), le local prend le reste du rez-de-chaussée.`
  Attention à l'import circulaire : `slots.ts` importe `DOOR_MARGIN`/`DOOR_WIDTH` de `doors.ts`. Déplacer ces deux constantes dans `metrics.ts` et les réexporter depuis `doors.ts` (`export { DOOR_MARGIN, DOOR_WIDTH } from './metrics';`), puis les importer de `../metrics` dans `slots.ts`.

- [ ] **Step 5 : lancer** `npx vitest run tests/core/library/city-shops-slots.test.ts tests/core/library/city-doors.test.ts tests/content/city-life.test.tsx --maxWorkers=4` → PASS. Si un test existant de `city-doors` fige une position x d'entrée d'un immeuble large, le mettre à jour en le justifiant dans le message de commit (l'entrée de ces immeubles est désormais au bord).

- [ ] **Step 6 : commit** — `git commit -m "feat(ville): locaux commerciaux au rez-de-chaussée, entrée des habitants au bord"`

---

### Task 3 : cycle de vie de la rue (simulation conjointe)

**Files:**
- Create: `src/core/library/city/shops/lifecycle.ts`
- Test: `tests/core/library/city-shops-lifecycle.test.ts`

**Interfaces:**
- Consumes: `SHOP_DEFS`, `SHOP_TYPE_IDS`, `ShopTypeId` (Task 1), `nextWorkday`, `isWorkday`, `ymdOfDay` (Task 1), `ShopSlot` (Task 2), `mulberry32`, `hashString`.
- Produces :
  - `type NamePool = Partial<Record<ShopTypeId, readonly string[]>>`
  - `type Tenant = { type: ShopTypeId; name: string; from: number }`
  - `type Change = { day: number; kind: 'relet' | 'to-sale' | 'from-sale'; before: Tenant | null; after: Tenant | null }`
  - `type SlotDay = { slot: ShopSlot; tenant: Tenant | null; change: Change | null }` (`tenant` = occupant APRÈS le changement du jour s'il y en a un ; `change` seulement si un changement a lieu ce jour-là)
  - `streetOn(slots: ShopSlot[], seed: number, epochDay: number, day: number, pool: NamePool): SlotDay[]`
  - constantes `OPEN_DAYS = [21, 84]`, `SALE_DAYS = [7, 21]`, `RELET_CHANCE = 0.5`.

- [ ] **Step 1 : tests qui échouent**

```ts
import { describe, expect, it } from 'vitest';
import { SHOP_DEFS } from '../../../src/core/library/city/shops/catalog';
import { isWorkday } from '../../../src/core/library/city/shops/hours';
import { streetOn, type SlotDay } from '../../../src/core/library/city/shops/lifecycle';
import { shopSlotsFor } from '../../../src/core/library/city/shops/slots';

const slots = shopSlotsFor(1440, 340, 11);
const EPOCH = 20_000;
const days = (from: number, to: number): SlotDay[][] => Array.from({ length: to - from }, (_, i) => streetOn(slots, 11, EPOCH, from + i, {}));

describe('cycle de vie des commerces', () => {
  it('occupe tous les locaux au départ, avec des types tous différents', () => {
    const start = streetOn(slots, 11, EPOCH, EPOCH, {});
    expect(start.every((s) => s.tenant !== null)).toBe(true);
    const types = start.map((s) => s.tenant!.type);
    expect(new Set(types).size).toBe(Math.min(types.length, 32));
  });
  it('étale les premiers changements (pas tous le même jour)', () => {
    const firstChange = slots.map((s) => days(EPOCH, EPOCH + 90).findIndex((street) => street.find((x) => x.slot.id === s.id)!.change !== null));
    expect(new Set(firstChange).size).toBeGreaterThan(Math.min(slots.length, 5) - 1);
  });
  it('ne change jamais un dimanche ni un jour férié, et jamais vers le même type', () => {
    for (const street of days(EPOCH, EPOCH + 400)) {
      for (const s of street) {
        if (!s.change) continue;
        expect(isWorkday(s.change.day)).toBe(true);
        if (s.change.before && s.change.after) expect(s.change.after.type).not.toBe(s.change.before.type);
      }
    }
  });
  it('garde un local À vendre 7 à 21 jours, puis le reloue', () => {
    const history = days(EPOCH, EPOCH + 600);
    for (const slot of slots) {
      let saleStart: number | null = null;
      history.forEach((street, i) => {
        const s = street.find((x) => x.slot.id === slot.id)!;
        if (s.change?.kind === 'to-sale') saleStart = EPOCH + i;
        if (s.change?.kind === 'from-sale' && saleStart !== null) {
          const length = EPOCH + i - saleStart;
          expect(length).toBeGreaterThanOrEqual(7);
          expect(length).toBeLessThanOrEqual(21 + 7); // + report éventuel au jour ouvré suivant
          saleStart = null;
        }
      });
    }
  });
  it('reloue environ une fois sur deux', () => {
    let relet = 0;
    let toSale = 0;
    for (const street of days(EPOCH, EPOCH + 1500)) for (const s of street) {
      if (s.change?.kind === 'relet') relet++;
      if (s.change?.kind === 'to-sale') toSale++;
    }
    expect(relet / (relet + toSale)).toBeGreaterThan(0.35);
    expect(relet / (relet + toSale)).toBeLessThan(0.65);
  });
  it('prend un nom local s’il y en a, sinon un nom écrit, sans doublon dans la rue', () => {
    const local = streetOn(slots, 11, EPOCH, EPOCH, { bar: ['Le Welsh'] });
    const bar = local.find((s) => s.tenant?.type === 'bar');
    if (bar) expect(bar.tenant!.name).toBe('Le Welsh');
    const names = streetOn(slots, 11, EPOCH, EPOCH + 200, {}).flatMap((s) => (s.tenant ? [s.tenant.name] : []));
    expect(new Set(names).size).toBe(names.length);
    for (const s of streetOn(slots, 11, EPOCH, EPOCH, {})) expect(SHOP_DEFS[s.tenant!.type].names).toContain(s.tenant!.name);
  });
  it('ne fait pas dépendre types et dates des noms disponibles', () => {
    const a = streetOn(slots, 11, EPOCH, EPOCH + 300, {});
    const b = streetOn(slots, 11, EPOCH, EPOCH + 300, { bar: ['A', 'B'], bakery: ['C'] });
    expect(a.map((s) => [s.tenant?.type, s.tenant?.from])).toEqual(b.map((s) => [s.tenant?.type, s.tenant?.from]));
  });
  it('traite un jour antérieur au départ comme le jour du départ', () => {
    expect(streetOn(slots, 11, EPOCH, EPOCH - 10, {})).toEqual(streetOn(slots, 11, EPOCH, EPOCH, {}));
  });
});
```

- [ ] **Step 2 : lancer (échec attendu).**

- [ ] **Step 3 : écrire `lifecycle.ts`**

```ts
import { hashString, mulberry32 } from '../../scene-world';
import { SHOP_DEFS, SHOP_TYPE_IDS, type ShopTypeId } from './catalog';
import { nextWorkday } from './hours';
import type { ShopSlot } from './slots';

// Cycle de vie des locaux, calculé (rien n'est enregistré sauf le jour de départ de la pièce, `epochDay`).
// Tous les locaux sont simulés ENSEMBLE, dans l'ordre des jours de changement (à égalité, dans l'ordre des locaux) :
// un nouveau commerce n'a jamais le type de l'ancien, ni celui d'un autre local occupé de la pièce (s'il reste du choix),
// et jamais le nom d'un autre local. Chaque local a son propre générateur ; le choix du nom consomme toujours UN tirage,
// si bien que types et dates ne dépendent pas des noms disponibles (position connue ou non).
export const OPEN_DAYS = [21, 84] as const;
export const SALE_DAYS = [7, 21] as const;
export const RELET_CHANCE = 0.5;

export type NamePool = Partial<Record<ShopTypeId, readonly string[]>>;
export type Tenant = { type: ShopTypeId; name: string; from: number };
export type Change = { day: number; kind: 'relet' | 'to-sale' | 'from-sale'; before: Tenant | null; after: Tenant | null };
export type SlotDay = { slot: ShopSlot; tenant: Tenant | null; change: Change | null };

type Track = { slot: ShopSlot; rng: () => number; tenant: Tenant | null; next: number; last: Change | null };

const between = (rng: () => number, [lo, hi]: readonly [number, number]): number => lo + Math.floor(rng() * (hi - lo + 1));

function pickType(rng: () => number, previous: ShopTypeId | null, taken: ReadonlySet<ShopTypeId>): ShopTypeId {
  const free = SHOP_TYPE_IDS.filter((id) => id !== previous && !taken.has(id));
  const list = free.length > 0 ? free : SHOP_TYPE_IDS.filter((id) => id !== previous);
  return list[Math.floor(rng() * list.length)]!;
}

function pickName(rng: () => number, type: ShopTypeId, pool: NamePool, taken: ReadonlySet<string>): string {
  const u = rng();
  const local = (pool[type] ?? []).filter((n) => !taken.has(n));
  const written = SHOP_DEFS[type].names.filter((n) => !taken.has(n));
  const list = local.length > 0 ? local : written.length > 0 ? written : SHOP_DEFS[type].names;
  return list[Math.floor(u * list.length)]!;
}

export function streetOn(slots: ShopSlot[], seed: number, epochDay: number, day: number, pool: NamePool): SlotDay[] {
  const target = Math.max(day, epochDay);
  const tracks: Track[] = [];
  const typesOf = (except: Track): Set<ShopTypeId> => new Set(tracks.filter((t) => t !== except && t.tenant).map((t) => t.tenant!.type));
  const namesOf = (except: Track): Set<string> => new Set(tracks.filter((t) => t !== except && t.tenant).map((t) => t.tenant!.name));
  const newTenant = (t: Track, previous: ShopTypeId | null, from: number): Tenant => {
    const type = pickType(t.rng, previous, typesOf(t));
    return { type, name: pickName(t.rng, type, pool, namesOf(t)), from };
  };
  // Départ : chaque local est ouvert depuis un « âge » tiré dans sa première période (changements étalés).
  for (const slot of slots) {
    const t: Track = { slot, rng: mulberry32(seed ^ hashString('shops') ^ Math.imul(slot.index + 1, 2654435761)), tenant: null, next: 0, last: null };
    tracks.push(t);
    const length = between(t.rng, OPEN_DAYS);
    const age = Math.floor(t.rng() * length);
    t.tenant = newTenant(t, null, epochDay - age);
    t.next = nextWorkday(epochDay - age + length);
  }
  // Changements dans l'ordre, jusqu'au jour visé compris.
  for (;;) {
    let due: Track | null = null;
    for (const t of tracks) if (t.next <= target && (due === null || t.next < due.next)) due = t;
    if (!due) break;
    const at = due.next;
    const before = due.tenant;
    if (before === null) {
      const after = newTenant(due, null, at);
      due.last = { day: at, kind: 'from-sale', before: null, after };
      due.tenant = after;
      due.next = nextWorkday(at + between(due.rng, OPEN_DAYS));
    } else if (due.rng() < RELET_CHANCE) {
      const after = newTenant(due, before.type, at);
      due.last = { day: at, kind: 'relet', before, after };
      due.tenant = after;
      due.next = nextWorkday(at + between(due.rng, OPEN_DAYS));
    } else {
      due.last = { day: at, kind: 'to-sale', before, after: null };
      due.tenant = null;
      due.next = nextWorkday(at + between(due.rng, SALE_DAYS));
    }
  }
  return tracks.map((t) => ({ slot: t.slot, tenant: t.tenant, change: t.last && t.last.day === target ? t.last : null }));
}
```

Note : `from-sale` reprend `null` comme type précédent ; le test « jamais vers le même type » ne vise que `relet` (`before` et `after` non nuls).

- [ ] **Step 4 : lancer (PASS attendu).** Si le test « types tous différents au départ » échoue parce qu'il y a plus de 32 locaux, il est écrit avec `Math.min(…, 32)` : vérifier le nombre de locaux pour la graine 11 à 1440 px (≈ 20).

- [ ] **Step 5 : commit** — `git commit -m "feat(ville): cycle de vie des commerces, À vendre ou reloués"`

---

### Task 4 : chantier du matin, vue d'un local à la minute, clients

**Files:**
- Create: `src/core/library/city/shops/works.ts`, `src/core/library/city/shops/view.ts`, `src/core/library/city/shops/customers.ts`
- Modify: `src/core/library/city/people.ts` (profil `worker`)
- Test: `tests/core/library/city-shops-works.test.ts`, `tests/core/library/city-shops-view.test.ts`, `tests/core/library/city-shops-customers.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 ; `outfitFor`, `Profile`, `Outfit` (`people.ts`) ; `WORLD_MARGIN`, `mulberry32`, `hashString` ; `MAX_TRIP_PX` (`doors.ts`) ; `WALK_PACE` (`metrics.ts`) ; `CityIntensity` (`intensity.ts`).
- Produces :
  - `works.ts` : `type WorkStep = 'arrive' | 'ladder-up' | 'climb' | 'remove' | 'descend' | 'pause' | 'hand' | 'climb-again' | 'install' | 'descend-again' | 'rest' | 'ladder-down' | 'leave'`, `WORK_STEPS: readonly WorkStep[]`, `type WorksPlan = { start: number; end: number; steps: { step: WorkStep; from: number; to: number }[] }` (minutes), `worksPlan(seed: number, slotId: string, day: number): WorksPlan`, `worksAt(plan: WorksPlan, minutes: number): { step: WorkStep; progress: number } | null`.
  - `view.ts` : `type ShopView = { slot: ShopSlot; phase: 'open' | 'closed' | 'for-sale' | 'works'; sign: { type: ShopTypeId; name: string } | null; placard: boolean; interior: ShopTypeId | null; works: { step: WorkStep; progress: number; kind: Change['kind']; carrying: 'sign' | 'placard' | null } | null }`, `shopViewAt(s: SlotDay, seed: number, date: YMD, minutes: number): ShopView`.
  - `customers.ts` : `VISIT_CYCLE = 240`, `type Visit = { id: string; slotId: string; doorX: number; innerX: number; dir: 1 | -1; speed: number; phase: number; stay: number; outfit: Outfit; scale: number }`, `visitsFor(slots: ShopSlot[], frames: Map<string, ShopFrame>, seed: number): Visit[]`, `visitAt(v: Visit, width: number, t: number): { stage: 'in' | 'inside' | 'out'; x: number; fade: number } | null`, `visitHappens(v: Visit, t: number, gate: number): boolean`, `customerGate(view: ShopView, minutes: number, i: CityIntensity): number`.
  - `people.ts` : `Profile` gagne `'worker'` ; `outfitFor('worker', rng)` = bleu de travail (`top: 'jacket'`, `topColor` dans `['#2F4A7A', '#24406A', '#3A5A8A']`, `bottom: 'pants'`, même couleur, `hair: 'cap'`, `accessory: 'none'`).

- [ ] **Step 1 : tests qui échouent**

`tests/core/library/city-shops-works.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { WORK_STEPS, worksAt, worksPlan } from '../../../src/core/library/city/shops/works';

describe('chantier du matin', () => {
  it('commence entre 8 h 30 et 9 h 30 et finit entre 11 h 45 et 12 h 20', () => {
    for (let day = 20_000; day < 20_200; day++) {
      const p = worksPlan(3, 'shop-1', day);
      expect(p.start).toBeGreaterThanOrEqual(510);
      expect(p.start).toBeLessThanOrEqual(570);
      expect(p.end).toBeGreaterThanOrEqual(705);
      expect(p.end).toBeLessThanOrEqual(740);
    }
  });
  it('enchaîne toutes les étapes dans l’ordre, sans trou', () => {
    const p = worksPlan(3, 'shop-2', 20_010);
    expect(p.steps.map((s) => s.step)).toEqual(WORK_STEPS);
    expect(p.steps[0]!.from).toBe(p.start);
    for (let i = 1; i < p.steps.length; i++) expect(p.steps[i]!.from).toBe(p.steps[i - 1]!.to);
    expect(p.steps.at(-1)!.to).toBe(p.end);
  });
  it('dit l’étape en cours et son avancement, rien hors du chantier', () => {
    const p = worksPlan(3, 'shop-2', 20_010);
    expect(worksAt(p, p.start - 1)).toBeNull();
    expect(worksAt(p, p.end)).toBeNull();
    const install = p.steps.find((s) => s.step === 'install')!;
    const at = worksAt(p, (install.from + install.to) / 2)!;
    expect(at.step).toBe('install');
    expect(at.progress).toBeCloseTo(0.5, 1);
  });
});
```

`tests/core/library/city-shops-view.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { shopViewAt } from '../../../src/core/library/city/shops/view';
import { worksPlan } from '../../../src/core/library/city/shops/works';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import type { SlotDay } from '../../../src/core/library/city/shops/lifecycle';

const slot = { id: 'shop-0', index: 0, x: 100, w: 30, doorSide: 'left' as const, residentDoorX: 84 };
const date = { y: 2026, m: 10, d: 13 }; // mardi
const today = dayNumber(date);
const bakery = { type: 'bakery' as const, name: 'Au Pain Perdu', from: today - 10 };
const bar = { type: 'bar' as const, name: 'Le Zinc', from: today };

describe('vue d’un local', () => {
  it('ouvert aux heures du commerce, fermé sinon', () => {
    const s: SlotDay = { slot, tenant: bakery, change: null };
    expect(shopViewAt(s, 1, date, 8 * 60)).toMatchObject({ phase: 'open', interior: 'bakery', placard: false, sign: { type: 'bakery' } });
    expect(shopViewAt(s, 1, date, 22 * 60)).toMatchObject({ phase: 'closed', interior: 'bakery' });
  });
  it('À vendre : pas d’enseigne, écriteau dans la vitrine, intérieur vide', () => {
    const s: SlotDay = { slot, tenant: null, change: null };
    expect(shopViewAt(s, 1, date, 10 * 60)).toMatchObject({ phase: 'for-sale', sign: null, placard: true, interior: null });
  });
  it('jour de relocation : ancien avant le chantier, chantier, nouveau ensuite', () => {
    const s: SlotDay = { slot, tenant: bar, change: { day: today, kind: 'relet', before: bakery, after: bar } };
    const plan = worksPlan(1, 'shop-0', today);
    expect(shopViewAt(s, 1, date, plan.start - 5)).toMatchObject({ phase: 'closed', sign: { type: 'bakery' } });
    const install = plan.steps.find((x) => x.step === 'install')!;
    const removeEnd = plan.steps.find((x) => x.step === 'remove')!.to;
    expect(shopViewAt(s, 1, date, plan.start + 1)).toMatchObject({ phase: 'works', sign: { type: 'bakery' }, interior: null });
    expect(shopViewAt(s, 1, date, removeEnd + 1)).toMatchObject({ phase: 'works', sign: null });
    expect(shopViewAt(s, 1, date, install.to + 1)).toMatchObject({ phase: 'works', sign: { type: 'bar' } });
    expect(shopViewAt(s, 1, date, plan.end + 1)).toMatchObject({ sign: { type: 'bar' }, phase: 'closed' }); // bar ouvre à 17 h
  });
  it('passage À vendre : enseigne déposée puis écriteau collé', () => {
    const s: SlotDay = { slot, tenant: null, change: { day: today, kind: 'to-sale', before: bakery, after: null } };
    const plan = worksPlan(1, 'shop-0', today);
    const install = plan.steps.find((x) => x.step === 'install')!;
    expect(shopViewAt(s, 1, date, install.from - 1)).toMatchObject({ sign: null, placard: false });
    expect(shopViewAt(s, 1, date, install.to + 1)).toMatchObject({ sign: null, placard: true });
    expect(shopViewAt(s, 1, date, install.from + 1).works?.carrying).toBe('placard');
  });
  it('sortie d’À vendre : écriteau retiré puis nouvelle enseigne', () => {
    const s: SlotDay = { slot, tenant: bar, change: { day: today, kind: 'from-sale', before: null, after: bar } };
    const plan = worksPlan(1, 'shop-0', today);
    expect(shopViewAt(s, 1, date, plan.start + 1)).toMatchObject({ placard: true, sign: null });
    expect(shopViewAt(s, 1, date, plan.end + 1)).toMatchObject({ placard: false, sign: { type: 'bar' } });
  });
});
```

`tests/core/library/city-shops-customers.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { customerGate, visitAt, visitHappens, visitsFor, VISIT_CYCLE } from '../../../src/core/library/city/shops/customers';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';

const slots = shopSlotsFor(720, 340, 9);
const frames = new Map(slots.map((s) => [s.id, shopFrame(s, 238)]));
const visits = visitsFor(slots, frames, 9);

describe('clients', () => {
  it('donne deux visites par local', () => {
    expect(visits).toHaveLength(slots.length * 2);
  });
  it('entre par la porte du magasin, reste dans la vitrine, ressort', () => {
    const v = visits[0]!;
    const stages = new Set<string>();
    for (let t = 0; t < VISIT_CYCLE; t += 0.5) {
      const s = visitAt(v, 720, t - v.phase);
      if (!s) continue;
      stages.add(s.stage);
      if (s.stage === 'inside') {
        const f = frames.get(v.slotId)!;
        expect(s.x).toBeGreaterThanOrEqual(f.window.x);
        expect(s.x).toBeLessThanOrEqual(f.window.x + f.window.w);
      }
    }
    expect([...stages].sort()).toEqual(['in', 'inside', 'out']);
  });
  it('n’envoie personne dans un local fermé', () => {
    const closed = { phase: 'closed' } as Parameters<typeof customerGate>[0];
    expect(customerGate(closed, 600, { walkers: 1 } as Parameters<typeof customerGate>[2])).toBe(0);
  });
  it('garde la population raisonnable : au plus 2 clients par local et environ 4 en route par 720 px', () => {
    const open = { phase: 'open', sign: { type: 'bakery', name: 'x' } } as Parameters<typeof customerGate>[0];
    const gate = customerGate(open, 8 * 60, { walkers: 1 } as Parameters<typeof customerGate>[2]);
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let t = 0; t < 3600; t += 2) {
      let walking = 0;
      for (const v of visits) {
        const s = visitAt(v, 720, t);
        if (s && s.stage !== 'inside' && visitHappens(v, t, gate)) walking++;
      }
      sum += walking;
      max = Math.max(max, walking);
      n++;
    }
    expect(sum / n).toBeLessThanOrEqual(4);
    expect(max).toBeLessThanOrEqual(9);
  });
});
```

- [ ] **Step 2 : lancer (échec attendu).**

- [ ] **Step 3 : écrire `works.ts`**

```ts
import { hashString, mulberry32 } from '../../scene-world';

// Chantier du matin, le jour d'un changement : deux ouvriers, une échelle, l'ancienne enseigne (ou l'écriteau) et la nouvelle.
// Début tiré entre 8 h 30 et 9 h 30, fin vers 12 h (11 h 45 à 12 h 20) ; les étapes se partagent le temps selon leur poids,
// les pauses sont semées entre elles pour qu'on voie souvent quelqu'un à l'œuvre.
export const WORK_STEPS = ['arrive', 'ladder-up', 'climb', 'remove', 'descend', 'pause', 'hand', 'climb-again', 'install', 'descend-again', 'rest', 'ladder-down', 'leave'] as const;
export type WorkStep = (typeof WORK_STEPS)[number];
export type WorksPlan = { start: number; end: number; steps: { step: WorkStep; from: number; to: number }[] };

const WEIGHT: Record<WorkStep, number> = { arrive: 4, 'ladder-up': 8, climb: 3, remove: 40, descend: 3, pause: 20, hand: 4, 'climb-again': 3, install: 50, 'descend-again': 3, rest: 20, 'ladder-down': 6, leave: 4 };

export function worksPlan(seed: number, slotId: string, day: number): WorksPlan {
  const rng = mulberry32(seed ^ hashString(`works-${slotId}`) ^ Math.imul(day, 2654435761));
  const start = 510 + Math.floor(rng() * 61);
  const end = 705 + Math.floor(rng() * 36);
  const total = WORK_STEPS.reduce((s, k) => s + WEIGHT[k], 0);
  const steps: WorksPlan['steps'] = [];
  let at = start;
  WORK_STEPS.forEach((step, i) => {
    const to = i === WORK_STEPS.length - 1 ? end : at + ((end - start) * WEIGHT[step]) / total;
    steps.push({ step, from: at, to });
    at = to;
  });
  return { start, end, steps };
}

export function worksAt(plan: WorksPlan, minutes: number): { step: WorkStep; progress: number } | null {
  if (minutes < plan.start || minutes >= plan.end) return null;
  const s = plan.steps.find((x) => minutes >= x.from && minutes < x.to)!;
  return { step: s.step, progress: (minutes - s.from) / (s.to - s.from) };
}
```

- [ ] **Step 4 : écrire `view.ts`**

```ts
import type { YMD } from '../calendar';
import { SHOP_DEFS, type ShopTypeId } from './catalog';
import { dayNumber, isOpenAt } from './hours';
import type { Change, SlotDay, Tenant } from './lifecycle';
import type { ShopSlot } from './slots';
import { WORK_STEPS, worksAt, worksPlan, type WorkStep } from './works';

export type ShopView = {
  slot: ShopSlot;
  phase: 'open' | 'closed' | 'for-sale' | 'works';
  sign: { type: ShopTypeId; name: string } | null;
  placard: boolean;
  interior: ShopTypeId | null;
  works: { step: WorkStep; progress: number; kind: Change['kind']; carrying: 'sign' | 'placard' | null } | null;
};

const signOf = (t: Tenant | null): ShopView['sign'] => (t ? { type: t.type, name: t.name } : null);
const after = (a: WorkStep, b: WorkStep): boolean => WORK_STEPS.indexOf(a) > WORK_STEPS.indexOf(b);

// Ce que montre un local à `minutes` du jour `date`. Jour de changement : l'ancien état avant le chantier ; pendant, rideau levé
// et intérieur vide, l'ancienne enseigne (ou l'écriteau) jusqu'à la fin de « remove », la nouvelle (ou l'écriteau) dès la fin
// de « install » ; après, l'état du nouvel occupant.
export function shopViewAt(s: SlotDay, seed: number, date: YMD, minutes: number): ShopView {
  const normal = (tenant: Tenant | null): ShopView =>
    tenant === null
      ? { slot: s.slot, phase: 'for-sale', sign: null, placard: true, interior: null, works: null }
      : { slot: s.slot, phase: isOpenAt(SHOP_DEFS[tenant.type], date, minutes) ? 'open' : 'closed', sign: signOf(tenant), placard: false, interior: tenant.type, works: null };
  const change = s.change;
  if (!change || change.day !== dayNumber(date)) return normal(s.tenant);
  const plan = worksPlan(seed, s.slot.id, change.day);
  if (minutes < plan.start) {
    const before = normal(change.before);
    return before.phase === 'open' ? { ...before, phase: 'closed' } : before;
  }
  const w = worksAt(plan, minutes);
  if (!w) return normal(change.after);
  const removed = after(w.step, 'remove');
  const installed = after(w.step, 'install');
  const oldUp = !removed;
  const newUp = installed;
  const goesToSale = change.kind === 'to-sale';
  const fromSale = change.kind === 'from-sale';
  return {
    slot: s.slot,
    phase: 'works',
    sign: newUp ? signOf(change.after) : oldUp ? signOf(change.before) : null,
    placard: (fromSale && oldUp) || (goesToSale && newUp),
    interior: null,
    works: {
      step: w.step,
      progress: w.progress,
      kind: change.kind,
      carrying: w.step === 'hand' || w.step === 'climb-again' || w.step === 'install' ? (goesToSale ? 'placard' : 'sign') : null,
    },
  };
}
```

- [ ] **Step 5 : écrire `customers.ts`**

```ts
import { WORLD_MARGIN, hashString, mulberry32 } from '../../scene-world';
import { MAX_TRIP_PX } from '../doors';
import type { CityIntensity } from '../intensity';
import { WALK_PACE } from '../metrics';
import { outfitFor, type Outfit, type Profile } from '../people';
import { SHOP_DEFS } from './catalog';
import { crowdAt } from './hours';
import type { ShopFrame, ShopSlot } from './slots';
import type { ShopView } from './view';

// Clients : comme les habitants (doors.ts), un aller-retour depuis le bord du monde, mais avec un arrêt DANS le magasin :
// le client passe la porte, apparaît derrière la vitrine (debout devant le comptoir) 20 à 60 s, ressort et repart.
// Deux visites par local et par cycle de VISIT_CYCLE secondes ; la présence est tirée par (visite, tour de cycle).
export const VISIT_CYCLE = 240;
// Réglage global : avec deux visites par local, la moyenne reste vers 4 clients en route par 720 px.
const CUSTOMER_SCALE = 0.55;
const FADE_S = 0.6;

export type Visit = { id: string; slotId: string; doorX: number; innerX: number; dir: 1 | -1; speed: number; phase: number; stay: number; outfit: Outfit; scale: number };

export function visitsFor(slots: ShopSlot[], frames: Map<string, ShopFrame>, seed: number): Visit[] {
  const rng = mulberry32(seed ^ hashString('shop-visits'));
  const out: Visit[] = [];
  for (const slot of slots) {
    const f = frames.get(slot.id)!;
    for (let k = 0; k < 2; k++) {
      const profile: Profile = rng() < 0.2 ? 'suit' : 'ordinary';
      out.push({
        id: `${slot.id}-v${k}`,
        slotId: slot.id,
        doorX: f.door.x + f.door.w / 2,
        // Deux places dans la vitrine (au tiers et aux deux tiers) : deux clients ne se superposent pas.
        innerX: f.window.x + f.window.w * (k === 0 ? 0.35 : 0.7),
        dir: rng() < 0.5 ? 1 : -1,
        speed: (16 + rng() * 8) * WALK_PACE,
        phase: rng() * VISIT_CYCLE,
        stay: 20 + rng() * 40,
        outfit: outfitFor(profile, rng),
        scale: 0.95 + rng() * 0.15,
      });
    }
  }
  return out;
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function visitAt(v: Visit, width: number, t: number): { stage: 'in' | 'inside' | 'out'; x: number; fade: number } | null {
  const c = (((t + v.phase) % VISIT_CYCLE) + VISIT_CYCLE) % VISIT_CYCLE;
  const toEdge = v.dir > 0 ? v.doorX + WORLD_MARGIN : width + WORLD_MARGIN - v.doorX;
  const reach = Math.min(toEdge, MAX_TRIP_PX);
  const walk = reach / v.speed;
  if (c < walk) return { stage: 'in', x: v.doorX - v.dir * reach + v.dir * v.speed * c, fade: Math.min(smooth(c / FADE_S), 1 - smooth((c - (walk - FADE_S)) / FADE_S)) };
  if (c < walk + v.stay) return { stage: 'inside', x: v.innerX, fade: Math.min(smooth((c - walk) / FADE_S), 1 - smooth((c - (walk + v.stay - FADE_S)) / FADE_S)) };
  const back = c - walk - v.stay;
  if (back < walk) return { stage: 'out', x: v.doorX + v.dir * v.speed * back, fade: Math.min(smooth(back / FADE_S), 1 - smooth((back - (walk - FADE_S)) / FADE_S)) };
  return null;
}

export function visitHappens(v: Visit, t: number, gate: number): boolean {
  const turn = Math.floor((t + v.phase) / VISIT_CYCLE);
  return mulberry32(hashString(v.id) ^ Math.imul(turn, 2654435761))() < gate;
}

// Probabilité qu'une visite ait lieu : seulement si le local est ouvert ; affluence du type × activité de la ville.
export function customerGate(view: ShopView, minutes: number, i: CityIntensity): number {
  if (view.phase !== 'open' || !view.sign) return 0;
  return Math.min(1, crowdAt(SHOP_DEFS[view.sign.type], minutes) * Math.max(0.3, i.walkers) * CUSTOMER_SCALE);
}
```

Note : un tour de cycle dure 240 s et une visite complète au plus `2 × 520 / 11,2 + 60 ≈ 153 s` : un tour ne coupe jamais une visite.

- [ ] **Step 6 : profil `worker`** dans `people.ts` : ajouter `'worker'` à `Profile` et un `case 'worker'` dans `outfitFor` (valeurs de l'interface ci-dessus). `pedestrianGate` n'est pas concerné (aucun passant n'a ce profil).

- [ ] **Step 7 : lancer les trois tests + `tests/core/library/city-people.test.ts` (PASS attendu).** Si la moyenne de clients dépasse 4, baisser `CUSTOMER_SCALE` (jamais le test).

- [ ] **Step 8 : commit** — `git commit -m "feat(ville): chantier du matin, état d'un local à la minute et clients"`

---

### Task 5 : route `/shops` du relais

**Files:**
- Create: `relay/src/shops.ts`
- Modify: `relay/src/index.ts` (import, `LIMITS.shops: [20, 60_000]`, route `GET /shops` à côté de `/department`)
- Test: `tests/relay/shops.test.ts`

**Interfaces:**
- Consumes: `failure`, `forward`, `Fetcher`, `ProxyResult` (`relay/src/proxy.ts`).
- Produces : `proxyShops(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult>` ; réponse `{ ok: true, names: Record<string, string[]> }` (clés = ids de `SHOP_TYPE_IDS`), `SHOP_NAME_MAX = 30`, `SHOP_NAME_LENGTH = 24`, `typesOfTags(tags: Record<string, string>): string[]`.

- [ ] **Step 1 : tests qui échouent**

```ts
import { describe, expect, it, vi } from 'vitest';
import { proxyShops, typesOfTags } from '../../relay/src/shops';

const element = (tags: Record<string, string>) => ({ type: 'node', id: Math.random(), tags });
const run = (path: string, elements: unknown[] = [], status = 200) => {
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ elements }), { status }));
  return { fetchFn, result: proxyShops(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => 0 }) };
};

describe('typesOfTags', () => {
  it('range les étiquettes OSM dans les types du catalogue', () => {
    expect(typesOfTags({ amenity: 'pub' })).toEqual(['bar']);
    expect(typesOfTags({ amenity: 'nightclub' })).toEqual(['nightclub']);
    expect(typesOfTags({ amenity: 'restaurant', cuisine: 'pizza' })).toEqual(['pizzeria']);
    expect(typesOfTags({ amenity: 'fast_food', cuisine: 'kebab' })).toEqual(['kebab']);
    expect(typesOfTags({ amenity: 'restaurant', cuisine: 'sushi;japanese' })).toEqual(['sushi']);
    expect(typesOfTags({ amenity: 'restaurant', cuisine: 'french' })).toEqual(['restaurant']);
    expect(typesOfTags({ amenity: 'cafe', cuisine: 'tea' })).toEqual(['tearoom']);
    expect(typesOfTags({ shop: 'convenience' })).toEqual(['grocery', 'minimarket']);
    expect(typesOfTags({ shop: 'clothes', second_hand: 'only' })).toEqual(['thrift']);
    expect(typesOfTags({ shop: 'clothes' })).toEqual([]);
    expect(typesOfTags({ leisure: 'amusement_arcade' })).toEqual(['arcade']);
  });
});

describe('proxyShops', () => {
  it('interroge Overpass à 25 km autour de la position arrondie et regroupe les noms par type', async () => {
    const { fetchFn, result } = run('/shops?lat=47.4712&lon=-0.5518', [
      element({ amenity: 'pub', name: 'Le Welsh' }),
      element({ amenity: 'nightclub', name: 'La Chapelle' }),
      element({ amenity: 'pub', name: 'Le Welsh' }),
      element({ amenity: 'bar', name: 'Un nom beaucoup trop long pour une enseigne' }),
      element({ amenity: 'bar' }),
    ]);
    expect(JSON.parse((await result).body)).toEqual({ ok: true, names: { bar: ['Le Welsh'], nightclub: ['La Chapelle'] } });
    const body = String(fetchFn.mock.calls[0]?.[1]?.body ?? '');
    expect(decodeURIComponent(body)).toContain('around:25000,47.5,-0.6');
  });
  it('garde au plus 30 noms par type', async () => {
    const many = Array.from({ length: 50 }, (_, i) => element({ shop: 'bakery', name: `Boulangerie ${i}` }));
    const names = JSON.parse((await run('/shops?lat=47&lon=-0.5', many).result).body).names.bakery;
    expect(names).toHaveLength(30);
  });
  it('met la réponse en cache par case', async () => {
    const first = run('/shops?lat=46.01&lon=1.01', [element({ amenity: 'pub', name: 'A' })]);
    await first.result;
    const second = run('/shops?lat=46.04&lon=1.04', []);
    expect(JSON.parse((await second.result).body).names).toEqual({ bar: ['A'] });
    expect(second.fetchFn).not.toHaveBeenCalled();
  });
  it('refuse une position invalide et répond 502 si Overpass échoue', async () => {
    expect((await run('/shops?lat=x&lon=2').result).status).toBe(400);
    expect((await run('/shops?lat=45&lon=3', [], 504).result).status).toBe(502);
  });
});
```

- [ ] **Step 2 : lancer (échec attendu).**

- [ ] **Step 3 : écrire `relay/src/shops.ts`**

```ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Noms de commerces réels autour de l'utilisateur (OpenStreetMap, par Overpass, sans clé), pour les enseignes de la scène Ville.
// Position arrondie à 0,1° (jamais enregistrée ailleurs que dans la clé de cache en mémoire), rayon de 25 km.
// Réponse réduite à « type du catalogue → noms » (≤ 30 par type, ≤ 24 caractères, dédoublonnés).
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 25_000;
export const SHOP_NAME_MAX = 30;
export const SHOP_NAME_LENGTH = 24;
const CACHE_MS = 30 * 86_400_000;
const CACHE_MAX = 300;
const COORD = /^-?\d{1,3}(\.\d+)?$/;
const cache = new Map<string, { at: number; body: string }>();
const rounded = (v: number): number => Math.round(v * 10) / 10 + 0;

const SHOP_TAGS: Record<string, string[]> = {
  bakery: ['bakery'], pastry: ['pastry'], confectionery: ['chocolatier'], chocolate: ['chocolatier'], butcher: ['butcher'],
  seafood: ['fishmonger'], cheese: ['cheese'], greengrocer: ['greengrocer'], wine: ['wine'], alcohol: ['wine'],
  convenience: ['grocery', 'minimarket'], supermarket: ['minimarket'], florist: ['florist'], books: ['bookshop'],
  music: ['records'], games: ['games'], toys: ['games'], hairdresser: ['hairdresser'], optician: ['optician'], tattoo: ['tattoo'],
  second_hand: ['thrift'], antiques: ['antiques'], pet: ['petshop'], bicycle: ['bikes'], laundry: ['laundry'], dry_cleaning: ['laundry'], tea: ['tearoom'],
};

// Étiquettes OSM d'un lieu → types du catalogue de l'extension (src/core/library/city/shops/catalog.ts).
export function typesOfTags(tags: Record<string, string>): string[] {
  const cuisine = (tags.cuisine ?? '').split(';');
  const amenity = tags.amenity;
  if (amenity === 'bar' || amenity === 'pub') return ['bar'];
  if (amenity === 'nightclub') return ['nightclub'];
  if (amenity === 'pharmacy') return ['pharmacy'];
  if (amenity === 'cafe') return cuisine.includes('tea') ? ['tearoom'] : ['cafe'];
  if (amenity === 'restaurant' || amenity === 'fast_food') {
    if (cuisine.includes('pizza')) return ['pizzeria'];
    if (cuisine.includes('kebab')) return ['kebab'];
    if (cuisine.includes('sushi')) return ['sushi'];
    return amenity === 'restaurant' ? ['restaurant'] : [];
  }
  if (tags.leisure === 'amusement_arcade') return ['arcade'];
  if (tags.shop === 'clothes') return tags.second_hand === 'only' || tags.second_hand === 'yes' ? ['thrift'] : [];
  return tags.shop ? (SHOP_TAGS[tags.shop] ?? []) : [];
}

const query = (lat: string, lon: string): string => {
  const around = `around:${RADIUS_M},${lat},${lon}`;
  const shops = Object.keys(SHOP_TAGS).concat('clothes').join('|');
  return `[out:json][timeout:20];(nwr["amenity"~"^(bar|pub|nightclub|pharmacy|cafe|restaurant|fast_food)$"]["name"](${around});nwr["shop"~"^(${shops})$"]["name"](${around});nwr["leisure"="amusement_arcade"]["name"](${around}););out tags 6000;`;
};

export async function proxyShops(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const rawLat = url.searchParams.get('lat') ?? '';
  const rawLon = url.searchParams.get('lon') ?? '';
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!COORD.test(rawLat) || !COORD.test(rawLon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return failure(400, 'bad-request');
  const key = `${rounded(lat).toFixed(1)},${rounded(lon).toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const result = await forward(deps.fetch, OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query(rounded(lat).toFixed(1), rounded(lon).toFixed(1)))}`,
  });
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    return failure(502, 'upstream');
  }
  const elements = (parsed as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return failure(502, 'upstream');
  const names: Record<string, string[]> = {};
  for (const el of elements) {
    const tags = (el as { tags?: Record<string, string> }).tags;
    const name = tags?.name?.trim();
    if (!tags || !name || name.length > SHOP_NAME_LENGTH) continue;
    for (const type of typesOfTags(tags)) {
      const list = (names[type] ??= []);
      if (list.length < SHOP_NAME_MAX && !list.includes(name)) list.push(name);
    }
  }
  const body = JSON.stringify({ ok: true, names });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
```

Le test « cache par case » utilise 46.01/46.04 (même case 46.0) : il passe parce que le cache est partagé entre appels du module. Les autres tests utilisent des cases différentes.

- [ ] **Step 4 : brancher la route** dans `relay/src/index.ts` : `import { proxyShops } from './shops';`, ajouter `shops: [20, 60_000]` à `LIMITS`, et sous la ligne `/department` :
  `if (get && url.pathname === '/shops') return limited(request, 'shops') ?? relayed(await proxyShops(url, { fetch: net, now: () => Date.now() }));`
  Vérifier dans `relay/README.md` la liste des routes et y ajouter `/shops` (une ligne : rôle, source Overpass, cache 30 jours).

- [ ] **Step 5 : lancer** `npx vitest run tests/relay --maxWorkers=4` → PASS ; `npx tsc --noEmit -p relay` → aucune erreur.

- [ ] **Step 6 : commit** — `git commit -m "feat(relais): route /shops, noms de commerces OpenStreetMap à 25 km"`

---

### Task 6 : départ de la rue, noms locaux, contexte de la ville

**Files:**
- Modify: `src/core/library/library-types.ts` (`Room.cityEpoch?: number`), `src/core/library/library-book.ts` (schéma + `setCityEpoch`), `src/core/library/city/intensity.ts` (`CityContext.shops?`), `src/content/LibraryPanel.tsx`, `src/content/RoomView.tsx`
- Create: `src/content/use-shop-names.ts`, `src/core/library/city/shops/names.ts` (constante `SHOPS_RELAY` + `parseShopNames`)
- Test: `tests/core/library/city-shops-names.test.ts`, `tests/content/use-shop-names.test.tsx`, ajout dans le test existant de `library-book` (`tests/core/library/library-book.test.ts` ou le fichier qui teste `parseLibrary` : `grep -rl "parseLibrary\|stateSchema" tests/core/library`)

**Interfaces:**
- Consumes: `NamePool` (Task 3), `SHOP_TYPE_IDS` (Task 1), `dayNumber` (Task 1), `RELAY_BASE` (même import que `src/core/library/city/school-calendar.ts`), `currentPosition`, `isPositionKnown`, `subscribePosition` (`src/content/scene-position.ts`), `library.updateQuiet`.
- Produces :
  - `Room.cityEpoch?: number` (numéro de jour local) ; `setCityEpoch(state: LibraryState, roomIds: string[], day: number): LibraryState` (ne touche que les pièces listées qui n'en ont pas).
  - `CityContext.shops?: { epochDay: number; names: NamePool }`.
  - `SHOPS_RELAY: string`, `parseShopNames(body: unknown): NamePool | null`.
  - `useShopNames(enabled: boolean): NamePool` (objet stable tant que rien ne change ; `{}` par défaut).
  - `SceneView.city` gagne `shopNames: NamePool`.

- [ ] **Step 1 : tests qui échouent**

`tests/core/library/city-shops-names.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { parseShopNames } from '../../../src/core/library/city/shops/names';

describe('parseShopNames', () => {
  it('garde les types connus, des chaînes courtes, au plus 30 par type', () => {
    expect(parseShopNames({ ok: true, names: { bar: ['Le Welsh', 42, 'x'.repeat(30)], inconnu: ['A'] } })).toEqual({ bar: ['Le Welsh'] });
    const many = Array.from({ length: 40 }, (_, i) => `N${i}`);
    expect(parseShopNames({ ok: true, names: { bakery: many } })!.bakery).toHaveLength(30);
  });
  it('refuse une forme inattendue', () => {
    expect(parseShopNames({ ok: false })).toBeNull();
    expect(parseShopNames('x')).toBeNull();
    expect(parseShopNames({ ok: true, names: [] })).toBeNull();
  });
});
```

`tests/content/use-shop-names.test.tsx` (modèle : `tests/content/use-city-calendar.test.tsx`, même façon de simuler la position et `fetch`) — trois cas :
1. position inconnue → `{}` et aucun `fetch` ;
2. position connue (48.85, 2.35) → un `fetch` vers `…/shops?lat=48.9&lon=2.4` (après `vi.stubGlobal('fetch', …)` renvoyant `{ ok: true, names: { bar: ['Le Welsh'] } }`), puis le hook rend `{ bar: ['Le Welsh'] }` ; deux hooks montés en même temps ne font qu'UN appel ;
3. échec (`fetch` rejeté) → `{}`, et `localStorage['wmt:city-shops-fail']` contient un horodatage (aucune coordonnée) ; un nouveau montage dans les 24 h n'appelle pas `fetch`.
Exporter `resetShopNamesCacheForTests()` depuis `use-shop-names.ts` et l'appeler dans `beforeEach`.

Test d'état (fichier de `parseLibrary`) :

```ts
it('lit et garde cityEpoch, facultatif', () => {
  // partir d'un état v5 valide déjà utilisé dans ce fichier (fixture existante), y ajouter cityEpoch à la première pièce
  // puis vérifier : parse → rooms[0].cityEpoch === 20_000 ; sans le champ → undefined ; une valeur non entière est refusée.
});
it('setCityEpoch ne pose la date que sur les pièces listées qui n’en ont pas', () => {
  // state avec deux pièces, la seconde ayant déjà cityEpoch 10 → setCityEpoch(state, [id1, id2], 20_000)
  // → id1 : 20_000, id2 : 10 inchangé ; une pièce non listée reste sans champ.
});
```
(Écrire ces deux tests en entier avec la fixture d'état v5 du fichier.)

- [ ] **Step 2 : lancer (échec attendu).**

- [ ] **Step 3 : état** — `library-types.ts` : dans `Room`, après `pets`, `// Jour local (dayNumber) où la rue commerçante de la scène Ville a démarré ; absent = pas encore posé.` puis `cityEpoch?: number;`. `library-book.ts` : `cityEpoch: z.number().int().optional(),` dans `roomSchema`, et :

```ts
// Pose le jour de départ de la rue commerçante sur les pièces listées qui n'en ont pas encore (jamais d'écrasement).
export function setCityEpoch(state: LibraryState, roomIds: string[], day: number): LibraryState {
  if (!state.rooms.some((r) => roomIds.includes(r.id) && r.cityEpoch === undefined)) return state;
  return { ...state, rooms: state.rooms.map((r) => (roomIds.includes(r.id) && r.cityEpoch === undefined ? { ...r, cityEpoch: day } : r)) };
}
```

Vérifier qu'aucune fonction de copie de pièce (dupliquer, changer de scène) ne perd ni ne recopie `cityEpoch` à tort : une pièce dupliquée garde le champ (même rue), un changement de scène le garde aussi.

- [ ] **Step 4 : `names.ts`**

```ts
import { RELAY_BASE } from '…'; // même import que school-calendar.ts
import { SHOP_TYPE_IDS, type ShopTypeId } from './catalog';
import type { NamePool } from './lifecycle';

export const SHOPS_RELAY = `${RELAY_BASE}/shops`;
const MAX = 30;
const LENGTH = 24;

// Réponse du relais → noms par type du catalogue (types inconnus, valeurs non textuelles et noms trop longs écartés).
export function parseShopNames(body: unknown): NamePool | null {
  const names = (body as { ok?: unknown; names?: unknown } | null)?.names;
  if ((body as { ok?: unknown } | null)?.ok !== true || typeof names !== 'object' || names === null || Array.isArray(names)) return null;
  const out: NamePool = {};
  for (const id of SHOP_TYPE_IDS as readonly ShopTypeId[]) {
    const list = (names as Record<string, unknown>)[id];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((n): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= LENGTH).slice(0, MAX);
    if (kept.length > 0) out[id] = kept;
  }
  return out;
}
```

- [ ] **Step 5 : `use-shop-names.ts`** — même structure que `useDepartment` dans `use-city-calendar.ts` : cache de module `Map<cell, Promise<NamePool | null>>`, délai 20 s (`AbortController`), case `lat.toFixed(1),lon.toFixed(1)` avec `rounded` (+0 contre -0), `useSyncExternalStore(subscribePosition, …)`, `isPositionKnown()`. Échec : `localStorage.setItem('wmt:city-shops-fail', String(Date.now()))` (try/catch) ; au montage, si la valeur a moins de 24 h, aucune requête. Retour : le dernier `NamePool` trouvé pour la case courante, sinon une constante `EMPTY: NamePool = {}` (identité stable). En-tête de commentaire : rôle, position jamais enregistrée, seule une date d'échec est écrite.

- [ ] **Step 6 : panneau et pièce**
  - `intensity.ts` : `CityContext` gagne `shops?: { epochDay: number; names: NamePool }` (import type de `./shops/lifecycle`), commentaire : `// Rue commerçante (vague 1b-iv-a) : jour de départ de la pièce et noms locaux ; absent = pas de commerces.`
  - `LibraryPanel.tsx` : `const hasCity = lib?.rooms.some((r) => r.scene === 'city') ?? false;` (réutiliser pour `useCityDay`), `const shopNames = useShopNames(hasCity);`, ajouter `shopNames` dans `sceneView.city` et dans les dépendances du `useMemo`. Effet :

```ts
// Rue commerçante : chaque pièce Ville reçoit une fois son jour de départ (tous les locaux occupés ce jour-là).
const today = dayNumber(sceneTime.date);
useEffect(() => {
  const ids = lib?.rooms.filter((r) => r.scene === 'city' && r.cityEpoch === undefined).map((r) => r.id) ?? [];
  if (ids.length > 0) void library.updateQuiet((state) => setCityEpoch(state, ids, today));
}, [lib, library, today]);
```

  - `RoomView.tsx` : `SceneView.city` gagne `shopNames?: NamePool` ; dans le `useMemo` de `city`, ajouter `shops: { epochDay: room.cityEpoch ?? dayNumber(view.city.day.date), names: view.city.shopNames ?? EMPTY_NAMES }` (constante de module `EMPTY_NAMES: NamePool = {}`) et `room.cityEpoch` dans les dépendances.

- [ ] **Step 7 : lancer** les nouveaux tests + `tests/content/use-city-calendar.test.tsx tests/content/city-life.test.tsx` + le fichier de `parseLibrary` → PASS ; `npm run typecheck` → aucune erreur.

- [ ] **Step 8 : commit** — `git commit -m "feat(ville): jour de départ de la rue et noms locaux des commerces"`

---

### Task 7 : devantures, rideau, écriteau, échelle, ouvrier

**Files:**
- Create: `src/content/shop-sprites.tsx`
- Test: `tests/content/shop-sprites.test.tsx`

**Interfaces:**
- Consumes: `ShopFrame`, `Rect` (Task 2), `ShopView` (Task 4), `SHOP_DEFS` (Task 1), `Sky`, `tone` (`city-sprites.tsx`), `mixHex`.
- Produces :
  - `ShopFront({ frame, view, sky, lit }: { frame: ShopFrame; view: ShopView; sky: Sky; lit: boolean }): ReactElement` — dessine dans le repère du monde : bandeau d'enseigne (ou bandeau nu + 2 fixations si `view.sign === null`), nom (`<text>` ajusté : `textLength` = largeur du bandeau − 2 si le nom est plus long que la place, `fontSize` 4, `font-family` sans-serif), store rayé si `SHOP_DEFS[type].awning`, cadre de vitrine, porte vitrée, rideau métallique si `phase === 'closed'` (lamelles horizontales tous les 1,5 px, couvre vitrine ET porte), écriteau si `view.placard`. L'intérieur n'est PAS dessiné ici (`children` de la vitrine : voir Task 8), mais `ShopFront` accepte `children?: ReactNode` rendu sous le reflet de vitre et au-dessus du fond, clippé sur `frame.window`.
  - `ForSalePlacard({ x, y, w }: { x: number; y: number; w: number }): ReactElement` — carton blanc bordé d'orange `#E8601C`, bandeau orange avec « À VENDRE » (`fontSize` 2,6, blanc), deux lignes grises figurant le téléphone ; largeur = min(w − 2, 14), centré.
  - `LadderSprite({ height }: { height: number }): ReactElement` (échelle alu, base à y = 0, montants + barreaux tous les 3 px) et `WorkerPose` : `type WorkerPose = 'walk' | 'stand' | 'climb' | 'reach' | 'carry'` — les ouvriers réutilisent `PersonSprite` (Task 4 : tenue `worker`) ; `CarriedSign({ type, name, w }: …)` et `CarriedPlacard` pour ce qu'ils portent.
  - Attributs de test : `data-shop={slot.id}`, `data-shop-phase={phase}`, `data-shop-sign={type}` ou `data-shop-sign="bare"`, `data-shutter`, `data-placard`, `data-awning`.

- [ ] **Step 1 : tests qui échouent** (`tests/content/shop-sprites.test.tsx`, rendu avec `@testing-library/react` dans un `<svg>`, comme `tests/content/city-sprites.test.tsx`)

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { shopFrame } from '../../src/core/library/city/shops/slots';
import type { ShopView } from '../../src/core/library/city/shops/view';
import { skyAt } from '../../src/core/library/sky';
import { ShopFront } from '../../src/content/shop-sprites';

const slot = { id: 'shop-0', index: 0, x: 100, w: 30, doorSide: 'left' as const, residentDoorX: 84 };
const frame = shopFrame(slot, 238);
const sky = skyAt(12 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const draw = (view: Partial<ShopView>) =>
  render(<svg><ShopFront frame={frame} view={{ slot, phase: 'open', sign: { type: 'cafe', name: 'Le Zinc' }, placard: false, interior: 'cafe', works: null, ...view }} sky={sky} lit={false} /></svg>).container;

describe('devanture', () => {
  it('écrit le nom sur l’enseigne et met un store au café', () => {
    const c = draw({});
    expect(c.querySelector('[data-shop-sign="cafe"]')?.textContent).toContain('Le Zinc');
    expect(c.querySelector('[data-awning]')).not.toBeNull();
    expect(c.querySelector('[data-shutter]')).toBeNull();
  });
  it('baisse le rideau quand c’est fermé', () => {
    expect(draw({ phase: 'closed' }).querySelector('[data-shutter]')).not.toBeNull();
  });
  it('À vendre : bandeau nu et écriteau', () => {
    const c = draw({ phase: 'for-sale', sign: null, placard: true, interior: null });
    expect(c.querySelector('[data-shop-sign="bare"]')).not.toBeNull();
    expect(c.querySelector('[data-placard]')?.textContent).toContain('À VENDRE');
  });
  it('n’utilise aucun id (la scène est copiée dans chaque fenêtre par <use>)', () => {
    expect(draw({}).querySelector('[id]')).toBeNull();
  });
});
```

Note sur les ids : comme `PersonSprite`, aucun `id` ; le clip de la vitrine est fait par la couche appelante (Task 8) avec un id unique par pièce, ou, ici, par un `<svg x y width height overflow="hidden">` imbriqué (autorisé : pas d'id). Utiliser cette seconde solution dans `ShopFront` pour `children`.

- [ ] **Step 2 : lancer (échec attendu).**
- [ ] **Step 3 : implémenter `shop-sprites.tsx`** selon l'interface. Couleurs passées par `tone(c, sky)` (assombries la nuit) ; `lit` (nuit et ouvert) : vitrine teintée `#FFE7B0` à 0,85 et enseigne non assombrie. En-tête de commentaire : repère, échelle (monde, non mis à l'échelle, rez-de-chaussée de 30 px), pas d'id.
- [ ] **Step 4 : lancer (PASS attendu).**
- [ ] **Step 5 : commit** — `git commit -m "feat(ville): devantures, rideau, écriteau À vendre et échelle"`

---

### Task 8 : les 32 intérieurs et le vendeur

**Files:**
- Create: `src/content/shop-interiors.tsx`
- Test: `tests/content/shop-interiors.test.tsx`

**Interfaces:**
- Consumes: `SHOP_DEFS`, `SHOP_TYPE_IDS`, `ShopTypeId` (Task 1), `PersonSprite`, `tone` (`city-sprites.tsx`), `outfitFor` (`people.ts`), `mulberry32`.
- Produces : `ShopInterior({ type, w, h, sky, lit, staffed, seed }: { type: ShopTypeId; w: number; h: number; sky: Sky; lit: boolean; staffed: boolean; seed: number }): ReactElement` — repère LOCAL : x de 0 à `w`, y de 0 (plafond) à `h` (sol), dessiné dans la vitrine. `staffed` : vendeur présent (ouvert). Attributs : `data-interior={type}`, `data-staff` sur le vendeur.

Règles de dessin (toutes les entrées) :
- fond : mur `SHOP_DEFS[type].wall`, bande de sol `floor` sur les 3 px du bas ;
- mobilier en formes simples (`rect`, `circle`, `path`), contenu dans [0, w] × [0, h], lisible pour `w` de 8 à 40 : les éléments se placent en fractions de `w` et les éléments répétés (bouteilles, livres, baguettes) sont dessinés en boucle tant qu'ils tiennent ;
- vendeur : `PersonSprite` à l'échelle 0,5 (11 px), tenue tirée par `outfitFor('ordinary', mulberry32(seed))`, posé derrière le comptoir quand il y en a un (seul le haut du corps dépasse), sinon debout près du mobilier principal ;
- aucun `id`, aucune animation (gestes = 1b-iv-b).

Mobilier par type (à dessiner tel que décrit) :

| type | mobilier |
|---|---|
| bakery | comptoir vitré bas avec gâteaux ronds colorés ; au mur, panières inclinées pleines de baguettes dorées |
| pastry | présentoir réfrigéré (vitre bleutée) à deux étages de gâteaux (rose, chocolat, crème) ; pièce montée sur un côté |
| chocolatier | étagères murales de boîtes (marron, or) ; comptoir avec cloche de verre |
| butcher | vitrine réfrigérée rouge et blanc ; billot ; crochets avec jambons au mur ; carrelage blanc |
| fishmonger | étal incliné de glace pilée (blanc bleuté) avec poissons gris-bleu ; ardoise des prix |
| cheese | meules jaunes empilées au mur ; comptoir avec cloches ; une meule entamée |
| greengrocer | cagettes en gradins : rouge (tomates), orange, vert, jaune ; balance |
| wine | casiers à bouteilles en losanges (bouteilles vertes et bordeaux) ; tonneau servant de table |
| grocery | rayonnages pleins de petites boîtes colorées ; caisse avec écran |
| minimarket | rayonnages ; frigos verticaux lumineux (bleutés, plus clairs quand `lit`) ; caisse |
| pharmacy | croix verte au mur (allumée si `lit`) ; comptoir blanc ; mur de tiroirs blancs |
| florist | seaux de fleurs de couleurs vives au sol ; plantes vertes en hauteur ; table de travail |
| bookshop | bibliothèques murales aux dos colorés ; table de nouveautés avec piles |
| records | bacs de vinyles (tranches noires) ; platine sur le comptoir ; pochettes au mur |
| games | boîtes de jeux empilées en couleurs ; table de démo avec plateau et pions |
| hairdresser | deux fauteuils noirs face à des miroirs ronds ; bac à shampoing ; vendeur = coiffeur debout derrière un fauteuil |
| optician | présentoirs muraux de lunettes (petits traits sur fond clair) ; miroir ; comptoir |
| tattoo | fauteuil inclinable ; murs couverts de « flash » (petits dessins encadrés) ; lampe |
| thrift | portants avec vêtements de couleurs variées ; miroir sur pied ; panier |
| antiques | commode ancienne, horloge comtoise, lustre au plafond, tableau doré |
| petshop | aquariums lumineux (bleu) avec poissons ; cages ; sacs de croquettes |
| bikes | vélos suspendus au mur (cercles + cadre) ; établi avec outils ; une roue |
| laundry | rangée de hublots de machines (cercles gris, intérieur bleu) ; banc |
| cafe | comptoir avec percolateur chromé ; tasses ; deux petites tables rondes avec chaises |
| restaurant | tables nappées blanches avec chaises ; bougies (allumées si `lit`) ; tableau noir |
| pizzeria | four à bois en dôme (bouche orange) ; comptoir ; pizzas sur pelle |
| kebab | broche verticale (cylindre marron) ; comptoir avec bacs de garnitures ; écran menu au mur |
| sushi | tapis roulant (bande grise) avec petites assiettes colorées ; comptoir en bois clair ; lanterne rouge |
| tearoom | tables rondes nappées ; présentoir de théières ; étagère de boîtes à thé |
| arcade | bornes d'arcade alignées, écrans lumineux de couleurs (vifs si `lit`) |
| bar | comptoir en bois sombre ; tireuses ; étagère de bouteilles rétroéclairée ; tabourets hauts |
| nightclub | piste sombre ; boule à facettes ; spots colorés (magenta, cyan) ; silhouette de DJ derrière une platine |

Structure du code : un `switch (type)` qui délègue à une fonction par type `(w, h, t) => ReactElement[]` (`t` = `(c) => tone(c, sky)`), regroupées par famille avec un commentaire par famille (alimentation, boutiques, services, restauration, nuit). Fichier attendu : ~600-800 lignes ; si une famille dépasse 250 lignes, la sortir dans `shop-interiors-<famille>.tsx`.

- [ ] **Step 1 : tests qui échouent**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS } from '../../src/core/library/city/shops/catalog';
import { skyAt } from '../../src/core/library/sky';
import { ShopInterior } from '../../src/content/shop-interiors';

const sky = skyAt(12 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });

describe('intérieurs', () => {
  it.each(SHOP_TYPE_IDS)('%s : dessine son mobilier, aux petites comme aux grandes largeurs', (type) => {
    for (const w of [8, 20, 40]) {
      const c = render(<svg><ShopInterior type={type} w={w} h={21} sky={sky} lit={false} staffed seed={1} /></svg>).container;
      const root = c.querySelector(`[data-interior="${type}"]`)!;
      expect(root).not.toBeNull();
      expect(root.querySelectorAll('rect, circle, path, ellipse, polygon, line').length).toBeGreaterThan(4);
      expect(c.querySelector('[id]')).toBeNull();
    }
  });
  it('montre le vendeur seulement quand c’est ouvert', () => {
    const on = render(<svg><ShopInterior type="bakery" w={24} h={21} sky={sky} lit={false} staffed seed={1} /></svg>).container;
    const off = render(<svg><ShopInterior type="bakery" w={24} h={21} sky={sky} lit={false} staffed={false} seed={1} /></svg>).container;
    expect(on.querySelector('[data-staff]')).not.toBeNull();
    expect(off.querySelector('[data-staff]')).toBeNull();
  });
  it('ne dessine pas hors de la vitrine (rectangles dans [0, w] × [0, h])', () => {
    for (const type of SHOP_TYPE_IDS) {
      const c = render(<svg><ShopInterior type={type} w={20} h={21} sky={sky} lit={false} staffed={false} seed={1} /></svg>).container;
      for (const r of c.querySelectorAll('rect')) {
        const x = Number(r.getAttribute('x') ?? 0);
        const y = Number(r.getAttribute('y') ?? 0);
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(x + Number(r.getAttribute('width') ?? 0)).toBeLessThanOrEqual(20.01);
        expect(y + Number(r.getAttribute('height') ?? 0)).toBeLessThanOrEqual(21.01);
      }
    }
  });
});
```

(Les `rect` dans un `<g transform>` imbriqué échappent à ce dernier test : éviter les `transform` sur les rectangles du mobilier, sauf pour le vendeur.)

- [ ] **Step 2 : lancer (échec attendu).**
- [ ] **Step 3 : implémenter** selon le tableau.
- [ ] **Step 4 : lancer (PASS attendu).**
- [ ] **Step 5 : planche de contrôle visuel** — écrire un script jetable (non commité) dans le dossier scratchpad qui rend les 32 intérieurs côte à côte (largeurs 12 et 30, jour et nuit) dans une page HTML statique via `react-dom/server` (`npx tsx`), l'ouvrir dans le navigateur intégré (`mcp__Claude_Browser__preview_start` avec l'URL `file:///…`) et faire une capture ; corriger ce qui est illisible. Joindre la capture au rapport de tâche.
- [ ] **Step 6 : commit** — `git commit -m "feat(ville): intérieurs des 32 commerces, vus par la vitrine"`

---

### Task 9 : branchement dans la scène Ville (locaux, clients, équipe)

**Files:**
- Modify: `src/content/scene-city.tsx`, `src/content/city-life.tsx`
- Create: `src/content/use-street-shops.ts`
- Test: `tests/content/city-shops-layer.test.tsx`

**Interfaces:**
- Consumes: tout ce qui précède ; `CityContext.shops` (Task 6) ; `cityMetrics`.
- Produces : `useStreetShops(width: number, height: number, seed: number, city: CityContext | undefined): { slots: ShopSlot[]; frames: Map<string, ShopFrame>; views: ShopView[] }` — `slots` et `frames` mémoïsés par (width, height, seed) ; `streetOn` mémoïsé par (slots, seed, epochDay, jour, names) ; `views` recalculées à la minute (`shopViewAt` pour chaque local, date = `city.day.date`, minutes = `city.minutes`). Sans `city?.shops` : `views = []` (aucun commerce dessiné, mais les entrées restent au bord).

- [ ] **Step 1 : tests qui échouent** (`tests/content/city-shops-layer.test.tsx`, modèle `tests/content/city-life.test.tsx` : même façon de construire un `CityContext`, de rendre `CityScene` et `CityLifeLayer`, de figer `Date.now` et `matchMedia`) :
  1. `CityScene` avec `city.shops = { epochDay: dayNumber(date), names: {} }` à 10 h un mardi : autant de `[data-shop]` que `shopSlotsFor(width, height, seed).length`, chacun avec un `[data-interior]` ou un `[data-placard]` ; aucun `[data-shop-phase="for-sale"]` (jour de départ).
  2. Même scène à 3 h du matin un mardi : tous les locaux non-nuit ont `data-shop-phase="closed"` et un `[data-shutter]`.
  3. Sans `city.shops` : aucun `[data-shop]`.
  4. `CityLifeLayer` à 8 h un mardi, `walkers` forts : il existe des nœuds `[data-customer]` (un par visite) ; avec `matchMedia` « reduce » : tous les `[data-customer]` ont `data-active="false"`.
  5. Chantier : choisir (par recherche sur les jours suivant `epochDay`, comme dans les tests de Task 3) un jour où `streetOn(...)[k].change` n'est pas nul, se placer au milieu de l'étape `install` : `CityLifeLayer` contient `[data-works="shop-k"]` avec un `[data-ladder]` et deux `[data-worker]` ; `CityScene` montre `data-shop-phase="works"`.
  6. Le décor reste sans `id` dans les locaux (`[data-shop] [id]` absent).

- [ ] **Step 2 : lancer (échec attendu).**

- [ ] **Step 3 : `use-street-shops.ts`** selon l'interface (fichier court, commentaire d'en-tête : décor recalculé à la minute, simulation de la rue recalculée au changement de jour ou de noms).

- [ ] **Step 4 : `CityScene`** — destructurer aussi `city` des props (`SceneBodyProps` le transmet déjà : vérifier, sinon l'ajouter au type) ; après les immeubles du premier plan et AVANT le trottoir, pour chaque vue : `<g data-shop={slot.id} data-shop-phase={phase}>` contenant `ShopFront` avec, en `children`, `ShopInterior` (`type = view.interior`, `w/h` = taille de la vitrine, `staffed = phase === 'open'`, `lit = dark && phase === 'open'`, `seed = hashString(slot.id) ^ seed`). Nuit : `lit` des devantures de commerces ouverts. Les entrées d'habitants restent dessinées comme avant (elles sont déjà au bord grâce à Task 2).

- [ ] **Step 5 : `CityLifeLayer`**
  - Clients : `visits = useMemo(() => visitsFor(slots, frames, seed), …)` ; nœuds `<g data-life-id={v.id} data-customer="" data-active=…>` dans `data-city-sidewalk`, AVANT les habitants. Stade `inside` : le nœud est rendu dans un groupe clippé sur la vitrine du local — pour éviter un id, chaque client a DEUX nœuds : l'un sur le trottoir (stades `in`/`out`, y = `metrics.doorY`), l'autre dans `<svg x y width height overflow="hidden">` à la place de la vitrine (stade `inside`, y = bas de la vitrine − 3) ; la boucle `place` active l'un ou l'autre (`data-active`, `opacity`). Échelle `m.unit * STREET_SCALE.person * v.scale`, comme les habitants.
  - Présence : `gate = customerGate(view, city.minutes, intensity)` du local ; en mouvement réduit, aucun client actif.
  - Équipe : pour chaque vue `phase === 'works'`, `<g data-works={slot.id}>` : `LadderSprite` contre l'enseigne (visible des étapes `ladder-up` à `ladder-down`), deux `PersonSprite` en tenue `worker` (`data-worker`), placés selon l'étape : `arrive`/`leave` → marche depuis/vers le bord (x interpolé avec `progress` entre le bord du monde et le local, transition CSS `transform 30s linear` hors mouvement réduit) ; `climb*`/`remove`/`install` → l'un sur l'échelle (y = haut de l'enseigne + 18), l'autre au pied ; `hand` → l'un tend `CarriedSign`/`CarriedPlacard` ; `pause`/`rest` → les deux debout près de l'échelle. Ce qu'ils emportent en partant : l'ancienne enseigne (`CarriedSign` de `change.before`) ou l'écriteau retiré. En mouvement réduit : pose `install` figée.

- [ ] **Step 6 : lancer** `npx vitest run tests/content --maxWorkers=4` → PASS (y compris les tests existants de la ville).

- [ ] **Step 7 : vérification visuelle** — `npm run build`, puis dans le navigateur intégré, ouvrir le banc existant de la ville s'il existe (`ls .superpowers/harness`) ou l'extension rechargée, pièce Ville, fenêtre large : vérifier enseignes, intérieurs, rideau la nuit, un client qui entre, puis forcer l'heure (rangée Ciel) à 10 h un jour de chantier. Capture jointe au rapport. Noter les défauts visibles dans le rapport ; corriger ce qui gêne la lecture.

- [ ] **Step 8 : commit** — `git commit -m "feat(ville): commerces dans la rue, clients et équipe du matin"`

---

### Task 10 : fiche WikiHow, vérification complète, livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts`
- Test: tests existants des fiches (`grep -rl "entries" tests/core/whats-new`)

- [ ] **Step 1 : fiche `bibliotheque-v23`**, insérée après `bibliotheque-v21` dans `entries.ts`, même forme (thème `collection`, glyphe `🏪`, `scene: { page: '/collection', closeWindows: true }`), titre « La rue commerçante », résumé : « Boulangerie, bar, coiffeur, boîte de nuit… des commerces ouvrent, ferment et changent d'enseigne au pied des immeubles ». Trois étapes, chacune avec `text` + `details` (`À quoi ça sert`, `Comment faire`, `D'où viennent les données`, `Limites`) :
  1. Les commerces : 32 types, intérieur visible par la vitrine, vendeur, clients qui entrent ; horaires réels (boulangerie fermée le lundi, bar jusqu'à 2 h, boîte de nuit du jeudi au samedi), rideau baissé la nuit. Limites : environ 6 immeubles sur 10 ont un local (les plus étroits n'ont que leur porte) ; le nom est petit, lisible surtout en grande fenêtre ou en plein écran.
  2. Les noms : noms de vrais commerces dans un rayon de 25 km (OpenStreetMap), demandés par le relais avec votre position arrondie à environ 10 km, jamais enregistrée ; sinon une liste de noms inventés. Limites : sans position (ou si le service ne répond pas), noms inventés ; deux appareils peuvent afficher des noms différents pour le même commerce.
  3. La vie d'un local : ouvert 3 à 12 semaines, puis reloué tout de suite ou « À vendre » 1 à 3 semaines ; le jour du changement, une équipe vient toute la matinée avec une échelle, dépose l'ancienne enseigne, pose la nouvelle ou colle l'écriteau. Au premier affichage, tous les locaux sont occupés. Limites : un changement par local toutes les quelques semaines, il faut être là le matin pour voir l'équipe ; pas encore de gestes à l'intérieur (prévu plus tard) ; si vous réduisez les animations, l'équipe reste figée et aucun client ne circule.

- [ ] **Step 2 : suite complète** — `npx vitest run --maxWorkers=4` (toutes vertes, à l'exception des erreurs non gérées DÉJÀ connues du mock de géolocalisation de `library-weather-ui` : les compter et vérifier qu'elles ne sont pas plus nombreuses qu'avant sur `origin/main`), `npm run typecheck`, `npm run build`, `npx tsc --noEmit -p relay`.

- [ ] **Step 3 : relecture finale** de toute la branche (`git diff origin/main...HEAD`) contre la spec et ce plan.

- [ ] **Step 4 : livraison** (contrôleur, pas un sous-agent) : push, PR vers `main` (description en français, finissant par la ligne « 🤖 Generated with [Claude Code](https://claude.com/claude-code) »), fusion, `npm run preprod` depuis un arbre à jour de `main`, déploiement du relais (`cd relay && npx wrangler deploy`, puis `curl "https://<relais>/shops?lat=47.5&lon=-0.6"` doit renvoyer `{"ok":true,"names":{…}}` avec des noms angevins), retrait de la jonction `node_modules` et du worktree.

- [ ] **Step 5 : commit de la fiche** (avant Step 4) — `git commit -m "docs(wikihow): fiche bibliotheque-v23, la rue commerçante"`
