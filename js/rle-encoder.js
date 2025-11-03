/**
 * RLE (Run-Length Encoding) Encoder for TSIC Format
 * Compresses level data into efficient RLE format
 */

class RLEEncoder {
    /**
     * Encode layer data to RLE format (async)
     * @param {Layer} layer - Layer object with data maps
     * @param {number} worldSize - World width/height
     * @returns {object} - RLE encoded layer data
     */
    async encodeLayer(layer, worldSize) {
        const totalTiles = worldSize * worldSize;

        return {
            layer_type: this.getLayerType(layer),
            biome_data: await this.encodeDataArray(layer, 'biome', totalTiles),
            height_data: await this.encodeDataArray(layer, 'height', totalTiles),
            difficulty_data: await this.encodeDataArray(layer, 'difficulty', totalTiles),
            hazard_data: await this.encodeDataArray(layer, 'hazard', totalTiles)
        };
    }

    /**
     * Map layer worldLayer to TSIC layer_type
     */
    getLayerType(layer) {
        const worldLayer = layer.worldLayer || layer.layerType;

        if (!worldLayer) return 'None';

        // Map world layer types to TSIC layer types
        if (worldLayer === 'Floor') return 'Floor';
        if (worldLayer === 'Underground') return 'Underground';
        if (worldLayer === 'Sky') return 'Sky';
        if (worldLayer === 'Hazard') return 'Hazard';
        if (worldLayer === 'Height') return 'None'; // Height is data-only
        if (worldLayer === 'Difficulty') return 'None'; // Difficulty is data-only

        return 'None';
    }

    /**
     * Encode a single data type array to RLE format (async with chunking)
     * @param {Layer} layer - Layer object
     * @param {string} dataType - 'biome', 'height', 'difficulty', or 'hazard'
     * @param {number} totalTiles - Total number of tiles (worldSize²)
     * @returns {array} - RLE encoded array of {value, count}
     */
    async encodeDataArray(layer, dataType, totalTiles) {
        const dataMap = layer.getDataMap(dataType);
        if (!dataMap) {
            // Return single entry with layer's default value for entire grid
            const defaultValue = layer.getDefaultValue ? layer.getDefaultValue(dataType) : 0;
            return [{ value: defaultValue, count: totalTiles }];
        }

        // Build linear array of values with layer's default
        const width = layer.width;
        const defaultValue = layer.getDefaultValue ? layer.getDefaultValue(dataType) : 0;
        const values = new Array(totalTiles).fill(defaultValue);

        for (const [key, data] of dataMap.entries()) {
            const [x, y] = key.split(',').map(Number);
            const index = y * width + x;
            values[index] = data.value || 0;
        }

        // RLE encode the values array with chunking
        const rleArray = [];
        let currentValue = values[0];
        let count = 1;

        const chunkSize = 10000; // Process 10k tiles at a time
        for (let i = 1; i < values.length; i++) {
            if (values[i] === currentValue) {
                count++;
            } else {
                rleArray.push({ value: currentValue, count });
                currentValue = values[i];
                count = 1;
            }

            // Yield to browser every chunk
            if (i % chunkSize === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Push last run
        rleArray.push({ value: currentValue, count });

        return rleArray;
    }

    /**
     * Encode complete level to TSIC JSON-RLE format (async)
     * @param {object} levelData - Level data with gridSize and layers
     * @param {string} levelName - Name for the level
     * @param {string} description - Level description
     * @returns {object} - TSIC compliant JSON-RLE data
     */
    async encodeLevel(levelData, levelName = 'Untitled Level', description = '') {
        const worldSize = levelData.gridSize.width;

        // Generate seed from current timestamp
        const seed = Math.floor(Date.now() / 1000);

        return {
            metadata: {
                name: levelName,
                description: description || `Level created on ${new Date().toLocaleDateString()}`,
                world_size: worldSize,
                maze_generation_seed: seed
            },
            layers: await Promise.all(levelData.layers.map(layer => this.encodeLayer(layer, worldSize)))
        };
    }

    /**
     * Get compression statistics
     * @param {object} originalData - Original uncompressed data
     * @param {object} rleData - RLE compressed data
     * @returns {object} - Compression statistics
     */
    getCompressionStats(originalData, rleData) {
        const originalSize = JSON.stringify(originalData).length;
        const compressedSize = JSON.stringify(rleData).length;
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        return {
            originalSizeKB: (originalSize / 1024).toFixed(2),
            compressedSizeKB: (compressedSize / 1024).toFixed(2),
            compressionRatio: ratio + '%',
            savedKB: ((originalSize - compressedSize) / 1024).toFixed(2)
        };
    }
}

// Export singleton instance
const rleEncoder = new RLEEncoder();

// Make available globally for tests and other modules
if (typeof window !== 'undefined') {
    window.rleEncoder = rleEncoder;
    window.RLEEncoder = RLEEncoder;
}
