/**
 * Base64-RLE palette index limit
 *
 * `rle-base64-v1` packs a run into a single tag byte: (colorIndex << 5) | lenPart.
 * The colour index therefore lives in the TOP 3 BITS and cannot exceed 7 — the
 * decoder reads it back as `tag >> 5`.
 *
 * These tests pin that limit down, because the encoder used to accept indices up
 * to 31: the oversized tag byte was silently truncated by Uint8Array, so a layer
 * with more than 8 distinct colours exported tiles of the wrong colour with no
 * error anywhere. Every pre-existing round-trip test used <= 3 colours (or
 * `i % 8`), so none of them could see it.
 */

const { test, expect, initializeEditor } = require('./test-base');

test.describe('Base64-RLE palette index limit', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('every index the format supports round-trips exactly', async ({ page }) => {
        const results = await page.evaluate(() => {
            const runLengths = [0, 1, 30, 31, 32, 127, 128, 65536, 262144];
            const out = [];

            for (let colorIndex = 0; colorIndex <= 7; colorIndex++) {
                for (const runLength of runLengths) {
                    const encoded = window.base64RLEEncoder.encodeToBase64([[colorIndex, runLength]]);
                    const decoded = window.base64RLEEncoder.decodeFromBase64(encoded);
                    out.push({ colorIndex, runLength, decoded });
                }
            }
            return out;
        });

        for (const { colorIndex, runLength, decoded } of results) {
            expect(decoded, `index ${colorIndex} run ${runLength} decoded to ${JSON.stringify(decoded)}`)
                .toEqual([[colorIndex, runLength]]);
        }
    });

    test('a multi-run sequence using all 8 indices round-trips exactly', async ({ page }) => {
        const { original, decoded } = await page.evaluate(() => {
            // Deterministic, not random: a failure must be reproducible.
            const original = [];
            for (let i = 0; i < 64; i++) {
                original.push([i % 8, (i * 37) % 5000 + 1]);
            }
            const encoded = window.base64RLEEncoder.encodeToBase64(original);
            return { original, decoded: window.base64RLEEncoder.decodeFromBase64(encoded) };
        });

        expect(decoded).toEqual(original);
    });

    test('rejects palette indices above the 3-bit limit instead of corrupting them', async ({ page }) => {
        const results = await page.evaluate(() => {
            return [8, 9, 15, 20, 31, 32].map(colorIndex => {
                try {
                    const encoded = window.base64RLEEncoder.encodeToBase64([[colorIndex, 100]]);
                    return {
                        colorIndex,
                        threw: false,
                        decoded: window.base64RLEEncoder.decodeFromBase64(encoded)
                    };
                } catch (err) {
                    return { colorIndex, threw: true, message: err.message };
                }
            });
        });

        for (const result of results) {
            expect(result.threw, `index ${result.colorIndex} was encoded as ${JSON.stringify(result.decoded)} instead of being rejected`)
                .toBe(true);
            expect(result.message).toMatch(/palette index/i);
        }
    });

    test('MAX_PALETTE_SIZE matches what the encoder actually accepts', async ({ page }) => {
        const limits = await page.evaluate(() => {
            const max = window.Base64RLEEncoder.MAX_PALETTE_SIZE;
            const encodesAtLimit = (() => {
                try {
                    window.base64RLEEncoder.encodeToBase64([[max - 1, 10]]);
                    return true;
                } catch { return false; }
            })();
            const rejectsPastLimit = (() => {
                try {
                    window.base64RLEEncoder.encodeToBase64([[max, 10]]);
                    return false;
                } catch { return true; }
            })();
            return { max, encodesAtLimit, rejectsPastLimit };
        });

        expect(limits.max).toBe(8);
        expect(limits.encodesAtLimit).toBe(true);
        expect(limits.rejectsPastLimit).toBe(true);
    });

    test('layer export stays loss-free when the palette exceeds the base64 limit', async ({ page }) => {
        // 12 distinct colours: too many for the 3-bit index field, so the layer must
        // fall back to the array RLE form rather than emit corrupted base64.
        const exported = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.tileData.clear();

            const colors = [
                '#ff0000', '#00ff00', '#0000ff', '#ffff00',
                '#ff00ff', '#00ffff', '#800000', '#008000',
                '#000080', '#808000', '#800080', '#008080'
            ];
            // One horizontal band per colour so the runs are long and unambiguous.
            for (let i = 0; i < colors.length; i++) {
                for (let x = 0; x < layer.width; x++) {
                    layer.tileData.set(`${x},${i}`, colors[i]);
                }
            }
            return { data: layer.exportRLEDataBase64(), colors };
        });

        // More than 8 colours => must not claim to be base64-encoded.
        expect(exported.data.palette.length).toBeGreaterThan(8);
        expect(exported.data.encoding).toBeUndefined();
        expect(Array.isArray(exported.data.color_data)).toBe(true);

        // And the data must survive a real import.
        const verification = await page.evaluate(({ data, colors }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.clear();
            layer.importRLEData(data, window.configManager);

            const mismatches = [];
            for (let i = 0; i < colors.length; i++) {
                for (const x of [0, 1, 100, layer.width - 1]) {
                    const actual = layer.tileData.get(`${x},${i}`);
                    if (actual !== colors[i]) {
                        mismatches.push({ x, y: i, expected: colors[i], actual });
                    }
                }
            }
            return mismatches;
        }, exported);

        expect(verification).toEqual([]);
    });

    test('a generated map round-trips every tile colour through export and import', async ({ page }) => {
        // The end-to-end regression: a real map has far more than 8 biome colours on
        // the Floor layer, which is exactly the case the old encoder corrupted.
        await page.evaluate(() => window.generateTestMap());
        await page.waitForFunction(() => {
            const floor = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');
            return floor && floor.tileData.size > 0;
        }, { timeout: 15000 });

        const report = await page.evaluate(() => {
            const manager = window.editor.layerManager;

            // Snapshot every tile before exporting.
            const before = manager.layers.map(layer => new Map(layer.tileData));
            const paletteSizes = {};

            const exported = manager.exportRLEDataBase64('RoundTrip', 'Round-trip test', 4242);
            exported.layers.forEach(l => { paletteSizes[l.layer_type] = l.palette.length; });

            manager.importRLEData(exported, window.configManager);

            const mismatches = [];
            manager.layers.forEach((layer, i) => {
                const original = before[i];
                if (!original) return;
                for (const [key, color] of original.entries()) {
                    const actual = layer.tileData.get(key);
                    if (actual !== color) {
                        if (mismatches.length < 10) {
                            mismatches.push({
                                layer: layer.layerType, key, expected: color, actual
                            });
                        }
                    }
                }
            });

            return { paletteSizes, mismatches, layerCount: manager.layers.length };
        });

        // Sanity: this map really does exercise the >8 colour case somewhere.
        const largest = Math.max(...Object.values(report.paletteSizes));
        expect(largest, `palette sizes: ${JSON.stringify(report.paletteSizes)}`).toBeGreaterThan(8);

        expect(report.mismatches).toEqual([]);
    });
});
