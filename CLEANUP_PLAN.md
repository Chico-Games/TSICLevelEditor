# Cleanup Plan: Align Codebase with RLE Spec

## Current Issues

### 1. Layer Structure Mismatch
**Current**: 6 layers (Height, Difficulty, Hazard, Sky, Showfloor, Underground)
**Spec**: 5 layers with specific purposes:
- Layer 0: "None" type - HEIGHT DATA (values 0-9)
- Layer 1: "None" type - DIFFICULTY DATA (values 0-4)
- Layer 2: "Sky" type - BIOME + HAZARD DATA
- Layer 3: "Floor" type - BIOME + HAZARD DATA
- Layer 4: "Underground" type - BIOME + HAZARD DATA

### 2. Height Values Wrong Range
**Current**: Height values use 0-255 range (0, 32, 64, 96, 128, 160, 192, 224, 255)
**Spec**: Height values must be 0-9 only (10 discrete levels)

### 3. None/Empty Values
**Current**: Has "Biome_None" and "Hazard_None" as named entries
**Spec**: Should just use value 0 for empty/none

### 4. Data Array Structure
**Current**: Each layer has single tileData Map storing colors
**Spec**: Each layer should have 4 arrays:
- biome_data (RLE array)
- height_data (RLE array)
- difficulty_data (RLE array)
- hazard_data (RLE array)

## Required Changes

### Phase 1: Update biomes.json

1. **Remove "Biome_None" and "Hazard_None"**
   - Code should treat value 0 as None/Empty
   - Update ColorMapper to handle value 0

2. **Fix Height values to 0-9**
   ```
   Height_0 (Underground_Deep): value 0
   Height_1 (Underground): value 1
   Height_2 (Ground): value 2
   Height_3 (Ground_Mid): value 3
   Height_4 (Elevated): value 4
   Height_5 (Elevated_Mid): value 5
   Height_6 (Upper): value 6
   Height_7 (Upper_High): value 7
   Height_8 (Ceiling): value 8
   Height_9 (Sky): value 9
   ```

3. **Remove unused biomes from spec**
   - SCPBase (4)
   - SCPBaseExit (9)
   - SCPBasePower (10)
   - CarPark (17)
   - CarParkEntrance (18)
   - CarParkExit (19)

### Phase 2: Update Layer Structure

1. **Merge Hazard layer into other layers**
   - Sky layer gets hazard_data array
   - Floor layer gets hazard_data array
   - Underground layer gets hazard_data array
   - Remove standalone Hazard layer

2. **Create proper Layer 0 (Height) and Layer 1 (Difficulty)**
   - These layers only have ONE active data array
   - Other 3 arrays are dummy (all zeros)

3. **Update config.js layer definitions**
   - Change from 6 layers to 5 layers
   - Update layer types and properties

### Phase 3: Update Data Storage

1. **Change from single tileData to 4 data arrays**
   ```javascript
   class WorldLayer {
       constructor(name, width, height) {
           this.biomeData = new Map();      // x,y -> biome value
           this.heightData = new Map();     // x,y -> height value (0-9)
           this.difficultyData = new Map(); // x,y -> difficulty value (0-4)
           this.hazardData = new Map();     // x,y -> hazard value (0-2)
       }
   }
   ```

2. **Update setTile/getTile to work with 4 arrays**

3. **Update RLE export to create 4 RLE arrays per layer**

### Phase 4: Update Tests

1. **Remove tests for removed biomes**
2. **Update layer count from 6 to 5**
3. **Update test map generation**
4. **Fix validation tests**

### Phase 5: Cleanup

1. **Remove debug logging from generateTestMap**
2. **Update documentation**
3. **Remove old code references**

## Breaking Changes

These are MAJOR breaking changes that will require:
- Complete rewrite of layer storage system
- New save/load format
- Updated RLE encoder
- All existing save files will be incompatible

## Recommendation

This is extensive work. Should we:
1. **Option A**: Make these changes incrementally (will break functionality temporarily)
2. **Option B**: Create a new branch/version and migrate completely
3. **Option C**: Keep current system but add RLE export that converts to spec format

Which approach would you prefer?
