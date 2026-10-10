# Bibliothèque, ville vivante : vague 1b-ii-a (socle des fêtes, père Noël, feux d'artifice)

Suite de `2026-10-09-bibliotheque-ville-vivante-design.md` (section « Fêtes et événements du calendrier »). Cette PR pose le socle des fêtes en données, le père Noël du 24 décembre et les feux d'artifice du Nouvel An et du 14 juillet. La PR suivante (1b-ii-b) ajoute ballons, cloches, musiciens, défilé et passants festifs. Les décors de longue durée avec échelles restent en 1b-iii.

## Périmètre

- Table `FESTIVITIES` en données et `DayContext.festivities` (fêtes actives du jour, avec `progress`).
- Père Noël : moteur pur `city/santa.ts` + sprite + calque dans le ciel.
- Feux d'artifice : deux fêtes (Nouvel An, Fête nationale) qui rendent l'événement `fireworks` de 1b-i éligible, à poids fort.
- Fiche WikiHow `bibliotheque-v25`.
- Hors périmètre : toutes les autres fêtes de la table de la spec ville vivante, les décors, les déguisements, la réaction des animaux (1c).

## Socle des fêtes

- `calendar.ts` : `FESTIVITIES` = id, règle de date (fixe, relative à Pâques, ou « premier dimanche de janvier »), plage d'heures, poids. Aucun état, calcul sur la date locale de l'appareil (la date reste celle de l'appareil même si l'heure du ciel est forcée).
- Ajouter une fête = ajouter une ligne. Fêtes de ce lot : `new-year` (31/12 soir, 1/1), `bastille` (14/7), `christmas-eve` (24/12 nuit, 25/12 aube).
- `EventDef` gagne `fest?: string` : l'événement n'est éligible que si cette fête est active à la minute considérée. `eligible` et `conditionsKey` en tiennent compte, pour que le programme se recalcule au passage d'une fête.
- `fireworks` : poids modéré les soirs de fête, très fort dans les 15 min autour de minuit pour `new-year`. Toujours absent sous la pluie, sans report. Le plafond `MAX_EVENTS` et la déduplication restent inchangés.

## Père Noël (`city/santa.ts`, fonction pure)

- Un passage par quart d'heure d'horloge murale : numéro de tranche = `floor(horodatage / 900 s)`. Décalage dans la tranche, hauteur, sens et type tirés de (graine de la pièce, numéro de tranche) : même passage dans toutes les fenêtres et après un rechargement.
- Actif le 24 décembre de la nuit tombée (`daylight < 0,3`) jusqu'à l'aube, et le 25 pour les passages de l'aube. Rien le 24 de jour.
- Passage simple (environ deux sur trois) : traversée du ciel, clochettes de lumière, traînée scintillante.
- Passage avec livraison (environ un sur trois) : le traîneau descend vers un toit de la rangée proche lu sur `citySkyline`, se pose, le père Noël descend avec sa hotte, disparaît derrière la cheminée ou le rebord, revient, remonte à bord et repart ; une fenêtre de l'immeuble s'allume brièvement. Sans toit adapté, repli en passage simple.
- Hors plafond d'événements : il n'est jamais écarté par `MAX_EVENTS`. Pendant un passage, aucun autre événement de ciel n'est tiré (exclusion explicite).
- Par tous les temps ; traîneau assombri sous un ciel très couvert.
- Interface : `santaAt(horodatage, graine, largeur, immeubles) → { type, x, y, phase } | null`. Le composant de rendu est sans état.
- Mouvement réduit : traîneau figé posé sur un toit pendant sa tranche ; rien s'il n'y a pas de toit. Pièce sans fenêtre : ni calcul ni dessin.

## Rendu

- `santa-sprite.tsx` : traîneau, 4 à 6 rennes, hotte, traînée, assemblés par couches ; une animation par élément, coupée en mouvement réduit.
- Calque du père Noël entre le décor fixe et les immeubles proches (le traîneau posé passe devant le toit, derrière les passants).
- Feux d'artifice : sprite de 1b-i, aucun nouveau dessin.

## Tests

- Table : dates fixes, Pâques, premier dimanche de janvier, année bissextile, Alsace-Moselle.
- `santaAt` : déterminisme, cadence de 15 min, plage nuit tombée → aube, proportion de livraisons, repli sans toit, cohérence avec `citySkyline`, exclusion des événements de ciel.
- Événements : `fireworks` seulement pendant `new-year`/`bastille`, jamais sous la pluie, plafond respecté ; `conditionsKey` change à l'entrée d'une fête.
- Mouvement réduit et pièce sans fenêtre.

## Livraison

- Fiche WikiHow `bibliotheque-v25` (étapes : texte, comment, astuce) dans la même PR.
- `npx vitest run --maxWorkers=4`, typecheck, build, PR, fusion, `npm run preprod`.
- Validation visuelle : captures sur le banc local `.superpowers/harness-ville/` avec date forcée par paramètre d'URL (24/12 à 22 h 30, 31/12 à minuit, 14/7 à 22 h 30), montrées à l'utilisateur avant de clore le lot.
- Reste ensuite : vérification manuelle dans l'extension rechargée, APK à la demande.

## Limites assumées

- Pas de réglage de date dans l'interface (choix de l'utilisateur) : le banc de développement force la date par URL.
- Calendrier français uniquement.
