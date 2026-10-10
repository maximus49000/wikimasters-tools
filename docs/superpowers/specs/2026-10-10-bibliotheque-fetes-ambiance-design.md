# Bibliothèque, scène Ville : ambiance de fête (vague 1b-ii-b)

Suite de la vague 1b-ii-a (Nouvel An, 14 juillet en feux d'artifice, père Noël). Complète le tableau des fêtes de `2026-10-09-bibliotheque-ville-vivante-design.md` : Épiphanie, Saint-Valentin, Pâques, 1er mai, Fête de la musique, Armistice, défilé du 14 juillet, passants festifs. Les longs décors avec échelles restent dans 1b-iii.

Tout reste calculé depuis la date et l'heure : aucun état ajouté (le format de la pièce reste v5), aucun `Math.random`.

## 1. Calendrier (`city/calendar.ts`)

- `FestivityId` gagne : `epiphany`, `valentine`, `easter`, `may-day`, `music`, `armistice`.
- `festivitiesOn(date)` accepte les dates calculées : Pâques via `easterSunday(year)`, Épiphanie = premier dimanche de janvier. Les dates fixes restent dans `FESTIVITIES`.
- Plages (minutes, `[début, fin)`, jamais à cheval sur minuit) :

| Fête | Jour | Plage |
| --- | --- | --- |
| Épiphanie | 1er dimanche de janvier | 10 h – 18 h |
| Saint-Valentin | 14 février | 10 h – 23 h |
| Pâques | dimanche de Pâques | 9 h – 18 h |
| 1er mai | 1er mai | 8 h – 18 h |
| Fête de la musique | 21 juin | 17 h – 24 h |
| Armistice | 11 novembre | 8 h – 18 h |
| Fête nationale | 14 juillet | ajout 10 h – 12 h (défilé) ; 21 h – 24 h existe déjà |
| Nouvel An | 31/12 21 h 30 – 24 h, 1/1 0 h – 1 h | plage étendue pour les passants festifs |

## 2. Passants festifs (`city/intensity.ts`, `city/people.ts`)

- `CityIntensity` reçoit `festive: { id: FestivityId; share: number } | null` (part de passants portant la marque de la fête) et `crowd` (multiplicateur d'affluence appliqué à `walkers`) : fort à la Fête de la musique et au 14 juillet, faible le 1er janvier, le 25 décembre et le 11 novembre.
- `pedestriansFor` : aucun tirage ajouté aux passants existants. Les passants propres aux fêtes (couples de la Saint-Valentin, petits groupes d'enfants de Pâques) sont ajoutés EN FIN de liste, avec un rôle `festive` ; leur présence est pilotée par `festive.share`. Les rues actuelles ne changent donc pas.
- Une tenue festive est une couche de rendu choisie par `p.u < festive.share` (aucun tirage de plus) : couronne dorée (Épiphanie), ballon-cœur (Saint-Valentin), panier d'œufs (Pâques), brin de muguet (1er mai), drapeau ou coquelicot (14 juillet, Armistice), serpentine ou bonnet (Nouvel An), accessoire de musique (Fête de la musique).

## 3. Événements (`city/events.ts` + sprites)

Nouveaux `CityEventId`, tous en données (`EVENT_DEFS`, poids de base nul, `festWeight` seulement) :

- `fest-balloons` (ciel) : ballons-cœur (Saint-Valentin) ou ballons-lapins (Pâques), le jour, sans pluie.
- `bells` (fixe, discret) : cloches de Pâques qui oscillent en hauteur, quelques dizaines de secondes.
- `street-band` (fixe, trottoir, plusieurs minutes) : musiciens ; le soir de la Fête de la musique, cônes de lumière colorés qui tournent.
- `parade` (rue, file du premier plan, 14 juillet de 10 h à 12 h) : convoi de 3 à 4 véhicules pavoisés ; mêmes règles d'effacement des voitures (`yields`) que les autres véhicules d'événement.
- Drapeaux aux entrées d'immeuble le 11 novembre, le 14 juillet et le 1er mai, pour une partie seulement d'entre elles (même mécanisme que les décors d'entrée existants).
- `conditionsKey` contient déjà les fêtes actives : le programme se recalcule au passage d'une plage horaire.

## 4. Garde-fous

- Mouvement réduit : seuls les éléments fixes restent figés (cloches, musiciens) ; le défilé et les ballons ne partent pas.
- Sans fenêtre dans la pièce, rien n'est calculé ni affiché.
- Plafond de figurants existant (`sprite-budget`) inchangé : les passants festifs y comptent.
- Les événements de fête respectent `MAX_EVENTS`.

## 5. Livraison

Un spec, un plan, deux PR :

1. Calendrier, intensité, passants festifs, tests du moteur.
2. Événements, sprites, captures sur le banc `.superpowers/harness-ville` (paramètre `date=`), fiche WikiHow `bibliotheque-v26`.

## 6. Tests

- Moteur : dates calculées (Pâques, Épiphanie), plages, déterminisme, passants existants identiques à partir de la même graine, `festive` nul hors fête.
- Programme d'événements : un événement de fête n'apparaît que pendant sa plage ; `parade` jamais hors 14 juillet 10–12 h.
- Rendu : jsdom pour la présence des sprites et le mouvement réduit.

## Hors périmètre

Décors de longue durée avec échelles (1b-iii), réaction des animaux (1c), troupes à pied au défilé, événement de rue propre à la Saint-Valentin.
