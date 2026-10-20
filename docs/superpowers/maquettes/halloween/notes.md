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

---

# Nuit du 31 — notes de la maquette des déguisés et des farces (PR 2, 2026-10-20)

Même page, autre galerie : `node build.mjs && node capture.mjs nuit=1` (parties `src/10-nuit31.js`). Mode animé :
`maquette.html?h=18.4&speed=2&date=2026-10-31` (`&event=pluie` pour la pluie) ; débogage `?T=18.5&date=2026-10-31&view=…`.
Le coucher du soleil suit l'heure d'hiver à partir du 25 octobre (17 h 22 le 31).

**Toujours une fonction pure de l'heure.** Le plan de la soirée est tiré par minute (graine de la rue, du jour et de la
météo) : chaque minute de 16 h à minuit, un nombre de groupes de chaque sorte selon le débit de l'heure ; chaque groupe a
un trajet d'un bord à l'autre fait de pièces `walk` / `stop` / `run` dont on lit la position à l'heure A.

## Ce qui est montré

| Groupe | Heures (débit par minute, rue entière) | Qui | Ce qu'ils font |
| --- | --- | --- | --- |
| Famille | 17 h 15 → 20 h 45 (1,4 au plus fort, 18 h-19 h 35) | 1 à 3 enfants déguisés (taille 0,55-0,7), seau citrouille (75 %) ou sac ; un adulte qui ferme la marche (30 % : chapeau, cornes ou oreilles) | s'arrêtent aux **entrées décorées** (80 %) ou aux immeubles à citrouille (35 %) ; on leur ouvre 85 % des fois (50 % sans décor) |
| Jeunes | 18 h 50 → 23 h 15 (1,8) | 2 à 4, déguisés à 90 % | 18 % des bandes **sonnent et s'enfuient** une fois |
| Adultes déguisés | 18 h 50 → 23 h 55 (1,4) | deux, au moins un déguisé (60 % chacun), sinon un accessoire | passent (vont à une soirée) |
| Passants ordinaires | 16 h 30 → minuit (0,9) | 6 % déguisés | passent |
| Veille et lendemain | 19 h → minuit | quelques adultes et jeunes déguisés isolés | passent |

- **Déguisements** (planche `planche-deguisements`) : sorcière (robe, chapeau pointu à bandeau), fantôme (drap, bas qui
  ondule et traîne, trous des yeux, pieds dessous), squelette (os blancs sur collant noir, crâne), vampire (cape doublée de
  rouge, col, cheveux plaqués), momie (bandelettes), zombie (peau verte, haillons, **bras tendus** en marchant), diable
  (cornes, queue fléchée), citrouille (boule orange sculptée, tige), chat noir (oreilles, queue), super-héros (cape,
  masque, insigne, bottes). Le costume est une couche **par-dessus le pantin** : couleurs de base remplacées, pièces
  ajoutées (derrière : capes, queues ; devant : chapeaux, os, bandelettes). Enfants : pas de diable ni zombie rares ; jeunes :
  pas de citrouille.
- **Porte-à-porte** (`bonbons-seq-1..8`, 24 s) : les enfants quittent le trottoir pour le pas de la porte (0-2,4 s),
  l'aîné sonne (2,6 s), le **hall s'allume** (4,5 s, minuterie de 2 min), **la porte s'ouvre** (7,5 s) : l'habitant tient
  une coupe ; il donne à chaque enfant à son tour (dès 9 s, 2,4 s chacun, les bonbons volent jusqu'au seau tendu), « merci ! »
  (17 s, sautillent), la porte se referme (19,5 s), ils rejoignent l'adulte resté au bord du trottoir et repartent. Sans
  réponse (13 s) : on sonne deux fois, on se regarde, on repart, aucune lumière.
- **Sonner et s'enfuir** (`sonner-fuir-seq-1..8`) : un jeune file à la porte, sonne, revient en courant ; la bande, restée
  accroupie un peu plus loin, détale en riant (course × 2,6 sur 42 px) ; le hall s'allume 8 s après, la porte s'ouvre à
  12 s, l'habitant regarde à gauche puis à droite (personne), referme à 18,5 s. Le hall reste allumé (minuterie).
- **Faire peur** (`peur-seq-1..8`, 20 h 30 → 22 h 45, une fois toutes les 7 min environ, pluie comprise) : un jeune
  déguisé est tapi dans l'embrasure entrouverte (dans l'ombre) ; au passage de quelqu'un, il surgit (« BOUH ! »), le passant
  sursaute (recule de 2 px, bras levés, traits de surprise), porte la main au cœur, puis repart plus vite ; le jeune rit et
  rentre, la porte se referme.
- **Une porte, une scène à la fois** : chaque porte tient la liste de ses créneaux occupés (porte-à-porte, farce, peur) ;
  une bande qui arrive pendant le créneau d'une autre passe son chemin.
- **Pluie** (`n31-pluie-19h15`) : familles × 0,35, jeunes × 0,7, adultes × 0,6, passants × 0,5 ; parapluies pour les
  adultes, les passants et un jeune sur quatre ; les enfants serrés contre l'adulte ; les farces continuent.
- **Animaux de la pièce** (`animaux-seq`, schéma) : un groupe déguisé dans l'axe de la fenêtre ; le chien éveillé se lève,
  court à la fenêtre (1,2 s), pattes sur l'appui, aboie (2,4 s) ; le chat éveillé dresse les oreilles, sursaute (dos rond,
  poils hérissés), feule et file sous le canapé une fois sur trois ; le groupe passé, le chien retourne se coucher. Endormis :
  rien. Même chose au passage du promeneur de chien.

## Captures (`captures/`)

`n31-17h`, `n31-18h30` (+ `-rue`, `-rue2` : moitiés de rue ×4), `n31-19h15`, `n31-21h30`, `n31-pluie-19h15`,
`veille-30oct-21h30` ; séquences à la porte de l'immeuble héros `bonbons-seq-*` (18 h 30), `sonner-fuir-seq-*` (21 h 10),
`peur-seq-*` (21 h 40) ; `planche-deguisements` (×6) ; `animaux-seq` (×4).

## Écarts assumés de la maquette

- Les figures de la rue sont dessinées avec un voile de nuit à moitié (elles sont sous les lampadaires et les vitrines),
  sans quoi les déguisements ne se lisent pas.
- L'immeuble héros a ses trois scènes imposées (familles, sonnette, peur) ; ailleurs, tout vient du tirage.
- L'habitant qui ouvre n'est pas relié à un foyer (tenue tirée de la porte, comme l'habitant des décors d'entrée).
- Les animaux sont un schéma : dans l'app, ils gardent leurs sprites et leur cerveau (`pets/`).
