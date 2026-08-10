/**
 * RLE run counts must add up to exactly one tile per grid cell.
 *
 * The loader walks the runs and writes tiles sequentially, so a total that is short
 * leaves the tail of the world unset and a total that is long silently truncates
 * (WorldLayer.importRLEData breaks at maxIndex).
 *
 * The old "should debug RLE encoding step by step" test in this file re-implemented
 * the whole palette+RLE build inside page.evaluate and then asserted that the sum of
 * its own run counts equalled the length of its own array — arithmetically guaranteed,
 * and it never called the exporter it was named after.
 */

const { test, expect, initializeEditor, generateTestMap } = require('./test-base');

test.describe('RLE tile counts', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('a freshly initialised world exports one run per layer covering every tile', async ({ page }) => {
        const layers = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const exported = manager.exportRLEData('Fresh', 'Default fill', 1);
            return {
                expectedTiles: manager.width * manager.height,
                layers: exported.layers.map(l => ({
                    type: l.layer_type,
                    paletteSize: l.palette.length,
                    runs: l.color_data.length,
                    total: l.color_data.reduce((sum, [, count]) => sum + count, 0),
                    firstRun: l.color_data[0]
                }))
            };
        });

        for (const layer of layers.layers) {
            expect(layer.total, `${layer.type} tile total`).toBe(layers.expectedTiles);
            // Uniform default fill compresses to a single run.
            expect(layer.paletteSize, `${layer.type} palette`).toBe(1);
            expect(layer.runs, `${layer.type} run count`).toBe(1);
            expect(layer.firstRun, `${layer.type} run`).toEqual([0, layers.expectedTiles]);
        }
    });

    test('every layer of a generated map exports the full tile count in both formats', async ({ page }) => {
        await generateTestMap(page);

        const analysis = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const expectedTiles = manager.width * manager.height;

            const arrayExport = manager.exportRLEData('TestMap', 'Tile count test', 12345);
            const base64Export = manager.exportRLEDataBase64('TestMap', 'Tile count test', 12345);

            const rows = [];
            for (let i = 0; i < arrayExport.layers.length; i++) {
                const arr = arrayExport.layers[i];
                const b64 = base64Export.layers[i];
                const b64Runs = b64.encoding === 'rle-base64-v1'
                    ? window.base64RLEEncoder.decodeFromBase64(b64.data_b64)
                    : b64.color_data;

                rows.push({
                    layerType: arr.layer_type,
                    arrayTiles: arr.color_data.reduce((s, [, c]) => s + c, 0),
                    base64Tiles: b64Runs.reduce((s, [, c]) => s + c, 0),
                    runs: arr.color_data.length,
                    // No run may be empty: a zero-length run wastes a byte and, in the
                    // base64 form, is indistinguishable from a legitimate 0.
                    zeroRuns: arr.color_data.filter(([, c]) => c <= 0).length,
                    outOfRange: arr.color_data.filter(([i2]) => i2 < 0 || i2 >= arr.palette.length).length
                });
            }
            return { expectedTiles, rows };
        });

        for (const row of analysis.rows) {
            expect(row.arrayTiles, `${row.layerType} array-form tiles`).toBe(analysis.expectedTiles);
            expect(row.base64Tiles, `${row.layerType} base64-form tiles`).toBe(analysis.expectedTiles);
            expect(row.zeroRuns, `${row.layerType} zero-length runs`).toBe(0);
            expect(row.outOfRange, `${row.layerType} out-of-range palette indices`).toBe(0);
        }
        expect(analysis.rows.length).toBe(8);
    });

    test('a partially painted layer still exports a full grid of tiles', async ({ page }) => {
        const analysis = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();

            // Paint a deterministic 1000-tile block over the default fill.
            for (let i = 0; i < 1000; i++) {
                layer.setTile(i % 50, Math.floor(i / 50), 1, { color: '#525d6b' });
            }

            const exported = layer.exportRLEData();
            const b64 = layer.exportRLEDataBase64();
            const decoded = window.base64RLEEncoder.decodeFromBase64(b64.data_b64);

            return {
                expected: layer.width * layer.height,
                arrayTotal: exported.color_data.reduce((s, [, c]) => s + c, 0),
                base64Total: decoded.reduce((s, [, c]) => s + c, 0),
                paletteSize: exported.palette.length
            };
        });

        expect(analysis.arrayTotal).toBe(analysis.expected);
        expect(analysis.base64Total).toBe(analysis.expected);
        // Default colour + the painted colour.
        expect(analysis.paletteSize).toBe(2);
    });

    test('a round-trip through import reproduces the exported runs exactly', async ({ page }) => {
        await generateTestMap(page);

        const result = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const first = manager.exportRLEData('T', 'T', 3);
            manager.importRLEData(first, window.configManager);
            const second = manager.exportRLEData('T', 'T', 3);

            const diffs = [];
            for (let i = 0; i < first.layers.length; i++) {
                const a = first.layers[i];
                const b = second.layers[i];
                if (!b) { diffs.push({ layer: a.layer_type, kind: 'missing after import' }); continue; }
                if (JSON.stringify(a.palette) !== JSON.stringify(b.palette)) {
                    diffs.push({ layer: a.layer_type, kind: 'palette changed' });
                }
                if (JSON.stringify(a.color_data) !== JSON.stringify(b.color_data)) {
                    diffs.push({ layer: a.layer_type, kind: 'runs changed' });
                }
            }
            return { diffs, layerCount: first.layers.length };
        });

        expect(result.diffs, JSON.stringify(result.diffs, null, 2)).toEqual([]);
        expect(result.layerCount).toBe(8);
    });
});
