# Banc de la pièce G6 (mode d'emploi)

1. Prérequis : `playwright-core` installé HORS dépôt (`npm i playwright-core` dans `%TEMP%\pw-g6`, ou `PW_DIR=<dossier>`) ; Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe`.
2. Serveur : `npx vite --config .superpowers/harness-piece/vite.config.ts` (port 5183, `strictPort`).
3. Pièce : `http://127.0.0.1:5183/.superpowers/harness-piece/piece.html?style=<StyleId>&h=<heure>&meteo=soleil|nuages|pluie|neige&pet=chat|chien|robot&scene=<nom>&t=<s>&w=1440` (`w` = largeur de la pièce rendue ; `t` fige l'horloge) ; `window.done` quand plus aucun `[data-sprite-fallback]`.
4. Planche : `planche.html?kind=<kind|a,b|all>&style=<StyleId>&res=1` : kinds × 8 angles rendus par le moteur seul.
5. Captures : `node .superpowers/harness-piece/shot.mjs <url-de-base> <dossier> "<requête>"...` (un PNG par requête ; attend `window.done`, 30 s, `TIMEOUT=<ms>` pour allonger).
6. Mesure : `node .superpowers/harness-piece/perf.mjs "<url>" [secondes]` : CPU ×4 (`CPU=<n>` pour changer), temps jusqu'à `done`, images/s, peinture par sprite (`window.__spriteStats`, registre mesuré posé par le banc : aucune modification de `src/`), cache.
7. Publication : `node .superpowers/harness-piece/publish.mjs <dossier-de-png> <sous-dossier>` : copie dans `Wikimasters-g6-captures/g6/<sous-dossier>/`, met à jour `g6/README.md`, commit, push, affiche le lien (branche `captures/g6-piece`).
8. `scene=<nom>` (rock, nap, hide, scratch, brush, tree, egg) : **branché à la tâche 15** (moteur de vie du mobilier). Aujourd'hui le nom est seulement exposé (`window.__scene`) et l'animal suit son plan normal ; `pet=` pose bien l'animal (RoomView + `usePetSim`).
9. La pièce de `fixtures.ts` (`benchRoom(style)`) : 48 colonnes, étagère garnie, canapé, lampadaire arc, rocking-chair, pouf, bureau + écran + lampe, arbre à chat, monstera, palmier, fenêtres, décors muraux, tapis (lanterne en papier incluse).
10. Pièges : la peinture est menée par tranches de 6 ms à chaque image, donc le temps jusqu'à `done` dépend surtout de la cadence d'images (voir le rapport de la tâche 4).
