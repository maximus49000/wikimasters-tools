# Wikimasters Tools (non officiel)

Extension Chrome, Firefox et Firefox Android **non officielle et en lecture seule** pour [WikiMasters](https://www.wiki-masters.com).
Elle n'est liée ni au jeu, ni à Wikipédia.

## Ce que fait la V1

Un badge de prix sous chaque carte que vous avez déjà achetée ou vendue : médiane de vos
transactions (ventes et achats), fourchette, nombre de transactions et tendance. Le calcul se fait
dans votre navigateur ; rien n'est envoyé à un serveur.

Une pastille verte « $ » en haut à droite des cartes que vous avez achetées indique le prix d'achat (ou la fourchette).

Sur la fiche d'une carte, un lien « Voir l'article sur le marché » ouvre un popup avec le nombre
d'offres, le nombre d'enchères déjà misées, le prix moyen et la liste des offres connues. Ces données
viennent **uniquement** des enchères que le site charge lui-même quand vous ouvrez la page Marché :
l'extension les observe passivement (voir aussi le relevé en arrière-plan ci-dessous). Ce sont donc des chiffres d'échantillon
(« observé il y a X min »), pas un état complet du marché. Aucun pseudo de joueur n'est conservé.

Le popup propose aussi « Rechercher sur le marché » : l'extension saisit le titre de la carte dans le champ de
recherche du site et clique sur son bouton « Rechercher » (une saisie et un clic, comme vous le feriez).
C'est le site qui envoie sa propre requête ; l'extension se contente de l'observer. Le site affiche 50
résultats à la fois, l'extension ne charge jamais les pages suivantes.

Quand la recherche vous a envoyé sur le Marché depuis une fiche, le popup propose « ← Retour à la carte » :
l'extension retourne à la page d'origine, saisit le titre dans la recherche de la Collection et clique sur
la carte pour rouvrir sa fiche (vos filtres et votre tri précédents ne sont pas conservés).

### Relevé du marché des cartes de votre Collection

Le marché compte des dizaines de milliers d'enchères : l'extension ne le parcourt **jamais**. Pour les seules
cartes de votre Collection affichées à l'écran, elle envoie la même recherche par titre que la page Marché
du site (une requête par carte, 1,5 s entre deux, au plus 60 par passe), **une fois par carte et par 30 min**.
Seules les enchères de la carte elle-même sont gardées (pas les titres voisins). Elle enregistre localement :

- à chaque relevé, la **moyenne des enchères déjà misées** de la carte (avec min et max), gardée 7 jours, puis un
  cumul par jour gardé 365 jours ;
- par tranche d'**heures restantes** (7 h 11 → tranche 7 h), le nombre d'enchères, le min, le max et la moyenne.

Chaque carte de la Collection affiche, sous sa rareté (à gauche), la moyenne des 7 derniers jours avec une flèche
▲ verte, ▼ rouge ou = grise selon la variation du dernier relevé. La fiche de la carte montre le graphique
(Heure / Jour / Semaine / Mois / Année) et le popup du marché détaille les tranches d'heures.

Chaque carte de la Collection affiche sa case de prix : « ??? » tant qu'aucune enchère avec mise n'a été observée sur elle ; si une valeur a déjà été observée mais plus récemment (plus de 7 jours), la dernière valeur connue s'affiche en grisé et en italique, avec son ancienneté dans l'infobulle.

Pendant qu'une carte attend son relevé ou est en cours de relevé, un petit glyphe rond qui tourne s'affiche en bas à droite de la carte (au-dessus de la ligne ATK / DEF) ; il disparaît dès que la carte est relevée. Une carte déjà relevée depuis moins de 30 min n'en affiche pas.

Un bouton « Recharger les prix de cette page » sous la grille de la Collection relit tout de suite le prix des cartes affichées, sans attendre les 30 min. Un rechargement est identifié par la page et le filtre actif : s'il est déjà en tête, un nouveau clic ne crée aucune requête (les cartes se mettent juste à jour) ; s'il est en attente derrière un autre, il passe en premier ; sinon il est créé et passe devant tout le reste, même dans une passe en cours. Le bouton affiche l'avancement (« Rechargement… 23 / 50 ») ou « Rechargement en attente : passer en premier ».

Les relevés se poursuivent d'une page à l'autre du site (un changement de page ne perd rien) et un seul onglet à la
fois relève. Une erreur (déconnexion, 429 persistant) arrête la passe et rien n'est retenté avant 30 min.

### Écouter la musique d'une carte (Spotify)

Sur la fiche d'une carte **de votre Collection** qui est un morceau, un album ou un artiste, une section « Écouter »
propose un bouton ▶ par morceau (album : toutes les pistes ; artiste : jusqu'à 10 titres trouvés par recherche Spotify).
L'extension **pilote votre appli Spotify** (Spotify Connect) : il faut **Spotify Premium** et l'appli ouverte sur un appareil.
La musique continue quand vous changez de page ; un mini-lecteur (titre, ▶/⏸, masquable) reste affiché sur le site.

Le lien avec votre compte se fait par l'autorisation officielle de Spotify (PKCE, sans mot de passe ni secret) ; seuls
les droits « lire l'état de la lecture » et « contrôler la lecture » sont demandés. Le bouton ✕ de la section « Écouter »
délie le compte. Les titres retrouvés viennent de Wikidata (interprète, identifiants Spotify), puis d'une recherche Spotify.

### Films, séries, acteurs et réalisateurs (TMDB)

Sur la fiche d'une carte **de votre Collection** qui est un film ou une série, la fiche affiche la bande-annonce
(lecteur YouTube sans cookies, chargé seulement au clic ▶ ; un bouton ouvre aussi YouTube), la note ★ sur 10 avec le
nombre de votes, et la description. Pour un acteur ou un réalisateur, elle affiche sa filmographie (40 titres au
plus, du plus récent au plus ancien) ; un clic sur un titre ouvre sa fiche, ← revient à la liste.

La carte est reconnue grâce à Wikidata (nature, métier, identifiant TMDB), puis le contenu vient de [TMDB](https://www.themoviedb.org).
Seuls des titres et des identifiants partent vers TMDB, jamais de donnée du jeu ni de votre compte. La clé API TMDB (v3)
est lue à la compilation dans `.env.local` (`WXT_TMDB_API_KEY=…`, fichier ignoré par git) ; sans clé, la section n'apparaît pas.

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.

## Ce qu'elle ne fait pas

- Aucune enchère, mise, vente ni ouverture de pack, aucune action automatique (les règles du jeu
  interdisent l'automatisation).
- Aucun appel à la « Vue du marché PRO » du jeu (fonction payante).
- Aucune lecture dans l'extension elle-même : elle ne fait que commander votre appli Spotify.

## Développement

Node.js 22.12 ou plus est requis.

    npm install
    npm test
    npm run build     # produit .output/chrome-mv3

Installation sur Chrome, Firefox, Firefox Android et application Android autonome (paquets, signature, APK, usage tactile) : voir [docs/INSTALLATION.md](docs/INSTALLATION.md).

Chargement dans Chrome : `chrome://extensions` → mode développeur → « Charger l'extension non
empaquetée » → dossier `.output/chrome-mv3`.

## Scan de la Collection

Au premier chargement de la Collection, l'extension lit toutes les pages de votre Collection en arrière
plan (une requête toutes les 1,5 s, avec votre session), pour alimenter la vue Monde. Les règles du jeu
interdisent l'automatisation : ce scan est un choix de l'utilisateur, à ses risques. Une fois la première
lecture terminée, les chargements suivants ne lisent que les cartes obtenues depuis le dernier import
(tri par date d'ajout, arrêt à la première carte plus ancienne : souvent une seule requête) ; les cartes
perdues ne sont pas détectées, le bouton « Re-scanner » de la vue Monde relit tout. Aucune donnée
n'est envoyée à un serveur du développeur ; seuls les titres d'articles partent vers Wikipédia / Wikidata.
Une fois votre compte Spotify lié, les titres des cartes musique et leurs interprètes sont aussi envoyés à la
recherche Spotify, et les jetons OAuth sont échangés avec accounts.spotify.com (rien ne passe par un serveur
du développeur).
