# PokéBuild

PokéBuild is a competitive Pokémon toolkit built with plain HTML, CSS, and JavaScript. It runs entirely in the browser, uses PokéAPI for dynamic data, and stores saved teams locally with IndexedDB.

Live app:

https://danilobs777-afk.github.io/pokebuild/

## Features

- **Type Calc**: defensive and offensive type effectiveness for Pokémon, manual type pairs, forms, and Tera Type.
- **Team Analyzer**: offensive coverage, matchup view, defensive weaknesses, and defensive synergy for six-member teams.
- **Team Builder**: complete team editor with Pokémon, ability, item, nature, EVs/SPs, IVs, moves, Tera Type, forms, Mega Evolution support, Z-Crystals, Gigantamax export, and Smogon import/export.
- **My Teams**: local team gallery backed by IndexedDB, with search, detail view, export, edit, rename, and delete actions.
- **Damage Simulator**: local Smogon Calc-powered damage ranges, 16 rolls, exact generation selection, Singles/Doubles, field effects, hazards, Tera, Z-Moves, Max Moves, Dynamax, abilities, items, and end-of-turn chip/recovery.

## Tech Stack

- HTML, CSS, and JavaScript only
- 100% client-side
- PokéAPI for Pokémon and move data
- IndexedDB for local team storage
- Local vendored `@smogon/calc` bundle for the Damage Simulator
- GitHub Pages for static hosting

## Running Locally

From the project root:

```bash
python -m http.server 4174
```

Then open:

```text
http://127.0.0.1:4174/
```

Smoke tests are available only on local hosts:

```text
http://127.0.0.1:4174/?smoke
```

The smoke runner covers the main app flow, including generation rules, Builder import, Damage Simulator, Analyzer to Builder, My Teams export/copy, and a small mobile overflow check.

## Project Structure

- `index.html`: app markup, script loading, PWA registration, and local smoke gate.
- `css/style.css`: layout, components, theme, and responsiveness.
- `js/data.js`: local domain tables, Smogon parsing/export helpers, and static Pokémon data.
- `js/generation.js`: shared generation rules, game/version mapping, and feature gates.
- `js/ui.js`: shared UI helpers, autocomplete behavior, escaping, toasts, and confirm modals.
- `js/api.js`: PokéAPI access and in-memory caches.
- `js/storage.js`: IndexedDB persistence.
- `js/typeCalc.js`: Type Calc.
- `js/analyzer.js`: Team Analyzer.
- `js/builder.js`: Team Builder.
- `js/teams.js`: My Teams.
- `js/smogonCalcAdapter.js`: adapter between the UI state and the local Smogon Calc bundle.
- `js/dmgCalc.js`: Damage Simulator.
- `tests/smoke.js`: browser smoke tests.
- `vendor/smogon-calc/`: local third-party damage calculation bundle.

## Maintenance Notes

- Use `GenerationRules` for generation-dependent behavior instead of duplicating `gen >= ...` checks.
- Use `PokeBuildUI.bindAutocomplete()` for new autocomplete fields.
- Escape user-controlled text with `PokeBuildUI.escapeHtml()` before inserting it with `innerHTML`.
- Keep `CACHE_VERSION` in `sw.js` moving when cached assets change.
- The app has no backend and must not contain private tokens, secrets, or credentials.

## License

The original source code in this repository is released under the MIT License. See [LICENSE](LICENSE).

The MIT License covers this project's original code only. It does not grant rights to third-party trademarks, character names, artwork, sprites, data, or intellectual property related to Pokémon or any other external property.

## Affiliate Links

PokéBuild may include Amazon affiliate links for gaming-related products. As an Amazon Associate, I earn from qualifying purchases.

## Disclaimer

PokéBuild is an unofficial fan-made tool and is not affiliated with, endorsed, sponsored, or approved by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.

See [DISCLAIMER.md](DISCLAIMER.md) for details.
