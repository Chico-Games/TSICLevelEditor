/**
 * Export format contract
 *
 * The exported file gives Unreal a per-layer `palette` of colours plus RLE runs of
 * [paletteIndex, count], and a separate `color_mappings` table that turns a colour
 * into the enum value the runtime wants. The thing that can actually break is the
 * join between them: an index that isn't in the palette, or a palette colour that
 * isn't in color_mappings, means the loader silently resolves the wrong tile.
 *
 * This file used to "check" that by printing a table and asserting nothing at all —
 * both of its tests had zero expect() calls, so no export defect could ever fail it.
 */

const { test, expect, initializeEditor, generateTestMap } = require('./test-base');

test.describe('Export format for Unreal', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await generateTestMap(page);
    });

    test('every RLE run resolves through the palette to a defined colour mapping', async ({ page }) => {
        const report = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEData('TestMap', 'Format check', 12345);

            // layer_type -> which color_mappings table its palette must resolve against
            const categoryForLayer = {
                Height: 'heights',
                Difficulty: 'difficulty',
                Hazard: 'hazards',
                Sky: 'biomes',
                Floor: 'biomes',
                Underground: 'biomes',
                SkyHeightOffset: 'heights',
                UndergroundHeightOffset: 'heights'
            };

            const problems = [];
            const summary = [];

            for (const layer of exported.layers) {
                const category = categoryForLayer[layer.layer_type];
                const table = category ? exported.color_mappings[category] : null;

                if (!table) {
                    problems.push({
                        layer: layer.layer_type,
                        kind: 'no color_mappings category',
                        detail: category
                    });
                    continue;
                }

                const resolvedValues = new Set();

                for (let i = 0; i < layer.color_data.length; i++) {
                    const run = layer.color_data[i];
                    const [paletteIndex, count] = run;

                    if (paletteIndex < 0 || paletteIndex >= layer.palette.length) {
                        problems.push({
                            layer: layer.layer_type, kind: 'index out of palette range',
                            detail: `run ${i}: index ${paletteIndex}, palette size ${layer.palette.length}`
                        });
                        continue;
                    }
                    if (!Number.isInteger(count) || count <= 0) {
                        problems.push({
                            layer: layer.layer_type, kind: 'non-positive run count',
                            detail: `run ${i}: count ${count}`
                        });
                    }

                    const color = layer.palette[paletteIndex].toLowerCase();
                    const entry = table[color];
                    if (!entry) {
                        problems.push({
                            layer: layer.layer_type, kind: 'palette colour missing from color_mappings',
                            detail: `${color} not in color_mappings.${category}`
                        });
                        continue;
                    }
                    resolvedValues.add(entry.value);
                }

                summary.push({
                    layer: layer.layer_type,
                    category,
                    paletteSize: layer.palette.length,
                    runs: layer.color_data.length,
                    resolvedValues: Array.from(resolvedValues).sort((a, b) => a - b)
                });
            }

            return { problems, summary };
        });

        expect(report.problems, JSON.stringify(report.problems, null, 2)).toEqual([]);
        // Every layer must actually have been checked.
        expect(report.summary.length).toBe(8);
    });

    test('resolved values stay inside the range each layer type allows', async ({ page }) => {
        const outOfRange = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEData('TestMap', 'Range check', 12345);

            // Ranges come from the Unreal enums mirrored in config.js dataTypes.
            const limits = {
                Height: { category: 'heights', max: 9 },
                Difficulty: { category: 'difficulty', max: 4 },
                Hazard: { category: 'hazards', max: 2 },
                SkyHeightOffset: { category: 'heights', max: 9 },
                UndergroundHeightOffset: { category: 'heights', max: 9 }
            };

            const bad = [];
            for (const layer of exported.layers) {
                const limit = limits[layer.layer_type];
                if (!limit) continue; // biome layers validate by palette membership, not range

                const table = exported.color_mappings[limit.category];
                for (const color of layer.palette) {
                    const entry = table[color.toLowerCase()];
                    if (!entry) continue; // reported by the previous test
                    if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value > limit.max) {
                        bad.push({
                            layer: layer.layer_type, color,
                            value: entry.value, max: limit.max
                        });
                    }
                }
            }
            return bad;
        });

        expect(outOfRange, JSON.stringify(outOfRange, null, 2)).toEqual([]);
    });

    test('the first stroke on a freshly loaded document exports valid data', async ({ page }) => {
        // Regression: startup selected the first tileset in the config (a Difficulty
        // colour) while the active layer was Height, so the user's first stroke wrote
        // #90ee90 into the Height layer and the export failed validation with
        // 'palette colour "#90ee90" is not defined in color_mappings.heights'.
        await page.goto('/index.html?map=none');
        await page.waitForFunction(() => window.editor && window.editor.layerManager);
        await page.waitForFunction(() => {
            const lm = window.editor.layerManager;
            return lm.layers.length > 0 && lm.layers.every(l => l.tileData.size === l.width * l.height);
        });

        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();

            editor.setTiles([{ x: 3, y: 3 }]);

            const exported = editor.layerManager.exportRLEData('T', 'T', 1);
            const validation = window.rleValidator.validate(exported);

            return {
                activeLayer: layer.layerType,
                selectedCategory: editor.selectedTileset.category,
                errors: validation.errors,
                valid: validation.valid
            };
        });

        // The selected colour must belong to the active layer's own category.
        expect(result.activeLayer).toBe('Height');
        expect(result.selectedCategory).toBe('Height');
        expect(result.errors, result.errors.join('\n')).toEqual([]);
        expect(result.valid).toBe(true);
    });

    test('the exported file passes the project rle-validator', async ({ page }) => {
        const result = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEData('TestMap', 'Validator check', 12345);
            const validation = window.rleValidator.validate(exported);
            return {
                valid: validation.valid,
                errors: validation.errors,
                warnings: validation.warnings
            };
        });

        expect(result.errors, result.errors.join('\n')).toEqual([]);
        expect(result.valid).toBe(true);
    });
});
