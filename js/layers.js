/**
 * Layer Manager - Simplified Single Data Type System
 * Each layer contains ONE data map with tiles that have color metadata
 * Colors define what they represent (biome, height, difficulty, hazard)
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

        // Layer type: "Floor", "Sky", "Underground", "Hazard", etc.
        this.layerType = options.layerType || 'Floor';
        this.worldLayer = options.worldLayer || 'Floor';
        this.required = options.required !== undefined ? options.required : false;

        // Single data map: "x,y" -> color (hex string)
        // The color determines everything via colorMapper
        this.tileData = new Map();
    }

    /**
     * Set tile data at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} value - Tile value (kept for backwards compatibility, not stored)
     * @param {object} tileset - Tileset object with color (only color is stored)
     */
    setTile(x, y, value, tileset = null) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }

        const key = `${x},${y}`;
        if (tileset && tileset.color) {
            this.tileData.set(key, tileset.color.toLowerCase());
        } else {
            this.tileData.delete(key); // Remove if no color
        }
        return true;
    }

    /**
     * Get tile data at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {object|null} - {value: number, tileset: object} or null (reconstructed from color)
     */
    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }

        const key = `${x},${y}`;
        const color = this.tileData.get(key);

        if (!color || !window.colorMapper) return null;

        // Reconstruct tileset from color using colorMapper
        const enumData = window.colorMapper.getEnumFromColor(color);
        if (!enumData) return null;

        return {
            value: enumData.value,
            tileset: {
                name: enumData.name,
                color: color,
                value: enumData.value,
                category: enumData.category,
                tag: enumData.tag
            }
        };
    }

    /**
     * Clear tile at position
     */
    clearTile(x, y) {
        const key = `${x},${y}`;
        this.tileData.delete(key);
    }

    /**
     * Clear all tiles in layer
     */
    clear() {
        this.tileData.clear();
    }

    /**
     * Resize layer (keeps data within new bounds)
     */
    resize(newWidth, newHeight) {
        const newMap = new Map();
        for (const [key, value] of this.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            if (x < newWidth && y < newHeight) {
                newMap.set(key, value);
            }
        }
        this.tileData = newMap;
        this.width = newWidth;
        this.height = newHeight;
    }

    /**
     * Get total tile count
     */
    getTileCount() {
        return this.tileData.size;
    }

    /**
     * Export to JSON-RLE format
     * Returns a single RLE array of colors
     */
    exportRLEData() {
        const totalTiles = this.width * this.height;
        const defaultColor = '#000000'; // Default empty color

        // Create color grid
        const colorGrid = new Array(totalTiles).fill(defaultColor);

        // Fill grid from tile data (which now only stores colors)
        for (const [key, color] of this.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            const index = y * this.width + x;
            colorGrid[index] = color;
        }

        // Compress to RLE
        const rle = [];
        let currentColor = colorGrid[0];
        let count = 1;

        for (let i = 1; i < colorGrid.length; i++) {
            if (colorGrid[i] === currentColor) {
                count++;
            } else {
                rle.push({ color: currentColor, count });
                currentColor = colorGrid[i];
                count = 1;
            }
        }
        rle.push({ color: currentColor, count });

        return {
            layer_type: this.layerType,
            color_data: rle
        };
    }

    /**
     * Import from JSON-RLE format
     */
    importRLEData(rleData, configManager) {
        this.clear();

        if (!rleData.color_data) {
            console.warn('[WorldLayer] No color_data in RLE data');
            return;
        }

        // Decompress RLE to color grid
        const colorGrid = [];
        for (const entry of rleData.color_data) {
            for (let i = 0; i < entry.count; i++) {
                colorGrid.push(entry.color);
            }
        }

        // Import colors into tileData
        const defaultColor = '#000000';
        for (let i = 0; i < colorGrid.length; i++) {
            const color = colorGrid[i];

            // Skip default empty color
            if (color === defaultColor) continue;

            const x = i % this.width;
            const y = Math.floor(i / this.width);

            // Store color directly
            const key = `${x},${y}`;
            this.tileData.set(key, color.toLowerCase());
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

        // Deep copy tile data (now just colors)
        for (const [key, color] of this.tileData.entries()) {
            newLayer.tileData.set(key, color);
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
     * Fill layer with default color
     * @param {WorldLayer} layer - The layer to fill
     * @param {string} defaultColor - The color to fill with (hex string)
     */
    fillLayerWithDefault(layer, defaultColor) {
        if (!layer || !defaultColor) return;

        for (let y = 0; y < layer.height; y++) {
            for (let x = 0; x < layer.width; x++) {
                const key = `${x},${y}`;
                layer.tileData.set(key, defaultColor.toLowerCase());
            }
        }
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
        return this.layers.reduce((sum, layer) => sum + layer.getTileCount(), 0);
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
            layers: this.layers.map(layer => ({
                name: layer.name,
                visible: layer.visible,
                opacity: layer.opacity,
                locked: layer.locked,
                editable: layer.editable,
                layerType: layer.layerType,
                worldLayer: layer.worldLayer,
                required: layer.required,
                tiles: Array.from(layer.tileData.entries()).map(([key, color]) => {
                    const [x, y] = key.split(',').map(Number);
                    // In color-only system, we store just colors
                    // Reconstruct value and tileset from color for backwards compatibility
                    let value = 0;
                    let tileset = null;
                    if (color && window.colorMapper) {
                        const enumData = window.colorMapper.getEnumFromColor(color);
                        if (enumData) {
                            value = enumData.value;
                            tileset = { color: color, ...enumData };
                        }
                    }
                    if (!tileset) {
                        tileset = { color: color };
                    }
                    return {
                        x,
                        y,
                        value,
                        tileset
                    };
                })
            }))
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

        if (data.layers) {
            for (const layerData of data.layers) {
                const layer = new WorldLayer(layerData.name, this.width, this.height, {
                    visible: layerData.visible !== undefined ? layerData.visible : true,
                    opacity: layerData.opacity !== undefined ? layerData.opacity : 1.0,
                    locked: layerData.locked !== undefined ? layerData.locked : false,
                    editable: layerData.editable !== undefined ? layerData.editable : true,
                    layerType: layerData.layerType || 'Floor',
                    worldLayer: layerData.worldLayer || 'Floor',
                    required: layerData.required !== undefined ? layerData.required : false
                });

                if (layerData.tiles) {
                    for (const tile of layerData.tiles) {
                        layer.setTile(tile.x, tile.y, tile.value, tile.tileset);
                    }
                }

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

// Export for testing
if (typeof window !== 'undefined') {
    window.WorldLayer = WorldLayer;
    window.Layer = Layer;
    window.LayerManager = LayerManager;
}
