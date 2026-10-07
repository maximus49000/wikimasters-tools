# Nouveautés après mise à jour, WikiHow et Paramètre d'extension

Date : 2026-10-07. Statut : à relire.

## Objectif

Expliquer à l'utilisateur comment fonctionnent les nouvelles fonctions, par une visite guidée « projecteur » sur la vraie interface, à chaque installation de mise à jour. Offrir le même contenu à la demande dans une section WikiHow du menu « Plus ». Regrouper les réglages « Paramètre d'image » et « Lecteur » derrière une seule entrée pour gagner de la place.

Interfaces concernées : extension (Chrome, Firefox) et application Android (surcouche), avec le même code.

## Décisions validées

- Les fiches sont rédigées à la main dans un fichier versionné ; les corrections viennent des commits `fix:`.
- La visite est un projecteur sur la vraie interface (trou découpé sur la cible, bulle Précédent / Suivant / Quitter).
- La fenêtre s'ouvre au premier lancement après une mise à jour, sur mobile et sur l'extension.
- La fenêtre après mise à jour affiche uniquement les nouveautés et corrections entre la dernière version vue et la version courante (cumul des versions sautées). Rien n'est affiché à la première installation.
- Deux grilles, Nouveautés et Corrections, avec un switch gauche / droite. Chaque nouveauté se touche pour lancer sa visite ; « Tout visiter » enchaîne les non consultées.
- Une fiche consultée (visite démarrée, ou simple toucher pour une correction) est rendue semi-transparente ; elle reste cliquable. Les compteurs des onglets ne comptent que les non consultées. Une pastille signale les non consultées.
- WikiHow : entrée « WikiHow » dans « Plus » uniquement (pas dans Paramètre d'extension). Il liste toutes les fiches par thème (Collection, Fiche d'une carte, Écoute et médias), grisées si consultées, avec « Revoir ». Les fiches de départ reprennent les fonctions majeures déjà livrées.
- « Plus » : « Paramètre d'image » et « Lecteur » sont remplacés par « Paramètre d'extension » (liste style Paramètres : Images, Lecteur, flèche retour ; chaque ligne ouvre le réglage existant inchangé). « Remonter une anomalie » et « Vérifier la mise à jour » (Android) restent des entrées de Plus.

## Architecture

- `src/core/whats-new/entries.ts` : les fiches. Champs : `id`, `theme`, `glyph`, `title`, `summary`, `since` (build d'introduction), `steps[]` (`target` sélecteur `[data-wmt-tour="…"]`, `title`, `text`, `route` facultative). Une fiche « sans visite » est possible.
- `src/core/whats-new/fixes.generated.ts` : corrections `{ id, since, title }` générées à la publication depuis les `fix:` (étend `scripts/release-notes.mjs`), pas écrites à la main.
- `src/core/whats-new/seen.ts` : dépôt mémorisé (même store que le reste) : `lastSeenBuild` et l'ensemble des `id` consultés.
- `src/core/whats-new/select.ts` : fonction pure `pendingSince(lastSeenBuild, currentBuild)` qui renvoie nouveautés et corrections à afficher.
- `src/content/WhatsNewDialog.tsx` : switch et deux grilles, « Tout visiter ».
- `src/content/TourOverlay.tsx` : projecteur et bulle ; cible absente → étape en texte seul, sans erreur.
- `src/content/WikiHowDialog.tsx` : catalogue complet par thème.
- `src/content/extension-setting-menu.ts` et `wikihow-menu.ts` : entrées de Plus, construites avec `buildEntry` comme les entrées existantes ; `image-setting-menu` et `player-setting-menu` ne posent plus leur ligne dans Plus mais sont ouverts depuis Paramètre d'extension.
- Build courant : `versionCode` via le pont Android sur mobile ; constante injectée au build sur l'extension.
- Les éléments à éclairer reçoivent `data-wmt-tour`.

## Flux

Au démarrage, si `lastSeenBuild` existe et est inférieur au build courant, et si `pendingSince` n'est pas vide : ouverture de la fenêtre. Quel que soit le résultat, `lastSeenBuild` passe au build courant à la fermeture. Première installation : on enregistre le build, sans afficher.

## Garde-fous et tests

- Test : chaque `feat:` publié a une fiche ou est marqué « sans visite » (évite les fiches oubliées).
- Tests unitaires : `pendingSince` (aucune, une, plusieurs versions sautées, première installation), mémorisation des fiches consultées, repli sans cible.
- Vérification manuelle : Chrome (recharger l'extension) et AVD (banc tactile du projet), APK à la demande.

## Hors périmètre

Visites animées ou vidéo ; traduction ; statistiques d'usage ; réécriture des réglages Images et Lecteur.

## Découpage proposé

1. Données et logique pures (fiches, sélection, mémoire, génération des corrections).
2. Projecteur et fenêtre Nouveautés.
3. Paramètre d'extension et WikiHow dans Plus.
4. Rédaction des fiches de départ et vérification.

## Écarts décidés au plan

- Le critère « nouveau » est « identifiant jamais annoncé » (et non une comparaison de numéros de build) : même résultat (cumul des versions sautées), sans dépendre du `versionCode`.
- Au premier lancement, l'existant est marqué annoncé, sauf les fiches `fresh: true` (réservées à la fiche qui présente WikiHow).
- Pas de champ `route` : une cible absente de l'écran donne une étape en texte seul avec une indication ; une étape peut n'avoir aucune cible.
- Le garde-fou « chaque `feat:` a une fiche » devient un test de cohérence du catalogue, plus une règle de travail (mémoire du projet) : toute fonction ajoutée ou modifiée reçoit sa fiche dans la même PR.
- Les identifiants sont marqués annoncés à l'ouverture de la fenêtre ; WikiHow permet de tout retrouver.
