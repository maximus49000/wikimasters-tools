# Véhicules V4 : lignes de bus réelles, girouettes, arrêt avec passagers

Spec : `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-vehicules-design.md` §5 et §6 (ligne V4). Livraison autonome :
captures auto-validées, PR fusionnée, pré-prod, captures montrées à la fin.

## Mesure Overpass (2026-10-11, avant de figer le rayon)

Depuis ce poste, overpass.openstreetmap.fr, première requête (sans cache serveur) :

| Requête | Angers 47.5,-0.6 | Paris 48.9,2.4 | Lyon 45.8,4.8 |
|---|---|---|---|
| Relations `route=bus` dans un cadre ±3 km, `out body` + arrêts | 9,7 s, 2,8 Mo | 17,2 s, 10,6 Mo | 8,4 s, 8,7 Mo |
| Arrêts (`public_transport=platform`) dans ±1 km → leurs relations | 2,4 s, 0,33 Mo | 3,0 s, 1,0 Mo | 3,0 s, 0,49 Mo |
| idem ±2 km | 1,8 s, 0,61 Mo | 1,9 s, 1,7 Mo | — |
| idem ±3 km | 1,3 s, 1,5 Mo | 1,7 s, 2,9 Mo | — |

Le cadre de relations (ce que la spec proposait) est trop lent et trop lourd pour un Worker (10 Mo à décoder). Retenu :
**arrêts dans un cadre de ±2 km autour de la case arrondie, puis les relations qui les desservent**, sortie plafonnée à
24 relations (`out body 24`), arrêts de ces lignes en entier (noms jusqu'aux terminus), arrêts proches sortis en `ids`
pour classer les lignes (les plus desservies près de la case d'abord). Plus le nom d'un établissement scolaire du cadre
(car scolaire).

## Tâches

1. **Relais `/buslines`** (`relay/src/buslines.ts`, route POST `{lat, lon}` dans `index.ts`, limite 20/min, README) :
   requête ci-dessus via `overpass()`, réponse réduite `{ ok, lines: [{ ref, from, to, colour, stops[] }], school }`,
   dédoublonnage par numéro (relation la plus longue), 8 lignes max, noms ≤ 24 caractères, 30 arrêts max, cache 30 j par
   case. Tests `tests/relay/buslines.test.ts` (cadre, réduction, dédoublonnage, classement, cache, refus, échec).
2. **Lignes côté cœur** (`city/traffic/bus-lines.ts`) : `BusLine` gagne `from` et `stops` ; `fallbackLine` génère aussi un
   départ et une suite d'arrêts plausibles ; `directed(line, dir)` (vers la droite : `to` et arrêts dans l'ordre ; vers
   la gauche : `from` et arrêts inversés) ; `parseBusNetwork` ; `nextStops`. Tests.
3. **Client** (`src/content/use-bus-lines.ts`) : comme `use-shop-names.ts` (mémoire de page par case, pause de 24 h après
   un échec, rien sans position), mais en **POST** (position jamais dans l'URL). `LibraryPanel` → `RoomView` →
   `city-life` → `TrafficEnv.busLines` / `school`. Test jsdom.
4. **Moteur** : un bus prend une des lignes réelles (sinon le repli), dans le sens de sa voie ; nom de l'arrêt de la scène
   par côté (`busStopName`) ; **foule de l'arrêt** (`city/traffic/bus-stop.ts`, pur) : passants qui arrivent à pied par
   un bord et attendent au poteau (affluence), montent quand un bus est arrêté (marche jusqu'à la porte puis montée),
   0 à 3 voyageurs descendent et repartent à pied vers un bord ; le bus attend que les montées soient finies. Tests :
   déterminisme, montée/descente, bus retenu, aucun piéton créé sur place, route fermée.
5. **Rendu** : girouette avant peinte (numéro sur la couleur de la ligne + destination), girouette latérale vivante qui
   fait défiler « prochain arrêt » puis les suivants (texte dans un `<svg>` imbriqué, sans `clipPath`), car scolaire avec
   le nom de l'établissement ; poteau d'arrêt avec le nom de l'arrêt ; couche des voyageurs (pantins Ghibli, sprites
   classiques sinon) : trottoir du fond derrière la voie du fond, trottoir du premier plan devant la voie du premier plan
   sauf la marche de montée/descente (derrière le bus).
6. **Banc et captures** (`.superpowers/harness-ville`, port 5217, `planche.html`) : bus des deux sens, girouette latérale,
   arrêt avec voyageurs (montée et descente), car scolaire ; auto-validation.
7. **PR fusionnée, `npm run preprod`, mémoire `project_ghibli.md`.**
