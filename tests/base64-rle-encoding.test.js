const { test, expect, initializeEditor } = require('./test-base');

test.describe('Base64-RLE Encoding', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should load base64RLEEncoder module', async () => {
        const encoderLoaded = await page.evaluate(() => {
            return typeof window.base64RLEEncoder !== 'undefined' &&
                   typeof window.Base64RLEEncoder !== 'undefined';
        });

        expect(encoderLoaded).toBe(true);
        console.log('✓ Base64RLEEncoder module loaded');
    });

    test('should encode simple RLE data to base64', async () => {
        const { base64String, decoded } = await page.evaluate(() => {
            const rleData = [
                [0, 100],  // Color 0, count 100
                [1, 200],  // Color 1, count 200
                [2, 50]    // Color 2, count 50
            ];

            const base64String = window.base64RLEEncoder.encodeToBase64(rleData);
            const decoded = window.base64RLEEncoder.decodeFromBase64(base64String);

            return { base64String, decoded };
        });

        console.log(`Base64 string: ${base64String}`);
        console.log(`Decoded: ${JSON.stringify(decoded)}`);

        // Should be a valid base64 string
        expect(base64String).toMatch(/^[A-Za-z0-9+/]+=*$/);

        // Should decode back to original
        expect(decoded.length).toBe(3);
        expect(decoded[0]).toEqual([0, 100]);
        expect(decoded[1]).toEqual([1, 200]);
        expect(decoded[2]).toEqual([2, 50]);

        console.log('✓ Encodes and decodes correctly');
    });

    test('should handle large run lengths (> 31)', async () => {
        const { encoded, decoded } = await page.evaluate(() => {
            const rleData = [
                [0, 50000],  // Very large run
                [1, 100],
                [2, 65536]   // Even larger
            ];

            const encoded = window.base64RLEEncoder.encodeToBase64(rleData);
            const decoded = window.base64RLEEncoder.decodeFromBase64(encoded);

            return { encoded, decoded };
        });

        console.log(`Encoded large runs: ${encoded}`);

        expect(decoded.length).toBe(3);
        expect(decoded[0]).toEqual([0, 50000]);
        expect(decoded[1]).toEqual([1, 100]);
        expect(decoded[2]).toEqual([2, 65536]);

        console.log('✓ Handles large run lengths with ULEB128');
    });

    test('should produce smaller output than array format', async () => {
        const { arraySize, base64Size, ratio } = await page.evaluate(() => {
            // Create realistic RLE data
            const rleData = [];
            for (let i = 0; i < 20; i++) {
                rleData.push([i % 8, Math.floor(Math.random() * 10000) + 1000]);
            }

            const arrayString = JSON.stringify(rleData);
            const base64String = window.base64RLEEncoder.encodeToBase64(rleData);

            return {
                arraySize: arrayString.length,
                base64Size: base64String.length,
                ratio: ((1 - base64String.length / arrayString.length) * 100).toFixed(1)
            };
        });

        console.log(`\n=== Size Comparison ===`);
        console.log(`Array format: ${arraySize} bytes`);
        console.log(`Base64 format: ${base64Size} bytes`);
        console.log(`Reduction: ${ratio}%`);

        // Base64 should be significantly smaller
        expect(base64Size).toBeLessThan(arraySize);
        expect(parseFloat(ratio)).toBeGreaterThan(30); // At least 30% smaller

        console.log('✓ Base64 format is significantly smaller');
    });

    test('should export layer in base64 format', async () => {
        // Draw some tiles
        await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const color = '#00ff00'; // Green
            const tileset = { color: color, value: 1 };

            // Fill a region
            for (let y = 0; y < 50; y++) {
                for (let x = 0; x < 50; x++) {
                    layer.setTile(x, y, 1, tileset);
                }
            }
        });

        const layerData = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.exportRLEDataBase64();
        });

        expect(layerData).toHaveProperty('encoding');
        expect(layerData.encoding).toBe('rle-base64-v1');
        expect(layerData).toHaveProperty('data_b64');
        expect(layerData).toHaveProperty('palette');
        expect(layerData).toHaveProperty('width');
        expect(layerData).toHaveProperty('height');

        console.log('✓ Layer exports in base64 format');
        console.log(`  Palette size: ${layerData.palette.length}`);
        console.log(`  Base64 data length: ${layerData.data_b64.length} chars`);
    });

    test('should import layer from base64 format', async () => {
        // Export layer
        await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const color = '#0000ff'; // Blue
            const tileset = { color: color, value: 2 };

            // Draw pattern
            for (let i = 0; i < 100; i++) {
                const x = i % 10;
                const y = Math.floor(i / 10);
                layer.setTile(x, y, 2, tileset);
            }
        });

        const exported = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.exportRLEDataBase64();
        });

        // Clear and import
        const importSuccess = await page.evaluate((layerData) => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.clear();
            layer.importRLEData(layerData, window.configManager);
            return layer.tileData.size;
        }, exported);

        expect(importSuccess).toBeGreaterThan(0);
        console.log(`✓ Imported ${importSuccess} tiles from base64 format`);
    });

    test('should preserve data in round-trip (export then import)', async () => {
        // Create known pattern
        const pattern = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.tileData.clear();

            const colors = ['#ff0000', '#00ff00', '#0000ff'];
            const pattern = [];

            for (let i = 0; i < 100; i++) {
                const x = i % 10;
                const y = Math.floor(i / 10);
                const color = colors[i % colors.length];

                const tileset = { color: color, value: i };
                layer.setTile(x, y, i, tileset);
                pattern.push({ x, y, color });
            }

            return pattern;
        });

        // Export
        const exported = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.exportRLEDataBase64();
        });

        // Clear and import
        await page.evaluate((layerData) => {
            const layer = window.editor.layerManager.getActiveLayer();
            layer.clear();
            layer.importRLEData(layerData, window.configManager);
        }, exported);

        // Verify
        const verification = await page.evaluate((expectedPattern) => {
            const layer = window.editor.layerManager.getActiveLayer();
            let matches = 0;
            let mismatches = 0;

            for (const { x, y, color } of expectedPattern) {
                const key = `${x},${y}`;
                const actualColor = layer.tileData.get(key);

                if (actualColor === color) {
                    matches++;
                } else {
                    mismatches++;
                }
            }

            return { matches, mismatches };
        }, pattern);

        console.log(`Matches: ${verification.matches}, Mismatches: ${verification.mismatches}`);
        expect(verification.matches).toBe(pattern.length);
        expect(verification.mismatches).toBe(0);

        console.log('✓ Perfect round-trip preservation');
    });

    test('should export full map in base64 format', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const exported = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEDataBase64(
                'TestMap',
                'Base64 test',
                12345
            );
        });

        expect(exported).toHaveProperty('metadata');
        expect(exported.metadata.format_version).toBe('2.0-base64');
        expect(exported).toHaveProperty('layers');
        expect(Array.isArray(exported.layers)).toBe(true);

        console.log(`\n=== Full Map Export ===`);
        console.log(`Layers: ${exported.layers.length}`);

        let totalBase64Size = 0;
        for (const layer of exported.layers) {
            expect(layer.encoding).toBe('rle-base64-v1');
            expect(layer).toHaveProperty('data_b64');
            totalBase64Size += layer.data_b64.length;
            console.log(`  ${layer.layer_type}: ${layer.data_b64.length} chars, ${layer.palette.length} colors`);
        }

        console.log(`Total base64 data: ${totalBase64Size} characters`);
        console.log('✓ Full map exports in base64 format');
    });

    test('should import full map from base64 format', async () => {
        // Generate and export
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const exported = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEDataBase64('TestMap', 'Test', 12345);
        });

        // Clear and import
        const importSuccess = await page.evaluate((data) => {
            window.editor.layerManager.layers.forEach(layer => layer.clear());
            return window.editor.layerManager.importRLEData(data, window.configManager);
        }, exported);

        expect(importSuccess).toBe(true);

        const stats = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return layers.map(layer => ({
                name: layer.name,
                tileCount: layer.tileData.size
            }));
        });

        console.log(`\n=== Import Statistics ===`);
        for (const stat of stats) {
            console.log(`${stat.name}: ${stat.tileCount.toLocaleString()} tiles`);
            expect(stat.tileCount).toBeGreaterThan(0);
        }

        console.log('✓ Full map imports from base64 format');
    });

    test('should compare file sizes: old array vs new base64', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const comparison = await page.evaluate(() => {
            // Export in both formats
            const arrayFormat = window.editor.layerManager.exportRLEData('Test', 'Test', 12345);
            const base64Format = window.editor.layerManager.exportRLEDataBase64('Test', 'Test', 12345);

            const arraySize = JSON.stringify(arrayFormat).length;
            const base64Size = JSON.stringify(base64Format).length;

            return {
                arraySize,
                base64Size,
                savedBytes: arraySize - base64Size,
                reductionPercent: ((1 - base64Size / arraySize) * 100).toFixed(1)
            };
        });

        console.log(`\n=== Format Comparison ===`);
        console.log(`Array format:  ${comparison.arraySize.toLocaleString()} bytes (${(comparison.arraySize / 1024).toFixed(2)} KB)`);
        console.log(`Base64 format: ${comparison.base64Size.toLocaleString()} bytes (${(comparison.base64Size / 1024).toFixed(2)} KB)`);
        console.log(`Saved:         ${comparison.savedBytes.toLocaleString()} bytes (${(comparison.savedBytes / 1024).toFixed(2)} KB)`);
        console.log(`Reduction:     ${comparison.reductionPercent}%`);

        // Base64 should be smaller
        expect(comparison.base64Size).toBeLessThan(comparison.arraySize);
        expect(parseFloat(comparison.reductionPercent)).toBeGreaterThan(20); // At least 20% smaller

        console.log('✓ Base64 format is significantly more compact');
    });

    test('should handle backward compatibility with old array format', async () => {
        // Create data in old array format
        const oldFormatData = {
            metadata: {
                name: 'OldFormat',
                description: 'Test',
                world_size: 256,
                maze_generation_seed: 12345
            },
            layers: [
                {
                    layer_type: 'Floor',
                    palette: ['#000000', '#00ff00', '#0000ff'],
                    color_data: [
                        [0, 50000],
                        [1, 10000],
                        [2, 5536]
                    ]
                }
            ]
        };

        const importSuccess = await page.evaluate((data) => {
            return window.editor.layerManager.importRLEData(data, window.configManager);
        }, oldFormatData);

        expect(importSuccess).toBe(true);

        const tileCount = await page.evaluate(() => {
            return window.editor.layerManager.layers[0].tileData.size;
        });

        console.log(`✓ Imported ${tileCount.toLocaleString()} tiles from old array format`);
        expect(tileCount).toBeGreaterThan(0);
    });
});
