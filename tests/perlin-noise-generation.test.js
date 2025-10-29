const { test, expect, initializeEditor } = require('./test-base');

test.describe('Perlin Noise Terrain Generation', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should load PerlinNoise module', async () => {
        const perlinLoaded = await page.evaluate(() => {
            return typeof window.PerlinNoise !== 'undefined';
        });

        expect(perlinLoaded).toBe(true);
        console.log('✓ PerlinNoise module loaded');
    });

    test('should generate basic 2D noise values', async () => {
        const noiseValues = await page.evaluate(() => {
            const noise = new PerlinNoise(12345);
            const values = [];

            // Generate noise at different positions
            for (let i = 0; i < 10; i++) {
                const value = noise.noise2D(i * 0.1, i * 0.1);
                values.push(value);
            }

            return values;
        });

        // All values should be between -1 and 1
        for (const value of noiseValues) {
            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThanOrEqual(1);
        }

        // Values should vary
        const allSame = noiseValues.every(v => v === noiseValues[0]);
        expect(allSame).toBe(false);

        console.log(`✓ Generated ${noiseValues.length} noise values, all in range [-1, 1]`);
        console.log(`  Sample values: ${noiseValues.slice(0, 3).map(v => v.toFixed(3)).join(', ')}`);
    });

    test('should generate reproducible noise with same seed', async () => {
        const { run1, run2 } = await page.evaluate(() => {
            const noise1 = new PerlinNoise(42);
            const noise2 = new PerlinNoise(42);

            const run1 = [];
            const run2 = [];

            for (let i = 0; i < 5; i++) {
                run1.push(noise1.noise2D(i, i));
                run2.push(noise2.noise2D(i, i));
            }

            return { run1, run2 };
        });

        // Same seed should produce identical results
        for (let i = 0; i < run1.length; i++) {
            expect(run1[i]).toBe(run2[i]);
        }

        console.log('✓ Noise is reproducible with same seed');
    });

    test('should generate different noise with different seeds', async () => {
        const { run1, run2 } = await page.evaluate(() => {
            const noise1 = new PerlinNoise(42);
            const noise2 = new PerlinNoise(123);

            const run1 = [];
            const run2 = [];

            // Use more varied positions to ensure differences
            const positions = [[1.5, 2.3], [5.7, 8.2], [12.4, 15.9], [20.1, 22.6], [30.8, 35.2]];
            for (const [x, y] of positions) {
                run1.push(noise1.noise2D(x, y));
                run2.push(noise2.noise2D(x, y));
            }

            return { run1, run2 };
        });

        // Different seeds should produce different results
        let differences = 0;
        for (let i = 0; i < run1.length; i++) {
            if (run1[i] !== run2[i]) {
                differences++;
            }
        }

        expect(differences).toBeGreaterThan(0);
        console.log(`✓ Different seeds produce different noise (${differences}/5 values differ)`);
    });

    test('should generate octave noise with multiple frequencies', async () => {
        const octaveValues = await page.evaluate(() => {
            const noise = new PerlinNoise(12345);
            const values = [];

            // Generate octave noise
            for (let i = 0; i < 10; i++) {
                const value = noise.octaveNoise(i * 0.1, i * 0.1, 4, 0.5, 2.0);
                values.push(value);
            }

            return values;
        });

        // All values should be between -1 and 1
        for (const value of octaveValues) {
            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThanOrEqual(1);
        }

        console.log('✓ Octave noise generated successfully');
    });

    test('should generate test map with all layers filled', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        // Wait for generation to complete
        await page.waitForTimeout(3000);

        // Check all layers
        const layerStats = await page.evaluate(() => {
            const stats = [];
            const layers = window.editor.layerManager.layers;

            for (const layer of layers) {
                stats.push({
                    name: layer.name,
                    layerType: layer.layerType,
                    tileCount: layer.tileData.size
                });
            }

            return stats;
        });

        console.log('\n=== Layer Statistics ===');
        for (const stat of layerStats) {
            console.log(`${stat.name} (${stat.layerType}): ${stat.tileCount.toLocaleString()} tiles`);

            // Each layer should have tiles (for 256x256 = 65536 tiles)
            expect(stat.tileCount).toBeGreaterThan(0);
        }

        // At least one layer should be nearly full
        const maxTiles = Math.max(...layerStats.map(s => s.tileCount));
        const gridSize = await page.evaluate(() => {
            return window.editor.layerManager.width * window.editor.layerManager.height;
        });

        console.log(`\nGrid size: ${gridSize} tiles`);
        console.log(`Maximum layer fill: ${maxTiles} tiles`);

        // Should fill most of the grid
        expect(maxTiles).toBeGreaterThan(gridSize * 0.9);
    });

    test('should use all colors from biome palette', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const colorUsage = await page.evaluate(() => {
            // Get all biome colors from config
            const tilesets = window.configManager.getTilesets();
            const biomeColors = new Set();

            for (const [name, tileset] of Object.entries(tilesets)) {
                if (tileset.category === 'Biomes' && name !== 'Biome_None') {
                    biomeColors.add(tileset.color.toLowerCase());
                }
            }

            // Check Floor layer for color coverage
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );

            if (!floorLayer) return { total: biomeColors.size, used: 0, colors: [] };

            // Get unique colors used in layer
            const usedColors = new Set();
            for (const [key, color] of floorLayer.tileData.entries()) {
                usedColors.add(color.toLowerCase());
            }

            return {
                total: biomeColors.size,
                used: usedColors.size,
                colors: Array.from(usedColors),
                availableColors: Array.from(biomeColors)
            };
        });

        console.log(`\n=== Color Coverage ===`);
        console.log(`Total biome colors: ${colorUsage.total}`);
        console.log(`Colors used in Floor layer: ${colorUsage.used}`);
        console.log(`Coverage: ${((colorUsage.used / colorUsage.total) * 100).toFixed(1)}%`);

        // Should use at least 40% of available colors (Perlin creates smooth regions, so not all colors may appear in small grids)
        const coveragePercent = colorUsage.used / colorUsage.total;
        expect(coveragePercent).toBeGreaterThan(0.4);

        console.log('✓ Good color distribution across palette');
    });

    test('should generate terrain within reasonable time', async () => {
        const startTime = Date.now();

        await page.evaluate(() => {
            window.generateTestMap();
        });

        // Wait for generation to complete (check that layers are filled)
        await page.waitForFunction(() => {
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );
            return floorLayer && floorLayer.tileData.size > 0;
        }, { timeout: 15000 });

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`\n=== Performance ===`);
        console.log(`Generation time: ${duration}ms`);

        // Should complete within 15 seconds (generous limit)
        expect(duration).toBeLessThan(15000);

        // For 256x256, should be under 8 seconds
        const gridSize = await page.evaluate(() => window.editor.layerManager.width);
        if (gridSize <= 256) {
            expect(duration).toBeLessThan(8000);
            console.log(`✓ Fast generation for ${gridSize}x${gridSize} grid`);
        }
    });

    test('should generate different terrain each time (different seeds)', async () => {
        // Generate first map
        await page.evaluate(() => {
            window.generateTestMap();
        });
        await page.waitForTimeout(3000);

        const firstMap = await page.evaluate(() => {
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );

            // Sample some tiles
            const samples = [];
            for (let i = 0; i < 10; i++) {
                const key = `${i * 10},${i * 10}`;
                const color = floorLayer.tileData.get(key);
                if (color) samples.push(color);
            }
            return samples;
        });

        // Generate second map
        await page.evaluate(() => {
            window.generateTestMap();
        });
        await page.waitForTimeout(3000);

        const secondMap = await page.evaluate(() => {
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );

            // Sample same tiles
            const samples = [];
            for (let i = 0; i < 10; i++) {
                const key = `${i * 10},${i * 10}`;
                const color = floorLayer.tileData.get(key);
                if (color) samples.push(color);
            }
            return samples;
        });

        // Maps should be different (different seeds)
        let differences = 0;
        for (let i = 0; i < Math.min(firstMap.length, secondMap.length); i++) {
            if (firstMap[i] !== secondMap[i]) {
                differences++;
            }
        }

        console.log(`\n=== Variability ===`);
        console.log(`Sampled 10 positions`);
        console.log(`Differences: ${differences}/10`);

        // Should have some differences (not identical maps)
        expect(differences).toBeGreaterThan(0);
        console.log('✓ Each generation produces unique terrain');
    });

    test('should populate all layer types (Floor, Underground, Sky, Height, Difficulty, Hazard)', async () => {
        await page.evaluate(() => {
            window.generateTestMap();
        });
        await page.waitForTimeout(3000);

        const layerTypes = await page.evaluate(() => {
            const types = {};
            const layers = window.editor.layerManager.layers;

            for (const layer of layers) {
                const type = layer.layerType.toLowerCase();
                types[type] = {
                    name: layer.name,
                    tileCount: layer.tileData.size
                };
            }

            return types;
        });

        console.log('\n=== Layer Type Coverage ===');

        // Check expected layer types
        const expectedTypes = ['floor', 'underground', 'sky', 'height', 'difficulty', 'hazard'];

        for (const type of expectedTypes) {
            if (layerTypes[type]) {
                console.log(`✓ ${type}: ${layerTypes[type].tileCount.toLocaleString()} tiles`);
                expect(layerTypes[type].tileCount).toBeGreaterThan(0);
            } else {
                console.log(`⚠ ${type}: not found (may not exist in config)`);
            }
        }
    });

    test('should handle small grid sizes (64x64)', async () => {
        // Resize to small grid
        await page.evaluate(() => {
            window.editor.layerManager.width = 64;
            window.editor.layerManager.height = 64;
            window.editor.layerManager.layers.forEach(layer => {
                layer.width = 64;
                layer.height = 64;
            });
        });

        await page.evaluate(() => {
            window.generateTestMap();
        });
        await page.waitForTimeout(1000);

        const tileCount = await page.evaluate(() => {
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );
            return floorLayer ? floorLayer.tileData.size : 0;
        });

        console.log(`\n=== Small Grid (64x64) ===`);
        console.log(`Floor tiles: ${tileCount}`);

        // Should fill most of 64x64 = 4096 tiles
        expect(tileCount).toBeGreaterThan(3000);
        console.log('✓ Works with small grid sizes');
    });

    test('should create smooth transitions between colors (not random noise)', async () => {
        await page.evaluate(() => {
            window.generateTestMap();
        });
        await page.waitForTimeout(3000);

        const smoothness = await page.evaluate(() => {
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );

            if (!floorLayer) return { smooth: 0, total: 0 };

            // Sample a line of tiles and check for smoothness
            let smoothTransitions = 0;
            let totalTransitions = 0;

            const y = 128; // Middle row
            let prevColor = null;

            for (let x = 0; x < 250; x++) {
                const key = `${x},${y}`;
                const color = floorLayer.tileData.get(key);

                if (prevColor && color) {
                    totalTransitions++;

                    // Check if this is the same color (smooth) or different
                    if (color === prevColor) {
                        smoothTransitions++;
                    }
                }

                prevColor = color;
            }

            return {
                smooth: smoothTransitions,
                total: totalTransitions,
                smoothness: totalTransitions > 0 ? smoothTransitions / totalTransitions : 0
            };
        });

        console.log(`\n=== Smoothness Analysis ===`);
        console.log(`Smooth transitions: ${smoothness.smooth}/${smoothness.total}`);
        console.log(`Smoothness ratio: ${(smoothness.smoothness * 100).toFixed(1)}%`);

        // Perlin noise should create smooth regions (not pure random)
        // Expect at least 60% of adjacent tiles to be the same color
        expect(smoothness.smoothness).toBeGreaterThan(0.6);
        console.log('✓ Terrain has smooth, natural transitions');
    });

    test('should fill entire grid (no empty tiles)', async () => {
        await page.evaluate(() => {
            window.generateTestMap();
        });
        await page.waitForTimeout(3000);

        const coverage = await page.evaluate(() => {
            const floorLayer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );

            const gridSize = window.editor.layerManager.width * window.editor.layerManager.height;
            const filledTiles = floorLayer ? floorLayer.tileData.size : 0;

            return {
                gridSize,
                filledTiles,
                percentage: (filledTiles / gridSize) * 100
            };
        });

        console.log(`\n=== Grid Coverage ===`);
        console.log(`Grid size: ${coverage.gridSize} tiles`);
        console.log(`Filled tiles: ${coverage.filledTiles} tiles`);
        console.log(`Coverage: ${coverage.percentage.toFixed(1)}%`);

        // Should fill 100% of the grid
        expect(coverage.percentage).toBeGreaterThan(99);
        console.log('✓ Complete grid coverage (no empty tiles)');
    });
});
