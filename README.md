# Wikimasters Tools (non officiel)

Extension Chrome **non officielle et en lecture seule** pour [WikiMasters](https://www.wiki-masters.com).
Elle n'est liée ni au jeu, ni à Wikipédia.

## Ce que fait la V1

Un badge de prix sous chaque carte que vous avez déjà achetée ou vendue : médiane de vos
transactions (ventes et achats), fourchette, nombre de transactions et tendance. Le calcul se fait
dans votre navigateur ; rien n'est envoyé à un serveur.

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
