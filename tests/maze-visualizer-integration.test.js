/**
 * Maze visualizer panel
 *
 * The panel is driven by a segmented control (`#maze-layer-control .segment[data-layer]`)
 * that picks ONE layer to analyse; the old `#btn-toggle-maze-visualizer` toggle and
 * `#maze-layer-checkboxes` multi-select no longer exist, so those tests timed out.
 *
 * Three of the surviving tests could not fail even when they ran:
 *  - "tile inspector shows maze data on right-click" wrapped everything in
 *    `if (isVisible)` and its only assertion was `expect(typeof x).toBe('boolean')`;
 *  - "can regenerate with different settings" asserted `regionCount >= 0` on an array
 *    length;
 *  - "visualizer persists region data" asserted `regionCount >= 0`, `tilesInRegions >= 0`,
 *    and that a maze byte was between 0 and 15 — where the value it sampled defaults to
 *    0 when the maze is entirely empty.
 */

const { test, expect, initializeEditor, generateTestMap } = require('./test-base');

const FLOOR_LAYER_INDEX = 4;

async function selectMazeLayer(page, layer = 'floor') {
    await page.click(`#maze-layer-control .segment[data-layer="${layer}"]`);
    await page.waitForFunction((idx) =>
        window.editor.mazeVisualizer.floodFillResults.has(idx), FLOOR_LAYER_INDEX, { timeout: 15000 });
}

test.describe('Maze visualizer', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await page.waitForFunction(() => window.editor.mazeVisualizer);
        // A uniform default-filled Floor gives one giant region; a generated map gives
        // several, which is what makes the region assertions meaningful.
        await generateTestMap(page);
    });

    test('the panel starts collapsed with no layer selected', async ({ page }) => {
        const state = await page.evaluate(() => ({
            enabled: window.editor.mazeVisualizer.enabled,
            contentVisible: !!document.getElementById('maze-visualizer-content')?.offsetParent,
            activeSegments: Array.from(document.querySelectorAll('#maze-layer-control .segment.active')).length,
            segments: Array.from(document.querySelectorAll('#maze-layer-control .segment')).map(s => s.dataset.layer)
        }));

        expect(state.enabled).toBe(false);
        expect(state.contentVisible).toBe(false);
        expect(state.activeSegments).toBe(0);
        expect(state.segments).toEqual(['floor', 'underground', 'sky']);
    });

    test('selecting a layer enables the visualizer and produces regions', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        const state = await page.evaluate((idx) => {
            const viz = window.editor.mazeVisualizer;
            const results = viz.floodFillResults.get(idx);
            return {
                enabled: viz.enabled,
                selectedLayer: viz.selectedLayer,
                contentVisible: !!document.getElementById('maze-visualizer-content')?.offsetParent,
                statsVisible: !!document.getElementById('maze-stats')?.offsetParent,
                activeSegment: document.querySelector('#maze-layer-control .segment.active')?.dataset.layer,
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                borderTiles: results.borderTiles,
                gridTiles: window.editor.layerManager.width * window.editor.layerManager.height
            };
        }, FLOOR_LAYER_INDEX);

        expect(state.enabled).toBe(true);
        expect(state.selectedLayer).toBe(FLOOR_LAYER_INDEX);
        expect(state.contentVisible).toBe(true);
        expect(state.statsVisible).toBe(true);
        expect(state.activeSegment).toBe('floor');

        // Real invariants, not `>= 0`: at least one region, and every tile accounted for.
        expect(state.regionCount).toBeGreaterThan(0);
        expect(state.tilesInRegions + state.borderTiles).toBe(state.gridTiles);
    });

    test('the generated maze is a spanning tree of each region', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        const analysis = await page.evaluate((idx) => {
            const viz = window.editor.mazeVisualizer;
            const results = viz.floodFillResults.get(idx);
            const mazeData = viz.mazeData.get(idx);
            const width = window.editor.layerManager.width;
            const height = window.editor.layerManager.height;

            const neighbour = (index, dir) => {
                const x = index % width, y = Math.floor(index / width);
                let nx = x, ny = y;
                if (dir === 0) ny += 1; else if (dir === 1) ny -= 1;
                else if (dir === 2) nx += 1; else nx -= 1;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) return null;
                return ny * width + nx;
            };

            let checked = 0, badEdges = 0, nonTree = 0, connectedRegions = 0;

            // Sample the larger regions; the whole 65k grid is too slow to walk here.
            const sample = results.regions
                .filter(r => r.regionSize > 1)
                .sort((a, b) => b.regionSize - a.regionSize)
                .slice(0, 5);

            for (const region of sample) {
                checked++;
                const inRegion = new Set(region.tileIndices);
                let edges = 0;

                for (const index of region.tileIndices) {
                    const bits = mazeData[index];
                    for (let dir = 0; dir < 4; dir++) {
                        if (!(bits & (1 << dir))) continue;
                        const n = neighbour(index, dir);
                        if (n === null || !inRegion.has(n)) badEdges++;
                        if (dir === 0 || dir === 2) edges++; // count each edge once
                    }
                }
                if (edges !== region.regionSize - 1) nonTree++;

                // BFS for connectivity.
                const visited = new Set([region.tileIndices[0]]);
                const queue = [region.tileIndices[0]];
                while (queue.length) {
                    const index = queue.shift();
                    const bits = mazeData[index];
                    for (let dir = 0; dir < 4; dir++) {
                        if (!(bits & (1 << dir))) continue;
                        const n = neighbour(index, dir);
                        if (n === null || !inRegion.has(n) || visited.has(n)) continue;
                        visited.add(n);
                        queue.push(n);
                    }
                }
                if (visited.size === region.regionSize) connectedRegions++;
            }

            return { checked, badEdges, nonTree, connectedRegions };
        }, FLOOR_LAYER_INDEX);

        expect(analysis.checked).toBeGreaterThan(0);
        expect(analysis.badEdges, 'maze connections leaving their region').toBe(0);
        expect(analysis.nonTree, 'regions whose maze is not a spanning tree').toBe(0);
        expect(analysis.connectedRegions).toBe(analysis.checked);
    });

    test('every visualization mode can be selected and rendered', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        // The dropdown offers four modes; there is no longer an "off" option — the
        // visualizer is switched off by deselecting the layer instead.
        const options = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#maze-viz-mode option')).map(o => o.value));
        expect(options).toEqual(['regions', 'arrows', 'walls', 'connections']);

        for (const mode of options) {
            await page.selectOption('#maze-viz-mode', mode);
            await page.waitForTimeout(150);
            await page.evaluate(() => window.editor.render());
            await page.waitForTimeout(100);

            expect(await page.evaluate(() => window.editor.mazeVisualizer.visualizationMode),
                `mode ${mode}`).toBe(mode);
        }
        // Rendering errors surface as console errors, which test-base turns into failures.
    });

    test('changing the seed produces a different maze for the same regions', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        const first = await page.evaluate((idx) => ({
            seed: window.editor.mazeVisualizer.settings.seed,
            maze: Array.from(window.editor.mazeVisualizer.mazeData.get(idx)).slice(0, 4000),
            regions: window.editor.mazeVisualizer.floodFillResults.get(idx).regions.length
        }), FLOOR_LAYER_INDEX);

        await page.fill('#maze-seed', '99999');
        await page.click('#btn-regenerate-maze');
        await page.waitForTimeout(1500);

        const second = await page.evaluate((idx) => ({
            seed: window.editor.mazeVisualizer.settings.seed,
            maze: Array.from(window.editor.mazeVisualizer.mazeData.get(idx)).slice(0, 4000),
            regions: window.editor.mazeVisualizer.floodFillResults.get(idx).regions.length
        }), FLOOR_LAYER_INDEX);

        expect(second.seed).toBe(99999);
        // Same tiles, so the regions are unchanged...
        expect(second.regions).toBe(first.regions);
        // ...but the corridors through them must differ.
        expect(second.maze).not.toEqual(first.maze);
    });

    test('regenerating with the same seed is deterministic', async ({ page }) => {
        await selectMazeLayer(page, 'floor');
        await page.fill('#maze-seed', '4242');
        await page.click('#btn-regenerate-maze');
        await page.waitForTimeout(1500);

        const first = await page.evaluate((idx) =>
            Array.from(window.editor.mazeVisualizer.mazeData.get(idx)).slice(0, 4000), FLOOR_LAYER_INDEX);

        await page.click('#btn-regenerate-maze');
        await page.waitForTimeout(1500);

        const second = await page.evaluate((idx) =>
            Array.from(window.editor.mazeVisualizer.mazeData.get(idx)).slice(0, 4000), FLOOR_LAYER_INDEX);

        expect(second).toEqual(first);
    });

    test('switching the analysed layer re-runs the analysis for that layer', async ({ page }) => {
        await selectMazeLayer(page, 'floor');
        const floorRegions = await page.evaluate((idx) =>
            window.editor.mazeVisualizer.floodFillResults.get(idx).regions.length, FLOOR_LAYER_INDEX);

        await page.click('#maze-layer-control .segment[data-layer="sky"]');
        await page.waitForFunction(() => window.editor.mazeVisualizer.selectedLayer !== 4, null, { timeout: 15000 });
        await page.waitForTimeout(500);

        const state = await page.evaluate(() => {
            const viz = window.editor.mazeVisualizer;
            const idx = viz.selectedLayer;
            return {
                selectedLayer: idx,
                layerName: window.editor.layerManager.layers[idx].layerType,
                hasResults: viz.floodFillResults.has(idx),
                hasMaze: viz.mazeData.has(idx),
                activeSegment: document.querySelector('#maze-layer-control .segment.active')?.dataset.layer
            };
        });

        expect(state.layerName).toBe('Sky');
        expect(state.hasResults).toBe(true);
        expect(state.hasMaze).toBe(true);
        expect(state.activeSegment).toBe('sky');
        expect(floorRegions).toBeGreaterThan(0);
    });

    test('the statistics panel reports the region counts it computed', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        const state = await page.evaluate((idx) => {
            const results = window.editor.mazeVisualizer.floodFillResults.get(idx);
            return {
                text: document.getElementById('maze-stats-content').textContent,
                regionCount: results.regions.length,
                largest: results.largestRegionSize
            };
        }, FLOOR_LAYER_INDEX);

        expect(state.text.length).toBeGreaterThan(0);
        // The numbers on screen must be the numbers in the model.
        expect(state.text).toContain(String(state.regionCount));
        expect(state.text).toContain(String(state.largest));
    });

    test('the settings section collapses and expands', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        const isExpanded = () => page.evaluate(() =>
            !document.getElementById('maze-settings-header').parentElement.classList.contains('collapsed'));

        expect(await isExpanded()).toBe(true);

        await page.click('#maze-settings-header');
        await page.waitForTimeout(150);
        expect(await isExpanded()).toBe(false);

        await page.click('#maze-settings-header');
        await page.waitForTimeout(150);
        expect(await isExpanded()).toBe(true);
    });

    test('exporting maze data downloads a file describing the current maze', async ({ page }) => {
        await selectMazeLayer(page, 'floor');

        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await page.click('#btn-export-maze-data');
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/maze-data.*\.json/);

        const path = await download.path();
        expect(path).toBeTruthy();

        const fs = require('fs');
        const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));

        // The old test only checked that a file arrived. Check it has content.
        expect(parsed).toBeTruthy();
        expect(JSON.stringify(parsed).length).toBeGreaterThan(100);
    });
});
