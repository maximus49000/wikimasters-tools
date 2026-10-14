# Lieu de la scène (géolocalisation ou ville définie) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'interrupteur « Position » par un réglage « Lieu de la scène » à trois choix (📍 Géolocalisation, 🏙 Ville, ⊘ Désactivé) que suivent l'heure, le ciel, la météo, les commerces, les bus, la zone des vacances et les horloges de la Bibliothèque, avec recherche de ville en ligne par le relais.

**Architecture:** Un module pur `scene-location.ts` (types, lecture tolérante, migration) et un module de stockage `location-setting.ts` (même forme `get/set/subscribe` que l'ancien `position-setting.ts`, qu'il remplace). `scene-position.ts` reste la source unique du lieu (`currentPosition`, `isPositionKnown`, nouveau `sceneTimeZone`) : tous les consommateurs actuels suivent sans changement. Un module pur `scene-clock.ts` (`localClock`) donne l'heure et la date d'un fuseau ; l'heure de la scène et les horloges en dérivent. Une route `/geocode` du relais Cloudflare interroge Open-Meteo ; côté client `searchPlaces` + hook `usePlaceSearch` + composant `LocationPicker`, partagé par la fenêtre `LocationDialog` (menu ☁️) et `PositionSettings` (Paramètre d'extension).

**Tech Stack:** TypeScript strict, React 19, vitest 5 + jsdom, `Intl.DateTimeFormat` (fuseaux IANA), Cloudflare Worker (`relay/`), Open-Meteo Geocoding API.

**Spec:** `docs/superpowers/specs/2026-10-14-lieu-scene-design.md` — maquette : `docs/superpowers/maquettes/lieu-scene/lieu-scene.html`.

## Global Constraints

- Travail dans le worktree `C:/Users/maxim/Downloads/Wikimasters-horloges`, branche `feat/meteo-previsions` (jamais dans `C:/Users/maxim/Downloads/Wikimasters tools` : une autre session y travaille).
- **Un seul lieu pour toute la Bibliothèque** ; trois choix : **📍 Géolocalisation**, **🏙 Ville**, **⊘ Désactivé**.
- Réglage gardé **sur l'appareil** dans `localStorage`, clé `wmt:scene-location` (JSON) ; mémoire de session si le stockage est refusé.
- `type SceneCity = { name: string; admin?: string; country: string; lat: number; lon: number; tz: string };`
- `type SceneLocation = { mode: 'geo' } | { mode: 'city'; city: SceneCity } | { mode: 'off' };`
- **Migration** à la première lecture si la clé manque : `wmt:positionEnabled === 'off'` → `{ mode: 'off' }`, sinon `{ mode: 'geo' }`. L'ancienne clé n'est plus écrite.
- Valeur illisible (JSON cassé, ville sans `tz` IANA valide ou coordonnées hors bornes) → `{ mode: 'geo' }` (défaut), sans erreur.
- `ensurePosition()` / `requestPosition()` ne demandent la position de l'appareil **qu'en mode géolocalisation**. En mode Ville, aucune demande d'autorisation.
- `localClock(now: Date, tz: string | null): { minutes: number; seconds: number; date: YMD; offsetMin: number }` par `Intl.DateTimeFormat` (`hourCycle: 'h23'`, formateurs mis en cache).
- La seconde partagée (`src/content/clock-tick.ts`) ne change pas.
- Relais : `GET /geocode?q=<texte>`, `q` de **2 à 60 caractères** après `trim`, sinon `400 bad-request` ; amont `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=8&language=fr&format=json` ; coordonnées arrondies à **0,01°** ; résultats sans `timezone` écartés ; cache **24 h, 500 entrées max** par texte normalisé (minuscules, sans accents) ; limiteur `geocode: [60, 60_000]` ; échec amont → `502 upstream`, `429` relayé.
- Fenêtre : trois boutons larges (**≥ 44 px**) `aria-pressed` ; recherche **au moins 2 lettres**, attente de **350 ms** après la dernière frappe, requête précédente annulée ; lignes de résultat **≥ 48 px**.
- Cache météo réelle `wmt:weather-real` : `{ at, obs, cell }`, reprise sans requête si **moins de 15 min** et même cellule ; ancien format sans cellule relu comme périmé.
- Fiche WikiHow : **nouvel id** `lieu-scene-2026-10` (« Lieu de la scène ») ; les fiches de l'ancien interrupteur ne sont pas réécrites.
- Interface : boutons à glyphe (`Btn` + `Icon` de `src/content/library-ui.tsx`, libellé dans `label`) ; cibles tactiles ≥ 44 px ; fenêtres de la pièce rendues dans la zone plein écran, Échap isolé par `DECO_DIALOG_ATTR` / `inDecoDialog` (`src/content/deco-dialog-guard.ts`).
- Android d'abord : aucun nouveau minuteur permanent, aucun rendu supplémentaire à la seconde.
- Tests : ne jouer que les familles touchées (`npm run test:famille -- <famille> …`) ; tout nouveau fichier de test correspond à un motif de `tests/familles.ts` (motif ajouté dans la même tâche sinon : `tests/familles.test.ts` refuse un test sans famille et un motif sans test).
- Avant chaque commit : `npx tsc --noEmit` sans erreur + tests de la tâche verts. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Réponse tardive après effacement** : le joueur tape « ang », la requête part, puis il efface jusqu'à « a » avant la réponse : la liste doit rester vide (état « au moins 2 lettres »), la réponse arrivée ensuite est ignorée — test dans la tâche 7.
2. **Résultat dont le fuseau est inconnu de l'appareil** (vieux WebView Android, ICU incomplet) : la ville ne doit pas être proposée (sinon, enregistrée puis relue comme invalide, le réglage repasserait en silence en géolocalisation) — test dans la tâche 7.
3. **Stockage refusé** (fenêtre privée, WebView sans stockage) : choisir une ville doit valoir pour la session, sans erreur — test dans la tâche 1.
4. **Heure manuelle avec une ville** : en « Choisir l'heure » à 14:00 avec la scène à Tokyo, l'horloge « heure de la scène » montre 14:00 et une horloge réglée sur Paris 07:00 (écart Tokyo-Paris, pas écart appareil-Paris) — test dans la tâche 4.
5. **Échap dans la fenêtre ouverte depuis le menu ☁️** : seule la fenêtre se ferme ; le menu ☁️ reste ouvert, ni le plein écran ni le placement ne sont touchés — test dans la tâche 9.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/scene-location.ts` (nouveau) | types `SceneCity`/`SceneLocation`, `GEO`/`OFF`, `isValidTimeZone`, `isSceneCity`, `toSceneCity`, `parseLocation` (migration, lecture tolérante) |
| `src/content/location-setting.ts` (nouveau, remplace `position-setting.ts`) | stockage `wmt:scene-location`, `get/set/subscribe`, mémoire de session |
| `src/content/scene-position.ts` | lieu effectif : ville, position de l'appareil ou repli ; `sceneTimeZone()` |
| `src/core/library/scene-clock.ts` (nouveau) | `localClock`, `tzOffsetMinutes` (déplacé depuis `clock-cities.ts`) |
| `src/core/library/time-setting.ts`, `src/content/use-scene-time.ts` | heure réelle, date et lever/coucher dans le fuseau de la scène |
| `src/core/library/clock-cities.ts`, `src/content/deco-live.tsx`, `src/content/RoomView.tsx`, `src/content/CityPickerDialog.tsx` | horloges décalées depuis le fuseau de la scène |
| `src/core/library/weather/weather-real.ts` | cache météo avec sa cellule |
| `relay/src/geocode.ts` (nouveau), `relay/src/index.ts` | route `/geocode` |
| `src/core/library/geocode.ts` (nouveau) | `searchPlaces`, `PlaceHit`, `GeocodeError` |
| `src/content/use-place-search.ts` (nouveau) | attente 350 ms, annulation, états de la recherche |
| `src/content/location-picker.tsx` (nouveau) | trois choix + recherche + résultats (partagé) |
| `src/content/LocationDialog.tsx` (nouveau) | fenêtre « Lieu de la scène » de la pièce |
| `src/content/library-sky-menu.tsx`, `src/content/LibraryPanel.tsx` | bandeau du menu ☁️, ouverture de la fenêtre |
| `src/content/PositionSettings.tsx` | Paramètres › Position à trois choix |
| `src/core/whats-new/entries.ts` | fiche WikiHow `lieu-scene-2026-10` |
| `tests/familles.ts` | motifs `location-*`, `scene-location.*`, `scene-clock.*`, `geocode.*` |

---

### Task 1: Réglage « Lieu de la scène » et migration (remplace `position-setting.ts`)

**Files:**
- Create: `src/core/library/scene-location.ts`, `src/content/location-setting.ts`
- Delete: `src/content/position-setting.ts`
- Modify: `src/content/scene-position.ts:2,18-26,40-43,48,87`, `src/content/LibraryPanel.tsx:78,453-459,994`, `src/content/PositionSettings.tsx:1-25`, `tests/familles.ts:111-112`
- Test: `tests/core/library/scene-location.test.ts` (nouveau), `tests/content/location-setting.test.ts` (nouveau), `tests/content/position-setting.test.tsx` (mis à jour), `tests/content/library-weather-ui.test.tsx:6,42,83,88` (mis à jour), `tests/content/library-window-furniture.test.tsx:174` (mis à jour)

**Interfaces:**
- Produces (`scene-location.ts`) : `type SceneCity`, `type SceneLocation`, `GEO: SceneLocation` (`{ mode: 'geo' }`), `OFF: SceneLocation` (`{ mode: 'off' }`), `isValidTimeZone(tz: string): boolean`, `isSceneCity(v: unknown): v is SceneCity`, `toSceneCity(c: SceneCity & { population?: number }): SceneCity`, `parseLocation(raw: string | null, legacy: string | null): SceneLocation`.
- Produces (`location-setting.ts`) : `locationSetting.get(): SceneLocation` (même objet tant que rien ne change), `locationSetting.set(next: SceneLocation): void`, `locationSetting.subscribe(listener): () => void`, `resetLocationForTests(): void`.

- [ ] **Step 1: Écrire les tests du module pur (échouent)**

`tests/core/library/scene-location.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { GEO, OFF, isSceneCity, isValidTimeZone, parseLocation, toSceneCity } from '../../../src/core/library/scene-location';

const TOKYO = { name: 'Tokyo', admin: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };
const city = (over: Record<string, unknown>) => JSON.stringify({ mode: 'city', city: { ...TOKYO, ...over } });

describe('lieu de la scène : lecture', () => {
  it('migration : ancienne clé « off » → désactivé ; absente ou « on » → géolocalisation', () => {
    expect(parseLocation(null, 'off')).toEqual({ mode: 'off' });
    expect(parseLocation(null, null)).toEqual({ mode: 'geo' });
    expect(parseLocation(null, 'on')).toEqual({ mode: 'geo' });
  });

  it('la nouvelle clé l’emporte sur l’ancienne', () => {
    expect(parseLocation('{"mode":"geo"}', 'off')).toBe(GEO);
  });

  it('relit les trois modes', () => {
    expect(parseLocation('{"mode":"geo"}', null)).toBe(GEO);
    expect(parseLocation('{"mode":"off"}', null)).toBe(OFF);
    expect(parseLocation(JSON.stringify({ mode: 'city', city: TOKYO }), null)).toEqual({ mode: 'city', city: TOKYO });
  });

  it('valeur cassée → géolocalisation, sans erreur', () => {
    for (const raw of [
      '{', 'null', '42', '"city"', '{"mode":"plage"}', '{"mode":"city"}',
      city({ tz: 'Mars/Olympus' }), city({ tz: undefined }), city({ lat: 95 }), city({ lon: -181 }), city({ lat: Number.NaN }),
      city({ name: '' }), city({ country: 3 }), city({ admin: 7 }),
    ]) expect(parseLocation(raw, 'off'), raw).toBe(GEO);
  });

  it('ne garde que les champs de la ville (population et champs inconnus écartés), région facultative', () => {
    expect(toSceneCity({ ...TOKYO, population: 9_000_000 })).toEqual(TOKYO);
    const { admin: _admin, ...noAdmin } = TOKYO;
    expect(toSceneCity(noAdmin)).toEqual(noAdmin);
    expect(parseLocation(JSON.stringify({ mode: 'city', city: { ...TOKYO, extra: 1 } }), null)).toEqual({ mode: 'city', city: TOKYO });
  });

  it('reconnaît un fuseau IANA valide', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isSceneCity(TOKYO)).toBe(true);
    expect(isSceneCity({ ...TOKYO, tz: 'Nulle/Part' })).toBe(false);
  });
});
```

- [ ] **Step 2: Écrire les tests du stockage (échouent)**

`tests/content/location-setting.test.ts` :

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';

const TOKYO = { name: 'Tokyo', admin: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };

beforeEach(() => {
  window.localStorage.clear();
  resetLocationForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('réglage du lieu de la scène', () => {
  it('migre depuis wmt:positionEnabled tant que la nouvelle clé manque', () => {
    window.localStorage.setItem('wmt:positionEnabled', 'off');
    expect(locationSetting.get()).toEqual({ mode: 'off' });
    window.localStorage.setItem('wmt:positionEnabled', 'on');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    window.localStorage.removeItem('wmt:positionEnabled');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
  });

  it('enregistre en JSON sous wmt:scene-location et n’écrit plus l’ancienne clé', () => {
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(JSON.parse(window.localStorage.getItem('wmt:scene-location')!)).toEqual({ mode: 'city', city: TOKYO });
    expect(window.localStorage.getItem('wmt:positionEnabled')).toBeNull();
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
  });

  it('rend le même objet tant que rien ne change (snapshot stable)', () => {
    expect(locationSetting.get()).toBe(locationSetting.get());
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(locationSetting.get()).toBe(locationSetting.get());
  });

  it('prévient les abonnés à chaque changement, pas pour la même valeur', () => {
    const listener = vi.fn();
    const stop = locationSetting.subscribe(listener);
    locationSetting.set({ mode: 'off' });
    locationSetting.set({ mode: 'off' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    locationSetting.set({ mode: 'geo' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('valeur illisible → géolocalisation', () => {
    window.localStorage.setItem('wmt:scene-location', '{"mode":"city","city":{"name":"X","country":"","lat":1,"lon":1,"tz":"Nulle/Part"}}');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
  });

  it('stockage refusé : le choix vaut pour la session, sans erreur', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refusé'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('refusé'); });
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
  });
});
```

- [ ] **Step 3: Rattacher les deux fichiers de test à la famille `scene-meteo`**

Dans `tests/familles.ts`, famille `scene-meteo` :
- ligne 111 : ajouter `'location-*'` à la liste `c(...)` (après `'scene-position.*'`) ;
- ligne 112 : ajouter `'scene-location.*'` à la liste `lib(...)` (après `'sky.*'`).

- [ ] **Step 4: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/scene-location.test.ts tests/content/location-setting.test.ts`
Expected: FAIL (modules absents).

- [ ] **Step 5: Écrire `src/core/library/scene-location.ts`**

```ts
// Lieu de la scène (spec 2026-10-14-lieu-scene §3.1) : géolocalisation de l'appareil, ville choisie ou désactivé.
export type SceneCity = { name: string; admin?: string; country: string; lat: number; lon: number; tz: string };
export type SceneLocation = { mode: 'geo' } | { mode: 'city'; city: SceneCity } | { mode: 'off' };

// Valeurs partagées : la même lecture rend le même objet (snapshot stable pour useSyncExternalStore).
export const GEO: SceneLocation = { mode: 'geo' };
export const OFF: SceneLocation = { mode: 'off' };

// Fuseau IANA connu du moteur JS de l'appareil (Intl lève une erreur sinon).
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string';
const inRange = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

export function isSceneCity(v: unknown): v is SceneCity {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isText(c.name) && c.name.trim() !== '' && isText(c.country) && (c.admin === undefined || isText(c.admin))
    && inRange(c.lat, 90) && inRange(c.lon, 180) && isText(c.tz) && isValidTimeZone(c.tz);
}

// Seuls les champs du réglage sont gardés : la population (homonymes) et tout champ inconnu sont écartés.
export const toSceneCity = (c: SceneCity & { population?: number }): SceneCity => ({
  name: c.name,
  ...(c.admin ? { admin: c.admin } : {}),
  country: c.country,
  lat: c.lat,
  lon: c.lon,
  tz: c.tz,
});

// Lecture tolérante : `raw` = clé wmt:scene-location ; tant qu'elle manque, `legacy` (ancien réglage wmt:positionEnabled) décide.
// Toute valeur illisible donne la géolocalisation (défaut), sans erreur.
export function parseLocation(raw: string | null, legacy: string | null): SceneLocation {
  if (raw === null) return legacy === 'off' ? OFF : GEO;
  try {
    const v = JSON.parse(raw) as { mode?: unknown; city?: unknown } | null;
    if (v?.mode === 'geo') return GEO;
    if (v?.mode === 'off') return OFF;
    if (v?.mode === 'city' && isSceneCity(v.city)) return { mode: 'city', city: toSceneCity(v.city) };
  } catch {
    // JSON cassé : défaut.
  }
  return GEO;
}
```

- [ ] **Step 6: Écrire `src/content/location-setting.ts`**

```ts
import { GEO, parseLocation, type SceneLocation } from '../core/library/scene-location';

const KEY = 'wmt:scene-location';
// Ancien réglage « Position » (Activé/Désactivé) : relu tant que la nouvelle clé manque, plus jamais écrit.
const LEGACY_KEY = 'wmt:positionEnabled';

const listeners = new Set<() => void>();
// Stockage refusé (fenêtre privée) : le choix reste respecté pour la session.
let memory: SceneLocation | null = null;
// Dernière lecture : mêmes textes stockés → même objet (snapshot stable pour useSyncExternalStore).
let last: { raw: string | null; legacy: string | null; value: SceneLocation } | null = null;

function read(): SceneLocation {
  let raw: string | null;
  let legacy: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
    legacy = raw === null ? window.localStorage.getItem(LEGACY_KEY) : null;
  } catch {
    return memory ?? GEO;
  }
  if (last && last.raw === raw && last.legacy === legacy) return last.value;
  const value = parseLocation(raw, legacy);
  last = { raw, legacy, value };
  return value;
}

// Réglage « Lieu de la scène » : un seul lieu pour toute la Bibliothèque, gardé sur l'appareil ; relu à chaque appel.
export const locationSetting = {
  get: read,
  set(next: SceneLocation): void {
    if (JSON.stringify(next) === JSON.stringify(read())) return;
    memory = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Stockage indisponible : la mémoire de session suffit.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

export function resetLocationForTests(): void {
  memory = null;
  last = null;
}
```

- [ ] **Step 7: Lancer les deux tests**

Run: `npx vitest run tests/core/library/scene-location.test.ts tests/content/location-setting.test.ts`
Expected: PASS.

- [ ] **Step 8: Brancher `scene-position.ts` (sens inchangé : géolocalisation ⇔ ancien « Activé »)**

- Ligne 2 : `import { positionSetting } from './position-setting';` → `import { locationSetting } from './location-setting';`
- Après la ligne 16 (`const fallback = …`), ajouter :

```ts
// Seul le mode Géolocalisation lit (et demande) la position de l'appareil.
const geoMode = (): boolean => locationSetting.get().mode === 'geo';
```

- Lignes 18-26 : remplacer `positionSetting.enabled()` par `geoMode()` (deux fois), commentaire ligne 18 : « Hors géolocalisation : la vraie position n'est plus lue (le fuseau horaire sert de repli) et celle déjà obtenue est ignorée. »
- Lignes 40-43 : `positionSetting.subscribe(() => {` → `locationSetting.subscribe(() => {` ; commentaire : « Les abonnés (heure, météo, commerces) se recalculent quand le joueur change de lieu. »
- Ligne 48 : `if (!positionSetting.enabled() || known !== null || askedThisPage) return;` → `if (!geoMode() || known !== null || askedThisPage) return;`
- Ligne 87 : `if (!positionSetting.enabled()) return resolve(currentPosition());` → `if (!geoMode()) return resolve(currentPosition());`

- [ ] **Step 9: Brancher `LibraryPanel.tsx`**

- Ligne 78 : `import { positionSetting } from './position-setting';` → `import { locationSetting } from './location-setting';`
- Lignes 453-459 deviennent (nom `sceneLocation` : `location` masquerait `window.location`) :

```ts
  // Lieu de la scène (géolocalisation par défaut) : en géolocalisation, la position est demandée une fois par chargement de page,
  // à l'ouverture de la Bibliothèque. Elle n'est gardée qu'en mémoire : sans cette relecture, la vraie météo resterait « simulée ».
  const sceneLocation = useSyncExternalStore(locationSetting.subscribe, locationSetting.get, locationSetting.get);
  const positionOn = sceneLocation.mode !== 'off';
  const failure = useSyncExternalStore(subscribePosition, positionFailure, positionFailure);
  useEffect(() => {
    if (sceneLocation.mode === 'geo') ensurePosition();
  }, [sceneLocation.mode]);
```

- Ligne 994 : `positionOn && failure` → `sceneLocation.mode === 'geo' && failure`.

- [ ] **Step 10: Brancher `PositionSettings.tsx` (deux boutons pour l'instant, trois choix en tâche 10)**

- Ligne 3 : `import { positionSetting } from './position-setting';` → 

```ts
import { GEO, OFF } from '../core/library/scene-location';
import { locationSetting } from './location-setting';
```

- Lignes 21-25 :

```ts
  const enabled = useSyncExternalStore(locationSetting.subscribe, locationSetting.get).mode !== 'off';
  const set = (next: boolean): void => {
    locationSetting.set(next ? GEO : OFF);
    track('reglage-modifie', 'position');
  };
```

- [ ] **Step 11: Supprimer l'ancien module et mettre à jour les tests qui l'utilisaient**

Run: `git rm src/content/position-setting.ts`

`tests/content/position-setting.test.tsx` :
- ligne 6 : `import { positionSetting } from '../../src/content/position-setting';` → `import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';`
- ligne 14 (dans `beforeEach`, après `resetPositionForTests();`) : ajouter `resetLocationForTests();`
- lignes 21-26 :

```tsx
  it('est en géolocalisation par défaut et mémorise le choix', () => {
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    locationSetting.set({ mode: 'off' });
    expect(locationSetting.get()).toEqual({ mode: 'off' });
    expect(window.localStorage.getItem('wmt:scene-location')).toBe('{"mode":"off"}');
  });
```

- lignes 37 et 50 : `positionSetting.setEnabled(false);` → `locationSetting.set({ mode: 'off' });`
- lignes 124 et 127 : `expect(positionSetting.enabled()).toBe(false);` → `expect(locationSetting.get().mode).toBe('off');` et `expect(positionSetting.enabled()).toBe(true);` → `expect(locationSetting.get().mode).toBe('geo');`

`tests/content/library-weather-ui.test.tsx` :
- ligne 6 : → `import { locationSetting } from '../../src/content/location-setting';`
- ligne 42 : ajouter à la suite `window.localStorage.removeItem('wmt:scene-location');`
- ligne 83 : `positionSetting.setEnabled(false);` → `locationSetting.set({ mode: 'off' });`
- ligne 88 : `positionSetting.setEnabled(true);` → `locationSetting.set({ mode: 'geo' });`

`tests/content/library-window-furniture.test.tsx` ligne 174 : ajouter à la suite `window.localStorage.removeItem('wmt:scene-location');` (le test ligne 188-191 garde l'ancienne clé `'off'` : il vérifie désormais la migration de bout en bout).

- [ ] **Step 12: Vérifier qu'aucun usage ne reste**

Run: `git grep -n "position-setting'\|positionSetting" -- src tests`
Expected: aucune ligne (les noms de fichiers de test `position-setting.test.tsx` restent, ils ne sont pas importés).

- [ ] **Step 13: Lancer types, tests de la tâche et familles**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/scene-location.test.ts tests/content/location-setting.test.ts tests/content/position-setting.test.tsx tests/content/scene-position.test.ts tests/content/library-weather-ui.test.tsx tests/content/library-window-furniture.test.tsx && npm run test:famille -- scene-meteo scene-piece`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/core/library/scene-location.ts src/content/location-setting.ts src/content/scene-position.ts src/content/LibraryPanel.tsx src/content/PositionSettings.tsx tests/familles.ts tests/core/library/scene-location.test.ts tests/content/location-setting.test.ts tests/content/position-setting.test.tsx tests/content/library-weather-ui.test.tsx tests/content/library-window-furniture.test.tsx
git commit -m "feat(bibliotheque): réglage lieu de la scène (géolocalisation, ville, désactivé) et migration de Position

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` de l'étape 11 a déjà indexé la suppression de `position-setting.ts`.)

---

### Task 2: Source unique du lieu en mode Ville (`scene-position.ts`)

**Files:**
- Modify: `src/content/scene-position.ts` (lignes 1-43 après la tâche 1)
- Test: `tests/content/scene-position.test.ts`

**Interfaces:**
- Consumes : `locationSetting` (tâche 1), `type SceneCity` (tâche 1).
- Produces : `currentPosition(): Position` (ville → ses coordonnées, même objet tant que la ville ne change pas), `isPositionKnown(): boolean` (ville → vrai), `sceneTimeZone(): string | null` (fuseau de la ville, sinon `null` = appareil), `resetPositionForTests()` (oublie aussi la ville mémorisée).

- [ ] **Step 1: Écrire les tests (échouent)**

Dans `tests/content/scene-position.test.ts` :
- ligne 3 : importer aussi `ensurePosition`, `sceneTimeZone`, `subscribePosition` ;
- ajouter `import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';` ;
- ligne 7 : `beforeEach(() => resetPositionForTests());` → `beforeEach(() => { window.localStorage.clear(); resetLocationForTests(); resetPositionForTests(); });`
- ajouter à la fin du fichier :

```ts
const TOKYO = { name: 'Tokyo', admin: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };

describe('lieu de la scène', () => {
  it('ville : coordonnées et fuseau de la ville, position connue, aucune demande à l’appareil', async () => {
    const getCurrentPosition = vi.fn();
    setGeo({ getCurrentPosition });
    locationSetting.set({ mode: 'city', city: TOKYO });
    expect(currentPosition()).toEqual({ lat: 35.69, lon: 139.69 });
    expect(currentPosition()).toBe(currentPosition());
    expect(isPositionKnown()).toBe(true);
    expect(sceneTimeZone()).toBe('Asia/Tokyo');
    ensurePosition();
    await requestPosition();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('géolocalisation : position obtenue sinon repli, fuseau de l’appareil', async () => {
    const tz = -new Date().getTimezoneOffset();
    expect(currentPosition()).toEqual({ lat: 45, lon: tz / 4 });
    expect(sceneTimeZone()).toBeNull();
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) });
    await requestPosition();
    expect(currentPosition()).toEqual({ lat: 48.85, lon: 2.35 });
    expect(isPositionKnown()).toBe(true);
  });

  it('désactivé : repli par fuseau, position inconnue, fuseau de l’appareil, aucune demande', async () => {
    const getCurrentPosition = vi.fn();
    setGeo({ getCurrentPosition });
    locationSetting.set({ mode: 'off' });
    const tz = -new Date().getTimezoneOffset();
    expect(currentPosition()).toEqual({ lat: 45, lon: tz / 4 });
    expect(isPositionKnown()).toBe(false);
    expect(sceneTimeZone()).toBeNull();
    await requestPosition();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('une position arrivée en mode Ville est gardée mais ignorée jusqu’au retour en géolocalisation', async () => {
    let answer: ((p: unknown) => void) | null = null;
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => { answer = ok; } });
    const pending = requestPosition();
    locationSetting.set({ mode: 'city', city: TOKYO });
    answer!({ coords: { latitude: 48.85, longitude: 2.35 } });
    await pending;
    expect(currentPosition()).toEqual({ lat: 35.69, lon: 139.69 });
    locationSetting.set({ mode: 'geo' });
    expect(currentPosition()).toEqual({ lat: 48.85, lon: 2.35 });
    expect(isPositionKnown()).toBe(true);
  });

  it('changer de lieu prévient les abonnés (heure, météo, commerces, bus, département)', () => {
    const listener = vi.fn();
    const stop = subscribePosition(listener);
    locationSetting.set({ mode: 'city', city: TOKYO });
    locationSetting.set({ mode: 'city', city: { ...TOKYO, name: 'Osaka', lat: 34.69, lon: 135.5 } });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(currentPosition()).toEqual({ lat: 34.69, lon: 135.5 });
    stop();
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/scene-position.test.ts`
Expected: FAIL (`sceneTimeZone` n'existe pas ; en mode Ville la position reste le repli).

- [ ] **Step 3: Implémenter**

Dans `src/content/scene-position.ts`, remplacer tout le haut du fichier (de la ligne 1 jusqu'au bloc `locationSetting.subscribe(...)` inclus) par :

```ts
import type { SceneCity } from '../core/library/scene-location';
import { positionFromTimezone, type Position } from '../core/library/sky';
import { locationSetting } from './location-setting';

// Source unique du lieu de la scène (spec lieu §3.2) : ville choisie, position de l'appareil ou repli par fuseau.
// La position de l'appareil n'est jamais enregistrée telle quelle : seule sa case de 0,1° part au relais (météo, commerces, bus).
let known: Position | null = null;
let cachedFallback: Position | null = null;
// Coordonnées de la ville, mémorisées par ville : useSyncExternalStore exige un snapshot stable entre deux lectures.
let cityPos: { city: SceneCity; pos: Position } | null = null;
const listeners = new Set<() => void>();
// Dernière raison d'échec, affichée à côté de « (simulée) » : sans elle, impossible de savoir pourquoi la météo reste simulée.
export type PositionFailure = 'denied' | 'unavailable' | 'timeout' | 'absent' | 'off';
let failure: PositionFailure | null = null;
export function positionFailure(): PositionFailure | null {
  return failure;
}

// Repli mémorisé : useSyncExternalStore exige un snapshot stable entre deux lectures.
const fallback = (): Position => (cachedFallback ??= positionFromTimezone(-new Date().getTimezoneOffset()));
// Seul le mode Géolocalisation lit (et demande) la position de l'appareil.
const geoMode = (): boolean => locationSetting.get().mode === 'geo';
function cityPosition(city: SceneCity): Position {
  if (cityPos?.city !== city) cityPos = { city, pos: { lat: city.lat, lon: city.lon } };
  return cityPos.pos;
}

// Ville : ses coordonnées. Géolocalisation : la position obtenue, sinon le repli par fuseau ; une position arrivée pendant un autre
// mode est gardée en mémoire pour le retour en géolocalisation. Désactivé : le repli.
export function currentPosition(): Position {
  const location = locationSetting.get();
  if (location.mode === 'city') return cityPosition(location.city);
  return (location.mode === 'geo' ? known : null) ?? fallback();
}

// Vrai si le lieu est réel (ville choisie, ou position donnée par l'appareil) : ouvre la météo réelle, les commerces, les bus et le
// département. Le repli par fuseau ne suffit pas.
export function isPositionKnown(): boolean {
  const location = locationSetting.get();
  return location.mode === 'city' || (location.mode === 'geo' && known !== null);
}

// Fuseau IANA de la scène : celui de la ville choisie, sinon null (fuseau de l'appareil).
export function sceneTimeZone(): string | null {
  const location = locationSetting.get();
  return location.mode === 'city' ? location.city.tz : null;
}

export function subscribePosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function resetPositionForTests(): void {
  known = null;
  cachedFallback = null;
  cityPos = null;
  askedThisPage = false;
  failure = null;
}

// Les abonnés (heure, météo, commerces, bus, département) se recalculent quand le joueur change de lieu.
locationSetting.subscribe(() => {
  for (const listener of listeners) listener();
});
```

Le reste du fichier (`askedThisPage`, `ensurePosition`, pont Android, `requestPosition`, `fail`) reste celui de la tâche 1 (`geoMode()` aux deux gardes).

- [ ] **Step 4: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/scene-position.test.ts tests/content/position-setting.test.tsx && npm run test:famille -- scene-meteo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/scene-position.ts tests/content/scene-position.test.ts
git commit -m "feat(bibliotheque): la position de la scène suit la ville choisie (fuseau, aucune demande à l'appareil)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Heure de la scène dans le fuseau de la ville (`scene-clock.ts`)

**Files:**
- Create: `src/core/library/scene-clock.ts`
- Modify: `src/core/library/clock-cities.ts:154-165` (déplacement de `tzOffsetMinutes`), `src/core/library/time-setting.ts:1-15`, `src/content/use-scene-time.ts:1-32`, `tests/familles.ts:79`
- Test: `tests/core/library/scene-clock.test.ts` (nouveau), `tests/core/library/time-setting.test.ts`, `tests/content/use-scene-time.test.tsx`

**Interfaces:**
- Consumes : `sceneTimeZone()`, `subscribePosition` (tâche 2) ; `locationSetting` (tâche 1, dans les tests).
- Produces : `localClock(now: Date, tz: string | null): LocalClock` avec `type LocalClock = { minutes: number; seconds: number; date: YMD; offsetMin: number }` ; `tzOffsetMinutes(tz: string, at: Date): number` (désormais dans `scene-clock.ts`, toujours ré-exporté par `clock-cities.ts`) ; `minutesFor(setting, now, tz: string | null = null)` ; `SceneTime` gagne `tz: string | null`.

- [ ] **Step 1: Écrire les tests de `localClock` (échouent)**

`tests/core/library/scene-clock.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { localClock } from '../../../src/core/library/scene-clock';

describe('localClock', () => {
  it('Tokyo est à +7 h de Paris en octobre et +8 h en janvier', () => {
    const oct = new Date('2026-10-14T10:00:00Z');
    const jan = new Date('2026-01-14T10:00:00Z');
    expect(localClock(oct, 'Asia/Tokyo').minutes - localClock(oct, 'Europe/Paris').minutes).toBe(7 * 60);
    expect(localClock(jan, 'Asia/Tokyo').minutes - localClock(jan, 'Europe/Paris').minutes).toBe(8 * 60);
  });

  it('passe minuit : 22 h à Paris donne 5 h le lendemain à Tokyo, avec la date du lendemain', () => {
    const now = new Date('2026-10-14T20:00:00Z');
    expect(localClock(now, 'Europe/Paris')).toMatchObject({ minutes: 22 * 60, date: { y: 2026, m: 10, d: 14 }, offsetMin: 120 });
    expect(localClock(now, 'Asia/Tokyo')).toMatchObject({ minutes: 5 * 60, date: { y: 2026, m: 10, d: 15 }, offsetMin: 540 });
  });

  it('fuseau à demi-heure : l’Inde est à UTC+5 h 30', () => {
    const now = new Date('2026-10-14T20:00:00Z');
    expect(localClock(now, 'Asia/Kolkata')).toMatchObject({ minutes: 90, date: { y: 2026, m: 10, d: 15 }, offsetMin: 330 });
  });

  it('les secondes sont les mêmes dans tous les fuseaux', () => {
    const now = new Date('2026-10-14T20:00:42Z');
    for (const tz of ['Asia/Tokyo', 'Asia/Kolkata', 'America/St_Johns', null]) expect(localClock(now, tz).seconds).toBe(42);
  });

  it('changement d’heure : Paris passe de +2 h à +1 h le 25 octobre 2026', () => {
    expect(localClock(new Date('2026-10-25T00:59:00Z'), 'Europe/Paris').offsetMin).toBe(120);
    expect(localClock(new Date('2026-10-25T01:00:00Z'), 'Europe/Paris')).toMatchObject({ minutes: 2 * 60, offsetMin: 60 });
  });

  it('sans fuseau : l’heure, la date et le décalage de l’appareil', () => {
    const now = new Date(2026, 9, 14, 10, 11, 5);
    expect(localClock(now, null)).toEqual({ minutes: 611, seconds: 5, date: { y: 2026, m: 10, d: 14 }, offsetMin: -now.getTimezoneOffset() });
  });
});
```

Dans `tests/familles.ts` ligne 79 (famille `scene-commun`), ajouter `'scene-clock.*'` à la liste `lib(...)` (après `'time-setting.*'`).

- [ ] **Step 2: Écrire les tests de `minutesFor` et `useSceneTime` (échouent)**

Dans `tests/core/library/time-setting.test.ts`, dans `describe('minutesFor', …)` :

```ts
  it('réelle avec un fuseau : l’heure de ce fuseau', () => {
    const at = new Date('2026-10-14T20:00:00Z');
    expect(minutesFor({ mode: 'real' }, at, 'Asia/Tokyo')).toBe(5 * 60);
    expect(minutesFor({ mode: 'manual', minutes: 301 }, at, 'Asia/Tokyo')).toBe(301);
  });
```

Dans `tests/content/use-scene-time.test.tsx` : ajouter les imports

```tsx
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';
import { resetPositionForTests } from '../../src/content/scene-position';
```

dans `beforeEach` (avant `container = …`) : `window.localStorage.clear(); resetLocationForTests(); resetPositionForTests();` ; dans `afterEach` : `window.localStorage.clear();` ; puis dans `describe('useSceneTime', …)` :

```tsx
  it('ville : minutes, date et lever/coucher de la ville (Tokyo vu depuis n’importe quel appareil)', () => {
    vi.setSystemTime(new Date('2026-10-14T20:00:00Z'));
    locationSetting.set({ mode: 'city', city: { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' } });
    act(() => root.render(<Probe setting={{ mode: 'real' }} />));
    expect(last!.minutes).toBe(5 * 60);
    expect(last!.date).toEqual({ y: 2026, m: 10, d: 15 });
    expect(last!.tz).toBe('Asia/Tokyo');
    const t = last!.times;
    expect(t.kind).toBe('normal');
    if (t.kind === 'normal') {
      // Tokyo le 15 octobre : lever vers 5 h 45, coucher vers 17 h 10 (heure de Tokyo).
      expect(t.sunrise).toBeGreaterThan(5 * 60 + 30);
      expect(t.sunrise).toBeLessThan(6 * 60);
      expect(t.sunset).toBeGreaterThan(16 * 60 + 55);
      expect(t.sunset).toBeLessThan(17 * 60 + 25);
    }
  });

  it('changer de lieu recalcule l’heure sans attendre la relecture des 30 s', () => {
    vi.setSystemTime(new Date('2026-10-14T20:00:00Z'));
    act(() => root.render(<Probe setting={{ mode: 'real' }} />));
    expect(last!.tz).toBeNull();
    act(() => locationSetting.set({ mode: 'city', city: { name: 'Bombay', country: 'Inde', lat: 19.08, lon: 72.88, tz: 'Asia/Kolkata' } }));
    expect(last!.minutes).toBe(90);
    expect(last!.tz).toBe('Asia/Kolkata');
  });
```

- [ ] **Step 3: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/scene-clock.test.ts tests/core/library/time-setting.test.ts tests/content/use-scene-time.test.tsx`
Expected: FAIL (module `scene-clock` absent, `tz` absent de `SceneTime`).

- [ ] **Step 4: Écrire `src/core/library/scene-clock.ts` et y déplacer `tzOffsetMinutes`**

```ts
import type { YMD } from './city/calendar';

// Heure locale d'un fuseau IANA (null = appareil), calculée sur l'appareil par Intl, sans réseau (spec lieu §3.3).

// Décalage d'un fuseau sur UTC à l'instant donné, en minutes (heure d'été comprise). Formateurs mis en cache par fuseau.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMinutes(tz: string, at: Date): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    formatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

export type LocalClock = { minutes: number; seconds: number; date: YMD; offsetMin: number };

// Minute du jour (0 à 1439), seconde, date et décalage sur UTC d'un fuseau à l'instant `now`. Passage de minuit et changement d'heure
// gérés par Intl ; les secondes sont les mêmes dans tous les fuseaux (décalages à la minute près).
export function localClock(now: Date, tz: string | null): LocalClock {
  if (tz === null) {
    return { minutes: now.getHours() * 60 + now.getMinutes(), seconds: now.getSeconds(), date: { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, offsetMin: -now.getTimezoneOffset() };
  }
  const offsetMin = tzOffsetMinutes(tz, now);
  const shifted = new Date(now.getTime() + offsetMin * 60_000);
  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    seconds: now.getUTCSeconds(),
    date: { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() },
    offsetMin,
  };
}
```

Dans `src/core/library/clock-cities.ts`, supprimer les lignes 154-165 (commentaire, `formatters` et `tzOffsetMinutes`) et ajouter en tête, après la ligne 1 :

```ts
import { tzOffsetMinutes } from './scene-clock';

// Décalage d'un fuseau : calculé par l'heure de la scène (scene-clock.ts), ré-exporté pour les horloges.
export { tzOffsetMinutes };
```

- [ ] **Step 5: `minutesFor` dans le fuseau de la scène**

`src/core/library/time-setting.ts` lignes 1-15 :

```ts
import type { TimeSetting } from './library-types';
import { localClock } from './scene-clock';

// Minute locale (0 à 1439) que montre la Bibliothèque : réelle (dans le fuseau de la scène, `tz` null = appareil), jour forcé (midi),
// nuit forcée (minuit) ou choisie.
export function minutesFor(setting: TimeSetting, now: Date, tz: string | null = null): number {
  switch (setting.mode) {
    case 'real':
      return localClock(now, tz).minutes;
    case 'day':
      return 720;
    case 'night':
      return 0;
    case 'manual':
      return setting.minutes;
  }
}
```

- [ ] **Step 6: `useSceneTime` dans le fuseau de la scène**

Remplacer `src/content/use-scene-time.ts` lignes 1-32 par :

```ts
import { useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import type { YMD } from '../core/library/city/calendar';
import type { TimeSetting } from '../core/library/library-types';
import { localClock } from '../core/library/scene-clock';
import { skyAt, sunTimes, type Sky, type SunTimes } from '../core/library/sky';
import { minutesFor } from '../core/library/time-setting';
import { currentPosition, sceneTimeZone, subscribePosition } from './scene-position';

// `date` : jour local de la scène (stable tant qu'il ne change pas) ; `mode` : réglage d'heure (réelle, jour, nuit, manuelle) ;
// `tz` : fuseau de la scène (ville choisie) ou null (appareil).
export type SceneTime = { minutes: number; sky: Sky; times: SunTimes; date: YMD; mode: TimeSetting['mode']; tz: string | null };

// Minute courante, ciel, heures de lever/coucher et date du jour, dans le fuseau de la scène. En heure réelle la minute est relue toutes
// les 30 s ; un changement de lieu (abonnés de la position) recalcule tout aussitôt.
export function useSceneTime(setting: TimeSetting): SceneTime {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (setting.mode !== 'real') return;
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, [setting.mode]);
  // La position change quand le joueur accorde la géolocalisation ou choisit une ville ; lue à l'identique tant qu'elle ne change pas.
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const tz = useSyncExternalStore(subscribePosition, sceneTimeZone, sceneTimeZone);
  const clock = localClock(now, tz);
  const minutes = minutesFor(setting, now, tz);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const date = useMemo<YMD>(() => clock.date, [clock.date.y, clock.date.m, clock.date.d]);
  const mode = setting.mode;
  const offsetMin = clock.offsetMin;
  return useMemo(() => {
    const times = sunTimes(date, position, offsetMin);
    return { minutes, times, sky: skyAt(minutes, times), date, mode, tz };
    // `now` n'entre que par la date et le décalage du fuseau : la minute vient de `minutes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, position.lat, position.lon, date, mode, offsetMin, tz]);
}
```

- [ ] **Step 7: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/scene-clock.test.ts tests/core/library/time-setting.test.ts tests/content/use-scene-time.test.tsx tests/core/library/clock-cities.test.ts && npm run test:famille -- scene-commun`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/library/scene-clock.ts src/core/library/clock-cities.ts src/core/library/time-setting.ts src/content/use-scene-time.ts tests/familles.ts tests/core/library/scene-clock.test.ts tests/core/library/time-setting.test.ts tests/content/use-scene-time.test.tsx
git commit -m "feat(bibliotheque): l'heure, la date et le soleil de la scène suivent le fuseau de la ville

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Les horloges suivent le fuseau de la scène

**Files:**
- Modify: `src/core/library/clock-cities.ts` (fonctions `cityMinutes` et `cityClock`, fin du fichier), `src/content/RoomView.tsx:54-63`, `src/content/deco-live.tsx:18,22-37,47-53,76-80`, `src/content/LibraryPanel.tsx:324-334,1192-1197`, `src/content/CityPickerDialog.tsx:8-16,40`
- Test: `tests/core/library/clock-cities.test.ts`, `tests/content/library-deco-scene-tz.test.tsx` (nouveau, motif `library-deco*` de `scene-piece`)

**Interfaces:**
- Consumes : `localClock`, `tzOffsetMinutes` (tâche 3) ; `SceneTime.tz` (tâche 3) ; `locationSetting` (tâche 1, tests).
- Produces : `cityMinutes(sceneMinutes, tz, now, sceneTz: string | null = null)`, `cityClock(sceneMinutes, city, now, live = false, sceneTz: string | null = null)` ; `SceneView.tz?: string | null` ; `DecoScene.tz: string | null` ; prop `sceneTz: string | null` de `CityPickerDialog`.

- [ ] **Step 1: Écrire les tests purs (échouent)**

Dans `tests/core/library/clock-cities.test.ts`, ajouter à la fin du `describe('villes des horloges', …)` :

```ts
  describe('scène dans un autre fuseau que l’appareil', () => {
    // 2026-10-14 08:10:42 UTC : 10:10 à Paris, 17:10 à Tokyo, 04:10 à New York.
    const now = new Date('2026-10-14T08:10:42Z');

    it('une horloge réglée sur Paris quand la scène est à Tokyo donne l’heure de Paris', () => {
      expect(cityMinutes(17 * 60 + 10, 'Europe/Paris', now, 'Asia/Tokyo')).toBe(10 * 60 + 10);
      expect(cityClock(17 * 60 + 10, { name: 'Paris', tz: 'Europe/Paris' }, now, false, 'Asia/Tokyo')).toEqual({ h: 10, m: 10, s: 42, live: false });
    });

    it('en heure réelle, l’horloge « heure de la scène » lit l’heure de la ville de la scène', () => {
      expect(cityClock(0, undefined, now, true, 'Asia/Tokyo')).toEqual({ h: 17, m: 10, s: 42, live: true });
      expect(cityClock(0, { name: 'New York', tz: 'America/New_York' }, now, true, 'Asia/Tokyo')).toEqual({ h: 4, m: 10, s: 42, live: true });
    });

    it('heure figée à 14:00 à Tokyo : Paris affiche 07:00 (écart Tokyo-Paris, pas appareil-Paris)', () => {
      expect(cityClock(14 * 60, { name: 'Paris', tz: 'Europe/Paris' }, now, false, 'Asia/Tokyo')).toEqual({ h: 7, m: 0, s: 42, live: false });
    });
  });
```

- [ ] **Step 2: Écrire le test dans la pièce (échoue)**

`tests/content/library-deco-scene-tz.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';
import { resetPositionForTests } from '../../src/content/scene-position';
import { createMemoryStore } from '../../src/core/cache/store';
import { setTimeSetting, updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const label = (id: string) => container.querySelector(`[data-id="${id}"] [data-time]`)!.getAttribute('data-time');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  // 08:10 UTC : 10:10 à Paris, 17:10 à Tokyo, quel que soit le fuseau de la machine de test.
  vi.setSystemTime(new Date('2026-10-14T08:10:00Z'));
  // Ville connue : commerces, bus, département et calendrier interrogeraient le relais ; on répond « indisponible ».
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 503 })));
  window.localStorage.clear();
  resetLocationForTests();
  resetPositionForTests();
  locationSetting.set({ mode: 'city', city: { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, (l) => [...l,
    { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
    { id: 'c2', kind: 'deco', deco: 'digital-clock', col: 6, row: 1, city: { name: 'Paris', tz: 'Europe/Paris' } },
  ]));
  await settle();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('horloges quand la scène est à Tokyo', () => {
  it('« heure de la scène » = heure de Tokyo ; l’horloge réglée sur Paris = heure de Paris', () => {
    expect(label('c1')).toBe('17:10');
    expect(label('c2')).toBe('10:10');
  });

  it('heure choisie 14:00 : la scène affiche 14:00 et Paris 07:00', async () => {
    await repo.update((s) => setTimeSetting(s, { mode: 'manual', minutes: 14 * 60 }));
    await settle();
    expect(label('c1')).toBe('14:00');
    expect(label('c2')).toBe('07:00');
  });
});
```

- [ ] **Step 3: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/clock-cities.test.ts tests/content/library-deco-scene-tz.test.tsx`
Expected: FAIL (les horloges décalent depuis l'appareil).

- [ ] **Step 4: `cityMinutes` / `cityClock`**

Dans `src/core/library/clock-cities.ts` : ligne d'import de la tâche 3 → `import { localClock, tzOffsetMinutes } from './scene-clock';` ; remplacer les deux fonctions de fin de fichier par :

```ts
// Heure d'une ville : heure de la scène décalée de l'écart entre la ville et le fuseau de la scène (`sceneTz` : ville du lieu de la
// scène, null = appareil).
export function cityMinutes(sceneMinutes: number, tz: string, now: Date, sceneTz: string | null = null): number {
  const delta = tzOffsetMinutes(tz, now) - localClock(now, sceneTz).offsetMin;
  return (((sceneMinutes + delta) % 1440) + 1440) % 1440;
}

// `live` (heure réelle) : heures et minutes lues sur `now` dans le fuseau de la scène (la seconde de l'appareil) et non sur la minute
// de la scène, relue toutes les 30 s : l'horloge change de minute à la seconde près. Heure figée (jour, nuit, manuelle) : l'heure de la
// scène, l'aiguille des minutes n'avance pas avec les secondes (`live` faux) ; les secondes, elles, viennent toujours de l'appareil.
export function cityClock(sceneMinutes: number, city: CityTime | undefined, now: Date, live = false, sceneTz: string | null = null): { h: number; m: number; s: number; live: boolean } {
  const base = live ? localClock(now, sceneTz).minutes : sceneMinutes;
  const m = city ? cityMinutes(base, city.tz, now, sceneTz) : ((Math.round(base) % 1440) + 1440) % 1440;
  return { h: Math.floor(m / 60), m: m % 60, s: now.getSeconds(), live };
}
```

- [ ] **Step 5: Faire passer le fuseau jusqu'aux horloges**

`src/content/RoomView.tsx`, type `SceneView` (lignes 54-63), après `mode?: TimeSetting['mode'];` :

```ts
  // Fuseau de la scène (ville du lieu de la scène) ; absent ou null = appareil. Les horloges décalent depuis lui.
  tz?: string | null;
```

`src/content/LibraryPanel.tsx`, mémo `sceneView` (lignes 324-334) : ajouter `tz: sceneTime.tz,` après `mode: sceneTime.mode,` et `sceneTime.tz` dans la liste des dépendances (après `sceneTime.mode`).

`src/content/deco-live.tsx` :
- ligne 18 : `export type DecoScene = { minutes: number; live: boolean; tz: string | null; weather: DecoWeather; daylight: number; editing: boolean };`
- dans `useDecoScene`, objet rendu : ajouter `tz: view?.tz ?? null,` après `live: …` ; dépendances : ajouter `view?.tz` après `view?.mode`.
- ligne 50 : `time: cityClock(scene.minutes, city, new Date(clockNowMs()), scene.live)` → `time: cityClock(scene.minutes, city, new Date(clockNowMs()), scene.live, scene.tz)`.
- ligne 78 (`tableFaceContent`) : la clé devient ``const key = `${item}|${city?.name ?? ''}|${city?.tz ?? ''}|${style}|${scene.live ? 'live' : scene.minutes}|${scene.tz ?? ''}|${w.state}|${w.label}|${w.tempC}|${w.night}`;``

`src/content/CityPickerDialog.tsx` :
- type `Props` (lignes 8-13) : ajouter `sceneTz: string | null;` après `sceneMinutes: number;` ;
- ligne 16 : `export function CityPickerDialog({ current, sceneMinutes, sceneTz, onChoose, onClose }: Props): ReactElement {`
- ligne 40 : `formatMinutes(cityMinutes(sceneMinutes, c.tz, now))` → `formatMinutes(cityMinutes(sceneMinutes, c.tz, now, sceneTz))`.

`src/content/LibraryPanel.tsx` lignes 1192-1197 : ajouter `sceneTz={sceneTime.tz}` après `sceneMinutes={sceneTime.minutes}`.

- [ ] **Step 6: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/clock-cities.test.ts tests/content/library-deco-scene-tz.test.tsx tests/content/library-deco-room.test.tsx tests/content/library-deco-dialogs.test.tsx && npm run test:famille -- scene-piece`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/library/clock-cities.ts src/content/RoomView.tsx src/content/deco-live.tsx src/content/LibraryPanel.tsx src/content/CityPickerDialog.tsx tests/core/library/clock-cities.test.ts tests/content/library-deco-scene-tz.test.tsx
git commit -m "feat(bibliotheque): les horloges décalent depuis le fuseau de la scène

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Le cache de la météo réelle garde sa cellule (correctif spec §6)

**Files:**
- Modify: `src/core/library/weather/weather-real.ts:40-41,59-67,77-78,90-91,108`
- Test: `tests/core/library/weather-real.test.ts:101-121`

**Interfaces:**
- Produces : stockage `wmt:weather-real` = `{ at: number; obs: RealObservation; cell: string }` ; `createRealWeather` inchangé dans sa forme.

> Décision validée le 2026-10-14 (spec §6) : la case de 0,1° est enregistrée avec l'observation. Le test actuel « n'enregistre jamais la position (ni case, ni coordonnées) » (lignes 112-121) est remplacé par « n'enregistre que la case de 0,1°, jamais les coordonnées exactes ».

- [ ] **Step 1: Remplacer les tests des lignes 101-121 (échouent)**

```ts
  it('à la réouverture, une observation de moins de 15 min pour la même case est reprise sans requête', async () => {
    const storage = memory();
    const first = createRealWeather({ fetch: async () => ok(), now: () => 0, storage });
    await first.refresh(paris);
    const fetchFn = vi.fn(async (_url: string) => ok());
    const second = createRealWeather({ fetch: fetchFn, now: () => 14 * 60_000, storage });
    expect(second.latest()?.code).toBe(61);
    expect((await second.refresh(paris))?.code).toBe(61);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('à la réouverture, une autre case ou une observation de plus de 15 min relit le relais', async () => {
    const storage = memory();
    await createRealWeather({ fetch: async () => ok(), now: () => 0, storage }).refresh(paris);
    const elsewhere = vi.fn(async (_url: string) => ok());
    await createRealWeather({ fetch: elsewhere, now: () => 60_000, storage }).refresh({ lat: 35.69, lon: 139.69 });
    expect(elsewhere).toHaveBeenCalledTimes(1);
    const late = vi.fn(async (_url: string) => ok());
    await createRealWeather({ fetch: late, now: () => 60_000 + 16 * 60_000, storage }).refresh({ lat: 35.69, lon: 139.69 });
    expect(late).toHaveBeenCalledTimes(1);
  });
  it('ancien format sans case : relu comme périmé (une requête)', async () => {
    const storage = memory();
    storage.set('wmt:weather-real', JSON.stringify({ at: 0, obs: { code: 3, tempC: 9, cloud: 80, precipMm: 0, windKmh: 5, visibilityM: 20000 } }));
    const fetchFn = vi.fn(async (_url: string) => ok());
    const real = createRealWeather({ fetch: fetchFn, now: () => 60_000, storage });
    expect(real.latest()?.code).toBe(3);
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('n’enregistre que la case de 0,1°, jamais les coordonnées exactes', async () => {
    const values = new Map<string, string>();
    const storage = { get: (k: string) => values.get(k) ?? null, set: (k: string, v: string) => void values.set(k, v) };
    const real = createRealWeather({ fetch: async () => ok(), now: () => 0, storage });
    await real.refresh({ lat: 43.6047, lon: 1.4442 });
    const written = [...values.values()].join(' ');
    expect(JSON.parse(values.get('wmt:weather-real')!)).toMatchObject({ at: 0, cell: '43.6,1.4' });
    expect(written).not.toMatch(/43\.60|1\.44|"lat"|"lon"/);
  });
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/weather-real.test.ts`
Expected: FAIL (la cellule n'est qu'en mémoire : requête à la réouverture, pas de `cell` stocké).

- [ ] **Step 3: Implémenter**

Dans `src/core/library/weather/weather-real.ts` :
- lignes 40-41 :

```ts
// Instant, observation et case de 0,1° (spec lieu §6) : à la réouverture, une observation fraîche de la même case est reprise sans
// requête. `cell` null : ancien format, relu comme périmé.
type Saved = { at: number; obs: RealObservation; cell: string | null };
```

- dans `parseSaved` (lignes 59-67) : `const s = JSON.parse(text) as { at?: unknown; obs?: Record<string, unknown> | null; cell?: unknown };` et la dernière ligne devient :

```ts
  const savedCell = typeof s.cell === 'string' && /^-?\d+\.\d,-?\d+\.\d$/.test(s.cell) ? s.cell : null;
  return { at: s.at, obs, cell: savedCell };
```

- supprimer les lignes 77-78 (commentaire et `let savedCell: string | null = null;`) ;
- lignes 90-91 : `saved = { at: deps.now(), obs };` + `savedCell = cell(pos);` → `saved = { at: deps.now(), obs, cell: cell(pos) };`
- ligne 108 : `if (saved && savedCell === cell(pos) && deps.now() - saved.at < FRESH_MS)` → `if (saved && saved.cell === cell(pos) && deps.now() - saved.at < FRESH_MS)`

- [ ] **Step 4: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/weather-real.test.ts tests/content/use-weather.test.tsx && npm run test:famille -- scene-meteo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/weather/weather-real.ts tests/core/library/weather-real.test.ts
git commit -m "fix(bibliotheque): la météo réelle mémorisée garde sa case et n'est plus redemandée à chaque ouverture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Route `/geocode` du relais

**Files:**
- Create: `relay/src/geocode.ts`
- Modify: `relay/src/index.ts:12,95,141`
- Test: `tests/relay/geocode.test.ts` (nouveau, famille `relais` par `tests/relay/**`), `tests/relay/index.test.ts`

**Interfaces:**
- Produces : `proxyGeocode(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult>`, `resetGeocodeCacheForTests(): void` ; réponse `{ ok: true, cities: Array<{ name: string; admin?: string; country: string; lat: number; lon: number; tz: string; population?: number }> }`.

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/relay/geocode.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyGeocode, resetGeocodeCacheForTests } from '../../relay/src/geocode';

const upstream = {
  results: [
    { name: 'Angers', admin1: 'Pays de la Loire', country: 'France', latitude: 47.47156, longitude: -0.55202, timezone: 'Europe/Paris', population: 152960 },
    { name: 'Angers', admin1: 'Québec', country: 'Canada', latitude: 45.50011, longitude: -75.48283, timezone: 'America/Toronto' },
    { name: 'Sans fuseau', country: 'Nulle part', latitude: 1, longitude: 1 },
    { name: 'Sans pays', latitude: -75.1, longitude: 123.35, timezone: 'Antarctica/McMurdo' },
  ],
};
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const call = (q: string, deps: { fetch: (url: string) => Promise<Response>; now?: () => number }) =>
  proxyGeocode(new URL(`https://relais.test/geocode?q=${encodeURIComponent(q)}`), { fetch: deps.fetch, now: deps.now ?? (() => 0) });

beforeEach(() => resetGeocodeCacheForTests());

describe('proxyGeocode', () => {
  it('refuse un texte de moins de 2 ou de plus de 60 caractères (après trim)', async () => {
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    for (const q of ['', ' ', ' a ', 'x'.repeat(61)]) expect((await call(q, { fetch: fetchFn })).status, q).toBe(400);
    expect((await proxyGeocode(new URL('https://relais.test/geocode'), { fetch: fetchFn, now: () => 0 })).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await call('Ay', { fetch: fetchFn })).status).toBe(200);
    expect((await call('x'.repeat(60), { fetch: fetchFn })).status).toBe(200);
  });

  it('interroge Open-Meteo en français et rend une liste réduite, arrondie à 0,01°, sans les résultats sans fuseau', async () => {
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    const out = await call('  Angers ', { fetch: fetchFn });
    expect(out.status).toBe(200);
    const sent = new URL(fetchFn.mock.calls[0]![0]);
    expect(sent.origin + sent.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(Object.fromEntries(sent.searchParams)).toEqual({ name: 'Angers', count: '8', language: 'fr', format: 'json' });
    expect(JSON.parse(out.body)).toEqual({
      ok: true,
      cities: [
        { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris', population: 152960 },
        { name: 'Angers', admin: 'Québec', country: 'Canada', lat: 45.5, lon: -75.48, tz: 'America/Toronto' },
        { name: 'Sans pays', country: '', lat: -75.1, lon: 123.35, tz: 'Antarctica/McMurdo' },
      ],
    });
  });

  it('aucun résultat (pas de clé « results ») : liste vide', async () => {
    const out = await call('Zzzzqx', { fetch: async () => reply({ generationtime_ms: 0.3 }) });
    expect(JSON.parse(out.body)).toEqual({ ok: true, cities: [] });
  });

  it('met en cache 24 h par texte normalisé (minuscules, sans accents)', async () => {
    let now = 1_000_000;
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    await call('Évry', { fetch: fetchFn, now: () => now });
    await call('  evry ', { fetch: fetchFn, now: () => now });
    await call('ÉVRY', { fetch: fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 24 * 3_600_000 + 1;
    await call('Évry', { fetch: fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('garde au plus 500 textes en cache', async () => {
    const fetchFn = vi.fn(async (_url: string) => reply(upstream));
    for (let i = 0; i < 501; i += 1) await call(`ville ${i}`, { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(501);
    await call('ville 0', { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(502);
  });

  it('amont en panne ou réponse illisible → 502 upstream ; 429 relayé avec son délai', async () => {
    const down = await call('Paris', { fetch: async () => { throw new Error('x'); } });
    expect(down.status).toBe(502);
    expect(JSON.parse(down.body)).toEqual({ ok: false, reason: 'upstream' });
    expect((await call('Lyon', { fetch: async () => new Response('pas du json', { status: 200 }) })).status).toBe(502);
    expect((await call('Nice', { fetch: async () => reply({ results: 'x' }) })).status).toBe(502);
    expect((await call('Metz', { fetch: async () => reply({}, 500) })).status).toBe(502);
    const limited = await call('Caen', { fetch: async () => reply({ reason: 'trop' }, 429, { 'retry-after': '30' }) });
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe('30');
  });
});
```

Dans `tests/relay/index.test.ts`, dans `describe('routes de transmission', …)`, après le test `/weather` :

```ts
  it('/geocode valide le texte, garde le CORS et limite le débit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));
    const short = await call('/geocode?q=a');
    expect(short.status).toBe(400);
    expect(short.headers.get('access-control-allow-origin')).toBe('*');
    expect(await (await call('/geocode?q=Angers')).json()).toEqual({ ok: true, cities: [] });
    const same = { headers: { 'cf-connecting-ip': '192.0.2.78' } };
    const send = () => worker.fetch(new Request('https://relais.test/geocode?q=Tokyo', same), env);
    for (let i = 0; i < 60; i += 1) expect((await send()).status).not.toBe(429);
    expect((await send()).status).toBe(429);
  });
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/relay/geocode.test.ts tests/relay/index.test.ts`
Expected: FAIL (module absent, route inconnue → 404).

- [ ] **Step 3: Écrire `relay/src/geocode.ts`**

```ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Recherche de ville (spec lieu §3.4) : Open-Meteo Geocoding, réponse réduite aux champs du réglage « Lieu de la scène ».
const BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_MS = 24 * 3_600_000;
const CACHE_MAX = 500;

// Cache par texte normalisé (compteur en mémoire de l'instance, comme le limiteur et /weather).
const cache = new Map<string, { at: number; body: string }>();
export const resetGeocodeCacheForTests = (): void => cache.clear();

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const round2 = (v: number): number => Math.round(v * 100) / 100;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

type City = { name: string; admin?: string; country: string; lat: number; lon: number; tz: string; population?: number };

// Un résultat amont → ville, ou null (sans nom, sans coordonnées ou sans fuseau : écarté).
function toCity(raw: unknown): City | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isText(r.name) || !isNum(r.latitude) || !isNum(r.longitude) || !isText(r.timezone)) return null;
  return {
    name: r.name,
    ...(isText(r.admin1) ? { admin: r.admin1 } : {}),
    country: isText(r.country) ? r.country : '',
    lat: round2(r.latitude),
    lon: round2(r.longitude),
    tz: r.timezone,
    ...(isNum(r.population) && r.population > 0 ? { population: r.population } : {}),
  };
}

export async function proxyGeocode(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 60) return failure(400, 'bad-request');
  const key = fold(q);
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const query = new URLSearchParams({ name: q, count: '8', language: 'fr', format: 'json' });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let results: unknown;
  try {
    // Aucun résultat : Open-Meteo omet la clé « results ».
    results = (JSON.parse(result.body) as { results?: unknown }).results ?? [];
  } catch {
    return failure(502, 'upstream');
  }
  if (!Array.isArray(results)) return failure(502, 'upstream');
  const cities = results.map(toCity).filter((c): c is City => c !== null);
  const body = JSON.stringify({ ok: true, cities });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
```

- [ ] **Step 4: Brancher la route**

`relay/src/index.ts` :
- après la ligne 12 (`import { proxyBusLines } from './buslines';`) : `import { proxyGeocode } from './geocode';`
- ligne 95 (`LIMITS`) : ajouter `geocode: [60, 60_000],` après `department: [60, 60_000],`
- après la ligne 141 (route `/shops`) :

```ts
  if (get && url.pathname === '/geocode') return limited(request, 'geocode') ?? relayed(await proxyGeocode(url, { fetch: net, now: () => Date.now() }));
```

- [ ] **Step 5: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/relay/geocode.test.ts tests/relay/index.test.ts && npm run test:famille -- relais`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add relay/src/geocode.ts relay/src/index.ts tests/relay/geocode.test.ts tests/relay/index.test.ts
git commit -m "feat(relais): route /geocode (recherche de ville Open-Meteo, cache 24 h)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Le déploiement du relais est fait par le contrôleur en tâche 11, pas ici.)

---

### Task 7: Recherche côté client (`searchPlaces` + `usePlaceSearch`)

**Files:**
- Create: `src/core/library/geocode.ts`, `src/content/use-place-search.ts`
- Modify: `tests/familles.ts:112`
- Test: `tests/core/library/geocode.test.ts` (nouveau), `tests/content/location-search.test.tsx` (nouveau, motif `location-*` de la tâche 1)

**Interfaces:**
- Consumes : `isSceneCity`, `toSceneCity`, `type SceneCity` (tâche 1).
- Produces : `GEOCODE_RELAY: string`, `type PlaceHit = SceneCity & { population?: number }`, `class GeocodeError extends Error { kind: 'offline' | 'failed' }`, `searchPlaces(q: string, signal?: AbortSignal, doFetch?: (url: string, init?: RequestInit) => Promise<Response>): Promise<PlaceHit[]>` ; `SEARCH_DELAY_MS = 350`, `type PlaceSearchStatus = 'short' | 'loading' | 'done' | 'offline' | 'failed'`, `usePlaceSearch(): { query: string; setQuery: (q: string) => void; status: PlaceSearchStatus; hits: PlaceHit[] }`.

- [ ] **Step 1: Écrire les tests de `searchPlaces` (échouent)**

`tests/core/library/geocode.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { GEOCODE_RELAY, GeocodeError, searchPlaces } from '../../../src/core/library/geocode';

const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris', population: 152960 };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('searchPlaces', () => {
  it('interroge /geocode du relais avec le texte encodé et rend les villes', async () => {
    const doFetch = vi.fn(async (_url: string, _init?: RequestInit) => reply({ ok: true, cities: [ANGERS] }));
    const controller = new AbortController();
    expect(await searchPlaces(' Saint-Étienne ', controller.signal, doFetch)).toEqual([ANGERS]);
    expect(doFetch.mock.calls[0]![0]).toBe(`${GEOCODE_RELAY}?q=Saint-%C3%89tienne`);
    expect(doFetch.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it('écarte un résultat mal formé ou dont le fuseau est inconnu de l’appareil', async () => {
    const doFetch = async () => reply({ ok: true, cities: [ANGERS, { ...ANGERS, name: 'Olympus', tz: 'Mars/Olympus' }, { name: 'X' }, null] });
    expect(await searchPlaces('Angers', undefined, doFetch)).toEqual([ANGERS]);
  });

  it('réseau coupé → offline ; statut d’erreur ou réponse mal formée → failed', async () => {
    await expect(searchPlaces('Paris', undefined, async () => { throw new TypeError('Failed to fetch'); })).rejects.toMatchObject({ kind: 'offline' });
    await expect(searchPlaces('Paris', undefined, async () => reply({ ok: false, reason: 'upstream' }, 502))).rejects.toMatchObject({ kind: 'failed' });
    await expect(searchPlaces('Paris', undefined, async () => reply({ ok: true, cities: 'x' }))).rejects.toBeInstanceOf(GeocodeError);
  });

  it('une requête annulée rejette avec l’erreur d’annulation, pas « offline »', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('annulée', 'AbortError');
    await expect(searchPlaces('Paris', controller.signal, async () => { throw abort; })).rejects.toBe(abort);
  });
});
```

Dans `tests/familles.ts` ligne 112 (famille `scene-meteo`), ajouter `'geocode.*'` à la liste `lib(...)`.

- [ ] **Step 2: Écrire les tests du hook (échouent)**

`tests/content/location-search.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DELAY_MS, usePlaceSearch } from '../../src/content/use-place-search';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris' };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let root: Root;
let last: ReturnType<typeof usePlaceSearch>;
function Probe() {
  last = usePlaceSearch();
  return null;
}
const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('usePlaceSearch', () => {
  it('moins de 2 lettres : aucune requête', async () => {
    const fetchFn = vi.fn(async () => reply({ ok: true, cities: [ANGERS] }));
    vi.stubGlobal('fetch', fetchFn);
    act(() => last.setQuery(' a '));
    await wait(1000);
    expect(last.status).toBe('short');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('attend 350 ms puis rend les villes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: true, cities: [ANGERS] })));
    act(() => last.setQuery('Angers'));
    expect(last.status).toBe('loading');
    await wait(SEARCH_DELAY_MS);
    expect(last.status).toBe('done');
    expect(last.hits).toEqual([ANGERS]);
  });

  it('une réponse arrivée après qu’on a effacé sous 2 lettres est ignorée', async () => {
    let answer: ((r: Response) => void) | null = null;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; })));
    act(() => last.setQuery('ang'));
    await wait(SEARCH_DELAY_MS);
    expect(answer).not.toBeNull();
    act(() => last.setQuery('a'));
    await act(async () => { answer!(reply({ ok: true, cities: [ANGERS] })); });
    await wait(0);
    expect(last.status).toBe('short');
    expect(last.hits).toEqual([]);
  });

  it('hors ligne : état « offline », sans résultat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    act(() => last.setQuery('Angers'));
    await wait(SEARCH_DELAY_MS);
    expect(last.status).toBe('offline');
    expect(last.hits).toEqual([]);
  });
});
```

- [ ] **Step 3: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/geocode.test.ts tests/content/location-search.test.tsx`
Expected: FAIL (modules absents).

- [ ] **Step 4: Écrire `src/core/library/geocode.ts`**

```ts
import { RELAY_BASE } from '../documentary/config';
import { isSceneCity, toSceneCity, type SceneCity } from './scene-location';

// Recherche de ville du réglage « Lieu de la scène » : relais `/geocode` (Open-Meteo). Seul le texte tapé part au relais.
export const GEOCODE_RELAY = `${RELAY_BASE}/geocode`;

// La population ne sert qu'à départager les homonymes à l'affichage : elle n'est jamais enregistrée.
export type PlaceHit = SceneCity & { population?: number };

export class GeocodeError extends Error {
  constructor(readonly kind: 'offline' | 'failed') {
    super(kind);
    this.name = 'GeocodeError';
  }
}

type DoFetch = (url: string, init?: RequestInit) => Promise<Response>;

// Villes trouvées pour `q`. Lève GeocodeError (`offline` : pas de réseau ; `failed` : relais en échec ou réponse illisible), ou l'erreur
// d'annulation telle quelle quand `signal` a été annulé. Un résultat dont le fuseau est inconnu de l'appareil est écarté.
export async function searchPlaces(q: string, signal?: AbortSignal, doFetch: DoFetch = (url, init) => fetch(url, init)): Promise<PlaceHit[]> {
  let response: Response;
  try {
    response = await doFetch(`${GEOCODE_RELAY}?q=${encodeURIComponent(q.trim())}`, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new GeocodeError('offline');
  }
  if (!response.ok) throw new GeocodeError('failed');
  let body: { ok?: unknown; cities?: unknown } | null;
  try {
    body = (await response.json()) as { ok?: unknown; cities?: unknown } | null;
  } catch {
    throw new GeocodeError('failed');
  }
  if (body?.ok !== true || !Array.isArray(body.cities)) throw new GeocodeError('failed');
  return body.cities.filter(isSceneCity).map((c) => {
    const population = (c as { population?: unknown }).population;
    return { ...toSceneCity(c), ...(typeof population === 'number' && population > 0 ? { population } : {}) };
  });
}
```

- [ ] **Step 5: Écrire `src/content/use-place-search.ts`**

```ts
import { useEffect, useState } from 'react';
import { GeocodeError, searchPlaces, type PlaceHit } from '../core/library/geocode';

// Attente après la dernière frappe avant d'interroger le relais (spec lieu §4.1).
export const SEARCH_DELAY_MS = 350;
export type PlaceSearchStatus = 'short' | 'loading' | 'done' | 'offline' | 'failed';

// Recherche de ville partagée par la fenêtre de la pièce et Paramètres › Position : au moins 2 lettres, attente de 350 ms, requête
// précédente annulée (et sa réponse ignorée). Un seul minuteur, seulement pendant la frappe.
export function usePlaceSearch(): { query: string; setQuery: (q: string) => void; status: PlaceSearchStatus; hits: PlaceHit[] } {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ q: string; status: PlaceSearchStatus; hits: PlaceHit[] }>({ q: '', status: 'short', hits: [] });
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPlaces(q, controller.signal).then(
        (hits) => {
          if (!controller.signal.aborted) setResult({ q, status: 'done', hits });
        },
        (e: unknown) => {
          if (!controller.signal.aborted) setResult({ q, status: e instanceof GeocodeError ? e.kind : 'failed', hits: [] });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);
  const status: PlaceSearchStatus = q.length < 2 ? 'short' : result.q === q ? result.status : 'loading';
  return { query, setQuery, status, hits: status === 'done' ? result.hits : [] };
}
```

- [ ] **Step 6: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/geocode.test.ts tests/content/location-search.test.tsx && npm run test:famille -- scene-meteo`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/library/geocode.ts src/content/use-place-search.ts tests/familles.ts tests/core/library/geocode.test.ts tests/content/location-search.test.tsx
git commit -m "feat(bibliotheque): recherche de ville côté client (attente, annulation, hors ligne)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Choix du lieu partagé et fenêtre « Lieu de la scène »

**Files:**
- Create: `src/content/location-picker.tsx`, `src/content/LocationDialog.tsx`
- Test: `tests/content/location-dialog.test.tsx` (nouveau, motif `location-*`)

**Interfaces:**
- Consumes : `locationSetting` (tâche 1), `GEO`/`OFF`/`toSceneCity`/`SceneLocation`/`SceneCity` (tâche 1), `localClock` (tâche 3), `usePlaceSearch`, `PlaceHit` (tâche 7), `DECO_DIALOG_ATTR` (existant), `formatMinutes` (existant).
- Produces : `LocationPicker({ value: SceneLocation; onChange: (next: SceneLocation) => void })` (repères `data-location-modes`, `data-location-mode="geo|city|off"`, `data-place-search`, `data-place-status="loading|short|empty|offline"`, `data-place-results`, `data-place-hit`, `data-place-chosen`), `placeDetail(hit: PlaceHit): string` ; `LocationDialog({ onClose: () => void })` (repères `data-location-dialog`, `data-wmt-deco-dialog`, `data-action="location-close"`, `data-location-explain`).

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/content/location-dialog.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inDecoDialog } from '../../src/content/deco-dialog-guard';
import { LocationDialog } from '../../src/content/LocationDialog';
import { locationSetting, resetLocationForTests } from '../../src/content/location-setting';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris', population: 152960 };
const TOKYO = { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn>;
const q = (selector: string) => container.querySelector<HTMLElement>(selector);
const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function type(value: string) {
  const el = q('[data-place-search]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function open() {
  await act(async () => { root.render(<LocationDialog onClose={onClose} />); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  window.localStorage.clear();
  resetLocationForTests();
  onClose = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('fenêtre Lieu de la scène', () => {
  it('propose trois choix larges ; celui du réglage est pressé', async () => {
    await open();
    const modes = container.querySelectorAll<HTMLButtonElement>('[data-location-mode]');
    expect([...modes].map((b) => b.getAttribute('data-location-mode'))).toEqual(['geo', 'city', 'off']);
    expect(q('[data-location-mode="geo"]')!.getAttribute('aria-pressed')).toBe('true');
    for (const b of modes) {
      expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('Désactivé et Géolocalisation s’enregistrent au toucher', async () => {
    await open();
    await click('[data-location-mode="off"]');
    expect(locationSetting.get()).toEqual({ mode: 'off' });
    await click('[data-location-mode="geo"]');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
  });

  it('Ville sans ville choisie n’enregistre rien et ouvre la recherche', async () => {
    await open();
    await click('[data-location-mode="city"]');
    expect(locationSetting.get()).toEqual({ mode: 'geo' });
    expect(q('[data-place-search]')!.getAttribute('aria-label')).toBeTruthy();
  });

  it('attend 350 ms après la dernière frappe et annule la requête précédente', async () => {
    const signals: AbortSignal[] = [];
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchFn);
    await open();
    await click('[data-location-mode="city"]');
    await type('an');
    await wait(200);
    await type('ang');
    await wait(349);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(q('[data-place-status="loading"]')).not.toBeNull();
    await wait(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/geocode?q=ang');
    await type('ange');
    expect(signals[0]!.aborted).toBe(true);
    await wait(350);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('toucher une ville l’enregistre aussitôt (sans la population) et l’affiche', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: true, cities: [ANGERS] })));
    await open();
    await click('[data-location-mode="city"]');
    await type('Angers');
    await wait(350);
    const hit = q('[data-place-hit]')!;
    expect(hit.textContent).toContain('Angers');
    expect(hit.textContent).toContain('Pays de la Loire, France');
    expect(parseInt(hit.style.minHeight, 10)).toBeGreaterThanOrEqual(48);
    await click('[data-place-hit]');
    const { population: _p, ...stored } = ANGERS;
    expect(locationSetting.get()).toEqual({ mode: 'city', city: stored });
    expect(q('[data-place-chosen]')!.textContent).toMatch(/Choisie : Angers \(France\) · il y est \d\d:\d\d/);
  });

  it('aucun résultat : « Aucune ville trouvée »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: true, cities: [] })));
    await open();
    await click('[data-location-mode="city"]');
    await type('Zzzzqx');
    await wait(350);
    expect(q('[data-place-status="empty"]')!.textContent).toContain('Aucune ville trouvée');
  });

  it('hors ligne : message, et la ville déjà choisie reste', async () => {
    locationSetting.set({ mode: 'city', city: TOKYO });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await open();
    expect(q('[data-location-mode="city"]')!.getAttribute('aria-pressed')).toBe('true');
    await type('Osaka');
    await wait(350);
    expect(q('[data-place-status="offline"]')!.textContent).toContain('Recherche impossible sans internet');
    expect(locationSetting.get()).toEqual({ mode: 'city', city: TOKYO });
    expect(q('[data-place-chosen]')!.textContent).toContain('Tokyo');
  });

  it('Échap ferme la fenêtre, ne remonte pas, et les écouteurs globaux la reconnaissent', async () => {
    const bubbled = vi.fn();
    const guarded: boolean[] = [];
    const capture = (e: Event) => guarded.push(inDecoDialog(e));
    window.addEventListener('keydown', bubbled);
    window.addEventListener('keydown', capture, true);
    await open();
    expect(document.activeElement).toBe(q('[data-location-dialog]'));
    await click('[data-location-mode="city"]');
    await act(async () => { q('[data-place-search]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    window.removeEventListener('keydown', bubbled);
    window.removeEventListener('keydown', capture, true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
    expect(guarded).toEqual([true]);
  });

  it('toucher le fond ferme (le choix est déjà enregistré) ; toucher le panneau ne ferme pas', async () => {
    await open();
    await click('[role="dialog"]');
    expect(onClose).not.toHaveBeenCalled();
    await click('[data-location-dialog]');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('explique d’où viennent les villes, ce qui est envoyé et les limites', async () => {
    await open();
    const text = q('[data-location-explain]')!.textContent!;
    for (const word of ['Open-Meteo', 'relais', 'texte tapé', 'vacances', 'hors ligne']) expect(text, word).toContain(word);
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/location-dialog.test.tsx`
Expected: FAIL (module absent).

- [ ] **Step 3: Écrire `src/content/location-picker.tsx`**

Styles en ligne (le composant sert aussi dans Paramètres › Position, hors de `LIBRARY_CSS`), couleurs par les variables du thème comme `PositionSettings`.

```tsx
import { useState, type CSSProperties, type ReactElement } from 'react';
import type { PlaceHit } from '../core/library/geocode';
import { localClock } from '../core/library/scene-clock';
import { GEO, OFF, toSceneCity, type SceneCity, type SceneLocation } from '../core/library/scene-location';
import { formatMinutes } from '../core/library/time-setting';
import { usePlaceSearch } from './use-place-search';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
type Mode = SceneLocation['mode'];
const MODES: readonly { mode: Mode; glyph: string; label: string }[] = [
  { mode: 'geo', glyph: '📍', label: 'Géolocalisation' },
  { mode: 'city', glyph: '🏙', label: 'Ville' },
  { mode: 'off', glyph: '⊘', label: 'Désactivé' },
];

const modeStyle = (on: boolean): CSSProperties => ({
  flex: 1,
  minHeight: 56,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  cursor: 'pointer',
  font: '600 12.5px system-ui, sans-serif',
  color: on ? '#0d1117' : 'inherit',
  background: on ? 'var(--color-accent, #34d399)' : 'none',
  border: on ? '1px solid transparent' : border,
  borderRadius: 12,
});
const hitStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', width: '100%', minHeight: 48, padding: '4px 10px', cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', borderTop: border, font: 'inherit', textAlign: 'left' };
const searchStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 12, border, background: 'transparent', color: 'inherit', font: 'inherit' };
const hintStyle: CSSProperties = { fontSize: 12.5, opacity: 0.75 };

// Ligne secondaire d'un résultat : « région, pays · population » (la population départage les homonymes).
export const placeDetail = (hit: PlaceHit): string =>
  [[hit.admin, hit.country].filter(Boolean).join(', '), hit.population ? `${new Intl.NumberFormat('fr-FR').format(hit.population)} hab.` : ''].filter(Boolean).join(' · ');
const cityTime = (city: SceneCity): string => formatMinutes(localClock(new Date(), city.tz).minutes);
const sameCity = (a: SceneCity | null, b: SceneCity): boolean => !!a && a.name === b.name && a.lat === b.lat && a.lon === b.lon;

// Trois choix du lieu de la scène et recherche de ville, partagés par la fenêtre de la pièce et Paramètres › Position.
// Géolocalisation et Désactivé s'enregistrent au toucher ; « Ville » n'enregistre rien tant qu'aucune ville n'est touchée.
export function LocationPicker({ value, onChange }: { value: SceneLocation; onChange: (next: SceneLocation) => void }): ReactElement {
  const [view, setView] = useState<Mode>(value.mode);
  const search = usePlaceSearch();
  const chosen = value.mode === 'city' ? value.city : null;
  const pick = (mode: Mode): void => {
    setView(mode);
    if (mode === 'geo') onChange(GEO);
    if (mode === 'off') onChange(OFF);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="group" aria-label="Lieu de la scène" data-location-modes="" style={{ display: 'flex', gap: 6 }}>
        {MODES.map(({ mode, glyph, label }) => (
          <button key={mode} type="button" data-location-mode={mode} aria-pressed={view === mode} aria-label={label} title={label} onClick={() => pick(mode)} style={modeStyle(view === mode)}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>{glyph}</span>
            <span aria-hidden="true">{label}</span>
          </button>
        ))}
      </div>
      {view === 'city' && (
        <>
          {chosen && (
            <p data-place-chosen="" style={{ margin: 0 }}>
              Choisie : <strong>{chosen.name}</strong>{chosen.country ? ` (${chosen.country})` : ''} · il y est {cityTime(chosen)}
            </p>
          )}
          <input type="search" data-place-search="" aria-label="Chercher une ville" placeholder="Chercher une ville…" value={search.query} onChange={(e) => search.setQuery(e.currentTarget.value)} style={searchStyle} />
          {search.status === 'loading' && <span data-place-status="loading" aria-live="polite" style={hintStyle}>Recherche…</span>}
          {search.status === 'short' && search.query.trim() !== '' && <span data-place-status="short" style={hintStyle}>Tapez au moins 2 lettres.</span>}
          {search.status === 'done' && search.hits.length === 0 && <span data-place-status="empty" role="status">Aucune ville trouvée</span>}
          {(search.status === 'offline' || search.status === 'failed') && (
            <span data-place-status="offline" role="status">Recherche impossible sans internet — la ville déjà choisie reste</span>
          )}
          {search.hits.length > 0 && (
            <ul data-place-results="" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {search.hits.map((hit) => (
                <li key={`${hit.name}|${hit.lat}|${hit.lon}`}>
                  <button type="button" data-place-hit={`${hit.name}|${hit.country}`} aria-pressed={sameCity(chosen, hit)} onClick={() => onChange({ mode: 'city', city: toSceneCity(hit) })} style={hitStyle}>
                    <strong>{hit.name}</strong>
                    <small style={{ opacity: 0.75 }}>{placeDetail(hit)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Écrire `src/content/LocationDialog.tsx`**

```tsx
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import type { SceneLocation } from '../core/library/scene-location';
import { track } from '../core/telemetry/registry';
import { DECO_DIALOG_ATTR } from './deco-dialog-guard';
import { Btn, Icon, ICONS } from './library-ui';
import { LocationPicker } from './location-picker';
import { locationSetting } from './location-setting';

// Fenêtre « Lieu de la scène » ouverte depuis le bandeau du menu ☁️ (même réglage que Paramètres › Position).
// Pas de focus automatique sur le champ : sur Android le clavier recouvrirait la fenêtre ; le conteneur prend le focus pour Échap.
export function LocationDialog({ onClose }: { onClose: () => void }): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const value = useSyncExternalStore(locationSetting.subscribe, locationSetting.get, locationSetting.get);
  const change = (next: SceneLocation): void => {
    locationSetting.set(next);
    track('reglage-modifie', 'position');
  };
  // Aucune touche ne remonte (raccourcis de la pièce, placement, zoom) ; Échap ferme. Toucher le fond ferme aussi : rien à perdre,
  // le choix est enregistré au toucher.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  return (
    <div ref={box} tabIndex={-1} {...{ [DECO_DIALOG_ATTR]: '' }} data-location-dialog="" className="wmt-lib-dialog wmt-lib-dialog-top" onKeyDown={onKeyDown} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wmt-lib-dialog-panel" role="dialog" aria-modal="true" aria-label="Lieu de la scène">
        <div className="wmt-lib-row">
          <span className="wmt-lib-sep">Lieu de la scène</span>
          <Btn label="Fermer" data={{ action: 'location-close' }} onClick={onClose}><Icon paths={ICONS.close} /></Btn>
        </div>
        <LocationPicker value={value} onChange={change} />
        <div data-location-explain="" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, opacity: 0.85 }}>
          <p style={{ margin: 0 }}>À quoi ça sert : un seul lieu pour toute la Bibliothèque. Il règle l’heure réelle, le ciel, le lever et le coucher du soleil, la météo réelle, les commerces et les bus de la ville.</p>
          <p style={{ margin: 0 }}>D’où viennent les villes : la recherche en ligne d’Open-Meteo, par le relais de l’extension, qui ne reçoit que le texte tapé. Ensuite, seules les coordonnées arrondies du lieu partent, pour la météo, les commerces et les bus.</p>
          <p style={{ margin: 0 }}>Limites : la recherche ne marche qu’en ligne, mais la ville déjà choisie reste utilisable hors ligne. Hors de France, la zone des vacances « Auto » prend la zone par défaut.</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/location-dialog.test.tsx tests/content/location-search.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/location-picker.tsx src/content/LocationDialog.tsx tests/content/location-dialog.test.tsx
git commit -m "feat(bibliotheque): fenêtre Lieu de la scène (trois choix, recherche de ville)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bandeau du lieu dans le menu ☁️

**Files:**
- Modify: `src/content/library-sky-menu.tsx:1-6,31-55,92,104`, `src/content/LibraryPanel.tsx:91-92,153,241,978-995,1191`
- Test: `tests/content/library-weather-ui.test.tsx`

**Interfaces:**
- Consumes : `locationSetting`, `SceneLocation` (tâche 1), `localClock` (tâche 3), `LocationDialog` (tâche 8).
- Produces : `type PlaceBanner = { mode: SceneLocation['mode']; glyph: string; title: string; sub: string }`, `placeBanner(location: SceneLocation, failure: string | null, now: Date): PlaceBanner` ; props `place: PlaceBanner` et `onPlace: () => void` de `SkyMenu` ; repère `data-location-banner="geo|city|off"` ; état `decoDialog` de `LibraryPanel` élargi à `{ type: 'location' }`.

- [ ] **Step 1: Écrire les tests (échouent)**

Dans `tests/content/library-weather-ui.test.tsx` :
- imports : ajouter `LIBRARY_CSS` à l'import de `LibraryPanel` ; ajouter `import { placeBanner } from '../../src/content/library-sky-menu';` et `resetLocationForTests` à l'import de `location-setting` ;
- `beforeEach` : après `resetPositionForTests();` ajouter `window.localStorage.removeItem('wmt:scene-location'); resetLocationForTests();` et, avant le rendu, `vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 503 })));` ;
- `afterEach` : ajouter `vi.unstubAllGlobals();` ;
- ligne 87 (test du globe grisé) : `toContain('Position désactivée')` → `toContain('Lieu désactivé')` ;
- ajouter à la fin du fichier :

```tsx
const TOKYO = { name: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };

describe('bandeau du lieu (menu ☁️)', () => {
  const banner = () => q('[data-location-banner]')!;

  it('géolocalisation : « Ma position » et la raison de l’échec', () => {
    expect(banner().getAttribute('data-location-banner')).toBe('geo');
    expect(banner().textContent).toContain('📍');
    expect(banner().textContent).toContain('Ma position');
    expect(banner().textContent).toContain('géolocalisation · position refusée');
  });

  it('ville : nom, pays et heure de la ville', async () => {
    vi.setSystemTime(new Date('2026-10-14T13:14:00Z'));
    await act(async () => { locationSetting.set({ mode: 'city', city: TOKYO }); });
    expect(banner().getAttribute('data-location-banner')).toBe('city');
    expect(banner().textContent).toContain('🏙');
    expect(banner().textContent).toContain('Tokyo');
    expect(banner().textContent).toContain('Japon · 22:14 · heure de la ville');
    expect(banner().getAttribute('aria-label')).toBe('Lieu de la scène : Tokyo, Japon · 22:14 · heure de la ville. Changer le lieu');
  });

  it('désactivé : « Lieu désactivé » et fuseau de l’appareil', async () => {
    await act(async () => { locationSetting.set({ mode: 'off' }); });
    expect(banner().textContent).toContain('⊘');
    expect(banner().textContent).toContain('Lieu désactivé');
    expect(banner().textContent).toContain('fuseau de l’appareil');
  });

  it('toucher le bandeau ouvre la fenêtre Lieu de la scène', async () => {
    await click('[data-location-banner]');
    expect(q('[data-location-dialog]')).not.toBeNull();
    await click('[data-action="location-close"]');
    expect(q('[data-location-dialog]')).toBeNull();
  });

  it('Échap dans la fenêtre ne ferme qu’elle : le menu ☁️ reste ouvert, le mode Aménager aussi', async () => {
    await click('[data-menu-button="sky"]');
    expect(q('[data-menu="sky"]')!.hidden).toBe(false);
    await click('[data-location-banner]');
    const dialog = q('[data-location-dialog]')!;
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-location-dialog]')).toBeNull();
    expect(q('[data-menu="sky"]')!.hidden).toBe(false);
    expect(q('[data-action="visit"]')).not.toBeNull();
  });

  it('pays vide : pas de « · » en tête', () => {
    const b = placeBanner({ mode: 'city', city: { ...TOKYO, country: '' } }, null, new Date('2026-10-14T13:14:00Z'));
    expect(b.sub).toBe('22:14 · heure de la ville');
  });

  it('le bandeau est une cible tactile pleine largeur', () => {
    expect(LIBRARY_CSS).toMatch(/\.wmt-lib-place\{[^}]*width:100%[^}]*min-height:52px/);
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/library-weather-ui.test.tsx`
Expected: FAIL (aucun `[data-location-banner]`).

- [ ] **Step 3: Bandeau dans `library-sky-menu.tsx`**

Imports (lignes 1-6), ajouter :

```ts
import { localClock } from '../core/library/scene-clock';
import type { SceneLocation } from '../core/library/scene-location';
import { formatMinutes } from '../core/library/time-setting';
```

Après `NEXT_ZONE`/`ZONE_GLYPH` (ligne 22), ajouter :

```ts
// Bandeau du lieu en tête du menu ☁️ : ce que suit la scène (ville, position de l'appareil ou fuseau de l'appareil).
export type PlaceBanner = { mode: SceneLocation['mode']; glyph: string; title: string; sub: string };
export function placeBanner(location: SceneLocation, failure: string | null, now: Date): PlaceBanner {
  if (location.mode === 'city') {
    const time = formatMinutes(localClock(now, location.city.tz).minutes);
    return { mode: 'city', glyph: '🏙', title: location.city.name, sub: [location.city.country, time, 'heure de la ville'].filter(Boolean).join(' · ') };
  }
  if (location.mode === 'geo') return { mode: 'geo', glyph: '📍', title: 'Ma position', sub: `géolocalisation · ${failure ?? 'environ 10 km près'}` };
  return { mode: 'off', glyph: '⊘', title: 'Lieu désactivé', sub: 'fuseau de l’appareil' };
}
```

Type `Props` (lignes 31-48) : ajouter `place: PlaceBanner;` et `onPlace: () => void;` après `weatherNote: string | null;`.

Dans `SkyMenu`, juste après `<>` (ligne 54), avant le groupe « Ciel » :

```tsx
      <button type="button" className="wmt-lib-place" data-location-banner={p.place.mode} aria-label={`Lieu de la scène : ${p.place.title}, ${p.place.sub}. Changer le lieu`} title="Changer le lieu de la scène" onClick={p.onPlace}>
        <span className="wmt-lib-place-glyph" aria-hidden="true">{p.place.glyph}</span>
        <span aria-hidden="true">
          <strong>{p.place.title}</strong>
          <small>{p.place.sub}</small>
        </span>
        <span className="wmt-lib-place-chev" aria-hidden="true">›</span>
      </button>
```

Ligne 92 : libellé du globe désactivé `'Météo réelle (position désactivée dans Paramètre d’extension)'` → `'Météo réelle (lieu désactivé)'`.
Ligne 104 : title `'Position désactivée dans Paramètre d’extension : la météo reste simulée.'` → `'Lieu désactivé (bandeau du menu ☁️ ou Paramètre d’extension › Position) : la météo reste simulée.'`

- [ ] **Step 4: CSS du bandeau et branchement dans `LibraryPanel.tsx`**

- Imports : après la ligne 92 (`import { DecoTextDialog } …`) ajouter `import { LocationDialog } from './LocationDialog';` ; ligne 98 : `import { NEXT_ZONE, SkyMenu } from './library-sky-menu';` → `import { NEXT_ZONE, SkyMenu, placeBanner } from './library-sky-menu';`
- `LIBRARY_CSS`, après la ligne 153 (`.wmt-lib-pop-group{…}`) :

```
.wmt-lib-place{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;margin-bottom:8px;padding:6px 10px;box-sizing:border-box;border-radius:12px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wmt-lib-place-glyph{font-size:22px}
.wmt-lib-place small{display:block;font-size:12px;opacity:.8}
.wmt-lib-place-chev{margin-left:auto;font-size:18px;opacity:.6}
```

- Ligne 241 : l'état des fenêtres de la pièce couvre aussi la fenêtre du lieu (les gardes d'Échap des lignes 409 et 478 la voient ainsi sans changement) :

```ts
  const [decoDialog, setDecoDialog] = useState<{ type: 'city' | 'text'; id: string } | { type: 'location' } | null>(null);
```

- `<SkyMenu …>` (lignes 978-995), après `weatherNote={…}` :

```tsx
            place={placeBanner(sceneLocation, sceneLocation.mode === 'geo' && failure ? FAILURE_LABEL[failure] : null, new Date())}
            onPlace={() => setDecoDialog({ type: 'location' })}
```

- Avant `{decoDialog?.type === 'city' && (` (ligne 1191), dans la zone plein écran :

```tsx
        {decoDialog?.type === 'location' && <LocationDialog onClose={() => setDecoDialog(null)} />}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/library-weather-ui.test.tsx tests/content/library-deco-dialogs.test.tsx && npm run test:famille -- scene-meteo scene-piece`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/library-sky-menu.tsx src/content/LibraryPanel.tsx tests/content/library-weather-ui.test.tsx
git commit -m "feat(bibliotheque): bandeau du lieu en tête du menu ☁️

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Paramètres › Position à trois choix

**Files:**
- Modify: `src/content/PositionSettings.tsx` (réécriture)
- Test: `tests/content/position-setting.test.tsx:105-129`

**Interfaces:**
- Consumes : `LocationPicker` (tâche 8), `locationSetting` (tâche 1).
- Produces : `PositionSettings({ onClose })` inchangé de forme ; repères gardés `data-wmt-position-explain` et `data-wmt-position-choice` (cibles de la fiche WikiHow `position-v1`).

- [ ] **Step 1: Réécrire les tests de la fenêtre (échouent)**

Dans `tests/content/position-setting.test.tsx`, remplacer le `describe('fenêtre Position', …)` (lignes 105-129) par :

```tsx
describe('fenêtre Position', () => {
  let container: HTMLDivElement;
  let root: Root;
  const q = (selector: string) => container.querySelector<HTMLElement>(selector);
  const click = (selector: string) => act(async () => { q(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('explique l’usage et ce qui est envoyé, et propose les trois choix', async () => {
    await act(async () => { root.render(<PositionSettings onClose={() => undefined} />); });
    const explain = q('[data-wmt-position-explain]')!.textContent!;
    for (const word of ['météo', 'Ville', 'heure']) expect(explain, word).toContain(word);
    const modes = container.querySelectorAll('[data-wmt-position-choice] [data-location-mode]');
    expect(modes).toHaveLength(3);
    expect(q('[data-location-mode="geo"]')!.getAttribute('aria-pressed')).toBe('true');
    await click('[data-location-mode="off"]');
    expect(locationSetting.get().mode).toBe('off');
    expect(q('[data-location-mode="off"]')!.getAttribute('aria-pressed')).toBe('true');
    await click('[data-location-mode="city"]');
    expect(locationSetting.get().mode).toBe('off');
    expect(q('[data-place-search]')).not.toBeNull();
    await click('[data-location-mode="geo"]');
    expect(locationSetting.get().mode).toBe('geo');
  });

  it('la recherche partagée enregistre la ville touchée', async () => {
    const ANGERS = { name: 'Angers', admin: 'Pays de la Loire', country: 'France', lat: 47.47, lon: -0.55, tz: 'Europe/Paris' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, cities: [ANGERS] }) }) as unknown as Response));
    await act(async () => { root.render(<PositionSettings onClose={() => undefined} />); });
    await click('[data-location-mode="city"]');
    const input = q('[data-place-search]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Angers');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    await click('[data-place-hit]');
    expect(locationSetting.get()).toEqual({ mode: 'city', city: ANGERS });
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/position-setting.test.tsx`
Expected: FAIL (deux boutons seulement, pas de `[data-location-mode]`).

- [ ] **Step 3: Réécrire `src/content/PositionSettings.tsx`**

```tsx
import { useSyncExternalStore } from 'react';
import type { SceneLocation } from '../core/library/scene-location';
import { track } from '../core/telemetry/registry';
import { LocationPicker } from './location-picker';
import { locationSetting } from './location-setting';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

// « Position » : lieu de la scène de la Bibliothèque (géolocalisation, ville ou désactivé). Même réglage que le bandeau du menu ☁️.
export function PositionSettings({ onClose }: { onClose: () => void }) {
  const value = useSyncExternalStore(locationSetting.subscribe, locationSetting.get, locationSetting.get);
  const set = (next: SceneLocation): void => {
    locationSetting.set(next);
    track('reglage-modifie', 'position');
  };
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Position"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(360px, 100%)', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Position</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p data-wmt-position-explain="" style={{ margin: '0 0 8px', opacity: 0.8 }}>
          À quoi ça sert : le lieu de la Bibliothèque règle la vraie météo derrière les fenêtres, le lever et le coucher du soleil, les commerces et les bus de la ville. En Ville, la scène vit aussi à l’heure de la ville choisie.
        </p>
        <p style={{ margin: '0 0 8px', opacity: 0.8 }}>
          Ce qui est envoyé : en Géolocalisation, seulement votre position arrondie à 0,1° (environ 10 km), au relais de l’extension. En Ville, les coordonnées arrondies de la ville ; la recherche envoie le texte tapé au relais, qui interroge Open-Meteo. La dernière météo reçue est gardée sur cet appareil avec sa case de 0,1°.
        </p>
        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>
          Désactivé : plus aucune demande, la météo réelle est grisée (le ciel reste simulé) et l’heure suit le fuseau de l’appareil. Si vous refusez l’autorisation de position, le résultat est le même. Le même réglage s’ouvre depuis le menu ☁️ de la Bibliothèque.
        </p>
        <div data-wmt-position-choice="">
          <LocationPicker value={value} onChange={set} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/position-setting.test.tsx && npm run test:famille -- scene-meteo socle`
Expected: PASS (la famille `socle` contient les tests de `ExtensionSettings` et des repères WikiHow `data-wmt-position-*`).

- [ ] **Step 5: Commit**

```bash
git add src/content/PositionSettings.tsx tests/content/position-setting.test.tsx
git commit -m "feat(bibliotheque): Paramètres › Position propose géolocalisation, ville ou désactivé

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Fiche WikiHow, vérification complète, captures et livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle fiche à la fin de `ENTRIES`, après `horloges-meteo-panneaux-2026-10`, ligne 2245)
- Test: `tests/core/whats-new/entries.test.ts` (famille `socle`)

**Interfaces:**
- Consumes : repère `[data-wmt-library-entry]` (existant).

- [ ] **Step 1: Écrire le test de la fiche (échoue)**

Dans `tests/core/whats-new/entries.test.ts`, à la fin du `describe('catalogue des fiches', …)` :

```ts
  it('la fiche lieu-scene-2026-10 présente les trois choix, la recherche, l’heure de la ville et les limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'lieu-scene-2026-10');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Lieu de la scène');
    const text = entry!.steps.map((s) => `${s.title} ${s.text} ${(s.details ?? []).map((d) => `${d.label} ${d.text}`).join(' ')}`).join(' ');
    for (const word of ['Géolocalisation', 'Ville', 'Désactivé', 'menu ☁️', 'Paramètre d’extension', 'Open-Meteo', 'relais', 'Tokyo', 'vacances', 'hors ligne']) expect(text, word).toContain(word);
    for (const label of ['À quoi ça sert', 'D’où viennent les données', 'Comment faire', 'Limites']) expect(text, label).toContain(label);
    expect(ENTRIES.some((e) => e.id === 'position-v1')).toBe(true);
  });
```

Run: `npx vitest run tests/core/whats-new/entries.test.ts`
Expected: FAIL (fiche absente).

- [ ] **Step 2: Écrire la fiche**

Dans `src/core/whats-new/entries.ts`, après la fiche `horloges-meteo-panneaux-2026-10` (avant le `];` final, ligne 2246) :

```ts
  {
    id: 'lieu-scene-2026-10',
    theme: 'collection',
    glyph: '🏙',
    title: 'Lieu de la scène',
    summary: 'La Bibliothèque vit où vous êtes, ou dans la ville de votre choix, à son heure et sous sa météo',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        title: 'À quoi sert le lieu',
        text: 'Un seul lieu pour toute la Bibliothèque : il règle l’heure réelle, le ciel, le lever et le coucher du soleil, la météo réelle, les commerces et les bus de la ville.',
        details: [
          { label: 'À quoi ça sert', text: 'À voir dans votre pièce le temps qu’il fait et l’heure qu’il est chez vous, ou dans une ville qui vous est chère.' },
          { label: 'Comment faire', text: 'Ouvrez le menu ☁️ et touchez le bandeau en tête (📍, 🏙 ou ⊘) ; le même réglage est dans Plus › Paramètre d’extension › Position.' },
          { label: 'Astuce', text: 'Le bandeau rappelle toujours le lieu choisi et, pour une ville, l’heure qu’il y est.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Trois choix',
        text: '📍 Géolocalisation : la position de l’appareil. 🏙 Ville : une ville cherchée dans le monde entier. ⊘ Désactivé : aucune position, l’heure de l’appareil et une météo simulée.',
        details: [
          { label: 'Comment faire', text: 'Touchez Géolocalisation ou Désactivé : c’est enregistré aussitôt. Touchez Ville, cherchez, puis touchez la ville voulue.' },
          { label: 'À savoir', text: 'Toucher « Ville » sans choisir de ville ne change rien : le lieu précédent reste.' },
          { label: 'Limites', text: 'Un seul lieu pour toutes les pièces, gardé sur cet appareil : l’application et l’extension ont chacune le leur.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Chercher une ville',
        text: 'Tapez au moins 2 lettres : la liste montre le nom, puis la région, le pays et la population pour départager les villes du même nom.',
        details: [
          { label: 'D’où viennent les données', text: 'De la recherche en ligne d’Open-Meteo, interrogée par le relais de l’extension, qui ne reçoit que le texte tapé.' },
          { label: 'Ce qui est envoyé', text: 'Ensuite, seules les coordonnées arrondies de la ville partent au relais, pour la météo, les commerces et les bus.' },
          { label: 'Limites', text: 'La recherche ne marche qu’en ligne ; hors ligne, la ville déjà choisie reste et tout continue avec elle.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'L’heure de la ville',
        text: 'En Ville, la scène vit à l’heure de la ville : depuis Paris, Tokyo est 7 h plus tard en octobre (8 h en janvier) ; à 22 h à Paris, il fait nuit à Tokyo à 5 h du matin, le lendemain.',
        details: [
          { label: 'Comment ça marche', text: 'L’heure de la ville est calculée sur l’appareil, sans internet, avec les changements d’heure.' },
          { label: 'Les horloges', text: 'Une horloge « heure de la scène » donne l’heure de la ville ; une horloge réglée sur une ville garde l’heure de sa ville.' },
          { label: 'À savoir', text: 'Les modes « Toujours le jour », « Toujours la nuit » et « Choisir l’heure » du menu ☁️ restent possibles.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Limites',
        text: 'Hors de France, la zone des vacances « Auto » prend la zone par défaut. La recherche de ville demande internet. Désactivé grise la météo réelle.',
        details: [
          { label: 'Limites', text: 'Hors de France, le département n’est pas connu : la zone des vacances « Auto » prend la zone par défaut.' },
          { label: 'Hors ligne', text: 'Météo réelle, commerces et bus échouent comme d’habitude, mais l’heure et le ciel de la ville restent justes.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
    ],
  },
```

- [ ] **Step 3: Lancer les tests de la fiche**

Run: `npx tsc --noEmit && npm run test:famille -- socle`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/whats-new/entries.ts tests/core/whats-new/entries.test.ts
git commit -m "docs(bibliotheque): fiche WikiHow Lieu de la scène

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Vérification complète des familles touchées**

`scene-commun` est touchée (tâche 3) : toute la scène est rejouée.

Run: `npx tsc --noEmit && npm run test:famille -- "scene-*" relais socle`
Expected: tout PASS. En cas d'échec : `superpowers:systematic-debugging`, pas de correctif au hasard.

- [ ] **Step 6 (contrôleur) : Déploiement du relais**

Depuis le worktree : `cd relay && npx wrangler deploy`, puis
`curl "https://wikimasters-tools.maxime-protais-baumer.workers.dev/geocode?q=Angers"` doit renvoyer `{"ok":true,"cities":[{"name":"Angers","admin":"Pays de la Loire","country":"France",…,"tz":"Europe/Paris",…}]}` et `curl "…/geocode?q=a"` un `400`.

- [ ] **Step 7 (contrôleur) : Captures pour l'utilisateur**

Avec le banc de la pièce (`.superpowers/harness-mobilier`, vite port 5270, `?view=room`) ou l'extension rechargée : menu ☁️ ouvert avec le bandeau dans les trois modes (📍 Ma position, 🏙 Tokyo + heure, ⊘ Lieu désactivé) ; fenêtre « Lieu de la scène » avec une recherche « Angers » (homonymes France/Canada) ; une horloge « heure de la scène » à l'heure de Tokyo et une horloge Paris ; Paramètre d'extension › Position. Captures montrées à l'utilisateur pour validation **avant** la PR.

- [ ] **Step 8 (contrôleur) : Livraison**

```bash
git push -u origin feat/meteo-previsions
gh pr create --base main --title "feat(bibliotheque): lieu de la scène (géolocalisation ou ville)" --body "<résumé + captures + rappel du déploiement du relais /geocode + 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
```

Puis fusion de la PR (règle du projet : ouvrir ET fusionner sans demander), `npm run build`, `npm run preprod` (pré-prod avec APK), mise à jour de la mémoire du projet (fichier du chantier + ligne dans `MEMORY.md`). Vérification manuelle ensuite sur le vrai téléphone (Android d'abord) : mode Ville sans demande d'autorisation, heure et ciel de Tokyo, météo réelle de la ville, réouverture sans nouvelle requête météo.

---

## Self-review

1. **Couverture de la spec** : §2 (tableau) → tâches 2 (position, connue, commerces/bus/département via `isPositionKnown`), 3 (heure, date, soleil), 4 (horloges) ; §3.1 → tâche 1 ; §3.2 → tâche 2 ; §3.3 → tâches 3-4 ; §3.4 → tâches 6-7 ; §4.1 → tâche 8 ; §4.2 → tâche 9 ; §4.3 → tâche 10 ; §5 → tâche 11 ; §6 (cas limites) → tâches 1 (fuseau inconnu), 2 (réponse tardive en mode Ville, changement de lieu), 5 (cache) ; §7 cas 1-9 → tâches 1, 2, 3, 3, 4, 6, 8, 9, 5. Commerces, bus et calendrier (`use-shop-names.ts`, `use-bus-lines.ts`, `use-city-calendar.ts`) n'ont rien à changer : ils lisent déjà `currentPosition` / `isPositionKnown` / `subscribePosition`, dont le sens change en tâche 2 (leurs familles `scene-commerces`, `scene-circulation`, `scene-evenements` sont rejouées en tâche 11 par `scene-*`).
2. **Espaces réservés** : aucun « TBD » ; chaque étape de code donne le code.
3. **Cohérence des types** : `SceneLocation`/`SceneCity`/`GEO`/`OFF` (tâche 1) utilisés tels quels en 2, 8, 9, 10 ; `sceneTimeZone()` (2) en 3 ; `localClock`/`tzOffsetMinutes` (3) en 4, 8, 9 ; `SceneTime.tz` (3) → `SceneView.tz` → `DecoScene.tz` (4) ; `PlaceHit`/`searchPlaces`/`usePlaceSearch`/`SEARCH_DELAY_MS` (7) en 8 ; `LocationPicker` (8) en 10 ; `placeBanner`/`PlaceBanner` (9).
4. **Review Focus** : les cinq lignes ont leur test dans la tâche indiquée (7, 7, 1, 4, 9).
