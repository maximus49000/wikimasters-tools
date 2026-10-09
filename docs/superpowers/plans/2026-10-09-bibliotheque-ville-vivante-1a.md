# Ville vivante, vague 1a (vie ambiante et calendrier) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les acteurs `walker` et `car` de la scène Ville par une vie ambiante (passants variés, école, deux files de circulation, lampadaires, entrées d'immeuble avec habitants qui entrent et sortent) pilotée par l'heure, la météo, le jour de la semaine, les jours fériés et les vacances scolaires (récupérées automatiquement via le relais, selon la zone).

**Architecture:** Moteur pur déterministe et sans état dans `src/core/library/city/` (calendrier, zone, intensités, population de passants, véhicules, lampadaires, entrées, trajets d'habitants), rendu SVG dans `src/content/` (sprites par couches, couche `CityLifeLayer` mise à jour par la boucle `requestAnimationFrame` sur l'horloge murale). Le relais Cloudflare gagne deux routes (`/school-calendar`, `/department`). Un réglage local « zone scolaire » (Automatique, A, B, C, Corse) complète le panneau Ciel.

**Tech Stack:** TypeScript, React, SVG, vitest (jsdom pour les composants), Cloudflare Worker (relais), WXT.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-ville-vivante-design.md` (sections « Principes communs », « Calendrier », « Vague 1a : vie ambiante », « Lampadaires », « Entrées d'immeuble et habitants »). Maquette de référence validée dans la conversation du 2026-10-09 (v3).

## Hors périmètre de cette vague (vagues 1b et 1c)

Événements (avion, bus spécial, père Noël…), décors de fête (sapins, guirlandes, citrouilles, houx, décors de lampadaire), montage et démontage avec échelles, déguisements d'Halloween, réaction des animaux. La vague 1a prépare seulement le contexte de calendrier (jour férié, vacances, nom de la fête) que ces vagues liront.

## Global Constraints

- Tout est **déterministe et sans état** : aucune utilisation de `Math.random` ; seed = `hashString(room.id)` ; instant = horloge murale (`Date.now()`), jamais `performance.now`.
- **Position jamais enregistrée ni envoyée en clair** : au relais, coordonnées arrondies à 0,1° (comme `/weather`). Aucun nouveau secret côté client.
- **Mouvement réduit** (`prefers-reduced-motion: reduce`) : positions figées au premier calcul, aucune boucle d'animation.
- **Mobile** : au plus 14 piétons + 10 véhicules + 6 habitants visibles par 720 px de largeur de monde ; la boucle ne touche que des attributs `transform`/`opacity` (pas de re-rendu React par image) ; boucle suspendue quand `document.visibilityState === 'hidden'`.
- Textes **en français**, glyphes plutôt que du texte dans les boutons, tout visible à l'écran (extension ET mobile).
- Heures de la logique (spec) : pointes de circulation centrées sur 8 h et 17 h (montée puis descente sur 1 h) ; école : aller 7 h 50 à 8 h 30, sortie 16 h 45 à 17 h 15, **mercredi** : aller identique, sortie vers 12 h (11 h 45 à 12 h 15), rien à 16 h 45 ; **week-end, jours fériés** : plus de marcheurs, plus d'enfants dehors, presque aucun costume, pointe très atténuée ; **vacances** : aucun groupe d'école, circulation un peu réduite sans vraie pointe du matin ; **pluie** : plus de voitures, piétons réduits et tous sous un parapluie ; **nuit** : presque personne.
- Circulation : **on roule à droite** ; face aux immeubles, la file du **premier plan roule vers la droite** (`near`, +1) et la file du **fond vers la gauche** (`far`, −1, dessinée à l'échelle 0,9).
- Lampadaires : allumés quand `daylight < 0.45`, **éteints entre 23 h 45 et 0 h 15 selon chaque lampadaire** (tirage `offJitter` ∈ [−15, +15] min) et restent éteints jusqu'à l'aube ; en mode d'heure « Toujours la nuit » ils sont allumés.
- Calendrier français : jours fériés calculés localement ; vacances récupérées du calendrier officiel via le relais ; zone par défaut quand rien n'est connu : `C`.
- Fiche WikiHow : `bibliotheque-v20` (la `v19` existe déjà). Chaque étape : `text` + `details` (`À quoi ça sert`, `Comment faire`, `D'où viennent les données`, `Limites`) + `scene`.
- Commits : message en français style `feat(ville): …` ; terminer par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Exécution des tests : `npx vitest run <fichier> --maxWorkers=4`. Suite complète : `npx vitest run --maxWorkers=4` (le test `library-drag.test.tsx` est instable en parallélisme total). Vérifications finales : `npm run typecheck`, `npm run build`.
- Worktree de travail : `C:\Users\maxim\Downloads\Wikimasters-bibliotheque` (branche `feat/bibliotheque-ville-vivante`), jonction `node_modules` et `.env.local` à copier puis supprimer en fin de travail (méthode des morceaux précédents).

## Structure des fichiers

Créer :
- `src/core/library/city/calendar.ts` — dates, Pâques, jours fériés, `DayContext`.
- `src/core/library/city/zones.ts` — département → zone scolaire, Alsace-Moselle.
- `src/core/library/city/school-calendar.ts` — lecture de la réponse du relais, cache 7 jours, repli approché, client `createSchoolCalendar`.
- `src/core/library/city/intensity.ts` — `CityContext`, `CityIntensity`, `cityIntensity`.
- `src/core/library/city/people.ts` — profils, tenues, `pedestriansFor`, `pedestrianGate`.
- `src/core/library/city/vehicles.ts` — files, `vehiclesFor`, `vehicleGate`.
- `src/core/library/city/lamps.ts` — `lampsFor`, `lampLit`.
- `src/core/library/city/doors.ts` — `doorsFor`, `tripsFor`, `tripAt`, `tripHappens`, `residentFlow`.
- `src/core/library/city/metrics.ts` — `cityMetrics(height)` (sol, trottoir, files, échelle).
- `src/content/city-sprites.tsx` — `PersonSprite`, `VehicleSprite`, `LampSprite`, `EntranceSprite`.
- `src/content/city-life.tsx` — `CityLifeLayer` (piétons, familles, habitants, véhicules).
- `src/content/zone-setting.ts` — réglage local `wmt:library-zone`.
- `src/content/use-city-calendar.ts` — hook zone → vacances → `DayContext`.
- `relay/src/school-calendar.ts`, `relay/src/department.ts`.
- Tests : `tests/core/library/city-*.test.ts`, `tests/relay/school-calendar.test.ts`, `tests/relay/department.test.ts`, `tests/content/city-life.test.tsx`.

Modifier :
- `src/core/library/scene-world.ts` — `loopX` exporté, retrait de `walker`/`car` des acteurs de la ville (les entrées sont calculées dans `doors.ts`, sans toucher à `citySkyline`).
- `src/content/scene-city.tsx` — sol à deux files, trottoir, entrées, lampadaires.
- `src/content/scene-panorama.tsx` — prop `city?`, `CityLifeLayer` pour la scène Ville.
- `src/content/use-scene-time.ts` — expose `date` et `mode`.
- `src/content/LibraryPanel.tsx`, `src/content/RoomView.tsx` — `city` dans `sceneView`, bouton de zone.
- `relay/src/index.ts`, `relay/README.md`.
- `src/core/whats-new/entries.ts` — fiche `bibliotheque-v20`.

---

### Task 1: Calendrier (jours, fériés, vacances)

**Files:**
- Create: `src/core/library/city/calendar.ts`
- Test: `tests/core/library/city-calendar.test.ts`

**Interfaces:**
- Produces:
  - `type YMD = { y: number; m: number; d: number }`
  - `type HolidayPeriod = { name: string; start: string; end: string }` (`start` inclus, `end` exclu = jour de reprise, format `YYYY-MM-DD`)
  - `type DayKind = 'school' | 'wednesday' | 'weekend' | 'holiday' | 'public-holiday'`
  - `type DayContext = { date: YMD; iso: string; weekday: number; kind: DayKind; schoolOn: boolean; publicHoliday: string | null }`
  - `isoDate(date: YMD): string`, `weekdayOf(date: YMD): number` (0 = dimanche), `addDays(date: YMD, n: number): YMD`, `easterSunday(year: number): YMD`, `publicHolidays(year: number, alsaceMoselle?: boolean): Record<string, string>` (clé ISO), `dayContext(date: YMD, periods: HolidayPeriod[], alsaceMoselle?: boolean): DayContext`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/city-calendar.test.ts
import { describe, expect, it } from 'vitest';
import { addDays, dayContext, easterSunday, isoDate, publicHolidays, weekdayOf, type HolidayPeriod } from '../../../src/core/library/city/calendar';

describe('Pâques et jours fériés', () => {
  it('calcule le dimanche de Pâques', () => {
    expect(isoDate(easterSunday(2024))).toBe('2024-03-31');
    expect(isoDate(easterSunday(2025))).toBe('2025-04-20');
    expect(isoDate(easterSunday(2026))).toBe('2026-04-05');
    expect(isoDate(easterSunday(2027))).toBe('2027-03-28');
  });
  it('liste les fériés fixes et mobiles de 2026', () => {
    const h = publicHolidays(2026);
    expect(h['2026-01-01']).toBeDefined();
    expect(h['2026-05-01']).toBeDefined();
    expect(h['2026-07-14']).toBeDefined();
    expect(h['2026-12-25']).toBeDefined();
    expect(h['2026-04-06']).toBeDefined(); // lundi de Pâques
    expect(h['2026-05-14']).toBeDefined(); // Ascension
    expect(h['2026-05-25']).toBeDefined(); // lundi de Pentecôte
    expect(h['2026-04-03']).toBeUndefined(); // Vendredi saint : pas férié hors Alsace-Moselle
    expect(Object.keys(h)).toHaveLength(11);
  });
  it('ajoute le Vendredi saint et le 26 décembre en Alsace-Moselle', () => {
    const h = publicHolidays(2026, true);
    expect(h['2026-04-03']).toBeDefined();
    expect(h['2026-12-26']).toBeDefined();
  });
});

describe('dates', () => {
  it('donne le jour de la semaine et ajoute des jours', () => {
    expect(weekdayOf({ y: 2026, m: 10, d: 9 })).toBe(5); // vendredi
    expect(isoDate(addDays({ y: 2026, m: 12, d: 30 }, 3))).toBe('2027-01-02');
  });
});

describe('dayContext', () => {
  const periods: HolidayPeriod[] = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
  const at = (y: number, m: number, d: number) => dayContext({ y, m, d }, periods);

  it('distingue jour d’école, mercredi, week-end, vacances et férié', () => {
    expect(at(2026, 10, 9).kind).toBe('school'); // vendredi
    expect(at(2026, 10, 7).kind).toBe('wednesday');
    expect(at(2026, 10, 10).kind).toBe('weekend');
    expect(at(2026, 10, 20).kind).toBe('holiday'); // mardi en vacances
    expect(at(2026, 11, 1).kind).toBe('weekend'); // dimanche : le week-end prime sur les vacances
    expect(at(2026, 11, 2).kind).toBe('school'); // reprise (end exclu)
    expect(at(2026, 5, 14).kind).toBe('public-holiday');
  });
  it('schoolOn vaut vrai pour jour d’école et mercredi seulement', () => {
    expect(at(2026, 10, 9).schoolOn).toBe(true);
    expect(at(2026, 10, 7).schoolOn).toBe(true);
    expect(at(2026, 10, 20).schoolOn).toBe(false);
    expect(at(2026, 10, 10).schoolOn).toBe(false);
  });
  it('un jour férié tombant en vacances reste férié et porte son nom', () => {
    const ctx = dayContext({ y: 2026, m: 11, d: 1 }, [{ name: 'x', start: '2026-10-01', end: '2026-12-01' }]);
    expect(ctx.publicHoliday).toBeTruthy();
    expect(ctx.kind).toBe('public-holiday');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/city-calendar.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/library/city/calendar.ts
export type YMD = { y: number; m: number; d: number };
// `start` inclus, `end` EXCLU (jour de reprise des cours), au format AAAA-MM-JJ : la comparaison de chaînes suffit.
export type HolidayPeriod = { name: string; start: string; end: string };
export type DayKind = 'school' | 'wednesday' | 'weekend' | 'holiday' | 'public-holiday';
export type DayContext = { date: YMD; iso: string; weekday: number; kind: DayKind; schoolOn: boolean; publicHoliday: string | null };

const pad = (n: number): string => String(n).padStart(2, '0');
export const isoDate = ({ y, m, d }: YMD): string => `${y}-${pad(m)}-${pad(d)}`;
export const weekdayOf = ({ y, m, d }: YMD): number => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

export function addDays(date: YMD, n: number): YMD {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Calendrier grégorien (algorithme de Meeus, Jones et Butcher).
export function easterSunday(year: number): YMD {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y: year, m: month, d: day };
}

const FIXED: readonly (readonly [number, number, string])[] = [
  [1, 1, 'Jour de l’An'],
  [5, 1, 'Fête du Travail'],
  [5, 8, 'Victoire de 1945'],
  [7, 14, 'Fête nationale'],
  [8, 15, 'Assomption'],
  [11, 1, 'Toussaint'],
  [11, 11, 'Armistice'],
  [12, 25, 'Noël'],
];

export function publicHolidays(year: number, alsaceMoselle = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [m, d, name] of FIXED) out[isoDate({ y: year, m, d })] = name;
  const easter = easterSunday(year);
  out[isoDate(addDays(easter, 1))] = 'Lundi de Pâques';
  out[isoDate(addDays(easter, 39))] = 'Ascension';
  out[isoDate(addDays(easter, 50))] = 'Lundi de Pentecôte';
  if (alsaceMoselle) {
    out[isoDate(addDays(easter, -2))] = 'Vendredi saint';
    out[isoDate({ y: year, m: 12, d: 26 })] = 'Saint-Étienne';
  }
  return out;
}

export function dayContext(date: YMD, periods: HolidayPeriod[], alsaceMoselle = false): DayContext {
  const iso = isoDate(date);
  const weekday = weekdayOf(date);
  const publicHoliday = publicHolidays(date.y, alsaceMoselle)[iso] ?? null;
  const onVacation = periods.some((p) => iso >= p.start && iso < p.end);
  const kind: DayKind = publicHoliday ? 'public-holiday' : weekday === 0 || weekday === 6 ? 'weekend' : onVacation ? 'holiday' : weekday === 3 ? 'wednesday' : 'school';
  return { date, iso, weekday, kind, schoolOn: kind === 'school' || kind === 'wednesday', publicHoliday };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/city-calendar.test.ts --maxWorkers=4`
Expected: PASS (le test compte bien 11 jours fériés : 8 fixes + 3 mobiles).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/calendar.ts tests/core/library/city-calendar.test.ts
git commit -m "feat(ville): calendrier (Pâques, jours fériés, jours d'école et vacances)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Zones scolaires et client du calendrier scolaire

**Files:**
- Create: `src/core/library/city/zones.ts`, `src/core/library/city/school-calendar.ts`
- Test: `tests/core/library/city-zones.test.ts`, `tests/core/library/city-school-calendar.test.ts`

**Interfaces:**
- Consumes: `HolidayPeriod` de `calendar.ts` ; `RELAY_BASE` de `src/core/documentary/config`.
- Produces:
  - `type Zone = 'A' | 'B' | 'C' | 'Corse'`, `const ZONES: readonly Zone[]`, `const DEFAULT_ZONE: Zone` (= `'C'`)
  - `zoneOfDepartment(code: string): Zone | null`, `isAlsaceMoselle(code: string): boolean`
  - `parseSchoolReply(raw: unknown): { zone: Zone; periods: HolidayPeriod[] } | null`
  - `approximatePeriods(year: number): HolidayPeriod[]` (repli approché pour l'année scolaire commençant en `year`, ainsi que la précédente)
  - `createSchoolCalendar(deps: { fetch: (url: string) => Promise<Response>; now: () => number; storage: { get(key: string): string | null; set(key: string, value: string): void } }): { latest(zone: Zone): HolidayPeriod[]; refresh(zone: Zone): Promise<HolidayPeriod[]> }`
  - `SCHOOL_RELAY = `${RELAY_BASE}/school-calendar``, `DEPARTMENT_RELAY = `${RELAY_BASE}/department``

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/library/city-zones.test.ts
import { describe, expect, it } from 'vitest';
import { ZONES, isAlsaceMoselle, zoneOfDepartment } from '../../../src/core/library/city/zones';

describe('zones scolaires', () => {
  it('place des départements connus dans la bonne zone', () => {
    expect(zoneOfDepartment('75')).toBe('C'); // Paris
    expect(zoneOfDepartment('31')).toBe('C'); // Toulouse
    expect(zoneOfDepartment('69')).toBe('A'); // Lyon
    expect(zoneOfDepartment('33')).toBe('A'); // Bordeaux
    expect(zoneOfDepartment('59')).toBe('B'); // Lille
    expect(zoneOfDepartment('13')).toBe('B'); // Marseille
    expect(zoneOfDepartment('2A')).toBe('Corse');
  });
  it('couvre les 96 départements métropolitains et rejette le reste', () => {
    const codes = [...Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0')), '2A', '2B', ...Array.from({ length: 75 }, (_, i) => String(i + 21))];
    expect(codes).toHaveLength(96);
    for (const code of codes) expect(zoneOfDepartment(code), code).not.toBeNull();
    expect(zoneOfDepartment('971')).toBeNull();
    expect(zoneOfDepartment('xx')).toBeNull();
    expect(ZONES).toEqual(['A', 'B', 'C', 'Corse']);
  });
  it('reconnaît l’Alsace-Moselle', () => {
    for (const code of ['57', '67', '68']) expect(isAlsaceMoselle(code)).toBe(true);
    expect(isAlsaceMoselle('75')).toBe(false);
  });
});
```

(Les départements 21 à 95 sauf 2A/2B : les codes `'21'`…`'95'` ; vérifiez que `'20'` n'est pas dans la liste, il n'existe plus.)

```ts
// tests/core/library/city-school-calendar.test.ts
import { describe, expect, it, vi } from 'vitest';
import { approximatePeriods, createSchoolCalendar, parseSchoolReply } from '../../../src/core/library/city/school-calendar';

const reply = {
  ok: true,
  zone: 'C',
  periods: [
    { name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' },
    { name: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04' },
  ],
};

describe('parseSchoolReply', () => {
  it('lit une réponse valide', () => {
    expect(parseSchoolReply(reply)?.periods).toHaveLength(2);
  });
  it('rejette une réponse mal formée', () => {
    expect(parseSchoolReply(null)).toBeNull();
    expect(parseSchoolReply({ ok: false })).toBeNull();
    expect(parseSchoolReply({ ok: true, zone: 'Z', periods: [] })).toBeNull();
    expect(parseSchoolReply({ ok: true, zone: 'A', periods: [{ name: 'x', start: 'bad', end: '2026-01-01' }] })).toBeNull();
    expect(parseSchoolReply({ ok: true, zone: 'A', periods: [{ name: 'x', start: '2026-02-01', end: '2026-01-01' }] })).toBeNull();
  });
});

describe('approximatePeriods', () => {
  it('donne Toussaint, Noël et été pour les années voisines', () => {
    const names = approximatePeriods(2026).map((p) => p.name);
    expect(names.filter((n) => n.includes('Noël'))).toHaveLength(2);
    for (const p of approximatePeriods(2026)) expect(p.end > p.start).toBe(true);
  });
});

function memory() {
  const data = new Map<string, string>();
  return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => void data.set(k, v) };
}

describe('createSchoolCalendar', () => {
  it('interroge le relais une fois, puis sert le cache pendant 7 jours', async () => {
    let now = 1_000_000;
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(reply), { status: 200 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => now, storage: memory() });
    expect((await cal.refresh('C')).map((p) => p.name)).toContain('Vacances de Noël');
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain('/school-calendar?zone=C');
    now += 8 * 86_400_000;
    await cal.refresh('C');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('retombe sur le dernier cache puis sur le relevé approché si le relais échoue', async () => {
    const fetchFn = vi.fn(async () => new Response('x', { status: 502 }));
    const cal = createSchoolCalendar({ fetch: fetchFn, now: () => Date.UTC(2026, 9, 9), storage: memory() });
    expect(cal.latest('C').length).toBeGreaterThan(0); // approché avant tout appel
    expect((await cal.refresh('C')).length).toBeGreaterThan(0);
  });
  it('ne lève jamais quand fetch lève', async () => {
    const cal = createSchoolCalendar({ fetch: () => Promise.reject(new Error('réseau')), now: () => 0, storage: memory() });
    await expect(cal.refresh('A')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/city-zones.test.ts tests/core/library/city-school-calendar.test.ts --maxWorkers=4`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/library/city/zones.ts
export type Zone = 'A' | 'B' | 'C' | 'Corse';
export const ZONES: readonly Zone[] = ['A', 'B', 'C', 'Corse'];
// Zone choisie quand ni la position ni le réglage ne la donnent (Paris, Toulouse, Montpellier).
export const DEFAULT_ZONE: Zone = 'C';

// Département → académie → zone (calendrier scolaire de métropole).
const BY_ZONE: Record<Zone, readonly string[]> = {
  A: ['25', '39', '70', '90', '24', '33', '40', '47', '64', '03', '15', '43', '63', '21', '58', '71', '89', '07', '26', '38', '73', '74', '19', '23', '87', '01', '42', '69', '16', '17', '79', '86'],
  B: ['04', '05', '13', '84', '02', '60', '80', '14', '50', '61', '27', '76', '59', '62', '54', '55', '57', '88', '44', '49', '53', '72', '85', '06', '83', '18', '28', '36', '37', '41', '45', '08', '10', '51', '52', '22', '29', '35', '56', '67', '68'],
  C: ['77', '93', '94', '11', '30', '34', '48', '66', '75', '09', '12', '31', '32', '46', '65', '81', '82', '78', '91', '92', '95'],
  Corse: ['2A', '2B'],
};
const TABLE = new Map<string, Zone>();
for (const zone of ZONES) for (const code of BY_ZONE[zone]) TABLE.set(code, zone);

export const zoneOfDepartment = (code: string): Zone | null => TABLE.get(code.toUpperCase()) ?? null;
export const isAlsaceMoselle = (code: string): boolean => code === '57' || code === '67' || code === '68';
```

Compter à la main avant de valider : A 32, B 41, C 21, Corse 2 = 96 départements. Si le test « 96 départements » échoue, un code manque ou est en double : corriger la table, pas le test.

```ts
// src/core/library/city/school-calendar.ts
import { RELAY_BASE } from '../../documentary/config';
import type { HolidayPeriod } from './calendar';
import { ZONES, type Zone } from './zones';

export const SCHOOL_RELAY = `${RELAY_BASE}/school-calendar`;
export const DEPARTMENT_RELAY = `${RELAY_BASE}/department`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isZone = (v: unknown): v is Zone => typeof v === 'string' && (ZONES as readonly string[]).includes(v);

export function parseSchoolReply(raw: unknown): { zone: Zone; periods: HolidayPeriod[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { ok?: unknown; zone?: unknown; periods?: unknown };
  if (r.ok !== true || !isZone(r.zone) || !Array.isArray(r.periods)) return null;
  const periods: HolidayPeriod[] = [];
  for (const p of r.periods as Record<string, unknown>[]) {
    if (typeof p?.name !== 'string' || typeof p.start !== 'string' || typeof p.end !== 'string') return null;
    if (!ISO.test(p.start) || !ISO.test(p.end) || p.end <= p.start) return null;
    periods.push({ name: p.name, start: p.start, end: p.end });
  }
  return { zone: r.zone, periods };
}

// Repli approché (dates indicatives, sans zone) : jamais présenté comme officiel. Pour l'année civile `year` et la précédente.
export function approximatePeriods(year: number): HolidayPeriod[] {
  const out: HolidayPeriod[] = [];
  for (const y of [year - 1, year]) {
    out.push({ name: 'Vacances de la Toussaint (approché)', start: `${y}-10-19`, end: `${y}-11-03` });
    out.push({ name: 'Vacances de Noël (approché)', start: `${y}-12-20`, end: `${y + 1}-01-05` });
    out.push({ name: 'Vacances d’été (approché)', start: `${y}-07-06`, end: `${y}-09-01` });
  }
  return out;
}

type Deps = {
  fetch: (url: string) => Promise<Response>;
  now: () => number;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
};
type Saved = { at: number; periods: HolidayPeriod[] };

const KEY = (zone: Zone): string => `wmt:school-calendar:${zone}`;
const FRESH_MS = 7 * 86_400_000;
const BACKOFF_MS = 15 * 60_000;

// Calendrier officiel par le relais, cache de 7 jours (une requête au plus par jour même en échec), repli approché. Ne lève jamais.
export function createSchoolCalendar(deps: Deps): { latest(zone: Zone): HolidayPeriod[]; refresh(zone: Zone): Promise<HolidayPeriod[]> } {
  const memory = new Map<Zone, Saved>();
  const retryAt = new Map<Zone, number>();
  const inFlight = new Map<Zone, Promise<HolidayPeriod[]>>();
  const fallback = (): HolidayPeriod[] => approximatePeriods(new Date(deps.now()).getUTCFullYear());

  const load = (zone: Zone): Saved | null => {
    const cached = memory.get(zone);
    if (cached) return cached;
    try {
      const text = deps.storage.get(KEY(zone));
      if (!text) return null;
      const s = JSON.parse(text) as Partial<Saved>;
      if (typeof s.at !== 'number' || !Array.isArray(s.periods)) return null;
      const parsed = parseSchoolReply({ ok: true, zone, periods: s.periods });
      if (!parsed) return null;
      const saved = { at: s.at, periods: parsed.periods };
      memory.set(zone, saved);
      return saved;
    } catch {
      return null;
    }
  };

  const fetchOnce = async (zone: Zone): Promise<HolidayPeriod[]> => {
    try {
      const response = await deps.fetch(`${SCHOOL_RELAY}?zone=${zone}`);
      if (!response.ok) throw new Error('status');
      const parsed = parseSchoolReply(await response.json());
      if (!parsed || parsed.zone !== zone) throw new Error('shape');
      const saved = { at: deps.now(), periods: parsed.periods };
      memory.set(zone, saved);
      try {
        deps.storage.set(KEY(zone), JSON.stringify(saved));
      } catch {
        // Stockage refusé : le cache mémoire suffit.
      }
      return saved.periods;
    } catch {
      retryAt.set(zone, deps.now() + BACKOFF_MS);
      return load(zone)?.periods ?? fallback();
    }
  };

  return {
    latest: (zone) => load(zone)?.periods ?? fallback(),
    refresh(zone) {
      const saved = load(zone);
      if (saved && deps.now() - saved.at < FRESH_MS) return Promise.resolve(saved.periods);
      if (deps.now() < (retryAt.get(zone) ?? 0)) return Promise.resolve(saved?.periods ?? fallback());
      let pending = inFlight.get(zone);
      if (!pending) {
        pending = fetchOnce(zone).finally(() => inFlight.delete(zone));
        inFlight.set(zone, pending);
      }
      return pending;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/library/city-zones.test.ts tests/core/library/city-school-calendar.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/zones.ts src/core/library/city/school-calendar.ts tests/core/library/city-zones.test.ts tests/core/library/city-school-calendar.test.ts
git commit -m "feat(ville): zones scolaires et client du calendrier scolaire (cache, repli)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Routes du relais `/school-calendar` et `/department`

**Files:**
- Create: `relay/src/school-calendar.ts`, `relay/src/department.ts`
- Modify: `relay/src/index.ts` (imports ligne 8 environ, `LIMITS` ligne 91, routes ligne 134), `relay/README.md`
- Test: `tests/relay/school-calendar.test.ts`, `tests/relay/department.test.ts`

**Interfaces:**
- Consumes: `forward`, `failure`, `Fetcher`, `ProxyResult` de `relay/src/proxy.ts` (voir `relay/src/weather.ts` pour le motif : cache mémoire d'instance, validation stricte des paramètres).
- Produces:
  - `proxySchoolCalendar(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult>` — `GET /school-calendar?zone=A|B|C|Corse` → `{ ok: true, zone, periods: [{ name, start, end }] }` (dates `YYYY-MM-DD` en heure de Paris, `end` = jour de reprise)
  - `proxyDepartment(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult>` — `GET /department?lat&lon` → `{ ok: true, dept: '75' }`

- [x] **Step 1: Vérifier la source réelle (FAIT le 2026-10-09, résultats à respecter)**

Le jeu `fr-en-calendrier-scolaire` (data.education.gouv.fr, API Explore v2.1) a été interrogé en direct ; `geo.api.gouv.fr/communes?lat=48.9&lon=2.4&fields=codeDepartement&format=json` aussi (réponse `[{"codeDepartement":"93","nom":"Pantin","code":"93055"}]`, compatible avec `/department`). Constats qui structurent le code :

- Champs : `description`, `population`, `start_date`, `end_date`, `location` (académie), `zones` (`Zone A`, `Zone B`, `Zone C`, `Corse`, plus l'outre-mer), `annee_scolaire`.
- **Une ligne par académie** : sans regroupement, la zone A compte 56 lignes pour une année et la limite de 100 est vite dépassée. La requête doit utiliser `select=description,population,start_date,end_date&group_by=description,population,start_date,end_date` (testé : renvoie 14 lignes pour la zone C de 2026 à 2027).
- Dates en **UTC** : `2026-10-16T22:00:00+00:00` est le 17 octobre à Paris ; `end_date` du jour de reprise (`2026-11-01T23:00:00+00:00` = lundi 2 novembre à Paris) : `start` inclus, `end` exclu, comme dans `calendar.ts`.
- `population` : `-` pour Toussaint, Noël, hiver, printemps et ponts ; **`Élèves` et `Enseignants` pour l'été** (donc ne pas filtrer sur `population="-"`) : garder tout sauf les lignes contenant « Enseignants » (insensible à la casse).
- Lignes parasites : `Début des Vacances d'Été` (début = fin, description ne commençant pas par « Vacances »/« Pont » : ignorée).
- **`Pont de l'Ascension` peut durer un seul instant** (`start_date` = `end_date`, ex. `2027-05-06T22:00:00+00:00`, soit le vendredi 7 mai à Paris) : le traiter comme **un jour** (`end = start + 1 jour`), jamais l'ignorer.
- Corse présente et exploitable (`zones="Corse"`).

Si l'API a changé au moment de l'implémentation, rejouer ces deux `curl`, adapter le code ET la fixture du test, et signaler tout écart.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/relay/school-calendar.test.ts
import { describe, expect, it, vi } from 'vitest';
import { proxySchoolCalendar } from '../../relay/src/school-calendar';

// Forme réelle de la réponse regroupée (voir l'étape de découverte) : dates en UTC, une ligne par période et population.
const records = {
  results: [
    { description: 'Vacances de la Toussaint', population: '-', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
    { description: 'Vacances de Noël', population: '-', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00' },
    { description: 'Pont de l’Ascension', population: '-', start_date: '2027-05-06T22:00:00+00:00', end_date: '2027-05-06T22:00:00+00:00' },
    { description: 'Vacances d’été', population: 'Enseignants', start_date: '2027-07-02T22:00:00+00:00', end_date: '2027-08-31T22:00:00+00:00' },
    { description: 'Vacances d’été', population: 'Élèves', start_date: '2027-07-02T22:00:00+00:00', end_date: '2027-09-01T22:00:00+00:00' },
    { description: 'Début des Vacances d’Été', population: '-', start_date: '2028-07-03T22:00:00+00:00', end_date: '2028-07-03T22:00:00+00:00' },
  ],
};
const run = (path: string, status = 200, body: unknown = records) => {
  const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  return { fetchFn, result: proxySchoolCalendar(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => Date.UTC(2026, 9, 9) }) };
};

describe('proxySchoolCalendar', () => {
  it('réduit la réponse aux vacances des élèves, en dates de Paris (pont d’un instant = un jour)', async () => {
    const { fetchFn, result } = run('/school-calendar?zone=C');
    const out = await result;
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({
      ok: true,
      zone: 'C',
      periods: [
        { name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' },
        { name: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04' },
        { name: 'Pont de l’Ascension', start: '2027-05-07', end: '2027-05-08' },
        { name: 'Vacances d’été', start: '2027-07-03', end: '2027-09-02' },
      ],
    });
    const upstream = decodeURIComponent(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream).toContain('Zone C');
    expect(upstream).toContain('group_by=description,population,start_date,end_date');
  });
  it('refuse une zone inconnue sans appeler l’amont', async () => {
    const { fetchFn, result } = run('/school-calendar?zone=Z');
    expect((await result).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('répond 502 si l’amont échoue ou répond mal', async () => {
    expect((await run('/school-calendar?zone=A', 500).result).status).toBe(502);
    expect((await run('/school-calendar?zone=A', 200, { nope: 1 }).result).status).toBe(502);
  });
  it('met en cache une journée par zone', async () => {
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(records), { status: 200 }));
    const deps = { fetch: fetchFn, now: () => Date.UTC(2026, 9, 9) };
    await proxySchoolCalendar(new URL('https://relais.test/school-calendar?zone=B'), deps);
    await proxySchoolCalendar(new URL('https://relais.test/school-calendar?zone=B'), deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
```

```ts
// tests/relay/department.test.ts
import { describe, expect, it, vi } from 'vitest';
import { proxyDepartment } from '../../relay/src/department';

const run = (path: string, body: unknown = [{ codeDepartement: '75' }], status = 200) => {
  const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  return { fetchFn, result: proxyDepartment(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => 0 }) };
};

describe('proxyDepartment', () => {
  it('renvoie le département et arrondit la position à 0,1°', async () => {
    const { fetchFn, result } = run('/department?lat=48.8566&lon=2.3522');
    expect(JSON.parse((await result).body)).toEqual({ ok: true, dept: '75' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.searchParams.get('lat')).toBe('48.9');
    expect(upstream.searchParams.get('lon')).toBe('2.4');
  });
  it('refuse des coordonnées invalides', async () => {
    for (const path of ['/department', '/department?lat=x&lon=2', '/department?lat=95&lon=2', '/department?lat=1e1&lon=2']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('répond not-found hors de France (liste vide) et 502 si l’amont échoue', async () => {
    expect(JSON.parse((await run('/department?lat=40&lon=-40', []).result).body)).toEqual({ ok: false, reason: 'not-found' });
    expect((await run('/department?lat=48&lon=2', [], 500).result).status).toBe(502);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/relay/school-calendar.test.ts tests/relay/department.test.ts --maxWorkers=4`
Expected: FAIL (modules introuvables).

- [ ] **Step 4: Write the implementation**

```ts
// relay/src/school-calendar.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BASE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
const CACHE_MS = 24 * 3_600_000;
const ZONES = ['A', 'B', 'C', 'Corse'] as const;
type Zone = (typeof ZONES)[number];

const cache = new Map<Zone, { at: number; body: string }>();

// Zone dans le jeu de données : « Zone A », « Zone B », « Zone C », « Corse ».
const zoneLabel = (zone: Zone): string => (zone === 'Corse' ? 'Corse' : `Zone ${zone}`);

const paris = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
// « 2026-10-16T22:00:00+00:00 » est le 17 octobre à Paris : la date doit être lue dans le fuseau de Paris.
const parisDate = (iso: string): string | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : paris.format(new Date(t));
};

export async function proxySchoolCalendar(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const zone = ZONES.find((z) => z === url.searchParams.get('zone'));
  if (!zone) return failure(400, 'bad-request');
  const hit = cache.get(zone);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  // Une ligne par académie dans le jeu : on regroupe côté source pour ne recevoir qu'une ligne par période et population.
  const since = new Date(deps.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    select: 'description,population,start_date,end_date',
    group_by: 'description,population,start_date,end_date',
    where: `zones="${zoneLabel(zone)}" and start_date>=date'${since}'`,
    order_by: 'start_date',
    limit: '100',
  });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let rows: unknown;
  try {
    rows = (JSON.parse(result.body) as { results?: unknown }).results;
  } catch {
    return failure(502, 'upstream');
  }
  if (!Array.isArray(rows)) return failure(502, 'upstream');
  const periods: { name: string; start: string; end: string }[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    // Seules les vacances des élèves comptent : ni les lignes des enseignants, ni « Début des vacances » (début = fin, hors description).
    if (typeof row.description !== 'string' || !/^(vacances|pont)/i.test(row.description)) continue;
    if (typeof row.population === 'string' && /enseignant/i.test(row.population)) continue;
    if (typeof row.start_date !== 'string' || typeof row.end_date !== 'string') continue;
    const start = parisDate(row.start_date);
    let end = parisDate(row.end_date);
    if (!start || !end || end < start) continue;
    // Un pont d'un seul instant (début = fin) dure un jour.
    if (end === start) end = parisDate(new Date(Date.parse(row.start_date) + 86_400_000).toISOString());
    if (!end) continue;
    periods.push({ name: row.description, start, end });
  }
  if (periods.length === 0) return failure(502, 'upstream');
  const body = JSON.stringify({ ok: true, zone, periods });
  cache.set(zone, { at: deps.now(), body });
  return { status: 200, body };
}
```

```ts
// relay/src/department.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BASE = 'https://geo.api.gouv.fr/communes';
const CACHE_MS = 30 * 86_400_000;
const CACHE_MAX = 500;
const COORD = /^-?\d{1,3}(\.\d+)?$/;
const cache = new Map<string, { at: number; body: string }>();
const rounded = (v: number): number => Math.round(v * 10) / 10;

// Position (arrondie à 0,1°) → code du département, par le service ouvert de l'État (sans clé). Sert à déduire la zone scolaire.
export async function proxyDepartment(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const rawLat = url.searchParams.get('lat') ?? '';
  const rawLon = url.searchParams.get('lon') ?? '';
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!COORD.test(rawLat) || !COORD.test(rawLon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return failure(400, 'bad-request');
  const key = `${rounded(lat).toFixed(1)},${rounded(lon).toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const query = new URLSearchParams({ lat: rounded(lat).toFixed(1), lon: rounded(lon).toFixed(1), fields: 'codeDepartement', format: 'json' });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let rows: unknown;
  try {
    rows = JSON.parse(result.body);
  } catch {
    return failure(502, 'upstream');
  }
  if (!Array.isArray(rows)) return failure(502, 'upstream');
  const dept = (rows[0] as { codeDepartement?: unknown } | undefined)?.codeDepartement;
  if (typeof dept !== 'string') return failure(404, 'not-found');
  const body = JSON.stringify({ ok: true, dept });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
```

Le test « hors de France » attend `{ ok: false, reason: 'not-found' }` avec le statut 404 (celui de `failure(404, 'not-found')`) ; ajuster l'assertion du test si besoin sur `.body` uniquement.

Dans `relay/src/index.ts` : importer les deux fonctions à côté de `proxyWeather`, ajouter `schoolCalendar: [30, 60_000], department: [60, 60_000]` à `LIMITS`, et ajouter dans `relay()` après la route `/weather` :

```ts
  if (get && url.pathname === '/school-calendar') return limited(request, 'schoolCalendar') ?? relayed(await proxySchoolCalendar(url, { fetch: net, now: () => Date.now() }));
  if (get && url.pathname === '/department') return limited(request, 'department') ?? relayed(await proxyDepartment(url, { fetch: net, now: () => Date.now() }));
```

Compléter `relay/README.md` (ligne « Routes ») : `/school-calendar?zone=A|B|C|Corse` (vacances scolaires officielles réduites, cache 24 h, sans secret, 30 appels par minute et par adresse) et `/department?lat&lon` (département par position arrondie à 0,1°, cache 30 jours, 60 appels par minute).

- [ ] **Step 5: Run tests to verify they pass, then the relay suite**

Run: `npx vitest run tests/relay --maxWorkers=4` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit, puis déployer le relais**

```bash
git add relay tests/relay
git commit -m "feat(relais): routes /school-calendar et /department

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Déploiement (le relais est déployé par Cloudflare Workers Builds à la fusion sur `main`, voir `relay/README.md` ; vérifier après fusion) :

```bash
curl -s "https://wikimasters-tools.maxime-protais-baumer.workers.dev/school-calendar?zone=C" | head -c 400
curl -s "https://wikimasters-tools.maxime-protais-baumer.workers.dev/department?lat=48.85&lon=2.35"
```

Si le déploiement n'est pas automatique ou échoue, demander à l'utilisateur de lancer `npx wrangler deploy` depuis `relay/` (action qui lui revient), ne pas improviser.

---

### Task 4: Intensités de la ville

**Files:**
- Create: `src/core/library/city/intensity.ts`
- Test: `tests/core/library/city-intensity.test.ts`

**Interfaces:**
- Consumes: `DayContext` de `calendar.ts`.
- Produces:
  - `type CityContext = { minutes: number; day: DayContext; precip: number; snow: boolean; storm: boolean; daylight: number }`
  - `type CityIntensity = { traffic: number; walkers: number; suits: number; schoolTo: number; schoolFrom: number; kids: number; sport: number; umbrellas: boolean; weekendLike: boolean }` (nombres entre 0 et 1)
  - `cityIntensity(ctx: CityContext): CityIntensity`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/city-intensity.test.ts
import { describe, expect, it } from 'vitest';
import { dayContext } from '../../../src/core/library/city/calendar';
import { cityIntensity, type CityContext } from '../../../src/core/library/city/intensity';

const vacations = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const DAYS = {
  school: dayContext({ y: 2026, m: 10, d: 9 }, vacations), // vendredi
  wednesday: dayContext({ y: 2026, m: 10, d: 7 }, vacations),
  weekend: dayContext({ y: 2026, m: 10, d: 10 }, vacations),
  holiday: dayContext({ y: 2026, m: 10, d: 20 }, vacations),
};
const at = (hours: number, kind: keyof typeof DAYS, extra: Partial<CityContext> = {}) =>
  cityIntensity({ minutes: Math.round(hours * 60), day: DAYS[kind], precip: 0, snow: false, storm: false, daylight: hours > 6 && hours < 20 ? 1 : 0, ...extra });

describe('circulation', () => {
  it('a des pointes à 8 h et 17 h en semaine, avec montée et descente', () => {
    expect(at(8, 'school').traffic).toBeGreaterThan(0.9);
    expect(at(17, 'school').traffic).toBeGreaterThan(0.9);
    expect(at(7, 'school').traffic).toBeGreaterThan(at(6.5, 'school').traffic);
    expect(at(9, 'school').traffic).toBeLessThan(at(8, 'school').traffic);
    expect(at(10.5, 'school').traffic).toBeLessThan(0.6);
    expect(at(3, 'school').traffic).toBeLessThan(0.1);
  });
  it('est très atténuée le week-end et un peu réduite en vacances', () => {
    expect(at(8, 'weekend').traffic).toBeLessThan(0.5 * at(8, 'school').traffic);
    expect(at(8, 'holiday').traffic).toBeLessThan(at(8, 'school').traffic);
    expect(at(8, 'holiday').traffic).toBeGreaterThan(at(8, 'weekend').traffic - 0.001);
  });
  it('augmente sous la pluie', () => {
    expect(at(11, 'school', { precip: 0.8 }).traffic).toBeGreaterThan(at(11, 'school').traffic);
  });
});

describe('piétons', () => {
  it('sont plus nombreux le week-end à midi qu’en semaine à midi', () => {
    expect(at(12, 'weekend').walkers).toBeGreaterThan(at(12, 'school').walkers);
  });
  it('baissent sous la pluie et déclenchent les parapluies', () => {
    const rain = at(12, 'weekend', { precip: 0.8 });
    expect(rain.walkers).toBeLessThan(0.5 * at(12, 'weekend').walkers);
    expect(rain.umbrellas).toBe(true);
    expect(at(12, 'weekend').umbrellas).toBe(false);
  });
  it('sont presque absents la nuit', () => {
    expect(at(3.5, 'school').walkers).toBeLessThan(0.08);
  });
  it('les costumes dominent la pointe du matin de semaine et disparaissent le week-end', () => {
    expect(at(8, 'school').suits).toBeGreaterThan(0.6);
    expect(at(8, 'weekend').suits).toBeLessThan(0.02);
    expect(at(8, 'holiday').suits).toBeLessThan(at(8, 'school').suits * 0.4);
  });
});

describe('école', () => {
  it('aller de 7 h 50 à 8 h 30, sortie à 16 h 45 les jours d’école', () => {
    expect(at(8.25, 'school').schoolTo).toBeGreaterThan(0.9);
    expect(at(7.5, 'school').schoolTo).toBe(0);
    expect(at(8.5, 'school').schoolTo).toBe(0);
    expect(at(16.75, 'school').schoolFrom).toBeGreaterThan(0.9);
    expect(at(16, 'school').schoolFrom).toBe(0);
  });
  it('le mercredi : aller le matin, sortie vers midi, rien à 16 h 45', () => {
    expect(at(8.25, 'wednesday').schoolTo).toBeGreaterThan(0.9);
    expect(at(12, 'wednesday').schoolFrom).toBeGreaterThan(0.9);
    expect(at(16.75, 'wednesday').schoolFrom).toBe(0);
  });
  it('aucun groupe le week-end ni en vacances', () => {
    for (const kind of ['weekend', 'holiday'] as const) {
      expect(at(8.25, kind).schoolTo).toBe(0);
      expect(at(16.75, kind).schoolFrom).toBe(0);
    }
  });
});

describe('enfants dehors et sportifs', () => {
  it('beaucoup d’enfants qui jouent le week-end, peu en semaine, quasi aucun sous la pluie ou la nuit', () => {
    expect(at(14, 'weekend').kids).toBeGreaterThan(0.6);
    expect(at(14, 'school').kids).toBeLessThan(0.1);
    expect(at(14, 'weekend', { precip: 0.8 }).kids).toBeLessThan(0.15);
    expect(at(22, 'weekend').kids).toBeLessThan(0.1);
  });
  it('peu de sportifs', () => {
    for (let h = 0; h < 24; h += 0.5) expect(at(h, 'weekend').sport).toBeLessThanOrEqual(0.25);
  });
});

describe('bornes', () => {
  it('reste dans [0, 1] à toute heure et dans tous les cas', () => {
    for (const kind of Object.keys(DAYS) as (keyof typeof DAYS)[]) {
      for (let h = 0; h < 24; h += 0.25) {
        for (const extra of [{}, { precip: 1, storm: true }, { snow: true, precip: 0.5 }]) {
          const i = at(h, kind, extra);
          for (const v of [i.traffic, i.walkers, i.suits, i.schoolTo, i.schoolFrom, i.kids, i.sport]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/city-intensity.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/library/city/intensity.ts
import type { DayContext } from './calendar';

export type CityContext = { minutes: number; day: DayContext; precip: number; snow: boolean; storm: boolean; daylight: number };
export type CityIntensity = {
  traffic: number;
  walkers: number;
  suits: number;
  schoolTo: number;
  schoolFrom: number;
  kids: number;
  sport: number;
  umbrellas: boolean;
  weekendLike: boolean;
};

type Keys = readonly (readonly [number, number])[];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
// Fenêtre douce : monte de `from` à `rise`, plateau jusqu'à `fall`, redescend à `to`.
const bump = (h: number, from: number, rise: number, fall: number, to: number): number => smooth(from, rise, h) * (1 - smooth(fall, to, h));

function curve(keys: Keys, hour: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [h1, v1] = keys[i]!;
    const [h0, v0] = keys[i - 1]!;
    if (hour <= h1) return lerp(v0, v1, (hour - h0) / (h1 - h0));
  }
  return keys[keys.length - 1]![1];
}

// Valeurs lues sur les maquettes validées : pointes de circulation à 8 h et 17 h (montée puis descente sur environ 1 h).
const TRAFFIC_WEEK: Keys = [[0, 0.1], [4, 0.03], [6, 0.2], [6.5, 0.3], [7, 0.7], [8, 1], [9, 0.7], [9.5, 0.4], [12, 0.45], [16, 0.5], [16.5, 0.7], [17, 1], [18, 0.8], [18.5, 0.45], [21, 0.25], [23, 0.12], [24, 0.1]];
const TRAFFIC_WEEKEND: Keys = [[0, 0.1], [5, 0.03], [9, 0.25], [11, 0.45], [15, 0.45], [18, 0.35], [21, 0.2], [24, 0.1]];
const WALK_WEEK: Keys = [[0, 0.06], [4, 0.02], [6, 0.15], [7, 0.5], [8, 0.7], [9, 0.3], [12, 0.35], [14, 0.25], [17, 0.7], [18, 0.55], [20, 0.35], [22, 0.15], [24, 0.06]];
const WALK_WEEKEND: Keys = [[0, 0.1], [4, 0.02], [8, 0.2], [10, 0.55], [12, 0.8], [15, 0.8], [18, 0.6], [21, 0.35], [23, 0.15], [24, 0.1]];
const SUITS: Keys = [[0, 0], [6, 0], [7, 0.55], [8, 1], [9, 0.55], [10, 0.15], [12, 0.3], [13.5, 0.2], [16, 0.25], [17, 0.9], [18, 0.6], [19, 0.15], [24, 0]];

export function cityIntensity(ctx: CityContext): CityIntensity {
  const hour = (((ctx.minutes % 1440) + 1440) % 1440) / 60;
  const kind = ctx.day.kind;
  const weekendLike = kind === 'weekend' || kind === 'public-holiday';
  // `b` : 0 = jour de travail, 1 = week-end. Vacances : entre les deux ; mercredi : l'après-midi glisse vers le week-end.
  const b = weekendLike ? 1 : kind === 'holiday' ? 0.6 : kind === 'wednesday' ? smooth(12, 14, hour) * 0.5 : 0;

  const wet = ctx.precip;
  const weatherWalk = (1 - 0.65 * wet) * (ctx.storm ? 0.5 : 1) * (ctx.snow ? 0.6 : 1);
  const traffic = clamp01(lerp(curve(TRAFFIC_WEEK, hour), curve(TRAFFIC_WEEKEND, hour), b) * (1 + 0.25 * wet) * (ctx.snow ? 0.7 : 1));
  const walkers = clamp01(lerp(curve(WALK_WEEK, hour), curve(WALK_WEEKEND, hour), b) * weatherWalk);
  const suits = clamp01(curve(SUITS, hour) * (1 - b) * (1 - b) * weatherWalk);

  const schoolTo = ctx.day.schoolOn ? bump(hour, 7.6, 8.0, 8.3, 8.5) : 0;
  const schoolFrom = kind === 'school' ? bump(hour, 16.5, 16.75, 17.1, 17.4) : kind === 'wednesday' ? bump(hour, 11.5, 11.75, 12.1, 12.4) : 0;

  const light = smooth(0.1, 0.4, ctx.daylight);
  let kidsBase = 0;
  if (weekendLike) kidsBase = bump(hour, 9.5, 11, 17.5, 19) * 0.9;
  else if (kind === 'holiday') kidsBase = bump(hour, 9.5, 11, 17.5, 19) * 0.65;
  else if (kind === 'wednesday') kidsBase = bump(hour, 13.5, 14.5, 17.5, 18.5) * 0.6;
  else kidsBase = bump(hour, 16.8, 17.3, 18, 18.5) * 0.08;
  const kids = clamp01(kidsBase * light * (1 - wet) * (1 - wet));

  const sport = clamp01((bump(hour, 6, 7, 9, 10) + bump(hour, 17, 18, 19.5, 21)) * 0.12 * (weekendLike ? 1.4 : 1) * (1 - wet));

  return { traffic, walkers, suits, schoolTo, schoolFrom, kids, sport, umbrellas: wet >= 0.2, weekendLike };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/city-intensity.test.ts --maxWorkers=4`
Expected: PASS. Si une assertion de forme échoue (ex. `at(10.5,'school').traffic < 0.6`), ajuster les points de la courbe ou le seuil du test dans la limite de la logique de la spec, jamais l'inverse sur une règle de la spec (pointes à 8 h et 17 h, école, mercredi).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/intensity.ts tests/core/library/city-intensity.test.ts
git commit -m "feat(ville): intensités de piétons, circulation, école et enfants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Population déterministe (piétons, véhicules, lampadaires, entrées, habitants)

**Files:**
- Create: `src/core/library/city/people.ts`, `vehicles.ts`, `lamps.ts`, `doors.ts`, `metrics.ts`
- Modify: `src/core/library/scene-world.ts` (exporter `loopX`, retirer `walker` et `car` de `SPECS.city`)
- Test: `tests/core/library/city-people.test.ts`, `city-vehicles.test.ts`, `city-lamps.test.ts`, `city-doors.test.ts`, `city-metrics.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `hashString`, `citySkyline`, `Building`, `WORLD_MARGIN` de `scene-world.ts` ; `CityIntensity` de `intensity.ts`.
- Produces :
  - `scene-world.ts` : `loopX(phase: number, speed: number, width: number, t: number): number` (même formule qu'`actorX`, `actorX` l'appelle).
  - `metrics.ts` : `cityMetrics(height: number): { ground: number; walkY: number; doorY: number; laneY: { far: number; near: number }; unit: number }`
  - `people.ts` :
    - `type Profile = 'stroller' | 'suit' | 'jogger' | 'ordinary' | 'child'`
    - `type Hair = 'short' | 'long' | 'bun' | 'cap' | 'beanie' | 'bald'`, `type Top = 'tee' | 'sweater' | 'jacket' | 'coat' | 'shirt' | 'suit' | 'jersey'`, `type Bottom = 'pants' | 'jeans' | 'skirt' | 'shorts' | 'dress' | 'jogging'`, `type Accessory = 'none' | 'backpack' | 'bag' | 'case' | 'ball' | 'scarf'`
    - `type Outfit = { skin: string; hair: Hair; hairColor: string; hatColor: string; top: Top; topColor: string; bottom: Bottom; bottomColor: string; accessory: Accessory; accessoryColor: string }`
    - `type Pedestrian = { id: string; role: 'general' | 'schoolTo' | 'schoolFrom' | 'play'; profile: Profile; outfit: Outfit; companions: Outfit[]; dir: 1 | -1; speed: number; phase: number; u: number; scale: number; depth: number }` (`depth` ∈ [0,1] : position sur la largeur du trottoir)
    - `outfitFor(profile: Profile, rng: () => number): Outfit`
    - `pedestriansFor(width: number, seed: number): Pedestrian[]`
    - `pedestrianGate(p: Pedestrian, i: CityIntensity): number`
  - `vehicles.ts` : `type Lane = 'near' | 'far'`, `LANE_DIR: Record<Lane, 1 | -1>` (`near` = +1, `far` = −1), `type Vehicle = { id: string; lane: Lane; kind: 'car' | 'bus' | 'van' | 'bike'; color: string; speed: number; phase: number; u: number; scale: number }`, `vehiclesFor(width: number, seed: number): Vehicle[]`, `vehicleGate(v: Vehicle, i: CityIntensity): number`
  - `lamps.ts` : `type Lamp = { id: string; x: number; offJitter: number }`, `lampsFor(width: number, seed: number): Lamp[]`, `lampLit(lamp: Lamp, minutes: number, daylight: number, forcedNight?: boolean): boolean`
  - `doors.ts` : `type Door = { id: string; x: number; variant: 0 | 1 | 2; hallU: number }`, `doorsFor(width: number, height: number, seed: number): Door[]`, `type Trip = { id: string; kind: 'out' | 'in'; doorX: number; dir: 1 | -1; speed: number; phase: number; outfit: Outfit; profile: Profile; scale: number }`, `TRIP_CYCLE = 160`, `tripsFor(doors: Door[], seed: number): Trip[]`, `tripAt(trip: Trip, width: number, t: number): { x: number; fade: number } | null`, `tripHappens(trip: Trip, t: number, gate: number): boolean`, `residentFlow(i: CityIntensity, minutes: number): { out: number; in: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/library/city-metrics.test.ts
import { describe, expect, it } from 'vitest';
import { cityMetrics } from '../../../src/core/library/city/metrics';

describe('cityMetrics', () => {
  it('range sol, trottoir et deux files du haut vers le bas', () => {
    const m = cityMetrics(340);
    expect(m.ground).toBeCloseTo(340 * 0.78, 5);
    expect(m.walkY).toBeGreaterThan(m.ground);
    expect(m.laneY.far).toBeGreaterThan(m.walkY);
    expect(m.laneY.near).toBeGreaterThan(m.laneY.far);
    expect(m.laneY.near).toBeLessThan(340);
    expect(m.unit).toBeCloseTo(1, 5);
    expect(cityMetrics(170).unit).toBeCloseTo(0.5, 5);
  });
});
```

```ts
// tests/core/library/city-people.test.ts
import { describe, expect, it } from 'vitest';
import { cityIntensity, type CityIntensity } from '../../../src/core/library/city/intensity';
import { outfitFor, pedestrianGate, pedestriansFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const zero: CityIntensity = { traffic: 0, walkers: 0, suits: 0, schoolTo: 0, schoolFrom: 0, kids: 0, sport: 0, umbrellas: false, weekendLike: false };

describe('pedestriansFor', () => {
  it('est déterministe et borné pour 720 px', () => {
    const a = pedestriansFor(720, 7);
    expect(a).toEqual(pedestriansFor(720, 7));
    expect(a).not.toEqual(pedestriansFor(720, 8));
    expect(a.length).toBeGreaterThan(8);
    expect(a.length).toBeLessThanOrEqual(40);
  });
  it('les groupes d’école ont des enfants et vont dans un sens fixe selon le trajet', () => {
    const groups = pedestriansFor(1440, 3).filter((p) => p.role === 'schoolTo' || p.role === 'schoolFrom');
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.companions.length).toBeGreaterThanOrEqual(1);
      expect(g.dir).toBe(g.role === 'schoolTo' ? 1 : -1);
    }
  });
  it('la porte du seuil suit l’intensité du profil', () => {
    const [p] = pedestriansFor(2000, 1).filter((x) => x.profile === 'suit');
    expect(p).toBeDefined();
    expect(pedestrianGate(p!, zero)).toBe(0);
    expect(pedestrianGate(p!, { ...zero, suits: 0.8 })).toBe(0.8);
  });
});

describe('outfitFor — variété', () => {
  it('donne des tenues variées sur 60 tirages', () => {
    const rng = mulberry32(5);
    const tops = new Set<string>();
    const colors = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const o = outfitFor('ordinary', rng);
      tops.add(o.top);
      colors.add(o.topColor);
    }
    expect(tops.size).toBeGreaterThanOrEqual(4);
    expect(colors.size).toBeGreaterThanOrEqual(6);
  });
  it('respecte les profils', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 30; i++) {
      expect(outfitFor('suit', rng).top).toBe('suit');
      expect(['jersey']).toContain(outfitFor('jogger', rng).top);
      expect(['backpack', 'ball']).toContain(outfitFor('child', rng).accessory);
    }
  });
  it('deux passants voisins ne partagent presque jamais la même tenue', () => {
    const list = pedestriansFor(1440, 2).filter((p) => p.role === 'general');
    let same = 0;
    for (let i = 1; i < list.length; i++) if (JSON.stringify(list[i]!.outfit) === JSON.stringify(list[i - 1]!.outfit)) same++;
    expect(same).toBeLessThanOrEqual(1);
  });
});
```

```ts
// tests/core/library/city-vehicles.test.ts
import { describe, expect, it } from 'vitest';
import { LANE_DIR, vehicleGate, vehiclesFor } from '../../../src/core/library/city/vehicles';

describe('vehiclesFor', () => {
  it('roule à droite : premier plan vers la droite, fond vers la gauche', () => {
    expect(LANE_DIR.near).toBe(1);
    expect(LANE_DIR.far).toBe(-1);
    const list = vehiclesFor(720, 4);
    expect(list.some((v) => v.lane === 'near')).toBe(true);
    expect(list.some((v) => v.lane === 'far')).toBe(true);
    for (const v of list) expect(v.speed).toBeGreaterThan(0);
  });
  it('est déterministe, borné et réserve les vélos à la file du premier plan', () => {
    expect(vehiclesFor(720, 4)).toEqual(vehiclesFor(720, 4));
    expect(vehiclesFor(720, 4).length).toBeLessThanOrEqual(16);
    for (const v of vehiclesFor(2000, 6)) if (v.kind === 'bike') expect(v.lane).toBe('near');
  });
  it('les voitures suivent la circulation et les vélos les piétons', () => {
    const i = { traffic: 0.7, walkers: 0.2, suits: 0, schoolTo: 0, schoolFrom: 0, kids: 0, sport: 0, umbrellas: false, weekendLike: false };
    const car = vehiclesFor(2000, 1).find((v) => v.kind === 'car')!;
    const bike = vehiclesFor(2000, 1).find((v) => v.kind === 'bike');
    expect(vehicleGate(car, i)).toBe(0.7);
    if (bike) expect(vehicleGate(bike, i)).toBeLessThan(0.2);
  });
});
```

```ts
// tests/core/library/city-lamps.test.ts
import { describe, expect, it } from 'vitest';
import { lampLit, lampsFor, type Lamp } from '../../../src/core/library/city/lamps';

const h = (hours: number): number => Math.round(hours * 60);

describe('lampsFor', () => {
  it('espace régulièrement les lampadaires, de façon déterministe', () => {
    const lamps = lampsFor(1440, 3);
    expect(lamps).toEqual(lampsFor(1440, 3));
    expect(lamps.length).toBeGreaterThanOrEqual(6);
    for (const lamp of lamps) {
      expect(lamp.offJitter).toBeGreaterThanOrEqual(-15);
      expect(lamp.offJitter).toBeLessThanOrEqual(15);
    }
  });
});

describe('lampLit', () => {
  const early: Lamp = { id: 'a', x: 0, offJitter: -10 }; // s'éteint à 23 h 50
  const late: Lamp = { id: 'b', x: 0, offJitter: 10 }; // s'éteint à 0 h 10
  it('est éteint de jour', () => {
    expect(lampLit(early, h(12), 1)).toBe(false);
  });
  it('est allumé le soir', () => {
    expect(lampLit(early, h(21), 0.1)).toBe(true);
    expect(lampLit(late, h(21), 0.1)).toBe(true);
  });
  it('s’éteint en cascade autour de minuit', () => {
    expect(lampLit(early, h(23) + 45, 0)).toBe(true);
    expect(lampLit(early, h(23) + 55, 0)).toBe(false);
    expect(lampLit(late, h(23) + 55, 0)).toBe(true);
    expect(lampLit(late, 5, 0)).toBe(true); // 0 h 05
    expect(lampLit(late, 20, 0)).toBe(false); // 0 h 20
  });
  it('reste éteint jusqu’à l’aube', () => {
    expect(lampLit(late, h(3), 0)).toBe(false);
    expect(lampLit(early, h(5), 0.2)).toBe(false);
  });
  it('est toujours allumé en mode nuit forcée', () => {
    expect(lampLit(early, 0, 0, true)).toBe(true);
    expect(lampLit(early, h(12), 1, true)).toBe(false); // le jour reste le jour
  });
});
```

```ts
// tests/core/library/city-doors.test.ts
import { describe, expect, it } from 'vitest';
import { cityIntensity } from '../../../src/core/library/city/intensity';
import { dayContext } from '../../../src/core/library/city/calendar';
import { TRIP_CYCLE, doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../../src/core/library/city/doors';
import { WORLD_MARGIN, citySkyline } from '../../../src/core/library/scene-world';

describe('doorsFor', () => {
  it('place les entrées sur des immeubles du premier plan, de façon déterministe', () => {
    const doors = doorsFor(720, 340, 5);
    expect(doors).toEqual(doorsFor(720, 340, 5));
    expect(doors.length).toBeGreaterThanOrEqual(4);
    const near = citySkyline(720, 340, 5).filter((b) => !b.far);
    for (const d of doors) {
      expect(near.some((b) => d.x >= b.x && d.x + 18 <= b.x + b.w)).toBe(true);
      expect([0, 1, 2]).toContain(d.variant);
    }
  });
});

describe('trajets d’habitants', () => {
  const doors = doorsFor(720, 340, 5);
  const trips = tripsFor(doors, 5);
  it('chaque entrée a un trajet de sortie et un trajet d’entrée', () => {
    for (const d of doors) {
      expect(trips.filter((t) => t.doorX === d.x && t.kind === 'out')).toHaveLength(1);
      expect(trips.filter((t) => t.doorX === d.x && t.kind === 'in')).toHaveLength(1);
    }
  });
  it('un habitant qui sort part de la porte, un habitant qui entre y arrive', () => {
    const out = trips.find((t) => t.kind === 'out')!;
    const inn = trips.find((t) => t.kind === 'in')!;
    const startOut = tripAt({ ...out, phase: 0 }, 720, 0)!;
    expect(startOut.x).toBeCloseTo(out.doorX, 3);
    expect(startOut.fade).toBe(0);
    const reach = out.dir > 0 ? 720 + WORLD_MARGIN - out.doorX : out.doorX + WORLD_MARGIN;
    const arrive = tripAt({ ...inn, phase: 0 }, 720, (inn.dir > 0 ? inn.doorX + WORLD_MARGIN : 720 + WORLD_MARGIN - inn.doorX) / inn.speed - 0.01);
    if (arrive) expect(Math.abs(arrive.x - inn.doorX)).toBeLessThan(inn.speed * 0.05);
    expect(reach).toBeGreaterThan(0);
  });
  it('n’existe plus une fois le monde traversé', () => {
    const out = trips[0]!;
    expect(tripAt({ ...out, phase: 0 }, 720, TRIP_CYCLE - 1)).toBeNull();
  });
  it('tripHappens est déterministe et suit le seuil', () => {
    const t = trips[0]!;
    expect(tripHappens(t, 1000, 0)).toBe(false);
    expect(tripHappens(t, 1000, 1)).toBe(true);
    expect(tripHappens(t, 1000, 0.5)).toBe(tripHappens(t, 1000, 0.5));
  });
});

describe('residentFlow', () => {
  const day = (ymd: { y: number; m: number; d: number }) => dayContext(ymd, []);
  const flow = (hours: number, ymd = { y: 2026, m: 10, d: 9 }) => {
    const minutes = Math.round(hours * 60);
    return residentFlow(cityIntensity({ minutes, day: day(ymd), precip: 0, snow: false, storm: false, daylight: 1 }), minutes);
  };
  it('on sort le matin, on rentre le soir', () => {
    expect(flow(7.8).out).toBeGreaterThan(flow(7.8).in);
    expect(flow(18.5).in).toBeGreaterThan(flow(18.5).out);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/city-metrics.test.ts tests/core/library/city-people.test.ts tests/core/library/city-vehicles.test.ts tests/core/library/city-lamps.test.ts tests/core/library/city-doors.test.ts --maxWorkers=4`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Write the implementation**

`scene-world.ts` : extraire la formule d'`actorX` et retirer les deux acteurs de la ville.

```ts
// Position horizontale d'un objet qui traverse tout le monde puis recommence (`speed` signé, `phase` en px).
export function loopX(phase: number, speed: number, width: number, t: number): number {
  const loop = width + 2 * WORLD_MARGIN;
  const travelled = positiveMod(phase + Math.abs(speed) * t, loop);
  return speed > 0 ? travelled - WORLD_MARGIN : width + WORLD_MARGIN - travelled;
}

export function actorX(actor: Actor, width: number, t: number): number {
  return loopX(actor.phase, actor.speed, width, t);
}
```

Dans `SPECS.city` ne garder que l'entrée `cloud` (supprimer les lignes `walker` et `car`). `ActorKind` garde `'walker' | 'car'` (utilisés par `ActorSprite`) pour ne pas déplacer plus de code que nécessaire.

```ts
// src/core/library/city/metrics.ts
// Repère de la scène Ville : le monde fait `height` px de haut ; le dessin a été pensé pour 340 px (`unit` = échelle).
export type CityMetrics = { ground: number; walkY: number; doorY: number; laneY: { far: number; near: number }; unit: number };

export function cityMetrics(height: number): CityMetrics {
  const ground = height * 0.78;
  const sidewalk = height * 0.07;
  const road = height - ground - sidewalk;
  return {
    ground,
    walkY: ground + sidewalk * 0.7,
    doorY: ground + sidewalk * 0.1,
    laneY: { far: ground + sidewalk + road * 0.42, near: ground + sidewalk + road * 0.85 },
    unit: height / 340,
  };
}
```

```ts
// src/core/library/city/lamps.ts
import { mulberry32 } from '../scene-world';

export type Lamp = { id: string; x: number; offJitter: number };
const SPACING = 170;

// Un lampadaire tous les ~170 px ; chacun s'éteint entre 23 h 45 et 0 h 15 (`offJitter` en minutes, de −15 à +15).
export function lampsFor(width: number, seed: number): Lamp[] {
  const rng = mulberry32(seed ^ 0x1a3b5);
  const out: Lamp[] = [];
  for (let i = 0, x = 60 + rng() * 40; x < width; i++, x += SPACING + (rng() - 0.5) * 50) {
    out.push({ id: `lamp-${i}`, x: Math.round(x), offJitter: Math.round(rng() * 30 - 15) });
  }
  return out;
}

// Allumé quand il fait sombre, jusqu'à son heure d'extinction vers minuit ; éteint ensuite jusqu'à l'aube.
// `forcedNight` : mode d'heure « Toujours la nuit » (minute 0) — les lampadaires restent allumés pour que la nuit reste lisible.
export function lampLit(lamp: Lamp, minutes: number, daylight: number, forcedNight = false): boolean {
  if (daylight >= 0.45) return false;
  if (forcedNight) return true;
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 720) return m < 1440 + lamp.offJitter;
  return lamp.offJitter > 0 && m < lamp.offJitter;
}
```

```ts
// src/core/library/city/vehicles.ts
import type { CityIntensity } from './intensity';
import { mulberry32 } from '../scene-world';

export type Lane = 'near' | 'far';
// On roule à droite : face aux immeubles, le premier plan va vers la droite de l'écran, le fond vers la gauche.
export const LANE_DIR: Record<Lane, 1 | -1> = { near: 1, far: -1 };
export type VehicleKind = 'car' | 'bus' | 'van' | 'bike';
export type Vehicle = { id: string; lane: Lane; kind: VehicleKind; color: string; speed: number; phase: number; u: number; scale: number };

const COLORS = ['#3B6FD6', '#C0463A', '#E0A21E', '#2E8B6A', '#444444', '#EEEEEE', '#7A3B8C', '#B3262B', '#4A9CC4'];
const WORLD_PAD = 160;

export function vehiclesFor(width: number, seed: number): Vehicle[] {
  const rng = mulberry32(seed ^ 0x7ee1c);
  const out: Vehicle[] = [];
  const perLane = Math.max(2, Math.min(8, Math.round(width / 170)));
  for (const lane of ['near', 'far'] as const) {
    for (let i = 0; i < perLane; i++) {
      const roll = rng();
      const kind: VehicleKind = roll < 0.08 ? 'bus' : roll < 0.2 ? 'van' : lane === 'near' && roll < 0.3 ? 'bike' : 'car';
      out.push({
        id: `veh-${lane}-${i}`,
        lane,
        kind,
        color: COLORS[Math.floor(rng() * COLORS.length)]!,
        speed: kind === 'bike' ? 18 + rng() * 8 : kind === 'bus' ? 42 + rng() * 14 : 55 + rng() * 35,
        phase: rng() * (width + WORLD_PAD),
        u: rng(),
        scale: 0.9 + rng() * 0.2,
      });
    }
  }
  return out;
}

// Les voitures, bus et camionnettes suivent la circulation ; les vélos suivent les piétons (donc la pluie les chasse).
export const vehicleGate = (v: Vehicle, i: CityIntensity): number => (v.kind === 'bike' ? i.walkers * 0.4 : i.traffic);
```

Note : `phase` dépasse `width + 2*WORLD_MARGIN` sans conséquence (`loopX` prend le modulo).

```ts
// src/core/library/city/people.ts
import { hashString, mulberry32 } from '../scene-world';
import type { CityIntensity } from './intensity';

export type Profile = 'stroller' | 'suit' | 'jogger' | 'ordinary' | 'child';
export type Hair = 'short' | 'long' | 'bun' | 'cap' | 'beanie' | 'bald';
export type Top = 'tee' | 'sweater' | 'jacket' | 'coat' | 'shirt' | 'suit' | 'jersey';
export type Bottom = 'pants' | 'jeans' | 'skirt' | 'shorts' | 'dress' | 'jogging';
export type Accessory = 'none' | 'backpack' | 'bag' | 'case' | 'ball' | 'scarf';
export type Outfit = { skin: string; hair: Hair; hairColor: string; hatColor: string; top: Top; topColor: string; bottom: Bottom; bottomColor: string; accessory: Accessory; accessoryColor: string };
export type Pedestrian = {
  id: string;
  role: 'general' | 'schoolTo' | 'schoolFrom' | 'play';
  profile: Profile;
  outfit: Outfit;
  companions: Outfit[];
  dir: 1 | -1;
  speed: number;
  phase: number;
  u: number;
  scale: number;
  depth: number;
};

const SKINS = ['#F2C9A5', '#E0A97F', '#B97A52', '#8A5A3B', '#6B4228'];
const HAIRS = ['#3B2A1E', '#111111', '#6B3A1E', '#8A5A2B', '#C9A24A', '#7A3B2A', '#9A9A9A'];
const BRIGHT = ['#C0463A', '#3B6FD6', '#2E8B6A', '#E0A21E', '#7A3B8C', '#E07A8C', '#4A9CC4', '#D95F2B', '#8A8A3A', '#B3262B', '#2A9DAA', '#F2C94C'];
const MUTED = ['#5A6B7A', '#8A7F76', '#43506A', '#7A8C80', '#6B6B7A', '#A89F91', '#3F5A4A', '#7A5A4A'];
const SUITS = ['#2A2F3A', '#243044', '#3A3A44', '#3B2F2A', '#4A4F5A'];
const DENIM = ['#243044', '#2F4A7A', '#3A3A44', '#5A6B7A', '#1E2A3A'];

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

export function outfitFor(profile: Profile, rng: () => number): Outfit {
  const base = { skin: pick(SKINS, rng), hairColor: pick(HAIRS, rng), hatColor: pick(BRIGHT, rng), accessoryColor: pick([...BRIGHT, ...MUTED], rng) };
  switch (profile) {
    case 'suit': {
      const c = pick(SUITS, rng);
      return { ...base, hair: pick(['short', 'short', 'bun', 'bald', 'long'] as const, rng), top: 'suit', topColor: c, bottom: rng() < 0.25 ? 'skirt' : 'pants', bottomColor: c, accessory: pick(['case', 'bag', 'none'] as const, rng) };
    }
    case 'jogger':
      return { ...base, hair: pick(['cap', 'bun', 'short', 'beanie'] as const, rng), top: 'jersey', topColor: pick(BRIGHT, rng), bottom: pick(['shorts', 'jogging'] as const, rng), bottomColor: pick(SUITS, rng), accessory: 'none' };
    case 'child':
      return { ...base, hair: pick(['short', 'long', 'bun', 'cap', 'beanie'] as const, rng), top: pick(['tee', 'sweater', 'jacket'] as const, rng), topColor: pick(BRIGHT, rng), bottom: pick(['pants', 'jeans', 'shorts', 'skirt'] as const, rng), bottomColor: pick([...DENIM, ...BRIGHT], rng), accessory: pick(['backpack', 'ball'] as const, rng) };
    default: {
      const top = pick(['tee', 'sweater', 'jacket', 'coat', 'shirt'] as const, rng);
      return {
        ...base,
        hair: pick(['short', 'long', 'bun', 'cap', 'beanie', 'bald'] as const, rng),
        top,
        topColor: pick([...BRIGHT, ...MUTED], rng),
        bottom: pick(['pants', 'jeans', 'skirt', 'dress', 'shorts'] as const, rng),
        bottomColor: pick([...DENIM, ...MUTED], rng),
        accessory: pick(['bag', 'scarf', 'none', 'none', 'backpack'] as const, rng),
      };
    }
  }
}

// Intensité qui décide de la présence d'un passant selon son rôle.
export function pedestrianGate(p: Pedestrian, i: CityIntensity): number {
  if (p.role === 'schoolTo') return i.schoolTo;
  if (p.role === 'schoolFrom') return i.schoolFrom;
  if (p.role === 'play') return i.kids;
  if (p.profile === 'suit') return i.suits;
  if (p.profile === 'jogger') return i.sport;
  return i.walkers;
}

export function pedestriansFor(width: number, seed: number): Pedestrian[] {
  const rng = mulberry32(seed ^ hashString('pedestrians'));
  const out: Pedestrian[] = [];
  const make = (id: string, role: Pedestrian['role'], profile: Profile, dir: 1 | -1, speedMin: number, speedMax: number, companions = 0): Pedestrian => ({
    id,
    role,
    profile,
    outfit: outfitFor(profile, rng),
    companions: Array.from({ length: companions }, () => outfitFor('child', rng)),
    dir,
    speed: speedMin + rng() * (speedMax - speedMin),
    phase: rng() * (width + 160),
    u: rng(),
    scale: role === 'play' ? 0.66 + rng() * 0.1 : 0.95 + rng() * 0.15,
    depth: rng(),
  });
  const dirOf = (): 1 | -1 => (rng() < 0.5 ? 1 : -1);

  const general = Math.max(4, Math.min(16, Math.round(width / 70)));
  for (let i = 0; i < general; i++) {
    const roll = rng();
    const profile: Profile = roll < 0.3 ? 'suit' : roll < 0.4 ? 'jogger' : roll < 0.7 ? 'stroller' : 'ordinary';
    out.push(make(`ped-${i}`, 'general', profile, dirOf(), profile === 'jogger' ? 38 : profile === 'suit' ? 26 : 14, profile === 'jogger' ? 50 : profile === 'suit' ? 34 : 24));
  }
  const groups = Math.max(1, Math.round(width / 260));
  for (let i = 0; i < groups; i++) {
    out.push(make(`to-${i}`, 'schoolTo', 'ordinary', 1, 14, 18, 1 + (rng() < 0.4 ? 1 : 0)));
    out.push(make(`from-${i}`, 'schoolFrom', 'ordinary', -1, 14, 18, 1 + (rng() < 0.4 ? 1 : 0)));
  }
  const players = Math.max(2, Math.round(width / 200));
  for (let i = 0; i < players; i++) out.push(make(`play-${i}`, 'play', 'child', dirOf(), 8, 22));
  return out;
}
```

Remarque de test : `pedestriansFor(720, …).length` = 10 + 2×3 + 4 = 20 (≤ 40 ✓.) ; `to-` et `from-` sont dans `groups`, `dir` fixé ; pour que le test « tenues voisines différentes » passe, les tirages `rng()` successifs suffisent (les tenues `general` sont consécutives dans la liste).

```ts
// src/core/library/city/doors.ts
import { WORLD_MARGIN, citySkyline, hashString, mulberry32 } from '../scene-world';
import type { CityIntensity } from './intensity';
import { outfitFor, type Outfit, type Profile } from './people';

export type Door = { id: string; x: number; variant: 0 | 1 | 2; hallU: number };
export const DOOR_WIDTH = 22;
export const TRIP_CYCLE = 160;

// Une entrée d'immeuble sur un immeuble sur deux du premier plan, assez large pour la porter.
export function doorsFor(width: number, height: number, seed: number): Door[] {
  const rng = mulberry32(seed ^ hashString('doors'));
  return citySkyline(width, height, seed)
    .filter((b) => !b.far && b.w >= DOOR_WIDTH + 12)
    .filter((_, i) => i % 2 === 0)
    .map((b, i) => ({ id: `door-${i}`, x: Math.round(b.x + 6 + rng() * (b.w - DOOR_WIDTH - 12)), variant: Math.floor(rng() * 3) as 0 | 1 | 2, hallU: rng() }));
}

export type Trip = { id: string; kind: 'out' | 'in'; doorX: number; dir: 1 | -1; speed: number; phase: number; outfit: Outfit; profile: Profile; scale: number };

const FADE_S = 0.8;
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function tripsFor(doors: Door[], seed: number): Trip[] {
  const rng = mulberry32(seed ^ hashString('trips'));
  const out: Trip[] = [];
  for (const door of doors) {
    for (const kind of ['out', 'in'] as const) {
      const profile: Profile = rng() < 0.3 ? 'suit' : rng() < 0.5 ? 'stroller' : 'ordinary';
      out.push({
        id: `${door.id}-${kind}`,
        kind,
        doorX: door.x + DOOR_WIDTH / 2,
        dir: rng() < 0.5 ? 1 : -1,
        speed: 18 + rng() * 8,
        phase: rng() * TRIP_CYCLE,
        outfit: outfitFor(profile, rng),
        profile,
        scale: 0.95 + rng() * 0.15,
      });
    }
  }
  return out;
}

// Distance à parcourir entre la porte et le bord du monde : vers l'avant pour un habitant qui sort, depuis l'arrière pour celui qui rentre.
const reachOf = (trip: Trip, width: number): number => {
  const forward = trip.dir > 0 ? width + WORLD_MARGIN - trip.doorX : trip.doorX + WORLD_MARGIN;
  const backward = trip.dir > 0 ? trip.doorX + WORLD_MARGIN : width + WORLD_MARGIN - trip.doorX;
  return trip.kind === 'out' ? forward : backward;
};

// Position d'un habitant `t` secondes après la date d'origine, ou null s'il n'est pas en route. `fade` : 0 = invisible (à la porte), 1 = plein.
export function tripAt(trip: Trip, width: number, t: number): { x: number; fade: number } | null {
  const c = (((t + trip.phase) % TRIP_CYCLE) + TRIP_CYCLE) % TRIP_CYCLE;
  const reach = reachOf(trip, width);
  const duration = reach / trip.speed;
  if (c >= duration) return null;
  if (trip.kind === 'out') return { x: trip.doorX + trip.dir * trip.speed * c, fade: smooth(c / FADE_S) };
  const startX = trip.doorX - trip.dir * reach;
  return { x: startX + trip.dir * trip.speed * c, fade: 1 - smooth((c - (duration - FADE_S)) / FADE_S) };
}

// Le trajet a lieu dans ce tour de cycle si le tirage de (trajet, tour) passe sous le seuil.
export function tripHappens(trip: Trip, t: number, gate: number): boolean {
  const turn = Math.floor((t + trip.phase) / TRIP_CYCLE);
  return mulberry32(hashString(trip.id) ^ Math.imul(turn, 2654435761))() < gate;
}

// On sort le matin (6 h 30 à 9 h) et on rentre le soir (17 h à 20 h) ; le reste du temps, un peu des deux.
export function residentFlow(i: CityIntensity, minutes: number): { out: number; in: number } {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  const morning = h >= 6.5 && h < 9;
  const evening = h >= 17 && h < 20;
  const base = Math.min(1, i.walkers * 0.9);
  return { out: base * (morning ? 1 : evening ? 0.3 : 0.5), in: base * (evening ? 1 : morning ? 0.3 : 0.5) };
}
```

Si `tripAt` est testé avec `phase: 0` à `t = 0` pour un trajet d'entrée, `c = 0` donne `x = startX` (au bord du monde) ; le test « arrive à la porte » regarde `c` proche de `duration` (voir l'assertion dans le test ci-dessus).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/library/city-metrics.test.ts tests/core/library/city-people.test.ts tests/core/library/city-vehicles.test.ts tests/core/library/city-lamps.test.ts tests/core/library/city-doors.test.ts tests/core/library/scene-world.test.ts --maxWorkers=4`
Expected: PASS. `scene-world.test.ts` peut avoir des attentes sur `walker`/`car` dans la ville : les mettre à jour pour la ville (plus que des nuages), en gardant celles des autres scènes.

- [ ] **Step 5: Commit**

```bash
git add src/core/library tests/core/library
git commit -m "feat(ville): population déterministe (passants, véhicules, lampadaires, entrées, habitants)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sprites de la ville

**Files:**
- Create: `src/content/city-sprites.tsx`
- Test: `tests/content/city-sprites.test.tsx`

**Interfaces:**
- Consumes: `Outfit` de `people.ts`, `Sky`/`mixHex` de `core/library/sky`, `Vehicle` de `vehicles.ts`, `Door` de `doors.ts`.
- Produces:
  - `PersonSprite(props: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean }): ReactElement` — silhouette de 40 px de haut, pieds à `y = 0`, regarde vers +x.
  - `VehicleSprite(props: { vehicle: Vehicle; sky: Sky; lights: boolean }): ReactElement` — pieds (roues) à `y = 0`, regarde vers +x.
  - `LampSprite(props: { lit: boolean }): ReactElement` — pied à `y = 0`, haut à `y = −80`.
  - `EntranceSprite(props: { variant: 0 | 1 | 2; hallLit: boolean; sky: Sky }): ReactElement` — bas à `y = 0`, 26 px de large, 31 px de haut.

Tout est dessiné comme dans la maquette v3 validée (fonctions `person`, `car`, `bus`, `lamp`, `entrance`), en repère « pieds à l'origine », et **sans** décor de fête (vague 1b).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/city-sprites.test.tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntranceSprite, LampSprite, PersonSprite, VehicleSprite } from '../../src/content/city-sprites';
import { outfitFor } from '../../src/core/library/city/people';
import { LANE_DIR, vehiclesFor } from '../../src/core/library/city/vehicles';
import { mulberry32 } from '../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../src/core/library/sky';

const sky = skyAt(720, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const night = skyAt(0, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));

const svg = (node: React.ReactNode) => render(<svg>{node}</svg>).container.querySelector('svg')!;

describe('sprites de la ville', () => {
  it('dessine un passant avec parapluie seulement quand on le demande', () => {
    const outfit = outfitFor('ordinary', mulberry32(3));
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).querySelector('[data-umbrella]')).toBeNull();
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy umbrella />).querySelector('[data-umbrella]')).not.toBeNull();
  });
  it('habille la silhouette d’après la tenue (couleur du haut)', () => {
    const outfit = { ...outfitFor('ordinary', mulberry32(3)), top: 'tee' as const, topColor: '#C0463A' };
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).innerHTML.toLowerCase()).toContain('#c0463a');
  });
  it('un passant de nuit est plus sombre que de jour', () => {
    const outfit = { ...outfitFor('ordinary', mulberry32(3)), top: 'tee' as const, topColor: '#C0463A' };
    expect(svg(<PersonSprite outfit={outfit} sky={night} rainy={false} umbrella={false} />).innerHTML).not.toBe(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).innerHTML);
  });
  it('dessine les véhicules (phares seulement allumés) et le lampadaire', () => {
    const v = vehiclesFor(720, 4).find((x) => x.kind === 'car')!;
    expect(svg(<VehicleSprite vehicle={v} sky={sky} lights={false} />).querySelector('[data-headlight]')).toBeNull();
    expect(svg(<VehicleSprite vehicle={v} sky={night} lights />).querySelector('[data-headlight]')).not.toBeNull();
    expect(LANE_DIR.near).toBe(1);
    expect(svg(<LampSprite lit />).querySelector('[data-lamp-glow]')).not.toBeNull();
    expect(svg(<LampSprite lit={false} />).querySelector('[data-lamp-glow]')).toBeNull();
  });
  it('dessine les trois variantes d’entrée, le hall éclairé quand demandé', () => {
    for (const variant of [0, 1, 2] as const) {
      expect(svg(<EntranceSprite variant={variant} hallLit={false} sky={sky} />).querySelector('[data-entrance]')).not.toBeNull();
    }
    expect(svg(<EntranceSprite variant={0} hallLit sky={night} />).querySelector('[data-hall-lit]')).not.toBeNull();
    expect(svg(<EntranceSprite variant={0} hallLit={false} sky={night} />).querySelector('[data-hall-lit]')).toBeNull();
  });
});
```

(Si `@testing-library/react` n'est pas l'outil de rendu du dépôt, utiliser celui des tests existants dans `tests/content/*.test.tsx` — voir `tests/content/library-window.test.tsx` — en gardant les mêmes assertions.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/city-sprites.test.tsx --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write the implementation**

Porter les fonctions de la maquette v3 (conversation du 2026-10-09 ; `person`, `car`, `bus`, `lamp`, `entrance`) en composants React, **en supprimant** tout ce qui relève des fêtes (`cost`, `ghost`, `pumpkinbag`, `ladder`, `bagbox`, `deco`). Règles :
- `PersonSprite` : pieds à l'origine. Couleur via `tone(c) = mixHex(mixHex(c, '#0B1030', 0.55), c, sky.daylight)` (plus sombre la nuit). `top` ∈ `tee | sweater | jacket | shirt` : rectangle `x=-5,y=-28,w=10,h=14` ; `coat` : `h=19` ; `suit` : rectangle + cravate (`#F2F2F2` et `#B03030`) ; `jersey` : rectangle + bande blanche. `bottom` : `pants`/`jeans`/`jogging` deux rectangles pleine jambe, `shorts` jambes cuites + short, `skirt`/`dress` trapèze au-dessus de jambes cuites. `hair` : `short` demi-disque, `long` demi-disque + mèche, `bun` demi-disque + chignon, `cap` demi-disque `hatColor` + visière, `beanie` demi-disque `hatColor` + pompon, `bald` aucun. `accessory` : `backpack` (rectangle à l'arrière, x négatif), `bag` (petit sac à la main), `case` (mallette), `ball` (ballon au sol), `scarf` (bande au cou), `none`. `rainy && top` ∈ `jacket|sweater|tee|shirt` : dessiner un imperméable (même rectangle, couleur `#2E5E8A`). `umbrella` : balise `<g data-umbrella="">` (mêmes formes que `ActorSprite`).
- `VehicleSprite` : `car` (corps `40×9`, toit `22×9`, vitres, roues), `bus` (`68×22`, 6 vitres, couleur `#2E8B6A`), `van` (corps `46×18` à toit plat), `bike` (deux roues + cadre, sans conducteur : un petit cycliste en `PersonSprite` n'est pas requis). Les phares : `<g data-headlight="">` (point `#FFE9A0` + faisceau translucide) seulement si `lights`. Les véhicules regardent vers +x ; la file du fond est retournée par l'appelant (échelle négative), le sprite ne gère pas le sens.
- `LampSprite` : mât `3×72`, bras, tête ; `<g data-lamp-glow="">` (cône + halo) seulement si `lit`.
- `EntranceSprite` : auvent `26×4`, cadre `22×27`, trois variantes (0 = double porte vitrée avec montant, 1 = porte cochère cintrée, 2 = porte vitrée simple avec traverse), plaque de numéro et interphone ; vitrage `#FFD27A` + `<g data-hall-lit="">` quand `hallLit`, sinon `#9FB8C6` de jour ou `#232A4A` de nuit (`sky.daylight < 0.4`) ; racine `<g data-entrance="">`.

Chaque composant retourne un `<g>` ; aucun `id` SVG fixe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/content/city-sprites.test.tsx --maxWorkers=4` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/city-sprites.tsx tests/content/city-sprites.test.tsx
git commit -m "feat(ville): sprites des passants, véhicules, lampadaires et entrées d'immeuble

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Couche de vie, décor de la ville et branchement

**Files:**
- Create: `src/content/city-life.tsx`, `src/content/use-wallclock-loop.ts`
- Modify: `src/content/scene-city.tsx`, `src/content/scene-panorama.tsx`, `src/content/use-scene-time.ts`, `src/content/RoomView.tsx`, `src/content/LibraryPanel.tsx`
- Test: `tests/content/city-life.test.tsx`

**Interfaces:**
- Consumes: tout `core/library/city/*`, `city-sprites.tsx`, `cityMetrics`, `loopX`.
- Produces:
  - `useWallClockLoop(place: (nowSeconds: number) => void, deps: unknown[], opts?: { frameMs?: number }): void` — appelle `place(Date.now()/1000)` tout de suite, puis à chaque image (≥ `frameMs`, 33 par défaut) tant que la page est visible ; ne boucle pas si `prefers-reduced-motion: reduce` ; nettoie à la sortie.
  - `type CityLifeProps = { width: number; height: number; sky: Sky; seed: number; city: CityContext; rainy: boolean }` et `CityLifeLayer(props: CityLifeProps): ReactElement` — `<g data-city-life>` contenant des nœuds `[data-ped]`, `[data-resident]`, `[data-vehicle]`, chacun avec `data-active="true|false"` (présence selon l'intensité) ; les positions sont posées par la boucle sur `transform`.
  - `PanoramaProps` gagne `city?: CityContext` ; `SceneBodyProps` gagne `city?: CityContext`, `forcedNight?: boolean`.
  - `SceneTime` (use-scene-time) gagne `date: YMD` et `mode: TimeSetting['mode']`.
  - `sceneView` (LibraryPanel) gagne `city?: { day: DayContext; forcedNight: boolean }`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/city-life.test.tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { skyAt, sunTimes } from '../../src/core/library/sky';

const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const make = (hours: number, ymd: { y: number; m: number; d: number }, extra: Partial<CityContext> = {}) => {
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, ...extra };
  return render(
    <svg>
      <CityLifeLayer width={720} height={340} sky={sky} seed={5} city={city} rainy={(extra.precip ?? 0) > 0.2} />
    </svg>,
  ).container;
};
const active = (c: HTMLElement, selector: string) => c.querySelectorAll(`${selector}[data-active="true"]`).length;

describe('CityLifeLayer', () => {
  it('le lundi à 8 h : des costumes, des familles et beaucoup de voitures', () => {
    const c = make(8.25, { y: 2026, m: 10, d: 5 }); // lundi
    expect(active(c, '[data-ped]')).toBeGreaterThan(3);
    expect(active(c, '[data-vehicle]')).toBeGreaterThan(4);
    expect(c.querySelectorAll('[data-role="schoolTo"][data-active="true"]').length).toBeGreaterThan(0);
  });
  it('le samedi : aucun groupe d’école, moins de véhicules qu’en pointe de semaine', () => {
    const sat = make(8.25, { y: 2026, m: 10, d: 10 });
    expect(sat.querySelectorAll('[data-role="schoolTo"][data-active="true"]')).toHaveLength(0);
    expect(active(sat, '[data-vehicle]')).toBeLessThan(active(make(8.25, { y: 2026, m: 10, d: 5 }), '[data-vehicle]'));
  });
  it('sous la pluie, les piétons actifs portent un parapluie et il y a moins de monde', () => {
    const dry = make(12, { y: 2026, m: 10, d: 10 });
    const wet = make(12, { y: 2026, m: 10, d: 10 }, { precip: 0.8 });
    expect(active(wet, '[data-ped]')).toBeLessThan(active(dry, '[data-ped]'));
    for (const node of wet.querySelectorAll('[data-ped][data-active="true"]')) expect(node.querySelector('[data-umbrella]')).not.toBeNull();
  });
  it('la nuit : presque personne', () => {
    expect(active(make(3.5, { y: 2026, m: 10, d: 5 }), '[data-ped]')).toBeLessThanOrEqual(1);
  });
  it('la file du fond roule à gauche, celle du premier plan à droite (échelle x)', () => {
    const c = make(12, { y: 2026, m: 10, d: 5 });
    const far = c.querySelector('[data-vehicle][data-lane="far"]')!;
    const near = c.querySelector('[data-vehicle][data-lane="near"]')!;
    expect(far.getAttribute('transform')).toMatch(/scale\(-/);
    expect(near.getAttribute('transform')).not.toMatch(/scale\(-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/city-life.test.tsx --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implement**

`src/content/use-wallclock-loop.ts` :

```ts
import { useEffect } from 'react';

// Boucle d'animation sur l'horloge murale : toutes les copies <use> du monde voient le même instant.
export function useWallClockLoop(place: (nowSeconds: number) => void, deps: readonly unknown[], opts: { frameMs?: number } = {}): void {
  const frameMs = opts.frameMs ?? 33;
  useEffect(() => {
    place(Date.now() / 1000);
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden' || now - last < frameMs) return;
      last = now;
      place(Date.now() / 1000);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
```

`src/content/city-life.tsx` — structure à respecter :

```tsx
// Calculs mémoïsés par (width, height, seed) : populations, entrées, trajets. Recalculés par minute : intensités.
const metrics = cityMetrics(height);
const peds = useMemo(() => pedestriansFor(width, seed), [width, seed]);
const vehicles = useMemo(() => vehiclesFor(width, seed), [width, seed]);
const doors = useMemo(() => doorsFor(width, height, seed), [width, height, seed]);
const trips = useMemo(() => tripsFor(doors, seed), [doors, seed]);
const intensity = useMemo(() => cityIntensity(city), [city]);
const flow = useMemo(() => residentFlow(intensity, city.minutes), [intensity, city.minutes]);
const lights = sky.daylight < 0.5 || rainy;
```

Rendu : un `<g data-city-life>` avec trois sous-groupes (ordre de dessin : file du fond, trottoir/piétons et habitants, file du premier plan) :
- Véhicules : `<g data-vehicle data-lane data-active opacity transform>` avec `<VehicleSprite … />` ; `data-active = vehicle.u < vehicleGate(vehicle, intensity)` ; `opacity` 1 ou 0 avec `style={{ transition: 'opacity 3s ease' }}` ; position posée par la boucle : `translate(x laneY) scale(±unit·scale·(far ? 0.9 : 1), unit·scale·(far ? 0.9 : 1))` avec `x = loopX(vehicle.phase, LANE_DIR[lane]·vehicle.speed, width, t)` et signe négatif sur x pour la file `far`.
- Piétons : `<g data-ped data-role data-active>` ; `data-active = p.u < pedestrianGate(p, intensity)` ; contenu : `PersonSprite` du passant (`umbrella = intensity.umbrellas`, `rainy`) + un `PersonSprite` par `companion` décalé de `−dir·16·k` px (enfants à l'échelle 0,7, `y` identique) ; `x = loopX(p.phase, p.dir·p.speed, width, t)`, `y = metrics.walkY − (p.depth − 0.5)·metrics.unit·6` ; `scale(dir·unit·scale, unit·scale)` ; le sens négatif retourne le sprite (échelle x négative).
- Habitants : `<g data-resident data-active>` ; `data-active = tripHappens(trip, t0, kind==='out' ? flow.out : flow.in)` calculé **dans la boucle** (il change d'un tour de cycle à l'autre sans re-rendu) : la boucle pose `opacity = active ? fade : 0` et `transform` ; en rendu initial (`t0 = Date.now()/1000`) `data-active` reflète le même calcul pour les tests. Sprite : `PersonSprite` (tenue du trajet) ; `y = metrics.doorY`.

La boucle (`useWallClockLoop`) met à jour, pour chaque nœud, `transform` (et `opacity`/`data-active` des habitants) ; elle ne modifie jamais `data-active` des piétons et véhicules (ils ne dépendent que de la minute). Garder une `Map<string, SVGGElement>` des nœuds, remplie par `querySelector('[data-ped-id="…"]')` comme `useActorLoop`.

`scene-city.tsx` : remplacer les rectangles de rue par `cityMetrics(height)` : trottoir `[ground, ground+0.07h]`, chaussée en dessous avec deux files séparées par un trait pointillé (`laneY.far`/`laneY.near`, trait à `(far+near)/2`), puis, pour chaque porte de `doorsFor(width, height, seed)`, `<g transform="translate(x doorY) scale(unit)"><EntranceSprite … hallLit={dark && door.hallU < 0.6} /></g>` (le hall est éclairé la nuit : `sky.daylight < 0.45`), puis pour chaque `lampsFor(width, seed)` : `<g transform="translate(x walkY+? ) scale(unit)"><LampSprite lit={lampLit(lamp, minutes, sky.daylight, forcedNight)} /></g>` (pied du lampadaire au bord de la chaussée : `y = ground + 0.07·height`). Les prop `forcedNight` vient de `SceneBodyProps`. Les lumières d'immeuble existantes (`lampLit` d'`activity.ts`) restent inchangées : importer les lampadaires sous l'alias `streetLampLit` pour éviter la collision de nom.

`scene-panorama.tsx` : dans `SceneActorsView`, quand `scene === 'city'`, après la liste d'acteurs (nuages), ajouter `{props.city && <CityLifeLayer width height sky seed city rainy />}` ; transmettre `city` et `forcedNight` à `ScenePanoramaStaticView` (via `props`). La comparaison de `memo` reste par identité : `city` doit être mémoïsé en amont (voir ci-dessous).

`use-scene-time.ts` : ajouter à `SceneTime` les champs `date: YMD` (`{ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }`, mémoïsé sur année/mois/jour) et `mode: setting.mode`.

`LibraryPanel.tsx` (autour de la ligne 249, `sceneView`) : ajouter un hook `useCityDay(sceneTime.date)` (créé en tâche 8) qui renvoie un `DayContext` stable ; construire

```ts
const sceneView = useMemo(
  () => ({
    sky: sceneTime.sky,
    minutes: sceneTime.minutes,
    weather: { clock: weather.clock, flags: weather.flags },
    city: { day: cityDay, forcedNight: lib?.time.mode === 'night' },
  }),
  [sceneTime.sky, sceneTime.minutes, weather.clock, weather.flags, cityDay, lib?.time.mode],
);
```

`RoomView.tsx` (lignes 372 et 375) : calculer, une fois par rendu, `const city = useMemo<CityContext | undefined>(() => (view.city && room.scene === 'city' ? { minutes: view.minutes, day: view.city.day, precip: rainy ? 0.7 : gloom ? 0.2 : 0, snow: false, storm: false, daylight: view.sky.daylight } : undefined), [...])` et le passer aux deux composants (`city={city}`, `forcedNight={view.city?.forcedNight}`). Remplacer `snow`/`storm` par les vrais drapeaux dès que `view.weather.flags` les expose (sinon laisser faux : limite connue de la vague 1a, la pluie et les nuages sombres suffisent).

Pour trouver le type du paramètre `view` de `RoomView` : `grep -n "minutes: number" src/content/RoomView.tsx` ; élargir ce type avec `city?: { day: DayContext; forcedNight: boolean }`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/city-life.test.tsx tests/content --maxWorkers=4` puis `npx vitest run tests/core/library --maxWorkers=4` puis `npm run typecheck`
Expected: PASS. Les assertions sur le nombre de passants dépendent de la graine du test (5) : si l'une échoue à cause du tirage et non de la logique, changer la graine du test, pas les règles. Corriger les anciens tests qui attendaient les acteurs `walker`/`car` de la ville (`tests/content/library-window*.test.tsx`, `scene-panorama*.test.tsx` s'ils existent) : la ville n'a plus que des nuages comme acteurs ; ajouter `city` quand un test veut voir des passants.

- [ ] **Step 5: Vérification visuelle dans Chrome**

Construire et recharger l'extension (`npm run build`, voir les consignes de rechargement du dépôt), ouvrir Ma Pièce, choisir la scène Ville et vérifier : deux files de sens opposés, lampadaires qui s'allument au crépuscule (heure manuelle 21 h) et s'éteignent vers minuit (heure manuelle 0 h 20 : tous éteints), entrées visibles avec habitants qui sortent le matin (heure manuelle 8 h), costumes en pointe, parapluies sous la pluie forcée. Prendre une capture. Si un rendu est incorrect, corriger les sprites avant le commit (les rendus jsdom ne prouvent rien sur le dessin).

- [ ] **Step 6: Commit**

```bash
git add src/content tests/content
git commit -m "feat(ville): vie ambiante dans la scène Ville (passants, deux files, lampadaires, entrées)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Zone scolaire, calendrier automatique et réglage

**Files:**
- Create: `src/content/zone-setting.ts`, `src/content/use-city-calendar.ts`
- Modify: `src/content/LibraryPanel.tsx` (rangée « Ciel », autour des lignes 813-845)
- Test: `tests/content/zone-setting.test.ts`, `tests/content/use-city-calendar.test.tsx`

**Interfaces:**
- Consumes: `createSchoolCalendar`, `DEPARTMENT_RELAY`, `parseSchoolReply` de `school-calendar.ts` ; `zoneOfDepartment`, `isAlsaceMoselle`, `DEFAULT_ZONE`, `Zone` de `zones.ts` ; `dayContext` ; `currentPosition`, `isPositionKnown`, `subscribePosition` de `scene-position.ts`.
- Produces:
  - `type ZoneChoice = 'auto' | Zone`, `readZone(): ZoneChoice`, `writeZone(choice: ZoneChoice): void`, `useZoneChoice(): [ZoneChoice, (c: ZoneChoice) => void]` (clé `wmt:library-zone`, défaut `'auto'`, valeur inconnue → `'auto'`, stockage inaccessible → `'auto'` sans erreur).
  - `useCityDay(date: YMD): DayContext` — résout la zone (réglage manuel, sinon département déduit de la position connue par `/department` avec cache local 30 jours par case de 0,1°, sinon `DEFAULT_ZONE`), charge le calendrier scolaire (`latest` tout de suite puis `refresh`), renvoie le `DayContext` du jour (`alsaceMoselle` si le département déduit est 57, 67 ou 68).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/content/zone-setting.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readZone, writeZone } from '../../src/content/zone-setting';

beforeEach(() => window.localStorage.clear());

describe('réglage de zone', () => {
  it('vaut Automatique par défaut', () => {
    expect(readZone()).toBe('auto');
  });
  it('mémorise A, B, C et Corse', () => {
    for (const zone of ['A', 'B', 'C', 'Corse'] as const) {
      writeZone(zone);
      expect(readZone()).toBe(zone);
    }
  });
  it('retombe sur Automatique pour une valeur inconnue', () => {
    window.localStorage.setItem('wmt:library-zone', 'Z');
    expect(readZone()).toBe('auto');
  });
});
```

```tsx
// tests/content/use-city-calendar.test.tsx
// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCityDay } from '../../src/content/use-city-calendar';
import { writeZone } from '../../src/content/zone-setting';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useCityDay', () => {
  it('rend tout de suite un contexte de jour (repli approché) et le raffine avec le relais', async () => {
    writeZone('C');
    const reply = { ok: true, zone: 'C', periods: [{ name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 })));
    const { result } = renderHook(() => useCityDay({ y: 2026, m: 10, d: 20 }));
    expect(result.current.kind).toBeDefined();
    await waitFor(() => expect(result.current.kind).toBe('holiday'));
  });
  it('reconnaît un jour férié sans relais', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    const { result } = renderHook(() => useCityDay({ y: 2026, m: 5, d: 14 }));
    expect(result.current.kind).toBe('public-holiday');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/zone-setting.test.ts tests/content/use-city-calendar.test.tsx --maxWorkers=4`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implement**

`zone-setting.ts` : même forme que `src/content/light-setting.ts` (clé `wmt:library-zone`, écouteurs, `useSyncExternalStore`, valeur par défaut `'auto'`, `try/catch` sur chaque accès au stockage).

`use-city-calendar.ts` :

```ts
// Zone → vacances → contexte du jour. La position n'est jamais enregistrée : seul le département déduit est mis en cache (par case de 0,1°).
// 1. Réglage manuel (A, B, C, Corse) : sans position ni relais de département.
// 2. Automatique + position connue : GET DEPARTMENT_RELAY?lat&lon (position arrondie à 0,1°), département → zone via zoneOfDepartment ; cache `wmt:city-department:<lat,lon>` valable 30 jours.
// 3. Sinon DEFAULT_ZONE.
// Le calendrier : un `createSchoolCalendar` par page (useMemo), `latest(zone)` en premier rendu, `refresh(zone)` ensuite (setState des périodes).
```

Écrire le hook avec `useState<HolidayPeriod[]>(() => calendar.latest(zone))`, un `useEffect` qui appelle `refresh(zone)` à chaque changement de zone, et `useMemo(() => dayContext(date, periods, alsace), [date.y, date.m, date.d, periods, alsace])`. `fetch` : `(url) => fetch(url)` (global, remplaçable dans les tests) ; `storage` : l'objet `localStorage` protégé comme dans `use-weather.ts` (`const storage = { get…, set… }` — dupliquer ces quelques lignes plutôt que d'exporter celui de `use-weather.ts`, ou l'exporter dans un fichier `src/content/safe-storage.ts` si l'implémenteur préfère, en laissant `use-weather.ts` l'importer).

`LibraryPanel.tsx` : dans la rangée « Ciel » (visible quand `room.scene === 'city'`), ajouter après le bouton Lumière un bouton cyclique de zone :

```tsx
{room.scene === 'city' && (
  <Btn label={`Zone des vacances : ${zoneLabel}`} pressed={zoneChoice !== 'auto'} data={{ 'zone-toggle': '' }} onClick={() => setZoneChoice(NEXT_ZONE[zoneChoice])}>
    <span className="wmt-lib-zone-glyph" aria-hidden="true">{zoneChoice === 'auto' ? 'Auto' : zoneChoice}</span>
  </Btn>
)}
```

avec `const [zoneChoice, setZoneChoice] = useZoneChoice();`, `NEXT_ZONE = { auto: 'A', A: 'B', B: 'C', C: 'Corse', Corse: 'auto' }` et `zoneLabel` : « automatique » ou « zone A »… Le bouton affiche un glyphe court (« Auto », « A », « B », « C », « Co ») : règle du dépôt, tout visible à l'écran, glyphes plutôt que du texte ; prévoir un style minimal `.wmt-lib-zone-glyph` (police 11 px, graisse 600) à côté des autres styles `wmt-lib-*` (`grep -rn "wmt-lib-sep" src` pour trouver la feuille de style). Ajouter `const cityDay = useCityDay(sceneTime.date);` avant le `sceneView` de la tâche 7.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content --maxWorkers=4` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content tests/content
git commit -m "feat(ville): zone scolaire automatique ou choisie, vacances récupérées par le relais

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Fiche WikiHow, vérification finale, PR

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle fiche `bibliotheque-v20`, après `bibliotheque-v19`)
- Test: les tests existants de `entries` (unicité des identifiants, forme des étapes)

- [ ] **Step 1: Rédiger la fiche `bibliotheque-v20`**

Copier la forme de `bibliotheque-v19` (même `theme`, glyphe `🏙️`, titre « La ville qui vit », `summary` « Passants, circulation, école et lampadaires selon l'heure, la météo et le calendrier »). Étapes (chacune avec `target`, `title`, `text`, `gesture`, `details` à quatre entrées `À quoi ça sert` / `Comment faire` / `D'où viennent les données` / `Limites`, et `scene` pour ouvrir la bonne page, comme les fiches voisines) :
1. **La rue vit avec l'heure** : qui est dehors selon l'heure (pointes de 8 h et 17 h en semaine, costumes, circulation sur deux files, on roule à droite, nuit presque vide). Limites : un décor, pas une simulation exacte.
2. **Semaine, week-end et vacances** : école à 8 h 30 et sortie à 16 h 45, mercredi jusqu'à midi, plus de marcheurs et d'enfants le week-end, jours fériés et vacances scolaires. D'où viennent les données : jours fériés calculés sur l'appareil, vacances officielles récupérées par le relais du projet. Limites : calendrier français, repli approché si le relais ne répond pas.
3. **La zone des vacances** : bouton de zone dans la rangée Ciel (Auto, A, B, C, Corse) ; Auto déduit la zone de la position (arrondie, jamais enregistrée) ; sans position, zone C. Limites : outre-mer non géré.
4. **Lampadaires et entrées** : allumés à la nuit tombée, éteints vers minuit ; les habitants entrent et sortent par les entrées d'immeuble ; en « Toujours la nuit » ils restent allumés. Limites : les décors de fête arrivent plus tard.

- [ ] **Step 2: Suite complète et vérifications**

```bash
npx vitest run --maxWorkers=4
npm run typecheck
npm run build
```

Expected: tout PASS ; le build construit l'extension. Noter le nombre de tests avant/après dans le message de PR.

- [ ] **Step 3: Vérification visuelle finale dans Chrome** (rappel de la tâche 7) puis, **seulement après accord de l'utilisateur sur la capture**, continuer.

- [ ] **Step 4: Commit, PR, fusion, pré-prod**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche bibliotheque-v20, la ville qui vit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/bibliotheque-ville-vivante
gh pr create --title "feat(ville): vie ambiante, calendrier et zone scolaire (vague 1a)" --body "<résumé : moteur, relais, réglage, limites ; pas de décors de fête ni événements>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Puis, selon la routine du dépôt (mémoire du projet) : fusionner la PR sans redemander, `npm run build`, `npm run preprod` (la production ne se lance que sur ordre explicite de l'utilisateur), vérifier `curl` des deux routes du relais, supprimer la jonction `node_modules` et `.env.local` du worktree.

---

## Auto-revue du plan par rapport à la spec

- **Calendrier (jours fériés, vacances automatiques par le relais, zone auto/manuelle, repli)** : tâches 1, 2, 3, 8.
- **Intensités (pointes 8 h/17 h, semaine/week-end/vacances/mercredi, pluie, nuit, sportifs rares, enfants)** : tâche 4.
- **Profils, vêtements variés par couches, familles d'école** : tâches 5 (données) et 6 (sprites).
- **Deux files, on roule à droite** : tâches 5 (`LANE_DIR`) et 7 (rendu, test d'échelle).
- **Lampadaires (crépuscule, extinction 23 h 45 à 0 h 15, éteints jusqu'à l'aube, nuit forcée)** : tâches 5 et 7.
- **Entrées d'immeuble et habitants qui entrent et sortent** : tâches 5, 6, 7.
- **Hors périmètre vérifié** : pas de décor de fête, de déguisement, d'échelle, d'événement, de père Noël ni de réaction d'animal ; le `DayContext` expose déjà `publicHoliday` pour la vague 1b.
- **Écarts connus à signaler dans la PR** : `snow` et `storm` toujours faux dans `CityContext` tant que `WeatherFlags` ne les expose pas ; outre-mer non géré (zone par défaut `C`) ; vacances approchées si le relais est injoignable ; les rendus n'ont été vus que dans Chrome (jsdom ne prouve rien sur le dessin).
