# Documentaire sur la fiche — événements et personnages historiques

Date : 2026-10-07 · Statut : à relire · Maquette : `.superpowers/mockups/documentaire-histoire.html`

## But

Afficher dans la fiche d'une carte « historique » (événement ou personnage) un documentaire pertinent, trouvé parmi plusieurs sources, avec possibilité pour l'utilisateur d'en proposer un. Principe directeur : **aucune vidéo plutôt qu'une vidéo peu pertinente.**

## Décisions prises

- Cible : toute carte reconnue comme événement historique ou personnage historique (§ Détection).
- Recherche automatique YouTube via un **relais Cloudflare Worker gratuit** (clé YouTube hors de l'extension, cache partagé). Offre gratuite suffisante à l'usage prévu ; le quota YouTube (~100 recherches neuves par jour) est la limite réelle.
- Propositions d'utilisateurs : visibles tout de suite pour leur auteur, pour les autres après validation manuelle.
- Pas de note affichée à l'utilisateur.

## Sources, par ordre

1. **Sélection validée** : `documentaires.json` du dépôt (Wikidata QID → liste de documentaires, y compris propositions acceptées). Aucune note requise. Lu à l'exécution depuis le dépôt (mise à jour sans republier l'extension).
2. **Wikimedia Commons** : recherche `filetype:video` sur le titre ; API sans clé ; lecture `<video>` native ; auteur et licence affichés. Noté comme les autres candidats.
3. **Relais** : cherche d'abord dans l'**index des chaînes de confiance** (gratuit), puis seulement sur YouTube ; renvoie jusqu'à 3 candidats notés, ou « rien de pertinent ».

On s'arrête à la première source qui fournit un candidat au-dessus du seuil. Les autres candidats de cette source servent au changement de vidéo (glyphe ⇄).

## Notation de la pertinence (module partagé extension / relais)

Note sur 100, calculée sur le titre, la description, la durée, la chaîne et la langue.

- **Éliminatoire** : le titre ne contient aucun nom du sujet (libellé et alias Wikidata, accents et casse ignorés).
- Bonus : mots du genre (« documentaire », « documentary »), durée de 8 à 120 min, chaîne de la liste de confiance (fichier de configuration), langue française puis anglaise.
- Malus ou rejet : mots parasites (réaction, jeu, clip, bande-annonce de fiction, shorts), durée hors fourchette, année citée incohérente avec la période du sujet (homonymes).
- Seuil : fixé après essais sur 30 cartes choisies par l'utilisateur, avec un tableau retenu/rejeté et motifs, avant la mise en pré-production.
- Si rien ne dépasse le seuil : aucune vidéo ; boutons de recherche (YouTube, Arte, INA) et « Proposer un documentaire ».

## Vidéos proposées et vidéos possibles

Décision du 2026-10-07 (maquette validée : `.superpowers/mockups/documentaire-possibles.html`) :
- Note ≥ 60 : vidéo **proposée** d'office (3 au plus, la mieux notée d'abord). Note de 45 à 59 : vidéo **possible** (5 au plus), visible seulement derrière le glyphe ≡▶ (avec compteur), dans le même lecteur, avec la pastille « Pertinence moins sûre » et un avertissement. Au-dessous de 45 : rien.
- Notation : un nom de deux mots ou plus est reconnu si tous ses mots (4 lettres ou plus) sont dans le titre, dans n'importe quel ordre ; +10 si le titre contient « histoire ».
- Réglages du 2026-10-07 après essai sur 14 cartes, puis du 2026-10-08 : contenu pour enfants −15 (jamais en tête), titre complotiste (« mensonges », « complot », « on vous cache »…) −25, titre racoleur (« terrifiante », « enfin résolu »…) −15, émission « Secrets d'Histoire » reconnue comme chaîne de confiance (+20).
- Le relais renvoie `candidates` et `possible` ; cache `doc-v2-<qid>` (30 jours si au moins une vidéo proposée, 7 jours sinon). L'extension garde la réponse 7 jours (`doc-relay-v2-<qid>`).
- Idée mise de côté : bouton « mettre en sûr » et vidéo prioritaire choisie par l'utilisateur.

## Index des chaînes de confiance (dans le relais)

- Chaînes : ARTE, INA Officiel, Nota Bene, Lumni, Hérodote (identifiants vérifiés ; France Télévisions écartée : journaux télévisés).
- Une tâche planifiée du Worker (toutes les 30 minutes) lit la liste des vidéos de chaque chaîne (50 par page, 2 unités de quota avec les durées) : les 3 000 plus récentes, puis une mise à jour hebdomadaire des nouveautés.
- Chaque vidéo est stockée dans le KV sous forme d'une ligne (clé, durée, titre normalisé, titre) ; la recherche d'un nom est une recherche de texte en mots entiers, sans analyser le fichier (temps de calcul limité à 10 ms sur l'offre gratuite).
- Les candidats de l'index passent par la même notation que les autres ; le bonus « chaîne de confiance » s'applique.
- Une réponse tirée de l'index est mémorisée 7 jours (l'index grossit) ; une réponse tirée de la recherche, 30 jours (7 si vide).
- Contrôle : route `/status` (avancement par chaîne).

## Relais (Cloudflare Worker)

- Entrée : `{ qid, noms[], periode }`. Aucune donnée personnelle.
- Interroge l'API YouTube Data v3 (clé en secret), note les résultats, renvoie ≤ 3 candidats.
- Cache partagé (KV) : 30 jours pour un succès, 7 jours pour « rien ». Une carte n'est cherchée qu'une fois pour tous les utilisateurs.
- Garde-fous : budget du jour en **unités de quota** (9 000 sur 10 000), partagé entre l'index (2 par page) et la recherche (101) ; au-delà, réponse « réessayer plus tard » et l'extension affiche les boutons de recherche ; limite de débit par IP.
- Code dans le dépôt (`relay/`), déployé depuis GitHub. Mode opératoire de création du compte : `docs/guides/cloudflare-relais.md`.
- Côté extension : copie locale des réponses (comme les pochettes mémorisées), pour ne pas redemander.

## Propositions des utilisateurs

- Bouton « Proposer un documentaire » : l'utilisateur colle un lien YouTube ; l'extension vérifie par oEmbed (sans clé) que la vidéo existe et est intégrable, et lit son titre.
- Circuit : issue GitHub étiquetée (même mécanisme que « Remonter une anomalie »), contenant QID, lien, titre, note calculée.
- Visible immédiatement pour son auteur (mémorisée localement, mention « en attente de validation »). Pour les autres : après ajout dans `documentaires.json`.
- Bouton « Pas pertinent » : même circuit, autre étiquette.

## Détection

Décision du 2026-10-08 : la recherche est **large**. Une liste de natures ou de dates laissait de côté des monuments (menhir, dolmen, obélisque, Taj Mahal, « Monolithe ») : la pertinence est jugée par la notation des vidéos, pas par la nature de la carte.

`historyKindOf(kinds, deathYear)` (`src/core/documentary/history-kinds.ts`) :
- **Tout sujet qui n'est pas une personne** est retenu, sans condition de nature ni de date (événement, œuvre, monument, épidémie, civilisation, culte, espèce, lieu…).
- **Personnes** : toute personne décédée (décision du 2026-10-08, après constat que Picasso, Dalí et Miró étaient exclus), quel que soit le métier ; les vivants et les personnes sans date de décès sont exclus.
- **Exclus** : les cartes qui ont déjà leur propre fiche (film, série, jeu vidéo, livre, morceau) et les pages d'homonymie.
- Quota : chaque nouvelle carte ouverte peut déclencher une recherche (101 unités sur 9 000 par jour) ; le cache partagé et l'index des chaînes limitent la dépense.

## Choisir sa vidéo (décision du 2026-10-08, maquette `.superpowers/mockups/documentaire-choix.html`)

- Le glyphe ≡▶ (avec le nombre total de vidéos) ouvre une **liste de toutes les vidéos** : rubrique « Proposées » puis « Pertinence moins sûre » ; chaque ligne montre miniature, titre, chaîne et durée. ⇄ passe à la vidéo suivante sans rien retenir.
- **Toucher une ligne retient la vidéo pour la carte**, chez l'utilisateur seulement (`doc-choice-v1`, la vidéo entière est gardée) : elle est la première à chaque ouverture, même si la recherche ne la renvoie plus. Pastille « ★ Votre choix » et lien « Revenir au choix automatique ». Masquer la vidéo choisie (✕) oublie le choix.
- Sans vidéo proposée, rien ne se lance d'office ; les possibles ne se choisissent que dans la liste.
- Les miniatures de la liste ne se chargent qu'à son ouverture.
- Un choix partagé entre tous les joueurs reste une idée mise de côté.

## Plein écran (décision du 2026-10-08)

Tous les lecteurs vidéo de l'application (documentaires YouTube et Commons, bandes-annonces des films et séries, bandes-annonces HLS des jeux vidéo) ont un bouton plein écran à quatre coins, à gauche du lien « ouvrir à la source » : le conteneur du lecteur passe en plein écran (`src/content/fullscreen.tsx`). Dans l'APK, `MainActivity` relaie le plein écran des vidéos de la WebView (`onShowCustomView` / `onHideCustomView`, retour arrière pour en sortir).

## Affichage (extension et mobile)

Section « Documentaire » sous l'introduction : lecteur miniature + ▶ (aucune requête tierce avant le clic, réutilise `TrailerPlayer.tsx` rendu générique), titre, chaîne, durée, source, ↗, vignettes des autres candidats, glyphes plutôt que texte. Intégration bloquée par le diffuseur : le lien ↗ reste disponible.

## Tests et livraison

- Tests unitaires : notation (bon documentaire, homonyme, extrait court, fiction), détection, circuit de proposition, cache.
- Réglage du seuil sur 30 cartes avant fusion.
- Fiche WikiHow et « Quoi de neuf » dans la même PR ; APK ajouté aux livraisons ; pré-production après fusion ; production seulement sur ordre explicite.

## Limites connues

- Quota YouTube : ~90 recherches neuves par jour hors index ; l'index couvre gratuitement les 3 000 vidéos récentes des cinq chaînes ; la couverture se remplit progressivement.
- Certains diffuseurs (Arte notamment) interdisent l'intégration.
- Tarifs et quotas Cloudflare/Google à reconfirmer sur leurs pages officielles au moment du montage.
