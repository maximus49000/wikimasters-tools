# Wikimasters Tools (non officiel)

Extension Chrome **non officielle et en lecture seule** pour [WikiMasters](https://www.wiki-masters.com).
Elle n'est liée ni au jeu, ni à Wikipédia.

## Ce que fait la V1

Un badge de prix sous chaque carte que vous avez déjà achetée ou vendue : médiane de vos
transactions (ventes et achats), fourchette, nombre de transactions et tendance. Le calcul se fait
dans votre navigateur ; rien n'est envoyé à un serveur.

Une pastille verte « $ » en haut à droite des cartes que vous avez achetées indique le prix d'achat (ou la fourchette).

Sur la fiche d'une carte, un lien « Voir l'article sur le marché » ouvre un popup avec le nombre
d'offres, le nombre d'enchères déjà misées, le prix moyen et la liste des offres connues. Ces données
viennent **uniquement** des enchères que le site charge lui-même quand vous ouvrez la page Marché :
l'extension les observe passivement, sans envoyer aucune requête. Ce sont donc des chiffres d'échantillon
(« observé il y a X min »), pas un état complet du marché. Aucun pseudo de joueur n'est conservé.

## Ce qu'elle ne fait pas

- Aucune enchère, mise, vente ni ouverture de pack, aucune action automatique (les règles du jeu
  interdisent l'automatisation).
- Aucun appel à la « Vue du marché PRO » du jeu (fonction payante).

## Développement

Node.js 22.12 ou plus est requis.

    npm install
    npm test
    npm run build     # produit .output/chrome-mv3

Chargement dans Chrome : `chrome://extensions` → mode développeur → « Charger l'extension non
empaquetée » → dossier `.output/chrome-mv3`.
