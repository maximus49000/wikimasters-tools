# Catégorie « Livres » — feuille de route des plans

Spec : `docs/superpowers/specs/2026-10-07-livres-design.md` (validée le 2026-10-07). La spec couvre plusieurs sous-systèmes indépendants : elle est livrée en plans successifs, chacun produisant un logiciel testable et fusionnable seul (une PR par plan, pré-prod après chaque fusion). Chaque plan est écrit juste avant son exécution, avec le code réel du moment.

| # | Plan | Livre | Dépend de | Statut |
|---|---|---|---|---|
| 1 | **Ma collection dans la filmographie** (`2026-10-07-collection-filmographie.md`) | composant `WorkList` partagé, repérage des cartes possédées, `CardThumb`, `collection-marks` | rien | **fusionné** (PR #165, pré-prod 522) |
| 2 | **Carte livre : section, couverture, glyphe** (`2026-10-07-livres-carte.md`) | natures « Livre » (filtre), Wikidata P648, Open Library, synopsis agrandi (Wikipédia), `BookSection`, glyphe livre sur la carte et en-tête, couverture prioritaire, fiche WikiHow | 1 | **fusionné** (pré-prod) |
| 3 | **Changer de livre ⇄** | glyphe ⇄ dans l'en-tête, fenêtre de recherche Open Library, « Aucun livre », retour au choix automatique, choix mémorisé (`book-choice-v1`) ; lien collé reporté | 2 | **fusionné** (pré-prod) |
| 4 | **Prix et achat** | clé Google Books (ebook) — la fenêtre « Changer de livre » devra aussi chercher dans Google Books (la spec le prévoit ; le plan 3 ne cherche que dans Open Library), liens libraires par ISBN, prix Amazon.fr en direct (`retail-price.ts`, désactivable), prix de référence | 2 | à écrire |
| 5 | **Lecture gratuite** | Wikisource FR, Internet Archive, Gutenberg, date de passage au domaine public | 2 | à écrire |
| 6 | **Bibliographie de l'écrivain** | `WriterSection` sur `WorkList`, requête Wikidata filtrée, repérage des livres possédés par slug (étendre `CollectionMarks`), ouverture d'un livre dans la section | 1, 2 | à écrire |

À reprendre au plan 3 (revue finale du plan 2) : la couverture par défaut n'utilise QUE l'identifiant Wikidata (P648) — pas de repli par titre — tant que l'auteur du livre n'est pas vérifié ; la fiche garde le repli par titre exact (⇄ permettra de corriger). Reconsidérer avec une concordance d'auteur. À reprendre au plan 6 (revue finale du plan 1) : `CollectionMarks` expose `ownership()` (cinéma) alors que la spec parle de `cardOf/count` ; aria-label des lignes `WorkList` sans info de possession ; pastille ×N qui déborde de 6 px ; `resolveAll` pourrait pré-filtrer par `screen-v1`.

Règles de livraison communes (mémoire du projet) : branche dédiée, `npm run typecheck`, `npm test`, `npm run build` ; PR ouverte puis fusionnée sans demander ; livraison en pré-prod (`npm run preprod`) ; production seulement sur ordre explicite ; APK sur demande ; fiche WikiHow dans la même PR que chaque fonctionnalité.
