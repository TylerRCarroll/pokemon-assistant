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
5. **Calc** – `@smogon/calc` damage calculator and threat checks (meta or romhack trainers)
6. **Trainer** – spaced-repetition quizzes on matchups, abilities, moves, counters, and romhack changes

The Team Builder has a **Playthrough** mode (Scarlet/Violet, Black/White, Renegade Platinum, Unbound): pick how far you are, and warnings and swap suggestions only use Pokémon you could have by then, evolved as far as the level cap allows.

Ideas next: Unbound move tutors and custom-ability descriptions, Renegade Platinum evolution changes and encounters, a Pokémon Champions ruleset.

## Credits

Game data from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) via `@pkmn`. Unbound data from the Unbound community documentation, Skeli's Dynamic Pokémon Expansion, and hzla's Unbound calc. Pokémon is © Nintendo / Game Freak / The Pokémon Company. This is a non-commercial fan project.
