/**
 * Maze Algorithms - Flood Fill and Maze Generation
 *
 * Implementation of TSIC's flood fill region detection and Kruskal's maze generation algorithms
 * for browser-based level editor visualization.
 *
 * Technical Specification: FloodFillAndMazeGeneration.md
 *
 * @module MazeAlgorithms
 */

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

/**
 * Linear Congruential Generator for deterministic pseudo-random numbers.
 * Uses parameters from Numerical Recipes (a=1664525, c=1013904223, m=2^32).
 */
class SeededRandom {
    /**
     * @param {number} seed - Initial seed value
     */
    constructor(seed) {
        this.seed = seed >>> 0; // Ensure 32-bit unsigned integer
    }

    /**
     * Generate next random number in sequence.
     * @returns {number} Random float in range [0, 1)
     */
    next() {
        // LCG formula: seed = (a * seed + c) mod m
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return this.seed / 0x100000000; // Convert to [0, 1)
    }

    /**
     * Generate random integer in range [min, max] (inclusive).
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @returns {number} Random integer in range
     */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// ============================================================================
// COORDINATE UTILITIES
// ============================================================================

/**
 * Convert 1D world index to 2D coordinates.
 * Uses top-down coordinate system: Y=0 at TOP, Y increases DOWNWARD.
 *
 * @param {number} index - World tile index (0 to worldWidth*worldHeight-1)
 * @param {number} worldWidth - Width of the world grid
 * @returns {{x: number, y: number}} Coordinate pair
 */
function indexToCoords(index, worldWidth) {
    return {
        x: index % worldWidth,
        y: Math.floor(index / worldWidth)
    };
}

/**
 * Convert 2D coordinates to 1D world index.
 * Formula: Index = Y * WorldWidth + X
 *
 * @param {number} x - X coordinate (0-indexed)
 * @param {number} y - Y coordinate (0-indexed)
 * @param {number} worldWidth - Width of the world grid
 * @returns {number} World tile index
 */
function coordsToIndex(x, y, worldWidth) {
    return y * worldWidth + x;
}

/**
 * Get neighbor index in specified direction with bounds checking.
 * Prevents wrap-around at grid edges.
 *
 * Direction encoding (matches technical spec):
 * - 0 = North (Up, toward Y=0)
 * - 1 = South (Down, toward larger Y)
 * - 2 = East (Right, toward larger X)
 * - 3 = West (Left, toward smaller X)
 *
 * @param {number} index - Current tile index
 * @param {number} direction - Direction (0-3)
 * @param {number} worldWidth - Width of the world grid
 * @param {number} worldHeight - Height of the world grid
 * @returns {number|null} Neighbor index or null if out of bounds
 */
function getNeighborIndex(index, direction, worldWidth, worldHeight) {
    const coords = indexToCoords(index, worldWidth);
    let newX = coords.x;
    let newY = coords.y;

    switch (direction) {
        case 0: // North (up)
            newY--;
            break;
        case 1: // South (down)
            newY++;
            break;
        case 2: // East (right)
            newX++;
            break;
        case 3: // West (left)
            newX--;
            break;
        default:
            return null;
    }

    // Check bounds
    if (newX < 0 || newX >= worldWidth || newY < 0 || newY >= worldHeight) {
        return null;
    }

    return coordsToIndex(newX, newY, worldWidth);
}

/**
 * Validate if a neighbor in the given direction is valid (within bounds, no wrap-around).
 *
 * @param {number} index - Current tile index
 * @param {number} direction - Direction (0-3)
 * @param {number} worldWidth - Width of the world grid
 * @param {number} worldHeight - Height of the world grid
 * @returns {boolean} True if neighbor is valid
 */
function isValidNeighbor(index, direction, worldWidth, worldHeight) {
    // Check wrap-around conditions
    const x = index % worldWidth;

    switch (direction) {
        case 0: // North
            return index >= worldWidth; // Not in top row
        case 1: // South
            return index < worldWidth * (worldHeight - 1); // Not in bottom row
        case 2: // East
            return x < worldWidth - 1; // Not at right edge
        case 3: // West
            return x > 0; // Not at left edge
        default:
            return false;
    }
}

// ============================================================================
// FLOOD FILL ENGINE
// ============================================================================

/**
 * BFS-based flood fill algorithm for region detection.
 *
 * Identifies connected regions of traversable tiles based on:
 * - Biome boundaries (border biomes block propagation)
 * - Height constraints (max height difference between adjacent tiles)
 *
 * Technical Spec Reference: Section "Flood Fill Algorithm"
 */
class FloodFillEngine {
    /**
     * Perform flood fill region detection on a world grid.
     *
     * Algorithm steps:
     * 1. Initialize ProcessedTiles Set and Regions array
     * 2. For each tile in world:
     *    - Skip if already processed
     *    - Skip if border biome (mark as processed, count as border)
     *    - Start new region with BFS queue
     *    - Expand: check 4 neighbors (N/E/S/W), validate bounds, check height diff
     * 3. Return statistics
     *
     * @param {Uint8Array} heightMap - Height values (0-255) for each tile
     * @param {Array<string>} biomeMap - Biome name strings for each tile
     * @param {{borderBiomes: Set<string>, maxHeightDiff: number}} settings - Flood fill settings
     * @param {number} worldWidth - Width of the world grid
     * @returns {{
     *   regions: Array<{tileIndices: Array<number>, regionSize: number}>,
     *   tilesInRegions: number,
     *   borderTiles: number,
     *   largestRegionSize: number,
     *   smallestRegionSize: number
     * }} Flood fill results
     */
    performFloodFill(heightMap, biomeMap, settings, worldWidth) {
        // Validate inputs
        if (!heightMap || !biomeMap || heightMap.length !== biomeMap.length) {
            throw new Error('Invalid input: heightMap and biomeMap must have same length');
        }
        if (!settings.borderBiomes || typeof settings.maxHeightDiff !== 'number') {
            throw new Error('Invalid settings: must include borderBiomes Set and maxHeightDiff number');
        }

        const totalTiles = heightMap.length;
        const worldHeight = Math.floor(totalTiles / worldWidth);

        // Default treatEdgesAsBorders to false if not specified
        if (settings.treatEdgesAsBorders === undefined) {
            settings.treatEdgesAsBorders = false;
        }

        // DEBUG: Log settings being used
        console.log('[FloodFill] Starting flood fill with settings:');
        console.log('  - maxHeightDiff:', settings.maxHeightDiff);
        console.log('  - borderBiomes:', Array.from(settings.borderBiomes));
        console.log('  - treatEdgesAsBorders:', settings.treatEdgesAsBorders);
        console.log('  - totalTiles:', totalTiles);
        console.log('  - worldWidth x worldHeight:', worldWidth, 'x', worldHeight);

        // Step 1: Initialize tracking structures
        const processedTiles = new Set();
        const regions = [];
        let borderTileCount = 0;
        let heightRejections = 0; // DEBUG: Track how many connections rejected due to height
        let biomeRejections = 0;  // DEBUG: Track how many connections rejected due to border biome
        let upwardRejections = 0;   // DEBUG: Track rejections when going UP in height
        let downwardRejections = 0; // DEBUG: Track rejections when going DOWN in height
        const heightCheckSamples = []; // DEBUG: Sample height checks

        // Step 2: Process each tile
        for (let startIndex = 0; startIndex < totalTiles; startIndex++) {
            // Skip if already processed
            if (processedTiles.has(startIndex)) {
                continue;
            }

            const startBiome = biomeMap[startIndex];

            // Skip if border biome
            if (settings.borderBiomes.has(startBiome)) {
                processedTiles.add(startIndex);
                borderTileCount++;
                continue;
            }

            // Check if tile is at world edge (optional border)
            if (settings.treatEdgesAsBorders) {
                const coords = indexToCoords(startIndex, worldWidth);
                const isAtEdge = coords.x === 0 || coords.x === worldWidth - 1 ||
                                 coords.y === 0 || coords.y === worldHeight - 1;
                if (isAtEdge) {
                    processedTiles.add(startIndex);
                    borderTileCount++;
                    continue;
                }
            }

            // Start a new region from this tile
            const currentRegion = [];
            const tilesToProcess = [startIndex];
            let neighborsAdded = 0; // DEBUG

            // BFS flood fill expansion loop
            while (tilesToProcess.length > 0) {
                const currentIndex = tilesToProcess.shift();

                // Skip if already processed
                if (processedTiles.has(currentIndex)) {
                    continue;
                }

                // Add to current region
                currentRegion.push(currentIndex);
                processedTiles.add(currentIndex);

                const currentHeight = heightMap[currentIndex];

                // Check all 4 neighbors (North, South, East, West)
                for (let direction = 0; direction < 4; direction++) {
                    // Validate bounds and get neighbor index
                    if (!isValidNeighbor(currentIndex, direction, worldWidth, worldHeight)) {
                        continue;
                    }

                    const adjacentIndex = getNeighborIndex(currentIndex, direction, worldWidth, worldHeight);
                    if (adjacentIndex === null) {
                        continue;
                    }

                    // Skip if already processed
                    if (processedTiles.has(adjacentIndex)) {
                        continue;
                    }

                    const adjacentBiome = biomeMap[adjacentIndex];

                    // Skip if adjacent is border biome
                    if (settings.borderBiomes.has(adjacentBiome)) {
                        biomeRejections++; // DEBUG
                        continue;
                    }

                    // Skip if adjacent tile is at world edge (optional)
                    if (settings.treatEdgesAsBorders) {
                        const adjCoords = indexToCoords(adjacentIndex, worldWidth);
                        const isAtEdge = adjCoords.x === 0 || adjCoords.x === worldWidth - 1 ||
                                         adjCoords.y === 0 || adjCoords.y === worldHeight - 1;
                        if (isAtEdge) {
                            biomeRejections++; // Count as border rejection
                            continue;
                        }
                    }

                    // Check height difference constraint
                    const adjacentHeight = heightMap[adjacentIndex];
                    const heightDiff = Math.abs(adjacentHeight - currentHeight);
                    const isGoingUp = adjacentHeight > currentHeight;

                    // DEBUG: Sample first 20 height checks (both accepted and rejected)
                    if (heightCheckSamples.length < 20) {
                        heightCheckSamples.push({
                            currentIndex,
                            currentHeight,
                            adjacentIndex,
                            adjacentHeight,
                            diff: heightDiff,
                            maxAllowed: settings.maxHeightDiff,
                            willConnect: (heightDiff <= settings.maxHeightDiff),
                            direction: isGoingUp ? 'UP' : 'DOWN'
                        });
                    }

                    if (heightDiff <= settings.maxHeightDiff) {
                        tilesToProcess.push(adjacentIndex);
                        neighborsAdded++; // DEBUG
                    } else {
                        heightRejections++; // DEBUG

                        // Track direction of rejection
                        if (isGoingUp) {
                            upwardRejections++;
                        } else {
                            downwardRejections++;
                        }
                    }
                }
            }

            // Add completed region to results
            if (currentRegion.length > 0) {
                regions.push({
                    tileIndices: currentRegion,
                    regionSize: currentRegion.length
                });
            }
        }

        // Step 3: Calculate statistics
        const tilesInRegions = regions.reduce((sum, region) => sum + region.regionSize, 0);
        const largestRegionSize = regions.length > 0
            ? Math.max(...regions.map(r => r.regionSize))
            : 0;
        const smallestRegionSize = regions.length > 0
            ? Math.min(...regions.map(r => r.regionSize))
            : 0;

        // DEBUG: Log results
        console.log('[FloodFill] Completed flood fill:');
        console.log('  - Regions found:', regions.length);
        console.log('  - Tiles in regions:', tilesInRegions);
        console.log('  - Border tiles:', borderTileCount);
        console.log('  - Largest region:', largestRegionSize);
        console.log('  - Smallest region:', smallestRegionSize);
        console.log('  - Height rejections:', heightRejections);
        console.log('    * Upward rejections (going to higher elevation):', upwardRejections);
        console.log('    * Downward rejections (going to lower elevation):', downwardRejections);
        console.log('  - Biome rejections:', biomeRejections);

        if (heightCheckSamples.length > 0) {
            console.log('  - Sample height checks (first 20):');
            heightCheckSamples.forEach((sample, i) => {
                const status = sample.willConnect ? 'CONNECTED' : 'REJECTED';
                console.log(`    ${i+1}. Tile[${sample.currentIndex}](h=${sample.currentHeight}) → Tile[${sample.adjacentIndex}](h=${sample.adjacentHeight}): diff=${sample.diff}, max=${sample.maxAllowed} => ${status}`);
            });
        }

        // Sample some height values to help debug
        const sampleCount = Math.min(20, totalTiles);
        const heightSamples = [];
        for (let i = 0; i < sampleCount; i++) {
            const idx = Math.floor(i * totalTiles / sampleCount);
            heightSamples.push(heightMap[idx]);
        }
        console.log('  - Height samples (20 tiles across map):', heightSamples);

        return {
            regions,
            tilesInRegions,
            borderTiles: borderTileCount,
            largestRegionSize,
            smallestRegionSize
        };
    }
}

// ============================================================================
// MAZE GENERATOR
// ============================================================================

/**
 * Randomized Kruskal's algorithm for maze generation on irregular regions.
 *
 * Generates a perfect maze (spanning tree) for an irregularly-shaped region
 * of tiles identified by flood fill. Guarantees:
 * - All tiles in the region are connected
 * - No cycles (perfect maze)
 * - Exactly N-1 edges for N tiles
 *
 * Technical Spec Reference: Section "Maze Generation - Irregular Regions"
 */
class MazeGenerator {
    /**
     * Generate maze for an irregular region using Kruskal's algorithm.
     *
     * Direction Encoding (4-bit values, matches technical spec):
     * - Bit 0 (value 1) = North (Up, toward Y=0)
     * - Bit 1 (value 2) = South (Down, toward larger Y)
     * - Bit 2 (value 4) = East (Right, toward larger X)
     * - Bit 3 (value 8) = West (Left, toward smaller X)
     *
     * Algorithm steps:
     * 1. Build dense index mapping (world indices → 0-based maze indices)
     * 2. Initialize union-find forest (each tile is own parent)
     * 3. Build edge list (only between tiles in region, check bounds)
     * 4. Shuffle edges with Fisher-Yates (use seed for determinism)
     * 5. Kruskal's algorithm:
     *    - For each edge: FindRoot for both nodes
     *    - If different roots: Union sets, set bidirectional connection bits
     * 6. Apply to world maze data array
     *
     * @param {Array<number>} regionTileIndices - World tile indices in this region
     * @param {number} worldWidth - Width of the world grid
     * @param {number} worldHeight - Height of the world grid
     * @param {number} seed - Random seed for deterministic generation
     * @returns {Uint8Array} Maze data (one byte per world tile, 4-bit direction encoding)
     */
    generateMaze(regionTileIndices, worldWidth, worldHeight, seed) {
        // Validate inputs
        if (!regionTileIndices || regionTileIndices.length === 0) {
            throw new Error('Invalid input: regionTileIndices must be non-empty array');
        }

        const numTiles = regionTileIndices.length;
        const totalWorldTiles = worldWidth * worldHeight;

        // Initialize random number generator
        const random = new SeededRandom(seed);

        // Step 1: Build Dense Mappings
        // Maps world tile index → maze index (0-based, contiguous)
        const tileToMazeIndex = new Map();
        // Maps maze index → world tile index
        const mazeIndexToTile = new Array(numTiles);

        for (let i = 0; i < numTiles; i++) {
            const worldIndex = regionTileIndices[i];
            tileToMazeIndex.set(worldIndex, i);
            mazeIndexToTile[i] = worldIndex;
        }

        // Initialize maze data (no connections yet)
        const mazeData = new Uint8Array(numTiles);

        // Initialize union-find forest (each node is its own parent)
        const forest = new Array(numTiles);
        for (let i = 0; i < numTiles; i++) {
            forest[i] = i;
        }

        // Step 2: Build Edge List
        const edges = [];

        for (let mazeIdx = 0; mazeIdx < numTiles; mazeIdx++) {
            const worldIndex = mazeIndexToTile[mazeIdx];

            // Check North neighbor (direction 0)
            const northIndex = worldIndex - worldWidth;
            if (northIndex >= 0 && tileToMazeIndex.has(northIndex)) {
                edges.push({
                    node1: mazeIdx,
                    node2: tileToMazeIndex.get(northIndex),
                    direction: 0 // North
                });
            }

            // Check South neighbor (direction 1)
            const southIndex = worldIndex + worldWidth;
            if (tileToMazeIndex.has(southIndex)) {
                edges.push({
                    node1: mazeIdx,
                    node2: tileToMazeIndex.get(southIndex),
                    direction: 1 // South
                });
            }

            // Check East neighbor (direction 2)
            const x = worldIndex % worldWidth;
            if (x < worldWidth - 1) { // Not at right edge
                const eastIndex = worldIndex + 1;
                if (tileToMazeIndex.has(eastIndex)) {
                    edges.push({
                        node1: mazeIdx,
                        node2: tileToMazeIndex.get(eastIndex),
                        direction: 2 // East
                    });
                }
            }

            // Check West neighbor (direction 3)
            if (x > 0) { // Not at left edge
                const westIndex = worldIndex - 1;
                if (tileToMazeIndex.has(westIndex)) {
                    edges.push({
                        node1: mazeIdx,
                        node2: tileToMazeIndex.get(westIndex),
                        direction: 3 // West
                    });
                }
            }
        }

        // Step 3: Shuffle Edges (Fisher-Yates algorithm)
        for (let i = edges.length - 1; i > 0; i--) {
            const j = random.nextInt(0, i);
            // Swap edges[i] and edges[j]
            const temp = edges[i];
            edges[i] = edges[j];
            edges[j] = temp;
        }

        // Step 4: Kruskal's Algorithm
        /**
         * Find root of node with path compression.
         * @param {number} node - Node index
         * @returns {number} Root node index
         */
        const findRoot = (node) => {
            if (forest[node] !== node) {
                forest[node] = findRoot(forest[node]); // Path compression
            }
            return forest[node];
        };

        /**
         * Get opposite direction for bidirectional connection.
         * @param {number} direction - Direction (0-3)
         * @returns {number} Opposite direction
         */
        const getOppositeDirection = (direction) => {
            switch (direction) {
                case 0: return 1; // North ↔ South
                case 1: return 0; // South ↔ North
                case 2: return 3; // East ↔ West
                case 3: return 2; // West ↔ East
                default: return -1;
            }
        };

        // Process each edge
        for (const edge of edges) {
            const root1 = findRoot(edge.node1);
            const root2 = findRoot(edge.node2);

            // If nodes are in different components, connect them
            if (root1 !== root2) {
                // Union the sets
                forest[root1] = root2;

                // Add bidirectional connection
                // Node1 → Node2 (set direction bit)
                mazeData[edge.node1] |= (1 << edge.direction);

                // Node2 → Node1 (set opposite direction bit)
                const oppositeDir = getOppositeDirection(edge.direction);
                mazeData[edge.node2] |= (1 << oppositeDir);
            }
        }

        // Step 5: Apply to World Maze Data
        const worldMazeData = new Uint8Array(totalWorldTiles);
        for (let mazeIdx = 0; mazeIdx < numTiles; mazeIdx++) {
            const worldIndex = mazeIndexToTile[mazeIdx];
            worldMazeData[worldIndex] = mazeData[mazeIdx];
        }

        return worldMazeData;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    // Node.js
    module.exports = {
        SeededRandom,
        FloodFillEngine,
        MazeGenerator,
        indexToCoords,
        coordsToIndex,
        getNeighborIndex,
        isValidNeighbor
    };
} else {
    // Browser
    window.MazeAlgorithms = {
        SeededRandom,
        FloodFillEngine,
        MazeGenerator,
        indexToCoords,
        coordsToIndex,
        getNeighborIndex,
        isValidNeighbor
    };
}
