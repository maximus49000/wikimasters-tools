---
name: nouvelle-discussion
description: Ouvre une nouvelle discussion (session Claude Code) dans l'application Claude de bureau, sur le projet Wikimasters tools, et la démarre par un « claude rc » (Remote Control activé) pour pouvoir la suivre depuis le téléphone. À utiliser quand l'utilisateur demande « nouvelle discussion », « nouvelle conversation », « ouvre une session », y compris depuis l'application Android Claude (Remote Control). Argument facultatif : le sujet ou la première consigne de la discussion.
---

# Nouvelle discussion Wikimasters (avec « claude rc »)

But : créer une **nouvelle session** dans l'interface Claude de bureau (onglet Code), dans le dossier du projet, puis activer son **Remote Control** dès son premier tour pour qu'elle apparaisse dans claude.ai/code et dans l'application Android Claude.

L'appel de cette skill par l'utilisateur (depuis le bureau ou depuis le téléphone en Remote Control) **vaut demande explicite** : on démarre la session tout de suite, sans carte « New session / Do it here ».

## Étapes

1. **Sujet** : prendre les arguments de la skill comme sujet / première consigne. S'il n'y en a pas, la nouvelle discussion attend simplement les instructions.

2. **Titre** : court (< 60 caractères), en français, tiré du sujet ; sans sujet : « Nouvelle discussion Wikimasters ».

3. **Démarrer la session** avec `mcp__ccd_session__start_session` :
   - `initiation`: `"user_asked"`
   - `context`: `"fresh"`
   - `cwd`: `C:\Users\maxim\Downloads\Wikimasters tools` (vérifier avec `mcp__ccd_session__list_start_targets` si le chemin a pu changer ; ne jamais le deviner)
   - `title`: le titre de l'étape 2
   - `prompt` (le brief) — commencer TOUJOURS par :
     > Première action, avant toute autre : fais un « claude rc », c'est-à-dire active le Remote Control de cette session avec `mcp__ccd_session_mgmt__set_remote_control` (`session_id: "self"`, `enabled: true`). Si l'outil est indisponible ou refusé, dis-le en une ligne et demande à l'utilisateur d'activer le Remote Control depuis la barre d'outils de la session.
     
     puis, s'il y a un sujet : `Ensuite : <sujet>` ; sinon : `Ensuite, présente-toi en une ligne et attends les instructions de l'utilisateur.`
   - `background` (≥ 80 caractères) : « Nouvelle discussion ouverte via la skill nouvelle-discussion sur le projet Wikimasters tools (dépôt maximus49000/wikimasters-tools). Suivre la mémoire du projet (MEMORY.md), notamment la règle de session concurrente : vérifier la branche courante avant d'écrire, worktree si une autre session travaille dans le dossier. »
   - Ne pas passer `target`, `model`, `effort` ni `use_worktree` sauf demande de l'utilisateur.

4. **Filet de sécurité Remote Control** : si la session a déjà joué son premier tour au moment de rendre compte, on peut appeler `mcp__ccd_session_mgmt__set_remote_control` avec l'id `local_…` renvoyé et `enabled: true` (sans effet si c'est déjà actif). Un refus ici n'est pas bloquant : la nouvelle session l'active elle-même.

5. **Compte rendu** (une ou deux lignes, lisibles sur téléphone) : le titre en lien `[titre](#local_<id>)` avec l'id rendu par l'outil, et le rappel que la discussion apparaîtra dans l'application Android une fois son Remote Control actif. Ne pas inventer le résultat : si `start_session` est refusé, citer la raison telle quelle.

## Limites

- La session tourne **sur l'ordinateur** (application de bureau ouverte et allumée) ; le téléphone ne fait que la piloter.
- Depuis Android, la skill ne marche que dans une discussion déjà en Remote Control (c'est elle qui crée l'autre).
- Si l'application refuse le démarrage (tour lancé par un événement automatique, par exemple), elle le dit : relayer le message, ne pas réessayer en boucle.
