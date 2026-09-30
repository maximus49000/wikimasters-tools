# Installer Wikimasters Tools

Trois cibles, deux paquets (`npm run package` les produit dans `.output/`, copiés dans `livrables/`) :

| Cible | Fichier | Méthode |
|---|---|---|
| Chrome / Edge / Brave (ordinateur) | `wikimasters-tools-0.1.0-chrome.zip` | chargement manuel |
| Firefox (ordinateur) | `wikimasters-tools-0.1.0-firefox.zip` | chargement temporaire, ou installation signée |
| Firefox Android (« mobile ») | `wikimasters-tools-0.1.0-firefox.zip` | installation signée (voir plus bas) |
| Code source (demandé par Mozilla) | `wikimasters-tools-0.1.0-sources.zip` | envoi avec la soumission AMO |

Chrome Android et Safari iOS ne savent pas installer d'extension : seul Firefox Android convient sur mobile.

## Chrome / Edge / Brave

1. Décompressez `wikimasters-tools-0.1.0-chrome.zip` dans un dossier qui restera en place.
2. Ouvrez `chrome://extensions`, activez le **mode développeur**.
3. **Charger l'extension non empaquetée** → choisissez le dossier décompressé.
4. Ouvrez https://www.wiki-masters.com : l'extension agit sur ce site uniquement.

(Pour la Chrome Web Store : envoyez le même zip dans le tableau de bord développeur ; 5 $ de frais uniques.)

## Firefox (ordinateur)

**Essai rapide (disparaît au redémarrage)** : `about:debugging#/runtime/this-firefox` → *Charger un module complémentaire temporaire…* → choisissez le zip (ou `manifest.json` du dossier `firefox-mv3`). Firefox 128 minimum.

**Installation durable** : Firefox n'installe durablement que des extensions **signées** (voir « Signature » ci-dessous), puis `about:addons` → roue dentée → *Installer un module depuis un fichier…*.

## Firefox Android

Prérequis : Firefox 128 ou plus récent (Firefox Nightly non requis si l'extension est signée).

Le zip seul ne s'installe pas sur Android (pas de chargement temporaire sans câble). Deux voies :

1. **Extension signée en diffusion non listée (recommandé, gratuit)**
   - Sur https://addons.mozilla.org/developers/ : *Envoyer un nouveau module* → **« Sur mon propre site »** (non listé) → envoyez `…-firefox.zip` et, quand c'est demandé, `…-sources.zip`.
   - Mozilla renvoie un fichier `.xpi` signé en quelques minutes. Téléchargez-le **depuis Firefox Android** (ou transférez-le sur le téléphone, puis ouvrez-le depuis Firefox) : Firefox propose de l'installer.
2. **Diffusion publique sur AMO** : même envoi en choisissant « Sur ce site » ; relecture plus longue, puis l'extension s'installe depuis *Menu → Modules complémentaires*.

Autorisez l'accès à `www.wiki-masters.com` si Firefox le demande (Menu → Modules complémentaires → Wikimasters Tools → Autorisations).

### Usage sur mobile (adaptations tactiles)

- La vue Monde s'empile en colonne : carte en haut, liste « À placer » en dessous.
- Il n'y a ni survol ni clic droit : **toucher un point ouvre la fiche de la carte**.
- Pour corriger un point, touchez **« Déplacer des points »** (au-dessus de la carte). Les points ne sont déplaçables que dans ce mode, pour ne pas les faire glisser en faisant défiler la carte. Dans ce mode, toucher un point le sélectionne : *Ouvrir la carte* ou *Retirer mon placement* (points à bordure orange). Touchez **« Terminer le déplacement »** pour revenir au mode normal.
- Les cibles tactiles sont élargies (zone de 40 px autour des points et boutons).
- Pour placer une carte de la liste « À placer » : touchez son nom, puis touchez la carte.

## Signature (Firefox)

Identifiant d'extension : `wikimasters-tools@maximus49000.github.io` (fixé dans `wxt.config.ts`, à garder identique entre versions). Le manifeste déclare `data_collection_permissions: none` : aucune donnée n'est envoyée à un serveur du projet (seuls des titres d'articles partent vers Wikipédia / Wikidata).

## Reconstruire les paquets

    npm install
    npm test
    npm run package          # zip Chrome + zip Firefox (MV3) + zip des sources, dans .output/

Commandes séparées : `npm run build` (Chrome, dossier `.output/chrome-mv3`), `npm run build:firefox` (`.output/firefox-mv3`), `npm run dev:firefox`. Une nouvelle version = changer `version` dans `package.json` avant `npm run package`.

## Non vérifié

Le tactile et l'installation Firefox n'ont pas été essayés sur un vrai appareil : à confirmer (le glisser des points en mode déplacement, l'empilement de la vue Monde, l'invite de permission d'hôte de Firefox).
