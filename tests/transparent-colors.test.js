/**
 * Default layer fill and the "transparent" (#000000) convention
 *
 * With no project loaded the app fills every layer with that layer's default colour,
 * so the world never contains unset tiles. #000000 is the wire-format placeholder for
 * "empty": export rewrites it to the layer default.
 *
 * The previous version of this file asserted a 512x512 grid (it is 256x256), expected
 * Height to default to #525d6b and the biome layers to #000000 (neither matches
 * getDefaultColorForLayerType), read `color_data[0].color` from runs that are actually
 * `[paletteIndex, count]` arrays, contained one test with no assertions at all, and one
 * whose only assertion sat inside `if (layer.color_data.length === 1)`.
 */

const { test, expect, initializeEditor, selectColor, clickLayer } = require('./test-base');

// Mirrors getDefaultColorForLayerType() in js/layers.js and
// Editor.getDefaultColorForLayer() in js/editor.js — the last test checks they agree.
const LAYER_DEFAULTS = {
    Height: '#0a0a0a',
    Difficulty: '#90ee90',
    Hazard: '#1a1a1a',
    Sky: '#b8b8b8',
    Floor: '#ff6b6b',
    Underground: '#2f2f2f',
    SkyHeightOffset: '#0a0a0a',
    UndergroundHeightOffset: '#0a0a0a'
};

test.describe('Default fill and transparent colours', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('every layer is completely filled on initialisation', async ({ page }) => {
        const stats = await page.evaluate(() => {
            return window.editor.layerManager.layers.map(layer => ({
                name: layer.name,
                tileCount: layer.tileData.size,
                expected: layer.width * layer.height
            }));
        });

        expect(stats.length).toBe(8);
        for (const stat of stats) {
            expect(stat.tileCount, `${stat.name} tile count`).toBe(stat.expected);
        }
    });

    test('each layer is filled uniformly with its own default colour', async ({ page }) => {
        const perLayer = await page.evaluate(() => {
            return window.editor.layerManager.layers.map(layer => {
                const colors = new Set();
                for (const color of layer.tileData.values()) colors.add(color);
                return {
                    layerType: layer.layerType,
                    distinctColors: Array.from(colors),
                    corner: layer.tileData.get('0,0'),
                    far: layer.tileData.get(`${layer.width - 1},${layer.height - 1}`)
                };
            });
        });

        for (const layer of perLayer) {
            const expected = LAYER_DEFAULTS[layer.layerType];
            expect(expected, `unexpected layer type ${layer.layerType}`).toBeDefined();
            // Exactly one colour across the whole layer: sampling a few tiles, as the
            // old test did, would not notice a partial fill.
            expect(layer.distinctColors, `${layer.layerType} should be uniformly filled`).toEqual([expected]);
            expect(layer.corner).toBe(expected);
            expect(layer.far).toBe(expected);
        }
    });

    test('painting replaces the default colour only under the brush', async ({ page }) => {
        const result = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const before = new Map(layer.tileData);

            layer.setTile(10, 10, 1, { color: '#ffffff' });

            let changed = 0;
            for (const [key, color] of layer.tileData) {
                if (before.get(key) !== color) changed++;
            }
            return {
                changed,
                painted: layer.tileData.get('10,10'),
                neighbour: layer.tileData.get('11,10'),
                defaultColor: before.get('11,10')
            };
        });

        expect(result.changed).toBe(1);
        expect(result.painted).toBe('#ffffff');
        expect(result.neighbour).toBe(result.defaultColor);
    });

    test('the eraser repaints the layer default rather than deleting the tile', async ({ page }) => {
        // Deliberate design choice (editor.js clearTiles: "Paint with default color
        // instead of clearing") so the world never has holes. The old test for this
        // logged whether the tile still existed and asserted nothing at all.
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');

        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();
            const defaultColor = editor.getDefaultColorForLayer(layer.layerType).toLowerCase();

            editor.setTiles([{ x: 20, y: 20 }]);
            const afterPaint = layer.tileData.get('20,20');

            editor.clearTiles([{ x: 20, y: 20 }]);

            return {
                defaultColor,
                afterPaint,
                afterErase: layer.tileData.get('20,20'),
                stillPresent: layer.tileData.has('20,20'),
                tileCount: layer.tileData.size,
                expected: layer.width * layer.height
            };
        });

        expect(result.afterPaint).toBe('#4ecdc4'); // Biome_Warehouse
        expect(result.afterErase).toBe(result.defaultColor);
        expect(result.stillPresent).toBe(true);
        // Erasing must not shrink the layer — that is what keeps exports full-size.
        expect(result.tileCount).toBe(result.expected);
    });

    test('an untouched layer compresses to a single RLE run of the default colour', async ({ page }) => {
        const layers = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const exported = manager.exportRLEData('Defaults', 'Test', 123);
            const expected = manager.width * manager.height;
            return exported.layers.map(layer => ({
                type: layer.layer_type,
                runs: layer.color_data.length,
                // color_data holds [paletteIndex, count] pairs, NOT {color, count}.
                runLength: layer.color_data[0][1],
                paletteColor: layer.palette[layer.color_data[0][0]].toLowerCase(),
                expected
            }));
        });

        expect(layers.length).toBe(8);
        for (const layer of layers) {
            // Unconditional: the old assertion sat inside `if (runs === 1)`, so a
            // compression regression skipped the check instead of failing it.
            expect(layer.runs, `${layer.type} run count`).toBe(1);
            expect(layer.runLength, `${layer.type} run length`).toBe(layer.expected);
            expect(layer.paletteColor, `${layer.type} run colour`).toBe(LAYER_DEFAULTS[layer.type]);
        }
    });

    test('#000000 is rewritten to the layer default on export', async ({ page }) => {
        const result = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');

            layer.tileData.set('5,5', '#000000');
            layer.tileData.set('6,5', '#000000');

            const exported = layer.exportRLEData();
            const paletteHasBlack = exported.palette.includes('#000000');

            layer.importRLEData(exported, window.configManager);

            return {
                paletteHasBlack,
                afterImport: [layer.tileData.get('5,5'), layer.tileData.get('6,5')]
            };
        });

        // #000000 never reaches the file: Unreal would resolve it to Tile.Biome.Empty.
        expect(result.paletteHasBlack).toBe(false);
        expect(result.afterImport).toEqual(['#ff6b6b', '#ff6b6b']);
    });

    test('the two copies of the default-colour table agree', async ({ page }) => {
        // js/layers.js and js/editor.js each carry their own switch statement. The
        // initial fill uses the editor.js one and export uses the layers.js one, so a
        // divergence would fill a layer with a colour the exporter then rewrites.
        const comparison = await page.evaluate((types) => {
            return types.map(type => {
                const layer = window.editor.layerManager.layers.find(l => l.layerType === type);
                const saved = new Map(layer.tileData);
                layer.tileData.clear();
                const exported = layer.exportRLEData(); // fills from the layers.js table
                layer.tileData = saved;
                return {
                    type,
                    fromEditor: window.editor.getDefaultColorForLayer(type).toLowerCase(),
                    fromExport: exported.palette[0].toLowerCase()
                };
            });
        }, Object.keys(LAYER_DEFAULTS));

        for (const row of comparison) {
            expect(row.fromEditor, `${row.type} editor.js default`).toBe(LAYER_DEFAULTS[row.type]);
            expect(row.fromExport, `${row.type} layers.js default`).toBe(LAYER_DEFAULTS[row.type]);
        }
    });
});
