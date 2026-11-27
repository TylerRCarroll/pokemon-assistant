# PokéPlanner roadmap

Planned features, roughly in the order they build on each other. Each one says what it's for, how it would work, what data it needs, and what's still undecided. Nothing here is scheduled until it's picked up; done items move to the commit log.

**Order:** the battle simulator is playable (doubles still to come). Next: "Where do I catch it?" (it produces the location data), then Nuzlocke mode (which runs on that data), then the gauntlet check (which runs on the simulator). The rest can go in any order.

---

## 0. Battle simulator (phases 1–3 done)

**Goal:** one team against another with the real mechanics. Every move, ability, held item, nature, IV/EV, status, field effect and gimmick is covered, plus bag items and switching. You can either play one side against an AI, or run many battles to see what good play looks like.

**Engine:** `@pkmn/sim`, Pokémon Showdown's battle engine, driven directly (`src/battle/`). On top of it:
- **Bag items**, which Showdown doesn't have: used at the start of the turn, taking that Pokémon's action, with no PP use and no choice lock.
- **In-game rules:** no team preview, and levels at the cap.
- **Romhack data**, as a sim mod.
- **AI players.**

Battles are seeded and logged, so any battle can be replayed or rewound exactly.

**Modes**
- **Play:** you control your team against an **In-game** AI, which plays like the real trainer and mostly goes for its strongest hit, or a **Smart** AI, which picks moves and switches by damage calcs with a one-turn lookahead. The opponent's info can be shown in full or hidden as in the game. You can rewind any turn, and *What should I do?* ranks this turn's options by simulated win chance.
- **Simulate:** run many battles, smart AI against smart AI. You get the win rate, per-Pokémon KOs and faints, and the battles that decided it, each replayable turn by turn.

**Phases**
1. ✓ The engine, bag and romhack mods.
2. ✓ Playing against the AI.
3. ✓ Simulation, the advisor and replays, in Web Workers.
4. Doubles and triples, and the gauntlet check.

**Not covered (yet):** doubles and triples until phase 4. Trainer AIs use generic logic, not each game's exact routine. Bosses' bag items start empty and can be edited, since the data sources don't list them.

---

## 1. "Where do I catch it?"

**Goal:** see where and from when you can get a Pokémon in the game you're playing, without leaving the app. For example: "Route 119 · Super Rod · from Gym 6 · Lv 25–30".

**Where it shows**
- **Dex:** a *Where to find* section for the current playthrough game, listing every location, the method (walk, surf, rod, gift, trade, static), the levels, and the earliest checkpoint. Version exclusives are marked.
- **Suggested swaps and the counter advisor:** each new catch gets a one-line *how to get it*, using the earliest location. A PC mon still shows *In your PC*.
- **PC → New mon:** optionally pick where it was caught, which Nuzlocke mode needs.

**Data**
- `npm run fetch:availability` already reads every encounter, but keeps only the earliest checkpoint per species. It should also write `data-src/encounters/<game>.json`: species → `[{ location, area?, method, minLevel, maxLevel, checkpoint }]`. Each file is loaded lazily on its own, like the availability files.
- Location names: PokéAPI slugs become readable names (`hoenn-route-119` → "Route 119") from the location's `names` field, which is already in the cache.
- An evolution's entry points to its pre-evolution's location ("Evolve Wooper, from Cliff Cave").
- **Romhacks:** Unbound's `locations.json` and Renegade Platinum's encounter tables already hold this. They'd need converting to the same shape.

**Open questions**
- Should encounter rates be shown too (PokéAPI has them)? Useful for rare mons, but noisy.
- How should time-of-day and season encounters (Gen 2/4, Deerling) be shown: a tag, or a filter?

---

## 2. Nuzlocke mode

**Goal:** track a Nuzlocke run, and keep advice to what the rules still allow you to catch.

**How it works**
- A Nuzlocke is a playthrough option, switched on per game in the playthrough bar, with these rules:
  - **First encounter only**, per location.
  - **Dupes clause:** skip species, or evolution families, already caught. Optional.
  - **Shiny clause:** a shiny never counts as the encounter. Optional.
  - **Gifts and statics count**, or don't. Optional.
  - **Hard level caps:** warn when a team member is over the checkpoint's cap.
- **Encounter log:** the game's locations in story order, each marked *caught (→ PC mon)*, *failed / fled*, or *not yet*. Logging a catch creates the PC mon with its met location.
- **Graveyard:** a PC mon can be marked **fainted**. It leaves its teams, stays in the PC under *Graveyard*, and is excluded from all advice. It can be revived if logged by mistake.
- **Advice:** suggested swaps and the counter advisor use:
  - alive PC mons,
  - species catchable at locations you've reached and haven't used,
  - minus dupes, when the clause is on.

  A suggestion reads "Route 6 is still open: Ponyta". When no open location has a fix, the advisor says so, instead of suggesting a catch you can't make.

**Data and state**
- Needs feature 1's encounter data: locations per checkpoint, and species per location.
- `StoredMon` gains `metLocation?` and `status?: 'alive' | 'fainted'`.
- A new persisted store `pokeplanner:nuzlocke` holds `{ game, rules, encounters: { [location]: { result, monId? } } }`, merged by `updatedAt` in backup and Gist sync, like the PC.

**Open questions**
- **Location grouping:** PokéAPI splits some places into areas (Mt. Moon 1F/B1F/B2F). Most rulesets count one encounter per named location, so group by location, with optional per-area tracking.
- Should the Nuzlocke encounter log be a tab of its own, or a section of the PC page?

---

## 3. Gauntlet check

**Goal:** run your team against a whole run of fights in a row and see who carries it, who's dead weight, and where you'd likely fall.

**Depends on:** the battle simulator (feature 0).

**Design**
- Pick a gauntlet, such as the Elite Four plus Champion, or the next three bosses, or build a custom list from the boss picker.
- **Simulate the fights back to back:** HP, PP, status and fainted Pokémon carry over from one fight to the next. Bag items can be used between fights, as in the real game, where you can heal between Elite Four rooms.
- **Reports:**
  - the chance of clearing the whole run,
  - the fight you'd most likely fall at,
  - which members carry it and which do little,
  - the fights where no one checks the ace.
- Nuzlocke-aware: fainted mons are excluded.

---

## 4. Encounter corrections

**Goal:** fix wrong availability yourself while you play, instead of waiting for a data refresh. PokéAPI has gaps, such as no Deino in Black 2/White 2.

**How it works**
- In the Dex's *Where to find* section, or on a "not obtainable yet" warning, an **"It's here"** button records a correction: the species becomes available from a chosen checkpoint, with an optional location.
- Corrections are stored per game (`pokeplanner:corrections`), merged over the generated data, synced and backed up, and listed on the Backup page so they can be exported. Pasting the list into a chat is how they reach the repo's data.

**Open questions**
- Should "it's not here" corrections be possible too, to remove a species? Probably, with the same mechanism.

---

## 5. Shareable team links

**Goal:** move one team to another device or person without Gist sync.

**How it works**
- *Share* on the Team page produces a URL with the team compressed into the hash: the ruleset, the six sets in Showdown export form, and the playthrough game. A QR code of the URL is shown for scanning with the Thor.
- Opening the link offers *Import as a new team*. PC links (`monId`) are dropped; a link carries sets, not PC mons.

**Open questions**
- Size: six full sets compress to roughly 400–600 characters, which is fine for QR. Check this against the Android app's deep-link handling.

---

## 6. Let's Go and Legends: Arceus

**Goal:** playthrough support for the two games the current model skips.

**Why they're separate**
- **Let's Go Pikachu/Eevee** has no abilities and no held items, uses AVs instead of EVs, has no wild battles (catches only), and has partner-only moves. It needs a ruleset with those fields hidden, and calc options to match.
- **Legends: Arceus** has no abilities and no held items in battle, uses agile and strong styles, and uses effort levels instead of EVs. Its battle rules differ enough that damage calcs would be approximate. The Unbound ruleset already loads its species and moves.

**Open question:** is there enough demand to justify this? It's lower priority than everything above.

---

## Backlog (small or offered earlier)

- **Unbound custom abilities:** show Unbound's own names (Drill Beak, Nine Lives, Icy Skin, Bellow, …), each calculating as its stand-in ability. Today the stand-in's name is shown.
- **Unbound tutor moves:** import the 146 tutor moves' compatibility from the DPE source. Some legal sets get flagged today.
- **Evolving the PC original:** when a planned team's evolved copy joins the PC, evolve the original instead of adding a second mon (the Wooper → Quagsire duplicate).
- **Missing story fights:** Penny and Team Star (Scarlet/Violet), Blue's early fights (Red/Blue), Hop's story fights (Sword/Shield) and Barry (Sinnoh). Bulbapedia lays these out differently.
- **Reverse Knock Off:** your Knock Off removes a boss's Eviolite or berry for the rest of the fight.
- **Android UX pass:** make the Thor's small bottom screen comfortable, with tap targets, a collapsed header and a one-column team view.
- **CI:** bump checkout, setup-node and setup-java to v5. Node 20 is deprecated on Actions.
- **Data refreshes:** check story-order guesses as you play (Galar's water bike timing, B2W2's Surf) and fix them in `scripts/lib/story-order.ts`.
