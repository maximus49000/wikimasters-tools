import type { Entry, TourStep } from './types';

// Catalogue des fonctions expliquées (ordre = ordre d'apparition dans WikiHow). Une fiche par fonction majeure, écrite à la main.
// `target` = attribut posé par l'extension sur l'élément réel ; `scene` dit où et comment le faire apparaître (page, éléments à toucher,
// nature de carte à ouvrir). Une étape sans cible visible s'affiche en texte seul.
// Règles de rédaction : `text` dit à quoi sert l'élément ; `details` dit d'où viennent les données, comment s'en servir et ce qu'il faut savoir.
// À chaque fonction ajoutée ou modifiée : une fiche ici, dans la même PR (une fiche modifiée prend un nouvel `id`).
// Étape « Touchez Plus » : la visite ouvre le menu Plus à votre place, mais le geste doit se voir. Sautée sur ordinateur (menu déjà affiché).
const openPlus = (why: string): TourStep => ({
  target: 'text=Plus',
  title: 'Ouvrir le menu Plus',
  text: `Les réglages de l’extension se trouvent dans le menu Plus du site. Touchez « Plus » pour l’ouvrir : ${why}`,
  gesture: 'tap',
  optional: true,
  details: [
    { label: 'Comment faire', text: 'Touchez « Plus » dans la barre de navigation du site : le menu s’ouvre et liste, sous « Paramètres », les lignes ajoutées par l’extension.' },
    { label: 'À savoir', text: 'Sur ordinateur, ce menu est déjà affiché dans la barre latérale : cette étape est alors sautée toute seule. À l’étape suivante, la visite touche « Plus » pour vous si le menu est fermé.' },
  ],
});

export const ENTRIES: Entry[] = [
  {
    id: 'wikihow',
    theme: 'app',
    glyph: '🎓',
    title: 'WikiHow et réglages',
    summary: 'Revoir toutes les fonctions, réglages regroupés',
    fresh: true,
    steps: [
      openPlus('vous y trouverez « Paramètre d’extension » et « WikiHow ».'),
      {
        target: '[data-wmt-extension-setting]',
        title: 'Paramètre d’extension',
        text: 'Une seule ligne du menu Plus ouvre les réglages de l’extension : Images et Lecteur. Elle remplace les deux lignes « Paramètre d’image » et « Lecteur » pour libérer de la place.',
        details: [
          { label: 'Comment s’en servir', text: 'Touchez la ligne, puis choisissez Images (image de remplacement des cartes sans image) ou Lecteur (plateforme d’écoute, liaison du compte, mini-lecteur). La croix d’un réglage vous ramène à la liste.' },
          { label: 'À savoir', text: 'Les réglages eux-mêmes n’ont pas changé, seul leur accès est regroupé. La ligne Lecteur n’apparaît que si l’écoute est disponible sur votre appareil.' },
        ],
        scene: { reveal: [{ text: 'Plus' }] },
      },
      {
        target: '[data-wmt-wikihow-setting]',
        title: 'WikiHow',
        text: 'WikiHow est le guide intégré : il liste toutes les fonctions de l’extension et lance, pour chacune, une visite guidée sur le vrai écran.',
        details: [
          { label: 'Comment s’en servir', text: 'Menu Plus, ligne WikiHow : les fonctions sont rangées par thème. Touchez-en une pour lancer sa visite ; elle vous emmène sur la bonne page, ouvre au besoin une vraie carte de votre Collection, puis vous ramène où vous étiez.' },
          { label: 'Cartes grisées', text: 'Une fonction déjà visitée devient semi-transparente et affiche « Revoir » : vous voyez d’un coup d’œil ce qu’il vous reste à découvrir.' },
          { label: 'Après chaque mise à jour', text: 'Les nouveautés et les corrections apparaissent dans une fenêtre « Quoi de neuf » au premier lancement qui suit, avec deux onglets (Nouveautés, Corrections).' },
        ],
        scene: { reveal: [{ text: 'Plus' }] },
      },
    ],
  },
  {
    id: 'visite-guidee-v5',
    theme: 'app',
    glyph: '🧭',
    title: 'La visite guidée',
    summary: 'Compteur, pages, encart, poignée, retour',
    steps: [
      {
        target: '[data-wmt-tour-counter]',
        title: 'Où vous en êtes',
        text: 'Le compteur en haut de la bulle dit à quelle étape de la visite vous êtes et, s’il y en a plusieurs, à quelle page de cette étape : « Étape 2/6 · page 1/4 ».',
        details: [
          { label: 'Comment le lire', text: 'Une étape éclaire un élément de l’écran et l’explique en pages courtes : d’abord à quoi il sert, puis, une page par sujet, d’où viennent les données, comment s’en servir et ce qu’il faut savoir. Les points sous le texte montrent la page en cours.' },
          { label: 'À savoir', text: 'Le mot « page » n’apparaît que lorsque l’étape en compte plusieurs. Le contour lumineux que vous voyez autour du compteur est celui que la visite pose sur l’élément dont elle parle.' },
        ],
      },
      {
        target: '[data-wmt-tour-next]',
        title: 'Suivant et Précédent',
        text: 'Suivant avance d’une page, puis d’une étape ; Précédent revient en arrière. Sur le tout dernier écran de la visite, Suivant devient Terminer.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez Suivant pour lire la suite, Précédent pour relire. Vous pouvez aller et venir autant que vous voulez : rien n’est modifié sur le site par la simple lecture.' },
          { label: 'La zone visée reste visible', text: 'La bulle se cale en haut ou en bas de l’écran et la page défile toute seule pour que la zone éclairée tienne en entier dans l’espace laissé libre : la bulle ne la recouvre jamais.' },
        ],
      },
      {
        target: '[data-wmt-encart]',
        title: 'L’encart « Dans l’interface »',
        text: 'Sur la première page de chaque étape, un encart en surbrillance vous montre ce dont on parle, pour le reconnaître d’un coup d’œil, ici l’encart lui-même.',
        details: [
          { label: 'Ce que vous y voyez', text: 'Une copie réduite et non cliquable de l’élément éclairé (un bouton du menu, une ligne de réglage…). Si l’élément n’est pas à l’écran ou ne peut pas se copier, l’encart montre à la place le symbole de la fonction.' },
          { label: 'Les gestes', text: 'Quand l’étape demande un geste (toucher, appui long, pincer, glisser), l’encart le dessine en animation avec sa consigne, et un doigt animé le joue sur l’élément éclairé.' },
        ],
      },
      {
        target: '[data-wmt-grip]',
        title: 'Déplacer la bulle',
        text: 'La bulle peut gêner la vue de l’élément éclairé : la poignée ⠿, tout en haut de la bulle, permet de la placer où vous voulez.',
        gesture: 'drag',
        details: [
          { label: 'Comment faire', text: 'Posez le doigt (ou le bouton de la souris) sur la poignée, déplacez sans lever, puis relâchez à côté de l’élément visé. La bulle suit votre doigt.' },
          { label: 'Elle reste dans l’écran', text: 'Où que vous la lâchiez, la bulle est ramenée à l’intérieur de l’écran, même si vous tournez l’appareil. Une fois déplacée, elle garde sa place et la page ne défile plus automatiquement.' },
        ],
      },
      {
        target: '[data-wmt-tour-quit]',
        title: 'Quitter ou terminer',
        text: '« Quitter la visite » arrête la visite à tout moment ; « Terminer » apparaît à la dernière page. Dans les deux cas, vous revenez là où vous étiez.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez « Quitter la visite » sous les boutons, ou « Terminer » sur le dernier écran.' },
          { label: 'Ce qui se passe ensuite', text: 'La visite ferme les fenêtres et la fiche qu’elle avait ouvertes, vous ramène à la page de départ, puis rouvre l’écran qui l’avait lancée : WikiHow, ou la liste « Quoi de neuf » de la version.' },
        ],
      },
    ],
  },
  {
    id: 'selection',
    theme: 'collection',
    glyph: '✋',
    title: 'Appui long et sélection',
    summary: 'Cocher des cartes, échanger avec un ami',
    steps: [
      {
        target: '[data-wmt-card]',
        title: 'Cocher une carte : l’appui long',
        text: 'Un appui long sur une carte de la Collection active le mode Sélectionner du site avec cette carte déjà cochée : plus besoin de passer par le bouton du site avant de choisir.',
        gesture: 'longpress',
        details: [
          { label: 'Comment faire', text: 'Posez le doigt (ou le bouton de la souris) sur une carte et laissez-le environ une demi-seconde, sans bouger : la sélection s’ouvre avec cette carte cochée. Touchez ensuite les autres cartes pour les cocher ou décocher.' },
          { label: 'Où ça marche', text: 'Sur les cartes de la vue Homemade, la vue par défaut de la Collection. Si vous avez choisi une autre vue, repassez sur Homemade pour voir cette carte éclairée.' },
          { label: 'À savoir', text: 'Les cases sont celles du site : tout ce qu’il propose sur la sélection (tout sélectionner, étiqueter…) continue de marcher. Pour quitter, utilisez « Quitter la sélection » du site.' },
        ],
        scene: { page: '/collection' },
      },
      {
        target: 'text=Sélectionner',
        title: 'Ou : le bouton Sélectionner',
        text: 'Sans appui long, le bouton « Sélectionner » du site ouvre le même mode : à vous ensuite de cocher les cartes voulues, une par une.',
        gesture: 'tap',
        optional: true,
        details: [
          { label: 'Comment faire', text: 'Touchez « Sélectionner » en haut de la Collection : des cases apparaissent sur les cartes et une barre d’actions s’affiche, où l’extension ajoute ses boutons Échanger et Toile.' },
          { label: 'À savoir', text: 'Cette étape est sautée si le mode Sélectionner est déjà actif. À l’étape suivante, la visite l’active pour vous, afin d’éclairer la barre d’actions.' },
        ],
        scene: { page: '/collection' },
      },
      {
        target: '[data-wmt-selection-trade]',
        title: 'Échanger avec un ami',
        text: 'Ce bouton (la poignée de main) prépare un échange : les cartes cochées sont déjà posées dans votre offre, sans que vous ayez à les rechercher une par une.',
        details: [
          { label: 'Comment ça marche', text: 'L’extension ouvre la page Échanges du site, clique « Proposer un échange », puis attend que vous choisissiez l’ami. Elle cherche alors chaque carte cochée dans « Mes cartes » et la pose dans votre offre.' },
          { label: 'Rien n’est envoyé', text: 'L’offre n’est jamais envoyée automatiquement : tant que vous ne validez pas vous-même sur le site, aucun échange n’existe.' },
          { label: 'À savoir', text: 'Il faut cocher au moins une carte. Une carte absente de « Mes cartes » (déjà engagée dans un autre échange, par exemple) est laissée de côté au bout de 4 secondes.' },
        ],
        scene: { page: '/collection', reveal: [{ text: 'Sélectionner' }] },
      },
      {
        target: '[data-wmt-selection-web]',
        title: 'Toile : le lien entre deux cartes',
        text: 'Avec exactement deux cartes cochées, ce bouton ouvre la vue Toile sur le chemin le plus court qui relie ces deux cartes.',
        details: [
          { label: 'D’où viennent les liens', text: 'Wikipédia : l’extension lit, pour chaque carte, les liens présents dans l’introduction de son article, puis cherche le plus court enchaînement d’articles entre les deux cartes.' },
          { label: 'À savoir', text: 'Le bouton reste inactif tant que deux cartes exactement ne sont pas cochées. Un chemin n’existe que si les articles sont reliés par leurs introductions.' },
        ],
        scene: { page: '/collection', reveal: [{ text: 'Sélectionner' }] },
      },
    ],
  },
  {
    id: 'toile',
    theme: 'collection',
    glyph: '🕸',
    title: 'Vue Toile',
    summary: 'Les liens entre vos cartes, en un graphe',
    steps: [
      {
        target: '[data-wmt-view-switch]',
        title: 'Choisir une vue',
        text: 'Le sélecteur de vues de la Collection propose, en plus de la Grille du site, Homemade (grille paginée et filtrable), Monde (la Collection sur une carte du monde), Chronologique (sur une frise) et Toile.',
        details: [
          { label: 'À quoi sert la Toile', text: 'Elle dessine vos cartes comme un réseau : deux cartes sont reliées quand l’article Wikipédia de l’une cite l’autre dans son introduction. On voit ainsi quelles cartes se tiennent entre elles et lesquelles sont isolées.' },
          { label: 'D’où viennent les données', text: 'Wikipédia. Les liens sont lus par lots de 50 articles, mémorisés 30 jours, puis relus. Il ne s’agit donc pas de tous les liens de l’article, seulement de ceux de son introduction.' },
          { label: 'Comment s’en servir', text: 'Pincez ou utilisez la molette pour zoomer, faites glisser pour vous déplacer, touchez une carte pour afficher ses boutons (prix et fiche). Au-delà de 1 500 cartes, la Toile passe en dessin simplifié (regroupements puis cartes en zoomant) pour rester fluide.' },
          { label: 'Votre choix de vue', text: 'La vue choisie est mémorisée : la visite ne la change pas, elle vous montre seulement le sélecteur.' },
        ],
        scene: { page: '/collection' },
      },
      {
        target: null,
        title: 'Zoomer sur la Toile',
        text: 'Sur la Toile, on zoome pour passer de la vue d’ensemble (les regroupements) aux cartes elles-mêmes.',
        gesture: 'pinch',
        details: [
          { label: 'Comment faire', text: 'Écartez deux doigts pour zoomer, rapprochez-les pour dézoomer. Avec une souris, utilisez la molette.' },
          { label: 'Pourquoi ce pictogramme', text: 'La visite n’affiche pas la Toile (elle changerait la vue mémorisée de la Collection) : ce geste vous est montré en dessin, à refaire une fois la vue Toile ouverte.' },
        ],
      },
      {
        target: null,
        title: 'Se déplacer sur la Toile',
        text: 'Une fois zoomé, on se déplace sur la Toile en la faisant glisser pour atteindre les cartes qui ne sont pas à l’écran.',
        gesture: 'drag',
        details: [
          { label: 'Comment faire', text: 'Posez le doigt (ou maintenez le bouton de la souris) sur un espace vide de la Toile, puis glissez sans lever.' },
          { label: 'À savoir', text: 'Au-delà de 1 500 cartes la Toile passe en dessin simplifié ; zoomez pour voir les cartes apparaître au fur et à mesure.' },
        ],
      },
      {
        target: null,
        title: 'Ouvrir une carte de la Toile',
        text: 'Toucher une carte de la Toile affiche, au-dessus d’elle, une barre de boutons pour agir sur cette carte sans quitter la Toile.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez une carte : une barre apparaît avec le graphique des prix (📈) et la fiche de la carte (🃏). Touchez ailleurs pour la refermer.' },
          { label: 'À savoir', text: 'La barre remplace l’agrandissement de la carte : l’idée est de garder la Toile visible pendant que vous consultez les prix.' },
        ],
      },
    ],
  },
  {
    id: 'prix',
    theme: 'collection',
    glyph: '📈',
    title: 'Prix en fond et tri par prix',
    summary: 'Relevé des prix de toute la Collection',
    steps: [
      {
        target: 'button[aria-label="Trier la collection"]',
        title: 'Ouvrir la liste de tri',
        text: 'Le tri par prix se choisit dans la liste de tri du site : touchez d’abord le bouton « Trier la collection » pour l’ouvrir.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez le bouton « Trier la collection », au-dessus des cartes : la liste des tris du site s’affiche (Rareté, Nom, Favoris, Date d’ajout…) avec, en plus, le tri de l’extension.' },
          { label: 'À savoir', text: 'Ce bouton est celui du site ; l’extension y ajoute seulement une entrée. À l’étape suivante, la visite l’ouvre pour vous et éclaire cette entrée.' },
        ],
        scene: { page: '/collection' },
      },
      {
        target: '[data-wmt-price-sort]',
        title: 'Trier par prix de vente',
        text: 'Cette entrée de la liste de tri place en tête les cartes qui se vendent le plus cher.',
        details: [
          { label: 'D’où viennent les prix', text: 'Du marché du site : l’extension y cherche chaque carte par son titre et garde l’historique des prix relevés sur votre appareil. Le tri utilise le dernier prix de vente connu de chaque carte, pas une estimation extérieure.' },
          { label: 'Comment s’en servir', text: 'Touchez « Trier la collection », puis « Prix de vente décroissant ». Les cartes sans prix connu viennent en dernier.' },
        ],
        scene: { page: '/collection', reveal: ['button[aria-label="Trier la collection"]'] },
      },
      {
        target: null,
        title: 'Le relevé tourne en fond',
        text: 'Quand la page affichée est à jour, l’extension continue toute seule le relevé du reste de votre Collection, sans que vous ayez rien à faire.',
        details: [
          { label: 'Comment ça marche', text: 'Une recherche par titre sur le marché à la fois, en commençant par la carte relevée le plus anciennement. Une même carte n’est jamais relevée plus d’une fois toutes les 30 minutes ; les cartes affichées à l’écran passent en priorité.' },
          { label: 'À savoir', text: 'Plus votre Collection est grande, plus le premier tour est long. Les prix se complètent donc au fil des visites.' },
        ],
      },
    ],
  },
  {
    id: 'cartes-liees',
    theme: 'fiche',
    glyph: '🔗',
    title: 'Cartes liées',
    summary: 'Cartes proches, dans la fiche',
    steps: [
      {
        target: '[data-wmt-linked]',
        title: 'Cartes liées',
        text: 'Sous la fiche d’une carte, ce bloc montre les cartes de votre Collection qui lui sont reliées sur Wikipédia : un moyen rapide de rebondir de carte en carte.',
        details: [
          { label: 'D’où viennent les liens', text: 'Wikipédia : les articles cités dans l’introduction de l’article de la carte, et ceux qui le citent. Les liens sont mémorisés 30 jours.' },
          { label: 'Ce qui est affiché', text: 'Les 6 cartes les plus consultées sur Wikipédia (nombre de visites de l’article) ; le bouton « Voir les N cartes liées » ouvre la liste complète. Des cartes à deux sauts, reliées par un article intermédiaire, peuvent aussi apparaître (4 au plus), avec l’article qui fait le lien.' },
          { label: 'Comment s’en servir', text: 'Touchez une carte liée pour ouvrir sa fiche.' },
        ],
        scene: { card: 'any' },
      },
      {
        target: '[data-wmt-linked-more]',
        title: 'Voir toutes les cartes liées',
        text: 'Quand une carte a plus de cartes liées que le bloc n’en montre, ce bouton ouvre la liste complète, des plus consultées aux moins consultées.',
        gesture: 'tap',
        optional: true,
        details: [
          { label: 'Comment faire', text: 'Touchez « Voir les N cartes liées » sous le bloc : une fenêtre liste toutes les cartes liées. Touchez-en une pour ouvrir sa fiche.' },
          { label: 'À savoir', text: 'Le bouton n’existe que si la carte a plus de 6 cartes liées (ou plus de 4 cartes à deux sauts) ; sinon cette étape est sautée.' },
        ],
        scene: { card: 'any' },
      },
    ],
  },
  {
    id: 'encheres',
    theme: 'fiche',
    glyph: '🔨',
    title: 'Enchères d’une carte',
    summary: 'Toutes les ventes de cette carte',
    steps: [
      {
        target: '[data-wmt-auction-link]',
        title: 'Voir toutes les enchères',
        text: 'Sous le « Temps restant » d’une enchère, ce lien cherche d’un coup toutes les enchères en cours pour cette même carte, du plus proche de la fin au plus lointain.',
        details: [
          { label: 'Comment ça marche', text: 'Il ouvre le Marché et lance pour vous la recherche par titre de la carte, triée par fin imminente.' },
          { label: 'À savoir', text: 'Le lien n’apparaît que sur une enchère affichée avec son temps restant. Ouvrez une enchère du Marché pour le voir.' },
        ],
        scene: { page: '/marketplace' },
      },
    ],
  },
  {
    id: 'ecouter',
    theme: 'ecoute',
    glyph: '🎵',
    title: 'Écouter une carte',
    summary: 'Spotify ou Tidal pour les cartes de musique',
    steps: [
      {
        target: '[data-wmt-listen]',
        title: 'Écouter',
        text: 'Sur une carte liée à la musique (artiste, groupe, album, chanson), la fiche propose les titres à écouter avec votre plateforme.',
        details: [
          { label: 'D’où viennent les titres', text: 'Spotify ou Tidal, selon votre choix. L’extension cherche l’artiste, l’album ou le titre de la carte, vérifie le nom pour éviter les homonymes, puis affiche la liste.' },
          { label: 'Ce qui est mémorisé', text: 'La liste d’écoute d’une carte est gardée sur votre appareil : la plateforme n’est pas interrogée à chaque ouverture de fiche. Un « rien trouvé » est revérifié au bout de 30 jours.' },
          { label: 'Si la plateforme demande de patienter', text: 'La fiche affiche l’heure de reprise et se recharge toute seule à ce moment-là.' },
        ],
        scene: { card: 'music' },
      },
      openPlus('puis « Paramètre d’extension » pour lier votre compte.'),
      {
        target: '[data-wmt-extension-setting]',
        title: 'Lier votre compte, choisir la plateforme',
        text: 'Pour écouter dans l’extension, liez votre compte Spotify ou Tidal : c’est un réglage, dans Paramètre d’extension puis Lecteur.',
        details: [
          { label: 'Comment s’en servir', text: 'Ouvrez Plus, Paramètre d’extension, Lecteur : choisissez la plateforme (le choix n’apparaît que s’il y en a deux), liez ou déliez le compte, et décidez d’afficher ou non le mini-lecteur. Délier se fait uniquement ici.' },
          { label: 'À savoir', text: 'La liaison passe par la page d’autorisation de la plateforme ; l’extension ne voit jamais votre mot de passe.' },
        ],
        scene: { reveal: [{ text: 'Plus' }] },
      },
    ],
  },
  {
    id: 'films-v2',
    theme: 'ecoute',
    glyph: '🎬',
    title: 'Films et séries',
    summary: 'Où le voir, bande-annonce, notes et bande originale',
    steps: [
      {
        target: '[data-wmt-screen]',
        title: 'Film ou série',
        text: 'Sur une carte de film ou de série, la fiche affiche la bande-annonce (plus grande qu’avant), où le voir, la note, un synopsis plus lisible et un bouton pour écouter la bande originale.',
        details: [
          { label: 'D’où viennent les données', text: 'TMDB (The Movie Database) pour la fiche, la note et la bande-annonce ; Wikidata pour reconnaître qu’une carte est un film ou une série ; Spotify ou Tidal pour la bande originale.' },
          { label: 'Comment s’en servir', text: 'Touchez la bande-annonce pour la lire dans la fiche. Le bouton de bande originale ouvre la liste des titres (réglage Auto ou Manuel selon que vous voulez choisir la playlist).' },
          { label: 'À savoir', text: 'Une petite bobine de cinéma marque, dans les listes, les cartes liées aux films.' },
        ],
        scene: { card: 'screen' },
      },
      {
        target: '[data-wmt-watch]',
        title: 'Où le voir',
        text: 'Sous la bande-annonce, les logos montrent les services où le film ou la série est disponible en France : abonnement ou gratuit en grand, location et achat en plus petit.',
        details: [
          { label: 'D’où viennent les données', text: 'TMDB, qui reprend les données de JustWatch (source citée sous la fiche). Elles concernent la France et sont gardées 24 heures.' },
          { label: 'Comment s’en servir', text: 'Passez sur un logo (ou touchez-le) pour lire le nom du service. Le bouton à droite ouvre la page « où regarder » de TMDB, qui renvoie vers JustWatch.' },
          { label: 'À savoir', text: 'L’extension n’ouvre pas encore directement le film dans le service : le lien mène à une page de choix. « Aucune offre en France connue » s’affiche quand aucun service ne le propose.' },
        ],
        scene: { card: 'screen' },
      },
    ],
  },
  {
    id: 'collection-filmographie',
    theme: 'fiche',
    glyph: '🃏',
    title: 'Mes cartes dans la filmographie',
    summary: 'Repérer les films et séries que vous possédez',
    steps: [
      {
        target: '[data-wmt-work-list]',
        title: 'Filmographie et ma collection',
        text: 'Dans la filmographie d’un acteur ou d’un réalisateur, les films et séries dont vous possédez la carte sont repérés : miniature à la couleur de la rareté, nombre d’exemplaires, ligne en surbrillance.',
        details: [
          { label: 'D’où viennent les données', text: 'La liste vient de TMDB. Votre Collection est celle que l’extension a lue pendant ses parcours ; un film est reconnu quand l’identifiant TMDB de sa carte est connu (lu sur Wikidata, en arrière-plan).' },
          { label: 'Comment s’en servir', text: 'Le résumé en haut indique « N / M dans ma collection ». « Seulement ma collection » ne garde que vos cartes. Le bouton carte à droite d’une ligne ouvre votre carte ; toucher le reste de la ligne ouvre la fiche du film.' },
          { label: 'À savoir', text: 'Seules les cartes déjà connues de la Collection sont repérées : lancez un parcours complet de la Collection pour toutes les voir. Un film dont l’identifiant n’est pas encore lu apparaît un peu plus tard.' },
        ],
        scene: { card: 'screen' },
        glyph: '🃏',
        optional: true,
      },
    ],
  },
  {
    id: 'jeux-video',
    theme: 'ecoute',
    glyph: '🎮',
    title: 'Jeux vidéo',
    summary: 'Fiche Steam, avis et bande-annonce',
    steps: [
      {
        target: '[data-wmt-game]',
        title: 'Jeu vidéo',
        text: 'Sur une carte de jeu vidéo, la fiche affiche la note des joueurs, le prix, le nombre de joueurs en ligne, le studio, les plateformes, la date de sortie et la bande-annonce.',
        details: [
          { label: 'D’où viennent les données', text: 'Steam (public, sans compte) en priorité ; IGDB en repli quand Steam ne connaît pas le jeu. Wikidata sert à reconnaître la carte comme un jeu et à retrouver son identifiant. Les fiches Steam sont gardées 6 heures, celles d’IGDB 7 jours.' },
          { label: 'Si le jeu affiché est le mauvais', text: 'Touchez le glyphe ⇄ « Changer de jeu » : choisissez parmi les propositions, collez l’adresse d’une page Steam ou IGDB, ou indiquez « aucun jeu ». Votre choix est mémorisé pour cette carte.' },
          { label: 'À savoir', text: 'Une petite manette marque, dans les listes, les cartes de jeu vidéo. La bande originale du jeu est proposée comme pour les films.' },
        ],
        scene: { card: 'game' },
      },
      {
        target: '[aria-label="Changer de jeu"]',
        title: 'Changer de jeu',
        text: 'Si l’extension a associé le mauvais jeu à la carte, ce bouton (⇄) vous laisse choisir le bon.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez ⇄ à côté de « Jeu vidéo » : choisissez parmi les propositions de Steam et d’IGDB, collez l’adresse d’une page Steam ou IGDB, ou indiquez « aucun jeu ».' },
          { label: 'Ce qui est mémorisé', text: 'Votre choix est gardé pour cette carte et prime sur le choix automatique ; il peut être modifié à tout moment de la même façon.' },
        ],
        scene: { card: 'game' },
      },
    ],
  },
  {
    id: 'livres-v5',
    theme: 'fiche',
    glyph: '📖',
    title: 'Livres',
    summary: 'Synopsis, couverture, prix et achat, lecture gratuite, bibliographie des écrivains, et changer de livre',
    steps: [
      {
        target: '[data-wmt-book]',
        title: 'Fiche d’un livre',
        text: 'Sur une carte de roman, de poème, d’essai, de pièce de théâtre ou de bande dessinée, la fiche affiche l’auteur, l’année, l’éditeur, le nombre de pages, les genres et un synopsis en grand. La couverture du livre devient l’image de la carte quand elle existe.',
        details: [
          { label: 'D’où viennent les données', text: 'Wikidata pour reconnaître qu’une carte est un livre et retrouver son identifiant Open Library ; Open Library pour l’auteur, l’édition et la couverture ; l’introduction de l’article Wikipédia pour le synopsis (à défaut, la description d’Open Library).' },
          { label: 'Comment s’en servir', text: 'Faites défiler le synopsis dans son cadre ; « Lire l’article complet » ouvre Wikipédia. « Fiche Open Library » ouvre la page de l’œuvre. Un petit livre ouvert marque, dans les listes, les cartes de livres.' },
          { label: 'À savoir', text: 'Quand Wikidata ne donne pas l’identifiant, le livre est cherché par son titre exact : un homonyme peut se glisser, et la couverture automatique n’est alors pas posée. Prix, achat et lecture gratuite sont décrits aux étapes suivantes.' },
        ],
        scene: { card: 'book' },
        glyph: '📖',
      },
      {
        target: '[data-wmt-book-prices]',
        title: 'Prix et achat',
        text: 'Sous le synopsis, « Prix en France » montre le prix du livre neuf (papier) et une ligne par vendeur : Amazon.fr, Fnac, Decitre, une librairie indépendante, et l’ebook sur Google Play Livres. Chaque ligne ouvre la page du livre chez le vendeur, ou une recherche de ce livre quand la page exacte n’est pas connue.',
        details: [
          { label: 'D’où viennent les données', text: 'Le prix papier est lu sur la page du livre d’Amazon.fr quand c’est possible (extension seulement) ; l’ebook vient de Google Books. Les liens se construisent avec l’ISBN du livre, ou avec son titre et son auteur à défaut.' },
          { label: 'Comment s’en servir', text: 'Touchez une ligne pour ouvrir le vendeur. Un prix affiché est celui lu le jour indiqué en bas ; « voir le prix » ou « chercher » signifie que le prix n’a pas pu être lu et que le bouton mène à la page du livre ou à sa recherche chez le vendeur.' },
          { label: 'À savoir', text: 'En France, le prix du livre neuf est le même chez tous les vendeurs (remise de 5 % au plus) : un seul prix de référence suffit. Les prix lus sont gardés 7 jours. Fnac et Decitre ne se laissent pas lire : liens seulement. Sur l’application Android, seuls les liens et l’ebook sont proposés.' },
        ],
        scene: { card: 'book' },
        glyph: '💶',
      },
      {
        target: '[data-wmt-book-reading]',
        title: 'Lecture gratuite',
        text: 'Sous les prix, le bouton « Lire gratuitement » ouvre le texte intégral du livre quand il est libre de droits ; sinon une ligne indique « Pas de texte libre » et, quand on la connaît, l’année jusqu’à laquelle il est protégé.',
        details: [
          { label: 'D’où viennent les données', text: 'Wikisource en français (texte mis en forme), le Projet Gutenberg et Internet Archive (scans lisibles sans compte). Wikidata donne la page Wikisource, l’identifiant Gutenberg et la date de décès de l’auteur ; Open Library liste les scans d’Internet Archive.' },
          { label: 'Comment s’en servir', text: 'Touchez « Lire gratuitement » : la meilleure source s’ouvre dans un onglet (Wikisource d’abord, puis Gutenberg, puis Internet Archive) ; les autres sont proposées en dessous.' },
          { label: 'À savoir', text: 'En France, une œuvre est protégée jusqu’à la fin de la 70ᵉ année après la mort de l’auteur : l’année affichée est ce décès plus 70 ans. Sans date de décès connue, seule la mention « Pas de texte libre » apparaît. Si une source ne répond pas, un message le dit ; rien n’est retenu à tort.' },
        ],
        scene: { card: 'book' },
        glyph: '📚',
      },
      {
        target: '[data-wmt-writer]',
        title: 'Bibliographie d’un écrivain',
        text: 'Sur la carte d’un écrivain, d’un poète ou d’un dramaturge, la section « Bibliographie » liste ses œuvres les plus connues, de la plus récente à la plus ancienne, comme la filmographie d’un acteur. Les livres dont vous possédez la carte sont repérés.',
        details: [
          { label: 'D’où viennent les données', text: 'Wikidata : les œuvres dont la personne est l’auteur, les plus répandues dans les langues de Wikipédia d’abord (40 au plus, titres regroupés). La couverture vient d’Open Library ; la liste est gardée 7 jours.' },
          { label: 'Comment s’en servir', text: 'Touchez une ligne pour ouvrir le livre dans la section (synopsis, prix, lecture gratuite) ; la flèche ← revient à la liste. Une miniature à la couleur de la rareté, ×N et le bouton carte marquent vos cartes ; « Seulement ma collection » ne garde que celles-ci.' },
          { label: 'À savoir', text: 'Seuls les livres d’un auteur très connu apparaissent tous ; pour un auteur peu connu, la liste est élargie aux œuvres plus discrètes. Un livre est repéré dans votre Collection quand le titre de son article Wikipédia est celui de la carte, et seulement parmi les cartes déjà connues de la Collection.' },
        ],
        scene: { card: 'book' },
        glyph: '📚',
        optional: true,
      },
      {
        target: '[data-wmt-book-switch]',
        title: 'Changer de livre',
        text: 'Le bouton à double flèche, à droite de « Livre », permet de corriger le livre d’une carte : recherchez-le par son titre, choisissez-le, ou dites que la carte n’a pas de livre.',
        gesture: 'tap',
        details: [
          { label: 'D’où viennent les données', text: 'La recherche interroge Open Library avec le titre de la carte (modifiable). Le livre que vous choisissez est gardé sur votre appareil, carte par carte.' },
          { label: 'Comment faire', text: 'Touchez le bouton, relisez les résultats (couverture, titre, auteur, année), touchez un livre pour le voir en aperçu, puis « Utiliser ce livre ». « Aucun livre » vide la section ; « Revenir au choix automatique » efface votre choix.' },
          { label: 'À savoir', text: 'Votre choix passe avant la reconnaissance automatique, et sa couverture devient l’image de la carte : c’est le meilleur moyen de remplacer un mauvais livre ou d’obtenir une couverture quand l’identifiant Wikidata manque. Coller l’adresse d’une page Open Library n’est pas encore possible.' },
        ],
        scene: { card: 'book' },
        glyph: '🔁',
      },
    ],
  },
  {
    id: 'documentaire-v2',
    theme: 'fiche',
    glyph: '🎞',
    title: 'Documentaire d’histoire',
    summary: 'Un documentaire sur un événement, un personnage, une œuvre ou une civilisation',
    steps: [
      {
        target: '[data-wmt-documentary-card]',
        title: 'Documentaire',
        text: 'Sur la fiche d’un événement historique, d’un personnage, d’une œuvre d’art, d’un monument, d’une civilisation ou d’un culte ancien, un lecteur propose un documentaire. Appuyez sur ▶ pour le regarder.',
        details: [
          { label: 'D’où viennent les vidéos', text: 'D’abord les documentaires choisis à la main, puis les archives libres de Wikimedia Commons, puis les vidéos récentes de quelques chaînes (ARTE, INA, Nota Bene, Lumni, Hérodote), puis une recherche YouTube. Chaque vidéo est notée : le titre doit contenir le nom du sujet et la durée doit être celle d’un documentaire.' },
          { label: 'Quelles cartes', text: 'Les événements (batailles, guerres, révolutions, traités), les personnes mortes en 1950 ou avant, les œuvres d’art, les monuments, les civilisations, les périodes et les religions. Une carte dont Wikidata ne donne pas la nature compte si elle date de 1950 ou avant. Les films, séries, jeux, livres et morceaux ont leur propre fiche.' },
          { label: 'Si rien ne convient', text: 'Aucune vidéo n’est affichée plutôt qu’une mauvaise : des boutons ouvrent la recherche chez YouTube, Arte et l’INA. Si plusieurs vidéos sont trouvées, le glyphe ⇄ passe à la suivante ; la croix signale une vidéo hors sujet et la masque chez vous.' },
          { label: 'À savoir', text: 'Rien n’est chargé chez YouTube avant d’appuyer sur ▶. Certaines chaînes interdisent l’intégration : le bouton ↗ ouvre alors la vidéo à la source. Les archives de Commons sont sous licence libre, avec l’auteur indiqué.' },
        ],
      },
      {
        target: '[aria-label="Proposer un documentaire"]',
        title: 'Proposer un documentaire',
        text: 'Vous connaissez un bon documentaire sur ce sujet ? Le glyphe lien permet de coller son adresse YouTube.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez le glyphe lien, collez l’adresse de la vidéo, puis « Proposer » : l’extension vérifie que la vidéo existe et qu’elle peut être intégrée.' },
          { label: 'Ce qui se passe ensuite', text: 'La vidéo s’affiche tout de suite chez vous, marquée « en attente de relecture ». Elle est signalée au créateur du projet, qui décide de la proposer aux autres joueurs.' },
        ],
      },
    ],
  },
  {
    id: 'anomalie',
    theme: 'app',
    glyph: '⚠',
    title: 'Remonter une anomalie',
    summary: 'Signaler un problème en quelques mots',
    steps: [
      openPlus('puis « Remonter une anomalie ».'),
      {
        target: '[data-wmt-anomaly-setting]',
        title: 'Remonter une anomalie',
        text: 'Quelque chose ne marche pas comme prévu ? Ce bouton envoie votre description au développeur, qui la retrouve dans une liste numérotée de problèmes à traiter.',
        details: [
          { label: 'Comment s’en servir', text: 'Menu Plus, « Remonter une anomalie » : décrivez ce que vous faisiez, ce qui s’est passé et ce que vous attendiez (4 000 caractères au plus), puis envoyez.' },
          { label: 'Ce qui est envoyé', text: 'Votre texte et, si vous gardez la case cochée, le nom de votre profil (lu sur la page Profil). L’anomalie reçoit un numéro, que la fenêtre vous affiche.' },
          { label: 'À savoir', text: 'Cette ligne n’existe que dans les versions qui ont l’envoi configuré.' },
        ],
        scene: { reveal: [{ text: 'Plus' }] },
      },
    ],
  },
  {
    id: 'publicite-achat-v5',
    theme: 'app',
    glyph: '🛒',
    title: 'Publicité d’achat',
    summary: 'Masquer ou afficher les offres payantes du site',
    steps: [
      openPlus('puis « Paramètre d’extension », où se trouve le réglage « Publicité d’achat ».'),
      {
        target: '[data-wmt-extension-setting]',
        title: 'Ouvrir Paramètre d’extension',
        text: 'Le réglage « Publicité d’achat » se trouve dans Paramètre d’extension, avec Images et Lecteur : c’est lui qui décide si le site vous montre ses offres payantes.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez « Paramètre d’extension » dans le menu Plus : une liste s’ouvre avec les lignes Images, Publicité d’achat et, si l’écoute est disponible, Lecteur.' },
          { label: 'À savoir', text: 'La croix de la fenêtre vous ramène à la page où vous étiez. À l’étape suivante, la visite ouvre cette liste pour vous.' },
        ],
        scene: { closeWindows: true, reveal: [{ text: 'Plus' }] },
      },
      {
        target: '[data-wmt-ext-row="ads"]',
        title: 'Choisir « Publicité d’achat »',
        text: 'La visite a ouvert Paramètre d’extension : la ligne « Publicité d’achat » ouvre le réglage. C’est cette ligne qu’il faut toucher.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez la ligne « Publicité d’achat » : la fenêtre du réglage s’affiche avec son explication et ses deux boutons. À l’étape suivante, la visite l’ouvre pour vous.' },
          { label: 'À savoir', text: 'Les autres lignes ouvrent leurs propres réglages (Images pour l’image de remplacement des cartes sans image, Lecteur pour l’écoute) ; chacun a sa croix pour revenir à cette liste.' },
        ],
        scene: { closeWindows: true, reveal: [{ text: 'Plus' }, '[data-wmt-extension-setting]'] },
      },
      {
        target: '[data-wmt-ads-choice]',
        title: 'Choisir Activé ou Désactivé',
        text: 'Ces deux boutons décident si le site vous montre ses offres payantes : Activé les affiche, Désactivé les masque. Désactivé est le réglage de départ.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez Activé ou Désactivé : le bouton choisi est en couleur, et le changement s’applique tout de suite, sans recharger la page.' },
          { label: 'Ce qui est mémorisé', text: 'Votre choix est gardé sur cet appareil (dans le stockage local du navigateur ou de l’application), pas sur votre compte : il faut le refaire sur un autre appareil. Si ce stockage est illisible, les offres restent masquées.' },
        ],
        scene: { reveal: [{ text: 'Plus' }, '[data-wmt-extension-setting]', '[data-wmt-ext-row="ads"]'] },
      },
      {
        target: '[data-wmt-ads-explain]',
        title: 'Ce qui est masqué',
        text: 'Le texte de la fenêtre résume l’effet du réglage : Désactivé, l’extension cache tout ce qui propose d’acheter avec de l’argent réel (boutique, abonnement, bouton et onglet PRO « Marché »).',
        details: [
          { label: 'Dans les Paramètres', text: 'Les sections « Acheter des WikiBidous » et « WikiMasters PRO » (l’abonnement) disparaissent de la page des Paramètres du site.' },
          { label: 'Boutique et solde', text: 'La fenêtre « Boutique » est cachée, et la pastille de votre solde de WikiBidous n’ouvre plus la boutique quand vous la touchez : le solde reste affiché.' },
          { label: 'Vue du marché (PRO)', text: 'Le bouton « Vue du marché » (graphique et pastille PRO) des enchères et l’onglet « Marché PRO » de la fiche d’une carte, fonction réservée aux abonnés PRO, sont cachés eux aussi. Sans cet onglet, la barre d’onglets disparaît : la fiche s’ouvre directement sur « Détails ».' },
          { label: 'À savoir', text: 'Rien n’est supprimé ni acheté : l’extension ne fait que cacher l’affichage du site. Si le site change la forme de ses offres, une proposition peut réapparaître : signalez-la avec « Remonter une anomalie ».' },
        ],
        scene: { reveal: [{ text: 'Plus' }, '[data-wmt-extension-setting]', '[data-wmt-ext-row="ads"]'] },
      },
    ],
  },
];
