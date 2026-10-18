---
name: autosprite
description: À utiliser quand l'utilisateur veut générer un sprite, un personnage, une animation (marche, idle, 8 directions isométriques), un objet ou une planche de sprites avec AutoSprite (autosprite.io), par exemple un passant Ghibli pour la ville ou un accessoire pour la pièce. Argument facultatif : ce qu'il faut générer.
---

# Générer avec AutoSprite (prompt travaillé ensemble, validé avant envoi)

AutoSprite crée des personnages, des animations et des planches de sprites à partir d'un texte. **Chaque génération coûte des crédits et part chez un service extérieur.** On écrit donc le texte de génération **avec l'utilisateur**, jusqu'à ce qu'il soit le plus précis possible, et **rien n'est envoyé sans son accord explicite sur le texte exact**.

## Règle d'or

Avant **chaque** appel qui génère (create_character, generate_portrait, generate_pose, generate_spritesheet, generate_isometric_pack, generate_attack_moves, generate_asset_preview, animate_asset, generate_*_3d_*) :

1. Montrer le **bloc d'envoi** (voir plus bas), avec l'outil, tous les arguments exacts et le coût en crédits.
2. Poser une question fermée : « J'envoie ce texte à AutoSprite ? »
3. N'envoyer qu'après un **oui** clair de l'utilisateur dans la discussion, sur **ce** bloc.

Toute modification, même d'un mot ou d'un réglage, oblige à remontrer le bloc complet et à redemander l'accord. Un accord ne vaut que pour un envoi : la génération suivante (animation après le personnage, nouvel essai) se valide à nouveau. Les appels qui ne font que lire (get_job_status, get_character, list_*, get_spritesheet, regenerate_* gratuits) ne demandent pas de validation.

| Pensée | Réalité |
|---|---|
| « Il a déjà dit oui tout à l'heure » | L'accord portait sur un autre bloc. On redemande. |
| « Je n'ai changé qu'un adjectif » | Le texte envoyé n'est plus celui validé. On remontre. |
| « Il a dit de faire vite / de se débrouiller » | La validation reste obligatoire : elle prend une ligne. |
| « Le personnage est validé, l'animation en découle » | Autre appel, autre coût : nouveau bloc, nouvel accord. |

## Étapes

### 1. Comprendre le besoin
Demander (une question à la fois, avec des choix quand c'est possible) ce qui manque :
- **quoi** : personnage, objet, animation d'un personnage existant ;
- **usage dans Wikimasters** : passant de la ville, commerçant, objet de la pièce… et sa **taille à l'écran** (un passant fait environ 24 px de haut : formes lisibles, peu de détails) ;
- **vue** : de face, de profil, isométrique 8 directions (`generate_isometric_pack`) ;
- **apparence** : silhouette, âge, coiffure, vêtements, accessoires, couleurs.

### 2. Rédiger le texte de génération
En **anglais** (meilleurs résultats), phrases courtes et concrètes, dans cet ordre : sujet → corps et pose → coiffure → vêtements (matière, coupe, couleur) → accessoires → style → couleurs → contraintes de lisibilité. Un prompt de personnage tient en 600 caractères au plus.

Style par défaut du projet (direction Ghibli « cellulo ») : `Studio Ghibli style, cel-shaded anime, flat colors, clean dark ink outline, one sharp shadow tone, no gradients, soft muted palette like Kiki's Delivery Service town folk, simple readable shapes`. À adapter si l'utilisateur veut autre chose.

Couleurs : nommer des teintes précises (`navy blue`, `cream`, `terracotta`) plutôt que « dark » ou « colorful » ; reprendre si possible celles déjà employées par les pantins de la ville (`src/core/library/city/people.ts`).

### 3. Travailler le texte ensemble
Présenter le texte en français **et** en anglais, puis lister les points flous (ce que le modèle risque d'inventer : chaussures, longueur des manches, expression du visage, arrière-plan…). Proposer des variantes concrètes et intégrer les réponses. Recommencer jusqu'à ce que l'utilisateur dise que c'est bon.

### 4. Bloc d'envoi (à montrer tel quel)

```
Outil : create_character
Coût : 3 crédits (pro)
Arguments :
{
  "name": "…",
  "prompt": "…texte anglais exact…",
  "quality": "pro"
}
```
Puis : « J'envoie ce texte à AutoSprite ? » et attendre la réponse.

### 5. Envoyer
- **Outils MCP** `mcp__autosprite__*` s'ils sont chargés (serveur `autosprite` déclaré dans `~/.claude.json`).
- Sinon, même serveur en JSON-RPC, avec la clé lue dans `~/.claude.json`, sans jamais l'afficher ni l'écrire dans le dépôt :

```bash
node -e 'const j=require(require("os").homedir()+"/.claude.json");process.stdout.write(j.mcpServers.autosprite.headers.Authorization)' > "$TEMP/as-auth"
curl -s -X POST https://www.autosprite.io/api/mcp -H "Authorization: $(cat "$TEMP/as-auth")" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<outil>","arguments":{…arguments validés…}}}' | sed -n 's/^data: //p'
```
(`tools/list` donne la liste et les paramètres de chaque outil.)

Les travaux longs (animations, packs) rendent un `jobId` : appeler `get_job_status` **au plus une fois toutes les 30 secondes**, en tâche de fond. `get_account` (solde) : une seule fois par session.

### 6. Montrer et garder le résultat
- Télécharger aussitôt les images (les adresses `?sig=` expirent en quelques minutes) dans `.superpowers/autosprite/<nom>/` (dossier non versionné), avec un `prompt.json` qui contient le bloc validé et la date.
- Montrer chaque image à l'utilisateur (Read pour la voir, SendUserFile pour la lui envoyer).
- Comparer avec ce qui était attendu, noter les écarts et proposer la correction du texte ; une nouvelle génération repasse par l'étape 4.

## Coûts (crédits)

| Appel | Coût |
|---|---|
| create_character | turbo 1, pro 3 ; pixelArt 3 |
| generate_spritesheet (par animation) | turbo 5, pro 10, ultra 10/s, max 35 |
| generate_isometric_pack (8 directions, par action) | 15 |
| generate_attack_moves | 5 par mouvement |
| generate_character_3d_model | 50 (+5 par animation) |
| generate_asset_preview | 1 |
| upload_character, regenerate_* | gratuit |

## Erreurs connues
- « MCP access requires a paid subscription » : le compte n'a pas d'abonnement. Le dire à l'utilisateur et s'arrêter : pas de nouvel essai, rien d'autre à tenter.
- Clé refusée : la clé a pu être régénérée. Demander la nouvelle et mettre à jour `~/.claude.json` (jamais le dépôt).
- Ne jamais se connecter au site web à la place de l'utilisateur.
