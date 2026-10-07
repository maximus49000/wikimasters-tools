# Livres — plan 6 : bibliographie de l'écrivain

Spec : `docs/superpowers/specs/2026-10-07-livres-design.md` (sections « Fiche écrivain » et « Ma collection dans les listes »). Plans 1 à 5 fusionnés.

**But** : sur la carte d'un écrivain (personne dont le métier est écrivain, poète, romancier, dramaturge, essayiste, auteur…), une section « Bibliographie » sur le composant `WorkList` de la filmographie : œuvres les plus connues (Wikidata `P50`, `sitelinks >= 8`, repli à 3), du plus récent au plus ancien, livres possédés repérés (cadre de rareté, ×N, bouton carte, « Seulement ma collection »), ouverture d'un livre dans la section (synopsis, prix, lecture gratuite) avec ← « Retour à la bibliographie ».

## Faits vérifiés (sondage du 2026-10-07)

- Requête SPARQL unique par auteur (`query.wikidata.org`, CORS ouvert) : `?w wdt:P50 wd:Q… ; wikibase:sitelinks ?sl`, `FILTER(?sl >= 8)`, date de publication (P577), identifiant Open Library (P648, parfois une édition `…M`), titre de l'article Wikipédia FR (= slug de la carte du livre), `GROUP BY` pour éviter les doublons de dates. Hugo : *Les Misérables, Notre-Dame de Paris, L'Homme qui rit…*
- Couverture d'un livre : `covers.openlibrary.org/w/olid/OL…W-S.jpg?default=false` (redirige vers archive.org) ; aucune requête de plus par ligne.
- Métiers (P106) : écrivain Q36180, poète Q49757, romancier Q6625963, dramaturge Q214917, essayiste Q11774202, auteur Q482980, auteur jeunesse Q4853732.

## Écart assumé avec la spec

Les livres possédés se repèrent **dans le service** (`bibliography()` croise la liste de la Collection et le titre d'article de chaque œuvre) et non dans `CollectionMarks` : la correspondance livre → carte est une simple recherche par slug, sans résolution de fond ; `CollectionMarks` ne gère que les identifiants TMDB. La note de la ligne (★ Open Library) est omise : elle coûterait un appel par livre.

## Tâches

1. `book-kinds.ts` : `isWriterCard`. Tests.
2. `wikidata-book.ts` : `fetchWriterWorks(fetch, slug)` (élément Wikidata de l'article, SPARQL, repli à 3, regroupement, 40 au plus, plus récent d'abord). Tests.
3. `book-service.ts` : `bibliography(slug)` (vue + livres possédés, mémorisé 7 jours), `workDetail(item)` (fiche d'un livre de la liste, auteur concordant exigé hors identifiant Open Library), `reading` accepte un slug absent. Tests.
4. `WriterSection.tsx` (sur `WorkList`), `BookSection.Detail` exporté, `mount.tsx` (le même hôte porte `BookSection` et `WriterSection`), fiche WikiHow `livres-v5`, build, PR, fusion, pré-prod.
