/**
 * Maze Algorithms Tests — FloodFillEngine and MazeGenerator
 *
 * Direction convention (js/maze-algorithms.js, js/maze-visualizer.js, and the
 * runtime's `index = North * width + East` layout all agree):
 *
 *   bit 0 = North = index + worldWidth   (LARGER grid Y — bottom-left origin)
 *   bit 1 = South = index - worldWidth
 *   bit 2 = East  = index + 1
 *   bit 3 = West  = index - 1
 *
 * Every MazeGenerator test in the old version of this file walked North as
 * `y - 1`, i.e. the opposite of what the generator emits. That made the
 * connectivity and bidirectionality tests fail for the wrong reason, and made
 * "handles irregular regions" assert something the code never claimed. The three
 * helpers below existed at the top of the old file but were never called once —
 * each test inlined its own copy of the walk, which is how the convention drifted.
 */

const { test, expect } = require('./test-base');
const path = require('path');

// ============================================================================
// HELPERS — one implementation, used by every test in this file.
// ============================================================================

const OPPOSITE = { 0: 1, 1: 0, 2: 3, 3: 2 };

/** Neighbour world index in `dir`, or null if it leaves the grid. */
function neighbourIndex(index, dir, worldWidth, worldHeight) {
    const x = index % worldWidth;
    const y = Math.floor(index / worldWidth);
    let nx = x, ny = y;
    switch (dir) {
        case 0: ny += 1; break; // North
        case 1: ny -= 1; break; // South
        case 2: nx += 1; break; // East
        case 3: nx -= 1; break; // West
    }
    if (nx < 0 || nx >= worldWidth || ny < 0 || ny >= worldHeight) return null;
    return ny * worldWidth + nx;
}

/** Every set bit must have a matching reverse bit on the neighbour, in bounds. */
function findNonBidirectional(mazeData, worldWidth, worldHeight) {
    const problems = [];
    for (let index = 0; index < mazeData.length; index++) {
        const connections = mazeData[index];
        if (connections === 0) continue;
        for (let dir = 0; dir < 4; dir++) {
            if (!(connections & (1 << dir))) continue;
            const neighbour = neighbourIndex(index, dir, worldWidth, worldHeight);
            if (neighbour === null) {
                problems.push({ index, dir, kind: 'connection leaves the grid' });
                continue;
            }
            if (!(mazeData[neighbour] & (1 << OPPOSITE[dir]))) {
                problems.push({ index, dir, neighbour, kind: 'neighbour has no reverse connection' });
            }
        }
    }
    return problems;
}

/** BFS from the first region tile; returns how many region tiles were reached. */
function countReachable(regionIndices, mazeData, worldWidth, worldHeight) {
    if (regionIndices.length === 0) return 0;
    const inRegion = new Set(regionIndices);
    const visited = new Set([regionIndices[0]]);
    const queue = [regionIndices[0]];

    while (queue.length > 0) {
        const index = queue.shift();
        const connections = mazeData[index];
        for (let dir = 0; dir < 4; dir++) {
            if (!(connections & (1 << dir))) continue;
            const neighbour = neighbourIndex(index, dir, worldWidth, worldHeight);
            if (neighbour === null || !inRegion.has(neighbour) || visited.has(neighbour)) continue;
            visited.add(neighbour);
            queue.push(neighbour);
        }
    }
    return visited.size;
}

/** Any connection pointing at a tile outside the region. */
function findEscapingConnections(regionIndices, mazeData, worldWidth, worldHeight) {
    const inRegion = new Set(regionIndices);
    const escaping = [];
    for (const index of regionIndices) {
        const connections = mazeData[index];
        for (let dir = 0; dir < 4; dir++) {
            if (!(connections & (1 << dir))) continue;
            const neighbour = neighbourIndex(index, dir, worldWidth, worldHeight);
            if (neighbour === null || !inRegion.has(neighbour)) {
                escaping.push({ index, dir, neighbour });
            }
        }
    }
    return escaping;
}

/** Count undirected edges by counting only North and East bits. */
function countEdges(regionIndices, mazeData) {
    let edges = 0;
    for (const index of regionIndices) {
        if (mazeData[index] & 1) edges++; // North
        if (mazeData[index] & 4) edges++; // East
    }
    return edges;
}

/** Run generateMaze in the page and bring the bytes back as a plain array. */
async function generateMaze(page, regionIndices, worldWidth, worldHeight, seed) {
    return await page.evaluate(({ region, w, h, s }) => {
        const { MazeGenerator } = window.MazeAlgorithms;
        return Array.from(new MazeGenerator().generateMaze(region, w, h, s));
    }, { region: regionIndices, w: worldWidth, h: worldHeight, s: seed });
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Maze Algorithms', () => {
    test.beforeEach(async ({ page }) => {
        await page.setContent('<!DOCTYPE html><html><head><title>Maze</title></head><body></body></html>');
        await page.addScriptTag({ path: path.resolve(__dirname, '..', 'js', 'maze-algorithms.js') });
        await page.waitForFunction(() => window.MazeAlgorithms !== undefined);
    });

    // ========================================================================
    // FLOOD FILL ENGINE
    // ========================================================================

    test.describe('FloodFillEngine', () => {
        async function floodFill(page, heightMap, biomeMap, settings, worldWidth) {
            return await page.evaluate(({ hm, bm, st, w }) => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                return new FloodFillEngine().performFloodFill(
                    new Uint8Array(hm), bm,
                    { borderBiomes: new Set(st.borderBiomes), maxHeightDiff: st.maxHeightDiff,
                      treatEdgesAsBorders: st.treatEdgesAsBorders },
                    w
                );
            }, { hm: heightMap, bm: biomeMap, st: settings, w: worldWidth });
        }

        test('single open region (no borders)', async ({ page }) => {
            const result = await floodFill(page,
                [100, 100, 100, 100, 100, 100, 100, 100, 100],
                Array(9).fill('Grass'),
                { borderBiomes: ['DeepWater', 'ShallowWater'], maxHeightDiff: 10 }, 3);

            expect(result.regions.length).toBe(1);
            expect(result.tilesInRegions).toBe(9);
            expect(result.borderTiles).toBe(0);
            expect(result.largestRegionSize).toBe(9);
            expect(result.smallestRegionSize).toBe(9);
            expect(result.regions[0].regionSize).toBe(9);
        });

        test('vertical wall creates 2 regions', async ({ page }) => {
            const result = await floodFill(page,
                [100, 100, 0, 100, 100,
                 100, 100, 0, 100, 100,
                 100, 100, 0, 100, 100],
                ['Grass', 'Grass', 'DeepWater', 'Grass', 'Grass',
                 'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass',
                 'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass'],
                { borderBiomes: ['DeepWater', 'ShallowWater'], maxHeightDiff: 10 }, 5);

            expect(result.regions.length).toBe(2);
            expect(result.tilesInRegions).toBe(12);
            expect(result.borderTiles).toBe(3);
            expect(result.largestRegionSize).toBe(6);
            expect(result.smallestRegionSize).toBe(6);
        });

        test('height constraints separate regions', async ({ page }) => {
            const result = await floodFill(page,
                [100, 100, 150, 150,
                 100, 100, 150, 150],
                Array(8).fill('Grass'),
                { borderBiomes: ['DeepWater'], maxHeightDiff: 10 }, 4);

            expect(result.regions.length).toBe(2);
            expect(result.tilesInRegions).toBe(8);
            expect(result.borderTiles).toBe(0);
            expect(result.largestRegionSize).toBe(4);
            expect(result.smallestRegionSize).toBe(4);
        });

        test('border biomes are correctly excluded', async ({ page }) => {
            const result = await floodFill(page,
                [0, 0, 0, 0, 100, 0, 0, 0, 0],
                ['DeepWater', 'DeepWater', 'DeepWater',
                 'DeepWater', 'Grass', 'DeepWater',
                 'DeepWater', 'ShallowWater', 'DeepWater'],
                { borderBiomes: ['DeepWater', 'ShallowWater'], maxHeightDiff: 10 }, 3);

            expect(result.regions.length).toBe(1);
            expect(result.tilesInRegions).toBe(1);
            expect(result.borderTiles).toBe(8);
            expect(result.largestRegionSize).toBe(1);
            expect(result.smallestRegionSize).toBe(1);
        });

        test('statistics are accurate and account for every tile', async ({ page }) => {
            const result = await floodFill(page,
                [100, 100, 0, 150, 150, 150,
                 100, 100, 0, 150, 150, 150,
                 100, 100, 0, 0, 0, 0],
                ['Grass', 'Grass', 'DeepWater', 'Grass', 'Grass', 'Grass',
                 'Grass', 'Grass', 'DeepWater', 'Grass', 'Grass', 'Grass',
                 'Grass', 'Grass', 'DeepWater', 'DeepWater', 'DeepWater', 'DeepWater'],
                { borderBiomes: ['DeepWater'], maxHeightDiff: 10 }, 6);

            expect(result.regions.length).toBe(2);
            expect(result.tilesInRegions).toBe(12);
            expect(result.borderTiles).toBe(6);
            expect(result.largestRegionSize).toBe(6);
            expect(result.smallestRegionSize).toBe(6);
            expect(result.tilesInRegions + result.borderTiles).toBe(18);

            // Region tile lists must partition the non-border tiles exactly.
            const all = result.regions.flatMap(r => r.tileIndices);
            expect(new Set(all).size).toBe(all.length);
            expect(all.length).toBe(result.tilesInRegions);
        });

        test('handles empty grid', async ({ page }) => {
            const result = await floodFill(page, [], [],
                { borderBiomes: ['DeepWater'], maxHeightDiff: 10 }, 0);

            expect(result.regions.length).toBe(0);
            expect(result.tilesInRegions).toBe(0);
            expect(result.borderTiles).toBe(0);
            expect(result.largestRegionSize).toBe(0);
            expect(result.smallestRegionSize).toBe(0);
        });
    });

    // ========================================================================
    // MAZE GENERATOR
    // ========================================================================

    test.describe('MazeGenerator', () => {
        test('every tile in a rectangular region is reachable', async ({ page }) => {
            const region = Array.from({ length: 16 }, (_, i) => i);
            const maze = await generateMaze(page, region, 4, 4, 12345);

            expect(countReachable(region, maze, 4, 4)).toBe(16);
        });

        test('connections are bidirectional and stay inside the grid', async ({ page }) => {
            const region = Array.from({ length: 25 }, (_, i) => i);
            const maze = await generateMaze(page, region, 5, 5, 54321);

            const problems = findNonBidirectional(maze, 5, 5);
            expect(problems, JSON.stringify(problems)).toEqual([]);
        });

        test('bit 0 is the +worldWidth neighbour and bit 2 is the +1 neighbour', async ({ page }) => {
            // Pins the actual encoding rather than, as the old test did, checking that
            // indices the test itself computed happened to land inside the grid.
            const region = [0, 1, 2, 3]; // full 2x2
            const maze = await generateMaze(page, region, 2, 2, 11111);

            for (const index of region) {
                const x = index % 2;
                const y = Math.floor(index / 2);
                if (maze[index] & 1) {
                    expect(y + 1, `tile ${index} claims North`).toBeLessThan(2);
                    expect(maze[index + 2] & 2, `North partner of ${index}`).toBeTruthy();
                }
                if (maze[index] & 2) {
                    expect(y - 1, `tile ${index} claims South`).toBeGreaterThanOrEqual(0);
                    expect(maze[index - 2] & 1, `South partner of ${index}`).toBeTruthy();
                }
                if (maze[index] & 4) {
                    expect(x + 1, `tile ${index} claims East`).toBeLessThan(2);
                    expect(maze[index + 1] & 8, `East partner of ${index}`).toBeTruthy();
                }
                if (maze[index] & 8) {
                    expect(x - 1, `tile ${index} claims West`).toBeGreaterThanOrEqual(0);
                    expect(maze[index - 1] & 4, `West partner of ${index}`).toBeTruthy();
                }
                // A 4-bit encoding must never set bits above 15.
                expect(maze[index]).toBeLessThanOrEqual(15);
            }
        });

        test('same seed produces identical mazes', async ({ page }) => {
            const region = Array.from({ length: 16 }, (_, i) => i);
            const first = await generateMaze(page, region, 4, 4, 99999);
            const second = await generateMaze(page, region, 4, 4, 99999);

            expect(second).toEqual(first);
        });

        test('different seeds produce different mazes', async ({ page }) => {
            const region = Array.from({ length: 25 }, (_, i) => i);
            const first = await generateMaze(page, region, 5, 5, 11111);
            const second = await generateMaze(page, region, 5, 5, 22222);

            expect(second).not.toEqual(first);
        });

        test('handles irregular regions (L-shaped)', async ({ page }) => {
            // 5x5 grid, bottom-left origin:
            //   row 3: X X X . .
            //   row 2: X . . . .
            //   row 1: X . . . .
            //   row 0: X X X . .
            const region = [0, 1, 2, 5, 10, 15, 16, 17];
            const maze = await generateMaze(page, region, 5, 5, 77777);

            expect(countReachable(region, maze, 5, 5)).toBe(region.length);
            expect(findEscapingConnections(region, maze, 5, 5)).toEqual([]);
            expect(findNonBidirectional(maze, 5, 5)).toEqual([]);
        });

        test('handles irregular regions (T-shaped)', async ({ page }) => {
            const region = [0, 1, 2, 3, 4, 7, 12, 17];
            const maze = await generateMaze(page, region, 5, 5, 88888);

            expect(countReachable(region, maze, 5, 5)).toBe(region.length);
            expect(findEscapingConnections(region, maze, 5, 5)).toEqual([]);
            expect(findNonBidirectional(maze, 5, 5)).toEqual([]);
        });

        test('generates a perfect maze (N-1 edges, no cycles)', async ({ page }) => {
            const region = Array.from({ length: 20 }, (_, i) => i);
            const maze = await generateMaze(page, region, 5, 4, 33333);

            // Spanning tree: connected AND exactly N-1 edges means acyclic.
            expect(countReachable(region, maze, 5, 4)).toBe(20);
            expect(countEdges(region, maze)).toBe(19);
        });

        test('handles single tile region', async ({ page }) => {
            const maze = await generateMaze(page, [5], 10, 10, 12345);

            expect(maze[5]).toBe(0);
            expect(maze.filter(v => v !== 0)).toEqual([]);
        });

        test('rejects an empty region rather than returning an empty maze', async ({ page }) => {
            const outcome = await page.evaluate(() => {
                try {
                    new window.MazeAlgorithms.MazeGenerator().generateMaze([], 4, 4, 1);
                    return { threw: false };
                } catch (err) {
                    return { threw: true, message: err.message };
                }
            });

            expect(outcome.threw).toBe(true);
            expect(outcome.message).toMatch(/non-empty/i);
        });
    });

    // ========================================================================
    // INTEGRATION
    // ========================================================================

    test.describe('Integration: Flood Fill + Maze Generation', () => {
        test('complete workflow: flood fill then maze generation', async ({ page }) => {
            const result = await page.evaluate(() => {
                const { FloodFillEngine } = window.MazeAlgorithms;
                const heightMap = new Uint8Array([
                    100, 100, 100, 0, 150, 150,
                    100, 100, 100, 0, 150, 150,
                    100, 100, 100, 0, 150, 150
                ]);
                const biomeMap = [
                    'Grass', 'Grass', 'Grass', 'DeepWater', 'Mountain', 'Mountain',
                    'Grass', 'Grass', 'Grass', 'DeepWater', 'Mountain', 'Mountain',
                    'Grass', 'Grass', 'Grass', 'DeepWater', 'Mountain', 'Mountain'
                ];
                return new FloodFillEngine().performFloodFill(heightMap, biomeMap, {
                    borderBiomes: new Set(['DeepWater']), maxHeightDiff: 10
                }, 6);
            });

            expect(result.regions.length).toBe(2);
            expect(result.regions.map(r => r.regionSize).sort((a, b) => b - a)).toEqual([9, 6]);

            // Each region must produce a maze that spans exactly that region.
            for (const region of result.regions) {
                const maze = await generateMaze(page, region.tileIndices, 6, 3, 42);
                expect(countReachable(region.tileIndices, maze, 6, 3)).toBe(region.regionSize);
                expect(findEscapingConnections(region.tileIndices, maze, 6, 3)).toEqual([]);
                expect(countEdges(region.tileIndices, maze)).toBe(region.regionSize - 1);
            }
        });

        test('multiple layers each get their own spanning maze', async ({ page }) => {
            // The old version of this test called generateMaze(indices, 3, 12345) —
            // one argument short, so worldHeight became 12345 and the seed became
            // undefined. It still "passed" because it only checked connectivity within
            // a 3x3 block of a degenerate grid.
            const layers = [
                { name: 'Floor', height: 100, biome: 'Grass' },
                { name: 'Underground', height: 50, biome: 'Cave' },
                { name: 'Sky', height: 200, biome: 'Cloud' }
            ];

            for (const layer of layers) {
                const flood = await page.evaluate(({ h, b }) => {
                    const { FloodFillEngine } = window.MazeAlgorithms;
                    return new FloodFillEngine().performFloodFill(
                        new Uint8Array(Array(9).fill(h)), Array(9).fill(b),
                        { borderBiomes: new Set(['DeepWater']), maxHeightDiff: 10 }, 3
                    );
                }, { h: layer.height, b: layer.biome });

                expect(flood.regions.length, `${layer.name} regions`).toBe(1);

                const region = flood.regions[0].tileIndices;
                const maze = await generateMaze(page, region, 3, 3, 12345);

                expect(countReachable(region, maze, 3, 3), `${layer.name} connectivity`).toBe(9);
                expect(findNonBidirectional(maze, 3, 3), `${layer.name} bidirectionality`).toEqual([]);
                expect(countEdges(region, maze), `${layer.name} edge count`).toBe(8);
            }
        });
    });
});
