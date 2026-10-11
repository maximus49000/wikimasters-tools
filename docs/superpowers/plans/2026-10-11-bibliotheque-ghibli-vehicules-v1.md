# Véhicules V1 : moteur de circulation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal :** remplacer la boucle des véhicules par un moteur de circulation. Plus de boucle, des conducteurs qui ont chacun leur caractère et leur temps de réaction, des bouchons naturels, un arrêt de bus, des livraisons, une ambulance qui fait ranger les voitures, et les événements de rue qui deviennent des véhicules du moteur. Dessins actuels inchangés, dans les deux graphismes.

**Spec :** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-vehicules-design.md` (§1, §6 V1, §7).

**Architecture :**
- `src/core/library/city/traffic/` (pur, testé) :
  - `temperament.ts` : caractère tiré par la graine ;
  - `engine.ts` : agents, IDM perçu avec retard, entrées en pelotons, sorties, feux, arrêts, dépassement d'un véhicule arrêté, ambulance, pas fixe de 0,1 s, démarrage à chaud.
- `src/content/traffic-layer.tsx` : un moteur par pièce (référence dans `CityLifeLayer`), une instance de calque par voie, qui ne se re-rend que quand la liste des agents change. Une boucle d'horloge murale fait avancer le moteur et pose les `transform`. Les agents d'événement réutilisent `EventSprite`, les vélos réutilisent G3c.

## Global Constraints

- Worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-vehicules`.
- Moteur pur, sans `Math.random` ni `Date.now` (graine + temps passés en argument). Unités : px du monde × `unit` (hauteur / 340).
- Couche recopiée : aucun id fixe, aucun `clipPath`. Mouvement réduit : instantané immobile.
- Commentaires en français, style dense du dépôt. `npm run typecheck` avant chaque commit.
- Pas de mesures sur téléphone (fin de migration).

## Tasks

- [ ] **1. Caractère** (`temperament.ts` + test) : `temperamentOf(rng)` donne `react` (0,3 à 1,6 s), `want` (0,82 à 1,15), `a` (accélération en unités/s² : douce, normale, vive), `b` (freinage confortable, un tiers anticipe très tôt), `T` (0,6 à 1,9 s), `s0` (marge à l'arrêt), `lane` (± décalage), `sway` et `swayF` (ondulation), `wobble`, `patience` (avant de dépasser un véhicule arrêté). Tests : plages, déterminisme.
- [ ] **2. Moteur** (`engine.ts` + test). Interface : `createTraffic({ width, seed, unit, startS })`, `advance(world, toS, env)` (pas fixe, rattrapage plafonné à 120 s), `env = { demand: { near, far, bike }, closed, arrivals: ScheduledArrival[], stops }`, `agentsOf(world)`. Contenu :
  - pelotons d'entrée (feu hors champ en amont, cycle 40 s) ;
  - IDM sur l'état perçu avec retard (historique de 2 s), commande lissée, freinage franc en dernier recours ;
  - arrêt de bus (une position par voie), livraison (camionnette arrêtée 20 à 40 s devant un point donné), arrêts de la benne ;
  - dépassement d'un véhicule arrêté quand la voie d'en face est libre, après la patience ;
  - ambulance (vitesse 130 × unit, les véhicules devant se rangent et attendent, puis repartent) ;
  - feu dans le monde si la largeur dépasse 1 500 px ;
  - sorties aux bords ; route fermée = pas d'entrée.

  Tests : déterminisme, aucun chevauchement sur 30 min à intensité 0,3 et 1, arrêt au feu avant la ligne, redémarrage échelonné, bus arrêté puis suivants, ambulance, route fermée, valeurs finies, démarrage à chaud peuplé.
- [ ] **3. Événements** (`events.ts`) : les événements de rue sur une voie ne calculent plus `yields`. `city-life` les passe au moteur comme arrivées planifiées, plus de fondu ni de `pullOver` des voitures. Mise à jour des tests.
- [ ] **4. Calque** (`traffic-layer.tsx`) : rendu par voie (voitures, camionnettes, bus d'ambiance, agents d'événement avec leur sprite, vélos de G3c), placement par la boucle, feux stop (Ghibli seulement, petite forme), feux de détresse de la livraison. Mouvement réduit : instantané. Branchement dans `city-life.tsx` à la place de la boucle des véhicules. Feu tricolore et poteau d'arrêt de bus dessinés simplement (dans les deux graphismes).
- [ ] **5. Banc et captures** (heure de pointe, nuit, bus à l'arrêt, livraison, ambulance, 14 juillet route fermée, Ghibli et classique), corrections, puis tests voisins, PR, fusion, pré-prod.
