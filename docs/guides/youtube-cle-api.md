# Mode opératoire détaillé — obtenir la clé de l'API YouTube

Objectif : obtenir une clé qui permet au relais de chercher des documentaires. Durée : 15 à 20 minutes. Coût : 0 €. **Aucune carte bancaire n'est nécessaire.**

Les intitulés de Google changent de temps en temps : si un libellé diffère légèrement, cherchez le plus proche, ou envoyez-moi une capture (en masquant la clé).

Règle d'or : la clé est un mot de passe. Ne la collez ni dans le dépôt, ni dans un message, ni dans une issue GitHub, ni dans une capture d'écran.

---

## Étape 1 — Choisir le compte Google

1. Décidez quel compte Google possédera le projet. Je conseille un compte dédié (par exemple créé pour Wikimasters Tools), pour ne pas mélanger avec votre compte personnel.
2. Si vous devez en créer un : https://accounts.google.com/signup, puis suivez l'assistant (nom, date de naissance, adresse, mot de passe).
3. Activez la validation en deux étapes sur ce compte (myaccount.google.com → Sécurité → Validation en 2 étapes).

## Étape 2 — Ouvrir la console Google Cloud

1. Dans le navigateur, connecté avec ce compte, allez sur **https://console.cloud.google.com**.
2. Une fenêtre peut demander d'accepter les conditions d'utilisation : cochez la case, choisissez votre pays, cliquez sur **Accepter et continuer**.
3. Si une bannière propose un « essai gratuit » avec 300 $ de crédit : **ignorez-la** (elle demande une carte). Vous n'en avez pas besoin.

## Étape 3 — Créer le projet

1. En haut de la page, à droite du logo « Google Cloud », cliquez sur le **sélecteur de projet** (il affiche « Sélectionner un projet » ou le nom d'un projet existant).
2. Dans la fenêtre, cliquez sur **Nouveau projet** (en haut à droite).
3. **Nom du projet** : `wikimasters-relais`.
4. **Organisation / Emplacement** : laissez « Aucune organisation ».
5. Cliquez sur **Créer**. Attendez quelques secondes que la cloche de notification confirme la création.
6. Rouvrez le sélecteur de projet et **sélectionnez `wikimasters-relais`**. Vérifiez que son nom s'affiche bien en haut de la page : toutes les étapes suivantes se font dans ce projet.

## Étape 4 — Activer l'API YouTube

1. Cliquez sur le menu **☰** (en haut à gauche) → **API et services** → **Bibliothèque**.
2. Dans la barre de recherche, tapez `YouTube Data API v3`.
3. Cliquez sur le résultat **YouTube Data API v3** (éditeur : Google Enterprise API).
4. Cliquez sur le bouton bleu **Activer**. La page affiche ensuite « API activée » et des graphiques.
5. Ne cliquez pas sur « Créer des identifiants » dans cette page : on le fait à l'étape suivante, dans le bon ordre.

## Étape 5 — Créer la clé API

1. Menu **☰** → **API et services** → **Identifiants**.
2. En haut, cliquez sur **+ Créer des identifiants** → **Clé API**.
3. Une fenêtre affiche la clé (une suite d'environ 39 caractères qui commence par `AIza`). **Cliquez sur l'icône de copie** et collez-la tout de suite dans votre gestionnaire de mots de passe, avec la mention « Clé YouTube relais Wikimasters ».
4. Cliquez sur **Fermer**. La clé apparaît dans la section « Clés API » sous le nom « Clé API 1 ».

Si Google propose de « Modifier la clé » directement, vous pouvez enchaîner avec l'étape 6.

## Étape 6 — Restreindre la clé (important)

Une clé non restreinte pourrait servir à d'autres services Google si elle fuitait.

1. Dans la section « Clés API », cliquez sur le **nom** de la clé (ou sur les trois points → **Modifier la clé API**).
2. **Nom** : renommez-la `relais-wikimasters`.
3. **Restrictions relatives aux applications** : choisissez **Aucune**. (Le relais tourne chez Cloudflare, dont les adresses changent : une restriction par adresse IP ne fonctionnerait pas. La restriction par API ci-dessous suffit.)
4. **Restrictions relatives aux API** : choisissez **Limiter la clé**.
5. Dans la liste déroulante, cochez uniquement **YouTube Data API v3**, puis **OK**.
6. Cliquez sur **Enregistrer**. La prise en compte peut prendre jusqu'à 5 minutes.

## Étape 7 — Tester la clé (sans l'exposer)

Dans un terminal PowerShell sur votre ordinateur :

```powershell
$cle = Read-Host "Collez la clé"
```
Collez la clé, Entrée. Elle reste en mémoire dans cette fenêtre seulement.

```powershell
Invoke-RestMethod "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=Bataille+de+Verdun+documentaire&key=$cle" | ConvertTo-Json -Depth 5
```
Résultat attendu : une liste de 3 vidéos avec leurs titres. Erreurs possibles :
- `API key not valid` : clé mal copiée, ou restriction pas encore active (attendre 5 minutes).
- `accessNotConfigured` : l'API n'est pas activée dans le bon projet (revoir l'étape 4).
- `quotaExceeded` : le quota du jour est épuisé (revient à minuit, heure du Pacifique).

Fermez ensuite la fenêtre PowerShell : la clé disparaît de la mémoire.

## Étape 8 — Comprendre et surveiller le quota

- Le quota gratuit est de **10 000 unités par jour**. Une recherche coûte **100 unités** : soit 100 recherches neuves par jour (le cache du relais évite de refaire les mêmes).
- Pour suivre la consommation : ☰ → **API et services** → **API et services activés** → **YouTube Data API v3** → onglet **Quotas et limites système**.
- Le quota se remet à zéro chaque jour à minuit, heure du Pacifique (9 h du matin en France, 8 h en été).

## Étape 9 — Demander plus de quota (plus tard, si besoin)

Quand la fonction aura des utilisateurs et que les 100 recherches par jour seront saturées :
1. Cherchez « YouTube API Services Audit and Quota Extension Form » (formulaire officiel de Google).
2. Décrivez l'usage : extension de navigateur sur Wikipédia, recherche de documentaires d'histoire, mise en cache, lecteur YouTube intégré officiel.
3. La réponse peut prendre plusieurs semaines. C'est gratuit. En attendant, le relais retombe sur les boutons de recherche.

Rappel de conformité : l'extension utilise le lecteur intégré officiel de YouTube et ne télécharge ni ne stocke aucune vidéo, ce qui est conforme aux conditions de l'API.

## Étape 10 — Ce qu'il faut me confirmer

Ne m'envoyez **jamais** la clé. Dites-moi seulement : « clé créée, testée à l'étape 7 ». Je vous guiderai ensuite pour la déposer en secret chez Cloudflare (`docs/guides/cloudflare-relais.md`, partie C).

## En cas de fuite de la clé

1. Console Google Cloud → Identifiants → cliquez sur la clé → **Supprimer** (ou « Régénérer »).
2. Créez-en une nouvelle (étapes 5 et 6).
3. Remplacez le secret chez Cloudflare : `npx wrangler secret put YOUTUBE_API_KEY`.
