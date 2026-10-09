# Bibliothèque — Morceau 6d : réactions au contexte

Suite de `2026-10-08-bibliotheque-design.md` (section « Morceau 6 »). Dépend de la météo (5b), de la lumière (8a-8c) et des trois animaux (6a-6c, 6e). Regarder les événements de la fenêtre dépend du morceau 7 : hors périmètre.

## But

Les animaux tiennent compte de l'heure, de la lumière et du temps qu'il fait : ils dorment la nuit, se couchent dans la tache de soleil, se mettent à l'abri de l'orage, et chaque espèce a une réaction propre à la pluie ou à la lune.

## Entrée : `PetContext`

Objet de valeurs simples, construit à chaque image par l'interface et passé au moteur pur (`src/core/library/pets/`) comme nouveau champ optionnel de `BrainEnv` (`ctx?: PetContext`). Sans `ctx`, le moteur se comporte exactement comme avant (tests existants inchangés).

```ts
type PetContext = {
  night: boolean;              // soleil couché (ciel) ; sinon heure d'horloge 22 h–6 h si la pièce n'a pas de ciel
  moon: boolean;               // lune visible depuis une fenêtre (nuit + scène à ciel + fenêtre)
  weather: 'clear' | 'drizzle' | 'rain' | 'storm';  // 'clear' si pas de fenêtre ou scène sans météo (espace, Terre)
  stormId: number;             // identifiant de l'orage en cours (0 = aucun) : change à chaque nouvel orage
  rainEndedAt: number | null;  // horodatage de la fin de la dernière pluie ; sert au secouement
  sunCells: readonly Cell[];   // cases du sol atteintes par le soleil (vide si pas de rayon)
};
```

- `night`, `moon`, `weather` viennent du ciel et de la météo déjà calculés pour la pièce (`skyAt`, `useWeather`) ; `sunCells` vient du moteur de lumière (`light/`, rayon par fenêtre + `sunReaches`), échantillonné à 1 Hz, jamais par image.
- Pièce sans fenêtre, ou scène espace/Terre : `weather = 'clear'`, `moon = false`, `sunCells = []`, `night` d'après l'horloge.
- `stormId` : un orage = un passage continu à `storm` ; un nouvel orage a un nouvel id. Il évite de ré-interrompre les animaux qui ont déjà réagi.

## Deux mécanismes

### 1. Biais au prochain choix (`nextPlan`)

Les poids de `nextPlan` sont multipliés selon le contexte ; aucune interruption.

| Condition | Effet |
|---|---|
| `night` | sommeil (panier, niche, assises) ×4 ; le robot préfère `standby`/`charge` ; actions d'agrément ×0,5 |
| `night && moon`, chien | nouvelle action `howl` (hurler à la lune), poids 1,5, sur place, 4-6 s |
| jour, `sunCells` non vide, chat ou chien | nouvelle action `sunbathe` vers la case de soleil libre la plus proche, poids 2,5, 20-45 s (posé à plat, comme `sleep` au sol) |
| `weather` = `drizzle`/`rain`, robot | nouvelle action `umbrella` (parapluie déployé, sur place), poids 2, 8-15 s |
| `weather` = `drizzle`/`rain` | déplacements d'agrément ×0,5 (les animaux restent plutôt posés) |
| `rainEndedAt` < 2 min et pas encore secoué, chien | `shake` (se secouer), poids 3, 2-3 s, une seule fois par pluie |

La tache de soleil bouge ; l'animal reste là où il s'est posé jusqu'à la fin de son plan (pas de suivi).

### 2. Interruption à l'orage (`runner`)

Quand `ctx.stormId` change vers un nouvel orage, chaque animal de la pièce reçoit un plan de réaction, avec un délai propre tiré entre 0,5 et 4 s (champ `lag` existant, phase `wait`). Le plan en cours est abandonné à l'endroit où l'animal se trouve en théorie (`settledState`, jamais en l'air).

- **Chat** : `hide` sous le canapé s'il y en a un (place `${id}:hide`) ; sinon `cower` à la case libre la plus proche d'un mur.
- **Chien** : `cower` au pied du canapé ; sinon à la case libre la plus proche d'un mur.
- **Robot** : `shortcircuit` sur place (s'arrête net, étincelles, 3 s), puis `reboot` (redémarrage, 1,5 s) ; il ne se cache pas.
- **À trois (nouvelle scène `huddle`)** : si chat, chien et robot sont tous présents, le chat et le chien convergent vers le même point (cases voisines, plans jumeaux comme les autres scènes) et se serrent en `cower` ; le robot reste en court-circuit à côté. Si un seul des trois manque, chacun réagit séparément.
- L'orage maintient la réaction : l'animal reste en `cower`/`hide` tant que `weather = 'storm'`, par tranches de 8-15 s (prolongées sur place, sans déplacement), jusqu'à 60 s au plus après le début ; ensuite l'orage n'empêche plus les choix normaux (biais pluie, pas de nouvelle interruption car `stormId` n'a pas changé).
- Une scène à deux en cours est abandonnée avec les règles existantes (`sceneIsValid`).
- **Mouvement réduit** (`still`) : aucun déplacement ; `cower` (ou `shortcircuit` pour le robot) sur place.
- **Caresse** : une caresse pendant l'orage reste possible (ronron/bip comme d'habitude) ; le plan de réaction reprend au choix suivant.

## Mémorisation

Comme le reste : le plan (action, trajet, horodatages absolus) est écrit à chaque nouveau plan via `repo.updateQuiet`. Aucune simulation en arrière-plan. Au retour dans la pièce :
- plan encore en cours → reprise interpolée ;
- sinon nouveau choix avec le contexte du moment (un orage fini n'impose rien).

## Données

`PetAction` s'étend de : `sunbathe`, `howl`, `shake`, `umbrella`, `cower` (déjà existant pour le chat dans les scènes ; élargi), `shortcircuit`, `reboot`. `PairScene` s'étend de `huddle`. Les champs de plan existants (`lag`, `key`, `with`) suffisent. **L'état reste v5 ; aucune migration.** Les nouveaux noms d'action ne sont lisibles que par ce build : un build antérieur rejette un plan inconnu et en recrée un (le schéma de plan ignore déjà les plans invalides ; à vérifier au plan et à garder sûr).

## Rendu

- Chat : `sunbathe` = pose `sleep` à plat, orientée.
- Chien : `howl` (museau en l'air), `shake` (corps qui vibre), `sunbathe` (couché à plat).
- Robot : `umbrella` (parapluie dessiné au-dessus), `shortcircuit` (étincelles SMIL + tremblement, coupées en mouvement réduit), `reboot` (écran qui se rallume).
- Les ombres des animaux (8c) suivent les poses via `pet-boxes.ts` : les nouvelles poses reçoivent une boîte (sunbathe = sleep, howl = sit, shake = sit, umbrella = standby plus un auvent, shortcircuit/reboot = sit).

## Interface

Aucun nouveau réglage : le comportement suit les réglages existants (heure, météo, lumière). Fiche WikiHow `bibliotheque-v18` (une étape par famille : nuit, soleil, pluie, orage ; limites). Paramétrage : si le calque de lumière est désactivé, `sunCells = []`.

## Tests

- `brain` : biais de poids avec `ctx` injecté et RNG fixé (nuit, soleil, pluie, fin de pluie), sans `ctx` = comportement actuel.
- `runner` : interruption à l'orage (délai, abandon en vol, un seul déclenchement par `stormId`, maintien 8-15 s, plafond 60 s), huddle à trois et repli si un partenaire manque, mouvement réduit, reprise après rechargement pendant l'orage.
- `scenes` : validité du plan `huddle` (`sceneIsValid`).
- `pet-sim` / interface : construction de `PetContext` à partir de la météo et du ciel (pièce sans fenêtre, espace/Terre).
- Rendu : poses nouvelles présentes pour chaque espèce, étincelles absentes en mouvement réduit.

## Limites assumées

- La tache de soleil n'est pas suivie en direct.
- Pas de réaction aux événements de la fenêtre (morceau 7).
- Les réactions à la pluie fine sont un simple biais, pas une interruption.
- Hurlement à la lune seulement avec une fenêtre sur une scène à ciel.
- Rendu jamais vu hors jsdom avant la vérification manuelle Chrome.
