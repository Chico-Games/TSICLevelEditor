# Test Suite for TSIC Level Editor

Playwright end-to-end tests for the TSIC Level Editor.

## Quick Start

```bash
npm install
npm run install-browsers
npm test
```

| Script | What it does |
| --- | --- |
| `npm test` | Run the whole suite (4 workers, artifacts kept only for failures) |
| `npm run test:ui` | Playwright UI mode |
| `npm run test:headed` | Run with a visible browser |
| `npm run test:debug` | Headed, single worker — for stepping through one test |
| `npm run test:report` | Run and open the HTML report |

Run one file or one test:

```bash
npx playwright test tests/undo-redo.test.js
npx playwright test -g "undo restores the previous colour"
```

## The test server

`playwright.config.js` starts `http-server` on **127.0.0.1:8931** and points `baseURL`
at it. The port is deliberately unusual: the Unreal Editor binds its own HTTP server to
`127.0.0.1:8000`, and because `reuseExistingServer` is on, a suite configured for port
8000 silently ran every test against Unreal's 404 page instead of the app. Tests
navigate with `page.goto('/index.html?map=none')` so they follow `baseURL`; do not
hardcode a host. Override the port with `LEVEL_EDITOR_TEST_PORT` if 8931 is taken.

`?map=none` matters: without it the app opens the default mod's map
(`vendor/default-project/maps/Durham Furniture.json`) on startup, and every assertion
below about a blank document is wrong. Keep it on every `goto` unless a test is
specifically exercising the default-map path.

## Writing tests: things that will mislead you

Import from `./test-base`, not `@playwright/test` — the wrapper fails a test if the page
logs a console error or throws, which is how several rendering bugs surface.

**Layers are never empty.** With no project loaded the app fills every layer with that
layer's default colour, so before a test does anything:

- `layer.tileData.size === 65536` (the grid is **256×256**, not 512×512)
- `layerManager.getTotalTileCount() === 524288` (8 layers)

So `expect(tileData.size).toBeGreaterThan(0)` proves nothing, and
`expect(getTotalTileCount()).toBe(25)` can never hold. Compare against a snapshot
(`snapshotActiveLayer` / `countChangedTiles`) or count distinct colours instead.

**The eraser repaints the layer default; it does not delete tiles.** Tile counts never
shrink when you erase.

**There are 8 layers**: Height, Difficulty, Hazard, Sky, Floor, Underground,
SkyHeightOffset, UndergroundHeightOffset.

**`#btn-new` / Ctrl+N opens the New Project prompt** — it does not clear the canvas.
There is no "clear the level" shortcut.

**The palette is tab-based.** `.color-category` / `.color-category-header` no longer
exist; the markup is `.palette-tab` + `.palette-tab-content` containing
`.color-subcategory` blocks. The tab and sub-categories on show follow the active layer,
so a swatch for another layer's category is present in the DOM but hidden. Select
colours with `selectColor(page, 'Biome_Warehouse')` rather than clicking `.color-item`.

**Maze direction bits** are `North = index + worldWidth` (bottom-left origin), South =
`- worldWidth`, East = `+ 1`, West = `- 1`. See `DIRECTION_ENCODING_REFERENCE.md`.

**`rle-base64-v1` holds at most 8 palette colours** (3 bits of the tag byte). Layers with
more fall back to the array RLE form; see `base64-palette-limit.test.js`.

## Helpers in `test-base.js`

| Helper | Purpose |
| --- | --- |
| `initializeEditor(page)` | Navigate and wait until the default fill has completed |
| `clickLayer(page, name)` | Select a layer via the layers panel (throws if absent) |
| `selectColor(page, name)` | Select a tileset by config key |
| `getSelectedColor(page)` | `{ name, color, category }` of the current selection |
| `getVisibleColorSubcategories(page)` | Sub-category headers on show in the active tab |
| `getVisibleColorNames(page)` | Selectable swatch names in the active tab |
| `snapshotActiveLayer(page)` | Plain-object copy of the active layer's tiles |
| `countChangedTiles(page, snap)` | Tiles differing from a snapshot |
| `generateTestMap(page)` | Run the Perlin generator and wait for real terrain |

## Manual profiling pages

`test-direct-performance.html` and `test-complex-level-performance.html` in the repo root
are standalone scratch pages. They are **not** part of the suite (they build their own
editor and have drifted out of sync with the app). Automated performance coverage lives
in `tests/performance.test.js`, which measures the real app with in-page
`performance.now()` brackets.
