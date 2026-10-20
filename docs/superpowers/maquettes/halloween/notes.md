# Halloween — notes de la maquette des décors (2026-10-20)

Maquette jetable de la PR 1 (décors posés par les habitants et par la mairie), bâtie sur celle de la vie des étages
(`../vie-etages`, recopiée telle quelle avec cinq points d'accroche) : `maquette.html`, assemblée depuis `src/*.js` par
`node build.mjs` ; captures par `node capture.mjs` (Chromium headless, chaque canvas exporté dans `captures/`).
Spec : `docs/superpowers/specs/2026-10-20-bibliotheque-halloween-design.md`.

**Toute la scène est une fonction pure de la date et de l'heure.** Le plan des décors (qui décore, quoi, où, quand il pose,
quand il retire) est tiré une fois de la graine de la rue et de l'année ; chaque élément est ensuite absent, en pose, posé,
en dépose ou retiré selon l'heure absolue. Mode animé : `?h=15&speed=20&date=2026-10-24` (+ `zoom=1`) ; débogage :
`?T=15.05&date=2026-10-24&view=x0,y0,w,h,scale`.

## Ce qui est montré

- **Citrouilles** (≈ une fenêtre sur huit) : sur l'appui d'une fenêtre ordinaire, sur la rambarde d'un balconnet ou d'un
  balcon filant. Teinte, aplatissement, tige et visage tirés (triangles, rond et dents, yeux méchants, non sculptée de jour) :
  jamais deux pareilles côte à côte. Allumées la nuit, indépendamment de la pièce, jusqu'entre 0 h 20 et 1 h 30 ; plus
  allumées après la nuit du 31 au 1er.
- **Balcons filants** : sorcière (silhouette découpée, balai contre le mur) derrière le garde-corps ; squelette assis sur la
  rambarde, corbeau perché, araignée géante pendue sous la dalle (yeux rouges la nuit), devant.
- **Entrées** : toile d'araignée dans l'angle de l'encadrement (une ou deux) ou fantôme en drap pendu à l'imposte ; parfois un
  chaudron au pied (lueur verte et bulles la nuit).
- **Lampadaires (mairie)** : lanterne citrouille pendue à une potence (allumée avec le lampadaire) ou guirlande de
  chauves-souris en papier.
- **Style de façade** : `citrouilles`, `sorcellerie` ou `macabre` (un style dominant et des accents), qui pondère les décors.

## Gestes (rien n'apparaît sur place)

| Geste | Durée | Déroulé |
| --- | --- | --- |
| Citrouille, fenêtre ordinaire | 1 min 12 | la fenêtre s'ouvre, l'habitant se penche, la pose (à mi-geste), se redresse, referme |
| Décor de balcon filant | 2 min 12 | la porte-fenêtre s'ouvre, il sort avec l'objet, le pose (55 %), rentre ; l'araignée descend au bout de son fil |
| Porte (toile, fantôme) | 4 min | il sort par la porte (hall éclairé la nuit) avec l'escabeau replié et le décor, déplie l'escabeau, monte, accroche (60 %), descend, replie, rentre |
| Chaudron | 1 min 18 | aller-retour à la main depuis la porte, il le pose (ou le reprend) en s'accroupissant |
| Lampadaire (mairie) | un créneau de la fenêtre 9 h-17 h (2 h ici, 4 lampadaires) | camion-nacelle : arrive, stabilisateurs, l'ouvrier passe de la cabine à la nacelle, la flèche monte, il fixe, redescend, repart |

Au retrait, mêmes gestes à l'envers : l'objet disparaît du décor quand il passe dans les mains.

## Captures (`captures/`)

- `mairie-24oct-10h` (+ `-zoom` sur le lampadaire en cours) et `nacelle-seq-1..7` : la mairie pose, samedi 24 de 9 h à 17 h.
- `habitants-24oct-15h05` et `porte-seq-1..9` (immeuble héros, toutes les ~30 s) : toile posée à l'escabeau, chaudron, citrouille.
- `soir-27oct-19h` : après le travail, une sorcière arrive au balcon noble ; citrouilles allumées au crépuscule.
- `nuit-31oct-21h` : tout est posé. `nuit-1nov-0h50` : pièces éteintes, des citrouilles encore allumées.
- `soir-2nov-21h` : la fête est passée, plus rien n'est allumé. `retrait-3nov-11h` : un habitant reprend sa toile sur
  l'escabeau, la mairie décroche. `apres-9nov-12h` : rue nue.
- `planche-decors` (×4) : chaque décor de nuit (allumé) et de jour.

## Écarts assumés de la maquette

- Les gestes sont dessinés par-dessus la vie des étages (pas d'arbitrage avec les autres scènes du foyer) ; dans l'app ce sont
  des scènes de l'emploi du temps (spec §3.3).
- L'immeuble héros a des horaires imposés pour les captures (`hwForceHero`).
- La maquette n'a que quatre lampadaires ; les créneaux de la mairie durent donc 2 h chacun, comme les drapeaux dans l'app.
