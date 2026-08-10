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

        const layerStats = await page.evaluate(() => {
            return window.editor.layerManager.layers.map(layer => ({
                name: layer.name,
                layerType: layer.layerType,
                tileCount: layer.tileData.size,
                gridSize: layer.width * layer.height,
                // `tileCount > 0` is true before generation too (layers start out
                // completely filled with their default colour), so the meaningful
                // signal is how many DISTINCT colours ended up on the layer.
                distinctColors: new Set(layer.tileData.values()).size
            }));
        });

        for (const stat of layerStats) {
            expect(stat.tileCount, `${stat.name} tile count`).toBe(stat.gridSize);
        }

        // The height-offset layers are intentionally left at a single default value;
        // every content layer must actually get terrain.
        const contentLayers = layerStats.filter(s => !s.layerType.endsWith('HeightOffset'));
        expect(contentLayers.length).toBe(6);
        for (const stat of contentLayers) {
            expect(stat.distinctColors, `${stat.name} distinct colours`).toBeGreaterThan(1);
        }
    });

    test('every colour it paints is a real biome colour, and it uses several', async () => {
        // The old assertion was "> 40% of all 24 biome colours appear on the Floor
        // layer". generateTestMap() seeds itself from Math.random(), and the Floor
        // generator only draws from a subset of biomes, so that threshold sat right on
        // the edge — an observed run produced 9/24 = 37.5% and failed for no real
        // reason. Assert what the generator actually guarantees instead: the colours it
        // uses are valid biome colours, and there is genuine variety.
        const colorUsage = await page.evaluate(() => {
            window.generateTestMap();

            const biomeColors = new Set();
            for (const [name, tileset] of Object.entries(window.configManager.getTilesets())) {
                if ((tileset.category === 'Biomes' || tileset.category === 'POI') && name !== 'Biome_None') {
                    biomeColors.add(tileset.color.toLowerCase());
                }
            }

            const floorLayer = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');
            const usedColors = Array.from(new Set(floorLayer.tileData.values()));

            return {
                totalAvailable: biomeColors.size,
                used: usedColors,
                notABiomeColor: usedColors.filter(c => !biomeColors.has(c.toLowerCase()))
            };
        });

        // Any colour that is not a configured biome would export as an unresolvable
        // palette entry — that is the failure worth catching.
        expect(colorUsage.notABiomeColor, JSON.stringify(colorUsage.notABiomeColor)).toEqual([]);
        expect(colorUsage.used.length).toBeGreaterThanOrEqual(4);
        expect(colorUsage.used.length).toBeLessThanOrEqual(colorUsage.totalAvailable);
    });

    test('should generate terrain within reasonable time', async () => {
        // generateTestMap() is synchronous, so time it inside the page rather than
        // measuring a waitForFunction round-trip. The old version waited for
        // `floorLayer.tileData.size > 0`, which is already true before generation
        // starts (layers are pre-filled), so it timed a condition that never blocked.
        const measurement = await page.evaluate(() => {
            const started = performance.now();
            window.generateTestMap();
            const elapsed = performance.now() - started;

            const floor = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');
            return {
                elapsed,
                gridSize: window.editor.layerManager.width,
                distinctColors: new Set(floor.tileData.values()).size
            };
        });

        // Confirms the work actually happened inside the interval we timed.
        expect(measurement.distinctColors).toBeGreaterThan(1);
        expect(measurement.gridSize).toBe(256);
        expect(measurement.elapsed).toBeLessThan(8000);
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
                    tileCount: layer.tileData.size,
                    distinctColors: new Set(layer.tileData.values()).size
                };
            }

            return types;
        });

        // Unconditional: the old loop wrapped its assertion in `if (layerTypes[type])`,
        // so a layer disappearing from the config — exactly the regression this test
        // exists to catch — logged a warning and passed.
        const expectedTypes = ['floor', 'underground', 'sky', 'height', 'difficulty', 'hazard'];

        for (const type of expectedTypes) {
            expect(layerTypes[type], `${type} layer is missing entirely`).toBeDefined();
            expect(layerTypes[type].tileCount, `${type} tile count`).toBeGreaterThan(0);
            expect(layerTypes[type].distinctColors, `${type} distinct colours`).toBeGreaterThan(1);
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
