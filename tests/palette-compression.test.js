const { test, expect, initializeEditor, selectColor } = require('./test-base');

test.describe('Palette-Based Compression', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500); // Short wait for full initialization
    });

    test('should export with palette format', async () => {
        // Draw some tiles with different colors
        await selectColor(page, 'Biome_Grassland');
        await page.mouse.click(400, 300);
        await page.mouse.click(410, 300);
        await page.mouse.click(420, 300);

        await selectColor(page, 'Biome_Ocean');
        await page.mouse.click(430, 300);
        await page.mouse.click(440, 300);

        // Export and check format
        const exported = await page.evaluate(() => {
            const data = window.editor.layerManager.exportRLEData(
                'Test',
                'Test level',
                12345
            );
            return data;
        });

        // Verify structure
        expect(exported).toHaveProperty('metadata');
        expect(exported).toHaveProperty('layers');
        expect(Array.isArray(exported.layers)).toBe(true);

        // Check first layer has palette format
        const firstLayer = exported.layers[0];
        expect(firstLayer).toHaveProperty('layer_type');
        expect(firstLayer).toHaveProperty('palette');
        expect(firstLayer).toHaveProperty('color_data');
        expect(Array.isArray(firstLayer.palette)).toBe(true);
        expect(Array.isArray(firstLayer.color_data)).toBe(true);

        console.log(`✓ Palette has ${firstLayer.palette.length} colors`);
        console.log(`✓ RLE has ${firstLayer.color_data.length} runs`);
    });

    test('should use array format for RLE runs', async () => {
        // Draw some tiles
        await selectColor(page, 'Biome_Desert');
        for (let i = 0; i < 10; i++) {
            await page.mouse.click(400 + i * 10, 300);
        }

        const exported = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
        });

        const firstLayer = exported.layers[0];

        // Check that color_data contains arrays, not objects
        for (const entry of firstLayer.color_data) {
            expect(Array.isArray(entry)).toBe(true);
            expect(entry.length).toBe(2);

            const [paletteIndex, count] = entry;
            expect(typeof paletteIndex).toBe('number');
            expect(typeof count).toBe('number');
            expect(paletteIndex).toBeGreaterThanOrEqual(0);
            expect(paletteIndex).toBeLessThan(firstLayer.palette.length);
            expect(count).toBeGreaterThan(0);
        }

        console.log(`✓ All ${firstLayer.color_data.length} RLE entries are [index, count] arrays`);
    });

    test('should compress better than old format', async () => {
        // Create a level with multiple colors
        await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const colors = ['#00ff00', '#0000ff', '#ffff00', '#ff0000'];

            // Fill 200 tiles with different colors
            for (let i = 0; i < 200; i++) {
                const x = 100 + (i % 20);
                const y = 100 + Math.floor(i / 20);
                const color = colors[i % colors.length];
                const key = `${x},${y}`;
                layer.tileData.set(key, color);
            }
        });

        const { newSize, oldSize, oldSizePretty } = await page.evaluate(() => {
            const data = window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
            const newSize = JSON.stringify(data).length;

            // Simulate old format
            const oldFormat = {
                metadata: data.metadata,
                layers: data.layers.map(layer => ({
                    layer_type: layer.layer_type,
                    color_data: layer.color_data.map(([idx, count]) => ({
                        color: layer.palette[idx],
                        count: count
                    }))
                }))
            };
            const oldSize = JSON.stringify(oldFormat).length;
            const oldSizePretty = JSON.stringify(oldFormat, null, 2).length;

            return { newSize, oldSize, oldSizePretty };
        });

        const savingsVsOld = ((1 - newSize / oldSize) * 100).toFixed(1);
        const savingsVsPretty = ((1 - newSize / oldSizePretty) * 100).toFixed(1);

        console.log(`New format: ${newSize} bytes`);
        console.log(`Old format (minified): ${oldSize} bytes`);
        console.log(`Old format (pretty): ${oldSizePretty} bytes`);
        console.log(`Savings vs old: ${savingsVsOld}%`);
        console.log(`Savings vs pretty: ${savingsVsPretty}%`);

        // Expect at least 20% compression vs old minified
        expect(newSize).toBeLessThan(oldSize * 0.8);

        // Expect at least 40% compression vs pretty
        expect(newSize).toBeLessThan(oldSizePretty * 0.6);
    });

    test('should import palette format correctly', async () => {
        // Create test data in palette format
        const testData = {
            metadata: {
                name: 'Test',
                description: 'Test level',
                world_size: 256,
                maze_generation_seed: 12345
            },
            layers: [
                {
                    layer_type: 'Floor',
                    palette: ['#000000', '#00ff00', '#0000ff'],
                    color_data: [
                        [0, 50000],  // 50000 tiles of black
                        [1, 5000],   // 5000 tiles of green
                        [2, 10000],  // 10000 tiles of blue
                        [0, 536]     // Rest black
                    ]
                }
            ]
        };

        const success = await page.evaluate((data) => {
            return window.editor.layerManager.importRLEData(data, window.configManager);
        }, testData);

        expect(success).toBe(true);

        // Verify data was imported
        const tileCount = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers[0];
            return layer.tileData.size;
        });

        console.log(`✓ Imported ${tileCount} non-empty tiles`);
        expect(tileCount).toBeGreaterThan(0);
    });

    test('should preserve data in round-trip (export then import)', async () => {
        // Draw a pattern
        const pattern = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.tileData.clear();

            const colors = {
                'grassland': '#00ff00',
                'ocean': '#0000ff',
                'desert': '#ffff00'
            };

            const pattern = [];

            // Create known pattern
            for (let i = 0; i < 50; i++) {
                const x = 100 + (i % 10);
                const y = 100 + Math.floor(i / 10);
                let color;
                if (i < 20) color = colors.grassland;
                else if (i < 35) color = colors.ocean;
                else color = colors.desert;

                const key = `${x},${y}`;
                layer.tileData.set(key, color);
                pattern.push({ x, y, color });
            }

            return pattern;
        });

        console.log(`Created pattern with ${pattern.length} tiles`);

        // Export
        const exported = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
        });

        // Clear and import
        const importSuccess = await page.evaluate((data) => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.tileData.clear();
            return window.editor.layerManager.importRLEData(data, window.configManager);
        }, exported);

        expect(importSuccess).toBe(true);

        // Verify every tile
        const verification = await page.evaluate((expectedPattern) => {
            const layer = window.editor.layerManager.getActiveLayer();
            const results = {
                matches: 0,
                mismatches: 0,
                missing: 0,
                errors: []
            };

            for (const { x, y, color } of expectedPattern) {
                const key = `${x},${y}`;
                const actualColor = layer.tileData.get(key);

                if (!actualColor) {
                    results.missing++;
                    results.errors.push(`Missing tile at ${key}`);
                } else if (actualColor === color) {
                    results.matches++;
                } else {
                    results.mismatches++;
                    results.errors.push(`Mismatch at ${key}: expected ${color}, got ${actualColor}`);
                }
            }

            return results;
        }, pattern);

        console.log(`Matches: ${verification.matches}`);
        console.log(`Mismatches: ${verification.mismatches}`);
        console.log(`Missing: ${verification.missing}`);

        if (verification.errors.length > 0) {
            console.log('Errors:', verification.errors.slice(0, 5));
        }

        expect(verification.matches).toBe(pattern.length);
        expect(verification.mismatches).toBe(0);
        expect(verification.missing).toBe(0);
    });

    test('should import old format for backward compatibility', async () => {
        // Create test data in OLD object format
        const oldFormatData = {
            metadata: {
                name: 'Old Format Test',
                description: 'Test backward compatibility',
                world_size: 256,
                maze_generation_seed: 12345
            },
            layers: [
                {
                    layer_type: 'Floor',
                    color_data: [
                        { color: '#000000', count: 60000 },
                        { color: '#00ff00', count: 5000 },
                        { color: '#0000ff', count: 536 }
                    ]
                }
            ]
        };

        const success = await page.evaluate((data) => {
            return window.editor.layerManager.importRLEData(data, window.configManager);
        }, oldFormatData);

        expect(success).toBe(true);

        // Verify some tiles were imported
        const tileCount = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers[0];
            return layer.tileData.size;
        });

        console.log(`✓ Imported ${tileCount} tiles from old format`);
        expect(tileCount).toBeGreaterThan(0);
    });

    test('should handle large palettes efficiently', async () => {
        // Create layer with many unique colors
        await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.tileData.clear();

            // Add 50 unique colors
            for (let i = 0; i < 50; i++) {
                const r = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                const g = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                const b = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                const color = `#${r}${g}${b}`;

                // Place a few tiles of each color
                for (let j = 0; j < 5; j++) {
                    const x = 100 + (i * 5 + j);
                    const y = 100;
                    const key = `${x},${y}`;
                    layer.tileData.set(key, color);
                }
            }
        });

        const exported = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
        });

        const firstLayer = exported.layers[0];

        console.log(`Palette size: ${firstLayer.palette.length} colors`);
        console.log(`RLE runs: ${firstLayer.color_data.length}`);

        // Verify all palette indices are valid
        for (const [idx, count] of firstLayer.color_data) {
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(firstLayer.palette.length);
            expect(count).toBeGreaterThan(0);
        }

        // Palette should have all unique colors
        const uniqueColors = new Set(firstLayer.palette);
        expect(uniqueColors.size).toBe(firstLayer.palette.length);

        console.log(`✓ All ${firstLayer.palette.length} palette colors are unique`);
    });

    test('should validate decompressed tile count', async () => {
        // Create known tile count
        await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.tileData.clear();

            // Fill exactly 1000 tiles
            for (let i = 0; i < 1000; i++) {
                const x = 100 + (i % 50);
                const y = 100 + Math.floor(i / 50);
                const key = `${x},${y}`;
                layer.tileData.set(key, '#00ff00');
            }
        });

        const exported = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
        });

        // Import and count
        await page.evaluate((data) => {
            window.editor.layerManager.importRLEData(data, window.configManager);
        }, exported);

        const importedCount = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.tileData.size;
        });

        console.log(`Original: 1000 tiles, Imported: ${importedCount} tiles`);
        expect(importedCount).toBe(1000);
    });

    test('should minify JSON output (no whitespace)', async () => {
        await selectColor(page, 'Biome_Grassland');
        await page.mouse.click(400, 300);

        const jsonString = await page.evaluate(() => {
            const data = window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
            return JSON.stringify(data);
        });

        // Check there are no excessive spaces or newlines
        const hasNewlines = jsonString.includes('\n');
        const hasDoubleSpaces = jsonString.includes('  ');

        console.log(`JSON length: ${jsonString.length} bytes`);
        console.log(`Has newlines: ${hasNewlines}`);
        console.log(`Has double spaces: ${hasDoubleSpaces}`);

        expect(hasNewlines).toBe(false);
        expect(hasDoubleSpaces).toBe(false);
    });
});
