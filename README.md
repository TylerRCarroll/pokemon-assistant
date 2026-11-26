# Pokémon Assistant

A personal web app for building better Pokémon teams and learning the game: type matchups, abilities, learnsets, movesets, and items. It covers every mainline generation plus the romhacks **Renegade Platinum** and **Pokémon Unbound**.

## Getting started

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run build    # type check + production build
```

## How it works

All game data goes through a **ruleset** (`src/rulesets/`). A ruleset is either an official generation, built on [`@pkmn/data`](https://github.com/pkmn/ps), or a romhack. A romhack is a base generation plus a JSON override overlay, the same idea as Showdown's `mods/`. Features never read `@pkmn` directly, so the same code works for official games and hacks.

| Ruleset | Base | Status |
|---|---|---|
| Gen 1–9, Gen 8/9 National Dex | `@pkmn/data` | Complete |
| Renegade Platinum (Complete patch) | Gen 4 + Gen 6 type chart | Types, stats, abilities, moves, learnsets, TMs, and 760 trainer battles imported from the community docs |
| Pokémon Unbound | Gen 8 National Dex + Legends: Arceus | Balanced base stats, abilities, learnsets (level-up, TM, egg), TMs, and boss teams for Difficult/Expert/Insane. Move tutors not imported |

### Romhack data

Raw romhack documentation lives in `Documentation/<hack>/` (gitignored, since the spreadsheets are large). Import scripts turn it into committed JSON under `data-src/romhacks/<hack>/generated/`:

```sh
npm run import:unbound
npm run import:rp
npm run fetch:smogon   # Smogon usage stats, sets, and sample teams (refresh monthly)
npm run fetch:availability   # when Pokémon become obtainable in Scarlet/Violet and Black/White (PokéAPI + Bulbapedia)
npm run fetch:trainers       # story boss teams for Scarlet/Violet and Black/White (Bulbapedia)
```

Hand-curated overrides in `data-src/romhacks/<hack>/overlay.json` take precedence over generated data.

Unbound's import also reads two public GitHub sources, saved under `Documentation/Unbound/source/`:

- `dpe/`: `src/Learnsets.c`, `Egg_Moves.c`, `Base_Stats.c`, `TM_Tutor_Tables.c`, and `tm_compatibility/` from the `Unbound` branch of [Skeli789/Dynamic-Pokemon-Expansion](https://github.com/Skeli789/Dynamic-Pokemon-Expansion), the source Unbound 2.1.1 is built from
- `calc/unbound.js`: `backups/unbound.js` from [hzla/Dynamic-Calc-Unbound](https://github.com/hzla/Dynamic-Calc-Unbound), the boss teams in hzla's damage calc (read as JSON, never executed)

## Roadmap

All six planned features are in:

1. **Types** – full type chart and per-typing matchups
2. **Dex** – Pokémon, moves, abilities, items, learnsets, evolutions
3. **Team Builder** – legal sets, coverage analysis, Showdown import/export
4. **Planner** – Smogon usage, sets, and sample teams; romhack trainer battles
5. **Calc** – `@smogon/calc` damage calculator and threat checks against the meta or a game's bosses (romhack trainers; Scarlet/Violet and Black/White story fights). For a boss Pokémon nothing on your team checks, *How do I beat it?* damage-calcs single changes within the level cap: more levels, evolving, a new move, a held item, or a Pokémon you can get by then
6. **Trainer** – spaced-repetition quizzes on matchups, abilities, moves, counters, and romhack changes

The Team Builder has a **Playthrough** mode (Scarlet/Violet, Black/White, Renegade Platinum, Unbound): pick how far you are, and warnings and swap suggestions only use Pokémon you could have by then, evolved as far as the level cap allows.

Ideas next: Unbound move tutors and custom-ability descriptions, Renegade Platinum evolution changes and encounters, a Pokémon Champions ruleset.

## Devices: sync, install, Android

**Sync.** Backup → *Sync between devices*: paste a GitHub token with only the **Gists: Read and write** permission on each device. Teams, quiz progress, and settings sync through one private gist (newer edit wins per team; deletions stick). The token is stored in that browser only and is never written into backups or the gist.

**Install the website.** Open the site on a phone and use *Add to Home screen* / *Install app*. It then opens like an app and works offline.

**Android app (Obtainium).** Pushing a version tag builds a signed APK and publishes it as a GitHub Release:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

In Obtainium, *Add App* → `https://github.com/TylerRCarroll/pokemon-assistant`. It installs the APK from the latest release and picks up new ones.

One-time signing setup (every release must be signed with the same key, or Android refuses the update). In Git Bash, in a folder outside the repo, choose a password and run:

```sh
openssl req -x509 -newkey rsa:4096 -nodes -keyout key.pem -out cert.pem -days 10000 -subj "/CN=PokePlanner"
openssl pkcs12 -export -inkey key.pem -in cert.pem -name pokeplanner -out pokeplanner-release.p12
base64 -w0 pokeplanner-release.p12 > keystore-base64.txt
rm key.pem cert.pem
```

Then in the repo's *Settings → Secrets and variables → Actions*, add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `keystore-base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | the export password you chose |
| `ANDROID_KEY_ALIAS` | `pokeplanner` |
| `ANDROID_KEY_PASSWORD` | the same password |

Back up `pokeplanner-release.p12` and its password somewhere safe (a password manager), then delete `keystore-base64.txt`. If the key is lost, installed copies can't be updated and must be uninstalled first.

Icons and splash screens come from `assets/icon.svg` (`npm run icons`).

## Credits

Game data from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) via `@pkmn`. Unbound data from the Unbound community documentation, Skeli's Dynamic Pokémon Expansion, and hzla's Unbound calc. Pokémon is © Nintendo / Game Freak / The Pokémon Company. This is a non-commercial fan project.
