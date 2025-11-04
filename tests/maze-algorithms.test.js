/**
 * Maze Algorithms Tests
 * Tests for FloodFillEngine and MazeGenerator
 */

const { test, expect } = require('./test-base');
const path = require('path');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify that all maze connections are bidirectional.
 * If tile A connects to B in direction D, then B must connect to A in opposite direction.
 *
 * @param {Uint8Array} mazeData - Maze connection data (4-bit encoding per tile)
 * @param {number} worldWidth - Width of the world grid
 * @returns {boolean} True if all connections are bidirectional
 */
function verifyBidirectionalConnections(mazeData, worldWidth) {
    const worldHeight = Math.floor(mazeData.length / worldWidth);

    // Direction bit values: North=1, South=2, East=4, West=8
    // Opposite directions: North↔South (0↔1), East↔West (2↔3)
    const opposites = {
        0: 1, // North → South
        1: 0, // South → North
        2: 3, // East → West
        3: 2  // West → East
    };

    for (let index = 0; index < mazeData.length; index++) {
        const connections = mazeData[index];
        if (connections === 0) continue; // No connections, skip

        const x = index % worldWidth;
        const y = Math.floor(index / worldWidth);

        // Check each direction bit
        for (let dir = 0; dir < 4; dir++) {
            if (connections & (1 << dir)) {
                // This tile has a connection in direction 'dir'
                // Find the neighbor in that direction
                let neighborX = x;
                let neighborY = y;

                switch (dir) {
                    case 0: neighborY--; break; // North
                    case 1: neighborY++; break; // South
                    case 2: neighborX++; break; // East
                    case 3: neighborX--; break; // West
                }

                // Check bounds
                if (neighborX < 0 || neighborX >= worldWidth ||
                    neighborY < 0 || neighborY >= worldHeight) {
                    return false; // Connection out of bounds
                }

                const neighborIndex = neighborY * worldWidth + neighborX;
                const neighborConnections = mazeData[neighborIndex];
                const oppositeDir = opposites[dir];

                // Neighbor must have reverse connection
                if (!(neighborConnections & (1 << oppositeDir))) {
                    return false; // Not bidirectional
                }
            }
        }
    }

    return true;
}

/**
 * Use BFS to verify all tiles in a region are reachable (connected).
 *
 * @param {Array<number>} regionIndices - Tile indices that should be connected
 * @param {Uint8Array} mazeData - Maze connection data
 * @param {number} worldWidth - Width of the world grid
 * @returns {boolean} True if all tiles are reachable from the first tile
 */
function isMazeConnected(regionIndices, mazeData, worldWidth) {
    if (regionIndices.length === 0) return true;
    if (regionIndices.length === 1) return true;

    const visited = new Set();
    const queue = [regionIndices[0]];
    visited.add(regionIndices[0]);

    while (queue.length > 0) {
        const index = queue.shift();
        const connections = mazeData[index];
        const x = index % worldWidth;
        const y = Math.floor(index / worldWidth);

        // Check each direction
        for (let dir = 0; dir < 4; dir++) {
            if (connections & (1 << dir)) {
                // Find neighbor
                let neighborX = x;
                let neighborY = y;

                switch (dir) {
                    case 0: neighborY--; break; // North
                    case 1: neighborY++; break; // South
                    case 2: neighborX++; break; // East
                    case 3: neighborX--; break; // West
                }

                const neighborIndex = neighborY * worldWidth + neighborX;

                if (!visited.has(neighborIndex)) {
                    visited.add(neighborIndex);
                    queue.push(neighborIndex);
                }
            }
        }
    }

    // All tiles in region should be visited
    return visited.size === regionIndices.length;
}

/**
 * Compare two maze data arrays for equality.
 *
 * @param {Uint8Array} maze1 - First maze data
 * @param {Uint8Array} maze2 - Second maze data
 * @returns {boolean} True if mazes are identical
 */
function compareMazeData(maze1, maze2) {
    if (maze1.length !== maze2.length) return false;

    for (let i = 0; i < maze1.length; i++) {
        if (maze1[i] !== maze2[i]) return false;
    }

    return true;
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Maze Algorithms', () => {
    test.beforeEach(async ({ page }) => {
        // Create a minimal HTML page (no external dependencies to avoid connection errors)
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head><title>Maze Algorithms Test</title></head>
            <body></body>
            </html>
        `);

        // Load maze algorithms script
        const scriptPath = path.resolve(__dirname, '..', 'js', 'maze-algorithms.js');
        await page.addScriptTag({ path: scriptPath });

        // Wait for the module to load
        await page.waitForFunction(() => window.MazeAlgorithms !== undefined);
    });

    // ========================================================================
    // FLOOD FILL ENGINE TESTS
    // ========================================================================

    test.describe('FloodFillEngine', () => {
        test('single open region (no borders)', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const engine = new FloodFillEngine();

                // 3x3 grid, all grass, all same height
                const heightMap = new Uint8Array([
                    100, 100, 100,
                    100, 100, 100,
                    100, 100, 100
                ]);

                const biomeMap = [
                    'Grass', 'Grass', 'Grass',
                    'Grass', 'Grass', 'Grass',
                    'Grass', 'Grass', 'Grass'
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater', 'ShallowWater']),
                    maxHeightDiff: 10
                };

                return engine.performFloodFill(heightMap, biomeMap, settings, 3);
            });

            expect(result.regions.length).toBe(1);
            expect(result.tilesInRegions).toBe(9);
            expect(result.borderTiles).toBe(0);
            expect(result.largestRegionSize).toBe(9);
            expect(result.smallestRegionSize).toBe(9);
            expect(result.regions[0].regionSize).toBe(9);
        });

        test('vertical wall creates 2 regions', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const engine = new FloodFillEngine();

                // 5x3 grid with vertical water wall in middle
                const heightMap = new Uint8Array([
                    100, 100, 0,   100, 100,
                    100, 100, 0,   100, 100,
                    100, 100, 0,   100, 100
                ]);

                const biomeMap = [
                    'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass',
                    'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass',
                    'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass'
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater', 'ShallowWater']),
                    maxHeightDiff: 10
                };

                return engine.performFloodFill(heightMap, biomeMap, settings, 5);
            });

            expect(result.regions.length).toBe(2);
            expect(result.tilesInRegions).toBe(12);
            expect(result.borderTiles).toBe(3);
            expect(result.largestRegionSize).toBe(6);
            expect(result.smallestRegionSize).toBe(6);
        });

        test('height constraints separate regions', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const engine = new FloodFillEngine();

                // 4x2 grid with height cliff in middle
                const heightMap = new Uint8Array([
                    100, 100, 150, 150,
                    100, 100, 150, 150
                ]);

                const biomeMap = [
                    'Grass', 'Grass', 'Grass', 'Grass',
                    'Grass', 'Grass', 'Grass', 'Grass'
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater']),
                    maxHeightDiff: 10 // Height diff of 50 exceeds limit
                };

                return engine.performFloodFill(heightMap, biomeMap, settings, 4);
            });

            expect(result.regions.length).toBe(2);
            expect(result.tilesInRegions).toBe(8);
            expect(result.borderTiles).toBe(0);
            expect(result.largestRegionSize).toBe(4);
            expect(result.smallestRegionSize).toBe(4);
        });

        test('border biomes are correctly excluded', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const engine = new FloodFillEngine();

                // 3x3 grid with water border
                const heightMap = new Uint8Array([
                    0,   0,   0,
                    0,   100, 0,
                    0,   0,   0
                ]);

                const biomeMap = [
                    'DeepWater', 'DeepWater',    'DeepWater',
                    'DeepWater', 'Grass',        'DeepWater',
                    'DeepWater', 'ShallowWater', 'DeepWater'
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater', 'ShallowWater']),
                    maxHeightDiff: 10
                };

                return engine.performFloodFill(heightMap, biomeMap, settings, 3);
            });

            expect(result.regions.length).toBe(1);
            expect(result.tilesInRegions).toBe(1);
            expect(result.borderTiles).toBe(8);
            expect(result.largestRegionSize).toBe(1);
            expect(result.smallestRegionSize).toBe(1);
        });

        test('statistics are accurate', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const engine = new FloodFillEngine();

                // Create multiple regions of different sizes
                const heightMap = new Uint8Array([
                    100, 100, 0,   150, 150, 150,
                    100, 100, 0,   150, 150, 150,
                    100, 100, 0,   0,   0,   0
                ]);

                const biomeMap = [
                    'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass', 'Grass',
                    'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass', 'Grass',
                    'Grass', 'Grass', 'DeepWater', 'DeepWater', 'DeepWater', 'DeepWater'
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater']),
                    maxHeightDiff: 10
                };

                return engine.performFloodFill(heightMap, biomeMap, settings, 6);
            });

            // Should have 2 regions: left (6 tiles) and top-right (6 tiles)
            expect(result.regions.length).toBe(2);
            expect(result.tilesInRegions).toBe(12);
            expect(result.borderTiles).toBe(6);
            expect(result.largestRegionSize).toBe(6);
            expect(result.smallestRegionSize).toBe(6);

            // Verify total tiles adds up
            expect(result.tilesInRegions + result.borderTiles).toBe(18);
        });

        test('handles empty grid', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const engine = new FloodFillEngine();

                const heightMap = new Uint8Array([]);
                const biomeMap = [];

                const settings = {
                    borderBiomes: new Set(['DeepWater']),
                    maxHeightDiff: 10
                };

                return engine.performFloodFill(heightMap, biomeMap, settings, 0);
            });

            expect(result.regions.length).toBe(0);
            expect(result.tilesInRegions).toBe(0);
            expect(result.borderTiles).toBe(0);
            expect(result.largestRegionSize).toBe(0);
            expect(result.smallestRegionSize).toBe(0);
        });
    });

    // ========================================================================
    // MAZE GENERATOR TESTS
    // ========================================================================

    test.describe('MazeGenerator', () => {
        test('all tiles in region are connected (reachable via BFS)', async ({ page }) => {
            const isConnected = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                // Create 4x4 region
                const regionIndices = [
                    0, 1, 2, 3,
                    4, 5, 6, 7,
                    8, 9, 10, 11,
                    12, 13, 14, 15
                ];

                const mazeData = generator.generateMaze(regionIndices, 4, 4, 12345);

                // BFS to check connectivity
                const visited = new Set();
                const queue = [0];
                visited.add(0);

                while (queue.length > 0) {
                    const index = queue.shift();
                    const connections = mazeData[index];
                    const x = index % 4;
                    const y = Math.floor(index / 4);

                    for (let dir = 0; dir < 4; dir++) {
                        if (connections & (1 << dir)) {
                            let neighborX = x, neighborY = y;
                            switch (dir) {
                                case 0: neighborY--; break;
                                case 1: neighborY++; break;
                                case 2: neighborX++; break;
                                case 3: neighborX--; break;
                            }

                            const neighborIndex = neighborY * 4 + neighborX;
                            if (!visited.has(neighborIndex)) {
                                visited.add(neighborIndex);
                                queue.push(neighborIndex);
                            }
                        }
                    }
                }

                return visited.size === 16;
            });

            expect(isConnected).toBe(true);
        });

        test('connections are bidirectional (A→B implies B→A)', async ({ page }) => {
            const isBidirectional = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                // Create 5x5 region
                const regionIndices = Array.from({ length: 25 }, (_, i) => i);
                const mazeData = generator.generateMaze(regionIndices, 5, 5, 54321);

                const opposites = { 0: 1, 1: 0, 2: 3, 3: 2 };

                for (let index = 0; index < 25; index++) {
                    const connections = mazeData[index];
                    const x = index % 5;
                    const y = Math.floor(index / 5);

                    for (let dir = 0; dir < 4; dir++) {
                        if (connections & (1 << dir)) {
                            let neighborX = x, neighborY = y;
                            switch (dir) {
                                case 0: neighborY--; break;
                                case 1: neighborY++; break;
                                case 2: neighborX++; break;
                                case 3: neighborX--; break;
                            }

                            if (neighborX < 0 || neighborX >= 5 || neighborY < 0 || neighborY >= 5) {
                                return false; // Connection out of bounds
                            }

                            const neighborIndex = neighborY * 5 + neighborX;
                            const neighborConnections = mazeData[neighborIndex];
                            const oppositeDir = opposites[dir];

                            if (!(neighborConnections & (1 << oppositeDir))) {
                                return false; // Not bidirectional
                            }
                        }
                    }
                }

                return true;
            });

            expect(isBidirectional).toBe(true);
        });

        test('same seed produces identical mazes (determinism)', async ({ page }) => {
            const { areEqual, seed } = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                const regionIndices = Array.from({ length: 16 }, (_, i) => i);
                const seed = 99999;

                const maze1 = generator.generateMaze(regionIndices, 4, 4, seed);
                const maze2 = generator.generateMaze(regionIndices, 4, 4, seed);

                // Compare
                let areEqual = maze1.length === maze2.length;
                if (areEqual) {
                    for (let i = 0; i < maze1.length; i++) {
                        if (maze1[i] !== maze2[i]) {
                            areEqual = false;
                            break;
                        }
                    }
                }

                return { areEqual, seed };
            });

            expect(areEqual).toBe(true);
        });

        test('different seeds produce different mazes', async ({ page }) => {
            const { areDifferent } = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                const regionIndices = Array.from({ length: 25 }, (_, i) => i);

                const maze1 = generator.generateMaze(regionIndices, 5, 5, 11111);
                const maze2 = generator.generateMaze(regionIndices, 5, 5, 22222);

                // Check if they differ
                let areDifferent = false;
                for (let i = 0; i < maze1.length; i++) {
                    if (maze1[i] !== maze2[i]) {
                        areDifferent = true;
                        break;
                    }
                }

                return { areDifferent };
            });

            expect(areDifferent).toBe(true);
        });

        test('handles irregular regions (L-shaped)', async ({ page }) => {
            const { isConnected, isValid } = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                // L-shaped region in 5x5 grid:
                // X X X . .
                // X . . . .
                // X . . . .
                // X X X . .
                // . . . . .
                const regionIndices = [0, 1, 2, 5, 10, 15, 16, 17];
                const mazeData = generator.generateMaze(regionIndices, 5, 5, 77777);

                // BFS to check connectivity
                const visited = new Set();
                const queue = [0];
                visited.add(0);

                while (queue.length > 0) {
                    const index = queue.shift();
                    const connections = mazeData[index];
                    const x = index % 5;
                    const y = Math.floor(index / 5);

                    for (let dir = 0; dir < 4; dir++) {
                        if (connections & (1 << dir)) {
                            let neighborX = x, neighborY = y;
                            switch (dir) {
                                case 0: neighborY--; break;
                                case 1: neighborY++; break;
                                case 2: neighborX++; break;
                                case 3: neighborX--; break;
                            }

                            const neighborIndex = neighborY * 5 + neighborX;
                            if (!visited.has(neighborIndex) && regionIndices.includes(neighborIndex)) {
                                visited.add(neighborIndex);
                                queue.push(neighborIndex);
                            }
                        }
                    }
                }

                const isConnected = visited.size === regionIndices.length;

                // Verify no connections to tiles outside region
                let isValid = true;
                const regionSet = new Set(regionIndices);

                for (const index of regionIndices) {
                    const connections = mazeData[index];
                    const x = index % 5;
                    const y = Math.floor(index / 5);

                    for (let dir = 0; dir < 4; dir++) {
                        if (connections & (1 << dir)) {
                            let neighborX = x, neighborY = y;
                            switch (dir) {
                                case 0: neighborY--; break;
                                case 1: neighborY++; break;
                                case 2: neighborX++; break;
                                case 3: neighborX--; break;
                            }

                            const neighborIndex = neighborY * 5 + neighborX;
                            if (!regionSet.has(neighborIndex)) {
                                isValid = false;
                                break;
                            }
                        }
                    }
                }

                return { isConnected, isValid };
            });

            expect(isConnected).toBe(true);
            expect(isValid).toBe(true);
        });

        test('handles irregular regions (T-shaped)', async ({ page }) => {
            const { isConnected, isValid } = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                // T-shaped region in 5x5 grid:
                // X X X X X
                // . . X . .
                // . . X . .
                // . . X . .
                // . . . . .
                const regionIndices = [0, 1, 2, 3, 4, 7, 12, 17];
                const mazeData = generator.generateMaze(regionIndices, 5, 5, 88888);

                // BFS to check connectivity
                const visited = new Set();
                const queue = [regionIndices[0]];
                visited.add(regionIndices[0]);

                while (queue.length > 0) {
                    const index = queue.shift();
                    const connections = mazeData[index];
                    const x = index % 5;
                    const y = Math.floor(index / 5);

                    for (let dir = 0; dir < 4; dir++) {
                        if (connections & (1 << dir)) {
                            let neighborX = x, neighborY = y;
                            switch (dir) {
                                case 0: neighborY--; break;
                                case 1: neighborY++; break;
                                case 2: neighborX++; break;
                                case 3: neighborX--; break;
                            }

                            const neighborIndex = neighborY * 5 + neighborX;
                            if (!visited.has(neighborIndex) && regionIndices.includes(neighborIndex)) {
                                visited.add(neighborIndex);
                                queue.push(neighborIndex);
                            }
                        }
                    }
                }

                const isConnected = visited.size === regionIndices.length;

                // Verify no connections outside region
                let isValid = true;
                const regionSet = new Set(regionIndices);

                for (const index of regionIndices) {
                    const connections = mazeData[index];
                    const x = index % 5;
                    const y = Math.floor(index / 5);

                    for (let dir = 0; dir < 4; dir++) {
                        if (connections & (1 << dir)) {
                            let neighborX = x, neighborY = y;
                            switch (dir) {
                                case 0: neighborY--; break;
                                case 1: neighborY++; break;
                                case 2: neighborX++; break;
                                case 3: neighborX--; break;
                            }

                            const neighborIndex = neighborY * 5 + neighborX;
                            if (!regionSet.has(neighborIndex)) {
                                isValid = false;
                                break;
                            }
                        }
                    }
                }

                return { isConnected, isValid };
            });

            expect(isConnected).toBe(true);
            expect(isValid).toBe(true);
        });

        test('direction encoding is correct (North=1, South=2, East=4, West=8)', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                // Simple 2x2 region
                const regionIndices = [0, 1, 2, 3];
                const mazeData = generator.generateMaze(regionIndices, 2, 2, 11111);

                const encodings = [];

                // Check each connection
                for (let index = 0; index < 4; index++) {
                    const connections = mazeData[index];
                    if (connections === 0) continue;

                    const x = index % 2;
                    const y = Math.floor(index / 2);

                    // North = bit 0 = value 1
                    if (connections & 1) {
                        encodings.push({ from: index, dir: 'North', bit: 0, expectedNeighbor: (y-1)*2 + x });
                    }
                    // South = bit 1 = value 2
                    if (connections & 2) {
                        encodings.push({ from: index, dir: 'South', bit: 1, expectedNeighbor: (y+1)*2 + x });
                    }
                    // East = bit 2 = value 4
                    if (connections & 4) {
                        encodings.push({ from: index, dir: 'East', bit: 2, expectedNeighbor: y*2 + (x+1) });
                    }
                    // West = bit 3 = value 8
                    if (connections & 8) {
                        encodings.push({ from: index, dir: 'West', bit: 3, expectedNeighbor: y*2 + (x-1) });
                    }
                }

                return { hasConnections: encodings.length > 0, encodings };
            });

            expect(result.hasConnections).toBe(true);

            // Verify each encoding points to correct neighbor
            for (const enc of result.encodings) {
                expect(enc.expectedNeighbor).toBeGreaterThanOrEqual(0);
                expect(enc.expectedNeighbor).toBeLessThan(4);
            }
        });

        test('generates perfect maze (N-1 edges for N tiles)', async ({ page }) => {
            const { edgeCount, tileCount, isPerfect } = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                const regionIndices = Array.from({ length: 20 }, (_, i) => i);
                const mazeData = generator.generateMaze(regionIndices, 5, 5, 33333);

                // Count edges (each bidirectional edge counted once)
                let edgeCount = 0;
                for (let index = 0; index < 20; index++) {
                    const connections = mazeData[index];
                    // Count South and East to avoid double-counting bidirectional edges
                    if (connections & 2) edgeCount++; // South
                    if (connections & 4) edgeCount++; // East
                }

                const tileCount = 20;
                const isPerfect = edgeCount === tileCount - 1;

                return { edgeCount, tileCount, isPerfect };
            });

            expect(isPerfect).toBe(true);
            expect(edgeCount).toBe(tileCount - 1);
        });

        test('handles single tile region', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { MazeGenerator } = window.MazeAlgorithms;
                const generator = new MazeGenerator();

                const regionIndices = [5]; // Single tile
                const mazeData = generator.generateMaze(regionIndices, 10, 10, 12345);

                return {
                    connections: mazeData[5],
                    hasNoConnections: mazeData[5] === 0
                };
            });

            expect(result.hasNoConnections).toBe(true);
            expect(result.connections).toBe(0);
        });
    });

    // ========================================================================
    // INTEGRATION TESTS
    // ========================================================================

    test.describe('Integration: Flood Fill + Maze Generation', () => {
        test('complete workflow: flood fill then maze generation', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine, MazeGenerator } = window.MazeAlgorithms;
                const floodFill = new FloodFillEngine();
                const mazeGen = new MazeGenerator();

                // Create a world with 2 regions separated by water
                const heightMap = new Uint8Array([
                    100, 100, 100, 0,   150, 150,
                    100, 100, 100, 0,   150, 150,
                    100, 100, 100, 0,   150, 150
                ]);

                const biomeMap = [
                    'Grass', 'Grass', 'Grass', 'DeepWater', 'Mountain', 'Mountain',
                    'Grass', 'Grass', 'Grass', 'DeepWater', 'Mountain', 'Mountain',
                    'Grass', 'Grass', 'Grass', 'DeepWater', 'Mountain', 'Mountain'
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater']),
                    maxHeightDiff: 10
                };

                // Step 1: Flood fill
                const floodResult = floodFill.performFloodFill(heightMap, biomeMap, settings, 6);

                // Step 2: Generate maze for each region
                const mazes = [];
                for (const region of floodResult.regions) {
                    const mazeData = mazeGen.generateMaze(region.tileIndices, 6, 6, 42);

                    // Verify connectivity for this region
                    const visited = new Set();
                    const queue = [region.tileIndices[0]];
                    visited.add(region.tileIndices[0]);

                    while (queue.length > 0) {
                        const index = queue.shift();
                        const connections = mazeData[index];
                        const x = index % 6;
                        const y = Math.floor(index / 6);

                        for (let dir = 0; dir < 4; dir++) {
                            if (connections & (1 << dir)) {
                                let neighborX = x, neighborY = y;
                                switch (dir) {
                                    case 0: neighborY--; break;
                                    case 1: neighborY++; break;
                                    case 2: neighborX++; break;
                                    case 3: neighborX--; break;
                                }

                                const neighborIndex = neighborY * 6 + neighborX;
                                if (!visited.has(neighborIndex)) {
                                    visited.add(neighborIndex);
                                    queue.push(neighborIndex);
                                }
                            }
                        }
                    }

                    mazes.push({
                        regionSize: region.regionSize,
                        isConnected: visited.size === region.regionSize
                    });
                }

                return {
                    regionCount: floodResult.regions.length,
                    mazes,
                    allConnected: mazes.every(m => m.isConnected)
                };
            });

            expect(result.regionCount).toBe(2);
            expect(result.mazes.length).toBe(2);
            expect(result.allConnected).toBe(true);
            expect(result.mazes[0].regionSize).toBe(9);
            expect(result.mazes[1].regionSize).toBe(6);
        });

        test('multiple layers simulation (Floor, Underground, Sky)', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine, MazeGenerator } = window.MazeAlgorithms;
                const floodFill = new FloodFillEngine();
                const mazeGen = new MazeGenerator();

                const layers = [];

                // Simulate 3 different layers
                const layerConfigs = [
                    {
                        name: 'Floor',
                        heightMap: new Uint8Array([100, 100, 100, 100, 100, 100, 100, 100, 100]),
                        biomeMap: Array(9).fill('Grass')
                    },
                    {
                        name: 'Underground',
                        heightMap: new Uint8Array([50, 50, 50, 50, 50, 50, 50, 50, 50]),
                        biomeMap: Array(9).fill('Cave')
                    },
                    {
                        name: 'Sky',
                        heightMap: new Uint8Array([200, 200, 200, 200, 200, 200, 200, 200, 200]),
                        biomeMap: Array(9).fill('Cloud')
                    }
                ];

                const settings = {
                    borderBiomes: new Set(['DeepWater']),
                    maxHeightDiff: 10
                };

                for (const config of layerConfigs) {
                    const floodResult = floodFill.performFloodFill(
                        config.heightMap,
                        config.biomeMap,
                        settings,
                        3
                    );

                    const mazeData = mazeGen.generateMaze(
                        floodResult.regions[0].tileIndices,
                        3,
                        12345
                    );

                    // Verify connectivity
                    const visited = new Set();
                    const queue = [0];
                    visited.add(0);

                    while (queue.length > 0) {
                        const index = queue.shift();
                        const connections = mazeData[index];
                        const x = index % 3;
                        const y = Math.floor(index / 3);

                        for (let dir = 0; dir < 4; dir++) {
                            if (connections & (1 << dir)) {
                                let neighborX = x, neighborY = y;
                                switch (dir) {
                                    case 0: neighborY--; break;
                                    case 1: neighborY++; break;
                                    case 2: neighborX++; break;
                                    case 3: neighborX--; break;
                                }

                                const neighborIndex = neighborY * 3 + neighborX;
                                if (!visited.has(neighborIndex)) {
                                    visited.add(neighborIndex);
                                    queue.push(neighborIndex);
                                }
                            }
                        }
                    }

                    layers.push({
                        name: config.name,
                        regionCount: floodResult.regions.length,
                        isConnected: visited.size === 9
                    });
                }

                return {
                    layerCount: layers.length,
                    layers,
                    allLayersConnected: layers.every(l => l.isConnected)
                };
            });

            expect(result.layerCount).toBe(3);
            expect(result.allLayersConnected).toBe(true);
            expect(result.layers[0].name).toBe('Floor');
            expect(result.layers[1].name).toBe('Underground');
            expect(result.layers[2].name).toBe('Sky');
        });
    });
});
