# Fixtures TheGamesDB

`tgdb-hollow-knight.json` et `tgdb-rdr2.json` : réponses réelles de `GET /tgdb/games?name=…` du relais (2026-10-16), amont `v1.1/Games/ByGameName` avec `include=boxart,platform&fields=overview,platform`.

Champs réellement présents par jeu : `id, game_title, release_date, platform, region_id, country_id, overview, developers`. Pochettes dans `include.boxart.data[<id jeu>]` (`type`, `side` front/back, `filename`) ; préfixes d'URL dans `include.boxart.base_url` (`original`, `large`, `medium`, `small`, `thumb`…). Noms de plateformes dans `include.platform.data[<id>]`.

Plateformes observées (id → nom), source : `include.platform` des deux fixtures :
- 1 → PC
- 12 → Sony Playstation 3
- 15 → Microsoft Xbox 360
- 41 → Nintendo Game Boy Color
- 4916 → Android
- 4919 → Sony Playstation 4
- 4920 → Microsoft Xbox One
- 4971 → Nintendo Switch
- 4980 → Sony Playstation 5

Régions observées (`region_id` brut, sans libellé dans ces réponses) : 0, 1, 2, 6, 9. Le relais n'expose pas la liste officielle des régions : ne pas leur prêter de sens au-delà des valeurs brutes.
