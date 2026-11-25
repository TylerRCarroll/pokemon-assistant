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
| Renegade Platinum | Gen 4 + Fairy type backported | Draft: overlay not yet imported from Drayano's docs |
| Pokémon Unbound | Gen 8 National Dex | Partial: balanced base stats and TM list imported; learnsets/abilities are still Gen 8 defaults |

### Romhack data

Raw romhack documentation lives in `Documentation/<hack>/` (gitignored, since the spreadsheets are large). Import scripts turn it into committed JSON under `data-src/romhacks/<hack>/generated/`:

```sh
npm run import:unbound
```

Hand-curated overrides in `data-src/romhacks/<hack>/overlay.json` take precedence over generated data.

## Roadmap

1. ~~Foundation: ruleset layer, type chart, ruleset switcher~~
2. Dex: Pokémon, moves, abilities, items, learnsets
3. Team builder with coverage analysis and Showdown import/export
4. Move planner: popular sets, items, abilities, and sample teams (Smogon usage stats)
5. Damage calc (`@smogon/calc`) and meta threat checks
6. Matchup trainer: spaced-repetition quizzes

## Credits

Game data from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) via `@pkmn`. Unbound data from the Unbound community documentation. Pokémon is © Nintendo / Game Freak / The Pokémon Company. This is a non-commercial fan project.
