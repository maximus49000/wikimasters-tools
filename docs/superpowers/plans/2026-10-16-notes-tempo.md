# Notes de musique au tempo du morceau — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les notes de musique au-dessus de la chaîne hi-fi naissent et montent au rythme du BPM du morceau en cours, mesuré sur l'extrait Deezer de 30 s.

**Architecture:** Un estimateur pur (`src/core/music/tempo-estimate.ts`) calcule le BPM à partir d'échantillons PCM ; un dépôt (`tempo-repo.ts`) garde le résultat par piste Spotify ; un service (`src/content/tempo-service.ts`, inscrit par `overlay.ts`) cherche l'extrait par une nouvelle route du relais (`/deezer-preview`), le télécharge, le décode et mesure. `RoomView` lit le BPM de la piste en cours et le passe à `MusicNotes`, qui en tire cadence et durée.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`), React 18, Web Audio (`OfflineAudioContext.decodeAudioData`), vitest 5 + jsdom, Cloudflare Worker (`relay/`).

**Spec:** `docs/superpowers/specs/2026-10-16-notes-tempo-design.md`

## Global Constraints

- Référence : **120 BPM** = rythme actuel (`NOTE_EVERY_MS` 700, `NOTE_LIFE_MS` 3400) ; facteur `k = 120 / bpm` ; intervalle `700 × k`, durée `3400 × k` ; hauteur de montée inchangée (~110 px).
- BPM utilisé borné à **[60, 180]** ; tempo inconnu (`null`) → 120.
- Tempo trouvé gardé **180 jours** ; « introuvable / douteux » re-vérifié après **30 jours** ; erreur réseau → rien gardé ; clé du `store` **`tempo-v1`**, indexée par l'`uri` Spotify de la piste.
- « Douteux » = pas de pic net d'autocorrélation ; un multiple probable (×2, ×1,5) est gardé. Le `bpm` Deezer non nul peut départager deux multiples, jamais répondre seul.
- Correspondance Deezer : titre normalisé (accents, casse, suffixes entre parenthèses / après « - » du type Remastered, « feat. ») égal ou contenu l'un dans l'autre ET artiste contenu l'un dans l'autre ; sinon `previewUrl: null`.
- Jamais d'audio par le relais ; jamais de cache de l'URL d'extrait (signée, expire ~15 min).
- Mesure hors du chemin de l'animation, une fois par piste ; pas de rendu React par image ; `core` n'importe jamais `content`.
- Commandes (pas de `npx` ni de `npm` nu) : `node node_modules/vitest/vitest.mjs run <fichier>`, `node node_modules/typescript/bin/tsc --noEmit -p .`, `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run test:famille -- <familles>`.
- Familles : `tests/core/music/**` → `ecoute` ; `tests/content/tempo-*` → `ecoute` (motif à ajouter) ; `tests/content/hifi*` → `scene-piece` ; `tests/relay/**` → `relais`.
- Commits en français, conventionnels, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pas pousser.

## Review Focus

- Changement de piste pendant une mesure : le résultat tardif de l'ancienne piste ne doit pas s'appliquer à la nouvelle (test Task 3).
- Même piste demandée plusieurs fois (rendus, retour au premier plan) : une seule mesure (test Task 3).
- Extrait indécodable / `fetch` en échec / relais en panne : tempo `null`, rien gardé en cas de panne, aucune exception qui remonte à la scène (test Task 3).
- BPM qui change pendant la lecture : la note suivante prend le nouvel intervalle sans attendre l'ancien (test Task 4).
- Signal silencieux ou bruit sans rythme : `null`, pas un BPM inventé (test Task 1).

---

### Task 1: Estimateur de tempo (pur)

**Files:**
- Create: `src/core/music/tempo-estimate.ts`
- Test: `tests/core/music/tempo-estimate.test.ts`

**Interfaces:**
- Produces: `estimateBpm(samples: Float32Array, sampleRate: number, hint?: number | null): number | null` — BPM dans [60, 200], ou `null` si douteux.

- [ ] **Step 1: Tests** (signaux synthétiques générés dans le test : clics courts — 5 ms de bruit décroissant — à tempo fixe sur 30 s à 22 050 Hz, plus un bruit de fond faible)
  - `clics à 90, 120, 150 BPM → résultat à ±2 % près` ;
  - `clics à 120 BPM avec un temps sur deux plus faible (accentuation) → 120 ± 2 %` ;
  - `silence → null` ; `bruit blanc seul → null` ;
  - `clics à 140 BPM avec hint 70 → 70 ± 2 %` (le hint départage ×2) et `hint 0 ou null → ignoré`.
- [ ] **Step 2:** Lancer → FAIL (module absent).
- [ ] **Step 3: Implémenter.** Base qui marche (5/8 sur le banc réel) : enveloppe d'énergie log par pas de 10 ms, flux positif centré, autocorrélation interpolée pour BPM 60–200 par pas de 0,5, pondération log-gaussienne centrée 120 (σ = 0,9 octave). À améliorer (flux par bandes de fréquences, renfort des harmoniques du pic, normalisation de l'autocorrélation) ; « douteux » = pic normalisé sous un seuil choisi par le constructeur ; le hint choisit parmi {bpm, bpm/2, bpm×2, bpm×2/3, bpm×3/2} le plus proche s'il est à ±8 %.
- [ ] **Step 4:** → PASS. **Step 5:** Commit `feat(musique): estimateur de tempo`.

### Task 2: Route du relais `/deezer-preview`

**Files:**
- Create: `relay/src/deezer.ts`
- Modify: `relay/src/index.ts` (route + `LIMITS.deezer: [60, 60_000]`), `relay/README.md` (une ligne de route)
- Test: `tests/relay/deezer.test.ts`

**Interfaces:**
- Produces: `GET /deezer-preview?title=…&artist=…` → `200 { previewUrl: string | null, deezerBpm: number | null }` ; `400 bad-request` si titre ou artiste vide ou > 200 caractères. Fonction `proxyDeezerPreview(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult>` sur le modèle de `proxyGeocode`.

- [ ] **Step 1: Tests** (fetch simulé) : recherche `https://api.deezer.com/search?q=<artiste> <titre>&limit=5` puis `https://api.deezer.com/track/<id>` du premier résultat correspondant → `previewUrl` + `deezerBpm` (`bpm` 0 → `null`) ; aucun résultat correspondant (autre artiste) → `previewUrl: null` sans appel `/track` ; « One More Time (Remastered) » / « Daft Punk » correspond ; panne amont → `502` via `failure` ; deuxième appel identique dans les 30 jours → un seul `/search` (cache de l'identifiant), mais `/track` rappelé (URL fraîche) ; paramètres vides → 400.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter (cache mémoire de l'instance `Map<clé normalisée, { at, id | null }>`, 30 jours, 500 entrées max — comme `geocode.ts` ; *écart à la spec qui citait KV : la mémoire d'instance suffit, comme les routes voisines*). **Step 4:** → PASS ; `test:famille -- relais`.
- [ ] **Step 5:** Commit `feat(relais): extrait Deezer d'un morceau`.

### Task 3: Dépôt + service de tempo

**Files:**
- Create: `src/core/music/tempo-repo.ts`, `src/content/tempo-service.ts`
- Modify: `src/content/music-registry.ts` (`setTempoService` / `getTempoService`), `src/app/overlay.ts` (inscription avec le `store`), `tests/familles.ts` (`c('tempo-*')` dans `ecoute`)
- Test: `tests/core/music/tempo-repo.test.ts`, `tests/content/tempo-service.test.ts`

**Interfaces:**
- Consumes: `estimateBpm` (Task 1) ; route `/deezer-preview` (Task 2) à `${RELAY_BASE}/deezer-preview`.
- Produces:
  - `createTempoRepo(store: KeyValueStore, now?: () => number): { get(uri: string): Promise<number | null | undefined>; save(uri: string, bpm: number | null): Promise<void> }` — `undefined` = à mesurer ; `null` = introuvable encore valable (30 j) ; nombre = trouvé (180 j).
  - `createTempoService(deps: { repo; fetch: typeof fetch; decode: (bytes: ArrayBuffer) => Promise<{ samples: Float32Array; sampleRate: number }>; estimate: typeof estimateBpm }): { tempo(track: { uri: string; title: string; artist: string }): Promise<number | null>; known(uri: string): number | null | undefined; subscribe(listener: () => void): () => void }` — `known` lit la mémoire de session (synchrone, pour le rendu) ; `tempo` mesure au besoin et notifie.
  - `decode` réel (dans `overlay.ts`) : `OfflineAudioContext` mono 22 050 Hz, `decodeAudioData`, premier canal.

- [ ] **Step 1: Tests** — dépôt : trouvé relu à 179 j, plus à 181 j ; `null` relu à 29 j, plus à 31 j ; clé `tempo-v1`. Service : piste connue du dépôt → aucun `fetch` ; piste inconnue → relais puis extrait puis estimation (hint = `deezerBpm`) puis sauvegarde ; `previewUrl: null` → `null` gardé ; `fetch` rejeté ou relais 5xx → `null` non gardé, pas d'exception ; décodage rejeté → `null` gardé ; deux `tempo()` simultanés de la même piste → un seul appel relais ; `known()` rend la valeur après la mesure et `subscribe` est notifié.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter ; vérifier que `wxt.config.ts` (permissions d'hôte / CSP de l'extension) et la CSP de la page Android autorisent `cdnt-preview.dzcdn.net` (et le relais, déjà appelé) — ajouter l'entrée sinon. **Step 4:** → PASS ; `test:famille -- ecoute` ; `tsc`.
- [ ] **Step 5:** Commit `feat(musique): tempo des morceaux mesuré sur l'extrait Deezer`.

### Task 4: Notes au tempo

**Files:**
- Modify: `src/content/hifi/music-notes.tsx`, `src/content/RoomView.tsx` (lecture du BPM de la piste en cours → `MusicNotes`)
- Create: `src/content/hifi/use-track-tempo.ts`
- Test: `tests/content/hifi-notes.test.tsx` (cas ajoutés), `tests/content/hifi-tempo.test.tsx`

**Interfaces:**
- Consumes: `getTempoService()`, `getPlayerSource()` (Task 3).
- Produces: `MusicNotes` prop `bpm: number | null` ; `noteTiming(bpm: number | null): { everyMs: number; lifeMs: number }` exportée de `music-notes.tsx` ; `useTrackTempo(active: boolean): number | null` — ne s'abonne au lecteur et ne mesure que si `active` (notes visibles) ; ignore un résultat arrivé après un changement de piste.

- [ ] **Step 1: Tests** — `noteTiming(120)` = `{700, 3400}` ; `noteTiming(60)` = `{1400, 6800}` ; `noteTiming(180)` ≈ `{467, 2267}` ; `noteTiming(240)` = `noteTiming(180)` ; `noteTiming(30)` = `noteTiming(60)` ; `noteTiming(null)` = `noteTiming(120)`. Avec faux minuteurs : à 60 BPM, une note après 1400 ms (pas à 700), retirée après 6800 ms et sa durée d'animation CSS est 6800 ms ; passage de 60 à 180 BPM en cours → la note suivante naît 467 ms après la précédente. `useTrackTempo` : changement de piste pendant une mesure → l'ancienne valeur n'est jamais rendue pour la nouvelle piste ; `active=false` → aucun appel au service.
- [ ] **Step 2:** → FAIL. **Step 3:** Implémenter (minuterie qui se reprogramme à chaque naissance avec l'intervalle courant ; durée posée par note dans son style). **Step 4:** → PASS ; `test:famille -- scene-piece ecoute` ; `tsc`.
- [ ] **Step 5:** Commit `feat(bibliotheque): notes de musique au tempo du morceau`.

### Task 5: Banc réel, WikiHow, vérification

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvel id `ouvrir-objet-v2`, même contenu + une phrase sur les notes au tempo et la limite des morceaux lents ou doux ; l'ancienne entrée retirée ou remplacée selon l'usage du fichier)
- Banc local non commité : `.superpowers/harness-tempo/` (page servie en local qui cherche les 8 extraits par la recherche Deezer — requêtes libres de la spec — et affiche le BPM de `estimateBpm`).

- [ ] **Step 1:** Banc : mesurer les 8 morceaux de la spec ; exigence **≥ 5/8 à ±4 %** des tempos de référence (~123, ~101, ~79, ~123, ~123, ~70, ~110, ~117) ; noter les résultats et le temps par morceau dans le rapport. En dessous : revenir à la Task 1.
- [ ] **Step 2:** Entrée WikiHow ; `node node_modules/vitest/vitest.mjs run tests/core/whats-new` → PASS.
- [ ] **Step 3:** `test:famille -- scene-piece ecoute relais fiche` → PASS ; `tsc` → 0 ; `run build` → OK.
- [ ] **Step 4:** Commit `docs(wikihow): notes de musique au tempo du morceau`.
