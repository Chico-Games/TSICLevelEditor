/**
 * Test suite for maze-algorithms.js
 * Demonstrates usage of FloodFillEngine and MazeGenerator
 */

// Import (assuming Node.js environment for testing)
const {
    SeededRandom,
    FloodFillEngine,
    MazeGenerator,
    indexToCoords,
    coordsToIndex,
    getNeighborIndex,
    isValidNeighbor
} = require('./maze-algorithms.js');

// ============================================================================
// UTILITY FUNCTIONS FOR VISUALIZATION
// ============================================================================

/**
 * Convert maze direction byte to visual representation
 */
function mazeDirectionToString(direction) {
    const hasNorth = (direction & 1) !== 0;
    const hasSouth = (direction & 2) !== 0;
    const hasEast = (direction & 4) !== 0;
    const hasWest = (direction & 8) !== 0;

    const parts = [];
    if (hasNorth) parts.push('N');
    if (hasSouth) parts.push('S');
    if (hasEast) parts.push('E');
    if (hasWest) parts.push('W');

    return parts.length > 0 ? parts.join('+') : 'NONE';
}

/**
 * Print a 2D grid representation
 */
function printGrid(data, width, height, formatter = (val) => val) {
    console.log('Grid:');
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            const index = coordsToIndex(x, y, width);
            row.push(formatter(data[index], index));
        }
        console.log(row.join(' '));
    }
    console.log('');
}

// ============================================================================
// TEST 1: COORDINATE UTILITIES
// ============================================================================

console.log('='.repeat(70));
console.log('TEST 1: Coordinate Utilities');
console.log('='.repeat(70));

const testWidth = 10;
console.log(`Testing on ${testWidth}x${testWidth} grid\n`);

// Test index to coords
console.log('Index to Coords:');
console.log(`  Index 0 → ${JSON.stringify(indexToCoords(0, testWidth))} (should be {x:0, y:0})`);
console.log(`  Index 9 → ${JSON.stringify(indexToCoords(9, testWidth))} (should be {x:9, y:0})`);
console.log(`  Index 10 → ${JSON.stringify(indexToCoords(10, testWidth))} (should be {x:0, y:1})`);
console.log(`  Index 99 → ${JSON.stringify(indexToCoords(99, testWidth))} (should be {x:9, y:9})`);
console.log('');

// Test coords to index
console.log('Coords to Index:');
console.log(`  (0,0) → ${coordsToIndex(0, 0, testWidth)} (should be 0)`);
console.log(`  (9,0) → ${coordsToIndex(9, 0, testWidth)} (should be 9)`);
console.log(`  (0,1) → ${coordsToIndex(0, 1, testWidth)} (should be 10)`);
console.log(`  (9,9) → ${coordsToIndex(9, 9, testWidth)} (should be 99)`);
console.log('');

// Test neighbor validation
console.log('Neighbor Validation (index 0 = top-left corner):');
console.log(`  North valid? ${isValidNeighbor(0, 0, testWidth, testWidth)} (should be false - at top edge)`);
console.log(`  South valid? ${isValidNeighbor(0, 1, testWidth, testWidth)} (should be true)`);
console.log(`  East valid? ${isValidNeighbor(0, 2, testWidth, testWidth)} (should be true)`);
console.log(`  West valid? ${isValidNeighbor(0, 3, testWidth, testWidth)} (should be false - at left edge)`);
console.log('');

// ============================================================================
// TEST 2: SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

console.log('='.repeat(70));
console.log('TEST 2: Seeded Random Number Generator');
console.log('='.repeat(70));

const rng1 = new SeededRandom(12345);
const rng2 = new SeededRandom(12345);
const rng3 = new SeededRandom(54321);

console.log('Testing determinism with same seed (12345):');
const values1 = [rng1.next(), rng1.next(), rng1.next()];
const values2 = [rng2.next(), rng2.next(), rng2.next()];
console.log(`  RNG1: ${values1.map(v => v.toFixed(6)).join(', ')}`);
console.log(`  RNG2: ${values2.map(v => v.toFixed(6)).join(', ')}`);
console.log(`  Match: ${JSON.stringify(values1) === JSON.stringify(values2)} (should be true)`);
console.log('');

console.log('Testing different seed (54321):');
const values3 = [rng3.next(), rng3.next(), rng3.next()];
console.log(`  RNG3: ${values3.map(v => v.toFixed(6)).join(', ')}`);
console.log(`  Different: ${JSON.stringify(values1) !== JSON.stringify(values3)} (should be true)`);
console.log('');

// ============================================================================
// TEST 3: FLOOD FILL - SIMPLE OPEN AREA
// ============================================================================

console.log('='.repeat(70));
console.log('TEST 3: Flood Fill - Simple Open Area (10x10)');
console.log('='.repeat(70));

const width3 = 10;
const height3 = 10;
const totalTiles3 = width3 * height3;

// All tiles are traversable, same height
const heightMap3 = new Uint8Array(totalTiles3);
heightMap3.fill(5); // All height 5

const biomeMap3 = new Array(totalTiles3);
biomeMap3.fill('ShowFloor'); // All traversable

const settings3 = {
    borderBiomes: new Set(['Blocked', 'Pit']),
    maxHeightDiff: 1
};

const floodFill = new FloodFillEngine();
const result3 = floodFill.performFloodFill(heightMap3, biomeMap3, settings3, width3);

console.log('Scenario: All tiles are ShowFloor biome, height = 5');
console.log('Expected: 1 region with all 100 tiles\n');

console.log('Results:');
console.log(`  Total regions: ${result3.regions.length}`);
console.log(`  Tiles in regions: ${result3.tilesInRegions}`);
console.log(`  Border tiles: ${result3.borderTiles}`);
console.log(`  Largest region: ${result3.largestRegionSize} tiles`);
console.log(`  Smallest region: ${result3.smallestRegionSize} tiles`);
console.log('');

// ============================================================================
// TEST 4: FLOOD FILL - VERTICAL WALL
// ============================================================================

console.log('='.repeat(70));
console.log('TEST 4: Flood Fill - Vertical Wall Dividing Grid');
console.log('='.repeat(70));

const width4 = 10;
const height4 = 10;
const totalTiles4 = width4 * height4;

// Create vertical wall at X=5
const heightMap4 = new Uint8Array(totalTiles4);
heightMap4.fill(5);

const biomeMap4 = new Array(totalTiles4);
for (let y = 0; y < height4; y++) {
    for (let x = 0; x < width4; x++) {
        const index = coordsToIndex(x, y, width4);
        if (x === 5) {
            biomeMap4[index] = 'Blocked'; // Vertical wall
        } else {
            biomeMap4[index] = 'ShowFloor';
        }
    }
}

const settings4 = {
    borderBiomes: new Set(['Blocked']),
    maxHeightDiff: 1
};

const result4 = floodFill.performFloodFill(heightMap4, biomeMap4, settings4, width4);

console.log('Scenario: Vertical wall at X=5 (Blocked biome)');
console.log('Layout:');
console.log('  X: 0 1 2 3 4 | 5 | 6 7 8 9');
console.log('     F F F F F | # | F F F F  (F=Floor, #=Blocked)');
console.log('Expected: 2 regions (left: 50 tiles, right: 40 tiles)\n');

console.log('Results:');
console.log(`  Total regions: ${result4.regions.length}`);
console.log(`  Region sizes: ${result4.regions.map(r => r.regionSize).join(', ')}`);
console.log(`  Tiles in regions: ${result4.tilesInRegions}`);
console.log(`  Border tiles: ${result4.borderTiles}`);
console.log('');

// Visualize regions
const regionMap = new Array(totalTiles4).fill('.');
for (let i = 0; i < result4.regions.length; i++) {
    const region = result4.regions[i];
    const label = String.fromCharCode(65 + i); // 'A', 'B', 'C', ...
    for (const tileIndex of region.tileIndices) {
        regionMap[tileIndex] = label;
    }
}
// Mark border tiles
for (let i = 0; i < totalTiles4; i++) {
    if (biomeMap4[i] === 'Blocked') {
        regionMap[i] = '#';
    }
}

printGrid(regionMap, width4, height4, (val) => val);

// ============================================================================
// TEST 5: MAZE GENERATION - SMALL REGION
// ============================================================================

console.log('='.repeat(70));
console.log('TEST 5: Maze Generation - Small 2x2 Region');
console.log('='.repeat(70));

const width5 = 10;
const testRegion = [5, 6, 15, 16]; // 2x2 square at (5,0), (6,0), (5,1), (6,1)

console.log('Region tiles:');
for (const index of testRegion) {
    const coords = indexToCoords(index, width5);
    console.log(`  Index ${index} → (${coords.x}, ${coords.y})`);
}
console.log('');

console.log('Layout:');
console.log('    0 1 2 3 4 5 6 7 8 9');
console.log('  0 . . . . . R R . . .');
console.log('  1 . . . . . R R . . .');
console.log('  (R = Region tiles)');
console.log('');

const mazeGen = new MazeGenerator();
const mazeData5 = mazeGen.generateMaze(testRegion, width5, 42);

console.log('Generated Maze Directions:');
for (const index of testRegion) {
    const coords = indexToCoords(index, width5);
    const direction = mazeData5[index];
    console.log(`  Tile ${index} (${coords.x},${coords.y}): ${direction.toString().padStart(3)} = 0b${direction.toString(2).padStart(4, '0')} = ${mazeDirectionToString(direction)}`);
}
console.log('');

// Verify bidirectional connections
console.log('Verifying bidirectional connections:');
let allValid = true;
for (const index of testRegion) {
    const direction = mazeData5[index];
    const coords = indexToCoords(index, width5);

    // Check each direction
    if (direction & 1) { // Has North
        const northIndex = getNeighborIndex(index, 0, width5, 10);
        if (northIndex !== null && testRegion.includes(northIndex)) {
            const northDirection = mazeData5[northIndex];
            if (!(northDirection & 2)) { // Should have South
                console.log(`  ERROR: Tile ${index} has North, but tile ${northIndex} lacks South`);
                allValid = false;
            }
        }
    }
    if (direction & 2) { // Has South
        const southIndex = getNeighborIndex(index, 1, width5, 10);
        if (southIndex !== null && testRegion.includes(southIndex)) {
            const southDirection = mazeData5[southIndex];
            if (!(southDirection & 1)) { // Should have North
                console.log(`  ERROR: Tile ${index} has South, but tile ${southIndex} lacks North`);
                allValid = false;
            }
        }
    }
    if (direction & 4) { // Has East
        const eastIndex = getNeighborIndex(index, 2, width5, 10);
        if (eastIndex !== null && testRegion.includes(eastIndex)) {
            const eastDirection = mazeData5[eastIndex];
            if (!(eastDirection & 8)) { // Should have West
                console.log(`  ERROR: Tile ${index} has East, but tile ${eastIndex} lacks West`);
                allValid = false;
            }
        }
    }
    if (direction & 8) { // Has West
        const westIndex = getNeighborIndex(index, 3, width5, 10);
        if (westIndex !== null && testRegion.includes(westIndex)) {
            const westDirection = mazeData5[westIndex];
            if (!(westDirection & 4)) { // Should have East
                console.log(`  ERROR: Tile ${index} has West, but tile ${westIndex} lacks East`);
                allValid = false;
            }
        }
    }
}
if (allValid) {
    console.log('  ✓ All connections are bidirectional');
}
console.log('');

// Verify connectivity (all tiles reachable)
console.log('Verifying connectivity (all tiles reachable):');
const visited = new Set();
const queue = [testRegion[0]];
visited.add(testRegion[0]);

while (queue.length > 0) {
    const current = queue.shift();
    const direction = mazeData5[current];

    // Check all 4 directions
    for (let dir = 0; dir < 4; dir++) {
        if (direction & (1 << dir)) {
            const neighborIndex = getNeighborIndex(current, dir, width5, 10);
            if (neighborIndex !== null && testRegion.includes(neighborIndex) && !visited.has(neighborIndex)) {
                visited.add(neighborIndex);
                queue.push(neighborIndex);
            }
        }
    }
}

if (visited.size === testRegion.length) {
    console.log(`  ✓ All ${testRegion.length} tiles are reachable`);
} else {
    console.log(`  ERROR: Only ${visited.size}/${testRegion.length} tiles are reachable`);
}
console.log('');

// ============================================================================
// TEST 6: COMBINED FLOOD FILL + MAZE GENERATION
// ============================================================================

console.log('='.repeat(70));
console.log('TEST 6: Combined Flood Fill + Maze Generation');
console.log('='.repeat(70));

const width6 = 10;
const height6 = 10;
const totalTiles6 = width6 * height6;

// Create a simple scenario: open area with vertical wall
const heightMap6 = new Uint8Array(totalTiles6);
heightMap6.fill(5);

const biomeMap6 = new Array(totalTiles6);
for (let y = 0; y < height6; y++) {
    for (let x = 0; x < width6; x++) {
        const index = coordsToIndex(x, y, width6);
        if (x === 5) {
            biomeMap6[index] = 'Blocked';
        } else {
            biomeMap6[index] = 'ShowFloor';
        }
    }
}

const settings6 = {
    borderBiomes: new Set(['Blocked']),
    maxHeightDiff: 1
};

console.log('Step 1: Perform flood fill');
const floodFillResult = floodFill.performFloodFill(heightMap6, biomeMap6, settings6, width6);
console.log(`  Found ${floodFillResult.regions.length} regions`);
console.log('');

console.log('Step 2: Generate mazes for each region');
const worldMazeData = new Uint8Array(totalTiles6);

for (let i = 0; i < floodFillResult.regions.length; i++) {
    const region = floodFillResult.regions[i];
    console.log(`  Region ${i}: ${region.regionSize} tiles`);

    // Generate maze for this region
    const seed = 12345 + region.tileIndices[0]; // Use first tile index as seed
    const regionMazeData = mazeGen.generateMaze(region.tileIndices, width6, seed);

    // Apply to world maze data
    for (const tileIndex of region.tileIndices) {
        worldMazeData[tileIndex] = regionMazeData[tileIndex];
    }
}
console.log('');

console.log('Step 3: Verify maze connectivity');
for (let i = 0; i < floodFillResult.regions.length; i++) {
    const region = floodFillResult.regions[i];

    // Check connectivity using BFS
    const visited = new Set();
    const queue = [region.tileIndices[0]];
    visited.add(region.tileIndices[0]);

    while (queue.length > 0) {
        const current = queue.shift();
        const direction = worldMazeData[current];

        for (let dir = 0; dir < 4; dir++) {
            if (direction & (1 << dir)) {
                const neighborIndex = getNeighborIndex(current, dir, width6, height6);
                if (neighborIndex !== null && region.tileIndices.includes(neighborIndex) && !visited.has(neighborIndex)) {
                    visited.add(neighborIndex);
                    queue.push(neighborIndex);
                }
            }
        }
    }

    const isConnected = visited.size === region.regionSize;
    console.log(`  Region ${i}: ${visited.size}/${region.regionSize} tiles reachable ${isConnected ? '✓' : '✗'}`);
}
console.log('');

console.log('Sample maze directions (first 5 tiles of each region):');
for (let i = 0; i < floodFillResult.regions.length; i++) {
    const region = floodFillResult.regions[i];
    console.log(`  Region ${i}:`);
    for (let j = 0; j < Math.min(5, region.regionSize); j++) {
        const tileIndex = region.tileIndices[j];
        const coords = indexToCoords(tileIndex, width6);
        const direction = worldMazeData[tileIndex];
        console.log(`    Tile ${tileIndex} (${coords.x},${coords.y}): ${mazeDirectionToString(direction)}`);
    }
}

console.log('');
console.log('='.repeat(70));
console.log('ALL TESTS COMPLETE');
console.log('='.repeat(70));
