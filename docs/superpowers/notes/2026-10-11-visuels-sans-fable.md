# Visuels faits sans Fable (à repasser par Fable si souhaité)

Règle de l'utilisateur (2026-10-11) : les images de qualité et les séquences d'animation passent au maximum par Fable ; quand ce n'est pas le cas, on le note ici pour pouvoir les faire retoucher plus tard.

| Date | Visuel | Fichiers | Fait par | État |
|---|---|---|---|---|
| 2026-10-11 | G4a : devantures par métier (6 familles), 32 intérieurs de vitrine, 3 entrées d'immeuble, rideau cellulo | maquette `docs/superpowers/maquettes/g4-commerces/` ; code `src/core/library/paint/shop/` (facade, interiors-*, kit, entrance), `src/content/shop-sprites.tsx` (ShutterCel) | Opus 5.5 | maquette validée par l'utilisateur (extérieurs v1, intérieurs v2), portée à l'identique |

Pour une reprise par Fable : partir de la maquette (`devantures.html`, `interiors.js`, `interieurs.html?from=0&n=6`), retoucher le dessin, puis reporter les mêmes changements dans les peintres du cœur (le kit `tools(k)` reprend les fonctions de `interiors.js` sous les mêmes noms et avec les mêmes nombres).
