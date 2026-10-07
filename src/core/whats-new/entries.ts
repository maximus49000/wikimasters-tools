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
    id: 'visite-guidee-v2',
    theme: 'app',
    glyph: '🧭',
    title: 'La visite guidée',
    summary: 'Pages courtes, gestes animés, bulle déplaçable',
    steps: [
      {
        target: null,
        title: 'Lire une visite',
        text: 'Une visite éclaire à tour de rôle chaque élément d’une fonction, directement sur le vrai écran, et vous explique à quoi il sert et comment l’utiliser.',
        details: [
          { label: 'Des pages courtes', text: 'Chaque étape se lit en plusieurs pages : d’abord à quoi ça sert, puis, une page par sujet, d’où viennent les données, comment s’en servir et ce qu’il faut savoir. Touchez Suivant pour avancer, Précédent pour revenir ; le compteur « page 2/4 » et les points indiquent où vous en êtes.' },
          { label: 'L’encart « Dans l’interface »', text: 'Sur la première page de chaque étape, un encart en surbrillance montre une copie réduite de l’élément dont on parle, pour le reconnaître d’un coup d’œil. Si l’élément n’est pas à l’écran, l’encart affiche le symbole de la fonction.' },
          { label: 'Les gestes sont montrés', text: 'Quand l’étape demande un geste (toucher, appui long, pincer, glisser), un doigt animé le joue sur l’élément éclairé et le même geste est dessiné dans l’encart, avec sa consigne. Quand la visite touche un bouton à votre place (comme « Plus »), une étape vous le montre d’abord.' },
          { label: 'Déplacer la bulle', text: 'Maintenez et glissez la poignée ⠿ en haut de la bulle pour la placer à côté de l’élément éclairé. Elle reste toujours entièrement dans l’écran, même si vous la tirez vers un bord ou tournez l’appareil, et garde sa place pendant toute la visite.' },
          { label: 'Quitter', text: '« Quitter la visite » ou « Terminer » vous ramène à la page où vous étiez au départ, après avoir fermé la fiche éventuellement ouverte pour l’occasion.' },
        ],
      },
      {
        target: null,
        title: 'Déplacer la bulle',
        text: 'La bulle peut gêner la vue de l’élément éclairé : vous pouvez la déplacer avec la poignée ⠿ qui se trouve tout en haut de la bulle.',
        gesture: 'drag',
        details: [
          { label: 'Comment faire', text: 'Posez le doigt (ou le bouton de la souris) sur la poignée ⠿, déplacez sans lever, puis relâchez à côté de l’élément visé. La bulle suit votre doigt.' },
          { label: 'Elle reste dans l’écran', text: 'Où que vous la lâchiez, la bulle est ramenée à l’intérieur de l’écran : elle ne peut jamais sortir par un bord, même si vous tournez l’appareil.' },
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
    id: 'films',
    theme: 'ecoute',
    glyph: '🎬',
    title: 'Films et séries',
    summary: 'Bande-annonce, notes et bande originale',
    steps: [
      {
        target: '[data-wmt-screen]',
        title: 'Film ou série',
        text: 'Sur une carte de film ou de série, la fiche affiche l’affiche, la note, la bande-annonce et un bouton pour écouter la bande originale.',
        details: [
          { label: 'D’où viennent les données', text: 'TMDB (The Movie Database) pour la fiche, la note et la bande-annonce ; Wikidata pour reconnaître qu’une carte est un film ou une série ; Spotify ou Tidal pour la bande originale.' },
          { label: 'Comment s’en servir', text: 'Touchez la bande-annonce pour la lire dans la fiche. Le bouton de bande originale ouvre la liste des titres (réglage Auto ou Manuel selon que vous voulez choisir la playlist).' },
          { label: 'À savoir', text: 'Une petite bobine de cinéma marque, dans les listes, les cartes liées aux films.' },
        ],
        scene: { card: 'screen' },
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
];
