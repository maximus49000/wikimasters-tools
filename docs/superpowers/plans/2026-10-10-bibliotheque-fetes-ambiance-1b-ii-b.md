# Ambiance de fête (vague 1b-ii-b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter le calendrier des fêtes de la scène Ville (Épiphanie, Saint-Valentin, Pâques, 1er mai, Fête de la musique, Armistice, défilé du 14 juillet) avec passants festifs, ballons, cloches, musiciens, défilé et drapeaux.

**Architecture:** Tout est piloté par des données et calculé depuis la date et l'heure. `calendar.ts` ajoute les fêtes (dont Pâques et l'Épiphanie calculées) ; `intensity.ts` expose `festive` et module l'affluence ; `people.ts` ajoute des passants festifs EN FIN de liste (aucun tirage déplacé) et un « signe de fête » décidé par hachage de l'id ; `events.ts` ajoute 4 événements à poids nul qui n'existent que par `festWeight`. Deux PR : PR 1 = Tâches 1 à 4 (moteur + passants), PR 2 = Tâches 5 à 9 (événements, sprites, drapeaux, fiche, livraison).

**Tech Stack:** TypeScript, React (SVG, SMIL), vitest + jsdom, WXT.

**Spec:** `docs/superpowers/specs/2026-10-10-bibliotheque-fetes-ambiance-design.md`

## Global Constraints

- Aucun état ajouté : le format de la pièce reste v5. Aucun `Math.random` (tirages = `mulberry32`/`hashString` de `../scene-world`).
- Les passants et événements EXISTANTS ne changent pas à graine égale : pas de tirage inséré avant ceux d'aujourd'hui.
- Mouvement réduit : seuls les éléments fixes restent (cloches, musiciens) ; ni défilé ni ballons.
- Textes d'interface et fiches en français ; glyphes plutôt que du texte.
- Plafond de figurants (`sprite-budget`, 40 par 720 px) inchangé.
- Tests : `npx vitest run --maxWorkers=2 --testTimeout=40000` (la suite complète est instable en parallélisme total) ; `npm run typecheck` ; `npm run build`.
- Travail dans le worktree `C:\Users\maxim\Downloads\Wikimasters-fetes2` (branche `feat/bibliotheque-fetes-ambiance`), `node_modules` par jonction vers le dépôt principal. Commits terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Fiche WikiHow : `bibliotheque-v26` (la v25 est celle du père Noël).

## File Structure

- Modify `src/core/library/city/calendar.ts` : fêtes, `festivitiesOn` avec dates calculées.
- Modify `src/core/library/city/intensity.ts` : `festive`, `crowd` (affluence).
- Modify `src/core/library/city/people.ts` : rôle `festive`, `festiveMark`, passants festifs.
- Modify `src/core/library/city/events.ts`, `event-place.ts` : 4 nouveaux événements.
- Modify `src/core/library/city/doors.ts` : `doorFlag`.
- Modify `src/content/city-sprites.tsx` (signes de fête), `city-event-sprites.tsx` (4 sprites), `city-life.tsx` (câblage), le fichier qui dessine les entrées (drapeaux).
- Modify `src/core/whats-new/entries.ts` : fiche `bibliotheque-v26`.
- Tests : `tests/core/library/city-calendar.test.ts`, `city-intensity.test.ts`, `city-people.test.ts`, `city-events.test.ts`, `tests/content/city-event-sprites.test.tsx`, `city-sprites.test.tsx`, `city-life.test.tsx`.

---

# PR 1 : calendrier, intensité, passants festifs

### Task 1: Calendrier des fêtes

**Files:**
- Modify: `src/core/library/city/calendar.ts:6-7,64-72`
- Test: `tests/core/library/city-calendar.test.ts`

**Interfaces:**
- Produces: `FestivityId` élargi à `'new-year' | 'bastille' | 'christmas-eve' | 'epiphany' | 'valentine' | 'easter' | 'may-day' | 'music' | 'armistice'` ; `festivitiesOn(date: YMD): Festivity[]` inclut Pâques et l'Épiphanie calculées.

- [ ] **Step 1: Écrire les tests qui échouent** (ajouter dans `city-calendar.test.ts`, dans un nouveau `describe('fêtes de 1b-ii-b')`)

```ts
describe('fêtes de 1b-ii-b', () => {
  const ids = (y: number, m: number, d: number) => festivitiesOn({ y, m, d }).map((f) => f.id);
  const hours = (y: number, m: number, d: number, id: string) => festivitiesOn({ y, m, d }).find((f) => f.id === id)?.hours;
  it('place les fêtes à date fixe', () => {
    expect(ids(2026, 2, 14)).toEqual(['valentine']);
    expect(ids(2026, 5, 1)).toEqual(['may-day']);
    expect(ids(2026, 6, 21)).toEqual(['music']);
    expect(ids(2026, 11, 11)).toEqual(['armistice']);
    expect(hours(2026, 6, 21, 'music')).toEqual([[1020, 1440]]);
  });
  it('calcule Pâques', () => {
    expect(ids(2026, 4, 5)).toEqual(['easter']); // Pâques 2026
    expect(ids(2027, 3, 28)).toEqual(['easter']);
    expect(ids(2026, 4, 6)).toEqual([]); // lundi de Pâques : pas de fête de ville
  });
  it('place l’Épiphanie le premier dimanche de janvier', () => {
    expect(ids(2026, 1, 4)).toEqual(['epiphany']); // dimanche
    expect(ids(2027, 1, 3)).toEqual(['epiphany']);
    expect(ids(2026, 1, 11)).toEqual([]);
    expect(ids(2026, 1, 1)).toEqual(['new-year']); // jeudi : pas d'Épiphanie
  });
  it('ajoute le défilé du matin au 14 juillet et étend le 1er janvier', () => {
    expect(hours(2026, 7, 14, 'bastille')).toEqual([[600, 720], [1260, 1440]]);
    expect(hours(2027, 1, 1, 'new-year')).toEqual([[0, 60]]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/library/city-calendar.test.ts`
Expected: FAIL (fêtes inconnues).

- [ ] **Step 3: Implémenter** — remplacer le type, la table et `festivitiesOn` :

```ts
export type FestivityId = 'new-year' | 'bastille' | 'christmas-eve' | 'epiphany' | 'valentine' | 'easter' | 'may-day' | 'music' | 'armistice';
```

```ts
export const FESTIVITIES: readonly { id: FestivityId; m: number; d: number; hours: Festivity['hours'] }[] = [
  { id: 'new-year', m: 12, d: 31, hours: [[1290, 1440]] },
  { id: 'new-year', m: 1, d: 1, hours: [[0, 60]] },
  { id: 'valentine', m: 2, d: 14, hours: [[600, 1380]] },
  { id: 'may-day', m: 5, d: 1, hours: [[480, 1080]] },
  { id: 'music', m: 6, d: 21, hours: [[1020, 1440]] },
  { id: 'bastille', m: 7, d: 14, hours: [[600, 720], [1260, 1440]] },
  { id: 'armistice', m: 11, d: 11, hours: [[480, 1080]] },
  { id: 'christmas-eve', m: 12, d: 24, hours: [[0, 1440]] },
  { id: 'christmas-eve', m: 12, d: 25, hours: [[0, 720]] },
];

// Fêtes à date calculée : Pâques (dimanche) et Épiphanie (premier dimanche de janvier).
export function festivitiesOn(date: YMD): Festivity[] {
  const out: Festivity[] = FESTIVITIES.filter((f) => f.m === date.m && f.d === date.d).map(({ id, hours }) => ({ id, hours }));
  const easter = easterSunday(date.y);
  if (date.m === easter.m && date.d === easter.d) out.push({ id: 'easter', hours: [[540, 1080]] });
  if (date.m === 1 && date.d <= 7 && weekdayOf(date) === 0) out.push({ id: 'epiphany', hours: [[600, 1080]] });
  return out;
}
```

- [ ] **Step 4: Corriger les attentes existantes devenues fausses** (le 14 juillet et le 1er janvier ont de nouvelles plages ; relire `city-calendar.test.ts` lignes ~66-86 et `santa`/`events` tests qui lisent ces plages), puis lancer `npx vitest run tests/core/library --maxWorkers=2` — tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/calendar.ts tests/core/library/city-calendar.test.ts
git commit -m "feat(ville): calendrier des fêtes (Épiphanie, Saint-Valentin, Pâques, 1er mai, musique, Armistice, défilé)"
```

### Task 2: Intensité festive et affluence

**Files:**
- Modify: `src/core/library/city/intensity.ts`
- Test: `tests/core/library/city-intensity.test.ts`

**Interfaces:**
- Consumes: `activeFestivities`, `FestivityId` (Task 1).
- Produces: `CityIntensity.festive: { id: FestivityId; share: number } | null` ; exports `FESTIVE_SHARE`, `FESTIVE_CROWD`.

- [ ] **Step 1: Tests qui échouent** (ajouter, avec `dayContext` déjà importé dans le fichier)

```ts
describe('intensité festive', () => {
  const fete = (m: number, d: number) => dayContext({ y: 2026, m, d }, []);
  const ctx = (hours: number, day: ReturnType<typeof fete>, extra: Partial<CityContext> = {}): CityContext => ({ minutes: Math.round(hours * 60), day, precip: 0, snow: false, storm: false, daylight: hours > 6 && hours < 20 ? 1 : 0, ...extra });
  it('est nulle hors fête et hors plage', () => {
    expect(cityIntensity(ctx(12, DAYS.school)).festive).toBeNull();
    expect(cityIntensity(ctx(8, fete(2, 14))).festive).toBeNull(); // Saint-Valentin avant 10 h
    expect(cityIntensity(ctx(12, fete(2, 14))).festive).toEqual({ id: 'valentine', share: FESTIVE_SHARE.valentine });
  });
  it('n’a pas de signe pour la veille de Noël', () => {
    expect(cityIntensity(ctx(12, fete(12, 24))).festive).toBeNull();
  });
  it('renforce la foule à la Fête de la musique et la calme le jour de Noël', () => {
    const plain = cityIntensity(ctx(21, DAYS.weekend));
    const music = cityIntensity(ctx(21, fete(6, 21)));
    expect(music.walkers).toBeGreaterThan(plain.walkers);
    expect(music.walkers).toBeGreaterThanOrEqual(0.5 * 0.99);
    const noel = cityIntensity(ctx(10, fete(12, 25)));
    const base = cityIntensity(ctx(10, { ...fete(12, 25), festivities: [] }));
    expect(noel.walkers).toBeLessThan(base.walkers);
  });
  it('reste dans [0, 1]', () => {
    for (const m of [1, 2, 5, 6, 7, 11, 12]) for (const h of [0, 4, 12, 22]) {
      const w = cityIntensity(ctx(h, fete(m, 14))).walkers;
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});
```
Ajouter `FESTIVE_SHARE` à l'import de `intensity`.

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/city-intensity.test.ts` → FAIL.

- [ ] **Step 3: Implémenter** dans `intensity.ts` :

```ts
import { activeFestivities, type DayContext, type FestivityId } from './calendar';
```
(remplacer l'import `DayContext` existant), puis ajouter les tables et le champ :

```ts
// Part des passants qui portent le signe de la fête (0 = pas de signe).
export const FESTIVE_SHARE: Readonly<Record<FestivityId, number>> = {
  epiphany: 0.25, valentine: 0.3, easter: 0.35, 'may-day': 0.4, bastille: 0.35, armistice: 0.3, 'new-year': 0.5, music: 0.4, 'christmas-eve': 0,
};
// Affluence pendant la fête : `mult` multiplie les marcheurs, `floor` est un plancher (avant météo).
export const FESTIVE_CROWD: Readonly<Record<FestivityId, { mult: number; floor: number }>> = {
  epiphany: { mult: 1, floor: 0 }, valentine: { mult: 1.2, floor: 0 }, easter: { mult: 1, floor: 0 }, 'may-day': { mult: 0.8, floor: 0 },
  bastille: { mult: 1.4, floor: 0.3 }, armistice: { mult: 0.7, floor: 0 }, 'new-year': { mult: 1.4, floor: 0.4 }, music: { mult: 1.5, floor: 0.5 }, 'christmas-eve': { mult: 0.6, floor: 0 },
};
```
Dans le type `CityIntensity` ajouter `festive: { id: FestivityId; share: number } | null;`. Dans `cityIntensity`, remplacer la ligne `const walkers = …` par :

```ts
  const fest = activeFestivities(ctx.day.festivities, ctx.minutes)[0] ?? null;
  const crowd = fest ? FESTIVE_CROWD[fest] : { mult: 1, floor: 0 };
  const walkers = clamp01(Math.max(lerp(curve(WALK_WEEK, hour), curve(WALK_WEEKEND, hour), b) * crowd.mult, crowd.floor) * weatherWalk);
```
et dans le `return` ajouter `festive: fest && FESTIVE_SHARE[fest] > 0 ? { id: fest, share: FESTIVE_SHARE[fest] } : null`. (`suits` utilise `weatherWalk`, inchangé.)

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library/city-intensity.test.ts` → PASS ; `npm run typecheck` : corriger les littéraux `CityIntensity` des tests/mocks qui n'ont pas `festive` (ajouter `festive: null`).

- [ ] **Step 5: Commit**

```bash
git add -A src/core/library/city/intensity.ts tests
git commit -m "feat(ville): intensité festive et affluence des jours de fête"
```

### Task 3: Passants festifs et signes de fête

**Files:**
- Modify: `src/core/library/city/people.ts`
- Test: `tests/core/library/city-people.test.ts`

**Interfaces:**
- Consumes: `CityIntensity.festive` (Task 2).
- Produces: `Pedestrian.role` gagne `'festive'` ; `Pedestrian.fest?: FestivityId` ; `Pedestrian.pair?: true` ; `type FestiveMark = 'crown' | 'heart-balloon' | 'basket' | 'lily' | 'flag' | 'poppy' | 'streamer' | 'note'` ; `festiveMark(p: Pedestrian, i: CityIntensity): FestiveMark | null`.

- [ ] **Step 1: Relever la référence AVANT toute modification** : ajouter temporairement dans un test `console.log(hashString(JSON.stringify(pedestriansFor(720, 7))))` (import de `hashString` depuis `scene-world`), lancer, noter le nombre `BASELINE`, retirer le log.

- [ ] **Step 2: Tests qui échouent** (remplacer `BASELINE` par la valeur relevée) :

```ts
describe('passants festifs', () => {
  const peds = pedestriansFor(720, 7);
  const base = peds.filter((p) => p.role !== 'festive');
  it('laisse les passants existants intacts (tirages inchangés)', () => {
    expect(hashString(JSON.stringify(base))).toBe(BASELINE);
    // les festifs sont à la fin de la liste
    expect(peds.slice(0, base.length)).toEqual(base);
  });
  it('ajoute des couples (Saint-Valentin) et des groupes d’enfants (Pâques)', () => {
    const fest = peds.filter((p) => p.role === 'festive');
    expect(fest.some((p) => p.fest === 'valentine' && p.pair && p.companions.length === 1)).toBe(true);
    expect(fest.some((p) => p.fest === 'easter' && p.profile === 'child')).toBe(true);
  });
  const festive = (id: FestivityId, share = 0.5): CityIntensity => ({ ...cityIntensity(CTX), festive: { id, share } });
  it('ne montre un festif que pendant sa fête', () => {
    const couple = peds.find((p) => p.fest === 'valentine')!;
    expect(pedestrianGate(couple, festive('valentine'))).toBeGreaterThan(0);
    expect(pedestrianGate(couple, festive('easter'))).toBe(0);
    expect(pedestrianGate(couple, { ...cityIntensity(CTX), festive: null })).toBe(0);
  });
  it('donne un signe par fête, déterministe, sans tirage', () => {
    const a = peds[0]!;
    expect(festiveMark(a, { ...cityIntensity(CTX), festive: null })).toBeNull();
    const all = festive('bastille', 1);
    expect(festiveMark(a, all)).toBe('flag');
    expect(festiveMark(a, festive('bastille', 0))).toBeNull();
    expect(festiveMark(a, all)).toBe(festiveMark(a, all));
    const marks = (id: FestivityId) => festiveMark(peds[0]!, festive(id, 1));
    expect([marks('epiphany'), marks('valentine'), marks('easter'), marks('may-day'), marks('armistice'), marks('new-year'), marks('music')]).toEqual(['crown', 'heart-balloon', 'basket', 'lily', 'poppy', 'streamer', 'note']);
    expect(marks('christmas-eve')).toBeNull();
  });
  it('le signe est une part des passants, proche du partage demandé', () => {
    const n = base.filter((p) => festiveMark(p, festive('bastille', 0.5)) !== null).length;
    expect(n).toBeGreaterThan(base.length * 0.2);
    expect(n).toBeLessThan(base.length * 0.8);
  });
});
```
`CTX` : un `CityContext` de journée ordinaire, déjà défini dans le fichier de test s'il existe, sinon `{ minutes: 720, day: dayContext({ y: 2026, m: 10, d: 10 }, []), precip: 0, snow: false, storm: false, daylight: 1 }`. Imports : `hashString`, `cityIntensity`, `festiveMark`, `pedestrianGate`, types `FestivityId`, `CityIntensity`.

- [ ] **Step 3: Vérifier l'échec** — `npx vitest run tests/core/library/city-people.test.ts`.

- [ ] **Step 4: Implémenter** dans `people.ts` :

```ts
import type { FestivityId } from './calendar';
import { hashString, mulberry32 } from '../scene-world';
```
Type `Pedestrian` : `role: 'general' | 'schoolTo' | 'schoolFrom' | 'play' | 'festive';` et, après `depth`, `fest?: FestivityId; pair?: true;`.

```ts
export type FestiveMark = 'crown' | 'heart-balloon' | 'basket' | 'lily' | 'flag' | 'poppy' | 'streamer' | 'note';
const MARK_OF: Readonly<Record<FestivityId, FestiveMark | null>> = {
  epiphany: 'crown', valentine: 'heart-balloon', easter: 'basket', 'may-day': 'lily', bastille: 'flag', armistice: 'poppy', 'new-year': 'streamer', music: 'note', 'christmas-eve': null,
};
// Pas de tirage : l'appartenance au partage vient du hachage de l'id.
const markU = (id: string): number => ((hashString(`mark:${id}`) >>> 0) % 10000) / 10000;

export function festiveMark(p: Pedestrian, i: CityIntensity): FestiveMark | null {
  const f = i.festive;
  if (!f) return null;
  const mark = MARK_OF[f.id];
  if (!mark) return null;
  if (p.role === 'festive') return p.fest === f.id ? mark : null;
  return markU(p.id) < f.share ? mark : null;
}
```
Dans `pedestrianGate`, en tête : `if (p.role === 'festive') return i.festive && i.festive.id === p.fest ? Math.min(1, i.festive.share * 2) : 0;`

À la fin de `pedestriansFor`, juste avant `return out;` :

```ts
  // Passants propres aux fêtes : EN FIN de liste, pour ne déplacer aucun tirage des passants ordinaires.
  const couples = Math.max(1, Math.round(width / 300));
  for (let i = 0; i < couples; i++) {
    const lead = make(`lov-${i}`, 'festive', 'ordinary', dirOf(), 12, 18);
    out.push({ ...lead, fest: 'valentine', pair: true, companions: [outfitFor('ordinary', rng)] });
  }
  const hunters = Math.max(1, Math.round(width / 260));
  for (let i = 0; i < hunters; i++) out.push({ ...make(`egg-${i}`, 'festive', 'child', dirOf(), 8, 18, 1), fest: 'easter', scale: 0.7 });
```
(`make` retourne un objet complet ; les spreads gardent l'ordre des tirages.) Si `return out;` n'est pas la dernière instruction après les enfants « play », garder le bloc après la boucle des `play`.

- [ ] **Step 5: Vérifier** — `npx vitest run tests/core/library/city-people.test.ts` PASS puis `npm run typecheck` (un `switch` exhaustif sur `role` ailleurs échoue : le compléter).

- [ ] **Step 6: Commit**

```bash
git add -A src/core/library/city/people.ts tests/core/library/city-people.test.ts
git commit -m "feat(ville): passants festifs (couples, chasse aux œufs) et signes de fête"
```

### Task 4: Dessin des signes et câblage dans la rue

**Files:**
- Modify: `src/content/city-sprites.tsx` (PersonSprite)
- Modify: `src/content/city-life.tsx:123-178,428-436`
- Test: `tests/content/city-sprites.test.tsx`, `tests/content/city-life.test.tsx`

**Interfaces:**
- Consumes: `FestiveMark`, `festiveMark`, `Pedestrian.pair` (Task 3).
- Produces: `PersonSprite` accepte `mark?: FestiveMark | null` ; la `<g data-ped>` d'un passant marqué porte `data-mark="<mark>"`.

- [ ] **Step 1: Tests qui échouent.** Dans `city-sprites.test.tsx` (reprendre le montage des autres tests du fichier pour `PersonSprite`) :

```tsx
it.each(['crown', 'heart-balloon', 'basket', 'lily', 'flag', 'poppy', 'streamer', 'note'] as const)('dessine le signe %s', (mark) => {
  const { container } = render(<svg><PersonSprite outfit={OUTFIT} sky={SKY} rainy={false} umbrella={false} mark={mark} /></svg>);
  expect(container.querySelector(`[data-mark-art="${mark}"]`)).not.toBeNull();
});
it('ne dessine aucun signe par défaut', () => {
  const { container } = render(<svg><PersonSprite outfit={OUTFIT} sky={SKY} rainy={false} umbrella={false} /></svg>);
  expect(container.querySelector('[data-mark-art]')).toBeNull();
});
```
(`OUTFIT` et `SKY` : les constantes déjà utilisées dans ce fichier de test.) Dans `city-life.test.tsx`, reprendre le montage d'un test existant qui fixe la date, avec la date `2026-02-14` à 12 h : vérifier qu'au moins un `[data-ped][data-role="festive"]` est `data-active="true"` et qu'un `[data-mark="heart-balloon"]` existe ; avec une date ordinaire, aucun `[data-mark]`.

- [ ] **Step 2: Vérifier l'échec.**

- [ ] **Step 3: Implémenter** dans `city-sprites.tsx` : importer `type FestiveMark`, ajouter `mark?: FestiveMark | null` aux props de `PersonSprite`, et rendre, après le bloc « Tête » (donc au-dessus de la tête et dans la main), un composant local :

```tsx
function MarkArt({ mark, t }: { mark: FestiveMark; t: (c: string) => string }): ReactElement {
  switch (mark) {
    case 'crown':
      return <path data-mark-art="crown" d="M-3.6 -37.2 L-3.6 -41 L-1.8 -39 L0 -42 L1.8 -39 L3.6 -41 L3.6 -37.2Z" fill={t('#E8B923')} />;
    case 'heart-balloon':
      return (
        <g data-mark-art="heart-balloon">
          <path d="M6 -14 Q9 -30 8 -44" stroke="#6B5B4A" strokeWidth={0.6} fill="none" />
          <path d="M8 -44 C3 -48 4 -55 8 -52 C12 -55 13 -48 8 -44Z" fill={t('#E0305A')} />
        </g>
      );
    case 'basket':
      return (
        <g data-mark-art="basket">
          <path d="M5 -11 H13 L12 -5 H6Z" fill={t('#B07A3A')} />
          <circle cx={7.5} cy={-12} r={1.4} fill={t('#F7C6D9')} />
          <circle cx={10.5} cy={-12.2} r={1.4} fill={t('#FFF2A8')} />
        </g>
      );
    case 'lily':
      return (
        <g data-mark-art="lily">
          <path d="M3 -22 Q4 -26 3 -29" stroke={t('#2E8B6A')} strokeWidth={0.8} fill="none" />
          {[-29, -27, -25].map((y, k) => <circle key={k} cx={3.6 + (k % 2) * -1.4} cy={y} r={1} fill={t('#FFFFFF')} />)}
        </g>
      );
    case 'flag':
      return (
        <g data-mark-art="flag">
          <line x1={8} y1={-14} x2={8} y2={-42} stroke="#6B5B4A" strokeWidth={0.8} />
          <rect x={8} y={-42} width={3} height={6} fill={t('#2B4FA0')} />
          <rect x={11} y={-42} width={3} height={6} fill={t('#F2F2F2')} />
          <rect x={14} y={-42} width={3} height={6} fill={t('#C0302B')} />
        </g>
      );
    case 'poppy':
      return (
        <g data-mark-art="poppy">
          <circle cx={3} cy={-24} r={1.8} fill={t('#C0302B')} />
          <circle cx={3} cy={-24} r={0.6} fill="#222" />
        </g>
      );
    case 'streamer':
      return (
        <g data-mark-art="streamer">
          <path d="M-3 -37.4 L0 -45 L3 -37.4Z" fill={t('#F2C94C')} />
          <path d="M-5 -27 Q0 -23 5 -28" stroke={t('#E07A8C')} strokeWidth={1.2} fill="none" />
        </g>
      );
    case 'note':
      return (
        <g data-mark-art="note">
          <circle cx={6} cy={-40} r={1.4} fill={t('#B04FFF')} />
          <path d="M7.3 -40 V-47 L10 -45.5" stroke={t('#B04FFF')} strokeWidth={0.9} fill="none" />
        </g>
      );
  }
}
```
Vérifier les coordonnées en rendu (tête à `cy=-33`, haut à `-28`) et ajuster. Appeler `{mark && <MarkArt mark={mark} t={t} />}` à la fin du groupe de la personne.

Dans `city-life.tsx` : importer `festiveMark`; après `pedActive`, ajouter `const marks = useMemo(() => new Map(peds.map((p) => [p.id, festiveMark(p, intensity)] as const)), [peds, intensity]);` ; sur la `<g data-ped>` ajouter `data-mark={marks.get(p.id) ?? undefined}` ; passer `mark={marks.get(p.id)}` au `PersonSprite` principal ; pour `p.pair`, rendre le compagnon avec `transform={`translate(${-PAIR_GAP} 0) scale(0.95)`}` (constante `const PAIR_GAP = 13;` à côté de `COMPANION_GAP`) au lieu de l'échelle 0,7.

- [ ] **Step 4: Vérifier** — `npx vitest run tests/content/city-sprites.test.tsx tests/content/city-life.test.tsx --maxWorkers=2` PASS ; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A src/content tests/content
git commit -m "feat(ville): signes de fête sur les passants et couples dans la rue"
```

### Task 4b: Clôture de la PR 1

- [ ] **Step 1:** `npx vitest run --maxWorkers=2 --testTimeout=40000` (tout vert), `npm run typecheck`, `npm run build`.
- [ ] **Step 2:** Capture sur le banc `.superpowers/harness-ville` (le recréer depuis le dépôt principal s'il manque dans le worktree ; paramètres `date=2026-02-14&h=12`, `date=2026-04-05&h=11`, `date=2026-05-01&h=10`) et montrer les captures à l'utilisateur pour validation.
- [ ] **Step 3:** Pousser, ouvrir la PR (titre : « Ville : passants festifs et signes de fête (1b-ii-b, 1/2) »), la fusionner, puis `npm run preprod` (sans demander, règle du projet).

---

# PR 2 : événements, sprites, drapeaux, fiche

(Nouvelle branche `feat/bibliotheque-fetes-ambiance-2` depuis `origin/main` mis à jour.)

### Task 5: Quatre événements de fête dans le moteur

**Files:**
- Modify: `src/core/library/city/events.ts`, `event-place.ts`
- Test: `tests/core/library/city-events.test.ts`

**Interfaces:**
- Produces: `CityEventId` gagne `'fest-balloons' | 'bells' | 'street-band' | 'parade'` ; `eligible` refuse un événement dont `weightOf` est nul.

- [ ] **Step 1: Tests qui échouent**

```ts
describe('événements de fête', () => {
  const fest = (id: FestivityId, c: EventConditions = DAY_DRY): EventConditions => ({ ...c, fests: [id] });
  const at = (id: CityEventId) => defOf(id);
  it('compte 20 événements, dont 4 réservés aux fêtes', () => {
    expect(EVENT_DEFS).toHaveLength(20);
    for (const id of ['fest-balloons', 'bells', 'street-band', 'parade'] as const) expect(at(id).weight).toBe(0);
  });
  it('n’éligible un événement de fête que pendant sa fête', () => {
    expect(eligible(at('parade'), 660, DAY_DRY)).toBe(false);
    expect(eligible(at('parade'), 660, fest('bastille'))).toBe(true);
    expect(eligible(at('parade'), 800, fest('bastille'))).toBe(false); // hors 10 h-12 h
    expect(eligible(at('bells'), 600, fest('easter'))).toBe(true);
    expect(eligible(at('bells'), 600, fest('valentine'))).toBe(false);
    expect(eligible(at('fest-balloons'), 700, fest('valentine'))).toBe(true);
    expect(eligible(at('fest-balloons'), 700, fest('valentine', { ...DAY_DRY, wet: true }))).toBe(false);
    expect(eligible(at('street-band'), 1200, fest('music', NIGHT_DRY))).toBe(true);
    expect(eligible(at('street-band'), 1200, NIGHT_DRY)).toBe(false);
  });
  it('programme un défilé le matin du 14 juillet et jamais un jour ordinaire', () => {
    const on = many(fest('bastille'), 600).filter((e) => e.id === 'parade');
    expect(on.length).toBeGreaterThan(0);
    for (const e of on) expect(e.track).toBe('near');
    expect(many(DAY_DRY, 600).some((e) => e.id === 'parade')).toBe(false);
  });
  it('programme des musiciens à la Fête de la musique', () => {
    expect(many(fest('music', NIGHT_DRY), 1100).some((e) => e.id === 'street-band')).toBe(true);
  });
  it('garde le programme ordinaire identique (sans fête)', () => {
    const sig = (es: CityEvent[]) => es.map((e) => `${e.id}@${e.key}`).join();
    expect(sig(many(DAY_DRY, 600, 30)).includes('parade')).toBe(false);
  });
});
```
Importer `FestivityId`, `CityEventId`. Mettre à jour le test de catalogue existant (« 16 événements » → 20, `Set` à 20).

- [ ] **Step 2: Vérifier l'échec.**

- [ ] **Step 3: Implémenter** dans `events.ts` : ajouter les 4 ids à `CityEventId` ; ajouter à `EVENT_DEFS` :

```ts
  // Fêtes (poids de base nul : ils n'existent que par `festWeight`)
  { id: 'fest-balloons', layer: 'sky', weight: 0, festWeight: { valentine: 3, easter: 3 }, hours: [[600, 1140]], half: 16, speed: 7, light: 'day', rain: 'dry', y: [0.1, 0.28] },
  { id: 'bells', layer: 'fixed', weight: 0, festWeight: { easter: 4 }, hours: [[540, 1080]], half: 12, duration: 60, light: 'day', y: [0.14, 0.3] },
  { id: 'street-band', layer: 'fixed', weight: 0, festWeight: { music: 6 }, hours: [[1020, 1440]], half: 40, duration: 300 },
  { id: 'parade', layer: 'street', weight: 0, festWeight: { bastille: 8 }, hours: [[600, 720]], half: 120, lanes: ['near'] },
```
`STILL_EVENTS` : ajouter `'bells'` et `'street-band'`. Dans `eligible`, en première ligne : `if (weightOf(def, c) <= 0) return false;`. Dans `event-place.ts` : `SKY_SCALE` ajouter `'fest-balloons': 1` ; dans `placeEvent`, cas `'fixed'`, avant le retour par défaut : `if (e.id === 'street-band') { const k = m.unit * STREET_SCALE.person; return { x: e.x0, y: m.walkY, sx: k, sy: k }; }` (pas de miroir : les musiciens font face à la rue). Pour `bells` la hauteur `e.y * height` du cas par défaut convient.

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library --maxWorkers=2` PASS (les tests d'événements existants restent verts : le pool ordinaire n'a pas changé) ; `npm run typecheck` signale les `switch` exhaustifs à compléter (sprites : Task 6).

- [ ] **Step 5: Commit**

```bash
git add -A src/core/library/city tests/core/library
git commit -m "feat(ville): événements de fête (ballons, cloches, musiciens, défilé) dans le moteur"
```

### Task 6: Sprites des événements de fête et câblage

**Files:**
- Modify: `src/content/city-event-sprites.tsx`, `src/content/city-life.tsx:327,439`
- Test: `tests/content/city-event-sprites.test.tsx`, `tests/content/city-events-layer.test.tsx`

**Interfaces:**
- Consumes: ids de la Task 5.
- Produces: `CityEventSprite` accepte `fests: readonly FestivityId[]`.

- [ ] **Step 1: Tests qui échouent** (reprendre les montages du fichier ; fabriquer un `CityEvent` avec les champs requis, comme les tests existants) :

```tsx
it.each(['fest-balloons', 'bells', 'street-band', 'parade'] as const)('dessine %s', (id) => {
  const { container } = render(<svg><CityEventSprite event={ev(id)} sky={SKY} still={false} lights={false} rainy={false} fests={['bastille', 'music', 'easter', 'valentine']} /></svg>);
  expect(container.querySelector(`[data-event-sprite="${id}"]`)).not.toBeNull();
});
it('ballons-lapins à Pâques, en cœur à la Saint-Valentin', () => {
  const easter = render(<svg><CityEventSprite event={ev('fest-balloons')} sky={SKY} still={false} lights={false} rainy={false} fests={['easter']} /></svg>);
  expect(easter.container.querySelector('[data-balloon-kind="bunny"]')).not.toBeNull();
  const love = render(<svg><CityEventSprite event={ev('fest-balloons')} sky={SKY} still={false} lights={false} rainy={false} fests={['valentine']} /></svg>);
  expect(love.container.querySelector('[data-balloon-kind="heart"]')).not.toBeNull();
});
it('les musiciens ont des lumières colorées seulement la nuit et sans mouvement réduit', () => {
  const night = render(<svg><CityEventSprite event={ev('street-band')} sky={SKY} still={false} lights fests={['music']} rainy={false} /></svg>);
  expect(night.container.querySelector('[data-band-light]')).not.toBeNull();
  const reduced = render(<svg><CityEventSprite event={ev('street-band')} sky={SKY} still lights fests={['music']} rainy={false} /></svg>);
  expect(reduced.container.querySelector('animate, animateTransform')).toBeNull();
});
```
Dans `city-events-layer.test.tsx`, un test de câblage : avec la date 14 juillet à 11 h, forcer un programme (voir comment les tests existants injectent des événements) et vérifier que `[data-event="parade"]` est rendu dans la file du premier plan.

- [ ] **Step 2: Vérifier l'échec.**

- [ ] **Step 3: Implémenter** dans `city-event-sprites.tsx` : ajouter `fests` aux `Props` et à la signature ; ajouter quatre `case` avant `default` (pas de `Math.random`) :

```tsx
      case 'fest-balloons': {
        const bunny = fests.includes('easter') && !(fests.includes('valentine') && e.variant < 0.5);
        const cols = bunny ? ['#F7C6D9', '#CFE8FF', '#FFF2A8'] : ['#E0305A', '#F2708C', '#B01E48'];
        return (
          <g data-balloon-kind={bunny ? 'bunny' : 'heart'}>
            {cols.map((c, k) => (
              <g key={k} transform={`translate(${(k - 1) * 14} ${-(k % 2) * 6})`}>
                {anim && <animateTransform attributeName="transform" additive="sum" type="rotate" values="-3 0 30;3 0 30;-3 0 30" dur={`${3 + k * 0.4}s`} repeatCount="indefinite" />}
                <path d="M0 8 Q2 20 0 30" stroke="#6B5B4A" strokeWidth={0.8} fill="none" />
                {bunny ? (
                  <>
                    <ellipse cx={0} cy={-2} rx={8} ry={10} fill={t(c)} />
                    <ellipse cx={-3.5} cy={-16} rx={2.2} ry={6} fill={t(c)} />
                    <ellipse cx={3.5} cy={-16} rx={2.2} ry={6} fill={t(c)} />
                  </>
                ) : (
                  <path d="M0 8 C-14 -2 -8 -14 0 -6 C8 -14 14 -2 0 8Z" fill={t(c)} />
                )}
              </g>
            ))}
          </g>
        );
      }
      case 'bells':
        return (
          <g>
            <path d="M-9 -8 Q0 -14 9 -8" stroke={t('#C0463A')} strokeWidth={1.4} fill="none" />
            {[-9, 9].map((x, k) => (
              <g key={k} transform={`translate(${x} 0)`}>
                <g>
                  {anim && <animateTransform attributeName="transform" type="rotate" values={`${k ? -14 : 14} 0 -8;${k ? 14 : -14} 0 -8;${k ? -14 : 14} 0 -8`} dur="1.6s" repeatCount="indefinite" />}
                  <path d="M-6 6 Q-6 -6 0 -8 Q6 -6 6 6Z" fill={t('#E8B923')} />
                  <circle cx={0} cy={8} r={1.6} fill={t('#8A6A12')} />
                </g>
              </g>
            ))}
          </g>
        );
      case 'street-band': {
        const people = outfitsOf(e.key, 'ordinary', 3);
        const spots = ['#FF4F4F', '#4FD8FF', '#B04FFF'];
        return (
          <g>
            {lights && spots.map((col, k) => (
              <path key={k} data-band-light="" d={`M${-22 + k * 22} -78 L${-40 + k * 22} 0 L${-4 + k * 22} 0Z`} fill={col} opacity={0.16}>
                {anim && <animate attributeName="opacity" values="0.05;0.22;0.05" dur={`${2 + k * 0.5}s`} begin={`${k * 0.4}s`} repeatCount="indefinite" />}
              </path>
            ))}
            {people.map((o, k) => (
              <g key={k} transform={`translate(${-22 + k * 22} 0)`}>
                <PersonSprite outfit={o} sky={sky} rainy={rainy} umbrella={false} />
              </g>
            ))}
            <ellipse cx={22} cy={-4} rx={7} ry={4} fill={t('#8A5A2B')} />
            <line x1={-22} y1={-2} x2={-22} y2={-28} stroke="#444" strokeWidth={0.8} />
          </g>
        );
      }
      case 'parade': {
        const bodies = ['#6B7A4A', '#43506A', '#7A5A4A', '#6B7A4A'];
        return (
          <g>
            {bodies.map((c, k) => (
              <g key={k} transform={`translate(${-90 + k * 60} 0)`}>
                <rect x={-24} y={-14} width={48} height={9} rx={2} fill={t(c)} />
                <rect x={-10} y={-21} width={22} height={8} rx={2} fill={t(c)} />
                <rect x={-7} y={-19.5} width={16} height={5} fill={t(GLASS)} />
                <circle cx={-14} cy={-4} r={3.6} fill="#222" />
                <circle cx={14} cy={-4} r={3.6} fill="#222" />
                <line x1={20} y1={-14} x2={20} y2={-32} stroke="#6B5B4A" strokeWidth={0.8} />
                <rect x={20} y={-32} width={2.5} height={5} fill={t('#2B4FA0')} />
                <rect x={22.5} y={-32} width={2.5} height={5} fill={t('#F2F2F2')} />
                <rect x={25} y={-32} width={2.5} height={5} fill={t('#C0302B')} />
              </g>
            ))}
          </g>
        );
      }
```
Comparer avec le dessin du `bus` (hauteur du sol, taille des roues) et ajuster pour que le convoi s'accorde aux véhicules ambiants. Importer `FestivityId`.

Dans `city-life.tsx` : passer `fests={fests}` à `CityEventSprite` dans `eventNode` (la constante `fests` est déjà définie plus haut) ; ajouter `|| e.id === 'bells'` au filtre du groupe `data-city-events-back` et remplacer le filtre du trottoir par `(e) => e.layer === 'sidewalk' || e.id === 'street-band'`.

- [ ] **Step 4: Vérifier** — `npx vitest run tests/content --maxWorkers=2 --testTimeout=40000` PASS ; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A src/content tests/content
git commit -m "feat(ville): ballons, cloches, musiciens et défilé dessinés"
```

### Task 7: Drapeaux aux entrées d'immeuble

**Files:**
- Modify: `src/core/library/city/doors.ts`, le composant qui dessine les entrées (le trouver avec `grep -rn "hallU" src/content`)
- Test: `tests/core/library/city-doors.test.ts` (ou le fichier de tests de `doors` existant), test de rendu voisin

**Interfaces:**
- Consumes: `Door` (`{ id, x, variant, hallU }`), `FestivityId`.
- Produces: `doorFlag(door: Door, fests: readonly FestivityId[]): boolean`.

- [ ] **Step 1: Tests qui échouent**

```ts
describe('drapeaux aux entrées', () => {
  const door = (hallU: number): Door => ({ id: 'd', x: 100, variant: 0, hallU });
  it('pavoise une partie des entrées les jours de drapeaux', () => {
    expect(doorFlag(door(0.2), ['bastille'])).toBe(true);
    expect(doorFlag(door(0.2), ['armistice'])).toBe(true);
    expect(doorFlag(door(0.2), ['may-day'])).toBe(true);
    expect(doorFlag(door(0.9), ['bastille'])).toBe(false);
  });
  it('ne pavoise pas les autres jours', () => {
    expect(doorFlag(door(0.2), [])).toBe(false);
    expect(doorFlag(door(0.2), ['valentine'])).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec.**

- [ ] **Step 3: Implémenter** dans `doors.ts` :

```ts
import type { FestivityId } from './calendar';
const FLAG_DAYS: ReadonlySet<FestivityId> = new Set<FestivityId>(['bastille', 'armistice', 'may-day']);
// Une entrée sur deux environ porte un drapeau (hallU sert de tirage stable).
export const doorFlag = (door: Door, fests: readonly FestivityId[]): boolean => door.hallU < 0.5 && fests.some((f) => FLAG_DAYS.has(f));
```
Dans le composant qui dessine les entrées, ajouter (`flag` calculé avec `doorFlag(door, fests)`) un drapeau tricolore sur hampe au-dessus de l'encadrement, avec `data-door-flag=""`, comme `flag` de la Task 4 (hampe + trois bandes), sans animation. Passer `fests` depuis `city-life.tsx` au besoin. Test de rendu : à une date de drapeau, au moins un `[data-door-flag]` ; à une date ordinaire, aucun.

- [ ] **Step 4: Vérifier** et **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(ville): drapeaux aux entrées d'immeuble (14 juillet, Armistice, 1er mai)"
```

### Task 8: Fiche WikiHow `bibliotheque-v26`

**Files:**
- Modify: `src/core/whats-new/entries.ts` (après `bibliotheque-v25`, ligne ~1839)
- Test: les tests existants des entrées (unicité des ids, étapes valides)

- [ ] **Step 1:** Copier la structure de `bibliotheque-v25` (thème `collection`, glyphe `🎉`, `steps` avec `target: '[data-wmt-library-entry]'`, `scene: { page: '/collection', closeWindows: true }`, `details` avec libellés « À quoi ça sert », « Comment faire », « Comment ça marche », « D’où viennent les données », « Limites »). Titre : « Fêtes dans la ville ». Résumé : « Saint-Valentin, Pâques, 1er mai, Fête de la musique, 14 juillet, Armistice : la rue change d’ambiance ». Trois étapes :
  1. **Calendrier élargi** : neuf fêtes ; Épiphanie (1er dimanche de janvier), Pâques calculée ; limites : calendrier français, pas de réglage de date.
  2. **Passants et décors** : couronnes, ballons-cœur, paniers, muguet, drapeaux, bonnets ; couples (14 février) et enfants à la chasse aux œufs ; affluence (foule le 21 juin, rue calme le 11 novembre) ; drapeaux aux entrées.
  3. **Animations** : ballons-cœur / lapins, cloches de Pâques, musiciens avec lumières colorées le soir du 21 juin, défilé de véhicules le matin du 14 juillet ; limites : rien sans fenêtre, en mouvement réduit seuls cloches et musiciens restent, un événement peut se produire ou non (tirage), pas de troupes à pied.
- [ ] **Step 2:** `npx vitest run tests/core/whats-new --maxWorkers=2` PASS (id jamais annoncé, unicité).
- [ ] **Step 3: Commit** `docs(wikihow): fiche bibliotheque-v26 (fêtes dans la ville)`.

### Task 9: Vérification et livraison de la PR 2

- [ ] **Step 1:** Captures sur le banc `.superpowers/harness-ville` : `date=2026-07-14&h=11` (défilé), `date=2026-06-21&h=21.5` (musiciens et lumières), `date=2026-04-05&h=11` (cloches, ballons-lapins), `date=2026-02-14&h=12` (ballons-cœur), `date=2026-11-11&h=10` (drapeaux d’entrées). Les montrer à l’utilisateur pour validation et corriger les dessins si besoin.
- [ ] **Step 2:** `npx vitest run --maxWorkers=2 --testTimeout=40000`, `npm run typecheck`, `npm run build`.
- [ ] **Step 3:** Relecture finale de la branche, PR (titre « Ville : ambiance de fête (1b-ii-b, 2/2) »), fusion, `npm run preprod`, retrait du worktree (jonction `node_modules` retirée avant suppression), mise à jour de la mémoire du projet.
