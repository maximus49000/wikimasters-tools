import type { Entry } from './types';

// Catalogue des fonctions expliquées (ordre = ordre d'apparition dans WikiHow). Une fiche par fonction majeure, écrite à la main.
// `target` = attribut posé par l'extension sur l'élément réel ; une cible absente de l'écran donne une étape en texte seul.
// À chaque fonction ajoutée ou modifiée : une fiche ici, dans la même PR (une fiche modifiée prend un nouvel `id`).
export const ENTRIES: Entry[] = [
  {
    id: 'wikihow',
    theme: 'app',
    glyph: '🎓',
    title: 'WikiHow et réglages',
    summary: 'Revoir toutes les fonctions, réglages regroupés',
    fresh: true,
    steps: [
      { target: '[data-wmt-extension-setting]', title: 'Paramètre d’extension', text: 'Les réglages des images et du lecteur sont maintenant regroupés ici, dans le menu Plus.' },
      { target: '[data-wmt-wikihow-setting]', title: 'WikiHow', text: 'Toutes les fonctions de l’extension, avec leur visite guidée. Vous pouvez la refaire quand vous voulez.' },
    ],
  },
  {
    id: 'selection',
    theme: 'collection',
    glyph: '✋',
    title: 'Appui long et sélection',
    summary: 'Cocher des cartes, échanger avec un ami',
    steps: [
      { target: null, title: 'Cocher une carte', text: 'Un appui long sur une carte de la Collection l’ouvre en mode sélection avec elle de cochée.' },
      { target: '[data-wmt-selection-trade]', title: 'Échanger avec un ami', text: 'Ce bouton pose les cartes cochées dans votre offre d’échange. Rien n’est envoyé tant que vous ne validez pas.' },
      { target: '[data-wmt-selection-web]', title: 'Toile', text: 'Avec deux cartes cochées, ce bouton cherche le lien le plus court entre elles.' },
    ],
  },
  {
    id: 'toile',
    theme: 'collection',
    glyph: '🕸',
    title: 'Vue Toile',
    summary: 'Les liens entre vos cartes, en un graphe',
    steps: [
      { target: '[data-wmt-view-switch]', title: 'Choisir la vue Toile', text: 'Le sélecteur de vues de la Collection propose la Toile, à côté des autres vues.' },
      { target: null, title: 'Explorer', text: 'Pincez ou utilisez la molette pour zoomer, touchez une carte pour ouvrir ses boutons. Les liens viennent de l’introduction des articles Wikipédia.' },
    ],
  },
  {
    id: 'prix',
    theme: 'collection',
    glyph: '📈',
    title: 'Prix en fond et tri par prix',
    summary: 'Relevé des prix de toute la Collection',
    steps: [
      { target: '[data-wmt-price-sort]', title: 'Trier par prix', text: 'Trie la vue par prix de vente décroissant, à partir des prix relevés.' },
      { target: null, title: 'Relevé en fond', text: 'Quand la page affichée est à jour, l’extension relève le prix du reste de la Collection, une carte à la fois, sans rien vous demander.' },
    ],
  },
  {
    id: 'cartes-liees',
    theme: 'fiche',
    glyph: '🔗',
    title: 'Cartes liées',
    summary: 'Six cartes proches dans la fiche',
    steps: [
      { target: '[data-wmt-linked]', title: 'Cartes liées', text: 'Dans la fiche d’une carte, les cartes les plus consultées parmi celles qui lui sont liées. « Voir plus » ouvre la liste complète.' },
    ],
  },
  {
    id: 'encheres',
    theme: 'fiche',
    glyph: '🔨',
    title: 'Enchères d’une carte',
    summary: 'Toutes les ventes de cette carte',
    steps: [
      { target: '[data-wmt-auction-link]', title: 'Voir les enchères', text: 'Le lien sous « Temps restant » ouvre la recherche des enchères de cette carte, triées par fin imminente.' },
    ],
  },
  {
    id: 'ecouter',
    theme: 'ecoute',
    glyph: '🎵',
    title: 'Écouter une carte',
    summary: 'Spotify ou Tidal pour les cartes de musique',
    steps: [
      { target: '[data-wmt-listen]', title: 'Écouter', text: 'Sur une carte de musique, la fiche propose les titres à écouter avec votre plateforme.' },
      { target: '[data-wmt-extension-setting]', title: 'Lier votre compte', text: 'Le choix de la plateforme et la liaison du compte se font dans Paramètre d’extension, ligne Lecteur.' },
    ],
  },
  {
    id: 'films',
    theme: 'ecoute',
    glyph: '🎬',
    title: 'Films et séries',
    summary: 'Bande-annonce et bande originale',
    steps: [
      { target: '[data-wmt-screen]', title: 'Film ou série', text: 'La fiche d’un film ou d’une série montre sa bande-annonce et un bouton pour écouter sa bande originale.' },
    ],
  },
  {
    id: 'jeux-video',
    theme: 'ecoute',
    glyph: '🎮',
    title: 'Jeux vidéo',
    summary: 'Fiche Steam, avis et bande-annonce',
    steps: [
      { target: '[data-wmt-game]', title: 'Jeu vidéo', text: 'La fiche d’un jeu vidéo montre sa fiche Steam, la note, le nombre de joueurs et sa bande-annonce. Le glyphe ⇄ permet de changer de jeu si le choix automatique est mauvais.' },
    ],
  },
  {
    id: 'anomalie',
    theme: 'app',
    glyph: '⚠',
    title: 'Remonter une anomalie',
    summary: 'Signaler un problème en quelques mots',
    steps: [
      { target: '[data-wmt-anomaly-setting]', title: 'Remonter une anomalie', text: 'Décrivez le problème : il est envoyé tel quel au développeur, avec votre nom de profil si vous le souhaitez.' },
    ],
  },
];
