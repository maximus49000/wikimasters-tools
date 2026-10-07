# Livres — plan 5 : lecture gratuite

Spec : `docs/superpowers/specs/2026-10-07-livres-design.md` (section « Lecture gratuite »). Code réel du moment : plans 1 à 4 fusionnés.

**But** : sur la fiche d'un livre, un bloc « Lecture gratuite » : bouton principal « Lire gratuitement » (Wikisource, sinon Gutenberg, sinon Internet Archive), les autres sources en lignes secondaires ; sinon une ligne « Pas de texte libre » avec « protégé jusqu'en AAAA » quand la mort de l'auteur est connue (+ 70 ans, droit français).

## Faits vérifiés (sondage du 2026-10-07)

- Wikidata `wbgetentities` accepte `props=claims|sitelinks` + `sitefilter=frwikisource` ; P2034 = identifiant Gutenberg (chiffres) ; P50 = auteur ; P570 de l'auteur = décès.
- Wikisource FR : `list=search` renvoie aussi des sous-pages (`Les Misérables (1908)/Tome 2`) : seule une page principale (sans `/`) dont le titre, privé d'une parenthèse finale, est égal au titre demandé est retenue.
- Open Library : `ebook_access` (`public` / `borrowable` / `printdisabled`) et `ia` (liste d'identifiants Internet Archive) ; **la liste mélange scans libres et prêts** → Internet Archive `advancedsearch` (CORS ouvert) avec `NOT access-restricted-item:true` sur les 30 premiers identifiants garde les scans réellement libres.

## Tâches

1. **`src/core/book/reading.ts`** : `ReadingLink`, adresses (Wikisource, Gutenberg, Internet Archive), `readingLinks()` (ordre Wikisource, Gutenberg, Archive), `protectedUntil(deathYear)`. Tests.
2. **`wikidata-book.ts` / `book-repo.ts`** : `CardBook` gagne `wikisource`, `gutenberg`, `authorDeath` ; requête `claims|sitelinks` + seconde requête sur les auteurs (P570) ; clé `book-v2`. Tests.
3. **`wikisource-api.ts`, `archive-api.ts`, `openlibrary-api.ts`** : recherche stricte d'un texte ; premier scan libre ; `OlWork.freeScans` (identifiants `ia` quand `ebook_access = public`). Tests.
4. **`book-service.ts`** : `reading(slug, detail)` → `{ links, protectedUntil? }`, jamais d'erreur ; avec un choix manuel, seules la recherche Wikisource et Open Library comptent (les identifiants Wikidata sont ceux de la carte, pas du livre choisi). Mémorisé 7 jours. Tests.
5. **`BookSection.tsx`** : bloc `data-wmt-book-reading`, câblage `overlay.ts`, fiche WikiHow `livres-v4`, `npm run build`.
