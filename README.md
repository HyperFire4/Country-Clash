# Country Clash (flat layout: every file in one folder)

| File | What it holds |
|---|---|
| index.html | Page markup only |
| base.css | Original game styles |
| theme.css | Command Center theme + mobile layout (most look-and-feel edits go here) |
| core.js | Storage, scoring, sound, number formatting |
| loader.js | Downloads country outlines (Natural Earth) and statistics (World Bank) |
| questions.js | Question generator |
| game.js | Game rules, modes, hints, shield, flags, timer, share card |
| globe-data.js / globe.js | Globe land data / globe renderer |
| pwa.js | Install-as-app prompt, starts the globe |
| ui.js | Navigation, profile, achievements, results screen, local leaderboard, settings |
| diag.js | Red error banner if the page's code fails |
| sw.js, manifest.webmanifest, icon-*.png, logo.svg, favicon.svg | Offline support, app install, logo |

## Publishing a change
1. Upload the changed file(s) to the repo root (same names replace the old ones).
2. Bump the version in two places: `const CACHE = 'country-clash-vN'` in sw.js and the `?v=N` on that file's tag in index.html.
3. Hard refresh the live site (Ctrl+Shift+R).
