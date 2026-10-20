# Ville Ghibli — le fond de la ville vivant (design)

Date : 2026-10-20. Statut : **catalogue choisi par l'utilisateur, maquette Fable en cours** (validation avant tout code).

Chantier 3 sur 3 de la refonte « naturelle et logique » de la scène Ville (1 : façades parisiennes, PR #342 ; 2 : vie au-dessus
de la rue, PR #343-345). Les deux premiers chantiers avaient explicitement laissé le fond (mur du fond, colline) de côté.

## 1. Intention

Demande de l'utilisateur (2026-10-20) : « rajouter de la vie dans l'arrière-plan en respectant les règles naturelles », et
« auditer les bâtiments : certains sont mal coupés et laissent des carrés de couleur ».

Règles reprises des chantiers 1 et 2 :

- Rien n'apparaît ni ne disparaît sur place : on arrive et on repart par un bord, une porte, une route ou en vol.
- Une ville qui n'est ni synchrone ni prévisible : les tirages dépendent de la graine, de la date et de l'objet, et l'état à
  l'instant t reste une fonction pure de (date, heure).
- Le graphisme classique reste strictement inchangé.
- Pas de baisse de fluidité sur Android : calques à nœuds constants, rien n'est repeint à chaque image.

## 2. Audit des bâtiments (banc `.superpowers/harness-fond`, graines 1, 7 et 42, scène de 1 440 × 340 agrandie × 4)

Captures annotées : `docs/superpowers/maquettes/fond-ville/audit-graine{1,7,42}.png`. Les fenêtres en orange sont celles que
le calque SVG allume la nuit (`farWindows`). Les numéros renvoient aux défauts ci-dessous.

| # | Défaut | Cause dans le code |
|---|---|---|
| 1 | **Carrés de couleur sur les toits du mur du fond.** De jour, des fenêtres bleues sont peintes sur la bande du toit. La nuit, des fenêtres allumées sont posées sur la ligne du toit, et sur les toits à pignon elles débordent dans le ciel (coins du triangle). | La grille de fenêtres du mur du fond (`paintFarWall`, hill-painter.ts:231) et `farWindows` (facades.ts:22) commencent à `top + 5`, alors que le toit occupe `top … top + FAR_ROOF_H` (6 px). |
| 2 | **Immeuble du fond coupé bas** : entre deux immeubles du premier plan, un bout de toit rouge tient à mi-hauteur, avec la colline verte au-dessus. Il se lit comme un trou dans le décor. | Le mur du fond tire ses hauteurs entre 50 et 120 (× étirement) sans tenir compte de ce qui est visible devant. Un immeuble bas tombe dans une fente étroite. |
| 3 | **Grands triangles en biais** sur les façades (fond et premier plan) : ombre portée d'un voisin de gauche plus haut, tirée en diagonale du toit jusqu'au trottoir sur toute la hauteur. Sur certains immeubles, elle se lit comme un aplat de couleur posé au hasard. | `poly(... [x, left.top] → [x + (ground − left.top) × 0,55, ground] ...)` dans `paintFarWall` (hill-painter.ts:203) et `paintFacade` (facade-painter.ts:50). Le voisin est pris jusqu'à 26 px de distance (`LEFT_GAP`), même quand une rue le sépare. |
| 4 | **Mur du fond qui descend jusqu'au trottoir** dans les fentes entre deux immeubles du premier plan, avec ses fenêtres jusqu'au sol. Le fond semble posé sur le trottoir de la rue. | Le mur du fond est peint jusqu'à `ground`, et sa grille de fenêtres jusqu'à `ground − 8`. |
| 5 | **Morceaux de toit rectangulaires** (carré rouge entre deux immeubles) : bout de versant d'un immeuble du fond, rogné net par les façades voisines. | Même origine que le défaut 2 : toit à 6 px d'un immeuble du fond visible seulement sur quelques pixels. |
| 6 | **Grandes dalles plates** : immeubles du fond plus hauts que la rue, sans étages ni corniches, avec une grille régulière de fenêtres. Ils se lisent comme du carton. Certains sortent par le haut de la scène. | Grille uniforme (colonnes de 8 px, rangs de 11 px), toit de 6 px, hauteur tirée indépendamment du premier plan. |

Les maisons de la colline n'ont pas de défaut de coupe visible ; elles n'ont simplement aucune fenêtre allumée la nuit.

Corrections proposées (tirage de la rue inchangé, `PAINT_VERSION` incrémentée) :

- **D1** : les fenêtres du fond (peintes et allumées) commencent sous l'égout du toit, à `top + FAR_ROOF_H + 3`. Un test
  vérifie qu'aucune fenêtre du fond ne recoupe le toit ni le ciel.
- **D2 / D5** : la hauteur d'un immeuble du fond est relevée au minimum à la hauteur de ses voisins du premier plan, plus un
  étage. On voit ainsi toujours son toit au-dessus de la rue, et aucun bout de toit ne reste coincé dans une fente. Seule la
  hauteur dessinée change, le tirage est conservé.
- **D3** : ombre portée seulement pour un voisin mitoyen (écart ≤ 2 px), et limitée à une hauteur d'étage sous le toit du
  voisin, avec un bord net, à la façon des décors Ghibli. Ailleurs, pas d'ombre en biais.
- **D4** : dans une fente du premier plan, le mur du fond s'arrête au haut du rez-de-chaussée. En dessous, on peint une ruelle
  ou une cour en retrait (ton d'ombre, sans fenêtres), et ses fenêtres s'arrêtent au même niveau.
- **D6** : le mur du fond est redessiné en immeubles à étages (bandeau d'étage, corniche, rythme de fenêtres par travée,
  volets fermés ou ouverts tirés), plafonnés sous le haut de la scène. C'est ce qui porte la vie du §3.

## 3. Vie dans le fond — propositions (à choisir)

Le fond est petit à l'écran : une fenêtre du mur du fond fait 3,5 × 5 px, une maison de la colline fait de 10 à 30 px. La vie
doit donc se lire par la lumière, la fumée, le mouvement d'ensemble et la silhouette, jamais par le détail d'un geste.

| Réf. | Proposition | Logique naturelle |
|---|---|---|
| A | **Fenêtres allumées de la colline** (aujourd'hui toujours éteintes) et du mur du fond, avec une présence simplifiée par logement : allumage échelonné au crépuscule, extinctions une à une dans la soirée, quelques lève-tôt avant l'aube. | Même courbe horaire que la rue (`window-lights.ts`), atténuée par la brume. Tirage par (graine, date, fenêtre), jamais tout en même temps. |
| B | **Volets et rideaux du fond** : de jour, certains volets se ferment l'après-midi en été et à la nuit ; quelques battants s'ouvrent le matin. | Pose fixe par heure, sans animation de personnage (trop petit). |
| C | **Fumées de cheminée** sur la colline et le mur du fond, quand il fait froid ou le matin en hiver : panache peint qui s'étire dans le sens du vent. | Saison et température (météo existante), heure (matin, soir). Le panache naît au conduit et se dissipe, jamais coupé net. |
| D | **Route en lacets sur la colline** : quelques voitures et un bus minuscules qui montent et descendent, phares la nuit. | Trafic selon l'heure (pointes du matin et du soir, nuit presque vide). Les véhicules entrent et sortent par les bords ou derrière une maison. |
| E | **Tour-horloge à l'heure réelle** (aiguilles), cadran éclairé la nuit. | Heure de la scène. |
| F | **Vols d'oiseaux au loin** : étourneaux en nuée au crépuscule en automne et en hiver ; martinets en été le soir. | Saison et heure, entrée et sortie par les bords du ciel. |
| G | **Arbres de la colline** : feuillage au vent (léger balancement selon la météo) et saisons (vert, roux à l'automne, nu l'hiver, fleuri au printemps). | Calendrier réel et vent. Les saisons étaient prévues pour ce chantier dans la spec des façades. |
| H | **Linge aux fenêtres du fond** les jours secs, rentré avant la pluie et le soir. | Météo et heure. |
| I | **Chantier ponctuel** : une grue sur la colline certaines semaines, flèche qui pivote en heures ouvrées. | Semaines tirées par (graine, année) ; arrêt le soir et le week-end. |

Ajouts proposés par Claude à la demande de l'utilisateur (« je te laisse proposer d'autres éléments ») :

| Réf. | Proposition | Logique naturelle |
|---|---|---|
| J | **Funiculaire de la colline** (clin d'œil à Montmartre) : deux cabines qui se croisent à mi-pente, fenêtres éclairées la nuit. | Service de 6 h à 0 h 45, environ toutes les 5 min, plus espacé tard le soir ; arrêt en gare en haut et en bas. |
| K | **Chapelets de réverbères** de la colline et de la route qui s'allument en vague au crépuscule et s'éteignent à l'aube. | Même seuil de lumière que les lampadaires de la rue, avec un léger décalage par quartier. |
| L | **Heure pile** : la cloche de la tour fait s'envoler les pigeons du clocher, qui tournent une fois puis se reposent. | Heures de 8 h à 21 h seulement, sans réveil la nuit. |
| M | **Brume au creux de la colline** les matins frais d'automne et d'hiver, qui se lève dans la matinée. | Saison, heure et humidité (météo). |
| N | **Monuments illuminés** (tour, dôme) du crépuscule à 1 h ; drapeaux tricolores qui flottent sur les monuments les jours fériés nationaux, au vent. | Calendrier (`city/calendar.ts`) et vent. |
| O | **Toits-terrasses de la colline** : parasols ouverts les après-midis d'été ensoleillés, plantes en pot. | Saison, météo et heure ; les parasols sont repliés le soir et sous la pluie. |

**Choix de l'utilisateur (2026-10-20)** : tout le catalogue A à I est retenu, avec les ajouts J à O proposés à sa demande.
Toutes les corrections de l'audit (§2) sont retenues. **Une seule maquette Fable** couvre les corrections et la vie du fond ;
elle est validée avant tout code.

## 4. Étapes

1. ~~Choix du catalogue (§3) et des corrections de l'audit (§2)~~ : fait le 2026-10-20.
2. Maquette par Fable (règle du projet pour les visuels) : fond corrigé, puis la vie retenue, de jour, au crépuscule, la nuit,
   en hiver et en automne. La validation par l'utilisateur se fait avant le code.
3. Plan d'implémentation, puis code : corrections de l'audit d'abord, vie du fond ensuite (découpage en PR fixé dans le plan).
4. Captures au banc comparées à la maquette, puis fusion et `npm run preprod`.

## 5. Hors périmètre

Les cinq autres paysages ; intérieur de la pièce (G6) ; animaux de la pièce (G7) ; personnages animés aux fenêtres du fond
(trop petits pour être lisibles) ; fiche WikiHow (globale à la fin de G7).
