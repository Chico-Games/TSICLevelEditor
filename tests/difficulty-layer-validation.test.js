/**
 * Difficulty layer export must resolve to valid ECurrentStoreDifficulty values (0-4)
 *
 * Difficulty drives both enemy tiers and loot tiers at runtime (FindTierForDifficulty
 * walks down from the tile's difficulty), so a colour that fails to resolve is not a
 * cosmetic problem — it silently changes what spawns.
 *
 * Problems with the previous version of this file:
 *  - "validate difficulty layer has only valid values" skipped any colour whose
 *    tileset lookup returned null (`if (value !== null && ...)`), so an unresolvable
 *    colour — the actual failure mode — passed;
 *  - "verify difficulty layer colors map to valid values" never generated a map, so it
 *    iterated a uniformly-default layer and proved nothing;
 *  - the base64 test asserted `colorIndex < palette.length` after decoding only the
 *    first 10 tag bytes, and re-implemented the ULEB128 walk by hand.
 */

const { test, expect, initializeEditor, generateTestMap } = require('./test-base');

const MAX_DIFFICULTY = 4;

test.describe('Difficulty layer validation', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await generateTestMap(page);
    });

    test('every colour on the Difficulty layer resolves to a value in 0-4', async ({ page }) => {
        const analysis = await page.evaluate((max) => {
            const layer = window.editor.layerManager.layers.find(l => l.layerType === 'Difficulty');
            const distinct = new Set(layer.tileData.values());

            const mappings = [];
            for (const color of distinct) {
                const tileset = window.configManager.getTilesetByColor(color);
                mappings.push({
                    color,
                    resolved: !!tileset,
                    name: tileset ? tileset.name : null,
                    value: tileset ? tileset.value : null,
                    inRange: !!tileset && Number.isInteger(tileset.value) &&
                        tileset.value >= 0 && tileset.value <= max
                });
            }
            return { tileCount: layer.tileData.size, mappings };
        }, MAX_DIFFICULTY);

        // The generated map must actually put more than one difficulty on the layer,
        // otherwise this test would be checking a single default colour.
        expect(analysis.mappings.length).toBeGreaterThan(1);

        const unresolved = analysis.mappings.filter(m => !m.resolved);
        expect(unresolved, `colours with no tileset: ${JSON.stringify(unresolved)}`).toEqual([]);

        const outOfRange = analysis.mappings.filter(m => !m.inRange);
        expect(outOfRange, `out-of-range difficulties: ${JSON.stringify(outOfRange)}`).toEqual([]);
    });

    test('the exported Difficulty palette resolves through color_mappings', async ({ page }) => {
        const result = await page.evaluate((max) => {
            const exported = window.editor.layerManager.exportRLEData('TestMap', 'Difficulty', 12345);
            const layer = exported.layers.find(l => l.layer_type === 'Difficulty');
            const table = exported.color_mappings.difficulty;

            const problems = [];
            const values = [];

            layer.palette.forEach((color, index) => {
                const entry = table[color.toLowerCase()];
                if (!entry) {
                    problems.push({ index, color, kind: 'not in color_mappings.difficulty' });
                    return;
                }
                if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value > max) {
                    problems.push({ index, color, value: entry.value, kind: 'value out of range' });
                    return;
                }
                values.push(entry.value);
            });

            // Every run must point at a palette slot that exists.
            layer.color_data.forEach(([idx], i) => {
                if (idx < 0 || idx >= layer.palette.length) {
                    problems.push({ run: i, index: idx, kind: 'index outside palette' });
                }
            });

            return { problems, values, paletteSize: layer.palette.length, runs: layer.color_data.length };
        }, MAX_DIFFICULTY);

        expect(result.problems, JSON.stringify(result.problems, null, 2)).toEqual([]);
        expect(result.paletteSize).toBeGreaterThan(1);
        expect(result.runs).toBeGreaterThan(1);
    });

    test('the base64 form of the Difficulty layer decodes to the same runs', async ({ page }) => {
        const result = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const arrayLayer = manager.exportRLEData('T', 'T', 12345)
                .layers.find(l => l.layer_type === 'Difficulty');
            const b64Layer = manager.exportRLEDataBase64('T', 'T', 12345)
                .layers.find(l => l.layer_type === 'Difficulty');

            // Difficulty has at most 5 colours, so it must take the base64 path.
            const decoded = b64Layer.encoding === 'rle-base64-v1'
                ? window.base64RLEEncoder.decodeFromBase64(b64Layer.data_b64)
                : null;

            return {
                encoding: b64Layer.encoding,
                paletteSize: b64Layer.palette.length,
                decoded,
                arrayRuns: arrayLayer.color_data,
                maxIndex: decoded ? Math.max(...decoded.map(([i]) => i)) : null,
                totalTiles: decoded ? decoded.reduce((s, [, c]) => s + c, 0) : null,
                expectedTiles: manager.width * manager.height
            };
        });

        expect(result.paletteSize).toBeLessThanOrEqual(5);
        expect(result.encoding).toBe('rle-base64-v1');
        // Full comparison, not just the first ten tag bytes.
        expect(result.decoded).toEqual(result.arrayRuns);
        expect(result.maxIndex).toBeLessThan(result.paletteSize);
        expect(result.totalTiles).toBe(result.expectedTiles);
    });
});
