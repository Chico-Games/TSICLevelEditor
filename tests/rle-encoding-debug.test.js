/**
 * Base64 RLE must agree with the array RLE it was encoded from.
 *
 * The old version of this file built a run-by-run comparison, printed a "first
 * mismatch" report to the console... and then only asserted that the decoded tile
 * count equalled the grid size. Tile counts are preserved even when colour indices
 * are wrong, so the one defect this test existed to catch (see
 * base64-palette-limit.test.js) sailed straight through it.
 */

const { test, expect, initializeEditor, generateTestMap } = require('./test-base');

test.describe('Array RLE vs base64 RLE', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('base64 decodes to exactly the runs the array export contains', async ({ page }) => {
        const comparison = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.clear();

            // A deterministic pattern with <= 8 colours, so the layer really does take
            // the base64 path rather than the large-palette array fallback.
            const colors = ['#0a0a0a', '#1a1a2e', '#525d6b', '#778994'];
            for (let i = 0; i < 400; i++) {
                const x = i % 20;
                const y = Math.floor(i / 20);
                layer.setTile(x, y, 1, { color: colors[(x + y) % colors.length] });
            }

            const arrayForm = layer.exportRLEData();
            const base64Form = layer.exportRLEDataBase64();

            return {
                encoding: base64Form.encoding,
                arrayPalette: arrayForm.palette,
                base64Palette: base64Form.palette,
                arrayRuns: arrayForm.color_data,
                decodedRuns: window.base64RLEEncoder.decodeFromBase64(base64Form.data_b64),
                gridSize: layer.width * layer.height
            };
        });

        expect(comparison.encoding).toBe('rle-base64-v1');
        expect(comparison.base64Palette).toEqual(comparison.arrayPalette);

        // The real assertion: identical runs, in order, not merely the same total.
        expect(comparison.decodedRuns).toEqual(comparison.arrayRuns);

        const decodedTiles = comparison.decodedRuns.reduce((sum, [, count]) => sum + count, 0);
        expect(decodedTiles).toBe(comparison.gridSize);
    });

    test('every base64-encoded layer of a generated map decodes back to its array form', async ({ page }) => {
        await generateTestMap(page);

        const report = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const arrayExport = manager.exportRLEData('T', 'T', 7);
            const base64Export = manager.exportRLEDataBase64('T', 'T', 7);

            const layers = [];
            for (let i = 0; i < base64Export.layers.length; i++) {
                const b64Layer = base64Export.layers[i];
                const arrLayer = arrayExport.layers[i];

                const entry = {
                    layer: b64Layer.layer_type,
                    encoding: b64Layer.encoding || null,
                    paletteSize: b64Layer.palette.length,
                    paletteMatches: JSON.stringify(b64Layer.palette) === JSON.stringify(arrLayer.palette),
                    runsMatch: null
                };

                const runs = b64Layer.encoding === 'rle-base64-v1'
                    ? window.base64RLEEncoder.decodeFromBase64(b64Layer.data_b64)
                    : b64Layer.color_data;

                entry.runsMatch = JSON.stringify(runs) === JSON.stringify(arrLayer.color_data);
                entry.tileTotal = runs.reduce((sum, [, count]) => sum + count, 0);
                layers.push(entry);
            }

            return { layers, expectedTiles: manager.width * manager.height };
        });

        for (const layer of report.layers) {
            expect(layer.paletteMatches, `${layer.layer} palette differs between formats`).toBe(true);
            expect(layer.runsMatch, `${layer.layer} runs differ between formats`).toBe(true);
            expect(layer.tileTotal, `${layer.layer} tile total`).toBe(report.expectedTiles);

            // Layers small enough for the 3-bit index field must actually use base64;
            // larger ones must fall back rather than silently truncate.
            if (layer.paletteSize <= 8) {
                expect(layer.encoding, `${layer.layer} (${layer.paletteSize} colours)`).toBe('rle-base64-v1');
            } else {
                expect(layer.encoding, `${layer.layer} (${layer.paletteSize} colours)`).toBeNull();
            }
        }

        expect(report.layers.length).toBe(8);
    });
});
