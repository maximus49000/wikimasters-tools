# Catégorie « Livres » — feuille de route des plans

Spec : `docs/superpowers/specs/2026-10-07-livres-design.md` (validée le 2026-10-07). La spec couvre plusieurs sous-systèmes indépendants : elle est livrée en plans successifs, chacun produisant un logiciel testable et fusionnable seul (une PR par plan, pré-prod après chaque fusion). Chaque plan est écrit juste avant son exécution, avec le code réel du moment.

| # | Plan | Livre | Dépend de |
|---|---|---|---|
| 1 | **Ma collection dans la filmographie** (`2026-10-07-collection-filmographie.md`) | composant `WorkList` partagé, repérage des cartes possédées (cadre de rareté, ×N, bouton carte, « N / M dans ma collection », interrupteur), `CardThumb`, `collection-marks` | rien |
| 2 | **Carte livre : section « Livre » et couverture** | catégorie « Livre » (natures, filtre), Wikidata P648/P50, Open Library, synopsis Wikipédia, `BookSection`, glyphe `book` + ⇄ « Changer de livre », couverture prioritaire (`createMediaArt`, `ART_VERSION`), fiche WikiHow | 1 (glyphes, `CardThumb`) |
| 3 | **Prix et achat** | clé Google Books (ebook), liens libraires par ISBN, prix Amazon.fr en direct (`retail-price.ts`, désactivable), prix de référence | 2 |
| 4 | **Lecture gratuite** | Wikisource FR, Internet Archive, Gutenberg, date de passage au domaine public | 2 |
| 5 | **Bibliographie de l'écrivain** | `WriterSection` sur `WorkList`, requête Wikidata filtrée, repérage des livres possédés par slug, ouverture d'un livre dans la section | 1, 2 |

Règles de livraison communes (mémoire du projet) : branche dédiée, `npm run typecheck`, `npm test`, `npm run build` ; PR ouverte puis fusionnée sans demander ; livraison en pré-prod (`npm run preprod`) ; production seulement sur ordre explicite ; APK sur demande ; fiche WikiHow dans la même PR que chaque fonctionnalité.
