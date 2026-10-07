# Visite guidée : scènes réelles sur toutes les interfaces

Date : 2026-10-07. Statut : validé en conversation, à implémenter. Étend `2026-10-07-nouveautes-wikihow-design.md` (la visite guidée y est déjà décrite).

## Objectif

Une étape de visite doit montrer l'élément **en vrai**, où qu'il soit : page du site, mode ou vue à activer, menu, ou fiche d'une carte d'un certain type. L'app navigue et prépare l'écran toute seule. La visite couvre toutes les interfaces de l'extension, pas seulement les fiches de carte.

## Modèle de scène

Une étape peut déclarer une `scene` :

- `page` : chemin du site où l'élément se trouve (`/collection`, `/marketplace`, `/trades`, `/profile`…).
- `reveal` : éléments à toucher, dans l'ordre, pour le faire apparaître (un mode, une vue, le menu Plus). Chaque élément est un sélecteur CSS ou `{ text }` (bouton ou lien au libellé exact). Liste blanche : uniquement des bascules d'affichage écrites dans les fiches, jamais une action destructrice ou d'envoi.
- `card` : l'élément est dans la fiche d'une carte de cette nature : `game`, `music`, `screen`, ou `any` (cartes liées, enchères).

## Résolution d'une étape (dans cet ordre)

1. L'élément est déjà à l'écran : on l'éclaire.
2. Mauvaise page : on mémorise la visite et on va à la page (`window.location.assign`) ; la visite reprend au chargement.
3. `reveal` : on touche chaque élément (attente jusqu'à 2 s chacun) ; on s'arrête dès que la cible est là.
4. `card` : on cherche dans la Collection (cartes connues, ordre de la Collection, plafonnées à 300) la première carte de la bonne nature, on l'ouvre avec le mécanisme existant (`openCardInPage`) et on attend la cible (jusqu'à 10 s). Bandeau vert « Carte de votre Collection : <titre> ».
5. Aucune carte, ou cible introuvable : **fiche de démonstration** de la nature voulue, avec des données fictives figées. Bandeau orange « Illustration : cette carte n'existe pas et n'entre pas dans votre Collection » et fond rayé.
6. Toute autre cible absente : étape en texte seul avec l'indication de page déjà prévue.

## Fiche de démonstration

- Mêmes composants de section que la vraie fiche, branchés sur un service construit avec de fausses dépendances (aucune requête réseau, mémoires en RAM, rien écrit dans la Collection, l'historique des prix ni le stockage de l'extension).
- Les registres de services (`setGameService`, …) sont échangés pendant l'illustration puis restaurés à la fermeture.
- Étape 1 de livraison : nature `game`. Natures `music`, `screen`, `any` (cartes liées, enchères) : livraison suivante (même mécanisme) ; en attendant, ces étapes retombent sur le texte seul.

## Navigation et état

- L'état de la visite (étapes, index, page de départ, carte en attente) est gardé en `sessionStorage` (`wmt:tour`, 10 minutes). Au démarrage de la surcouche, si une visite est en cours, elle reprend toute seule.
- Une carte déjà demandée avant une navigation n'est pas rechoisie à la reprise : on attend l'ouverture déjà lancée.
- **Fin** (« Terminer » ou « Quitter la visite ») : fermeture de la fiche ouverte (touche Échap), puis retour à la page de départ si l'on en est parti, démonte la démo et restaure les services.

## Fiches concernées

Chaque fiche du catalogue reçoit la scène qui convient : sélection (`/collection`, mode Sélectionner), Toile (`/collection`, vue Toile), prix en fond et tri (`/collection`), cartes liées, enchères, écouter, films, jeux vidéo (fiche d'une carte de la bonne nature), menu Plus (WikiHow, Paramètre d'extension, anomalie : ouverture du menu Plus sur mobile), ainsi que la Collection, le Marché (`/marketplace`) et les Échanges (`/trades`) pour leurs ajouts propres. La règle de la mémoire reste : toute fonction ajoutée ou modifiée reçoit sa fiche avec sa scène dans la même PR.

## Limites connues

- L'ouverture du menu Plus sur mobile repose sur le bouton du site repéré par son libellé ; s'il change, l'étape retombe sur le texte seul.
- Fermer la fiche par Échap suppose que la fiche native du site réagit à cette touche (à vérifier à la main).
- Les natures de carte sont lues avec les services existants ; une nature absente de la Collection donne la démonstration.

## Tests

Unitaires : choix de la carte (nature trouvée, absente, ordre, plafond), persistance et reprise de la session (expiration, forme invalide), résolveur de scène avec dépendances simulées (cible présente, mauvaise page, reveal, carte réelle, repli démo, repli texte), nettoyage de fin (fiche fermée, retour à la page de départ, services restaurés), fiche de démonstration (aucune requête réseau, aucune écriture). Vérification manuelle dans Chrome et sur mobile.

## Contenu didactique (demande du 2026-10-07)

Une étape ne se limite pas à nommer l'élément : `text` dit à quoi il sert exactement, et `details` (au moins deux paragraphes titrés) donne tout ce qui aide à le comprendre et à s'en servir : d'où viennent les données (source, fréquence, ce qui est mémorisé), comment s'en servir pas à pas, limites et pièges. La bulle défile quand le contenu est long. Les faits sont vérifiés dans le code avant d'être écrits. Un test du catalogue refuse une étape qui n'a pas ces paragraphes.

Choix de conception : la visite n'active jamais une vue mémorisée (Toile, Monde…) pour ne pas modifier les préférences de l'utilisateur ; elle éclaire le sélecteur et explique la vue.
