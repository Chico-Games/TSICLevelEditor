/**
 * Test map generation
 *
 * Every assertion in the old version of this file was of the form
 * `expect(layer.tileData.size).toBeGreaterThan(50)`. Layers are pre-filled with their
 * default colour at startup, so `tileData.size` is already 65536 per layer before
 * anything happens: those assertions passed identically whether generation ran, did
 * nothing, or threw. The file also drove `#btn-load-test-map`, a button removed in
 * 459245b, so in practice the tests timed out instead.
 *
 * What actually distinguishes "generated" from "untouched" is the number of DISTINCT
 * colours on a layer, so that is what these tests measure.
 */

const { test, expect, initializeEditor, generateTestMap } = require('./test-base');

const GRID_TILES = 256 * 256;

/** Per-layer colour histogram — the only reliable signal that generation ran. */
async function layerColourStats(page) {
    return await page.evaluate(() => {
        return window.editor.layerManager.layers.map(layer => {
            const counts = new Map();
            for (const color of layer.tileData.values()) {
                counts.set(color, (counts.get(color) || 0) + 1);
            }
            return {
                name: layer.name,
                layerType: layer.layerType,
                tileCount: layer.tileData.size,
                expected: layer.width * layer.height,
                distinctColors: counts.size,
                largestShare: Math.max(...counts.values()) / layer.tileData.size
            };
        });
    });
}

test.describe('Test map generation', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('before generation every layer holds exactly one colour', async ({ page }) => {
        // Establishes the baseline the other tests are measured against. Without this,
        // "the layer has tiles" would look like evidence of generation.
        const stats = await layerColourStats(page);
        for (const layer of stats) {
            expect(layer.tileCount, `${layer.name} tile count`).toBe(GRID_TILES);
            expect(layer.distinctColors, `${layer.name} colours before generation`).toBe(1);
        }
    });

    test('generation paints multiple biomes onto the content layers', async ({ page }) => {
        await generateTestMap(page);
        const stats = await layerColourStats(page);

        const contentLayers = ['Floor', 'Sky', 'Underground', 'Height', 'Difficulty', 'Hazard'];
        for (const type of contentLayers) {
            const layer = stats.find(s => s.layerType === type);
            expect(layer, `${type} layer missing`).toBeDefined();
            expect(layer.distinctColors, `${type} should have several colours`).toBeGreaterThan(1);
            // Still a complete grid — generation must not leave holes.
            expect(layer.tileCount, `${type} tile count`).toBe(GRID_TILES);
        }
    });

    test('generated terrain is varied rather than one colour with speckles', async ({ page }) => {
        await generateTestMap(page);
        const stats = await layerColourStats(page);
        const floor = stats.find(s => s.layerType === 'Floor');

        expect(floor.distinctColors).toBeGreaterThanOrEqual(4);
        // No single biome may swamp the map — that would be indistinguishable from
        // "generation barely ran".
        expect(floor.largestShare).toBeLessThan(0.9);
    });

    test('generation is reported to the user and marks the document dirty', async ({ page }) => {
        await generateTestMap(page);

        const status = await page.locator('#status-message').textContent();
        expect(status).toContain('Test map generated');
        expect(await page.evaluate(() => window.editor.isDirty)).toBe(true);
    });

    test('undo after generation restores the pre-generation world', async ({ page }) => {
        const before = await page.evaluate(() =>
            window.editor.layerManager.layers.map(l => Object.fromEntries(l.tileData))
        );

        await generateTestMap(page);

        const afterGen = await layerColourStats(page);
        expect(afterGen.find(s => s.layerType === 'Floor').distinctColors).toBeGreaterThan(1);

        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(500);

        const restored = await page.evaluate((snapshots) => {
            const layers = window.editor.layerManager.layers;
            const diffs = [];
            layers.forEach((layer, i) => {
                const snapshot = snapshots[i];
                if (!snapshot) return;
                for (const [key, color] of layer.tileData) {
                    if (snapshot[key] !== color && diffs.length < 5) {
                        diffs.push({ layer: layer.name, key, was: snapshot[key], now: color });
                    }
                }
            });
            return diffs;
        }, before);

        // The old test compared getTotalTileCount() before and after, which cannot
        // change: the grid is always full.
        expect(restored, JSON.stringify(restored)).toEqual([]);
    });

    test('successive generations produce different terrain', async ({ page }) => {
        await generateTestMap(page);
        const first = await page.evaluate(() => {
            const floor = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');
            return Array.from({ length: 200 }, (_, i) => floor.tileData.get(`${i},${i}`));
        });

        await generateTestMap(page);
        const second = await page.evaluate(() => {
            const floor = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');
            return Array.from({ length: 200 }, (_, i) => floor.tileData.get(`${i},${i}`));
        });

        const differences = first.filter((c, i) => c !== second[i]).length;
        expect(differences).toBeGreaterThan(0);
    });

    test('generated colours all resolve to known tilesets', async ({ page }) => {
        await generateTestMap(page);

        const unknown = await page.evaluate(() => {
            const bad = [];
            for (const layer of window.editor.layerManager.layers) {
                for (const color of new Set(layer.tileData.values())) {
                    if (!window.configManager.getTilesetByColor(color)) {
                        bad.push({ layer: layer.name, color });
                    }
                }
            }
            return bad;
        });

        // A colour with no tileset would export as an unresolvable palette entry.
        expect(unknown, JSON.stringify(unknown)).toEqual([]);
    });

    test('the canvas actually renders the generated map', async ({ page }) => {
        // The old version checked for "any non-black pixel", which the default grey
        // Height fill satisfies on a blank document. Compare the rendered pixels
        // before and after instead.
        const canvasHash = () => page.evaluate(() => {
            const canvas = document.getElementById('grid-canvas');
            const ctx = canvas.getContext('2d');
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let hash = 0;
            for (let i = 0; i < data.length; i += 401) { // sparse sample, deterministic
                hash = (hash * 31 + data[i]) >>> 0;
            }
            return hash;
        });

        const before = await canvasHash();
        await generateTestMap(page);
        await page.evaluate(() => window.editor.render());
        await page.waitForTimeout(300);
        const after = await canvasHash();

        expect(after).not.toBe(before);
    });
});
