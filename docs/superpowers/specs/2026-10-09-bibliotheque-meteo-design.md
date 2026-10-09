# Bibliothèque — morceau 5b : météo

Suite de `2026-10-08-bibliotheque-design.md` (section « Morceau 5 ») et de `2026-10-08-bibliotheque-fenetre-design.md` (5a). Validé en discussion le 2026-10-09 : approche A (valeurs continues + automate d'états), réglage **global** comme l'heure, source **simulée + mode « Réelle »**.

## Objectif

1. Une **météo** derrière les fenêtres des scènes terrestres (ville, campagne, montagne, mer) : soleil, nuageux, bruine, pluie, orage, neige, brume.
2. Trois modes globaux : **aléatoire** (défaut), **forcée** (un état au choix), **réelle** (temps qu'il fait à la position de l'appareil).
3. Des transitions **continues** de 20 à 60 s, jamais de bascule brute ; des flaques qui se forment puis sèchent ; une neige qui s'accumule puis fond.

Espace et Terre vue d'en haut n'ont pas de météo (ils ignorent le réglage).

## Données

- `LibraryState.weather: WeatherSetting` : `{ mode: 'random' } | { mode: 'forced'; state: WeatherState } | { mode: 'real' }`. Défaut `{ mode: 'random' }`.
- `WeatherState` : `'sun' | 'cloudy' | 'drizzle' | 'rain' | 'storm' | 'snow' | 'fog'`.
- État v4 → **v5** : migration qui ajoute `weather: { mode: 'random' }`. Un build antérieur ne lit pas l'état v5 (limite connue habituelle).
- Rien d'autre n'est mémorisé : la météo courante se **recalcule** à partir du réglage, de la graine et de l'horloge murale (voir « Moteur »). Le mode « Réelle » garde seulement un cache de la dernière réponse (clé `wmt:weather-real`, hors état de la Bibliothèque, ne migre pas).

## Moteur pur (`src/core/library/weather/`, sans React, testé)

### Valeurs continues

`Weather = { cloud: 0..1, precip: 0..1, kind: 'rain' | 'snow', fog: 0..1, wind: 0..1, lightning: 0..1, wet: 0..1, snowCover: 0..1, rainbow: 0..1 }`.

- `cloud` : couverture nuageuse (assombrit le ciel, densité des nuages qui défilent).
- `precip` + `kind` : intensité des gouttes ou des flocons (la bruine est une faible intensité de pluie).
- `fog` : voile de brume ; `wind` : vitesse des nuages et inclinaison des gouttes.
- `lightning` : probabilité d'éclairs (orage seulement) ; l'éclair lui-même est un événement ponctuel dérivé de l'horloge (graine + seconde), pas une valeur stockée.
- `wet` : humidité du sol → flaques ; `snowCover` : neige au sol ; `rainbow` : opacité de l'arc-en-ciel d'éclaircie.

### Cibles et transitions

- Chaque `WeatherState` définit des **cibles** (ex. `storm` : cloud 1, precip 0.9, wind 0.8, lightning 1, fog 0.1). `blend(from, to, k)` interpole toutes les valeurs ; `k` suit un lissage (smoothstep) sur une durée de **20 à 60 s** tirée de la graine.
- `wet` et `snowCover` sont des **accumulateurs** recalculés à chaque tick de l'époque (mouillage et accumulation sous précipitation, séchage et fonte sinon, ≈ 15 min pour sécher) puis interpolés dans le tick ; ils repartent de 0 au début d'une époque (cet instant est toujours « nuageux », donc peu visible).
- `rainbow` n'est pas stocké : `rainbowOf(weather, daylight)` le dérive (sol encore mouillé, plus de précipitation, ciel dégagé, soleil assez haut), si bien qu'il apparaît à l'éclaircie après la pluie et s'éteint quand le sol sèche.

### Mode aléatoire : plan déterministe

- Le temps est découpé en **segments** de durée tirée de la graine (3 à 10 min). Le segment *n* est `{ state, start, dur, blendDur }` ; sa graine est `hash(roomsSeed, n)` ; l'état suivant est tiré d'une **matrice de transitions logiques** (soleil → nuageux ; nuageux → soleil | bruine | brume ; bruine → pluie | nuageux ; pluie → orage | bruine | éclaircie (nuageux→soleil) ; orage → pluie ; neige → nuageux | brume ; brume → nuageux | soleil). Les états passent donc par des intermédiaires (jamais soleil → orage direct).
- Poids selon la **saison et la latitude** déjà connues (position de `sky`) : la neige n'est possible que si la température plausible est basse (hiver aux latitudes moyennes, toute l'année en haute latitude ; en été sous 35° ou au niveau de la mer tropicale : jamais). La brume est plus probable à l'aube.
- Pour trouver le segment courant sans partir de l'origine, les segments sont indexés par **créneau absolu de 2 h** (chaque créneau repart d'un état tiré de sa graine, avec une transition douce depuis la fin du créneau précédent) : coût borné, pas de dérive, tous les cadres et tous les rechargements voient le même temps.
- Le plan est identique pour toutes les pièces et tous les appareils à un instant donné (graine constante) ; seul le dessin diffère par scène.
- **Découpage retenu pour rester déterministe sans dérive** : ticks de 4 min, époques de 6 h (90 ticks). Chaque époque repart de « nuageux » et ses 4 derniers ticks suivent une matrice d'apaisement (tempête → pluie → bruine → nuageux), si bien que l'état à la fin d'une époque est toujours « nuageux » : aucune discontinuité à la frontière. Le coût d'évaluation est borné (≤ 90 pas), mémoïsé par époque. Le créneau de 2 h évoqué plus haut est remplacé par cette époque de 6 h.

### Mode forcé

`weatherAt` renvoie les cibles de l'état choisi, atteintes par une transition de 20 à 60 s depuis le dernier état affiché (à l'instant du changement de réglage). `wet` et `snowCover` suivent l'état forcé sur leur temps caractéristique (forcer `rain` mouille le sol en ≈ 90 s ; forcer `sun` le sèche en ≈ 4 min).

### Mode réel

- `realWeatherToState(code, tempC, cloudPct, precipMm, windKmh, visibilityKm) → WeatherState + intensités`, traduction pure d'une réponse Open-Meteo (`weather_code` WMO + température + vent) vers les mêmes cibles.
- Appel **par le relais** (`/weather?lat=…&lon=…`), qui proxie Open-Meteo `current` sans clé, arrondit les coordonnées à 0,1° avant l'appel (confidentialité) et met la réponse en cache 10 min au bord. L'extension envoie la position (celle déjà utilisée pour l'heure réelle ; repli fuseau → pas d'appel, retombée sur l'aléatoire).
- **Cache local** 15 min, **repli** sur l'aléatoire (sans bascule brute : transition normale) en cas d'erreur réseau, 429 ou réponse invalide ; réessai espacé (1, 2, 5 min). Un seul appel en vol.
- Les transitions entre deux réponses réelles passent par `blend` comme les autres.

## Rendu

Nouveau groupe SVG **Weather**, frère du décor fixe et des acteurs (`scene-panorama.tsx`) et ajouté au même `<use>` clipé par fenêtre ; le décor fixe ne change qu'à la minute, le groupe Weather est mis à jour par la boucle d'animation existante (~30 images/s), sans re-rendu React.

- **Ciel et lumière** : `cloud` assombrit et désature le dégradé du ciel (mélange avec un gris), `fog` ajoute un voile ; les astres sont atténués ; `lightning` éclaire le ciel par éclairs brefs.
- **Nuages** : les nuages existants s'épaississent (opacité, taille) et on ajoute des nuages sombres selon `cloud`, vitesse selon `wind`.
- **Précipitations** : deux profondeurs (lointaines fines et lentes, proches grosses et rapides) de gouttes (traits inclinés par `wind`) ou de flocons (points qui dérivent). Nombre d'éléments plafonné (≈ 90 par mètre de largeur de fenêtre visible, jamais sur toute la bande), les éléments étant des `<pattern>` translatés plutôt que des nœuds individuels animés.
- **Vitre** : quelques gouttes qui glissent sur la vitre (couche propre à chaque fenêtre, pas dans le décor partagé) quand `precip > 0.15`.
- **Sol** : flaques avec ondulations (ville, campagne) selon `wet` ; manteau blanc selon `snowCover` (toits, prairie, pentes, ponts) ; la mer s'agite selon `wind`.
- **Brume** : voile en dégradé vertical, densité `fog`, aussi sur les montagnes lointaines.
- **Éclairs** : éclair ramifié à une abscisse tirée de la seconde, flash du ciel, durée ~150 ms ; jamais plus d'un toutes les 3 s.
- **Arc-en-ciel** : arc translucide opposé au soleil, opacité `rainbow`.
- **Interaction avec l'activité** : sous un ciel sombre (`cloud > 0.7`), les lumières des immeubles et les phares s'allument comme au crépuscule (même fondu de quelques secondes) ; les passants se raréfient et ouvrent des parapluies (variante du sprite) quand `precip > 0.3`.
- **Mouvement réduit** : tout reste affiché, **figé** (une image des précipitations, pas de défilement ni d'éclair).
- **Performance** : une seule horloge par pièce (existante), suspendue quand la vue est cachée ; pas de `feGaussianBlur` (brume et nuages par dégradés).

## Interface

- Panneau « Ciel » (sous la rangée d'heure) : **une rangée Météo** de glyphes à infobulle : 🎲 aléatoire, 🌍 réelle, puis ☀ ⛅ 🌦 🌧 ⛈ ❄ 🌫 pour forcer. Un second appui sur un état forcé ne désélectionne pas (choisir 🎲 pour revenir).
- La météo courante s'affiche en légende (« Pluie », « Éclaircie »…) à côté des heures de lever/coucher ; en mode réel on ajoute la température ; en cas de repli, « (simulée) » avec infobulle expliquant pourquoi.
- Le mode 🌍 demande la géolocalisation comme l'heure réelle (même mécanisme `scene-position`) ; refusée ou indisponible → bandeau court « Position inconnue : météo simulée » et retombée sur l'aléatoire.
- La rangée est visible seulement si la pièce active a une scène terrestre (sinon masquée : l'espace n'a pas de météo).
- Même rendu et même panneau dans l'extension et dans l'application mobile.

## Fiche WikiHow et nouveautés

- Fiche `bibliotheque-v12` (météo : à quoi ça sert, d'où viennent les données — simulation locale ou Open-Meteo via le relais avec position arrondie —, comment forcer un état, limites : pas de météo dans l'espace, mode réel nécessite le réseau et la position) ; entrée « Quoi de neuf » associée.

## Relais

- Route `GET /weather?lat&lon` dans `relay/src/weather.ts` : valide les coordonnées, arrondit à 0,1°, appelle `https://api.open-meteo.com/v1/forecast?current=weather_code,temperature_2m,cloud_cover,precipitation,wind_speed_10m,visibility`, renvoie un JSON réduit, cache 10 min (`caches.default`), limite par IP avec le limiteur existant. Pas de secret.
- Déploiement du relais à faire dans le même lot (commande déjà utilisée aux PR #197 et suivantes) avant la pré-prod ; l'extension se replie sur l'aléatoire si la route n'existe pas encore.

## Tests

- `blend`, cibles par état, durée de transition bornée 20–60 s, continuité (pas de saut à la frontière de segment ni de créneau de 2 h).
- Plan aléatoire : déterminisme (même graine + même instant → mêmes valeurs), matrice de transitions (pas de soleil → orage direct), poids saisonniers (jamais de neige à 35° en juillet), montagne/mer.
- `wet` / `snowCover` : montée sous précipitation, retombée après, bornées 0..1, indépendantes de l'ordre d'appel.
- `rainbow` : seulement après la pluie et avec le soleil haut.
- `realWeatherToState` : table de codes WMO (clair, brouillard, bruine, pluie, neige, orage) et froid vs pluie.
- Mode réel : cache 15 min, repli sur erreur/429/réponse invalide, un appel en vol, retombée si position inconnue.
- Migration v4 → v5 et validation zod (`weather`).
- Relais : validation, arrondi des coordonnées, cache, erreurs amont.
- Rendu (jsdom) : groupe Weather présent dans chaque fenêtre, absent en espace/Terre, nombre d'éléments plafonné, figé en mouvement réduit, rangée Météo du panneau (glyphes, état pressé, masquage en espace).
- Le rendu visuel (pluie, éclairs, brume, flaques, neige, arc-en-ciel) est vérifié à la main dans Chrome.

## Hors périmètre

Réactions des animaux à l'orage et à la pluie (6d), événements scénarisés (7), Cité de dirigeables et son smog (5c), prévisions ou historique, météo par pièce, vent qui agite les objets de la pièce, sons.

## Risques

- Open-Meteo : service tiers gratuit sans garantie ; repli complet sur l'aléatoire, cache, relais pour ne pas exposer la position exacte ni ajouter de permission d'hôte à l'extension.
- Coût de rendu de la pluie sur une bande de 96 colonnes : motifs répétés et plafond d'éléments ; vérifier sur Android bas de gamme (pas de flou).
- Intégrales `wet` / `snowCover` « à la demande » : le rappel borné (10 min) est une approximation ; documenté, testé pour la continuité.
