# RLE Save Format Guide

## Overview

The level editor saves files in **TSIC JSON-RLE format** (Tile System Integration Complete - Run-Length Encoding). This format uses compression to reduce file sizes from ~100MB to ~4MB for typical maps.

## File Structure

### Top Level
```json
{
  "metadata": { ... },
  "layers": [ ... ]
}
```

### Metadata Section
```json
"metadata": {
  "name": "Untitled Level",
  "description": "Level created on 10/17/2025",
  "world_size": 512,
  "maze_generation_seed": 1760709235
}
```

**Fields:**
- `name` (string): Level name
- `description` (string): Level description
- `world_size` (number): Grid dimensions (e.g., 512 = 512×512 grid)
- `maze_generation_seed` (number): Unix timestamp used for generation

### Layers Array

Each layer contains:
```json
{
  "layer_type": "Floor",
  "biome_data": [...],
  "height_data": [...],
  "difficulty_data": [...],
  "hazard_data": [...]
}
```

**Layer Types:**
- `"Floor"` - Main ground level layer (can contain any biome like ShowFloor, Restaurant, etc.)
- `"Underground"` - Below ground level
- `"Sky"` - Above ground level
- `"Hazard"` - Hazard layer
- `"None"` - Data-only layer (Height, Difficulty)

## RLE Compression Format

### RLE Entry Structure
Each data array (biome_data, height_data, etc.) contains RLE entries:

```json
{
  "value": 5,
  "count": 1000
}
```

**Fields:**
- `value` (number): The tile value/ID (0 = empty)
- `count` (number): How many consecutive tiles have this value

### How RLE Works

RLE compresses consecutive identical values. For example:

**Uncompressed (262,144 tiles):**
```
[0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, ...]
```

**Compressed:**
```json
[
  { "value": 0, "count": 5 },
  { "value": 5, "count": 3 },
  { "value": 0, "count": 3 },
  ...
]
```

### Linear Array Order

Data is stored in **row-major order** (left-to-right, top-to-bottom):

```
Index calculation: index = y * world_size + x

Example for 512×512 grid:
- Tile at (0, 0) = index 0
- Tile at (1, 0) = index 1
- Tile at (0, 1) = index 512
- Tile at (255, 255) = index 130815
```

## Decoding Algorithm

### Step 1: Read Metadata
```javascript
const metadata = saveData.metadata;
const worldSize = metadata.world_size;
const totalTiles = worldSize * worldSize;
```

### Step 2: Process Each Layer
```javascript
saveData.layers.forEach(layer => {
  console.log("Layer type:", layer.layer_type);

  // Decode each data type
  const biomeArray = decodeRLE(layer.biome_data, totalTiles);
  const heightArray = decodeRLE(layer.height_data, totalTiles);
  const difficultyArray = decodeRLE(layer.difficulty_data, totalTiles);
  const hazardArray = decodeRLE(layer.hazard_data, totalTiles);
});
```

### Step 3: Decode RLE to Linear Array
```javascript
function decodeRLE(rleData, totalTiles) {
  const array = new Array(totalTiles);
  let index = 0;

  for (const entry of rleData) {
    const { value, count } = entry;

    // Fill 'count' tiles with 'value'
    for (let i = 0; i < count; i++) {
      array[index++] = value;
    }
  }

  return array;
}
```

### Step 4: Convert Linear Array to 2D Grid
```javascript
function linearToGrid(linearArray, worldSize) {
  const grid = {};

  for (let y = 0; y < worldSize; y++) {
    for (let x = 0; x < worldSize; x++) {
      const index = y * worldSize + x;
      const value = linearArray[index];

      if (value !== 0) {
        grid[`${x},${y}`] = value;
      }
    }
  }

  return grid;
}
```

## Example Decoding Process

### Input RLE Data
```json
{
  "metadata": {
    "world_size": 512
  },
  "layers": [
    {
      "layer_type": "Floor",
      "biome_data": [
        { "value": 0, "count": 131071 },
        { "value": 1, "count": 5 },
        { "value": 0, "count": 131068 }
      ]
    }
  ]
}
```

### Decoding Steps

1. **Total tiles:** 512 × 512 = 262,144
2. **Decode biome_data:**
   - Tiles 0-131070: value = 0 (empty)
   - Tiles 131071-131075: value = 1 (biome type 1)
   - Tiles 131076-262143: value = 0 (empty)

3. **Find painted tiles:**
   - Index 131071: x=255, y=255 → value=1
   - Index 131072: x=256, y=255 → value=1
   - Index 131073: x=257, y=255 → value=1
   - Index 131074: x=258, y=255 → value=1
   - Index 131075: x=259, y=255 → value=1

4. **Result:** 5 tiles painted with biome value 1 at positions (255-259, 255)

## Data Type Reference

### Biome Data (biome_data)
- **Layer types:** Floor, Underground, Sky
- **Values:** 1-30+ (biome/room type IDs)
- **Meaning:** What type of room/biome this tile represents

### Height Data (height_data)
- **Layer types:** All (Height layer primary)
- **Values:** 0-10 (elevation levels)
- **Meaning:** Elevation/height of terrain

### Difficulty Data (difficulty_data)
- **Layer types:** All (Difficulty layer primary)
- **Values:** 1-3 (Easy, Medium, Hard)
- **Meaning:** Difficulty zone for gameplay

### Hazard Data (hazard_data)
- **Layer types:** Hazard layer primary
- **Values:** 1-18 (hazard type IDs)
- **Meaning:** Environmental hazards (radiation, freezing, toxic, etc.)

## Value Mappings

### Biome Values (examples from config/biomes.json)
```
1  = Biome_ShowFloor
2  = Biome_Lush
3  = Biome_Desert
4  = Biome_Ice
5  = Biome_Volcano
...
```

### Height Values
```
0  = Sea level / default
1  = Slight elevation
2  = Low hills
...
10 = Mountain peaks
```

### Difficulty Values
```
1  = Easy
2  = Medium
3  = Hard
```

### Hazard Values
```
1  = Radiation_Easy
2  = Radiation_Medium
3  = Radiation_Hard
4  = Freezing_Easy
5  = Freezing_Medium
6  = Freezing_Hard
7  = Toxic_Easy
...
18 = Drowning_Hard
```

## Compression Statistics

### Typical Test Map (512×512) - All Layers Filled
- **Total tiles:** 262,144 per layer × 6 layers × 4 data types = 6,291,456 total tiles
- **Tiles with data:** ALL tiles filled (every layer has complete coverage)
- **Uncompressed size:** ~50MB (full tileset metadata per tile)
- **RLE compressed size:** ~4MB on disk (with JSON formatting)
- **Compression ratio:** 92%

### Why RLE Works Well Even When Fully Filled
1. **Base fills:** Each layer starts filled with a single base color (highly compressible)
2. **Large contiguous regions:** Splodges create areas of same value that compress to single RLE entries
3. **Pattern consistency:** Similar biomes/heights/difficulties group together
4. **Multiple data types:** Even though all tiles are filled, RLE compresses repeated patterns efficiently

**Example:** A layer filled entirely with base biome #1, then with splodges on top:
- Before: 262,144 tile objects = ~26MB
- After RLE: ~20-30 entries = ~1KB (for mostly uniform base + splodges)

## Python Decoding Example

```python
import json

def decode_rle(rle_data, total_tiles):
    """Decode RLE array to linear array"""
    array = []
    for entry in rle_data:
        value = entry['value']
        count = entry['count']
        array.extend([value] * count)
    return array

def linear_to_grid(linear_array, world_size):
    """Convert linear array to 2D grid dictionary"""
    grid = {}
    for y in range(world_size):
        for x in range(world_size):
            index = y * world_size + x
            value = linear_array[index]
            if value != 0:
                grid[(x, y)] = value
    return grid

# Load save file
with open('level.json', 'r') as f:
    save_data = json.load(f)

# Get metadata
world_size = save_data['metadata']['world_size']
total_tiles = world_size * world_size

# Process each layer
for layer in save_data['layers']:
    print(f"Layer: {layer['layer_type']}")

    # Decode biome data
    biome_linear = decode_rle(layer['biome_data'], total_tiles)
    biome_grid = linear_to_grid(biome_linear, world_size)

    print(f"  Biome tiles: {len(biome_grid)}")

    # Same for other data types
    height_linear = decode_rle(layer['height_data'], total_tiles)
    difficulty_linear = decode_rle(layer['difficulty_data'], total_tiles)
    hazard_linear = decode_rle(layer['hazard_data'], total_tiles)
```

## JavaScript Decoding Example

```javascript
function decodeSaveFile(saveData) {
  const worldSize = saveData.metadata.world_size;
  const totalTiles = worldSize * worldSize;

  const decodedLayers = saveData.layers.map(layer => {
    return {
      layerType: layer.layer_type,
      biome: decodeRLEToGrid(layer.biome_data, worldSize),
      height: decodeRLEToGrid(layer.height_data, worldSize),
      difficulty: decodeRLEToGrid(layer.difficulty_data, worldSize),
      hazard: decodeRLEToGrid(layer.hazard_data, worldSize)
    };
  });

  return {
    metadata: saveData.metadata,
    layers: decodedLayers
  };
}

function decodeRLEToGrid(rleData, worldSize) {
  // Decode to linear array
  const linear = [];
  for (const entry of rleData) {
    for (let i = 0; i < entry.count; i++) {
      linear.push(entry.value);
    }
  }

  // Convert to grid object
  const grid = new Map();
  for (let y = 0; y < worldSize; y++) {
    for (let x = 0; x < worldSize; x++) {
      const index = y * worldSize + x;
      const value = linear[index];
      if (value !== 0) {
        grid.set(`${x},${y}`, value);
      }
    }
  }

  return grid;
}
```

## Validation

### Verify RLE Integrity
```javascript
function validateRLE(rleData, expectedTotal) {
  let actualTotal = 0;

  for (const entry of rleData) {
    actualTotal += entry.count;
  }

  if (actualTotal !== expectedTotal) {
    throw new Error(`RLE count mismatch: ${actualTotal} != ${expectedTotal}`);
  }

  return true;
}

// Usage
const worldSize = saveData.metadata.world_size;
const expectedTotal = worldSize * worldSize;

saveData.layers.forEach(layer => {
  validateRLE(layer.biome_data, expectedTotal);
  validateRLE(layer.height_data, expectedTotal);
  validateRLE(layer.difficulty_data, expectedTotal);
  validateRLE(layer.hazard_data, expectedTotal);
});
```

## Common Patterns

### Empty Layer
```json
{
  "layer_type": "Floor",
  "biome_data": [
    { "value": 0, "count": 262144 }
  ]
}
```
All tiles are empty (value 0).

### Single Tile Painted
```json
{
  "biome_data": [
    { "value": 0, "count": 131072 },
    { "value": 5, "count": 1 },
    { "value": 0, "count": 131071 }
  ]
}
```
One tile (at index 131072) has value 5, rest are empty.

### Contiguous Region
```json
{
  "biome_data": [
    { "value": 0, "count": 100000 },
    { "value": 3, "count": 500 },
    { "value": 0, "count": 161644 }
  ]
}
```
A region of 500 tiles with value 3, surrounded by empty tiles.

## Tips for AI Processing

1. **Always validate RLE counts** sum to `world_size²`
2. **Check for value 0** = empty tiles (skip in most processing)
3. **Layer types matter** - "Floor" layers use biome_data primarily
4. **Coordinates are 0-indexed** - range is [0, world_size-1]
5. **Multiple layers stack** - first layer in array renders on top visually
6. **Sparse data is normal** - most tiles will be empty (value 0)

## File Location

Generated save files are typically named:
```
level_<timestamp>.json
```

For example: `level_1760709235.json`

## Additional Resources

- **Config file:** `config/biomes.json` - Contains all tileset definitions and color mappings
- **Encoder:** `js/rle-encoder.js` - Reference implementation for encoding
- **Tests:** `tests/rle-encoder.test.js` - Examples of encoding/decoding
