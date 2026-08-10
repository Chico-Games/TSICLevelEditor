/**
 * Performance of the real editor, measured in-page
 *
 * The previous performance suite measured almost nothing:
 *
 *  - performance.test.js loaded the app over `file://`, where configManager's fetch of
 *    config/biomes.json is blocked, so `window.editor` was null and every test threw.
 *  - Its "render performance" numbers were the wall-clock around
 *    `page.keyboard.press()` + `waitForTimeout(50)`, i.e. it timed its own sleeps and
 *    then asserted the total was under 100ms.
 *  - "measure tile rendering count" had no assertions at all and reported a hardcoded
 *    constant as the tile total.
 *  - direct-performance.test.js and automated-performance.test.js drove two standalone
 *    HTML harness pages that no longer run (they throw on DOM the app expects), so both
 *    simply timed out. Those files have been removed; the HTML pages are still in the
 *    repo for manual profiling.
 *
 * Everything here brackets the work with performance.now() INSIDE the page, so the
 * number is the operation rather than Playwright round-trip latency, and each test
 * asserts the work actually happened.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

const GRID = 256;
const GRID_TILES = GRID * GRID;

/** Fill every layer with a solid colour so measurements run against a full world. */
async function fillAllLayers(page) {
    return await page.evaluate(() => {
        const colors = ['#0a0a0a', '#ffd700', '#39ff14', '#87ceeb',
                        '#ff6b6b', '#8b4513', '#0a0a0a', '#0a0a0a'];
        const started = performance.now();
        window.editor.layerManager.layers.forEach((layer, i) => {
            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) {
                    layer.tileData.set(`${x},${y}`, colors[i % colors.length]);
                }
            }
            layer.cacheDirty = true;
        });
        return performance.now() - started;
    });
}

test.describe('Editor performance', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('a full render of a completely filled world stays interactive', async ({ page }) => {
        await fillAllLayers(page);

        const result = await page.evaluate(() => {
            const editor = window.editor;
            editor.layerManager.layers.forEach(l => { l.visible = true; l.cacheDirty = true; });

            // First render rebuilds every layer cache; later ones should reuse it.
            const coldStart = performance.now();
            editor.render();
            const cold = performance.now() - coldStart;

            const warmTimes = [];
            for (let i = 0; i < 10; i++) {
                const t = performance.now();
                editor.render();
                warmTimes.push(performance.now() - t);
            }
            warmTimes.sort((a, b) => a - b);

            return {
                cold,
                medianWarm: warmTimes[Math.floor(warmTimes.length / 2)],
                tiles: editor.layerManager.getTotalTileCount()
            };
        });

        // The measurement is only meaningful if the world really is full.
        expect(result.tiles).toBe(GRID_TILES * 8);
        expect(result.cold, `cold render ${result.cold.toFixed(1)}ms`).toBeLessThan(2000);
        // Cached re-renders must be fast enough to keep the canvas responsive.
        expect(result.medianWarm, `warm render ${result.medianWarm.toFixed(1)}ms`).toBeLessThan(100);
    });

    test('a bucket fill of the whole layer completes promptly', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');

        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();
            const tiles = [];
            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) tiles.push({ x, y });
            }

            const started = performance.now();
            editor.setTiles(tiles);
            const elapsed = performance.now() - started;

            const colors = new Set(layer.tileData.values());
            return { elapsed, distinctColors: colors.size, tiles: layer.tileData.size };
        });

        expect(result.tiles).toBe(GRID_TILES);
        expect(result.distinctColors).toBe(1); // the fill really covered everything
        expect(result.elapsed, `fill ${result.elapsed.toFixed(1)}ms`).toBeLessThan(2000);
    });

    test('drawing a stroke with a large brush stays responsive', async ({ page }) => {
        await fillAllLayers(page);
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');
        await page.locator('#brush-size').fill('20');

        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();
            const before = new Map(layer.tileData);

            const perStep = [];
            for (let x = 40; x < 200; x += 10) {
                const t = performance.now();
                editor.setTiles(editor.getBrushTiles(x, 100));
                perStep.push(performance.now() - t);
            }

            let changed = 0;
            for (const [key, color] of layer.tileData) {
                if (before.get(key) !== color) changed++;
            }

            perStep.sort((a, b) => a - b);
            return {
                changed,
                steps: perStep.length,
                median: perStep[Math.floor(perStep.length / 2)],
                worst: perStep[perStep.length - 1]
            };
        });

        expect(result.steps).toBe(16);
        expect(result.changed).toBeGreaterThan(0); // the stroke actually painted
        expect(result.median, `median step ${result.median.toFixed(2)}ms`).toBeLessThan(50);
        expect(result.worst, `worst step ${result.worst.toFixed(2)}ms`).toBeLessThan(200);
    });

    test('zooming a filled world is fast', async ({ page }) => {
        await fillAllLayers(page);

        const result = await page.evaluate(() => {
            const editor = window.editor;
            editor.render();

            const times = [];
            for (let i = 0; i < 5; i++) {
                const t = performance.now();
                editor.setZoom(editor.zoom * 1.25, 400, 300);
                editor.render();
                times.push(performance.now() - t);
            }
            times.sort((a, b) => a - b);
            return { median: times[Math.floor(times.length / 2)], finalZoom: editor.zoom };
        });

        expect(result.finalZoom).toBeGreaterThan(1);
        expect(result.median, `zoom step ${result.median.toFixed(1)}ms`).toBeLessThan(300);
    });

    test('exporting a filled world is fast enough to feel instant', async ({ page }) => {
        await fillAllLayers(page);

        const result = await page.evaluate(() => {
            const manager = window.editor.layerManager;

            const t1 = performance.now();
            const arrayForm = manager.exportRLEData('Perf', 'Perf', 1);
            const arrayMs = performance.now() - t1;

            const t2 = performance.now();
            const base64Form = manager.exportRLEDataBase64('Perf', 'Perf', 1);
            const base64Ms = performance.now() - t2;

            return {
                arrayMs,
                base64Ms,
                layers: arrayForm.layers.length,
                totalRuns: arrayForm.layers.reduce((s, l) => s + l.color_data.length, 0),
                base64Layers: base64Form.layers.length
            };
        });

        // A solid fill compresses to one run per layer — proof the export really ran.
        expect(result.layers).toBe(8);
        expect(result.base64Layers).toBe(8);
        expect(result.totalRuns).toBe(8);
        expect(result.arrayMs, `array export ${result.arrayMs.toFixed(1)}ms`).toBeLessThan(3000);
        expect(result.base64Ms, `base64 export ${result.base64Ms.toFixed(1)}ms`).toBeLessThan(3000);
    });

    test('the first click after loading a filled world is not blocked', async ({ page }) => {
        // The metric the old suite cared about most (its "initial click delay"), taken
        // from the real app instead of a standalone harness page.
        await fillAllLayers(page);
        await page.evaluate(() => window.editor.render());

        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');
        await page.click('[data-tool="pencil"]');

        const canvas = page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        await page.evaluate(() => {
            window.__clickLatency = null;
            const canvas = document.getElementById('grid-canvas');
            canvas.addEventListener('mousedown', () => {
                const t = performance.now();
                requestAnimationFrame(() => { window.__clickLatency = performance.now() - t; });
            }, { once: true });
        });

        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForFunction(() => window.__clickLatency !== null, null, { timeout: 10000 });

        const latency = await page.evaluate(() => window.__clickLatency);
        expect(latency, `click-to-frame ${latency.toFixed(1)}ms`).toBeLessThan(500);
    });
});
