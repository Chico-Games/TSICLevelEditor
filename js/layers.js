/**
 * Layer Manager - JSON-RLE World Format
 * Each layer (Floor/Sky/Underground/Hazard) contains 4 data types:
 * - biome_data (0-22)
 * - height_data (0-255)
 * - difficulty_data (0-4)
 * - hazard_data (0-6)
 */

class WorldLayer {
    constructor(name, width, height, options = {}) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.visible = options.visible !== undefined ? options.visible : true;
        this.opacity = options.opacity !== undefined ? options.opacity : 1.0;
        this.locked = options.locked !== undefined ? options.locked : false;
        this.editable = options.editable !== undefined ? options.editable : true;

        // Layer type: "Floor", "Sky", "Underground", "Hazard"
        this.layerType = options.layerType || 'Floor';
        this.worldLayer = options.worldLayer || 'Floor';
        this.required = options.required !== undefined ? options.required : false;

        // Store 4 separate data types
        // Each is a Map: "x,y" -> uint8 value
        this.biomeData = new Map();      // 0-22 (ETileBiome)
        this.heightData = new Map();     // 0-255 (height values)
        this.difficultyData = new Map(); // 0-4 (ECurrentStoreDifficulty)
        this.hazardData = new Map();     // 0-6 (EEnvironmentalHazardType)

        // Default values for empty tiles
        this.defaultBiome = 0;       // None
        this.defaultHeight = 64;     // Ground level
        this.defaultDifficulty = 0;  // Easy
        this.defaultHazard = 0;      // None
    }

    /**
     * Set data at position for a specific data type
     * @param {string} dataType - "biome", "height", "difficulty", "hazard"
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} value - Uint8 value to set
     * @param {object} tileset - Optional tileset object with color and metadata
     */
    setData(dataType, x, y, value, tileset = null) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }

        const key = `${x},${y}`;
        const map = this.getDataMap(dataType);

        if (map) {
            // Store value and optional tileset for rendering
            map.set(key, { value, tileset });
            return true;
        }
        return false;
    }

    /**
     * Get data at position for a specific data type
     * @param {string} dataType - "biome", "height", "difficulty", "hazard"
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {object|null} - {value: number, tileset: object} or null
     */
    getData(dataType, x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }

        const key = `${x},${y}`;
        const map = this.getDataMap(dataType);

        if (map) {
            return map.get(key) || null;
        }
        return null;
    }

    /**
     * Get the appropriate data map for a data type
     * @param {string} dataType
     * @returns {Map|null}
     */
    getDataMap(dataType) {
        switch (dataType) {
            case 'biome': return this.biomeData;
            case 'height': return this.heightData;
            case 'difficulty': return this.difficultyData;
            case 'hazard': return this.hazardData;
            default: return null;
        }
    }

    /**
     * Clear data at position for a specific data type
     * @param {string} dataType
     * @param {number} x
     * @param {number} y
     */
    clearData(dataType, x, y) {
        const key = `${x},${y}`;
        const map = this.getDataMap(dataType);
        if (map) {
            map.delete(key);
        }
    }

    /**
     * Clear all data of a specific type
     * @param {string} dataType
     */
    clearDataType(dataType) {
        const map = this.getDataMap(dataType);
        if (map) {
            map.clear();
        }
    }

    /**
     * Clear all data in layer
     */
    clear() {
        this.biomeData.clear();
        this.heightData.clear();
        this.difficultyData.clear();
        this.hazardData.clear();
    }

    /**
     * Resize layer (keeps data within new bounds)
     */
    resize(newWidth, newHeight) {
        const resizeMap = (map) => {
            const newMap = new Map();
            for (const [key, value] of map.entries()) {
                const [x, y] = key.split(',').map(Number);
                if (x < newWidth && y < newHeight) {
                    newMap.set(key, value);
                }
            }
            return newMap;
        };

        this.biomeData = resizeMap(this.biomeData);
        this.heightData = resizeMap(this.heightData);
        this.difficultyData = resizeMap(this.difficultyData);
        this.hazardData = resizeMap(this.hazardData);

        this.width = newWidth;
        this.height = newHeight;
    }

    /**
     * Get tile count for a specific data type
     * @param {string} dataType
     * @returns {number}
     */
    getDataCount(dataType) {
        const map = this.getDataMap(dataType);
        return map ? map.size : 0;
    }

    /**
     * Get total tile count across all data types
     */
    getTotalCount() {
        return this.biomeData.size + this.heightData.size +
               this.difficultyData.size + this.hazardData.size;
    }

    /**
     * Get value at position with default fallback
     * @param {string} dataType
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    getValueWithDefault(dataType, x, y) {
        const data = this.getData(dataType, x, y);
        if (data && data.value !== undefined) {
            return data.value;
        }

        // Return default values
        switch (dataType) {
            case 'biome': return this.defaultBiome;
            case 'height': return this.defaultHeight;
            case 'difficulty': return this.defaultDifficulty;
            case 'hazard': return this.defaultHazard;
            default: return 0;
        }
    }

    /**
     * Export to JSON-RLE format layer data
     */
    exportRLEData() {
        const totalTiles = this.width * this.height;

        // Helper function to convert Map to full grid array (with defaults)
        const mapToGrid = (map, defaultValue) => {
            const grid = new Array(totalTiles).fill(defaultValue);
            for (const [key, data] of map.entries()) {
                const [x, y] = key.split(',').map(Number);
                const index = y * this.width + x;
                grid[index] = data.value;
            }
            return grid;
        };

        // Helper function to compress grid to RLE
        const compressToRLE = (grid) => {
            const rle = [];
            let currentValue = grid[0];
            let count = 1;

            for (let i = 1; i < grid.length; i++) {
                if (grid[i] === currentValue) {
                    count++;
                } else {
                    rle.push({ value: currentValue, count });
                    currentValue = grid[i];
                    count = 1;
                }
            }
            rle.push({ value: currentValue, count });

            return rle;
        };

        // Generate grids with defaults
        const biomeGrid = mapToGrid(this.biomeData, this.defaultBiome);
        const heightGrid = mapToGrid(this.heightData, this.defaultHeight);
        const difficultyGrid = mapToGrid(this.difficultyData, this.defaultDifficulty);
        const hazardGrid = mapToGrid(this.hazardData, this.defaultHazard);

        // Compress to RLE
        return {
            layer_type: this.layerType,
            biome_data: compressToRLE(biomeGrid),
            height_data: compressToRLE(heightGrid),
            difficulty_data: compressToRLE(difficultyGrid),
            hazard_data: compressToRLE(hazardGrid)
        };
    }

    /**
     * Import from JSON-RLE format
     * @param {object} rleData - RLE layer data
     * @param {object} configManager - Config manager to look up tilesets by value
     */
    importRLEData(rleData, configManager) {
        // Helper function to decompress RLE to grid
        const decompressRLE = (rleArray) => {
            const grid = [];
            for (const entry of rleArray) {
                for (let i = 0; i < entry.count; i++) {
                    grid.push(entry.value);
                }
            }
            return grid;
        };

        // Helper function to import grid into map
        const gridToMap = (grid, dataType) => {
            const map = this.getDataMap(dataType);
            if (!map) return;

            map.clear();
            const defaultValue = this.getDefaultValue(dataType);

            for (let i = 0; i < grid.length; i++) {
                const value = grid[i];
                // Only store non-default values for efficiency
                if (value !== defaultValue) {
                    const x = i % this.width;
                    const y = Math.floor(i / this.width);
                    const key = `${x},${y}`;

                    // Look up tileset by value
                    const tileset = this.findTilesetByValue(configManager, dataType, value);
                    map.set(key, { value, tileset });
                }
            }
        };

        // Decompress and import
        if (rleData.biome_data) {
            const grid = decompressRLE(rleData.biome_data);
            gridToMap(grid, 'biome');
        }
        if (rleData.height_data) {
            const grid = decompressRLE(rleData.height_data);
            gridToMap(grid, 'height');
        }
        if (rleData.difficulty_data) {
            const grid = decompressRLE(rleData.difficulty_data);
            gridToMap(grid, 'difficulty');
        }
        if (rleData.hazard_data) {
            const grid = decompressRLE(rleData.hazard_data);
            gridToMap(grid, 'hazard');
        }
    }

    /**
     * Get default value for a data type
     * @param {string} dataType
     * @returns {number}
     */
    getDefaultValue(dataType) {
        switch (dataType) {
            case 'biome': return this.defaultBiome;
            case 'height': return this.defaultHeight;
            case 'difficulty': return this.defaultDifficulty;
            case 'hazard': return this.defaultHazard;
            default: return 0;
        }
    }

    /**
     * Find tileset by value in config
     * @param {object} configManager
     * @param {string} dataType
     * @param {number} value
     * @returns {object|null}
     */
    findTilesetByValue(configManager, dataType, value) {
        const tilesets = configManager.getTilesets();

        // Match by category and value
        const categoryMap = {
            'biome': 'Biomes',
            'height': 'Height',
            'difficulty': 'Difficulty',
            'hazard': 'Hazards'
        };

        const category = categoryMap[dataType];
        if (!category) return null;

        for (const [name, tileset] of Object.entries(tilesets)) {
            if (tileset.category === category && tileset.value === value) {
                return { name, ...tileset };
            }
        }

        return null;
    }

    /**
     * Export legacy format for backwards compatibility
     */
    exportLegacyData() {
        // Export all data types (biome, height, difficulty, hazard)
        const exportDataMap = (map) => {
            const dataArray = [];
            for (const [key, data] of map.entries()) {
                const [x, y] = key.split(',').map(Number);
                dataArray.push({
                    x,
                    y,
                    value: data.value,
                    tileset: data.tileset ? {
                        name: data.tileset.name,
                        tag: data.tileset.tag,
                        color: data.tileset.color,
                        value: data.tileset.value,
                        category: data.tileset.category
                    } : null
                });
            }
            return dataArray;
        };

        return {
            name: this.name,
            visible: this.visible,
            opacity: this.opacity,
            locked: this.locked,
            editable: this.editable,
            layerType: this.layerType,
            worldLayer: this.worldLayer,
            required: this.required,
            biomeData: exportDataMap(this.biomeData),
            heightData: exportDataMap(this.heightData),
            difficultyData: exportDataMap(this.difficultyData),
            hazardData: exportDataMap(this.hazardData)
        };
    }

    /**
     * Import legacy format
     */
    importLegacyData(data, configManager) {
        this.visible = data.visible !== undefined ? data.visible : true;
        this.opacity = data.opacity !== undefined ? data.opacity : 1.0;
        this.locked = data.locked !== undefined ? data.locked : false;
        this.editable = data.editable !== undefined ? data.editable : true;
        this.layerType = data.layerType || 'Floor';
        this.worldLayer = data.worldLayer || 'Floor';
        this.required = data.required !== undefined ? data.required : false;

        this.clear();

        // Import all four data types if they exist
        const importDataArray = (dataArray, dataType) => {
            if (!dataArray) return;

            for (const item of dataArray) {
                let tileset = item.tileset;

                // If no tileset embedded, look it up
                if (!tileset && item.tag) {
                    tileset = configManager.getTilesetByTag(item.tag);
                }
                if (!tileset && item.name) {
                    tileset = configManager.getTileset(item.name);
                }

                this.setData(dataType, item.x, item.y, item.value, tileset);
            }
        };

        // Import new format (all data types)
        if (data.biomeData || data.heightData || data.difficultyData || data.hazardData) {
            importDataArray(data.biomeData, 'biome');
            importDataArray(data.heightData, 'height');
            importDataArray(data.difficultyData, 'difficulty');
            importDataArray(data.hazardData, 'hazard');
        }
        // Fallback to old format (tiles = biome data only)
        else if (data.tiles) {
            for (const tile of data.tiles) {
                let tileset = configManager.getTilesetByTag(tile.tag);
                if (!tileset) {
                    tileset = configManager.getTileset(tile.name);
                }

                if (tileset) {
                    // Import as biome data primarily
                    this.setData('biome', tile.x, tile.y, tileset.value || 0, tileset);
                }
            }
        }
    }

    /**
     * Clone layer
     */
    clone() {
        const newLayer = new WorldLayer(this.name + ' Copy', this.width, this.height, {
            visible: this.visible,
            opacity: this.opacity,
            locked: this.locked,
            editable: this.editable,
            layerType: this.layerType,
            worldLayer: this.worldLayer,
            required: this.required
        });

        // Deep copy all data maps
        for (const [key, value] of this.biomeData.entries()) {
            newLayer.biomeData.set(key, { ...value });
        }
        for (const [key, value] of this.heightData.entries()) {
            newLayer.heightData.set(key, { ...value });
        }
        for (const [key, value] of this.difficultyData.entries()) {
            newLayer.difficultyData.set(key, { ...value });
        }
        for (const [key, value] of this.hazardData.entries()) {
            newLayer.hazardData.set(key, { ...value });
        }

        return newLayer;
    }
}

class LayerManager {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.layers = [];
        this.activeLayerIndex = 0;

        // Active data type for editing: "biome", "height", "difficulty", "hazard"
        this.activeDataType = 'biome';
    }

    /**
     * Add a new layer
     */
    addLayer(name, options = {}) {
        const layer = new WorldLayer(name, this.width, this.height, options);
        this.layers.push(layer);
        return layer;
    }

    /**
     * Remove layer by index
     */
    removeLayer(index) {
        if (index >= 0 && index < this.layers.length && this.layers.length > 1) {
            this.layers.splice(index, 1);
            if (this.activeLayerIndex >= this.layers.length) {
                this.activeLayerIndex = this.layers.length - 1;
            }
            return true;
        }
        return false;
    }

    /**
     * Get layer by index
     */
    getLayer(index) {
        return this.layers[index] || null;
    }

    /**
     * Get active layer
     */
    getActiveLayer() {
        return this.layers[this.activeLayerIndex] || null;
    }

    /**
     * Set active layer
     */
    setActiveLayer(index) {
        if (index >= 0 && index < this.layers.length) {
            this.activeLayerIndex = index;
            return true;
        }
        return false;
    }

    /**
     * Set active data type
     */
    setActiveDataType(dataType) {
        if (['biome', 'height', 'difficulty', 'hazard'].includes(dataType)) {
            this.activeDataType = dataType;
            return true;
        }
        return false;
    }

    /**
     * Get active data type
     */
    getActiveDataType() {
        return this.activeDataType;
    }

    /**
     * Move layer
     */
    moveLayer(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.layers.length &&
            toIndex >= 0 && toIndex < this.layers.length) {
            const layer = this.layers.splice(fromIndex, 1)[0];
            this.layers.splice(toIndex, 0, layer);

            if (this.activeLayerIndex === fromIndex) {
                this.activeLayerIndex = toIndex;
            }
            return true;
        }
        return false;
    }

    /**
     * Resize all layers
     */
    resize(newWidth, newHeight) {
        this.width = newWidth;
        this.height = newHeight;

        for (const layer of this.layers) {
            layer.resize(newWidth, newHeight);
        }
    }

    /**
     * Clear all layers
     */
    clearAll() {
        for (const layer of this.layers) {
            layer.clear();
        }
    }

    /**
     * Get total tile count across all layers
     */
    getTotalTileCount() {
        return this.layers.reduce((sum, layer) => sum + layer.getTotalCount(), 0);
    }

    /**
     * Export to JSON-RLE format
     */
    exportRLEData(mapName = 'TSIC_Mall', description = 'Generated by Biome Level Editor', seed = null) {
        const metadata = {
            name: mapName,
            description: description,
            world_size: this.width,
            maze_generation_seed: seed || Math.floor(Math.random() * 2147483647)
        };

        const layers = this.layers.map(layer => layer.exportRLEData());

        return {
            metadata,
            layers
        };
    }

    /**
     * Import from JSON-RLE format
     */
    importRLEData(rleData, configManager) {
        if (!rleData || !rleData.metadata || !rleData.layers) {
            console.error('Invalid RLE data format');
            return false;
        }

        // Set grid size from metadata
        this.width = rleData.metadata.world_size;
        this.height = rleData.metadata.world_size;

        // Clear existing layers
        this.layers = [];
        this.activeLayerIndex = 0;

        // Import layers
        for (const layerData of rleData.layers) {
            const layerType = layerData.layer_type;
            const layer = new WorldLayer(layerType, this.width, this.height, {
                layerType: layerType,
                worldLayer: layerType,
                visible: true,
                opacity: 0.8
            });

            layer.importRLEData(layerData, configManager);
            this.layers.push(layer);
        }

        if (this.layers.length === 0) {
            this.addLayer('Floor', { layerType: 'Floor', worldLayer: 'Floor' });
        }

        return true;
    }

    /**
     * Export legacy format (for backwards compatibility)
     */
    exportData() {
        return {
            width: this.width,
            height: this.height,
            activeLayerIndex: this.activeLayerIndex,
            activeDataType: this.activeDataType,
            layers: this.layers.map(layer => layer.exportLegacyData())
        };
    }

    /**
     * Import legacy format
     */
    importData(data, configManager) {
        this.width = data.width || this.width;
        this.height = data.height || this.height;
        this.layers = [];
        this.activeLayerIndex = data.activeLayerIndex || 0;
        this.activeDataType = data.activeDataType || 'biome';

        if (data.layers) {
            for (const layerData of data.layers) {
                const layer = new WorldLayer(layerData.name, this.width, this.height);
                layer.importLegacyData(layerData, configManager);
                this.layers.push(layer);
            }
        }

        if (this.layers.length === 0) {
            this.addLayer('Floor', { layerType: 'Floor', worldLayer: 'Floor' });
        }
    }
}

// Backwards compatibility aliases
const Layer = WorldLayer;
