# Lieu de la scène : géolocalisation ou ville définie — conception

Validé le 2026-10-14 (questions + maquette `docs/superpowers/maquettes/lieu-scene/lieu-scene.html`). Premier de deux chantiers ; le second, « Prévisions de la station météo », s'appuie sur celui-ci et aura sa propre spec.

## 1. But

Aujourd'hui la Bibliothèque ne connaît qu'une source de lieu : la position de l'appareil (réglage « Position » Activé/Désactivé). Le joueur veut pouvoir **associer la scène à une ville** à la place, et que **toutes** les fonctions liées au lieu suivent ce choix.

Décisions de l'utilisateur :
- **Un seul lieu pour toute la Bibliothèque** (comme l'heure et la météo du menu ☁️, qui sont globales).
- Trois choix : **📍 Géolocalisation**, **🏙 Ville**, **⊘ Désactivé**.
- En mode Ville, la scène vit **à l'heure de la ville** (heure réelle, ciel, soleil, météo de la ville).
- **Toutes les villes du monde**, par recherche en ligne (Open-Meteo, via notre relais).
- Le réglage s'ouvre depuis **le menu ☁️** (bandeau en tête) **et** depuis **Plus › Paramètre d'extension › Position** : une seule valeur, deux portes.

## 2. Ce qui suit le lieu

| Fonction | Géolocalisation | Ville | Désactivé |
|---|---|---|---|
| Heure réelle de la scène | heure de l'appareil | **heure de la ville** (fuseau IANA de la ville) | heure de l'appareil |
| Date du jour de la scène (calendrier, vacances, saisons) | date de l'appareil | date locale de la ville | date de l'appareil |
| Lever / coucher, ciel | position | coordonnées de la ville | repli par fuseau (actuel) |
| Météo réelle (et prévisions, chantier 2) | position | ville | grisée |
| Température plausible, météo aléatoire (latitude) | latitude | latitude de la ville | repli |
| Commerces, lignes de bus | autour de la position | autour de la ville | noms par défaut (actuel) |
| Zone des vacances « Auto » | département de la position | département de la ville (France seulement) | zone par défaut |
| Horloges « heure de la scène » | heure de l'appareil | heure de la ville | heure de l'appareil |
| Horloges réglées sur une ville | heure de cette ville | heure de cette ville | heure de cette ville |

Hors France, le relais `/department` ne trouve rien : zone par défaut (comportement actuel en cas d'échec).

## 3. Données

### 3.1 Réglage

```ts
type SceneCity = { name: string; admin?: string; country: string; lat: number; lon: number; tz: string };
type SceneLocation = { mode: 'geo' } | { mode: 'city'; city: SceneCity } | { mode: 'off' };
```

- Gardé **sur l'appareil** dans `localStorage`, clé `wmt:scene-location` (JSON), comme le réglage Position actuel : l'app et l'extension ont chacune leur réglage. Mémoire de session si le stockage est refusé.
- **Migration** à la première lecture si la clé manque : `wmt:positionEnabled === 'off'` → `{ mode: 'off' }`, sinon `{ mode: 'geo' }` (défaut actuel : actif). L'ancienne clé n'est plus écrite.
- Valeur illisible (JSON cassé, ville sans `tz` IANA valide ou coordonnées hors bornes) → `{ mode: 'geo' }` (défaut), sans erreur.
- Le nouveau module `src/content/location-setting.ts` remplace `position-setting.ts` (même forme : `get()`, `set(next)`, `subscribe(listener)`). Tous ses usages (dont `PositionSettings`, `LibraryPanel`, le menu ☁️) passent au nouveau module.

### 3.2 Source unique du lieu : `scene-position.ts`

Les consommateurs actuels passent tous par `currentPosition()` / `isPositionKnown()` / `subscribePosition()` : on garde ces noms et on change leur sens.

- `currentPosition()` : ville → `{lat, lon}` de la ville ; géolocalisation → position obtenue, sinon repli par fuseau ; désactivé → repli par fuseau.
- `isPositionKnown()` : ville → **vrai** ; géolocalisation → position obtenue ; désactivé → faux. (Ouvre la météo réelle, les commerces, les bus, le département.)
- `ensurePosition()` / `requestPosition()` : ne demandent la position de l'appareil **qu'en mode géolocalisation**. En mode Ville, aucune demande d'autorisation.
- Nouveau `sceneTimeZone(): string | null` : le fuseau de la ville, ou `null` (= appareil).
- `subscribePosition` prévient aussi au changement de réglage (déjà le cas).

### 3.3 Heure de la scène

Nouveau module pur `src/core/library/scene-clock.ts` :

```ts
// Heure locale d'un fuseau (null = appareil) à l'instant `now`.
export function localClock(now: Date, tz: string | null): { minutes: number; seconds: number; date: YMD; offsetMin: number };
```

Calcul par `Intl.DateTimeFormat` (`hourCycle: 'h23'`, formateurs mis en cache, comme `tzOffsetMinutes` des horloges, à réutiliser). Changement d'heure et passage de minuit gérés par Intl.

- `minutesFor('real', now)` devient `localClock(now, tz).minutes` ; les modes jour/nuit/manuel ne changent pas.
- `useSceneTime` : `minutes`, `date` et le décalage passé à `sunTimes` viennent de `localClock(now, sceneTimeZone())`.
- Horloges (`clock-cities.ts`) : `cityMinutes` décale aujourd'hui depuis le fuseau **de l'appareil** ; il décale désormais depuis le fuseau **de la scène** (`offsetMin` de `localClock`). En heure réelle, la base « live » (heures/minutes à la seconde) vient de `localClock(now, sceneTimeZone())` au lieu de `now.getHours()`.
- La seconde partagée (`clock-tick.ts`) ne change pas : les secondes sont les mêmes dans tous les fuseaux (fuseaux à décalage non entier : les secondes restent justes).

### 3.4 Recherche de ville (relais)

Nouvelle route `GET /geocode?q=<texte>` dans `relay/src/geocode.ts` :
- `q` de 2 à 60 caractères après `trim`, sinon `400 bad-request`.
- Appelle `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=8&language=fr&format=json`.
- Répond `{ ok: true, cities: PlaceHit[] }` avec `type PlaceHit = SceneCity & { population?: number }` (la population sert seulement à départager les homonymes, elle n'est pas enregistrée) : `name`, `admin1` → `admin`, `country`, `latitude`/`longitude` arrondies à 0,01°, `timezone` → `tz`, `population` facultative. Les résultats sans `timezone` sont écartés.
- Cache en mémoire par texte normalisé (minuscules, sans accents), 24 h, 500 entrées max (même motif que `/weather`).
- Limiteur : `geocode: [60, 60_000]` dans `LIMITS`.
- Échec amont → `502 upstream`, `429` relayé.
- **Déploiement du relais** nécessaire (`wrangler deploy` dans `relay/`), comme pour les routes précédentes.

Côté client, `src/core/library/geocode.ts` : `searchPlaces(q, signal)` → `PlaceHit[]` ou erreur typée (`offline` | `failed`).

## 4. Interface

### 4.1 Fenêtre « Lieu de la scène » (`LocationDialog`)

- Trois boutons larges (≥ 44 px) : 📍 Géolocalisation / 🏙 Ville / ⊘ Désactivé, `aria-pressed`.
- En Ville : champ de recherche (`aria-label`), au moins 2 lettres, attente de 350 ms après la dernière frappe, requête précédente annulée. Résultats en liste (≥ 48 px par ligne) : **nom**, puis « région, pays · population ». Toucher une ville l'enregistre immédiatement (`{ mode: 'city', city }`) et l'affiche en « Choisie : Angers (France) · il y est 14:20 ».
- États : recherche en cours (indicateur discret), aucun résultat (« Aucune ville trouvée »), hors ligne / échec (« Recherche impossible sans internet — la ville déjà choisie reste »).
- Choisir « Ville » sans ville encore choisie n'enregistre rien tant qu'aucune ville n'est touchée (le réglage reste le précédent).
- Échap ferme la fenêtre sans toucher aux fenêtres globales ni au mode placement (même garde que les fenêtres ville/écrire des horloges, `inDecoDialog`) ; toucher le fond ferme (rien à perdre : le choix est enregistré au toucher).
- Rendue dans la zone plein écran (comme les autres fenêtres de la pièce).
- Textes didactiques en bas : d'où viennent les villes, ce qui est envoyé, limites.

### 4.2 Menu ☁️

Bandeau pleine largeur en tête du menu (bouton, `aria-label` complet) :
- Ville : « 🏙 Tokyo » + « Japon · 22:14 · heure de la ville ».
- Géolocalisation : « 📍 Ma position » + « géolocalisation · environ 10 km près » (ou la raison d'échec existante : refusée, indisponible…).
- Désactivé : « ⊘ Lieu désactivé » + « fuseau de l'appareil ».

Le toucher ouvre `LocationDialog`. Le reste du menu ne change pas.

### 4.3 Paramètres › Position

`PositionSettings` garde son habillage (fenêtre sombre des Paramètres) et son titre « Position », mais propose les trois choix et la même recherche (logique partagée avec `LocationDialog` : hook `usePlaceSearch` + composant de liste). Textes mis à jour (à quoi ça sert, ce qui est envoyé selon le mode, effet de « Désactivé »).

## 5. Fiche WikiHow

Nouvelle fiche, **nouvel id** `lieu-scene-2026-10` (« Lieu de la scène ») : à quoi ça sert, les trois choix, d'où viennent les villes et ce qui est envoyé, l'effet sur l'heure (Tokyo depuis Paris), limites (hors France : zone des vacances par défaut ; recherche en ligne seulement). Les fiches qui décrivent l'ancien interrupteur Position ne sont pas réécrites (historique), la nouvelle les complète.

## 6. Erreurs et cas limites

- Ville choisie puis hors ligne : tout fonctionne avec la ville gardée (coordonnées et fuseau sont stockés) ; seules les requêtes réseau (météo, commerces) échouent comme aujourd'hui.
- Fuseau de la ville inconnu du moteur JS (`Intl` lève une erreur) : la valeur est refusée à la lecture → défaut `geo`.
- Passage géolocalisation → ville pendant une demande de position en cours : la réponse arrivée ensuite est gardée en mémoire mais ignorée tant que le mode n'est pas `geo`.
- Changement de lieu : heure, ciel, météo réelle (nouvelle cellule), commerces, bus et département se recalculent (abonnés de `subscribePosition`).
- Les caches existants par cellule de 0,1° (météo, commerces, bus, département) restent valables : une ville tombe dans sa cellule.

## 7. Tests

Familles touchées : **scene-meteo** (position, météo, réglage), **scene-commun** (`time-setting`, nouvelle `scene-clock`), **scene-piece** (horloges, fenêtres de la pièce), **scene-ville** si un test des commerces/bus est touché ; tests du relais (famille qui couvre `relay/`). Tout nouveau fichier de test rattaché à une famille de `tests/familles.ts`.

Cas à couvrir :
1. Migration : `wmt:positionEnabled = 'off'` → `off` ; absent ou `'on'` → `geo` ; valeur cassée → `geo`.
2. `currentPosition` / `isPositionKnown` pour chaque mode ; aucune demande de position en mode Ville.
3. `localClock` : Tokyo depuis Paris en octobre (+7 h) et janvier (+8 h), passage de minuit (22 h à Paris → 5 h le lendemain à Tokyo, date du lendemain), fuseau à demi-heure (Inde).
4. `useSceneTime` en mode Ville : minutes, date et lever/coucher de la ville.
5. Horloge « heure de la scène » = heure de la ville ; horloge réglée sur Paris quand la scène est à Tokyo = heure de Paris.
6. Relais `/geocode` : validation de `q`, forme de la réponse, résultats sans fuseau écartés, cache, erreurs amont.
7. `LocationDialog` : trois choix, recherche avec attente et annulation, choix d'une ville enregistré, états vide/hors ligne, Échap isolé.
8. Menu ☁️ : bandeau selon le mode, ouvre la fenêtre.

## 8. Hors périmètre

- Lieu par pièce (écarté : un seul lieu).
- Liste de villes hors ligne.
- Changer la ville des horloges via la recherche en ligne (elles gardent leur liste de 131 villes).
- Prévisions de la station : chantier 2.
