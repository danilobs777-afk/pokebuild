# Local Smogon Calc bundle

This folder vendors `@smogon/calc` 0.11.0 as browser bundles so PokéBuild can run the Damage Simulator fully client-side.

- Source package: `@smogon/calc`
- Version: `0.11.0`
- License: MIT, as declared in `package.json`
- Runtime network: none. The app loads these files from the local project only.

The existing internal calculator remains as a fallback when the local engine cannot resolve a species, move, or unsupported edge case.

Note: `production.min.js` has one browser-compatibility patch: the generated `require("./desc")` reference is replaced with the bundle's local export object, because the package's own bundle script places `desc` in the same browser bundle.
