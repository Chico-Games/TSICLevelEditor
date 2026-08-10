/**
 * RLE compression actually compresses
 *
 * Fixes to the previous version:
 *  - it read `entry.count` / `entry.color` off runs that are `[paletteIndex, count]`
 *    arrays, so its totals were NaN and its colour assertions read undefined;
 *  - it asserted a 512x512 grid (the default is 256x256);
 *  - it drove the UI through `#btn-load-test-map` and
 *    `.color-category:has-text("Biomes")`, neither of which exists any more.
 */

const { test, expect, initializeEditor, generateTestMap, selectColor, clickLayer } = require('./test-base');

const GRID_TILES = 256 * 256;

/** Sum the tile counts of `[paletteIndex, count]` runs. */
function totalTiles(colorData) {
    return colorData.reduce((sum, [, count]) => sum + count, 0);
}

test.describe('RLE compression size', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('a single-colour layer compresses to one run', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');

        const floorLayer = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();

            // Repaint every tile with one colour (what a bucket fill does).
            const tiles = [];
            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) tiles.push({ x, y });
            }
            editor.setTiles(tiles);

            const exported = editor.layerManager.exportRLEData('Test', 'Test', 123);
            return exported.layers.find(l => l.layer_type === 'Floor');
        });

        expect(floorLayer).toBeDefined();
        expect(floorLayer.color_data.length).toBe(1);
        expect(floorLayer.palette).toEqual(['#4ecdc4']);
        expect(totalTiles(floorLayer.color_data)).toBe(GRID_TILES);
    });

    test('an untouched world exports one run per layer', async ({ page }) => {
        const layers = await page.evaluate(() =>
            window.editor.layerManager.exportRLEData('Empty', 'Test', 123).layers
        );

        expect(layers.length).toBe(8);
        for (const layer of layers) {
            expect(layer.color_data.length, `${layer.layer_type} runs`).toBe(1);
            expect(layer.color_data[0][0], `${layer.layer_type} palette index`).toBe(0);
            expect(layer.color_data[0][1], `${layer.layer_type} run length`).toBe(GRID_TILES);
        }
    });

    test('a generated map exports at a reasonable size', async ({ page }) => {
        await generateTestMap(page);

        const result = await page.evaluate(() => {
            const rleData = window.editor.layerManager.exportRLEData('TestMap', 'Test', 123);
            return {
                sizePrettyBytes: JSON.stringify(rleData, null, 2).length,
                layerCount: rleData.layers.length,
                layerStats: rleData.layers.map(layer => ({
                    type: layer.layer_type,
                    runs: layer.color_data.length,
                    totalTiles: layer.color_data.reduce((s, [, c]) => s + c, 0)
                }))
            };
        });

        expect(result.layerCount).toBe(8);
        for (const stat of result.layerStats) {
            expect(stat.totalTiles, `${stat.type} tiles`).toBe(GRID_TILES);
            // Compression must actually be happening: one run per tile would be 65536.
            expect(stat.runs, `${stat.type} runs`).toBeLessThan(GRID_TILES / 4);
        }

        expect(result.sizePrettyBytes).toBeLessThan(1.5 * 1024 * 1024);
    });

    test('RLE is dramatically smaller than the legacy per-tile format', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');

        const sizes = await page.evaluate(() => {
            const editor = window.editor;
            const tiles = [];
            for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) tiles.push({ x, y });
            }
            editor.setTiles(tiles);

            return {
                legacySize: JSON.stringify(editor.layerManager.exportData()).length,
                rleSize: JSON.stringify(editor.layerManager.exportRLEData('Test', 'Test', 123)).length
            };
        });

        // exportData() writes one object per tile across all 8 layers; RLE writes runs.
        expect(sizes.rleSize).toBeLessThan(sizes.legacySize * 0.1);
    });
});
