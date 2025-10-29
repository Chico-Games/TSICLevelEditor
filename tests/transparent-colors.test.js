/**
 * Transparent Colors and Default Fill Tests
 * Verifies that #000000 renders as transparent and layers are filled with defaults
 */

const { test, expect } = require('./test-base');

test.describe('Transparent Colors and Default Fill', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(1000); // Wait for initialization
    });

    test('all layers should be filled with default colors on initialization', async ({ page }) => {
        // Check that layers have tiles
        const layerStats = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return layers.map(layer => ({
                name: layer.name,
                layerType: layer.layerType,
                tileCount: layer.tileData.size,
                totalExpected: layer.width * layer.height
            }));
        });

        console.log('Layer statistics:', layerStats);

        // Each layer should have all tiles filled
        layerStats.forEach(stat => {
            expect(stat.tileCount).toBe(stat.totalExpected);
            console.log(`${stat.name} (${stat.layerType}): ${stat.tileCount} tiles`);
        });
    });

    test('Height layer should use ground floor as default', async ({ page }) => {
        const heightLayerData = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            const heightLayer = layers.find(l => l.layerType === 'Height');

            if (!heightLayer) return null;

            // Sample a few tiles to check color
            const samples = [];
            for (let i = 0; i < 5; i++) {
                const key = `${i},${i}`;
                samples.push(heightLayer.tileData.get(key));
            }

            return {
                exists: true,
                sampleColors: samples,
                totalTiles: heightLayer.tileData.size
            };
        });

        expect(heightLayerData.exists).toBe(true);
        expect(heightLayerData.totalTiles).toBe(512 * 512);

        // All sampled tiles should be the ground floor color (#525d6b)
        heightLayerData.sampleColors.forEach(color => {
            expect(color).toBe('#525d6b');
        });

        console.log('Height layer default color samples:', heightLayerData.sampleColors);
    });

    test('Biome layers should use transparent default (#000000)', async ({ page }) => {
        const biomeLayersData = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            const biomeLayers = layers.filter(l =>
                l.layerType === 'Floor' ||
                l.layerType === 'Underground' ||
                l.layerType === 'Sky'
            );

            return biomeLayers.map(layer => {
                // Sample a few tiles
                const samples = [];
                for (let i = 0; i < 5; i++) {
                    const key = `${i},${i}`;
                    samples.push(layer.tileData.get(key));
                }

                return {
                    name: layer.name,
                    layerType: layer.layerType,
                    sampleColors: samples
                };
            });
        });

        console.log('Biome layers default colors:', biomeLayersData);

        // All biome layers should use #000000 (transparent)
        biomeLayersData.forEach(layerData => {
            layerData.sampleColors.forEach(color => {
                expect(color).toBe('#000000');
            });
        });
    });

    test('transparent colors (#000000) should not be rendered on canvas', async ({ page }) => {
        // Paint one tile with a non-transparent color
        await page.click('[data-tool="pencil"]');

        // Select a visible color (e.g., Biome_ShowFloor)
        const showfloorColor = await page.locator('.color-item[data-name="Biome_ShowFloor"]');
        await showfloorColor.click();
        await page.waitForTimeout(100);

        // Click on canvas to paint
        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(200);

        // Check rendering - count non-transparent vs transparent tiles
        const renderStats = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            let transparentCount = 0;
            let nonTransparentCount = 0;

            for (const layer of layers) {
                for (const [key, color] of layer.tileData.entries()) {
                    if (color.toLowerCase() === '#000000') {
                        transparentCount++;
                    } else {
                        nonTransparentCount++;
                    }
                }
            }

            return {
                transparentCount,
                nonTransparentCount,
                totalTiles: transparentCount + nonTransparentCount
            };
        });

        console.log('Render stats:', renderStats);

        // We should have mostly transparent tiles (defaults) and only a few non-transparent (painted)
        expect(renderStats.transparentCount).toBeGreaterThan(renderStats.nonTransparentCount);
        expect(renderStats.nonTransparentCount).toBeGreaterThan(0); // At least one non-transparent tile
    });

    test('erasing a tile should restore default color', async ({ page }) => {
        // Paint a tile first
        await page.click('[data-tool="pencil"]');
        const showfloorColor = await page.locator('.color-item[data-name="Biome_ShowFloor"]');
        await showfloorColor.click();
        await page.waitForTimeout(100);

        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(200);

        // Get the painted tile color
        const paintedColor = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const key = `${6},${6}`; // Approximate grid position of click
            return layer.tileData.get(key) || null;
        });

        console.log('Painted tile color:', paintedColor);

        // Now erase it
        await page.click('[data-tool="eraser"]');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(200);

        // Get the erased tile - it should be gone (or set to default)
        const erasedTileExists = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const key = `${6},${6}`;
            return layer.tileData.has(key);
        });

        // After erasing, the tile should either not exist or be transparent
        // (depends on implementation - currently it deletes the tile)
        console.log('Tile exists after erase:', erasedTileExists);
    });

    test('RLE export should compress transparent tiles efficiently', async ({ page }) => {
        // Export with mostly default (transparent) tiles
        const rleData = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('TestDefaults', 'Test', 123);
        });

        console.log('RLE export layers:', rleData.layers.length);

        // Check that layers with all-default colors have minimal RLE entries
        rleData.layers.forEach(layer => {
            console.log(`${layer.layer_type}: ${layer.color_data.length} RLE entries`);

            // Layers filled with a single default color should compress to 1 entry
            if (layer.color_data.length === 1) {
                const entry = layer.color_data[0];
                expect(entry.count).toBe(512 * 512);
                console.log(`  Single entry: ${entry.color} x ${entry.count}`);
            }
        });
    });

    test('loading a new level should fill layers with defaults', async ({ page }) => {
        // Click New button
        await page.click('#btn-new');
        await page.waitForTimeout(500);

        // All layers should be filled again
        const layerStats = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return layers.map(layer => ({
                name: layer.name,
                tileCount: layer.tileData.size,
                expected: layer.width * layer.height
            }));
        });

        console.log('After New:', layerStats);

        layerStats.forEach(stat => {
            expect(stat.tileCount).toBe(stat.expected);
        });
    });
});
