/**
 * Height Lattice Test - Verifies height-based region separation
 *
 * This test creates artificial height patterns (lattices) to verify that the
 * flood fill algorithm correctly separates regions based on height differences.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Maze Height Lattice Tests', () => {

    test('vertical stripes pattern creates separate column regions with maxHeightDiff=1', async ({ page }) => {
        // Load the maze algorithms script
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        // Listen to console logs from the page
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        const result = await page.evaluate(() => {
            const size = 16;
            const totalTiles = size * size;

            // Create vertical stripes height pattern:
            // Columns alternate between height 0 and height 20
            // With maxHeightDiff=1, these should create 2 large regions (not connect across boundaries)
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = y * size + x;
                    // Vertical stripes: even columns = 0, odd columns = 20
                    heightMap[index] = (x % 2 === 0) ? 0 : 20;
                    biomeMap[index] = 'Biome_Grass';
                }
            }

            // Run flood fill with maxHeightDiff=1
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(['Biome_Blocked']),
                maxHeightDiff: 1
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                largestRegion: results.largestRegionSize,
                smallestRegion: results.smallestRegionSize,
                totalTiles: totalTiles,
                regionSizes: results.regions.map(r => r.regionSize).sort((a, b) => b - a).slice(0, 5)
            };
        });

        console.log('Vertical stripes pattern results:', result);

        // With vertical stripes alternating 0/20 and maxHeightDiff=1, we should get 16 regions
        // (one for each column, since columns don't connect horizontally)
        expect(result.regionCount).toBe(16);
        expect(result.tilesInRegions).toBe(result.totalTiles);

        // Each region should be one column: 16 tiles (size=16 height, 1 tile wide)
        expect(result.largestRegion).toBe(16);
        expect(result.smallestRegion).toBe(16);
    });

    test('height gradient creates multiple regions with maxHeightDiff=10', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 32;
            const totalTiles = size * size;

            // Create height gradient: height increases in steps from left to right
            // Each 2 columns share a height, heights jump by 20 between groups
            // With maxHeightDiff=10, adjacent height groups should NOT connect
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            const groupWidth = 2; // 2 columns per height group
            const heightStep = 20; // Height jumps by 20 (> maxHeightDiff=10)

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = y * size + x;
                    const group = Math.floor(x / groupWidth);
                    heightMap[index] = group * heightStep;
                    biomeMap[index] = 'Biome_Grass';
                }
            }

            // Run flood fill with maxHeightDiff=10
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(['Biome_Blocked']),
                maxHeightDiff: 10
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            // Count tiles at different heights (sample every 10 pixels)
            const heightDistribution = {};
            for (let i = 0; i < totalTiles; i++) {
                const h = heightMap[i];
                const bucket = Math.floor(h / 10) * 10;
                heightDistribution[bucket] = (heightDistribution[bucket] || 0) + 1;
            }

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                largestRegion: results.largestRegionSize,
                totalTiles: totalTiles,
                heightDistribution: heightDistribution,
                regionSizes: results.regions.map(r => r.regionSize).sort((a, b) => b - a).slice(0, 10)
            };
        });

        console.log('Height gradient results:', result);
        console.log('Height distribution:', result.heightDistribution);

        // With 32 columns, groupWidth=2, heightStep=20, maxHeightDiff=10:
        // - 16 groups total (32/2)
        // - Heights: 0, 20, 40, 60... (differ by 20 > 10)
        // - Should create 16 separate regions
        expect(result.regionCount).toBe(16);
        expect(result.tilesInRegions).toBe(result.totalTiles);

        // Each region should be 2 columns * 32 rows = 64 tiles
        expect(result.largestRegion).toBe(64);
    });

    test('height blocks pattern creates isolated square regions', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 16;
            const totalTiles = size * size;

            // Create 4x4 grid of height blocks
            // Each 4x4 block has a different height (0, 50, 100, 150)
            // With maxHeightDiff=1, each block should be a separate region
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            const blockSize = 4;
            const heights = [0, 50, 100, 150];

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = y * size + x;
                    const blockX = Math.floor(x / blockSize);
                    const blockY = Math.floor(y / blockSize);
                    const heightIndex = (blockX + blockY * 4) % heights.length;
                    heightMap[index] = heights[heightIndex];
                    biomeMap[index] = 'Biome_Grass';
                }
            }

            // Run flood fill with maxHeightDiff=1
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(['Biome_Blocked']),
                maxHeightDiff: 1
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                largestRegion: results.largestRegionSize,
                smallestRegion: results.smallestRegionSize,
                totalTiles: totalTiles,
                regionSizes: results.regions.map(r => r.regionSize).sort((a, b) => b - a)
            };
        });

        console.log('Height blocks results:', result);

        // With 16x16 grid, 4x4 blocks, heights [0, 50, 100, 150], maxHeightDiff=1:
        // - Blocks with same height connect when adjacent
        // - Pattern creates 4 regions (one per unique height value)
        // - Each region = 4 blocks × 16 tiles/block = 64 tiles
        expect(result.regionCount).toBe(4);
        expect(result.tilesInRegions).toBe(result.totalTiles);

        const expectedRegionSize = 64; // 4 blocks of 16 tiles each
        const sizeCounts = {};
        result.regionSizes.forEach(size => {
            sizeCounts[size] = (sizeCounts[size] || 0) + 1;
        });
        console.log('Region size distribution:', sizeCounts);

        // All regions should be 64 tiles (4 blocks each)
        expect(result.largestRegion).toBe(expectedRegionSize);
        expect(result.smallestRegion).toBe(expectedRegionSize);
    });

    test('staircase height pattern with maxHeightDiff=5 creates stepped regions', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 32;
            const totalTiles = size * size;

            // Create staircase pattern: height increases in steps of 10
            // Each 4 columns share the same height
            // With maxHeightDiff=5, adjacent steps should NOT connect
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            const stepWidth = 4;
            const stepHeight = 10;

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = y * size + x;
                    const step = Math.floor(x / stepWidth);
                    heightMap[index] = step * stepHeight;
                    biomeMap[index] = 'Biome_Grass';
                }
            }

            // Run flood fill with maxHeightDiff=5
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(['Biome_Blocked']),
                maxHeightDiff: 5
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                largestRegion: results.largestRegionSize,
                totalTiles: totalTiles,
                regionSizes: results.regions.map(r => r.regionSize).sort((a, b) => b - a)
            };
        });

        console.log('Staircase pattern results:', result);

        // With 32 columns, stepWidth=4, and stepHeight=10:
        // - 8 steps total (32/4)
        // - maxHeightDiff=5 means steps differ by 10 which is > 5
        // - Should get 8 separate vertical bands
        expect(result.regionCount).toBeGreaterThanOrEqual(8);
        expect(result.tilesInRegions).toBe(result.totalTiles);

        // Each region should be a vertical band of 4 columns * 32 rows = 128 tiles
        const expectedRegionSize = 4 * 32;
        expect(result.largestRegion).toBeGreaterThanOrEqual(expectedRegionSize * 0.9);
        expect(result.largestRegion).toBeLessThanOrEqual(expectedRegionSize * 1.1);
    });

    test('single height value creates one massive region', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 32;
            const totalTiles = size * size;

            // All tiles have the same height
            // Should create exactly 1 region
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            for (let i = 0; i < totalTiles; i++) {
                heightMap[i] = 64; // Same height for all
                biomeMap[i] = 'Biome_Grass';
            }

            // Run flood fill with maxHeightDiff=1
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(['Biome_Blocked']),
                maxHeightDiff: 1
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                largestRegion: results.largestRegionSize,
                totalTiles: totalTiles
            };
        });

        console.log('Single height results:', result);

        // All tiles same height should create exactly 1 region
        expect(result.regionCount).toBe(1);
        expect(result.tilesInRegions).toBe(result.totalTiles);
        expect(result.largestRegion).toBe(result.totalTiles);
    });

    test('extreme height differences are properly rejected', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 10;
            const totalTiles = size * size;

            // Create two halves: left side height=0, right side height=255
            // With maxHeightDiff=1, these should NEVER connect
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = y * size + x;
                    heightMap[index] = x < size / 2 ? 0 : 255;
                    biomeMap[index] = 'Biome_Grass';
                }
            }

            // Run flood fill with maxHeightDiff=1
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(['Biome_Blocked']),
                maxHeightDiff: 1
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                largestRegion: results.largestRegionSize,
                totalTiles: totalTiles,
                regionSizes: results.regions.map(r => r.regionSize).sort((a, b) => b - a)
            };
        });

        console.log('Extreme height difference results:', result);

        // Should create exactly 2 regions (left and right halves)
        expect(result.regionCount).toBe(2);
        expect(result.tilesInRegions).toBe(result.totalTiles);

        // Each region should be half the tiles (50 tiles for 10x10=100 total)
        expect(result.largestRegion).toBe(50);
        expect(result.regionSizes[0]).toBe(50);
        expect(result.regionSizes[1]).toBe(50);
    });

    test('world edges are treated as borders when enabled', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 10;
            const totalTiles = size * size;

            // All tiles have same height and biome
            // Without edge borders: 1 massive region (100 tiles)
            // With edge borders: 1 region excluding the outer ring (64 tiles)
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            for (let i = 0; i < totalTiles; i++) {
                heightMap[i] = 64;
                biomeMap[i] = 'Biome_Grass';
            }

            // Run flood fill WITH edge borders
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(),
                maxHeightDiff: 10,
                treatEdgesAsBorders: true
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            // Count edge tiles
            let edgeTileCount = 0;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
                        edgeTileCount++;
                    }
                }
            }

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                borderTiles: results.borderTiles,
                largestRegion: results.largestRegionSize,
                totalTiles: totalTiles,
                edgeTileCount: edgeTileCount,
                innerTileCount: totalTiles - edgeTileCount
            };
        });

        console.log('Edge borders test results:', result);

        // With 10x10 grid:
        // - Edge tiles: 36 (outer ring)
        // - Inner tiles: 64 (8×8 center)
        expect(result.edgeTileCount).toBe(36);
        expect(result.innerTileCount).toBe(64);

        // Should get 1 region with only the inner tiles
        expect(result.regionCount).toBe(1);
        expect(result.largestRegion).toBe(64);
        expect(result.tilesInRegions).toBe(64);
        expect(result.borderTiles).toBe(36);
    });

    test('world edges are NOT borders when disabled', async ({ page }) => {
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: scriptContent });

        const result = await page.evaluate(() => {
            const size = 10;
            const totalTiles = size * size;

            // All tiles have same height and biome
            const heightMap = new Uint8Array(totalTiles);
            const biomeMap = new Array(totalTiles);

            for (let i = 0; i < totalTiles; i++) {
                heightMap[i] = 64;
                biomeMap[i] = 'Biome_Grass';
            }

            // Run flood fill WITHOUT edge borders
            const engine = new FloodFillEngine();
            const settings = {
                borderBiomes: new Set(),
                maxHeightDiff: 10,
                treatEdgesAsBorders: false
            };

            const results = engine.performFloodFill(heightMap, biomeMap, settings, size);

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                borderTiles: results.borderTiles,
                largestRegion: results.largestRegionSize,
                totalTiles: totalTiles
            };
        });

        console.log('No edge borders test results:', result);

        // Without edge borders, all tiles should connect
        expect(result.regionCount).toBe(1);
        expect(result.largestRegion).toBe(100);
        expect(result.tilesInRegions).toBe(100);
        expect(result.borderTiles).toBe(0);
    });
});
